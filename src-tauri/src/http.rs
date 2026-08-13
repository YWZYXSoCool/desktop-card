//! 通用 HTTP 请求通道。
//!
//! 这是后端暴露给前端的「裸请求 API」：只负责把前端给出的 method / url /
//! headers / body 转发出去，返回原始响应（状态码 + 正文）。**不关心任何业务**——
//! 是词典、AI 聊天还是别的用途，均由前端自行构造请求、自行解析响应。
//! 这样后端不依赖具体业务（不写死在某个服务商、某种数据结构），业务逻辑全部留在前端。

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::OnceLock;
use std::time::Duration;

/// 一次 HTTP 请求的完整描述（由前端构造，字段与前端调用对齐）。
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HttpRequest {
    pub(crate) method: String,
    pub(crate) url: String,
    #[serde(default)]
    pub(crate) headers: HashMap<String, String>,
    /// 原始请求体（字符串），前端自行 JSON 序列化，后端原样转发。
    #[serde(default)]
    pub(crate) body: Option<String>,
}

/// 原始响应：状态码 + 正文原文。业务解析交给前端。
#[derive(Serialize)]
pub struct HttpResponse {
    pub(crate) status: u16,
    pub(crate) body: String,
}

/// 请求超时：避免网络卡死拖住异步命令。
const TIMEOUT: Duration = Duration::from_secs(15);

/// 共享的 HTTP 客户端：复用连接池与 TLS，避免每次请求重建（连接 keep-alive 复用）。
/// 配置固定，首次使用时惰性构建一次，之后 arc 克隆。
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

/// 发起一次 HTTP 请求，返回原始响应的状态码与正文。
/// 不做任何业务判断（404 是词不存在还是别的，由前端根据状态码自行处理）。
#[tauri::command]
pub async fn http_request(req: HttpRequest) -> Result<HttpResponse, String> {
    perform_request(&req).await
}

/// 与命令等价的纯请求逻辑，独立出来便于测试。
pub(crate) async fn perform_request(req: &HttpRequest) -> Result<HttpResponse, String> {
    let method = reqwest::Method::from_bytes(req.method.to_uppercase().as_bytes())
        .map_err(|_| format!("不支持的 HTTP 方法: {}", req.method))?;

    let mut rb = client().request(method, &req.url);
    for (k, v) in &req.headers {
        rb = rb.header(k, v);
    }
    if let Some(body) = &req.body {
        rb = rb.body(body.clone());
    }

    let resp = rb.send().await.map_err(|e| e.to_string())?;
    let status = resp.status().as_u16();
    let body = resp.text().await.map_err(|e| e.to_string())?;
    Ok(HttpResponse { status, body })
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 直接命中真实的词典 API，验证「裸转发 + 返回原始正文」这条链路没有坏。
    #[test]
    fn refetches_dictionaryapi_body() {
        let req = HttpRequest {
            method: "GET".into(),
            url: "https://api.dictionaryapi.dev/api/v2/entries/en/word".into(),
            headers: HashMap::new(),
            body: None,
        };
        let res = tauri::async_runtime::block_on(perform_request(&req))
            .expect("request should succeed");
        assert_eq!(res.status, 200);
        assert!(!res.body.trim().is_empty(), "body should not be empty");
        // 原始正文应是合法 JSON 数组，前端自行解析
        let parsed: serde_json::Value = serde_json::from_str(&res.body).expect("valid json");
        assert!(parsed.is_array(), "dictionaryapi returns an array");
    }
}