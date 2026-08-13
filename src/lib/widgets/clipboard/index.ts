import manifest from "./widget.json";
import ClipboardCard from "./ClipboardCard.svelte";
import { clipboard } from "./clipboard.svelte";
import { defineWidget } from "$lib/widgets/api/defineWidget";
import type { WidgetManifest } from "$lib/widgets/api/types";

export const definition = defineWidget({
    manifest: manifest as unknown as WidgetManifest,
    component: ClipboardCard,
    // 启动即拉起历史并订阅宿主广播（幂等），避免未挂载期间漏收剪贴板变化
    setup: () => clipboard.init(),
});