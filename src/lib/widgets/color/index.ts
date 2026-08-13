import manifest from "./widget.json";
import ColorPage from "./ColorPage.svelte";
import { defineWidget } from "$lib/widgets/api/defineWidget";
import { setActiveWidget } from "$lib/widgets/registry.svelte";
import type {
    WidgetContext,
    WidgetManifest,
    WidgetSetting,
} from "$lib/widgets/api/types";
import { requestColorPick } from "./pickSignal.svelte";

/** 取色配置：取色后是否自动复制（以及用哪种格式）。 */
const settings: WidgetSetting[] = [
    { type: "section", name: "取色" },
    {
        key: "color.copyFormat",
        label: "取色后自动复制",
        type: "select",
        default: "none",
        options: [
            { label: "不自动复制", value: "none" },
            { label: "HEX", value: "hex" },
            { label: "RGB", value: "rgb" },
            { label: "HSL", value: "hsl" },
        ],
    },
];

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
    settings,
    component: ColorPage,
    setup,
});