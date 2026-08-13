<script lang="ts">
    import type { UINode } from "$lib/widgets/api/types";
    import { styleStr, type EventCb } from "./style";

    let { node, onEvent }: { node: UINode; onEvent?: EventCb } = $props();
    const style = $derived(styleStr(node.style));
    const options = $derived(
        (node.props?.options as
            | Array<{ label: string; value: string | number }>
            | undefined) ?? [],
    );
    const selected = $derived(
        node.props?.value != null ? String(node.props.value) : "",
    );
</script>

<select
    class="sb-select"
    {style}
    value={selected}
    onchange={(e) =>
        node.on && onEvent?.(node.on, "change", (e.target as HTMLSelectElement).value)
    }
>
    {#each options as opt (String(opt.value))}
        <option value={String(opt.value)}>{String(opt.label)}</option>
    {/each}
</select>

<style>
    .sb-select {
        pointer-events: auto;
        box-sizing: border-box;
        min-width: 0;
        padding: 4px 6px;
        font-size: 12px;
        font-family: inherit;
        color: var(--text);
        background: var(--bg-input);
        border: 1px solid transparent;
        border-radius: 6px;
        outline: none;
        cursor: pointer;
        transition:
            background 150ms ease,
            border-color 150ms ease;
    }
    .sb-select:focus {
        border-color: var(--accent);
        background: var(--bg-input-focus);
    }
</style>