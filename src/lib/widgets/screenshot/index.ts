import manifest from "./widget.json";
import ScreenshotCard from "./ScreenshotCard.svelte";
import { defineWidget } from "$lib/widgets/api/defineWidget";
import type { WidgetManifest } from "$lib/widgets/api/types";

/**
 * 截图 widget：卡片上提供「截图」按钮（框选区域）+ 最近截图缩略图列表。
 * 中键菜单里的「截图」项由宿主（Rust show_card_menu）固定提供，无需在本 widget 注册，
 * 避免重复。保存后的新截图经 `screenshot/new` 总线广播触发本卡片刷新。
 */
export const definition = defineWidget({
    manifest: manifest as unknown as WidgetManifest,
    component: ScreenshotCard,
});