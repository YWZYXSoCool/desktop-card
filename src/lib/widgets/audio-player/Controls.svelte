<script lang="ts">
    import {
        ListMusic,
        Pause,
        Play,
        Repeat,
        Repeat1,
        Shuffle,
        SkipBack,
        SkipForward,
    } from "lucide-svelte";
    import type { LoopMode } from "./player.svelte";
    import Progress from "./Progress.svelte";
    import Volume from "./Volume.svelte";

    interface Props {
        playing: boolean;
        idle: boolean;
        loopMode: LoopMode;
        shuffle: boolean;
        /** 倍速（如 1 / 1.5），按钮显示 `${rate}x`。 */
        rate: number;
        /** 列表视图打开时高亮列表按钮。 */
        showList: boolean;
        /** 当前/总时长秒数（供 Progress 用）。 */
        current: number;
        duration: number;
        /** 已格式化的当前/总时长文本（容器用 formatTime 算好下传）。 */
        currentText: string;
        durationText: string;
        volume: number;
        muted: boolean;
        onplay: () => void;
        onprev: () => void;
        onnext: () => void;
        onloop: () => void;
        onshuffle: () => void;
        onrate: () => void;
        onplaylist: () => void;
        onseek: (t: number) => void;
        onvolume: (l: number) => void;
        ontogglemute: () => void;
    }

    let {
        playing,
        idle,
        loopMode,
        shuffle,
        rate,
        showList,
        current,
        duration,
        currentText,
        durationText,
        volume,
        muted,
        onplay,
        onprev,
        onnext,
        onloop,
        onshuffle,
        onrate,
        onplaylist,
        onseek,
        onvolume,
        ontogglemute,
    }: Props = $props();

    const loopOn = $derived(loopMode !== "off");
    const loopLabel = $derived(
        loopMode === "one" ? "单曲循环" : loopMode === "all" ? "列表循环" : "关闭循环",
    );
</script>

<Progress {current} {duration} {onseek} />

<div class="controls">
    <button class="ic" onclick={onprev} disabled={idle} aria-label="上一首">
        <SkipBack size={11} fill="currentColor" aria-hidden="true" />
    </button>

    <button
        class="play"
        onclick={onplay}
        disabled={idle}
        aria-label={playing ? "暂停" : "播放"}
    >
        {#if playing}
            <Pause size={12} fill="currentColor" aria-hidden="true" />
        {:else}
            <Play size={12} fill="currentColor" aria-hidden="true" />
        {/if}
    </button>

    <button class="ic" onclick={onnext} disabled={idle} aria-label="下一首">
        <SkipForward size={11} fill="currentColor" aria-hidden="true" />
    </button>

    <span class="time">
        {currentText}
        <span class="sep">/</span>
        {durationText}
    </span>

    <div class="spacer"></div>

    <button
        class="ic"
        class:on={shuffle}
        onclick={onshuffle}
        aria-pressed={shuffle}
        aria-label={shuffle ? "关闭随机播放" : "开启随机播放"}
    >
        <Shuffle size={11} aria-hidden="true" />
    </button>

    <button
        class="ic"
        class:on={loopOn}
        onclick={onloop}
        aria-pressed={loopOn}
        aria-label={loopLabel}
        title={loopLabel}
    >
        {#if loopMode === "one"}
            <Repeat1 size={11} aria-hidden="true" />
        {:else}
            <Repeat size={11} aria-hidden="true" />
        {/if}
    </button>

    <button
        class="rate"
        onclick={onrate}
        aria-label="切换播放速度"
        title="播放速度"
    >
        {rate}x
    </button>

    <Volume level={volume} {muted} onlevel={onvolume} {ontogglemute} />

    <button
        class="ic"
        class:on={showList}
        onclick={onplaylist}
        aria-pressed={showList}
        aria-label="播放列表"
    >
        <ListMusic size={11} aria-hidden="true" />
    </button>
</div>

<style>
    .controls {
        display: flex;
        align-items: center;
        gap: 5px;
    }

    .ic,
    .play,
    .rate {
        pointer-events: auto;
        flex: none;
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

    .ic,
    .play {
        width: 18px;
        height: 18px;
    }

    .rate {
        width: auto;
        min-width: 22px;
        height: 16px;
        border-radius: 4px;
        font-size: 9px;
        font-variant-numeric: tabular-nums;
        color: var(--text-muted);
    }

    .ic:hover:not(:disabled),
    .rate:hover,
    .play:hover:not(:disabled) {
        color: var(--text);
    }

    .ic.on {
        color: var(--accent);
    }

    .ic.on:hover {
        color: var(--accent-2);
    }

    .play {
        color: var(--text);
    }

    .play:disabled {
        color: var(--text-muted);
        opacity: 0.5;
        cursor: default;
    }

    .ic:disabled {
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
</style>