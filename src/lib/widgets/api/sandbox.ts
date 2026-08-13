import { invoke } from "@tauri-apps/api/core";
import type { WidgetDefinition, WidgetManifest } from "./types";
import { sandboxRenderer } from "./sandboxView";

/**
 * 为外部 widget 创建一个走 QuickJS 沙箱的 `WidgetDefinition`。
 * 所有逻辑都在沙箱内执行；宿主只负责：创建沙箱（拿到 handle）、转发调用、
 * 运水合渲染（见 sandboxView）。
 */
export async function createSandboxWidget(
    dir: string,
    manifest: WidgetManifest,
): Promise<WidgetDefinition> {
    const handle = await invoke<number>("create_widget_sandbox", {
        dir,
        manifest,
    });

    const call = (method: string, args: unknown[] = []): Promise<void> =>
        invoke("call_widget_sandbox", { handle, method, args });

    return {
        manifest,
        render: sandboxRenderer(handle),
        setup: () => call("setup"),
        onSettingChange: (key, value) => call("onSettingChange", [key, value]),
        onDrop: (paths) => call("onDrop", [paths]),
    };
}