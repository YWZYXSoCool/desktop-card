<script lang="ts">
    import { Plus } from "lucide-svelte";
    import { cubicOut } from "svelte/easing";
    import { fly } from "svelte/transition";
    import type { WidgetContext } from "$lib/widgets/api/types";
    import { todo } from "./todo.svelte";
    import TodoRow from "./TodoRow.svelte";

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

    // 设置页可隐藏已完成 / 把已完成排到底部
    const showCompleted = $derived(
        ctx.settings?.get<boolean>("showCompleted") ?? true,
    );
    const doneToBottom = $derived(
        ctx.settings?.get<boolean>("doneToBottom") ?? false,
    );
    const items = $derived.by(() => {
        let list = todo.items;
        if (!showCompleted) list = list.filter((t) => !t.done);
        if (doneToBottom) {
            list = [...list].sort((a, b) => Number(a.done) - Number(b.done));
        }
        return list;
    });
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
        {#each items as t (t.id)}
            <TodoRow
                item={t}
                ontoggle={() => toggle(t.id)}
                onremove={() => remove(t.id)}
            />
        {/each}

        {#if items.length === 0}
            <div class="empty">
                {#if !showCompleted && todo.items.length > 0}
                    已完成条目已隐藏
                {:else}
                    暂无待办，输入后回车添加
                {/if}
            </div>
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

    .add-btn:active {
        transform: scale(0.92);
    }

    .list {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 2px;
    }

    .empty {
        color: var(--text-dim);
        text-align: center;
        padding: 8px 0;
        font-size: 12px;
    }
</style>
