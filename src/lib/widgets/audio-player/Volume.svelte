<script lang="ts">
    import { Volume2, VolumeX } from "lucide-svelte";

    let {
        level,
        muted,
        onlevel,
        ontogglemute,
    }: {
        /** 0–1 */
        level: number;
        muted: boolean;
        onlevel: (level: number) => void;
        ontogglemute: () => void;
    } = $props();

    function onInput(e: Event) {
        onlevel(Number((e.target as HTMLInputElement).value));
    }
</script>

<!--
    默认折叠：仅显示喇叭图标（点击=静音切换）。
    悬浮（或键盘聚焦）时在图标上方弹出竖向音量滑块。
-->
<div class="volume">
    <button
        class="mute"
        onclick={ontogglemute}
        aria-label={muted ? "取消静音" : "静音"}
    >
        {#if muted || level === 0}
            <VolumeX size={12} aria-hidden="true" />
        {:else}
            <Volume2 size={12} aria-hidden="true" />
        {/if}
    </button>

    <div class="popover">
        <input
            class="slider"
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={muted ? 0 : level}
            oninput={onInput}
            aria-label="音量"
        />
    </div>
</div>

<style>
    .volume {
        pointer-events: auto;
        position: relative;
        display: flex;
        align-items: center;
    }

    .mute {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 18px;
        height: 18px;
        padding: 0;
        border: none;
        border-radius: 4px;
        background: transparent;
        color: var(--text-muted);
        cursor: pointer;
        transition: color 150ms ease;
    }

    .mute:hover {
        color: var(--text);
    }

    /* 悬浮/聚焦时弹出的竖向音量气泡：紧贴图标上沿（无间隙，避免悬浮中断） */
    .popover {
        position: absolute;
        bottom: 100%;
        left: 50%;
        z-index: 10;
        transform: translateX(-50%);
        padding: 8px 6px 4px;
        display: flex;
        justify-content: center;
        background: var(--bg-input);
        border-radius: 8px;
        box-shadow: inset 0 0 0 1px var(--border-strong);
        opacity: 0;
        visibility: hidden;
        pointer-events: none;
        transition:
            opacity 120ms ease,
            visibility 120ms ease;
    }

    .volume:hover .popover,
    .volume:focus-within .popover {
        opacity: 1;
        visibility: visible;
        pointer-events: auto;
    }

    /* 竖向滑块：min 在下、max 在上 */
    .slider {
        writing-mode: vertical-lr;
        direction: rtl;
        width: 14px;
        height: 76px;
        accent-color: var(--accent);
        cursor: pointer;
    }
</style>
