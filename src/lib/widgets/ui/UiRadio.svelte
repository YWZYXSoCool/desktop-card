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
    const name = $derived(node.on ?? "sb-radio");
</script>

<div class="sb-radio" {style}>
    {#each options as opt (String(opt.value))}
        <label class="sb-radio-item">
            <input
                type="radio"
                name={name}
                value={String(opt.value)}
                checked={String(opt.value) === selected}
                onchange={() => node.on && onEvent?.(node.on, "change", opt.value)}
            />
            <span>{String(opt.label)}</span>
        </label>
    {/each}
</div>

<style>
    .sb-radio {
        display: flex;
        flex-direction: column;
        gap: 6px;
        min-width: 0;
    }
    .sb-radio-item {
        pointer-events: auto;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 12px;
        color: var(--text);
        cursor: pointer;
    }
    .sb-radio-item input[type="radio"] {
        width: 14px;
        height: 14px;
        margin: 0;
        accent-color: var(--accent);
        cursor: pointer;
    }
</style>