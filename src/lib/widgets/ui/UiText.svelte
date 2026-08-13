<script lang="ts">
    import type { UINode } from "$lib/widgets/api/types";
    import { styleStr } from "./style";

    let { node }: { node: UINode } = $props();
    const style = $derived(styleStr(node.style));
    const value = $derived(String(node.props?.value ?? node.props?.label ?? ""));
</script>

<span class="sb-text" {style}>{value}</span>

<style>
    .sb-text {
        color: var(--text);
        font-size: 12px;
        line-height: 1.4;
        white-space: pre-wrap;
        word-break: break-word;
    }
</style>