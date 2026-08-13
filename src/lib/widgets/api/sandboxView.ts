import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { UINode, WidgetContext, WidgetRenderer } from "./types";

/** 沙箱交互回调：`(eventId, type, data)` → 宿主转发给沙箱 handleEvent。 */
type EventHandler = (id: string, type: string, data: unknown) => void;

/**
 * 沙箱 widget 渲染器：`mount(container)` 后调沙箱 `render()` 取 JSON 树，
 * 水合为真实 DOM；交互节点 → 回调沙箱 `handleEvent` → 重调 `render()` 重水合。
 * 沙箱内无计时器，无法自轮询；凡声明了 `download` 权限的 widget，宿主下载任务
 * 进度变更会发 `widget-progress`（带 handle）事件，这里按 handle 重渲染以刷新进度。
 */
export function sandboxRenderer(handle: number): WidgetRenderer {
    return {
        mount(container: HTMLElement, _ctx: WidgetContext): () => void {
            let disposed = false;

            const reRender = async () => {
                if (disposed) return;
                try {
                    const tree = await invoke<UINode>("call_widget_sandbox", {
                        handle,
                        method: "render",
                        args: [],
                    });
                    hydrateTree(container, tree, (id, type, data) => {
                        invoke("call_widget_sandbox", {
                            handle,
                            method: "handleEvent",
                            args: [id, type, data],
                        })
                            .then(() => reRender())
                            .catch((e) =>
                                console.error("[widget] handleEvent 失败：", e),
                            );
                    });
                } catch (e) {
                    console.error("[widget] render 失败：", e);
                }
            };

            // 下载任务进度变更 → 只刷新本 widget（按 handle 匹配）
            const unlistenPromise = listen<{ handle: number }>(
                "widget-progress",
                (e) => {
                    if (e.payload.handle === handle) reRender();
                },
            );

            reRender();

            return () => {
                disposed = true;
                container.replaceChildren();
                unlistenPromise.then((unlisten) => unlisten()).catch(() => {});
            };
        },
    };
}

/** 把一棵 UINode 树水合进容器（清空后追加）。 */
export function hydrateTree(
    container: HTMLElement,
    tree: UINode,
    onEvent: EventHandler,
): void {
    container.replaceChildren();
    container.appendChild(createElement(tree, onEvent));
}

/** 按节点类型创建一个真实 DOM 元素，并递归挂子树 / 绑定交互。 */
function createElement(node: UINode, onEvent: EventHandler): HTMLElement {
    const { type, props = {}, style, children, on } = node;
    let el: HTMLElement;

    switch (type) {
        case "row":
        case "column":
        case "stack":
        case "box": {
            el = document.createElement("div");
            el.style.display = "flex";
            if (type === "row") el.style.flexDirection = "row";
            else if (type === "column") el.style.flexDirection = "column";
            else if (type === "stack") el.style.position = "relative";
            break;
        }
        case "spacer": {
            el = document.createElement("div");
            el.style.flex = "1";
            break;
        }
        case "text": {
            el = document.createElement("span");
            el.textContent = String(props.value ?? props.label ?? "");
            break;
        }
        case "button": {
            el = document.createElement("button");
            (el as HTMLButtonElement).type = "button";
            el.textContent = String(props.label ?? "");
            el.className = "sb-btn";
            break;
        }
        case "input": {
            const input = document.createElement("input");
            input.type = props.password ? "password" : "text";
            input.value = String(props.value ?? "");
            input.placeholder = String(props.placeholder ?? "");
            el = input;
            break;
        }
        case "number": {
            const input = document.createElement("input");
            input.type = "number";
            input.value = String(props.value ?? "");
            if (props.min != null) input.min = String(props.min);
            if (props.max != null) input.max = String(props.max);
            if (props.step != null) input.step = String(props.step);
            el = input;
            break;
        }
        case "toggle": {
            const input = document.createElement("input");
            input.type = "checkbox";
            input.checked = Boolean(props.checked);
            el = input;
            break;
        }
        case "select": {
            const select = document.createElement("select");
            for (const opt of (props.options as
                | Array<{ label: string; value: string | number }>
                | undefined) ?? []) {
                const o = document.createElement("option");
                o.value = String(opt.value);
                o.textContent = String(opt.label);
                select.appendChild(o);
            }
            if (props.value != null) select.value = String(props.value);
            el = select;
            break;
        }
        case "slider": {
            const input = document.createElement("input");
            input.type = "range";
            input.min = String(props.min ?? 0);
            input.max = String(props.max ?? 100);
            input.step = String(props.step ?? 1);
            input.value = String(props.value ?? 0);
            el = input;
            break;
        }
        case "color": {
            const input = document.createElement("input");
            input.type = "color";
            input.value = String(props.value ?? "#000000");
            el = input;
            break;
        }
        case "textarea": {
            const ta = document.createElement("textarea");
            ta.value = String(props.value ?? "");
            ta.placeholder = String(props.placeholder ?? "");
            el = ta;
            break;
        }
        case "image": {
            const img = document.createElement("img");
            img.src = String(props.src ?? "");
            el = img;
            break;
        }
        default: {
            el = document.createElement("div");
        }
    }

    if (style) {
        for (const [k, v] of Object.entries(style)) {
            try {
                el.style.setProperty(k, v);
            } catch {
                // 未知样式键忽略，避免单个坏键拖垮整棵子树
            }
        }
    }

    if (children) {
        for (const child of children) {
            el.appendChild(createElement(child, onEvent));
        }
    }

    if (on) {
        bindEvent(el, node, onEvent);
    }
    return el;
}

/** 给交互节点绑定事件，把 `(eventId, type, data)` 交给宿主的 onEvent。 */
function bindEvent(el: HTMLElement, node: UINode, onEvent: EventHandler): void {
    const id = node.on!;
    switch (node.type) {
        case "button":
            el.addEventListener("click", () => onEvent(id, "click", {}));
            break;
        case "toggle":
            el.addEventListener("change", () =>
                onEvent(id, "change", (el as HTMLInputElement).checked),
            );
            break;
        case "select":
            el.addEventListener("change", () =>
                onEvent(id, "change", (el as HTMLSelectElement).value),
            );
            break;
        case "input":
        case "number":
        case "slider":
        case "color":
        case "textarea":
            el.addEventListener("input", () =>
                onEvent(id, "change", (el as HTMLInputElement).value),
            );
            break;
        default:
            break;
    }
}