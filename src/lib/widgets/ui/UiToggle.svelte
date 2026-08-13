<script lang="ts">
    import type { UINode } from "$lib/widgets/api/types";
    import { styleStr, type EventCb } from "./style";

    let { node, onEvent }: { node: UINode; onEvent?: EventCb } = $props();
    const style = $derived(styleStr(node.style));
    const checked = $derived(Boolean(node.props?.checked));
    const label = $derived(String(node.props?.label ?? "切换"));
</script>

<!-- 主题开关：滑动小圆钮，选中态 --accent。交互语义延续 change + boolean。 -->
<button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    class="sb-toggle"
    class:on={checked}
    {style}
    onclick={() => node.on && onEvent?.(node.on, "change", !checked)}
>
    <span class="knob"></span>
</button>

<style>
    .sb-toggle {
        pointer-events: auto;
        flex: none;
        display: inline-flex;
        align-items: center;
        width: 34px;
        height: 18px;
        padding: 2px;
        box-sizing: border-box;
        background: var(--border-strong);
        border: none;
        border-radius: 999px;
        cursor: pointer;
        transition: background 150ms ease;
    }
    .sb-toggle .knob {
        width: 14px;
        height: 14px;
        background: var(--on-accent);
        border-radius: 50%;
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
        transition: transform 150ms ease;
    }
    .sb-toggle.on {
        background: var(--accent);
    }
    .sb-toggle.on .knob {
        transform: translateX(16px);
    }
</style>