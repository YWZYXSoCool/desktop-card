//! Widget 商店的文件 I/O：写 / 删外部 widget 目录。
//!
//! 只做 webview 做不了的磁盘操作，不带任何业务：下载 / 解析 / 目录抓取全在前端
//! （复用 `http_request`），这里只负责把前端抓到的文件落盘、或删除整个 widget 目录。
//! 所有 id 与文件名都做严格白名单校验，防路径穿越（安装目录由 id 决定，不允许 `..`）。

use serde::Deserialize;
use std::path::Path;
use tauri::AppHandle;

/// 前端下载的一个文件：相对该 widget 目录的文件名 + 文本内容。
#[derive(Deserialize)]
pub struct WidgetFile {
    name: String,
    content: String,
}

/// widget id / 目录名白名单：非空，仅字母数字与 `-`、`_`。防路径穿越与非法字符。
fn valid_widget_id(id: &str) -> bool {
    !id.is_empty()
        && id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

/// 文件名白名单：非空、非 `.`/`..`、不含路径分隔符，仅安全字符。
fn valid_file_name(name: &str) -> bool {
    !name.is_empty()
        && name != "."
        && name != ".."
        && !name.contains(['/', '\\'])
        && name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '_' || c == '-')
}

/// 把前端下载的 widget 文件写入 `widget_root/<id>/`。id / 文件名非法即整体拒绝。
#[tauri::command]
pub fn write_external_widget(
    id: String,
    files: Vec<WidgetFile>,
    app: AppHandle,
) -> Result<(), String> {
    if !valid_widget_id(&id) {
        return Err("非法的 widget id".into());
    }
    let root = crate::widget_root(&app)?;
    let dir = root.join(&id);
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    for f in &files {
        if !valid_file_name(&f.name) {
            return Err(format!("非法的文件名: {}", f.name));
        }
        std::fs::write(dir.join(&f.name), &f.content).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// 卸载：递归删除 `widget_root/<id>/`。目录不存在视为成功（幂等）。
#[tauri::command]
pub fn remove_external_widget(id: String, app: AppHandle) -> Result<(), String> {
    if !valid_widget_id(&id) {
        return Err("非法的 widget id".into());
    }
    let dir = crate::widget_root(&app)?.join(&id);
    if !dir.exists() {
        return Ok(());
    }
    std::fs::remove_dir_all(&dir).map_err(|e| e.to_string())
}

/// 从本地导入一个 widget 目录：校验 widget.json（id 合法），整目录递归复制到
/// `widget_root/<id>/`。目标已存在则拒绝（提示先卸载）。返回导入的 id。
#[tauri::command]
pub fn import_local_widget(dir: String, app: AppHandle) -> Result<String, String> {
    let src = Path::new(&dir);
    let manifest_path = src.join("widget.json");
    if !src.is_dir() || !manifest_path.is_file() {
        return Err("所选目录缺少 widget.json".into());
    }
    let text = std::fs::read_to_string(&manifest_path).map_err(|e| e.to_string())?;
    let manifest: serde_json::Value = serde_json::from_str(&text).map_err(|e| e.to_string())?;
    let id = manifest
        .get("id")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    if !valid_widget_id(&id) {
        return Err("widget.json 缺少合法的 id".into());
    }

    let dest = crate::widget_root(&app)?.join(&id);
    if dest.exists() {
        return Err("已安装同名 widget，请先在「已安装」中卸载".into());
    }
    copy_dir_recursive(src, &dest).map_err(|e| e.to_string())?;
    Ok(id)
}

/// 递归复制目录内容（含子目录与文件）。
fn copy_dir_recursive(src: &Path, dest: &Path) -> std::io::Result<()> {
    std::fs::create_dir_all(dest)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let ty = entry.file_type()?;
        let from = entry.path();
        let to = dest.join(entry.file_name());
        if ty.is_dir() {
            copy_dir_recursive(&from, &to)?;
        } else {
            std::fs::copy(&from, &to)?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_valid_ids() {
        for id in ["counter", "a-b_c", "widget2", "X"] {
            assert!(valid_widget_id(id), "should accept {id}");
        }
    }

    #[test]
    fn rejects_traversal_ids() {
        for id in ["..", "../../etc", "a/b", "a\\b", "", "a b", "a.b"] {
            assert!(!valid_widget_id(id), "should reject {id:?}");
        }
    }

    #[test]
    fn accepts_valid_file_names() {
        for name in ["widget.json", "index.js", "types.d.ts", "a-b_c.js"] {
            assert!(valid_file_name(name), "should accept {name}");
        }
    }

    #[test]
    fn rejects_traversal_file_names() {
        for name in ["../x", "a/b", "a\\b", "..", ".", "", "a b"] {
            assert!(!valid_file_name(name), "should reject {name:?}");
        }
    }
}