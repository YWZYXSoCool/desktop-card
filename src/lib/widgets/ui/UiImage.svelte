<script lang="ts">
    import type { UINode } from "$lib/widgets/api/types";
    import { styleStr } from "./style";

    let { node }: { node: UINode } = $props();
    const style = $derived(styleStr(node.style));
    const src = $derived(String(node.props?.src ?? ""));
    const alt = $derived(String(node.props?.alt ?? ""));
</script>

<img class="sb-image" {src} {alt} {style} loading="lazy" />

<style>
    .sb-image {
        display: block;
        max-width: 100%;
        border-radius: 6px;
        object-fit: cover;
        background: var(--bg-sunken);
    }
</style>