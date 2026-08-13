<script lang="ts">
    import { Pipette } from "lucide-svelte";

    interface Props {
        /** 当前色 HEX（容器算好下传）。 */
        hex: string;
        picking: boolean;
        unsupported: boolean;
        onpick: () => void;
    }

    let { hex, picking, unsupported, onpick }: Props = $props();
</script>

<div class="top">
    <div class="swatch" style:background={hex}></div>
    <button
        type="button"
        class="pick"
        onclick={onpick}
        disabled={picking}
        aria-label="从屏幕取色"
        aria-busy={picking}
    >
        <Pipette size={13} aria-hidden="true" />
    </button>
</div>

{#if unsupported}
    <div class="unsupported">当前环境不支持屏幕取色</div>
{/if}

<style>
    .top {
        display: flex;
        align-items: center;
        gap: 10px;
    }

    .swatch {
        flex: 1;
        height: 40px;
        border-radius: 6px;
        border: 1px solid var(--border-strong);
    }

    .pick {
        pointer-events: auto;
        width: 28px;
        height: 28px;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        border: 1px solid var(--border-strong);
        border-radius: 6px;
        background: transparent;
        color: var(--text);
        cursor: pointer;
        transition:
            background 150ms ease,
            border-color 150ms ease,
            color 150ms ease;
    }

    .pick:hover:not(:disabled) {
        background: var(--accent-soft);
        border-color: var(--accent);
        color: var(--accent-text);
    }

    .pick:disabled {
        opacity: 0.6;
        cursor: default;
    }

    .unsupported {
        font-size: 12px;
        color: var(--accent-text);
        background: var(--accent-soft);
        padding: 6px 10px;
        border-radius: 6px;
    }
</style>