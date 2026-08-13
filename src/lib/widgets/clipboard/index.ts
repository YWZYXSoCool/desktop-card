import manifest from "./widget.json";
import ClipboardCard from "./ClipboardCard.svelte";
import { clipboard } from "./clipboard.svelte";
import { defineWidget } from "$lib/widgets/api/defineWidget";
import type { WidgetManifest, WidgetSetting } from "$lib/widgets/api/types";

/** 显示偏好（卡片上没有的配置项）。文本恒显示；图片/文件条目可关。 */
const settings: WidgetSetting[] = [
    { type: "section", name: "显示" },
    {
        key: "clipboard.showImages",
        label: "显示图片条目",
        type: "toggle",
        default: true,
    },
    {
        key: "clipboard.showFiles",
        label: "显示文件条目",
        type: "toggle",
        default: true,
    },
];

export const definition = defineWidget({
    manifest: manifest as unknown as WidgetManifest,
    settings,
    component: ClipboardCard,
    // 启动即拉起历史并订阅宿主广播（幂等），避免未挂载期间漏收剪贴板变化
    setup: () => clipboard.init(),
});