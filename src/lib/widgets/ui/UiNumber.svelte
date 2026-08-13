<script lang="ts">
    import type { UINode } from "$lib/widgets/api/types";
    import { styleStr, type EventCb } from "./style";

    let { node, onEvent }: { node: UINode; onEvent?: EventCb } = $props();
    const style = $derived(styleStr(node.style));
    const p = $derived(node.props ?? {});
</script>

<input
    class="sb-input"
    {style}
    type="number"
    value={String(p.value ?? "")}
    min={p.min != null ? String(p.min) : undefined}
    max={p.max != null ? String(p.max) : undefined}
    step={p.step != null ? String(p.step) : undefined}
    oninput={(e) =>
        node.on && onEvent?.(node.on, "change", (e.target as HTMLInputElement).value)
    }
/>

<style>
    .sb-input {
        pointer-events: auto;
        box-sizing: border-box;
        min-width: 0;
        padding: 4px 8px;
        font-size: 12px;
        font-family: inherit;
        color: var(--text);
        background: var(--bg-input);
        border: 1px solid transparent;
        border-radius: 6px;
        outline: none;
        transition:
            background 150ms ease,
            border-color 150ms ease;
    }
    .sb-input:focus {
        border-color: var(--accent);
        background: var(--bg-input-focus);
    }
</style>