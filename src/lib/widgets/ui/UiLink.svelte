<script lang="ts">
    import type { UINode } from "$lib/widgets/api/types";
    import { styleStr, type EventCb } from "./style";

    let { node, onEvent }: { node: UINode; onEvent?: EventCb } = $props();
    const style = $derived(styleStr(node.style));
    const value = $derived(String(node.props?.value ?? node.props?.label ?? ""));
</script>

<button
    type="button"
    class="sb-link"
    {style}
    onclick={() => node.on && onEvent?.(node.on, "click", {})}
>
    {value}
</button>

<style>
    .sb-link {
        pointer-events: auto;
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 0;
        font-size: 12px;
        font-family: inherit;
        color: var(--accent-text);
        background: none;
        border: none;
        cursor: pointer;
        text-decoration: none;
        transition: text-decoration 120ms ease;
    }
    .sb-link:hover {
        text-decoration: underline;
    }
</style>