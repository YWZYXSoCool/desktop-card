import manifest from "./widget.json";
import PlayerCard from "./PlayerCard.svelte";
import {
    DEFAULT_VOLUME,
    player,
} from "./player.svelte";
import type { LoopMode } from "./player.svelte";
import { defineWidget } from "$lib/widgets/api/defineWidget";
import type {
    WidgetContext,
    WidgetManifest,
    WidgetSetting,
} from "$lib/widgets/api/types";

/** 播放配置（卡片上没有的项，经设置页调整）。 */
const settings: WidgetSetting[] = [
    { type: "section", name: "播放" },
    {
        key: "playback.autoResume",
        label: "启动后自动续播",
        type: "toggle",
        default: false,
    },
    {
        key: "playback.showLyrics",
        label: "显示歌词",
        type: "toggle",
        default: true,
    },
];

/** 启动时：绑定持久化 store，恢复音量/静音/循环模式/随机/倍速/播放列表。 */
async function setup(ctx: WidgetContext): Promise<void> {
    const store = ctx.store!; // widget.json 已声明 store 权限
    player.bindStore(store);
    player.bindToast(ctx.toast!); // widget.json 已声明 toast 权限
    const autoResume = await store.get<boolean>(
        "playback.autoResume",
        false,
    );
    const [volume, muted, loopMode, shuffle, rate, playlist, currentIndex] =
        await Promise.all([
            store.get<number>("volume.level", DEFAULT_VOLUME),
            store.get<boolean>("volume.muted", false),
            store.get<LoopMode>("playback.loopMode", "all"),
            store.get<boolean>("playback.shuffle", false),
            store.get<number>("playback.rate", 1),
            store.get<string[]>("player.playlist", []),
            store.get<number>("player.currentIndex", -1),
        ]);
    player.applyStored(volume, muted, loopMode, shuffle, rate);
    player.restore(playlist, currentIndex, autoResume);
}

/** 拖入多份音频：过滤后加入列表；列表原本空闲则从拖入的第一首开始播。 */
function onDrop(paths: string[]): void {
    player.addFiles(paths);
}

export const definition = defineWidget({
    manifest: manifest as unknown as WidgetManifest,
    settings,
    component: PlayerCard,
    setup,
    onDrop,
});