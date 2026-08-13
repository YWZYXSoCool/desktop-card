import manifest from "./widget.json";
import ColorPage from "./ColorPage.svelte";
import { defineWidget } from "$lib/widgets/api/defineWidget";
import { setActiveWidget } from "$lib/widgets/registry.svelte";
import type { WidgetContext, WidgetManifest } from "$lib/widgets/api/types";
import { requestColorPick } from "./pickSignal.svelte";

/**
 * 注册中键菜单「取色」项（与其它 widget 功能统一，由 widget 自己声明）。
 * 点击后切到颜色 widget 并经信号桥请求取色，ColorPage 挂载后消费并调起吸管。
 */
function setup(ctx: WidgetContext): void {
    ctx.menu?.add("取色", () => {
        setActiveWidget("color-picker");
        requestColorPick();
    });
}

export const definition = defineWidget({
    manifest: manifest as unknown as WidgetManifest,
    component: ColorPage,
    setup,
});