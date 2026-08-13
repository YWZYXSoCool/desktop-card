<script lang="ts">
    import {
        File,
        Folder,
        Image as ImageIcon,
        Pin,
        Trash2,
    } from "lucide-svelte";
    import { basename } from "pathe";
    import type { ClipboardItem } from "./clipboard.svelte";

    interface Props {
        item: ClipboardItem;
        pinned: boolean;
        copied: boolean;
        oncopy: () => void;
        ondelete: () => void;
        onpin: () => void;
    }

    let { item, pinned, copied, oncopy, ondelete, onpin }: Props = $props();

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

<div
    class="row"
    role="button"
    tabindex="0"
    onclick={oncopy}
    onkeydown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            oncopy();
        }
    }}
>
    <button
        type="button"
        class="pin"
        class:active={pinned}
        onclick={(e) => {
            e.stopPropagation();
            onpin();
        }}
        aria-label={pinned ? "取消固定" : "固定"}
        title={pinned ? "取消固定" : "固定"}
    >
        <Pin
            size={12}
            fill={pinned ? "currentColor" : "none"}
            aria-hidden="true"
        />
    </button>
    <button
        type="button"
        class="del"
        onclick={(e) => {
            e.stopPropagation();
            ondelete();
        }}
        aria-label="删除"
    >
        <Trash2 size={12} aria-hidden="true" />
    </button>
    <span class="kind">
        {#if item.kind === "text"}
            <span class="text-preview">{item.text}</span>
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
            <span class="text-preview file-names">{preview(item)}</span>
        {/if}
    </span>
    {#if copied}
        <span class="copied">✓ 已复制</span>
    {:else}
        <span class="time">{ago(item.timestamp)}</span>
    {/if}
</div>

<style>
    .row {
        /* 内容层 pointer-events:none，需在控件上恢复 */
        pointer-events: auto;
        width: 100%;
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 4px 6px;
        border-radius: 6px;
        cursor: copy;
        overflow-x: hidden;
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

    .copied {
        flex: none;
        font-size: 10px;
        color: var(--accent);
    }

    .pin {
        pointer-events: auto;
        flex: none;
        /* 收起时宽度为 0 且 margin 为负抵消 flex gap，不占位置；悬浮/固定时展开 */
        width: 0;
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
        margin-right: -6px;
        overflow: hidden;
        transition:
            width 150ms ease,
            opacity 150ms ease,
            margin-right 150ms ease,
            color 150ms ease;
    }

    .row:hover .pin,
    .pin.active {
        width: 18px;
        opacity: 1;
        margin-right: 0;
    }

    .pin:hover {
        color: var(--accent);
    }

    .pin.active {
        color: var(--accent);
    }

    .pin:active {
        transform: scale(0.85);
    }

    .del {
        pointer-events: auto;
        flex: none;
        width: 0;
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
        margin-right: -6px;
        overflow: hidden;
        transition:
            width 150ms ease,
            opacity 150ms ease,
            margin-right 150ms ease,
            color 150ms ease;
    }

    .row:hover .del {
        width: 18px;
        opacity: 1;
        margin-right: 0;
    }

    .del:hover {
        color: var(--danger);
    }
</style>
