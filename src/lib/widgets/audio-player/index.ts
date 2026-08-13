import manifest from "./widget.json";
import PlayerCard from "./PlayerCard.svelte";
import { DEFAULT_VOLUME, isSupportedAudio, player } from "./player.svelte";
import { defineWidget } from "$lib/widgets/api/defineWidget";
import type { WidgetContext, WidgetManifest } from "$lib/widgets/api/types";

/** 启动时：绑定持久化 store，恢复音量/静音/循环/上次播放文件（不自动出声）。 */
async function setup(ctx: WidgetContext): Promise<void> {
    const store = ctx.store!; // widget.json 已声明 store 权限
    player.bindStore(store);
    player.bindToast(ctx.toast!); // widget.json 已声明 toast 权限
    const [volume, muted, loop, lastFile] = await Promise.all([
        store.get<number>("volume.level", DEFAULT_VOLUME),
        store.get<boolean>("volume.muted", false),
        store.get<boolean>("playback.loop", false),
        store.get<string>("player.lastFile", ""),
    ]);
    player.applyStored(volume, muted, loop);
    if (lastFile && player.state === "idle") {
        player.load(lastFile, false);
    }
}

function onDrop(path: string): void {
    if (isSupportedAudio(path)) player.load(path);
}

export const definition = defineWidget({
    manifest: manifest as unknown as WidgetManifest,
    component: PlayerCard,
    setup,
    onDrop,
});