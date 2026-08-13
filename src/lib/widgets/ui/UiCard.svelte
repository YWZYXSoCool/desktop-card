<script lang="ts">
    import type { UINode } from "$lib/widgets/api/types";
    import UiNode from "./UiNode.svelte";
    import { styleStr, type EventCb } from "./style";

    let { node, onEvent }: { node: UINode; onEvent?: EventCb } = $props();
    const style = $derived(styleStr(node.style));
    const title = $derived(String(node.props?.title ?? ""));
    const padding = $derived(String(node.props?.padding ?? "10px"));
    const tone = $derived(String(node.props?.tone ?? "default")); // default | accent | sunken
</script>

<section class="sb-card {tone}" style:--pad={padding} {style}>
    {#if title}
        <header class="sb-card-title">{title}</header>
    {/if}
    <div class="sb-card-body">
        {#each node.children ?? [] as child (child)}
            <UiNode node={child} onEvent={onEvent} />
        {/each}
    </div>
</section>

<style>
    .sb-card {
        box-sizing: border-box;
        min-width: 0;
        padding: var(--pad);
        background: var(--bg-2);
        border: 1px solid var(--border);
        border-radius: 8px;
    }
    .sb-card.accent {
        background: var(--accent-soft);
        border-color: transparent;
    }
    .sb-card.sunken {
        background: var(--bg-sunken);
        border-color: transparent;
    }
    .sb-card-title {
        margin-bottom: 8px;
        font-size: 12px;
        font-weight: 600;
        color: var(--text-soft);
    }
    .sb-card-body {
        display: flex;
        flex-direction: column;
        gap: 8px;
        min-width: 0;
    }
</style>