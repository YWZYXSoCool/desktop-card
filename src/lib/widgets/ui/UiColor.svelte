<script lang="ts">
    import type { UINode } from "$lib/widgets/api/types";
    import { styleStr, type EventCb } from "./style";

    let { node, onEvent }: { node: UINode; onEvent?: EventCb } = $props();
    const style = $derived(styleStr(node.style));
    const value = $derived(String(node.props?.value ?? "#000000"));
</script>

<input
    class="sb-color"
    {style}
    type="color"
    value={value}
    oninput={(e) =>
        node.on && onEvent?.(node.on, "change", (e.target as HTMLInputElement).value)
    }
/>

<style>
    .sb-color {
        pointer-events: auto;
        flex: none;
        width: 32px;
        height: 24px;
        padding: 0;
        background: var(--bg-input);
        border: 1px solid transparent;
        border-radius: 6px;
        cursor: pointer;
    }
    .sb-color:focus {
        border-color: var(--accent);
    }
</style>