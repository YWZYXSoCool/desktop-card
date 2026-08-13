<script lang="ts">
    import type { UINode } from "$lib/widgets/api/types";
    import { styleStr, type EventCb } from "./style";
    import UiIcon from "./UiIcon.svelte";

    let { node, onEvent }: { node: UINode; onEvent?: EventCb } = $props();
    const style = $derived(styleStr(node.style));
    const placeholder = $derived(String(node.props?.placeholder ?? ""));
</script>

<!-- 搜索框：圆角 + 放大镜前缀，聚焦高亮，观感与原生搜索一致。 -->
<div class="sb-search" {style}>
    <UiIcon node={{ type: "icon", props: { name: "search", size: 12 } }} />
    <input
        type="text"
        value={String(node.props?.value ?? "")}
        {placeholder}
        spellcheck="false"
        oninput={(e) =>
            node.on &&
            onEvent?.(node.on, "change", (e.target as HTMLInputElement).value)
        }
    />
</div>

<style>
    .sb-search {
        pointer-events: auto;
        box-sizing: border-box;
        display: flex;
        align-items: center;
        gap: 6px;
        min-width: 0;
        padding: 4px 8px;
        color: var(--text-dim);
        background: var(--bg-input);
        border: 1px solid transparent;
        border-radius: 6px;
        transition:
            background 150ms ease,
            border-color 150ms ease;
    }
    .sb-search:focus-within {
        border-color: var(--accent);
        background: var(--bg-input-focus);
    }
    .sb-search input {
        flex: 1;
        min-width: 0;
        padding: 0;
        font-size: 12px;
        font-family: inherit;
        color: var(--text);
        background: transparent;
        border: none;
        outline: none;
    }
    .sb-search input::placeholder {
        color: var(--text-dim);
    }
</style>