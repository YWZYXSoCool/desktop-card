<script lang="ts">
    import type { UINode } from "$lib/widgets/api/types";
    import { styleStr } from "./style";

    let { node }: { node: UINode } = $props();
    const style = $derived(styleStr(node.style));
    const src = $derived(String(node.props?.src ?? ""));
    const size = $derived(Number(node.props?.size ?? 32));
    const alt = $derived(String(node.props?.alt ?? ""));
</script>

<div class="sb-avatar" {style} style:--size={`${size}px`}>
    {#if src}
        <img {src} {alt} loading="lazy" />
    {:else}
        <span class="fallback"></span>
    {/if}
</div>

<style>
    .sb-avatar {
        flex: none;
        width: var(--size);
        height: var(--size);
        border-radius: 50%;
        overflow: hidden;
        background: var(--bg-sunken);
        box-sizing: border-box;
    }
    .sb-avatar img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
    }
    .fallback {
        display: block;
        width: 100%;
        height: 100%;
        background: var(--accent-soft);
    }
</style>