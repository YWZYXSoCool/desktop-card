<script lang="ts">
    import { onDestroy, onMount } from "svelte";
    import { Music2, Pause, Play, Repeat } from "lucide-svelte";
    import { debounce } from "$lib/core/window";
    import type { WidgetContext } from "$lib/widgets/api/types";
    import Progress from "./Progress.svelte";
    import Volume from "./Volume.svelte";
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

<button
    class="cover"
    class:idle
    onclick={() => player.toggle()}
    disabled={idle}
    aria-label="播放或暂停"
>
    {#if player.coverUrl}
        <img class="cover-img" src={player.coverUrl} alt="专辑封面" />
    {:else}
        <Music2 size={26} strokeWidth={1.5} aria-hidden="true" />
    {/if}
</button>

<div class="info">
    <div class="meta">
        <div class="name" class:idle>
            {idle ? "拖入音频以播放" : player.fileName}
        </div>

        {#if player.activeLyrics.length}
            <div class="lyric">
                {#each player.activeLyrics as line}
                    <!-- 歌词已用 overflow-wrap 完整换行显示，无需 title 悬停提示；
                         原生 tooltip 会在悬停时弹出并盖住滚动中的歌词，故移除。 -->
                    <div class="lyric-line">{line}</div>
                {/each}
            </div>
        {/if}
    </div>

    <Progress
        current={player.currentTime}
        duration={player.duration}
        onseek={(t) => player.seek(t)}
    />

    <div class="controls">
        <button
            class="play"
            onclick={() => player.toggle()}
            disabled={idle}
            aria-label={player.state === "playing" ? "暂停" : "播放"}
        >
            {#if player.state === "playing"}
                <Pause size={12} fill="currentColor" aria-hidden="true" />
            {:else}
                <Play size={12} fill="currentColor" aria-hidden="true" />
            {/if}
        </button>

        <span class="time">
            {formatTime(player.currentTime)}
            <span class="sep">/</span>
            {formatTime(player.duration)}
        </span>

        <button
            class="loop"
            class:on={player.loop}
            onclick={onToggleLoop}
            aria-pressed={player.loop}
            aria-label={player.loop ? "关闭循环播放" : "开启循环播放"}
        >
            <Repeat size={12} aria-hidden="true" />
        </button>

        <div class="spacer"></div>

        <Volume
            level={player.volume}
            muted={player.muted}
            onlevel={onVolumeLevel}
            ontogglemute={onToggleMute}
        />
    </div>
</div>

<style>
    .cover {
        pointer-events: auto;
        flex: none;
        width: 64px;
        height: 64px;
        margin-top: 4px;
        display: flex;
        align-items: center;
        justify-content: center;
        border: none;
        border-radius: 8px;
        background: var(--bg-input);
        color: var(--accent);
        cursor: pointer;
        transition:
            background 150ms ease,
            color 150ms ease;
    }

    .cover:hover:not(:disabled) {
        background: var(--bg-input-focus);
    }

    .cover.idle {
        color: var(--text-muted);
        cursor: default;
    }

    .cover-img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        border-radius: 8px;
    }

    .info {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 6px;
        /* 顶部给关闭按钮让位 */
        padding-top: 2px;
    }

    /* 标题+歌词独占上方弹性区：过长时在此滚动/裁剪，进度条与控件不受影响地固定在底部 */
    .meta {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 2px;
    }

    .name {
        pointer-events: auto;
        font-size: 13px;
        line-height: 1.3;
        color: var(--text);
        /* 过长自动换行而非省略号 */
        overflow-wrap: anywhere;
        overflow: hidden;
        /* 关闭按钮悬浮在右上，给曲名右侧留出空间避免遮挡 */
        padding-right: 16px;
    }

    .name.idle {
        color: var(--text-muted);
    }

    .lyric {
        pointer-events: auto;
        display: flex;
        flex-direction: column;
        gap: 1px;
        /* 与曲名对齐，右侧同样给关闭按钮让位 */
        padding-right: 16px;
    }

    .lyric-line {
        font-size: 11px;
        line-height: 1.3;
        /* 当前正在唱的词句用主题强调色，随主题（accent）变色 */
        color: var(--accent);
        /* 过长自动换行而非省略号 */
        overflow-wrap: anywhere;
        overflow: hidden;
    }

    .controls {
        display: flex;
        align-items: center;
        gap: 6px;
    }

    .play {
        pointer-events: auto;
        flex: none;
        width: 18px;
        height: 18px;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        border: none;
        border-radius: 50%;
        background: transparent;
        color: var(--text);
        cursor: pointer;
        transition: color 150ms ease;
    }

    .play:hover:not(:disabled) {
        color: var(--accent);
    }

    .play:disabled {
        color: var(--text-muted);
        opacity: 0.5;
        cursor: default;
    }

    .time {
        font-size: 11px;
        color: var(--text);
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
    }

    .time .sep {
        color: var(--text-muted);
        margin: 0 1px;
    }

    .loop {
        pointer-events: auto;
        flex: none;
        width: 18px;
        height: 18px;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        border: none;
        border-radius: 50%;
        background: transparent;
        color: var(--text-muted);
        cursor: pointer;
        transition: color 150ms ease;
    }

    .loop:hover {
        color: var(--text);
    }

    /* 循环开启：用主题蓝常亮标示状态 */
    .loop.on {
        color: var(--accent);
    }

    .loop.on:hover {
        color: var(--accent-2);
    }

    .spacer {
        flex: 1;
    }
</style>