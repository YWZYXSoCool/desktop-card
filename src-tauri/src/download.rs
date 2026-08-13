//! 通用下载 / 文件 / HTTP 原语（沙箱 widget 的 `download` 权限）。
//!
//! 设计原则：**后端不关心前端 / 不关心业务**。本模块零 B 站知识——它只提供四类
//! 通用原语，任何需要网络或文件下载的外部 widget 都能复用：
//! - 裸 HTTP：把给定 method/url/headers/body 转发出去，返回原始状态码 + 正文（不解析）。
//! - URL → 文件：把给定 URL 流式 GET 到下载目录的指定文件名，上报进度。
//! - 文本 → 文件：把一段文本写入下载目录的指定文件名。
//! - 下载目录查询 / 任务状态 / 任务取消。
//!
//! 沙箱 widget 通过宿主注入的 `ctx.download.*` 调用这些原语，业务（API 构造、JSON
//! 解析、选流、拼文件名、编排批量）全部留在 widget 里。本模块不含任何 `bilibili` 字样。

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex, OnceLock};

use futures_util::StreamExt;
use serde::Serialize;
use tauri::{AppHandle, Emitter};
use tauri_plugin_store::StoreExt;
use tokio::io::AsyncWriteExt;

use crate::http::{perform_request, HttpRequest, HttpResponse};

/// 任务类型：下载 URL 到文件 / 写文本到文件 / 跑一个进程。
#[derive(Clone, Copy, PartialEq, Serialize)]
pub enum JobKind {
    #[serde(rename = "download")]
    Download,
    #[serde(rename = "text")]
    Text,
    #[serde(rename = "exec")]
    Exec,
}

/// 任务状态机。
#[derive(Clone, Copy, PartialEq, Serialize)]
pub enum JobState {
    #[serde(rename = "queued")]
    Queued,
    #[serde(rename = "running")]
    Running,
    #[serde(rename = "done")]
    Done,
    #[serde(rename = "error")]
    Error,
    #[serde(rename = "cancelled")]
    Cancelled,
}

/// 一个下载/写文件任务的最新状态（序列化给沙箱 widget 展示）。
#[derive(Clone, Serialize)]
pub struct JobStatus {
    pub id: u64,
    pub kind: JobKind,
    pub state: JobState,
    /// 0–1 进度（下载任务；文本任务恒为 0）。
    pub progress: f64,
    /// 已完成字节数。
    pub done_bytes: u64,
    /// 总字节数（未知为 None）。
    pub total_bytes: Option<u64>,
    /// 下载目录内的目标文件名。
    pub dest: Option<String>,
    /// 错误信息（state=error 时有）。
    pub err: Option<String>,
}

/// 任务内部状态（含取消标志的共享位）。
struct Job {
    status: JobStatus,
    /// 取消标志：置为 true 后下载任务在下一块停止写入并标记 cancelled。
    cancel: Arc<AtomicBool>,
    /// Exec 任务持有的子进程句柄（取消时 kill）。
    child: Arc<Mutex<Option<tokio::process::Child>>>,
}

/// 下载任务注册表（进程级单例，见 `GLOBAL`）。
#[derive(Default)]
pub struct DownloadManager {
    jobs: Mutex<HashMap<u64, Job>>,
}

impl DownloadManager {
    fn new_job(&self, kind: JobKind) -> u64 {
        let id = NEXT_ID.fetch_add(1, Ordering::Relaxed);
        self.jobs.lock().unwrap().insert(
            id,
            Job {
                status: JobStatus {
                    id,
                    kind,
                    state: JobState::Queued,
                    progress: 0.0,
                    done_bytes: 0,
                    total_bytes: None,
                    dest: None,
                    err: None,
                },
                cancel: Arc::new(AtomicBool::new(false)),
                child: Arc::new(Mutex::new(None)),
            },
        );
        id
    }

    /// 全部任务状态快照（JSON 数组）。按 id 升序。
    fn snapshot(&self) -> Vec<JobStatus> {
        let mut v: Vec<JobStatus> = self
            .jobs
            .lock()
            .unwrap()
            .values()
            .map(|j| j.status.clone())
            .collect();
        v.sort_by_key(|s| s.id);
        v
    }

    /// 对某个任务状态做变更（单一加锁点，避免返回引用越过 guard）。
    fn update_status(&self, id: u64, f: impl FnOnce(&mut JobStatus)) {
        if let Some(job) = self.jobs.lock().unwrap().get_mut(&id) {
            f(&mut job.status);
        }
    }

    fn cancel_flag(&self, id: u64) -> Option<Arc<AtomicBool>> {
        self.jobs.lock().unwrap().get(&id).map(|j| j.cancel.clone())
    }

    fn child_handle(&self, id: u64) -> Option<Arc<Mutex<Option<tokio::process::Child>>>> {
        self.jobs.lock().unwrap().get(&id).map(|j| j.child.clone())
    }
}

static NEXT_ID: AtomicU64 = AtomicU64::new(1);

/// 进程级单例任务注册表。`setup` 时初始化；宿主函数与后台任务都经它存取。
/// 宿主函数从 `app.state::<DownloadManager>()` 拿到的其实是同一份（Arc 共享），
/// 但后台 task 需要 `'static` 引用，故这里另存一份 Arc 供任务闭包使用。
static GLOBAL: OnceLock<Arc<DownloadManager>> = OnceLock::new();

/// setup 时调用：塞入进程级注册表（供后台任务闭包访问）。
pub fn init_global(manager: Arc<DownloadManager>) {
    let _ = GLOBAL.set(manager);
}

fn manager() -> &'static DownloadManager {
    GLOBAL.get().expect("DownloadManager 未初始化").as_ref()
}

/// 下载目录：优先读 store 键 `download.dir`，否则回退 `%USERPROFILE%\Downloads`。
pub fn download_dir(app: &AppHandle) -> PathBuf {
    if let Some(dir) = app
        .store("settings.json")
        .ok()
        .and_then(|s| s.get("download.dir"))
        .and_then(|v| v.as_str().map(|s| s.to_string()))
    {
        if !dir.is_empty() {
            return PathBuf::from(dir);
        }
    }
    std::env::var_os("USERPROFILE")
        .map(PathBuf::from)
        .map(|p| p.join("Downloads"))
        .unwrap_or_else(|| PathBuf::from("Downloads"))
}

/// 清洗文件名：去掉路径分隔符与 Windows 非法字符、去首尾空白，防路径穿越。
/// 空结果回退为 `download`。
fn sanitize_filename(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .filter(|c| !matches!(c, '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' | '\0'))
        .map(|c| if c.is_control() { ' ' } else { c })
        .collect();
    let trimmed = cleaned.trim().trim_end_matches(['.', ' ']);
    if trimmed.is_empty() {
        "download".to_string()
    } else {
        trimmed.to_string()
    }
}

/// 进度变更上报：带沙箱 handle 的全局事件，前端按 handle 让对应 widget 重渲染。
fn emit_progress(app: &AppHandle, handle: u64) {
    let _ = app.emit("widget-progress", serde_json::json!({ "handle": handle }));
}

/// 裸 HTTP：同步转发请求，返回《状态码 + 正文》。经 `block_on` 在调用线程上执行，
/// 与沙箱「同步请求-应答」模型一致；正文为文本（JSON/XML），体积小，适合解析类请求。
pub fn http(method: &str, url: &str, headers_json: &str, body: &str) -> Result<HttpResponse, String> {
    let headers: HashMap<String, String> = serde_json::from_str(headers_json).unwrap_or_default();
    let req = HttpRequest {
        method: method.to_string(),
        url: url.to_string(),
        headers,
        body: if body.is_empty() {
            None
        } else {
            Some(body.to_string())
        },
    };
    tauri::async_runtime::block_on(perform_request(&req))
}

/// 提交一个 URL→文件 下载任务，返回 job id。立即返回，实际下载在后台 tokio 任务里跑。
pub fn download(
    app: &AppHandle,
    handle: u64,
    url: &str,
    headers_json: &str,
    filename: &str,
) -> u64 {
    let m = manager();
    let id = m.new_job(JobKind::Download);
    let dest = sanitize_filename(filename);
    let cancel = m.cancel_flag(id).unwrap();
    let app = app.clone();
    let headers: HashMap<String, String> = serde_json::from_str(headers_json).unwrap_or_default();
    let url = url.to_string();

    tauri::async_runtime::spawn(async move {
        let client = reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::limited(5))
            .build();
        let client = match client {
            Ok(c) => c,
            Err(e) => {
                set_error(&app, id, &e.to_string());
                return;
            }
        };
        let mut rb = client.get(&url);
        for (k, v) in &headers {
            rb = rb.header(k, v);
        }
        let resp = match rb.send().await {
            Ok(r) => r,
            Err(e) => {
                set_error(&app, id, &e.to_string());
                return;
            }
        };
        if !resp.status().is_success() {
            set_error(&app, id, &format!("HTTP {}", resp.status()));
            return;
        }
        let total = resp.content_length();
        let dir = download_dir(&app);
        if std::fs::create_dir_all(&dir).is_err() {
            set_error(&app, id, "无法创建下载目录");
            return;
        }
        let path = dir.join(&dest);
        let mut out = match tokio::fs::File::create(&path).await {
            Ok(f) => f,
            Err(e) => {
                set_error(&app, id, &format!("无法写入文件: {e}"));
                return;
            }
        };
        if let Some(d) = path.file_name().map(|s| s.to_string_lossy().into_owned()) {
            m.update_status(id, |s| s.dest = Some(d));
        }
        set_state(&app, id, JobState::Running, handle);

        let mut stream = resp.bytes_stream();
        let mut done: u64 = 0;
        while let Some(chunk) = stream.next().await {
            if cancel.load(Ordering::Relaxed) {
                set_state(&app, id, JobState::Cancelled, handle);
                let _ = std::fs::remove_file(&path);
                return;
            }
            let bytes = match chunk {
                Ok(b) => b,
                Err(e) => {
                    set_error(&app, id, &format!("下载中断: {e}"));
                    return;
                }
            };
            if let Err(e) = tokio::io::AsyncWriteExt::write_all(&mut out, &bytes).await {
                set_error(&app, id, &format!("写入失败: {e}"));
                return;
            }
            done += bytes.len() as u64;
            set_progress(&app, id, done, total, handle);
        }
        if let Err(e) = out.flush().await {
            set_error(&app, id, &format!("落盘失败: {e}"));
            return;
        }
        set_state(&app, id, JobState::Done, handle);
    });
    id
}

/// 提交一个 文本→文件 任务，返回 job id。立即返回，写文件在后台任务里跑。
pub fn write_text(app: &AppHandle, handle: u64, filename: &str, content: &str) -> u64 {
    let m = manager();
    let id = m.new_job(JobKind::Text);
    let dest = sanitize_filename(filename);
    let content = content.to_string();
    let app = app.clone();

    tauri::async_runtime::spawn(async move {
        let dir = download_dir(&app);
        if std::fs::create_dir_all(&dir).is_err() {
            set_error(&app, id, "无法创建下载目录");
            return;
        }
        let path = dir.join(&dest);
        if let Some(d) = path.file_name().map(|s| s.to_string_lossy().into_owned()) {
            m.update_status(id, |s| s.dest = Some(d));
        }
        set_state(&app, id, JobState::Running, handle);
        match tokio::fs::write(&path, content.as_bytes()).await {
            Ok(()) => set_state(&app, id, JobState::Done, handle),
            Err(e) => set_error(&app, id, &format!("无法写入文件: {e}")),
        }
    });
    id
}

/// 提交一个「跑进程」任务（如 widget 自备的 ffmpeg），返回 job id。
/// 立即返回，进程在后台跑；`cwd` 为空时默认用下载目录。输出文件名取 args 末位
/// 记入 `dest`（供 UI 展示）。可经 `cancel` 杀进程。
pub fn exec(
    app: &AppHandle,
    handle: u64,
    program: &str,
    args_json: &str,
    cwd: &str,
) -> u64 {
    let m = manager();
    let id = m.new_job(JobKind::Exec);
    let args: Vec<String> = serde_json::from_str(args_json).unwrap_or_default();
    let dest = args.last().cloned().unwrap_or_else(|| program.to_string());
    if let Some(d) = PathBuf::from(&dest).file_name().map(|s| s.to_string_lossy().into_owned()) {
        m.update_status(id, |s| s.dest = Some(d));
    }
    let child = m.child_handle(id).unwrap();
    let app = app.clone();
    let program = program.to_string();
    let cwd = cwd.to_string();

    tauri::async_runtime::spawn(async move {
        let dir = if cwd.is_empty() {
            download_dir(&app)
        } else {
            PathBuf::from(&cwd)
        };
        let mut cmd = tokio::process::Command::new(&program);
        cmd.args(&args);
        if !dir.as_os_str().is_empty() {
            cmd.current_dir(&dir);
        }
        cmd.stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null());
        let spawned = match cmd.spawn() {
            Ok(c) => c,
            Err(e) => {
                set_error(&app, id, &format!("无法启动 {program}: {e}"));
                return;
            }
        };
        *child.lock().unwrap() = Some(spawned);
        set_state(&app, id, JobState::Running, handle);

        // 从共享槽取出子进程来 await（避免跨 await 持有 std MutexGuard）。
        let mut proc = child.lock().unwrap().take();
        let status = match &mut proc {
            Some(c) => match c.wait().await {
                Ok(s) => s,
                Err(e) => {
                    set_error(&app, id, &format!("进程异常: {e}"));
                    return;
                }
            },
            None => {
                set_error(&app, id, "子进程已丢失");
                return;
            }
        };
        if status.success() {
            set_state(&app, id, JobState::Done, handle);
        } else {
            set_error(&app, id, &format!("退出码 {}", status.code().unwrap_or(-1)));
        }
    });
    id
}

/// 探测某个路径是否存在（widget 用来找自己随附的二进制）。
pub fn exists(path: &str) -> bool {
    std::path::Path::new(path).exists()
}

/// 删除下载目录里的一个文件（widget 合并后清理临时文件用）。返回是否成功。
pub fn remove(app: &AppHandle, filename: &str) -> bool {
    let path = download_dir(app).join(sanitize_filename(filename));
    std::fs::remove_file(path).is_ok()
}

// ── 内部状态写入辅助：统一加锁 + 上报进度事件 ─────────────────────────────────

fn set_state(app: &AppHandle, id: u64, state: JobState, handle: u64) {
    manager().update_status(id, |s| s.state = state);
    emit_progress(app, handle);
}

fn set_progress(app: &AppHandle, id: u64, done: u64, total: Option<u64>, handle: u64) {
    manager().update_status(id, |s| {
        s.done_bytes = done;
        s.total_bytes = total;
        s.progress = total
            .map(|t| (done as f64) / (t.max(1) as f64))
            .unwrap_or(0.0);
    });
    emit_progress(app, handle);
}

fn set_error(app: &AppHandle, id: u64, err: &str) {
    manager().update_status(id, |s| {
        s.err = Some(err.to_string());
        s.state = JobState::Error;
    });
    let _ = app;
}

/// 取消：置取消标志，下载任务在下一块中断并标记 cancelled；
/// Exec 任务则 kill 子进程并标记 cancelled。
pub fn cancel(app: &AppHandle, id: u64) {
    if let Some(flag) = manager().cancel_flag(id) {
        flag.store(true, Ordering::Relaxed);
    }
    if let Some(child) = manager().child_handle(id) {
        if let Ok(mut guard) = child.try_lock() {
            if let Some(c) = guard.as_mut() {
                let _ = c.start_kill();
            }
        }
    }
    let _ = app;
}

/// 全部任务状态快照（JSON 数组）。
pub fn status() -> Vec<JobStatus> {
    manager().snapshot()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitize_strips_path_separators_and_illegal_chars() {
        assert_eq!(sanitize_filename("a/b\\c:*.mp4"), "abc.mp4");
        assert_eq!(sanitize_filename("..\\..\\evil"), "....evil");
        assert_eq!(sanitize_filename("  标题  "), "标题");
        assert_eq!(sanitize_filename("..."), "download");
        assert_eq!(sanitize_filename(""), "download");
        assert_eq!(sanitize_filename("正常 标题.mp4"), "正常 标题.mp4");
    }

    #[test]
    fn exists_reports_file_presence() {
        // 用本文件自身验证存在；用不存在的路径验证缺失。
        let real = file!();
        assert!(exists(real));
        assert!(!exists("definitely-no-such-file-in-here.bin"));
    }

    #[test]
    fn exec_kind_serializes_as_exec() {
        assert_eq!(serde_json::to_value(JobKind::Exec).unwrap(), serde_json::json!("exec"));
        assert_eq!(serde_json::to_value(JobKind::Download).unwrap(), serde_json::json!("download"));
        assert_eq!(serde_json::to_value(JobKind::Text).unwrap(), serde_json::json!("text"));
    }
}