<script lang="ts">
    import type { UINode } from "$lib/widgets/api/types";
    import { styleStr, type EventCb } from "./style";

    let { node, onEvent }: { node: UINode; onEvent?: EventCb } = $props();
    const style = $derived(styleStr(node.style));
    const p = $derived(node.props ?? {});
</script>

<input
    class="sb-slider"
    {style}
    type="range"
    min={p.min != null ? String(p.min) : "0"}
    max={p.max != null ? String(p.max) : "100"}
    step={p.step != null ? String(p.step) : "1"}
    value={String(p.value ?? 0)}
    oninput={(e) =>
        node.on && onEvent?.(node.on, "change", (e.target as HTMLInputElement).value)
    }
/>

<style>
    .sb-slider {
        pointer-events: auto;
        box-sizing: border-box;
        min-width: 0;
        height: 18px;
        margin: 0;
        accent-color: var(--accent);
        cursor: pointer;
    }
</style>