<script lang="ts">
    import { onDestroy, onMount } from "svelte";
    import { debounce } from "$lib/core/window";
    import type { WidgetContext } from "$lib/widgets/api/types";
    import Controls from "./Controls.svelte";
    import Cover from "./Cover.svelte";
    import Lyrics from "./Lyrics.svelte";
    import PlaylistView from "./PlaylistView.svelte";
    import {
        displayName,
        formatTime,
        player,
    } from "./player.svelte";
    import type { LoopMode } from "./player.svelte";

    // 声明了 store 权限，defineWidget 已注入 ctx.store
    let { ctx }: { ctx: WidgetContext } = $props();

    /** 当前视图：正在播放 / 播放列表。 */
    let view = $state<"now" | "list">("now");

    // 音量/静音在所有控件里共享同一套持久化，合并到一个防抖里写
    const persistVolume = debounce(() => {
        ctx.store!.set("volume.level", player.volume).catch(() => {});
        ctx.store!.set("volume.muted", player.muted).catch(() => {});
    }, 300);

    const persistPlayback = debounce(() => {
        ctx.store!.set("playback.loopMode", player.loopMode).catch(() => {});
        ctx.store!.set("playback.shuffle", player.shuffle).catch(() => {});
        ctx.store!.set("playback.rate", player.playbackRate).catch(() => {});
    }, 300);

    function onVolumeLevel(level: number) {
        player.setVolume(level);
        persistVolume();
    }

    function onToggleMute() {
        player.setMuted(!player.muted);
        persistVolume();
    }

    /** 循环模式循环切换：列表循环 → 单曲循环 → 关闭 → 列表循环。 */
    function onToggleLoop() {
        const order: LoopMode[] = ["all", "one", "off"];
        const next = order[(order.indexOf(player.loopMode) + 1) % order.length];
        player.setLoopMode(next);
        persistPlayback();
    }

    function onToggleShuffle() {
        player.setShuffle(!player.shuffle);
        persistPlayback();
    }

    function onCycleSpeed() {
        player.cycleSpeed();
        persistPlayback();
    }

    function onToggleView() {
        view = view === "now" ? "list" : "now";
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
        persistPlayback.cancel();
    });

    const idle = $derived(player.state === "idle");
    const names = $derived(player.playlist.map(displayName));
    /** 设置页可关掉歌词显示（卡片上没有的配置项）。 */
    const showLyrics = $derived(ctx.settings?.get<boolean>("showLyrics") ?? true);
    const lyricLines = $derived(showLyrics ? player.activeLyrics : []);
</script>

{#if view === "list"}
    <PlaylistView
        names={names}
        currentIndex={player.currentIndex}
        onplay={(i) => player.playIndex(i)}
        onremove={(i) => player.removeAt(i)}
        onclear={() => player.clear()}
        onback={onToggleView}
    />
{:else}
    <Cover
        coverUrl={player.coverUrl}
        {idle}
        onplay={() => player.toggle()}
    />

    <div class="info">
        <Lyrics
            fileName={player.fileName}
            {idle}
            lines={lyricLines}
        />

        <Controls
            playing={player.state === "playing"}
            {idle}
            loopMode={player.loopMode}
            shuffle={player.shuffle}
            rate={player.playbackRate}
            showList={false}
            current={player.currentTime}
            duration={player.duration}
            currentText={formatTime(player.currentTime)}
            durationText={formatTime(player.duration)}
            volume={player.volume}
            muted={player.muted}
            onplay={() => player.toggle()}
            onprev={() => player.prev()}
            onnext={() => player.next()}
            onloop={onToggleLoop}
            onshuffle={onToggleShuffle}
            onrate={onCycleSpeed}
            onplaylist={onToggleView}
            onseek={(t) => player.seek(t)}
            onvolume={onVolumeLevel}
            ontogglemute={onToggleMute}
        />
    </div>
{/if}

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