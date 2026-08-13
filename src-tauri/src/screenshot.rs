//! 截图能力：捕获虚拟桌面（多显示器并集），供前端 SnipOverlay 框选。
//!
//! 只负责「截取整屏合成图 + 落盘 + 拷剪贴板」，业务（框选、保存路径选择）由前端负责。
//! 用 `xcap` 枚举显示器并逐块捕获，按各显示器在虚拟桌面中的坐标拼成一张合成图，
//! 以 base64 PNG 返回，前端据此定位框选区域。

use base64::Engine as _;
use serde::Serialize;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::AppHandle;
use tauri::Manager;

/// 整屏合成截图：base64 PNG + 像素尺寸（虚拟桌面并集）。
#[derive(Serialize)]
pub struct CaptureResult {
    png_b64: String,
    width: u32,
    height: u32,
}

/// 捕获虚拟桌面（所有显示器并集）为一张合成图，编码 base64 PNG 返回。
/// 各显示器坐标可为负（副屏在左/上方），取并集包围盒作为画布尺寸。
#[tauri::command]
pub fn capture_screen() -> Result<CaptureResult, String> {
    let monitors = xcap::Monitor::all().map_err(|e| e.to_string())?;
    if monitors.is_empty() {
        return Err("no monitors found".into());
    }

    let min_x = monitors.iter().map(|m| m.x().unwrap_or(0)).min().unwrap_or(0);
    let min_y = monitors.iter().map(|m| m.y().unwrap_or(0)).min().unwrap_or(0);
    let max_right = monitors
        .iter()
        .map(|m| m.x().unwrap_or(0) + m.width().unwrap_or(0) as i32)
        .max()
        .unwrap_or(0);
    let max_bottom = monitors
        .iter()
        .map(|m| m.y().unwrap_or(0) + m.height().unwrap_or(0) as i32)
        .max()
        .unwrap_or(0);

    let w = (max_right - min_x).max(1) as u32;
    let h = (max_bottom - min_y).max(1) as u32;
    let mut composite = image::RgbaImage::new(w, h);

    for m in &monitors {
        let (x, y) = (m.x().unwrap_or(0), m.y().unwrap_or(0));
        let img = m.capture_image().map_err(|e| e.to_string())?;
        image::imageops::overlay(&mut composite, &img, (x - min_x) as i64, (y - min_y) as i64);
    }

    let mut buf = Vec::new();
    image::DynamicImage::ImageRgba8(composite)
        .write_to(&mut std::io::Cursor::new(&mut buf), image::ImageFormat::Png)
        .map_err(|e| e.to_string())?;

    Ok(CaptureResult {
        png_b64: base64::engine::general_purpose::STANDARD.encode(buf),
        width: w,
        height: h,
    })
}

/// 截图根目录：`app_data_dir/screenshots`。
pub fn screenshots_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|p| p.join("screenshots"))
        .map_err(|e| e.to_string())
}

/// 把 base64 PNG 保存到截图目录，返回落盘路径（供截图 widget 列出/查看）。
#[tauri::command]
pub fn save_screenshot(app: AppHandle, png_b64: String) -> Result<String, String> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(png_b64)
        .map_err(|e| e.to_string())?;
    let dir = screenshots_dir(&app)?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let path = dir.join(format!("snip-{ts}.png"));
    std::fs::write(&path, &bytes).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}

/// 把 base64 PNG 复制到系统剪贴板。
#[tauri::command]
pub fn copy_png_to_clipboard(png_b64: String) -> Result<(), String> {
    use std::borrow::Cow;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(png_b64)
        .map_err(|e| e.to_string())?;
    let img = image::load_from_memory(&bytes).map_err(|e| e.to_string())?;
    let rgba = img.to_rgba8();
    let (w, h) = rgba.dimensions();
    let data = arboard::ImageData {
        width: w as usize,
        height: h as usize,
        bytes: Cow::Owned(rgba.into_raw()),
    };
    let mut cb = arboard::Clipboard::new().map_err(|e| e.to_string())?;
    cb.set_image(data).map_err(|e| e.to_string())
}

/// 列出截图目录里的全部图片路径（最新的在前），供截图 widget 预览。
#[tauri::command]
pub fn list_screenshots(app: AppHandle) -> Vec<String> {
    let dir = match screenshots_dir(&app) {
        Ok(d) => d,
        Err(_) => return Vec::new(),
    };
    let mut out: Vec<PathBuf> = std::fs::read_dir(&dir)
        .ok()
        .into_iter()
        .flatten()
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| {
            p.extension()
                .and_then(|x| x.to_str())
                .map(|x| x.eq_ignore_ascii_case("png"))
                .unwrap_or(false)
        })
        .collect();
    out.sort_by_key(|p| std::cmp::Reverse(p.to_string_lossy().into_owned()));
    out.into_iter().map(|p| p.to_string_lossy().into_owned()).collect()
}