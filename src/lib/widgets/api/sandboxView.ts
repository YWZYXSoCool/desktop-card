import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { mount, unmount } from "svelte";
import UiNode from "$lib/widgets/ui/UiNode.svelte";
import type { UINode, WidgetContext, WidgetRenderer } from "./types";

/** 沙箱交互回调：`(eventId, type, data)` → 宿主转发给沙箱 handleEvent。 */
type EventHandler = (id: string, type: string, data: unknown) => void;

/**
 * 沙箱 widget 渲染器：`mount(container)` 后调沙箱 `render()` 取 JSON 树，
 * 用 Svelte `UiNode` 组件库水合为真实 DOM（与内置 widget 同一套主题变量与观感）；
 * 交互经每个组件的 `onEvent` 回调沙箱 `handleEvent`，随后重调 `render()` 重挂载。
 * 沙箱内无计时器，无法自轮询；凡声明了 `download` 权限的 widget，宿主下载任务
 * 进度变更会发 `widget-progress`（带 handle）事件，这里按 handle 重渲染以刷新进度。
 */
export function sandboxRenderer(handle: number): WidgetRenderer {
    return {
        mount(container: HTMLElement, _ctx: WidgetContext): () => void {
            let disposed = false;
            // 当前挂载的组件句柄（Svelte mount 返回），用于卸载时销毁整棵组件树。
            let root: Record<string, unknown> | null = null;

            const reRender = async () => {
                if (disposed) return;
                try {
                    const tree = await invoke<UINode>("call_widget_sandbox", {
                        handle,
                        method: "render",
                        args: [],
                    });
                    const onEvent: EventHandler = (id, type, data) => {
                        invoke("call_widget_sandbox", {
                            handle,
                            method: "handleEvent",
                            args: [id, type, data],
                        })
                            .then(() => reRender())
                            .catch((e) =>
                                console.error("[widget] handleEvent 失败：", e),
                            );
                    };
                    if (root) unmount(root);
                    root = mount(UiNode, {
                        target: container,
                        props: { node: tree, onEvent },
                    }) as Record<string, unknown>;
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

            // 数据总线：把 `widget-bus` 消息推给沙箱 `dispatchBus`（触发 ctx.bus.on 回调），
            // 随后重渲染以反映状态变化。request/reply 协议下，每条消息阻塞在该沙箱 worker，
            // 串行处理即可避免并发重渲染。
            const unlistenBusPromise = listen<{
                channel: string;
                payload: unknown;
            }>("widget-bus", (e) => {
                invoke("call_widget_sandbox", {
                    handle,
                    method: "dispatchBus",
                    args: [e.payload.channel, e.payload.payload],
                })
                    .then(() => reRender())
                    .catch((err) =>
                        console.error("[widget] dispatchBus 失败：", err),
                    );
            });

            reRender();

            return () => {
                disposed = true;
                if (root) {
                    unmount(root);
                    root = null;
                }
                container.replaceChildren();
                unlistenPromise.then((unlisten) => unlisten()).catch(() => {});
                unlistenBusPromise
                    .then((unlisten) => unlisten())
                    .catch(() => {});
            };
        },
    };
}