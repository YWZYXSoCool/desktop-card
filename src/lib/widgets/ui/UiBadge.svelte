<script lang="ts">
    import type { UINode } from "$lib/widgets/api/types";
    import { styleStr } from "./style";

    let { node }: { node: UINode } = $props();
    const style = $derived(styleStr(node.style));
    const value = $derived(String(node.props?.value ?? node.props?.label ?? ""));
    const tone = $derived(String(node.props?.tone ?? "neutral")); // neutral|accent|success|danger|info
</script>

<span class="sb-badge {tone}" {style}>{value}</span>

<style>
    .sb-badge {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        flex: none;
        padding: 1px 8px;
        font-size: 11px;
        line-height: 1.5;
        font-weight: 500;
        border-radius: 999px;
        white-space: nowrap;
        color: var(--text-soft);
        background: var(--hover);
    }
    .sb-badge.accent {
        color: var(--accent-text);
        background: var(--accent-soft);
    }
    .sb-badge.success {
        color: #2f9e44;
        background: rgba(47, 158, 68, 0.16);
    }
    .sb-badge.danger {
        color: var(--danger);
        background: var(--accent-soft);
    }
    .sb-badge.info {
        color: var(--accent-text);
        background: var(--accent-soft-2);
    }
</style>