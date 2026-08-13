//! 可自定义的全局显隐快捷键。
//!
//! 默认 `ctrl+alt+space`（与前端主页设置面板的 default 一致）。用户可在主页设置里改：
//! 经 `set_toggle_shortcut` 运行时注销旧的、注册新的并持久化到 `settings.json`；
//! 启动时 `init` 读回持久化的值再注册（缺省用默认）。
//!
//! 依赖插件的事件分发：global-shortcut 内建 handler（`with_handler`）会对**所有**已注册
//! 快捷键触发（见插件 `lib.rs` 的 `GlobalHotKeyEvent::set_event_handler`，先跑快捷键自己的
//! handler、再跑全局 handler），故这里用 `register()` 注册的新快捷键同样会触发显隐切换闭包。

use std::sync::Mutex;
use tauri::AppHandle;
use tauri_plugin_global_shortcut::GlobalShortcutExt;
use tauri_plugin_store::StoreExt;

/// 当前生效的全局快捷键（用于运行时改绑时注销旧的）。
static CURRENT: Mutex<String> = Mutex::new(String::new());

/// `settings.json` 里存放自定义快捷键的键。
const KEY: &str = "global.shortcut";
/// 默认快捷键（与前端主页设置面板的 default 一致）。
const DEFAULT: &str = "ctrl+alt+space";

/// setup：读回持久化的自定义快捷键并注册；缺省 / 读失败用 `DEFAULT`。
/// 需在插件 `with_shortcuts` 之外调用（插件不再预注册默认值，避免重复注册冲突）。
pub fn init(app: &tauri::App) -> Result<(), String> {
    let saved = app
        .store("settings.json")
        .map_err(|e| e.to_string())?
        .get(KEY)
        .and_then(|v| v.as_str().map(String::from))
        .unwrap_or_else(|| DEFAULT.to_string());

    app.global_shortcut()
        .register(saved.as_str())
        .map_err(|e| format!("注册全局快捷键失败：{e}"))?;

    *CURRENT.lock().unwrap() = saved;
    Ok(())
}

/// 运行时改快捷键：先试注册新键（失败即格式非法 / 与其它程序冲突，不改动），
/// 成功后再注销旧的、持久化。返回 Err 表示新快捷键无效。
#[tauri::command]
pub fn set_toggle_shortcut(app: AppHandle, shortcut: String) -> Result<(), String> {
    let trimmed = shortcut.trim().to_string();
    if trimmed.is_empty() {
        return Err("快捷键不能为空".into());
    }

    let mut current = CURRENT.lock().unwrap();
    if *current == trimmed {
        return Ok(()); // 未变化，跳过
    }

    // 先注册新键做校验；失败则原样返回（此时旧键仍未动）
    app.global_shortcut()
        .register(trimmed.as_str())
        .map_err(|e| format!("快捷键无效：{e}"))?;

    // 校验通过：注销旧键（若已注册过）
    if !current.is_empty() {
        let _ = app.global_shortcut().unregister(current.as_str());
    }
    *current = trimmed.clone();

    // 持久化
    let store = app.store("settings.json").map_err(|e| e.to_string())?;
    store.set(KEY, trimmed);
    store.save().map_err(|e| e.to_string())?;
    Ok(())
}