<script lang="ts">
    import { Check, Trash2 } from "lucide-svelte";
    import type { TodoItem } from "./todo.svelte";

    interface Props {
        item: TodoItem;
        ontoggle: () => void;
        onremove: () => void;
    }

    let { item, ontoggle, onremove }: Props = $props();
</script>

<div class="row">
    <button
        type="button"
        class="check"
        class:done={item.done}
        onclick={ontoggle}
        aria-pressed={item.done}
        aria-label={item.done ? "标记为未完成" : "标记为完成"}
    >
        {#if item.done}
            <Check size={11} strokeWidth={3} aria-hidden="true" />
        {/if}
    </button>
    <span class="text" class:done={item.done}>{item.text}</span>
    <button
        type="button"
        class="del"
        onclick={onremove}
        aria-label="删除"
    >
        <Trash2 size={12} aria-hidden="true" />
    </button>
</div>

<style>
    .row {
        /* 内容层 pointer-events:none，需恢复才能接收 hover/点击 */
        pointer-events: auto;
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 3px 4px;
        border-radius: 6px;
    }

    .row:hover {
        background: var(--border);
    }

    .check {
        pointer-events: auto;
        flex: none;
        width: 14px;
        height: 14px;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        border: 1px solid var(--border-2);
        border-radius: 4px;
        background: transparent;
        color: var(--on-accent);
        cursor: pointer;
        transition:
            background 150ms ease,
            border-color 150ms ease;
    }

    .check:hover {
        border-color: var(--accent);
    }

    .check.done {
        background: var(--accent);
        border-color: var(--accent);
    }

    .text {
        flex: 1;
        min-width: 0;
        font-size: 12px;
        color: var(--text);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .text.done {
        color: var(--text-dim);
        text-decoration: line-through;
    }

    .del {
        pointer-events: auto;
        flex: none;
        width: 18px;
        height: 18px;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        border: none;
        border-radius: 4px;
        background: transparent;
        color: var(--text-muted);
        cursor: pointer;
        opacity: 0;
        transition:
            opacity 150ms ease,
            color 150ms ease;
    }

    .row:hover .del {
        opacity: 1;
    }

    .del:hover {
        color: var(--danger);
    }
</style>