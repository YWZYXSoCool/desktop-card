<script lang="ts">
    import { Check, Plus, Trash2 } from "lucide-svelte";
    import type { WidgetContext } from "$lib/widgets/api/types";
    import { todo } from "./todo.svelte";

    // 声明了 store 权限，defineWidget 已注入 ctx.store
    let { ctx }: { ctx: WidgetContext } = $props();

    let newText = $state("");

    /** 每次变更立即持久化整个列表（增/勾选/删都是离散事件，无需防抖）。 */
    function persist() {
        ctx.store!.set("todo.items", todo.items).catch(() => {});
    }

    function add() {
        const t = newText.trim();
        if (!t) return;
        todo.add(t);
        newText = "";
        persist();
    }

    function toggle(id: string) {
        todo.toggle(id);
        persist();
    }

    function remove(id: string) {
        todo.remove(id);
        persist();
    }

    function onInputKeydown(e: KeyboardEvent) {
        if (e.key === "Enter") {
            e.preventDefault();
            add();
        }
    }
</script>

<div class="todo">
    <div class="add-row">
        <input
            type="text"
            placeholder="添加待办…"
            spellcheck="false"
            value={newText}
            oninput={(e) => (newText = (e.target as HTMLInputElement).value)}
            onkeydown={onInputKeydown}
            aria-label="添加待办"
        />
        <button type="button" class="add-btn" onclick={add} aria-label="添加">
            <Plus size={14} aria-hidden="true" />
        </button>
    </div>

    <div class="list">
        {#each todo.items as t (t.id)}
            <div class="row">
                <button
                    type="button"
                    class="check"
                    class:done={t.done}
                    onclick={() => toggle(t.id)}
                    aria-pressed={t.done}
                    aria-label={t.done ? "标记为未完成" : "标记为完成"}
                >
                    {#if t.done}
                        <Check size={11} strokeWidth={3} aria-hidden="true" />
                    {/if}
                </button>
                <span class="text" class:done={t.done}>{t.text}</span
                >
                <button
                    type="button"
                    class="del"
                    onclick={() => remove(t.id)}
                    aria-label="删除"
                >
                    <Trash2 size={12} aria-hidden="true" />
                </button>
            </div>
        {/each}

        {#if todo.items.length === 0}
            <div class="empty">暂无待办，输入后回车添加</div>
        {/if}
    </div>
</div>

<style>
    .todo {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .add-row {
        display: flex;
        gap: 6px;
    }

    .add-row input {
        pointer-events: auto;
        flex: 1;
        min-width: 0;
        padding: 4px 8px;
        font-size: 12px;
        color: var(--text);
        background: var(--bg-input);
        border: 1px solid transparent;
        border-radius: 6px;
        outline: none;
        transition:
            background 150ms ease,
            border-color 150ms ease;
    }

    .add-row input::placeholder {
        color: var(--text-dim);
    }

    .add-row input:focus {
        border-color: var(--accent);
        background: var(--bg-input-focus);
    }

    .add-btn {
        pointer-events: auto;
        flex: none;
        width: 26px;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        border: none;
        border-radius: 6px;
        background: var(--accent);
        color: var(--on-accent);
        cursor: pointer;
        transition: background 150ms ease;
    }

    .add-btn:hover {
        background: var(--accent-2);
    }

    .list {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 2px;
    }

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

    .empty {
        color: var(--text-dim);
        text-align: center;
        padding: 8px 0;
        font-size: 12px;
    }
</style>
