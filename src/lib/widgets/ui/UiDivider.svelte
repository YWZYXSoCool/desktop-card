<script lang="ts">
    import type { UINode } from "$lib/widgets/api/types";
    import { styleStr } from "./style";

    let { node }: { node: UINode } = $props();
    const style = $derived(styleStr(node.style));
    const label = $derived(String(node.props?.label ?? ""));
</script>

{#if label}
    <div class="sb-divider with-label" {style}>
        <span class="line"></span>
        <span class="label">{label}</span>
        <span class="line"></span>
    </div>
{:else}
    <div class="sb-divider" {style}><span class="line"></span></div>
{/if}

<style>
    .sb-divider {
        display: flex;
        align-items: center;
        gap: 8px;
        width: 100%;
        flex: none;
    }
    .sb-divider .line {
        height: 1px;
        flex: 1;
        background: var(--border-strong);
    }
    .sb-divider .label {
        font-size: 11px;
        color: var(--text-dim);
        white-space: nowrap;
    }
</style>