<script lang="ts">
    import { Pause, Play, Repeat } from "lucide-svelte";
    import Progress from "./Progress.svelte";
    import Volume from "./Volume.svelte";

    interface Props {
        playing: boolean;
        idle: boolean;
        loop: boolean;
        /** 当前/总时长秒数（供 Progress 用）。 */
        current: number;
        duration: number;
        /** 已格式化的当前/总时长文本（容器用 formatTime 算好下传）。 */
        currentText: string;
        durationText: string;
        volume: number;
        muted: boolean;
        onplay: () => void;
        onloop: () => void;
        onseek: (t: number) => void;
        onvolume: (l: number) => void;
        ontogglemute: () => void;
    }

    let {
        playing,
        idle,
        loop,
        current,
        duration,
        currentText,
        durationText,
        volume,
        muted,
        onplay,
        onloop,
        onseek,
        onvolume,
        ontogglemute,
    }: Props = $props();
</script>

<Progress {current} {duration} {onseek} />

<div class="controls">
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

    <span class="time">
        {currentText}
        <span class="sep">/</span>
        {durationText}
    </span>

    <button
        class="loop"
        class:on={loop}
        onclick={onloop}
        aria-pressed={loop}
        aria-label={loop ? "关闭循环播放" : "开启循环播放"}
    >
        <Repeat size={12} aria-hidden="true" />
    </button>

    <div class="spacer"></div>

    <Volume
        level={volume}
        {muted}
        onlevel={onvolume}
        {ontogglemute}
    />
</div>

<style>
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