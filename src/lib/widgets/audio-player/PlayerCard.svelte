<script lang="ts">
    import { onDestroy, onMount } from "svelte";
    import { debounce } from "$lib/core/window";
    import type { WidgetContext } from "$lib/widgets/api/types";
    import Controls from "./Controls.svelte";
    import Cover from "./Cover.svelte";
    import Lyrics from "./Lyrics.svelte";
    import { formatTime, player } from "./player.svelte";

    // 声明了 store 权限，defineWidget 已注入 ctx.store
    let { ctx }: { ctx: WidgetContext } = $props();

    // 音量/静音在所有控件里共享同一套持久化，合并到一个防抖里写
    const persistVolume = debounce(() => {
        ctx.store!.set("volume.level", player.volume).catch(() => {});
        ctx.store!.set("volume.muted", player.muted).catch(() => {});
    }, 300);

    const persistLoop = debounce(() => {
        ctx.store!.set("playback.loop", player.loop).catch(() => {});
    }, 300);

    function onVolumeLevel(level: number) {
        player.setVolume(level);
        persistVolume();
    }

    function onToggleMute() {
        player.setMuted(!player.muted);
        persistVolume();
    }

    /** 循环播放切换：播完暂停 ↔ 循环重播，状态持久化。 */
    function onToggleLoop() {
        player.setLoop(!player.loop);
        persistLoop();
    }

    onMount(() => {
        // 空格：播放 / 暂停。本 widget 激活期间生效；输入框/搜索聚焦时让位。
        const onKey = (e: KeyboardEvent) => {
            if (e.code !== "Space") return;
            const t = e.target as HTMLElement | null;
            if (
                t &&
                (t.tagName === "INPUT" ||
                    t.tagName === "TEXTAREA" ||
                    t.isContentEditable)
            ) {
                return;
            }
            e.preventDefault();
            if (!e.repeat) player.toggle();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    });

    onDestroy(() => {
        persistVolume.cancel();
        persistLoop.cancel();
    });

    const idle = $derived(player.state === "idle");
</script>

<Cover
    coverUrl={player.coverUrl}
    {idle}
    onplay={() => player.toggle()}
/>

<div class="info">
    <Lyrics
        fileName={player.fileName}
        {idle}
        lines={player.activeLyrics}
    />

    <Controls
        playing={player.state === "playing"}
        {idle}
        loop={player.loop}
        current={player.currentTime}
        duration={player.duration}
        currentText={formatTime(player.currentTime)}
        durationText={formatTime(player.duration)}
        volume={player.volume}
        muted={player.muted}
        onplay={() => player.toggle()}
        onloop={onToggleLoop}
        onseek={(t) => player.seek(t)}
        onvolume={onVolumeLevel}
        ontogglemute={onToggleMute}
    />
</div>

<style>
    .info {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 6px;
        /* 顶部给关闭按钮让位 */
        padding-top: 2px;
    }
</style>