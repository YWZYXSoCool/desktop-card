<script lang="ts">
    import type { UINode } from "$lib/widgets/api/types";
    import { styleStr, type EventCb } from "./style";

    let { node, onEvent }: { node: UINode; onEvent?: EventCb } = $props();
    const style = $derived(styleStr(node.style));
    const label = $derived(String(node.props?.label ?? ""));
    const tone = $derived(String(node.props?.tone ?? "accent")); // accent | ghost | danger
</script>

<button
    type="button"
    class="sb-btn {tone}"
    {style}
    onclick={() => node.on && onEvent?.(node.on, "click", {})}
>
    {label}
</button>

<style>
    .sb-btn {
        pointer-events: auto;
        flex: none;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 4px;
        padding: 4px 10px;
        font-size: 12px;
        line-height: 1.4;
        color: var(--on-accent);
        background: var(--accent);
        border: none;
        border-radius: 6px;
        cursor: pointer;
        white-space: nowrap;
        transition:
            background 150ms ease,
            transform 120ms ease,
            color 150ms ease;
    }
    .sb-btn:hover {
        background: var(--accent-2);
    }
    .sb-btn:active {
        transform: scale(0.94);
    }
    .sb-btn.ghost {
        color: var(--text);
        background: var(--hover);
    }
    .sb-btn.ghost:hover {
        background: var(--hover-strong);
        color: var(--text);
    }
    .sb-btn.danger {
        background: var(--danger);
    }
    .sb-btn.danger:hover {
        background: var(--danger);
        filter: brightness(1.1);
    }
</style>