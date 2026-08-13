<script lang="ts">
    import { RotateCcw } from "lucide-svelte";
    import { cubicOut } from "svelte/easing";
    import { scale } from "svelte/transition";
    import type { Remain } from "./countdown.svelte";

    interface Props {
        name: string;
        /** 剩余时间（含 done 标记）。 */
        remain: Remain;
        onreset: () => void;
    }

    let { name, remain, onreset }: Props = $props();
</script>

<div class="live">
    <div class="name">{name || "倒计时"}</div>
    <div class="big">
        <span class="days">{remain.days}</span>
        <span class="unit">天</span>
        {#if !remain.done}
            <!-- 每秒 key 重建 → 微缩放脉冲，模拟倒计时的“滴答”感 -->
            {#key remain.seconds}
                <span
                    class="hms"
                    in:scale={{ start: 1.05, duration: 140, easing: cubicOut }}
                    >{String(remain.hours).padStart(2, "0")}:{String(
                        remain.minutes,
                    ).padStart(2, "0")}:{String(remain.seconds).padStart(2, "0")}</span
                >
            {/key}
        {/if}
    </div>
    <button
        type="button"
        class="reset"
        onclick={onreset}
        aria-label="重置倒计时"
        title="重置倒计时"
    >
        <RotateCcw size={12} aria-hidden="true" />
    </button>
</div>

<style>
    .live {
        position: relative;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
        width: 100%;
    }

    .name {
        font-size: 12px;
        color: var(--text-muted);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 100%;
        padding: 0 22px;
    }

    .big {
        display: flex;
        align-items: baseline;
        gap: 2px;
        font-variant-numeric: tabular-nums;
    }

    .days {
        font-size: 40px;
        font-weight: 600;
        line-height: 1;
        color: var(--text);
    }

    .unit {
        font-size: 14px;
        color: var(--text-muted);
        margin-left: 2px;
    }

    .hms {
        font-size: 16px;
        color: var(--text-soft);
        margin-left: 6px;
    }

    .reset {
        pointer-events: auto;
        position: absolute;
        right: 2px;
        top: 2px;
        width: 20px;
        height: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        border: none;
        border-radius: 5px;
        background: transparent;
        color: var(--text-muted);
        cursor: pointer;
        transition:
            color 150ms ease,
            background 150ms ease;
    }

    .reset:hover {
        color: var(--danger);
        background: var(--hover);
    }

    .reset:active {
        transform: scale(0.85);
    }
</style>