<script lang="ts">
    import type { UINode } from "$lib/widgets/api/types";
    import { styleStr, type EventCb } from "./style";

    let { node, onEvent }: { node: UINode; onEvent?: EventCb } = $props();
    const style = $derived(styleStr(node.style));
    const placeholder = $derived(String(node.props?.placeholder ?? ""));
</script>

<textarea
    class="sb-textarea"
    {style}
    value={String(node.props?.value ?? "")}
    {placeholder}
    spellcheck="false"
    oninput={(e) =>
        node.on && onEvent?.(node.on, "change", (e.target as HTMLTextAreaElement).value)
    }
></textarea>

<style>
    .sb-textarea {
        pointer-events: auto;
        box-sizing: border-box;
        min-width: 0;
        min-height: 48px;
        resize: vertical;
        padding: 4px 8px;
        font-size: 12px;
        font-family: inherit;
        line-height: 1.4;
        color: var(--text);
        background: var(--bg-input);
        border: 1px solid transparent;
        border-radius: 6px;
        outline: none;
        transition:
            background 150ms ease,
            border-color 150ms ease;
    }
    .sb-textarea::placeholder {
        color: var(--text-dim);
    }
    .sb-textarea:focus {
        border-color: var(--accent);
        background: var(--bg-input-focus);
    }
</style>