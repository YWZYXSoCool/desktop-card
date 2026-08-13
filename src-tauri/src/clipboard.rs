use base64::Engine as _;
use serde::{Deserialize, Serialize};
use std::borrow::Cow;
use std::collections::{HashSet, VecDeque};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager, State};

/// 剪贴板历史上限（超出丢弃最旧的）。
const MAX_HISTORY: usize = 50;
/// 轮询间隔：检测复制变化。
const POLL_INTERVAL: Duration = Duration::from_millis(500);

/// 一条剪贴板历史记录。用 `#[serde(tag = "kind")]` 把变体字段平铺到 JSON 顶层，
/// 序列化结果与前端的 `item.text / item.png / item.files` 读取方式一致（无需改前端），
/// 同时在类型层面杜绝「text 项带 png」这类非法状态。
#[derive(Serialize, Deserialize, Clone)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum ClipboardItem {
    Text {
        id: String,
        timestamp: u64,
        text: String,
    },
    Files {
        id: String,
        timestamp: u64,
        files: Vec<String>,
    },
    Image {
        id: String,
        timestamp: u64,
        png: String,
    },
}

impl ClipboardItem {
    fn id(&self) -> &str {
        match self {
            ClipboardItem::Text { id, .. }
            | ClipboardItem::Files { id, .. }
            | ClipboardItem::Image { id, .. } => id,
        }
    }

    /// 内容级去重：与队首同内容则不再入队。
    fn same_content(&self, other: &ClipboardItem) -> bool {
        match (self, other) {
            (ClipboardItem::Text { text: a, .. }, ClipboardItem::Text { text: b, .. }) => a == b,
            (ClipboardItem::Files { files: a, .. }, ClipboardItem::Files { files: b, .. }) => {
                a == b
            }
            (ClipboardItem::Image { png: a, .. }, ClipboardItem::Image { png: b, .. }) => a == b,
            _ => false,
        }
    }
}

/// 剪贴板工厂 + 历史状态（经 app.manage 共享给命令与监控线程）。
pub struct ClipboardState {
    items: Mutex<VecDeque<ClipboardItem>>,
    paused: AtomicBool,
    next_id: AtomicU64,
    path: PathBuf,
}

impl ClipboardState {
    /// 从历史文件加载（不存在则空历史），返回托管状态。
    pub fn new(app: &AppHandle) -> Result<Self, String> {
        let path = app
            .path()
            .app_data_dir()
            .map_err(|e| e.to_string())?
            .join("clipboard_history.json");
        let mut items: VecDeque<ClipboardItem> = match std::fs::read_to_string(&path) {
            Ok(text) => serde_json::from_str::<Vec<ClipboardItem>>(&text)
                .unwrap_or_default()
                .into_iter()
                .collect(),
            Err(_) => VecDeque::new(),
        };
        // 去重（保留先出现的）+ 把 next_id 续接到已加载 id 之后：
        // 否则重启后计数器回到 1，会复用文件里已有的 id，导致前端 keyed each 的 key 冲突
        let mut seen = HashSet::<String>::new();
        items.retain(|i| seen.insert(i.id().to_string()));
        let max_id = items
            .iter()
            .filter_map(|i| i.id().parse::<u64>().ok())
            .max()
            .unwrap_or(0);
        Ok(ClipboardState {
            items: Mutex::new(items),
            paused: AtomicBool::new(false),
            next_id: AtomicU64::new(max_id + 1),
            path,
        })
    }
}

/// 探测到的剪贴板内容（三种类型之一，尚未分配 id/timestamp）。
enum Content {
    Text(String),
    Files(Vec<String>),
    Image { png_b64: String },
}

/// 依次探测文本 → 文件 → 图片；都不适用返回 None。
fn probe(cb: &mut arboard::Clipboard) -> Option<Content> {
    if let Ok(t) = cb.get_text() {
        if !t.trim().is_empty() {
            return Some(Content::Text(t));
        }
    }
    if let Ok(files) = cb.get().file_list() {
        let v: Vec<String> = files
            .iter()
            .map(|p| p.to_string_lossy().into_owned())
            .collect();
        if !v.is_empty() {
            return Some(Content::Files(v));
        }
    }
    if let Ok(img) = cb.get_image() {
        if let Some(png) = rgba_to_png_b64(img.width, img.height, img.bytes.as_ref()) {
            return Some(Content::Image { png_b64: png });
        }
    }
    None
}

/// 内容签名：用于检测变化（图片用完整 base64，偶有重复但极小概率）。
fn content_sig(c: &Content) -> String {
    match c {
        Content::Text(t) => format!("t:{t}"),
        Content::Files(f) => format!("f:{}", f.join("\u{1}")),
        Content::Image { png_b64 } => format!("i:{png_b64}"),
    }
}

fn to_item(c: Content, id: String, ts: u64) -> ClipboardItem {
    match c {
        Content::Text(t) => ClipboardItem::Text {
            id,
            timestamp: ts,
            text: t,
        },
        Content::Files(f) => ClipboardItem::Files {
            id,
            timestamp: ts,
            files: f,
        },
        Content::Image { png_b64 } => ClipboardItem::Image {
            id,
            timestamp: ts,
            png: png_b64,
        },
    }
}

/// RGBA 像素 → base64 PNG。
fn rgba_to_png_b64(w: usize, h: usize, bytes: &[u8]) -> Option<String> {
    let img = image::RgbaImage::from_raw(w as u32, h as u32, bytes.to_vec())?;
    let mut buf = Vec::new();
    image::DynamicImage::ImageRgba8(img)
        .write_to(&mut std::io::Cursor::new(&mut buf), image::ImageFormat::Png)
        .ok()?;
    Some(base64::engine::general_purpose::STANDARD.encode(buf))
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// 抓取当前历史快照（最新在前）。
fn snapshot(state: &ClipboardState) -> Vec<ClipboardItem> {
    state.items.lock().unwrap().iter().cloned().collect()
}

/// 广播快照 + 落盘，共享同一次加锁与克隆。
fn persist(app: &AppHandle, state: &ClipboardState) {
    let list = snapshot(state);
    let _ = app.emit("clipboard-changed", &list);
    if let Ok(text) = serde_json::to_string(&list) {
        let _ = std::fs::write(&state.path, text);
    }
}

/// 入队新条目（去重 + 上限），广播并落盘。
fn push_item(app: &AppHandle, state: &ClipboardState, item: ClipboardItem) {
    let mut items = state.items.lock().unwrap();
    if items.front().map(|f| f.same_content(&item)).unwrap_or(false) {
        return;
    }
    items.push_front(item);
    while items.len() > MAX_HISTORY {
        items.pop_back();
    }
    drop(items);
    persist(app, state);
}

/// 后台监控线程：常驻轮询剪贴板，识别内容变化并入库。
pub fn spawn_monitor(app: AppHandle) {
    std::thread::spawn(move || {
        let mut cb = match arboard::Clipboard::new() {
            Ok(c) => c,
            Err(e) => {
                eprintln!("clipboard init error: {e}");
                return;
            }
        };
        // 首轮把当前剪贴板设为基线，不入库，只记录后续变化。
        let mut last_sig: String = probe(&mut cb).map(|c| content_sig(&c)).unwrap_or_default();
        loop {
            std::thread::sleep(POLL_INTERVAL);
            if app.state::<ClipboardState>().paused.load(Ordering::Relaxed) {
                continue;
            }
            let Some(c) = probe(&mut cb) else {
                continue;
            };
            let sig = content_sig(&c);
            if sig == last_sig {
                continue;
            }
            last_sig = sig;
            let state = app.state::<ClipboardState>();
            let id = state.next_id.fetch_add(1, Ordering::Relaxed).to_string();
            let item = to_item(c, id, now_ms());
            push_item(&app, &state, item);
        }
    });
}

/// 读取历史（最新在前）。
#[tauri::command]
pub fn clipboard_get_history(state: State<'_, ClipboardState>) -> Vec<ClipboardItem> {
    state.items.lock().unwrap().iter().cloned().collect()
}

/// 删除单条。
#[tauri::command]
pub fn clipboard_remove(id: String, app: AppHandle, state: State<'_, ClipboardState>) {
    state.items.lock().unwrap().retain(|i| i.id() != id);
    persist(&app, &state);
}

/// 清空历史。
#[tauri::command]
pub fn clipboard_clear(app: AppHandle, state: State<'_, ClipboardState>) {
    state.items.lock().unwrap().clear();
    persist(&app, &state);
}

/// 暂停 / 恢复录制（临时敏感拷贝时用）。
#[tauri::command]
pub fn clipboard_set_paused(paused: bool, state: State<'_, ClipboardState>) {
    state.paused.store(paused, Ordering::Relaxed);
}

/// 把历史某条写回系统剪贴板（点击条目 = 复制到前面）。
#[tauri::command]
pub fn clipboard_write(id: String, state: State<'_, ClipboardState>) -> Result<(), String> {
    let item = state
        .items
        .lock()
        .unwrap()
        .iter()
        .find(|i| i.id() == id)
        .cloned()
        .ok_or_else(|| "item not found".to_string())?;
    let mut cb = arboard::Clipboard::new().map_err(|e| e.to_string())?;
    match item {
        ClipboardItem::Text { text, .. } => cb.set_text(&text).map_err(|e| e.to_string()),
        ClipboardItem::Image { png, .. } => {
            let bytes = base64::engine::general_purpose::STANDARD
                .decode(png)
                .map_err(|e| e.to_string())?;
            let img = image::load_from_memory(&bytes).map_err(|e| e.to_string())?;
            let rgba = img.to_rgba8();
            let (w, h) = rgba.dimensions();
            let data = arboard::ImageData {
                width: w as usize,
                height: h as usize,
                bytes: Cow::Owned(rgba.into_raw()),
            };
            cb.set_image(data).map_err(|e| e.to_string())
        }
        ClipboardItem::Files { files, .. } => {
            let paths: Vec<PathBuf> = files.iter().map(PathBuf::from).collect();
            cb.set().file_list(&paths).map_err(|e| e.to_string())
        }
    }
}