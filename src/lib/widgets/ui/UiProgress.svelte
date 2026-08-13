<script lang="ts">
    import type { UINode } from "$lib/widgets/api/types";
    import { styleStr } from "./style";

    let { node }: { node: UINode } = $props();
    const style = $derived(styleStr(node.style));
    const p = $derived(node.props ?? {});
    const pct = $derived(Math.max(0, Math.min(100, Number(p.value ?? 0))));
    const tone = $derived(String(p.tone ?? "accent")); // accent | success | danger
    const label = $derived(p.label != null ? String(p.label) : pct + "%");
</script>

<div class="sb-progress" {style}>
    <div class="track">
        <div class="fill {tone}" style:width={`${pct}%`}></div>
    </div>
    {#if label}
        <span class="sb-progress-label">{label}</span>
    {/if}
</div>

<style>
    .sb-progress {
        display: flex;
        align-items: center;
        gap: 8px;
        width: 100%;
        min-width: 0;
    }
    .track {
        position: relative;
        flex: 1;
        min-width: 0;
        height: 5px;
        background: var(--border-strong);
        border-radius: 999px;
        overflow: hidden;
    }
    .fill {
        height: 100%;
        border-radius: 999px;
        background: var(--accent);
        transition: width 200ms ease;
    }
    .fill.success {
        background: #2f9e44;
    }
    .fill.danger {
        background: var(--danger);
    }
    .sb-progress-label {
        flex: none;
        font-size: 11px;
        color: var(--text-dim);
        white-space: nowrap;
    }
</style>