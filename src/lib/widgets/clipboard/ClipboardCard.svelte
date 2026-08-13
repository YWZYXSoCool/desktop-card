<script lang="ts">
    import {
        Pause,
        Play,
        Search,
        Trash2,
        File,
        Folder,
        Image as ImageIcon,
    } from "lucide-svelte";
    import { basename } from "pathe";
    import type { WidgetContext } from "$lib/widgets/api/types";
    import { clipboard } from "./clipboard.svelte";
    import type { ClipboardItem } from "./clipboard.svelte";

    // 契约要求组件接收 { ctx }，但本 widget 直连宿主命令，不使用 ctx 能力。
    let {}: { ctx: WidgetContext } = $props();

    /** 相对时间：刚刚 / N分钟前 / N小时前 / N天前。 */
    function ago(ts: number): string {
        const s = Math.floor((Date.now() - ts) / 1000);
        if (s < 60) return "刚刚";
        if (s < 3600) return `${Math.floor(s / 60)}分钟前`;
        if (s < 86400) return `${Math.floor(s / 3600)}小时前`;
        return `${Math.floor(s / 86400)}天前`;
    }

    function isImageFile(p: string): boolean {
        return /\.(png|jpe?g|gif|webp|bmp|ico|svg)$/i.test(p);
    }

    function fileIcon(item: ClipboardItem) {
        const paths = item.files ?? [];
        if (paths.length === 1 && isImageFile(paths[0])) return ImageIcon;
        if (paths.length > 1) return Folder;
        return File;
    }

    function preview(item: ClipboardItem): string {
        if (item.text) return item.text;
        if (item.files)
            return (item.files ?? []).map(basename).slice(0, 2).join("、");
        return "图片";
    }
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
            <div
                class="row"
                role="button"
                tabindex="0"
                onclick={() => clipboard.copy(item.id)}
                onkeydown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        clipboard.copy(item.id);
                    }
                }}
            >
                <span class="kind">
                    {#if item.kind === "text"}
                        <span class="text-preview">{item.text}</span
                        >
                    {:else if item.kind === "image"}
                        <img
                            class="thumb"
                            src={`data:image/png;base64,${item.png}`}
                            alt="图片"
                            loading="lazy"
                        />
                    {:else}
                        {@const Icon = fileIcon(item)}
                        <span class="file-icon">
                            <Icon size={12} aria-hidden="true" />
                        </span>
                        <span class="text-preview file-names">{preview(item)}</span
                        >
                    {/if}
                </span>
                <span class="time">{ago(item.timestamp)}</span>
                <button
                    type="button"
                    class="del"
                    onclick={(e) => {
                        e.stopPropagation();
                        clipboard.remove(item.id);
                    }}
                    aria-label="删除"
                >
                    <Trash2 size={12} aria-hidden="true" />
                </button>
            </div>
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

    .row {
        /* 内容层 pointer-events:none，需在控件上恢复 */
        pointer-events: auto;
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 4px 6px;
        border-radius: 6px;
        cursor: copy;
    }

    .row:hover {
        background: var(--border);
    }

    .kind {
        flex: 1;
        min-width: 0;
        display: flex;
        align-items: center;
        gap: 6px;
    }

    .text-preview {
        flex: 1;
        min-width: 0;
        font-size: 12px;
        color: var(--text);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .file-names {
        color: var(--text-muted);
    }

    .file-icon {
        flex: none;
        color: var(--text-muted);
    }

    .thumb {
        flex: none;
        max-width: 64px;
        max-height: 40px;
        border-radius: 4px;
        object-fit: cover;
        background: var(--bg-sunken);
    }

    .time {
        flex: none;
        font-size: 10px;
        color: var(--text-dim);
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
        padding: 12px 0;
        font-size: 12px;
    }
</style>
