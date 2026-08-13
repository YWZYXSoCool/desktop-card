<script lang="ts">
    import {
        Pause,
        Play,
        Search,
        Trash2,
    } from "lucide-svelte";
    import type { WidgetContext } from "$lib/widgets/api/types";
    import { clipboard } from "./clipboard.svelte";
    import ClipboardRow from "./ClipboardRow.svelte";

    // 契约要求组件接收 { ctx }，但本 widget 直连宿主命令，不使用 ctx 能力。
    let {}: { ctx: WidgetContext } = $props();
</script>

<div class="clipboard">
    <div class="topbar">
        <span class="title">剪贴板</span>
        <span class="count">{clipboard.items.length}</span>
        <div class="spacer"></div>
        <button
            type="button"
            class="icon-btn"
            class:on={clipboard.paused}
            onclick={() => clipboard.togglePause()}
            aria-label={clipboard.paused ? "继续录制" : "暂停录制"}
        >
            {#if clipboard.paused}
                <Play size={13} aria-hidden="true" />
            {:else}
                <Pause size={13} aria-hidden="true" />
            {/if}
        </button>
        <button
            type="button"
            class="icon-btn"
            onclick={() => clipboard.clear()}
            aria-label="清空历史"
        >
            <Trash2 size={13} aria-hidden="true" />
        </button>
    </div>

    <div class="search-row">
        <span class="search-icon">
            <Search size={12} aria-hidden="true" />
        </span>
        <input
            type="text"
            placeholder="过滤记录…"
            spellcheck="false"
            value={clipboard.filter}
            oninput={(e) =>
                (clipboard.filter = (e.target as HTMLInputElement).value)}
        />
    </div>

    <div class="list">
        {#each clipboard.filtered as item (item.id)}
            <ClipboardRow
                {item}
                oncopy={() => clipboard.copy(item.id)}
                ondelete={() => clipboard.remove(item.id)}
            />
        {/each}

        {#if clipboard.filtered.length === 0}
            <div class="empty">
                {#if clipboard.filter.trim()}
                    无匹配记录
                {:else}
                    暂无剪贴板记录，复制内容后自动收录
                {/if}
            </div>
        {/if}
    </div>
</div>

<style>
    .clipboard {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .topbar {
        display: flex;
        align-items: center;
        gap: 6px;
    }

    .title {
        font-size: 12px;
        font-weight: 600;
        color: var(--text);
    }

    .count {
        font-size: 10px;
        color: var(--text-muted);
        background: var(--bg-input-focus);
        border-radius: 8px;
        padding: 1px 6px;
    }

    .spacer {
        flex: 1;
    }

    .icon-btn {
        pointer-events: auto;
        flex: none;
        width: 22px;
        height: 22px;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        border: 1px solid transparent;
        border-radius: 6px;
        background: transparent;
        color: var(--text-muted);
        cursor: pointer;
        transition:
            background 150ms ease,
            color 150ms ease;
    }

    .icon-btn:hover {
        background: var(--hover);
        color: var(--text);
    }

    .icon-btn.on {
        color: var(--accent);
        border-color: var(--accent);
    }

    .search-row {
        position: relative;
        display: flex;
        align-items: center;
    }

    .search-icon {
        position: absolute;
        left: 8px;
        color: var(--text-dim);
        pointer-events: none;
    }

    .search-row input {
        pointer-events: auto;
        flex: 1;
        min-width: 0;
        padding: 5px 8px 5px 24px;
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

    .search-row input::placeholder {
        color: var(--text-dim);
    }

    .search-row input:focus {
        border-color: var(--accent);
        background: var(--bg-input-focus);
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
        padding: 12px 0;
        font-size: 12px;
    }
</style>
