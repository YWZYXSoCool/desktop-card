<script lang="ts">
    import type { UINode } from "$lib/widgets/api/types";
    import UiNode from "./UiNode.svelte";
    import { styleStr, type EventCb } from "./style";

    let { node, onEvent }: { node: UINode; onEvent?: EventCb } = $props();
    const style = $derived(styleStr(node.style));
    const label = $derived(String(node.props?.label ?? ""));
    const hint = $derived(node.props?.hint != null ? String(node.props.hint) : "");
</script>

<label class="sb-field" {style}>
    {#if label}<span class="sb-field-label">{label}</span>{/if}
    <span class="sb-field-control">
        {#each node.children ?? [] as child (child)}
            <UiNode node={child} onEvent={onEvent} />
        {/each}
    </span>
    {#if hint}<span class="sb-field-hint">{hint}</span>{/if}
</label>

<style>
    .sb-field {
        display: flex;
        flex-direction: column;
        gap: 4px;
        min-width: 0;
    }
    .sb-field-label {
        font-size: 11px;
        font-weight: 600;
        color: var(--text-soft);
    }
    .sb-field-control {
        display: flex;
        flex-direction: column;
        gap: 4px;
        min-width: 0;
    }
    .sb-field-hint {
        font-size: 11px;
        color: var(--text-dim);
    }
</style>