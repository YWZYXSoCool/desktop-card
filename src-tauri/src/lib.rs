use base64::Engine as _;
use serde::Serialize;
use std::path::PathBuf;
use tauri::{
    menu::{ContextMenu, Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager,
};
use tauri_plugin_global_shortcut::ShortcutState;

mod clipboard;
mod global_mouse;
mod http;
mod sandbox;
mod shortcut;
mod update;

/// 从音频文件里抽出的专辑封面，data 为 base64 编码的图片字节。
#[derive(Serialize)]
struct AlbumArt {
    mime: String,
    data: String,
}

/// 读取音频文件的嵌入专辑封面（mp3/flac/m4a/ogg 等）。无封面或解析失败返回 Ok(None)。
#[tauri::command]
fn get_album_art(path: String) -> Result<Option<AlbumArt>, String> {
    use lofty::file::TaggedFileExt;
    use lofty::read_from_path;

    let tagged = read_from_path(&path).map_err(|e| e.to_string())?;
    let tag = tagged.primary_tag().or_else(|| tagged.first_tag());
    let Some(tag) = tag else {
        return Ok(None);
    };
    let Some(pic) = tag.pictures().first() else {
        return Ok(None);
    };

    let mime = pic
        .mime_type()
        .map(|m| m.to_string())
        .unwrap_or_else(|| "image/jpeg".to_string());
    let data = base64::engine::general_purpose::STANDARD.encode(pic.data());
    Ok(Some(AlbumArt { mime, data }))
}

/// 读取与音频文件同名的歌词文件（扩展名换成 .lrc）。不存在返回 Ok(None)。
/// 内容按 UTF-8 解码，失败则回退 GBK（中文 lrc 常为 GBK 编码）。
#[tauri::command]
fn read_lyrics(path: String) -> Result<Option<String>, String> {
    let audio = PathBuf::from(&path);
    let lrc = audio.with_extension("lrc");
    if !lrc.exists() {
        return Ok(None);
    }
    match std::fs::read(&lrc) {
        Ok(bytes) => {
            let (text, _) = encoding_rs::UTF_8.decode_without_bom_handling(&bytes);
            if text.contains('\u{FFFD}') {
                // UTF-8 解出乱码 → 按 GBK 重解；仍失败则静默回落为无歌词
                let (gbk, _, _) = encoding_rs::GBK.decode(&bytes);
                Ok(Some(gbk.into_owned()))
            } else {
                Ok(Some(text.into_owned()))
            }
        }
        // 读取失败（权限等）：静默回落为无歌词，不打断播放
        Err(_) => Ok(None),
    }
}

/// 一个外部 widget 目录条目：目录绝对路径 + 解析后的 widget.json 清单。
#[derive(Serialize)]
struct ExternalWidget {
    path: String,
    manifest: serde_json::Value,
}

/// 外部 widget 根目录：环境变量 `DESKTOP_CARD_WIDGETS`（开发调试）优先，
/// 否则落在应用数据目录下的 `widgets`。放入即被扫描。
fn widget_root(app: &AppHandle) -> Result<PathBuf, String> {
    if let Some(dir) = std::env::var_os("DESKTOP_CARD_WIDGETS") {
        return Ok(PathBuf::from(dir));
    }
    app.path()
        .app_data_dir()
        .map(|p| p.join("widgets"))
        .map_err(|e| e.to_string())
}

/// 扫描外部 widget 根目录：枚举每个子目录，读取其中的 widget.json。
/// 缺清单或解析失败的目录跳过。文件访问在 Rust 侧完成，无需 webview 额外权限。
#[tauri::command]
fn list_external_widgets(app: AppHandle) -> Result<Vec<ExternalWidget>, String> {
    let root = widget_root(&app)?;
    if !root.exists() {
        return Ok(Vec::new());
    }
    let mut out = Vec::new();
    for entry in std::fs::read_dir(&root).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let dir = entry.path();
        if !dir.is_dir() {
            continue;
        }
        let manifest_path = dir.join("widget.json");
        if !manifest_path.exists() {
            continue;
        }
        let text = std::fs::read_to_string(&manifest_path).map_err(|e| e.to_string())?;
        let manifest: serde_json::Value = serde_json::from_str(&text).map_err(|e| e.to_string())?;
        out.push(ExternalWidget {
            path: dir.to_string_lossy().into_owned(),
            manifest,
        });
    }
    Ok(out)
}

/// 为外部 widget 创建 QuickJS 沙箱并登记，返回 handle（销毁 / 调用都用它）。
/// `dir` 为 widget 目录绝对路径，`manifest` 为解析后的 widget.json。
#[tauri::command]
fn create_widget_sandbox(
    dir: String,
    manifest: serde_json::Value,
    app: AppHandle,
    state: tauri::State<'_, sandbox::SandboxManager>,
) -> Result<u64, String> {
    sandbox::register(&state, &dir, &manifest, &app)
}

/// 调用沙箱内 widget 的一个方法（render / setup / handleEvent / onDrop / onSettingChange）。
#[tauri::command]
fn call_widget_sandbox(
    handle: u64,
    method: String,
    args: serde_json::Value,
    state: tauri::State<'_, sandbox::SandboxManager>,
) -> Result<serde_json::Value, String> {
    sandbox::call(&state, handle, &method, &args)
}

/// 销毁沙箱（释放 QuickJS 引擎）。
#[tauri::command]
fn destroy_widget_sandbox(handle: u64, state: tauri::State<'_, sandbox::SandboxManager>) {
    sandbox::destroy(&state, handle);
}

/// 切换卡片显隐：隐藏即「收进托盘」，音频不中断。
/// `open_search` 为 true 时（快捷键唤起），显示后通知前端打开搜索页；托盘唤起不触发。
fn toggle_window(app: &AppHandle, open_search: bool) {
    if let Some(win) = app.get_webview_window("main") {
        if win.is_visible().unwrap_or(true) {
            let _ = win.hide();
        } else {
            let _ = win.show();
            let _ = win.set_focus();
            if open_search {
                let _ = app.emit("open-search", ());
            }
        }
    }
}

/// 卡片右键菜单项（前端把已注册的 widget 菜单项序列化传过来）。
#[derive(serde::Deserialize)]
struct CardMenuItem {
    id: String,
    label: String,
}

/// 在光标处弹出系统级菜单：各 widget 注册的功能项（直接平铺）。
/// 菜单项 id 带 `card-menu:` 前缀，点击经 `card-menu-click` 事件回传（去掉前缀）给前端执行。
/// `x`/`y` 为全局鼠标钩子上报的屏幕物理坐标；若窗口收在托盘则先显示，再算出相对窗口左上角的偏移。
#[tauri::command]
fn show_card_menu(
    window: tauri::Window,
    widget_items: Vec<CardMenuItem>,
    x: i32,
    y: i32,
) -> Result<(), String> {
    let menu = Menu::new(&window).map_err(|e| e.to_string())?;

    // 各 widget 注册的功能直接平铺（不再套「widget 功能」子菜单）
    if !widget_items.is_empty() {
        menu.append(&PredefinedMenuItem::separator(&window).map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())?;
        for it in &widget_items {
            let item = MenuItem::with_id(
                &window,
                format!("card-menu:{}", it.id),
                &it.label,
                true,
                None::<&str>,
            )
            .map_err(|e| e.to_string())?;
            menu.append(&item).map_err(|e| e.to_string())?;
        }
    }

    // 若卡片收在托盘则先显示，否则菜单会弹在不可见窗口上；显示后光标物理坐标相对窗口左上角的偏移不变。
    if !window.is_visible().unwrap_or(true) {
        let _ = window.show();
    }

    // 屏幕物理坐标 → 相对窗口左上角的物理坐标（菜单定位需要窗口内偏移）
    let outer = window.outer_position().map_err(|e| e.to_string())?;
    menu.popup_at(
        window,
        tauri::PhysicalPosition::new(x - outer.x, y - outer.y),
    )
    .map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(
            // 不预注册快捷键：由 setup 里 shortcut::init 按持久化配置注册（可自定义）。
            // 这里的 handler 会对所有已注册快捷键触发，故运行时改绑的键同样生效。
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _, event| {
                    if event.state == ShortcutState::Pressed {
                        // 快捷键唤起 → 显示并自动打开搜索页
                        toggle_window(app, true);
                    }
                })
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            get_album_art,
            read_lyrics,
            list_external_widgets,
            create_widget_sandbox,
            call_widget_sandbox,
            destroy_widget_sandbox,
            clipboard::clipboard_get_history,
            clipboard::clipboard_write,
            clipboard::clipboard_remove,
            clipboard::clipboard_clear,
            clipboard::clipboard_set_paused,
            http::http_request,
            show_card_menu,
            shortcut::set_toggle_shortcut,
            update::check_for_update,
            update::download_and_install
        ])
        .setup(|app| {
            app.manage(sandbox::SandboxManager::default());
            app.manage(clipboard::ClipboardState::new(app.handle())?);
            clipboard::spawn_monitor(app.handle().clone());
            // 全局显隐快捷键：按持久化配置注册（默认 ctrl+alt+space）
            shortcut::init(app)?;
            // 全局鼠标钩子：长按中键在任意位置弹出卡片系统菜单
            global_mouse::start(app.handle().clone());
            // 卡片右键菜单（show_card_menu 弹出的系统级菜单）事件：把 id（去 card-menu: 前缀）转发给前端执行
            app.on_menu_event(|app, event| {
                if let Some(id) = event.id.as_ref().strip_prefix("card-menu:") {
                    let _ = app.emit("card-menu-click", id.to_string());
                }
            });
            let show_hide = MenuItem::with_id(app, "toggle", "显示 / 隐藏", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_hide, &quit])?;

            TrayIconBuilder::new()
                .icon(
                    app.default_window_icon()
                        .cloned()
                        .expect("missing app icon"),
                )
                .tooltip("Desktop Card")
                .menu(&menu)
                // 左键点击=显隐切换；右键仍弹出菜单（Windows 默认）
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "toggle" => toggle_window(app, false),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        toggle_window(tray.app_handle(), false);
                    }
                })
                .build(app)?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
