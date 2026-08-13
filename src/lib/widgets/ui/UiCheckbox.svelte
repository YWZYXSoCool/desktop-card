<script lang="ts">
    import type { UINode } from "$lib/widgets/api/types";
    import { styleStr, type EventCb } from "./style";

    let { node, onEvent }: { node: UINode; onEvent?: EventCb } = $props();
    const style = $derived(styleStr(node.style));
    const checked = $derived(Boolean(node.props?.checked));
    const label = $derived(String(node.props?.label ?? ""));
</script>

<label class="sb-checkbox" {style}>
    <input
        type="checkbox"
        checked={checked}
        onchange={(e) =>
            node.on && onEvent?.(node.on, "change", (e.target as HTMLInputElement).checked)
        }
    />
    {#if label}<span class="sb-checkbox-label">{label}</span>{/if}
</label>

<style>
    .sb-checkbox {
        pointer-events: auto;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 12px;
        color: var(--text);
        cursor: pointer;
    }
    .sb-checkbox input[type="checkbox"] {
        width: 14px;
        height: 14px;
        margin: 0;
        accent-color: var(--accent);
        cursor: pointer;
    }
    .sb-checkbox-label {
        line-height: 1.4;
    }
</style>