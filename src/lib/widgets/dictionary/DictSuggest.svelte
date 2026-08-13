<script lang="ts">
    interface SuggestionItem {
        word: string;
        isFav: boolean;
        /** 搜索次数（>1 时显示 ×N）。 */
        count: number;
    }

    interface Props {
        items: SuggestionItem[];
        selected: number;
        /** 悬停选中本行（容器把 selected 置为当前下标）。 */
        onselect: (i: number) => void;
        /** 点击选择（容器 chooseSel）。 */
        onchoose: (i: number) => void;
    }

    let { items, selected, onselect, onchoose }: Props = $props();

    let listEl: HTMLDivElement | undefined = $state();

    // 键盘导航移动选中项时，滚动到可见（block:"nearest" 做最小滚动，不干扰鼠标悬停）
    $effect(() => {
        listEl
            ?.querySelectorAll("button")
            [selected]?.scrollIntoView({ block: "nearest" });
    });
</script>

<div class="suggest" bind:this={listEl}>
    {#each items as s, i (s.word)}
        <button
            type="button"
            class:selected={i === selected}
            onmouseenter={() => onselect(i)}
            onclick={() => onchoose(i)}
        >
            <span class="s-word">{s.word}</span>
            <span class="s-tag"
                >{#if s.isFav}★{/if}{#if s.count > 1}
                    × {s.count}{/if}</span
            >
        </button>
    {/each}
    {#if items.length === 0}
        <div class="s-empty">无匹配</div>
    {/if}
</div>

<style>
    .suggest {
        /* 建议下拉：可滚动、可点击，恢复 pointer-events */
        pointer-events: auto;
        flex: none;
        max-height: 132px;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 2px;
        background: var(--bg-sunken);
        border: 1px solid var(--border-strong);
        border-radius: 8px;
        padding: 4px;
    }

    .suggest button {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        width: 100%;
        padding: 4px 8px;
        border: none;
        border-radius: 5px;
        background: transparent;
        cursor: pointer;
        text-align: left;
        font-size: 12px;
        font-family: inherit;
        color: var(--text);
    }

    .suggest button.selected {
        background: var(--accent-soft);
        color: var(--on-accent);
    }

    .s-word {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .s-tag {
        flex: none;
        font-size: 10px;
        color: var(--text-muted);
        font-variant: tabular-nums;
    }

    .suggest button.selected .s-tag {
        color: var(--on-accent);
    }

    .s-empty {
        color: var(--text-dim);
        text-align: center;
        padding: 6px 0;
        font-size: 12px;
    }
</style>