//! 检测更新：从 jsDelivr CDN 读仓库里的 `latest-release.json`（国内直连可达，无需代理），
//! 发现更高版本时构造安装包下载地址（可配置 GitHub 代理前缀转发）。
//! 下载安装包后触发安装。
//!
//! 只关心「有没有更高版本 + 装包」，不关心 UI。前端负责提示与进度展示。
//! 网络失败 / 404 / JSON 解析失败一律静默（返回 Ok(None) 语义），不打扰用户。
//!
//! 为什么不用 GitHub API：`api.github.com` 在大陆常被墙，直连检测会静默失败。
//! 改从 CDN 读仓库内清单（与 widget 商店同款 jsDelivr 方案），版本号仍在仓库 `package.json`
//! / `tauri.conf.json` / `Cargo.toml` 同步，发布时多维护一份 `latest-release.json` 即可。

use reqwest::header::USER_AGENT;
use semver::Version;
use serde::{Deserialize, Serialize};
use std::process::Command;
use std::sync::OnceLock;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

/// GitHub 仓库：从这里构造安装包下载地址。
const REPO: &str = "YWZYXSoCool/desktop-card";

/// 直接读仓库内清单的 CDN 前缀（国内直连，免代理）。
const CDN: &str = "https://cdn.jsdelivr.net/gh/YWZYXSoCool/desktop-card@main";

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

/// 仓库内版本清单 `latest-release.json`（发布时随三处版本号同步）。
#[derive(Deserialize)]
struct LatestRelease {
    version: String,
    asset_name: String,
}

/// 无更新时统一返回的 UpdateInfo（latest 为空串，asset 为 None）。
fn no_update(current: &str, release_url: String) -> UpdateInfo {
    UpdateInfo {
        update_available: false,
        current_version: current.into(),
        latest_version: String::new(),
        asset_name: None,
        asset_url: None,
        release_url,
    }
}

/// 检查是否有新版本。网络 / 解析失败一律视为「无更新」返回 Ok（静默）。
///
/// `proxy` 为可配置的 GitHub 代理前缀（如 `https://ghproxy.net/`），仅用于转发安装包
/// 下载；检测走 jsDelivr CDN 直连，无需代理。为空则直连 GitHub。
#[tauri::command]
pub async fn check_for_update(proxy: Option<String>) -> Result<UpdateInfo, String> {
    let current = env!("CARGO_PKG_VERSION");
    let release_url = format!("https://github.com/{REPO}/releases");

    // 从 CDN 读仓库内清单（国内直连可达）。404 / 网络失败一律静默回落为无更新。
    let manifest_url = format!("{CDN}/latest-release.json");
    let resp = client()
        .get(&manifest_url)
        .header(USER_AGENT, "desktop-card-updater")
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Ok(no_update(current, release_url));
    }
    let manifest: LatestRelease = resp.json().await.map_err(|e| e.to_string())?;

    // 版本号齐全且最新 > 当前才算有更新；任一解析失败视为无更新。
    let Some(cur) = parse_version(current) else {
        return Ok(no_update(current, release_url));
    };
    let Some(lat) = parse_version(&manifest.version) else {
        return Ok(no_update(current, release_url));
    };
    let update_available = lat > cur;

    // 安装包地址固定为 GitHub release 下载；配置了代理前缀则前置转发（代理需拼完整 GitHub URL）。
    let mut asset_url = format!(
        "https://github.com/{REPO}/releases/download/v{}/{}",
        manifest.version, manifest.asset_name
    );
    if let Some(p) = proxy.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        let prefix = if p.ends_with('/') {
            p.to_string()
        } else {
            format!("{p}/")
        };
        asset_url = format!("{prefix}{asset_url}");
    }

    Ok(UpdateInfo {
        update_available,
        current_version: current.into(),
        latest_version: manifest.version,
        asset_name: Some(manifest.asset_name),
        asset_url: Some(asset_url),
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