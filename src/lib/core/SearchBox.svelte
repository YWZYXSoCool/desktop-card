<script lang="ts" generics="T">
    import { onMount } from "svelte";
    import type { Snippet } from "svelte";
    import { Search, Star } from "lucide-svelte";

    interface Props {
        /** 容器形态：overlay 铺满面板（widget 搜索）；inline 内嵌（词典建议下拉）。 */
        mode?: "overlay" | "inline";
        value: string;
        oninput: (v: string) => void;
        placeholder?: string;
        ariaLabel?: string;
        /** 下拉条目（容器算好下传）。 */
        items: T[];
        /** 当前选中下标。 */
        selected: number;
        onselect: (i: number) => void;
        /** 回车/点击选中：传入被选中的条目。 */
        onchoose: (item: T) => void;
        /** 无下拉条目时回车（如词典直接查询）。 */
        onenter?: () => void;
        /** Escape 动作；不传则默认收起输入框（blur）。 */
        onescape?: () => void;
        /** 每行内容渲染（item, 是否选中）。 */
        row: Snippet<[T, boolean]>;
        /** 是否显示每行右侧收藏星标；onfav 负责切换。 */
        showFav?: boolean;
        isFav?: (item: T) => boolean;
        onfav?: (item: T) => void;
        /** 稳定 key（widget id / 单词）。 */
        getKey: (item: T) => string;
        empty?: string;
        /** 是否渲染下拉（词典在聚焦且无结果时才显示）。 */
        listVisible?: boolean;
        focusOnMount?: boolean;
        onfocus?: () => void;
        onblur?: () => void;
    }

    let {
        mode = "overlay",
        value,
        oninput,
        placeholder = "",
        ariaLabel = "搜索",
        items,
        selected,
        onselect,
        onchoose,
        onenter,
        onescape,
        row,
        showFav = false,
        isFav,
        onfav,
        getKey,
        empty = "无匹配",
        listVisible = true,
        focusOnMount = true,
        onfocus,
        onblur,
    }: Props = $props();

    let inputEl: HTMLInputElement | undefined = $state();
    let listEl: HTMLDivElement | undefined = $state();

    onMount(() => {
        if (focusOnMount) inputEl?.focus();
    });

    /** 键盘导航：上下循环、回车选中、Esc 收起/关闭。 */
    function onKeydown(e: KeyboardEvent) {
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            if (listVisible && items.length > 0) {
                e.preventDefault();
                const d = e.key === "ArrowDown" ? 1 : -1;
                onselect((selected + d + items.length) % items.length);
            }
            return;
        }
        if (e.key === "Enter" && !e.isComposing) {
            e.preventDefault();
            if (listVisible && items.length > 0) onchoose(items[selected]);
            else onenter?.();
            return;
        }
        if (e.key === "Escape") {
            e.preventDefault();
            if (onescape) onescape();
            else inputEl?.blur();
            return;
        }
    }

    // 选中项变化时滚动到可见（block:"nearest" 做最小滚动，不干扰鼠标悬停）
    $effect(() => {
        if (!listVisible) return;
        listEl?.querySelectorAll(".main")[selected]?.scrollIntoView({
            block: "nearest",
        });
    });
</script>

<div
    class="searchbox"
    class:overlay={mode === "overlay"}
    class:inline={mode === "inline"}
>
    <div class="field">
        <span class="search-icon">
            <Search size={12} aria-hidden="true" />
        </span>
        <input
            bind:this={inputEl}
            type="text"
            {placeholder}
            aria-label={ariaLabel}
            spellcheck="false"
            autocomplete="off"
            value={value}
            oninput={(e) => oninput((e.target as HTMLInputElement).value)}
            onkeydown={onKeydown}
            onfocus={onfocus}
            onblur={onblur}
        />
    </div>

    {#if listVisible}
        {#if items.length > 0}
            <div class="list" bind:this={listEl}>
                {#each items as item, i (getKey(item))}
                    <div class="row" class:selected={i === selected}>
                        <button
                            type="button"
                            class="main"
                            class:selected={i === selected}
                            onmouseenter={() => onselect(i)}
                            onmousedown={(e) => e.preventDefault()}
                            onclick={() => onchoose(item)}
                        >
                            {@render row(item, i === selected)}
                        </button>
                        {#if showFav}
                            <button
                                type="button"
                                class="star"
                                class:active={isFav?.(item)}
                                onmousedown={(e) => e.preventDefault()}
                                onclick={(e) => {
                                    e.stopPropagation();
                                    onfav?.(item);
                                }}
                                aria-label={isFav?.(item) ? "取消收藏" : "收藏"}
                                title={isFav?.(item) ? "取消收藏" : "收藏"}
                            >
                                <Star
                                    size={11}
                                    fill={isFav?.(item) ? "currentColor" : "none"}
                                    aria-hidden="true"
                                />
                            </button>
                        {/if}
                    </div>
                {/each}
            </div>
        {:else if empty}
            <div class="empty">{empty}</div>
        {/if}
    {/if}
</div>

<style>
    .searchbox .field {
        position: relative;
        display: flex;
        align-items: center;
    }

    .searchbox .search-icon {
        position: absolute;
        left: 8px;
        color: var(--text-dim);
        pointer-events: none;
        display: flex;
    }

    .searchbox .field input {
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
        font-family: inherit;
        transition:
            background 150ms ease,
            border-color 150ms ease;
    }

    .searchbox .field input::placeholder {
        color: var(--text-dim);
    }

    .searchbox .field input:focus {
        border-color: var(--accent);
        background: var(--bg-input-focus);
    }

    /* ── 下拉列表（两种模式共用行样式） ── */
    .searchbox .list {
        display: flex;
        flex-direction: column;
        gap: 2px;
    }

    .searchbox .row {
        display: flex;
        align-items: center;
        gap: 2px;
        border-radius: 6px;
    }

    .searchbox .row.selected {
        background: var(--accent-soft);
    }

    .searchbox .main {
        flex: 1;
        min-width: 0;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 5px 8px;
        border: none;
        border-radius: 6px;
        background: transparent;
        cursor: pointer;
        text-align: left;
        font-size: 12px;
        font-family: inherit;
        color: var(--text);
    }

    .searchbox .row.selected .main {
        color: var(--on-accent);
    }

    .searchbox .star {
        flex: none;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 22px;
        height: 22px;
        margin-right: 3px;
        padding: 0;
        border: none;
        border-radius: 5px;
        background: transparent;
        color: var(--text-dim);
        cursor: pointer;
        transition:
            color 150ms ease,
            background 150ms ease;
    }

    .searchbox .star:hover {
        color: var(--accent);
        background: var(--hover);
    }

    .searchbox .star:active {
        transform: scale(0.85);
    }

    .searchbox .star.active {
        color: #f5c211;
    }

    .searchbox .row.selected .star {
        color: var(--on-accent);
    }

    .searchbox .empty {
        color: var(--text-dim);
        text-align: center;
        padding: 8px 0;
        font-size: 12px;
    }

    /* ── overlay：铺满面板（widget 搜索） ── */
    .searchbox.overlay {
        position: absolute;
        inset: 0;
        z-index: 20;
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding: 10px;
        background: var(--bg-sunken);
        border-radius: 12px;
        box-shadow: inset 0 0 0 1px var(--border-strong);
        /* 挂载时轻微下移淡入（CSS only，不参与 Svelte transition 生命周期） */
        animation: search-in 180ms ease-out both;
    }

    .searchbox.overlay .list {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
    }

    .searchbox.overlay .empty {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    /* ── inline：内嵌下拉（词典建议） ── */
    .searchbox.inline {
        display: flex;
        flex-direction: column;
        gap: 6px;
    }

    .searchbox.inline .list {
        flex: none;
        max-height: 132px;
        overflow-y: auto;
        pointer-events: auto;
        background: var(--bg-sunken);
        border: 1px solid var(--border-strong);
        border-radius: 8px;
        padding: 4px;
        animation: suggest-in 140ms ease-out both;
    }

    @keyframes search-in {
        from {
            opacity: 0;
            transform: translateY(-10px);
        }
        to {
            opacity: 1;
            transform: none;
        }
    }

    @keyframes suggest-in {
        from {
            opacity: 0;
            transform: translateY(-4px);
        }
        to {
            opacity: 1;
            transform: none;
        }
    }
</style>