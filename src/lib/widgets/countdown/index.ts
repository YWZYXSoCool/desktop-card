import manifest from "./widget.json";
import CountdownCard from "./CountdownCard.svelte";
import { countdown } from "./countdown.svelte";
import { defineWidget } from "$lib/widgets/api/defineWidget";
import type { WidgetContext, WidgetManifest } from "$lib/widgets/api/types";

// 启动时恢复持久化的目标日期与名称（至组件，组件负责后续读写持久化）
async function setup(ctx: WidgetContext): Promise<void> {
    const target = await ctx.store!.get<string | null>("countdown.target", null);
    const name = await ctx.store!.get<string>("countdown.name", "");
    countdown.load(target, name);
}

export const definition = defineWidget({
    manifest: manifest as unknown as WidgetManifest,
    component: CountdownCard,
    setup,
});