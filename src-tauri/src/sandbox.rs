//! 外部 widget 的 QuickJS 沙箱。
//!
//! 每个外部 widget 在独立的 rquickjs Runtime+Context 里执行，与 webview 应用上下文
//! 彻底隔离：widget 碰不到浏览器全局 / Tauri 能力，只能通过宿主注入的权限作用域
//! `ctx`（store / toast）与宿主通信。UI 以可序列化 JSON 树表达，由 webview 水合渲染。
//!
//! 线程模型：rquickjs 的 `Value`/`Object` 非 `Send`（内部持裸指针），而 `State<T>`
//! 要求托管类型 `Send + Sync`。因此**每个沙箱跑在一条专用 worker 线程上**，非 `Send`
//! 的 `Ctx`/`Value` 只在该线程内被创建和使用；`SandboxManager` 只存 `mpsc::Sender`，
//! 天然 `Send + Sync`。命令调用经通道投递请求、接收回复，同一 Context 只在它自己的
//! worker 线程被访问。
//!
//! 反向调用的 Marshalling：QuickJS ↔ 宿主之间全部经 JSON 字符串中转（rquickjs 0.8
//! 无 serde 直通）。宿主注入给沙箱的函数只接收/返回 `String`（避免 `Value` 生命周期
//! 纠缠），JS 侧用一小段 shim 做 `JSON.parse/stringify`。

use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::mpsc;
use std::sync::Mutex;

use rquickjs::function::Func;
use rquickjs::{Context, Ctx, Function, Object, Runtime, Value};
use serde_json::Value as JsonValue;
use tauri::{AppHandle, Emitter};
use tauri_plugin_store::StoreExt;

/// 沙箱内可下放的宿主能力（对应 widget manifest 的 permissions）。
/// 只在声明了对应权限时才注入，widget 拿不到未声明的能力。
#[derive(Clone, Copy)]
struct Permissions {
    store: bool,
    toast: bool,
}

impl Permissions {
    fn from_manifest(manifest: &JsonValue) -> Self {
        let perms: Vec<&str> = manifest
            .get("permissions")
            .and_then(|v| v.as_array())
            .map(|a| a.iter().filter_map(|x| x.as_str()).collect())
            .unwrap_or_default();
        Permissions {
            store: perms.contains(&"store"),
            toast: perms.contains(&"toast"),
        }
    }
}

/// 一个外部 widget 的 QuickJS 沙箱。只在它自己的 worker 线程上被触碰。
/// 不持有任何 `Value`/`Object`：每次调用从 `globalThis` 现取对象，保证标识符全在同一
/// 生命周期（`Context::with` 提供的 `Ctx`）内，避免跨 `with` 保存 JS 值。
struct SandboxWidget {
    /// 持有 runtime 以维持引擎存活。
    _runtime: Runtime,
    context: Context,
}

impl SandboxWidget {
    /// 调用 widget 的一个方法，返回其返回值（JSON）。
    fn call(&self, method: &str, args: &[JsonValue]) -> Result<JsonValue, String> {
        self.context.with(|ctx| {
            let widget: Object = ctx.globals().get("__widget__").map_err(|e| e.to_string())?;
            let wctx: Object = ctx
                .globals()
                .get("__widgetCtx")
                .map_err(|e| e.to_string())?;
            let f: Function = widget.get(method).map_err(|e| e.to_string())?;
            let result: Value = match method {
                "render" | "setup" => {
                    let c = wctx.clone();
                    f.call((c,))
                }
                "handleEvent" if args.len() >= 2 => {
                    let a0 = js_from_json(&ctx, &args[0]).map_err(|e| e.to_string())?;
                    let a1 = js_from_json(&ctx, &args[1]).map_err(|e| e.to_string())?;
                    let a2 = match args.get(2) {
                        Some(v) => js_from_json(&ctx, v).map_err(|e| e.to_string())?,
                        None => Value::new_undefined(ctx.clone()),
                    };
                    let c = wctx.clone();
                    f.call((c, a0, a1, a2))
                }
                "onDrop" if !args.is_empty() => {
                    let a0 = js_from_json(&ctx, &args[0]).map_err(|e| e.to_string())?;
                    let c = wctx.clone();
                    f.call((c, a0))
                }
                "onSettingChange" if args.len() >= 2 => {
                    let a0 = js_from_json(&ctx, &args[0]).map_err(|e| e.to_string())?;
                    let a1 = js_from_json(&ctx, &args[1]).map_err(|e| e.to_string())?;
                    let c = wctx.clone();
                    f.call((c, a0, a1))
                }
                _ => return Err(format!("unsupported method/args: {method}")),
            }
            .map_err(|e| e.to_string())?;
            json_from_js(&ctx, result).map_err(|e| e.to_string())
        })
    }
}

/// 沙箱注册表（存于 app state）。只存 `Sender`，故 `Send + Sync`。
#[derive(Default)]
pub struct SandboxManager {
    sandboxes: Mutex<HashMap<u64, mpsc::Sender<Request>>>,
}

static NEXT_ID: AtomicU64 = AtomicU64::new(1);

/// 投递给 worker 线程的一次调用请求。
struct Request {
    method: String,
    args: JsonValue,
    reply: mpsc::Sender<Result<JsonValue, String>>,
}

/// serde_json::Value → JS Value（经 JSON 字符串中转，rquickjs 0.8 无 serde 直通）。
fn js_from_json<'js>(ctx: &Ctx<'js>, v: &JsonValue) -> Result<Value<'js>, rquickjs::Error> {
    let s = serde_json::to_string(v).map_err(serde_err)?;
    ctx.json_parse(s)
}

/// JS Value → serde_json::Value；undefined 记为 Null。
fn json_from_js<'js>(ctx: &Ctx<'js>, v: Value<'js>) -> Result<JsonValue, rquickjs::Error> {
    match ctx.json_stringify(v)? {
        Some(s) => serde_json::from_str(&s.to_string()?).map_err(serde_err),
        None => Ok(JsonValue::Null),
    }
}

/// 把 serde_json 错误折叠成 rquickjs 的 IntoJs 错误。
fn serde_err(e: serde_json::Error) -> rquickjs::Error {
    rquickjs::Error::IntoJs {
        from: "serde_json::Value",
        to: "JS value",
        message: Some(e.to_string()),
    }
}

/// 读取 store 中某个键（settings.json）。键不存在返回 None。
fn store_get(app: &AppHandle, key: &str) -> Option<JsonValue> {
    app.store("settings.json").ok()?.get(key)
}

/// 写入 store 中某个键（Store::set 自动触发保存）。
fn store_set(app: &AppHandle, key: &str, value: JsonValue) {
    if let Ok(store) = app.store("settings.json") {
        store.set(key, value);
    }
}

/// 创建沙箱：注入 registerWidget + 权限 ctx shim、eval bundle 源码、校验捕获 widget。
/// 在**调用方线程**（worker 线程内）执行，返回的 `SandboxWidget` 不跨线程。
fn create_sandbox(
    dir: &str,
    manifest: &JsonValue,
    app: AppHandle,
) -> Result<SandboxWidget, String> {
    let entry = manifest
        .get("entry")
        .and_then(|v| v.as_str())
        .unwrap_or("index.js");
    let source = std::fs::read_to_string(format!("{dir}/{entry}")).map_err(|e| e.to_string())?;

    let perms = Permissions::from_manifest(manifest);
    let runtime = Runtime::new().map_err(|e| e.to_string())?;
    let context = Context::full(&runtime).map_err(|e| e.to_string())?;

    context.with(|ctx| -> Result<(), String> {
        // 1. registerWidget：widget 把实现对象交到 globalThis.__widget__。
        ctx.eval::<(), _>("globalThis.registerWidget = function(w){ globalThis.__widget__ = w; };")
            .map_err(|e| e.to_string())?;

        // 2. 注入宿主函数（只声明过才注入，且只收/发 String）。闭包无 Value 生命周期。
        if perms.store {
            let app_get = app.clone();
            ctx.globals()
                .set(
                    "__hostStoreGet",
                    Func::new(move |key: String| -> Option<String> {
                        store_get(&app_get, &key).map(|v| v.to_string())
                    }),
                )
                .map_err(|e| e.to_string())?;
            let app_set = app.clone();
            ctx.globals()
                .set(
                    "__hostStoreSet",
                    Func::new(move |key: String, value: String| {
                        let v = serde_json::from_str(&value).unwrap_or(JsonValue::Null);
                        store_set(&app_set, &key, v);
                    }),
                )
                .map_err(|e| e.to_string())?;
        }
        if perms.toast {
            let app_toast = app.clone();
            ctx.globals()
                .set(
                    "__hostToast",
                    Func::new(move |msg: String, kind: String| {
                        let _ = app_toast.emit(
                            "widget-toast",
                            serde_json::json!({ "msg": msg, "kind": kind }),
                        );
                    }),
                )
                .map_err(|e| e.to_string())?;
        }

        // 3. 用 JS shim 组装权限作用域 ctx（store/toast 走上面的宿主函数）。
        let mut shim = String::from("globalThis.__widgetCtx = {};");
        if perms.store {
            shim.push_str(
                "__widgetCtx.store = { get: (k, fb) => { var s = __hostStoreGet(k); \
                 return s === null || s === undefined ? fb : JSON.parse(s); }, \
                 set: (k, v) => __hostStoreSet(k, JSON.stringify(v)) };",
            );
        }
        if perms.toast {
            shim.push_str(
                "__widgetCtx.toast = { info: (m) => __hostToast(m, 'info'), \
                 error: (m) => __hostToast(m, 'error') };",
            );
        }
        ctx.eval::<(), _>(shim.as_str())
            .map_err(|e| e.to_string())?;

        // 4. 执行 bundle 源码。
        ctx.eval::<(), _>(source.as_str())
            .map_err(|e| e.to_string())?;

        // 5. 校验 widget 已注册（缺 registerWidget 调用则报错，由调用方告警）。
        ctx.globals()
            .get::<_, Object>("__widget__")
            .map(|_| ())
            .map_err(|e| e.to_string())?;

        Ok(())
    })?;

    Ok(SandboxWidget {
        _runtime: runtime,
        context,
    })
}

/// worker 线程主循环：消费请求，调用沙箱方法，把结果经 reply 通道送回。
fn worker_loop(sb: SandboxWidget, rx: mpsc::Receiver<Request>) {
    for req in rx {
        let args = req.args.as_array().cloned().unwrap_or_default();
        let result = sb.call(&req.method, &args);
        let _ = req.reply.send(result);
    }
    // rx 断开（所有 Sender 被 drop）→ 循环结束 → sb 被 drop → 引擎释放。
}

/// 创建沙箱并登记，返回 handle。沙箱主体在专用 worker 线程上构建。
pub fn register(
    manager: &SandboxManager,
    dir: &str,
    manifest: &JsonValue,
    app: &AppHandle,
) -> Result<u64, String> {
    let id = NEXT_ID.fetch_add(1, Ordering::Relaxed);
    let (tx, rx) = mpsc::channel::<Request>();
    let (ready_tx, ready_rx) = mpsc::channel::<Result<(), String>>();

    let dir = dir.to_owned();
    let manifest = manifest.clone();
    let app = app.clone();
    std::thread::spawn(move || match create_sandbox(&dir, &manifest, app) {
        Ok(sb) => {
            let _ = ready_tx.send(Ok(()));
            worker_loop(sb, rx);
        }
        Err(e) => {
            let _ = ready_tx.send(Err(e));
        }
    });

    // 等 worker 把沙箱建好（或回报错误）再登记。
    match ready_rx.recv() {
        Ok(Ok(())) => {
            manager.sandboxes.lock().unwrap().insert(id, tx);
            Ok(id)
        }
        Ok(Err(e)) => Err(e),
        Err(_) => Err("sandbox thread exited before ready".into()),
    }
}

/// 调用已登记沙箱的一个方法。
pub fn call(
    manager: &SandboxManager,
    handle: u64,
    method: &str,
    args: &JsonValue,
) -> Result<JsonValue, String> {
    let tx = manager
        .sandboxes
        .lock()
        .unwrap()
        .get(&handle)
        .cloned()
        .ok_or_else(|| format!("unknown sandbox handle: {handle}"))?;
    let (reply_tx, reply_rx) = mpsc::channel();
    tx.send(Request {
        method: method.to_owned(),
        args: args.clone(),
        reply: reply_tx,
    })
    .map_err(|e| e.to_string())?;
    reply_rx.recv().map_err(|e| e.to_string())?
}

/// 销毁沙箱（drop Sender 关闭通道，worker 循环结束并释放引擎）。
pub fn destroy(manager: &SandboxManager, handle: u64) {
    manager.sandboxes.lock().unwrap().remove(&handle);
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 构造一个不含 store/toast 的简化沙箱（不依赖 AppHandle），
    /// 验证 rquickjs 的 eval → registerWidget 捕获 → call 渲染 的核心机制。
    fn sandbox_eval(src: &str) -> SandboxWidget {
        let runtime = Runtime::new().unwrap();
        let context = Context::full(&runtime).unwrap();
        context.with(|ctx| {
            ctx.eval::<(), _>(
                "globalThis.registerWidget = function(w){ globalThis.__widget__ = w; };",
            )
            .unwrap();
            ctx.eval::<(), _>("globalThis.__widgetCtx = {};").unwrap();
            ctx.eval::<(), _>(src).unwrap();
        });
        SandboxWidget {
            _runtime: runtime,
            context,
        }
    }

    #[test]
    fn render_returns_json_tree() {
        let w = sandbox_eval(
            r#"
            registerWidget({
                render(ctx) { return { type: "row", children: [
                    { type: "text", props: { value: "hi" }, on: "greet" },
                ]}; },
                handleEvent(id) { return id; },
            });
            "#,
        );
        let tree = w.call("render", &[]).unwrap();
        assert_eq!(tree["type"], JsonValue::String("row".into()));
        assert_eq!(tree["children"][0]["on"], JsonValue::String("greet".into()));
        assert_eq!(
            tree["children"][0]["props"]["value"],
            JsonValue::String("hi".into())
        );
    }

    #[test]
    fn missing_method_returns_error() {
        let w = sandbox_eval("registerWidget({ render(ctx) { return {}; } });");
        assert!(w.call("onDrop", &[]).is_err());
    }
}
