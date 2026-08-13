//! 检测更新：从 GitHub Releases 拉取最新版本，发现新版本时下载安装包并触发安装。
//!
//! 只关心「有没有更高版本 + 装包」，不关心 UI。前端负责提示与进度展示。
//! 网络失败 / 404 / JSON 解析失败一律静默（返回 Ok(None) 语义），不打扰用户。

use reqwest::header::USER_AGENT;
use semver::Version;
use serde::Serialize;
use std::process::Command;
use std::sync::OnceLock;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

/// GitHub 仓库：从这里拉取最新版本与安装包。
const REPO: &str = "YWZYXSoCool/desktop-card";

/// 请求超时：避免网络卡死拖住异步命令。
const TIMEOUT: Duration = Duration::from_secs(15);

/// 共享的 HTTP 客户端：与 http.rs 同款惰性单例，复用连接池与 TLS。
fn client() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .timeout(TIMEOUT)
            .redirect(reqwest::redirect::Policy::limited(5))
            .build()
            .expect("构建共享 HTTP 客户端失败")
    })
}

/// 解析语义化版本，交给 `semver` 库做比较。
/// 只做最小归一化：剥离常见前导 `v`（`v0.1.0` → `0.1.0`），并把两段 tag（`1.0`）
/// 补成三段（`1.0.0`）——`semver::Version::parse` 严格要求三段。解析失败返回 None。
fn parse_version(s: &str) -> Option<Version> {
    let s = s.trim();
    let s = s.strip_prefix('v').unwrap_or(s);
    let mut parts: Vec<&str> = s.split('.').collect();
    if parts.len() == 2 {
        parts.push("0");
    }
    Version::parse(&parts.join(".")).ok()
}

/// 更新检查结果：`update_available` 为 true 时前端据此提示。
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    update_available: bool,
    current_version: String,
    /// 最新版本号；无更新时为空串。
    latest_version: String,
    /// Windows 安装包文件名；无更新或找不到安装包时为 None。
    asset_name: Option<String>,
    /// 安装包下载地址；同上为 None。
    asset_url: Option<String>,
    /// Releases 页地址，兜底可用（打不开安装包时退化打开页面）。
    release_url: String,
}

/// GitHub /releases/latest 响应里的 asset 条目。
#[derive(serde::Deserialize)]
struct Asset {
    name: String,
    browser_download_url: String,
}

/// GitHub /releases/latest 响应（只取需要的字段）。
#[derive(serde::Deserialize)]
struct Release {
    tag_name: String,
    assets: Vec<Asset>,
}

/// 从资产列表里挑 Windows 安装包：优先 `.msi`，其次 `.exe`。
fn pick_installer(assets: &[Asset]) -> Option<&Asset> {
    assets
        .iter()
        .find(|a| a.name.ends_with(".msi"))
        .or_else(|| assets.iter().find(|a| a.name.ends_with(".exe")))
}

/// 检查是否有新版本。网络 / 解析失败一律视为「无更新」返回 Ok（静默）。
#[tauri::command]
pub async fn check_for_update() -> Result<UpdateInfo, String> {
    let current = env!("CARGO_PKG_VERSION");
    let release_url = format!("https://github.com/{REPO}/releases");
    let api_url = format!("https://api.github.com/repos/{REPO}/releases/latest");

    // GitHub API 强制要求 User-Agent，否则返回 403。
    let resp = client()
        .get(&api_url)
        .header(USER_AGENT, "desktop-card-updater")
        .send()
        .await
        .map_err(|e| e.to_string())?;

    // 404（仓库不存在或没有 release）等非 200：静默回落为无更新。
    if !resp.status().is_success() {
        return Ok(UpdateInfo {
            update_available: false,
            current_version: current.into(),
            latest_version: String::new(),
            asset_name: None,
            asset_url: None,
            release_url,
        });
    }

    let release: Release = resp.json().await.map_err(|e| e.to_string())?;
    let latest = release.tag_name;

    // 版本号齐全且最新 > 当前才算有更新；任一解析失败视为无更新。
    let Some(cur) = parse_version(current) else {
        return Ok(UpdateInfo {
            update_available: false,
            current_version: current.into(),
            latest_version: latest.clone(),
            asset_name: None,
            asset_url: None,
            release_url,
        });
    };
    let Some(lat) = parse_version(&latest) else {
        return Ok(UpdateInfo {
            update_available: false,
            current_version: current.into(),
            latest_version: latest.clone(),
            asset_name: None,
            asset_url: None,
            release_url,
        });
    };
    let update_available = lat > cur;

    let (asset_name, asset_url) = match pick_installer(&release.assets) {
        Some(a) => (Some(a.name.clone()), Some(a.browser_download_url.clone())),
        None => (None, None),
    };

    Ok(UpdateInfo {
        update_available,
        current_version: current.into(),
        latest_version: latest,
        asset_name,
        asset_url,
        release_url,
    })
}

/// 下载安装包到临时目录，按扩展名启动安装器，随后退出主程序让安装器独占文件写入。
/// 进度经 `update-download-progress` 事件（`{received, total}`）推给前端。
#[tauri::command]
pub async fn download_and_install(app: AppHandle, asset_url: String) -> Result<(), String> {
    let resp = client()
        .get(&asset_url)
        .header(USER_AGENT, "desktop-card-updater")
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("下载失败：HTTP {}", resp.status()));
    }
    let total = resp.content_length().unwrap_or(0);

    // 文件名取 URL 最后一段，落到临时目录。
    let file_name = asset_url
        .rsplit('/')
        .next()
        .filter(|s| !s.is_empty())
        .unwrap_or("update_installer");
    let dest_dir = app
        .path()
        .temp_dir()
        .map_err(|e| e.to_string())?;
    let dest = dest_dir.join(file_name);

    // 流式写到磁盘，边写边发进度。
    let mut stream = resp.bytes_stream();
    let mut file = tokio::fs::File::create(&dest)
        .await
        .map_err(|e| e.to_string())?;
    let mut received: u64 = 0;
    use futures_util::StreamExt;
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| e.to_string())?;
        received += chunk.len() as u64;
        tokio::io::AsyncWriteExt::write_all(&mut file, &chunk)
            .await
            .map_err(|e| e.to_string())?;
        let _ = app.emit("update-download-progress", DownloadProgress { received, total });
    }

    launch_installer(&dest)?;

    // 安装器已启动：退出主程序，避免文件被占用导致安装失败。
    app.exit(0);
    Ok(())
}

/// 下载进度负载。
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct DownloadProgress {
    received: u64,
    total: u64,
}

/// 按扩展名启动安装器：
/// - `.msi` → msiexec
/// - `.exe` → 直接运行（NSIS 自解压需要 CWD 指向所在目录）
fn launch_installer(path: &std::path::Path) -> Result<(), String> {
    let parent = path.parent().unwrap_or(std::path::Path::new(""));
    if path.extension().and_then(|e| e.to_str()) == Some("msi") {
        Command::new("msiexec")
            .arg("/i")
            .arg(path.as_os_str())
            .spawn()
            .map_err(|e| e.to_string())?;
    } else {
        Command::new(path)
            .current_dir(parent)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_higher_version() {
        let a = parse_version("0.1.1").expect("valid");
        let b = parse_version("0.1.0").expect("valid");
        assert!(a > b);
    }

    #[test]
    fn strips_leading_v() {
        assert_eq!(parse_version("v0.1.0"), parse_version("0.1.0"));
    }

    #[test]
    fn semver_pads_missing_segments() {
        // semver 库自带补零语义：1.0 == 1.0.0
        assert_eq!(parse_version("1.0"), parse_version("1.0.0"));
    }

    #[test]
    fn not_higher_when_equal_or_lower() {
        let a = parse_version("0.1.0").expect("valid");
        let b = parse_version("0.1.1").expect("valid");
        assert!(!(a > b));
    }

    #[test]
    fn rejects_garbage() {
        assert_eq!(parse_version("not-a-version"), None);
    }
}