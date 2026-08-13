<script lang="ts">
    import { ArrowLeft, Music2, Trash2, X } from "lucide-svelte";

    interface Props {
        /** 列表曲名（与 playlist 下标一一对应）。 */
        names: string[];
        currentIndex: number;
        onplay: (i: number) => void;
        onremove: (i: number) => void;
        onclear: () => void;
        onback: () => void;
    }

    let {
        names,
        currentIndex,
        onplay,
        onremove,
        onclear,
        onback,
    }: Props = $props();
</script>

<div class="panel">
    <header class="head">
        <button class="icon-btn back" onclick={onback} aria-label="返回正在播放">
            <ArrowLeft size={13} aria-hidden="true" />
        </button>
        <span class="title">播放列表（{names.length}）</span>
        <button
            class="icon-btn clear"
            onclick={onclear}
            disabled={names.length === 0}
            aria-label="清空列表"
        >
            <Trash2 size={13} aria-hidden="true" />
        </button>
    </header>

    {#if names.length === 0}
        <div class="empty">
            <Music2 size={18} strokeWidth={1.5} aria-hidden="true" />
            <span>拖入音频以添加</span>
        </div>
    {:else}
        <ul class="list">
            {#each names as name, i (i)}
                <li class="row" class:current={i === currentIndex}>
                    <button
                        class="play-row"
                        class:current={i === currentIndex}
                        onclick={() => onplay(i)}
                        aria-label={`播放 ${name}`}
                    >
                        <span class="idx" class:current={i === currentIndex}>
                            {i === currentIndex ? "▶" : i + 1}
                        </span>
                        <span class="name">{name}</span>
                    </button>
                    <button
                        class="remove"
                        onclick={() => onremove(i)}
                        aria-label="从列表移除"
                    >
                        <X size={11} aria-hidden="true" />
                    </button>
                </li>
            {/each}
        </ul>
    {/if}
</div>

<style>
    .panel {
        flex: 1;
        min-width: 0;
        min-height: 0;
        display: flex;
        flex-direction: column;
        gap: 4px;
    }

    .head {
        pointer-events: auto;
        flex: none;
        display: flex;
        align-items: center;
        gap: 6px;
    }

    .title {
        flex: 1;
        font-size: 12px;
        color: var(--text);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .icon-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 18px;
        height: 18px;
        padding: 0;
        border: none;
        border-radius: 4px;
        background: transparent;
        color: var(--text-muted);
        cursor: pointer;
        transition: color 150ms ease;
    }

    .icon-btn:hover:not(:disabled) {
        color: var(--text);
    }

    .icon-btn:disabled {
        opacity: 0.4;
        cursor: default;
    }

    .list {
        pointer-events: auto;
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
    }

    .row {
        display: flex;
        align-items: center;
        padding: 3px 4px;
        border-radius: 5px;
    }

    .row:hover {
        background: var(--bg-input);
    }

    .row.current {
        background: var(--bg-input);
    }

    .play-row {
        flex: 1;
        min-width: 0;
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 0;
        border: none;
        background: transparent;
        color: inherit;
        text-align: left;
        cursor: pointer;
    }

    .idx {
        flex: none;
        width: 16px;
        font-size: 10px;
        color: var(--text-muted);
        font-variant-numeric: tabular-nums;
        text-align: center;
    }

    .idx.current {
        color: var(--accent);
    }

    .name {
        flex: 1;
        min-width: 0;
        font-size: 12px;
        line-height: 1.3;
        color: var(--text);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .row.current .name {
        color: var(--accent);
    }

    .remove {
        flex: none;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 16px;
        height: 16px;
        padding: 0;
        border: none;
        border-radius: 4px;
        background: transparent;
        color: var(--text-muted);
        cursor: pointer;
        opacity: 0;
        transition:
            opacity 120ms ease,
            color 150ms ease;
    }

    .row:hover .remove {
        opacity: 1;
    }

    .remove:hover {
        color: var(--danger, #e5484d);
    }

    .empty {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 6px;
        color: var(--text-muted);
        font-size: 12px;
    }
</style>