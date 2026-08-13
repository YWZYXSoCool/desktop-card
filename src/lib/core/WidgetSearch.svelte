<script lang="ts">
    import { onMount } from "svelte";
    import { Search, Star } from "lucide-svelte";
    import {
        waitReady,
        getWidgets,
        setActiveWidget,
    } from "$lib/widgets/registry.svelte";
    import type { WidgetDefinition } from "$lib/widgets/api/types";
    import { fuzzyScore } from "$lib/core/fuzzy";
    import { widgetMeta, type UseEntry } from "$lib/core/widgetMeta.svelte";
    import { widgetStore } from "$lib/core/settings";

    let { onclose }: { onclose: () => void } = $props();

    let query = $state("");
    let selected = $state(0);
    let input: HTMLInputElement | undefined = $state();
    let listEl: HTMLDivElement | undefined = $state();

    const results = $derived(fuzzySearch(query.trim()));

    /**
     * 模糊搜索 widget：关键词命中过滤后，按 收藏 → 最近使用 → 匹配分数 → 名称 排序。
     * 无关键词时展示全部，同样按收藏/最近使用排序（常用项靠前）。
     */
    function fuzzySearch(q: string): WidgetDefinition[] {
        const needle = q.toLowerCase();
        const items = getWidgets().map((w) => ({
            w,
            score: needle
                ? Math.max(
                      fuzzyScore(w.manifest.name, needle),
                      fuzzyScore(w.manifest.id, needle),
                      ...w.manifest.keywords.map((k) => fuzzyScore(k, needle)),
                  )
                : 0,
        }));
        const filtered = needle ? items.filter((x) => x.score >= 0) : items;
        filtered.sort(
            (a, b) =>
                Number(widgetMeta.isFavorite(b.w.manifest.id)) -
                    Number(widgetMeta.isFavorite(a.w.manifest.id)) ||
                (widgetMeta.history[b.w.manifest.id]?.lastAt ?? 0) -
                    (widgetMeta.history[a.w.manifest.id]?.lastAt ?? 0) ||
                b.score - a.score ||
                a.w.manifest.name.localeCompare(b.w.manifest.name),
        );
        return filtered.map((x) => x.w);
    }

    // 选中项越界（如过滤后结果变少）时复位
    $effect(() => {
        if (results.length > 0) selected = Math.min(selected, results.length - 1);
    });

    function move(delta: number) {
        if (results.length === 0) return;
        selected = (selected + delta + results.length) % results.length;
        // 仅键盘导航时滚动到选中项（block:"nearest" 做最小滚动，不干扰鼠标悬停/点击）。
        // 用 rAF 等 DOM 更新后再定位，querySelectorAll(".main") 按显示顺序取第 selected 项。
        requestAnimationFrame(() => {
            listEl
                ?.querySelectorAll(".main")
                [selected]?.scrollIntoView({ block: "nearest" });
        });
    }

    function choose(i = selected) {
        const w = results[i];
        if (!w) return;
        widgetMeta.record(w.manifest.id);
        setActiveWidget(w.manifest.id);
        onclose();
    }

    function onKeydown(e: KeyboardEvent) {
        if (e.key === "ArrowDown") {
            e.preventDefault();
            move(1);
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            move(-1);
        } else if (e.key === "Enter") {
            e.preventDefault();
            choose();
        } else if (e.key === "Escape") {
            e.preventDefault();
            onclose();
        }
    }

    /** 收藏/取消收藏（阻止冒泡，避免误触发选中）。 */
    function onFav(e: MouseEvent, id: string) {
        e.stopPropagation();
        e.preventDefault();
        widgetMeta.toggleFavorite(id);
    }

    onMount(async () => {
        // 等待外部 widget 扫描完成，保证列表完整
        waitReady();
        input?.focus();
        // 恢复历史 + 收藏用于排序（缺省为空，不影响首屏展示）
        const [history, favorites] = await Promise.all([
            widgetStore.get<Record<string, UseEntry>>("widgets.history", {}),
            widgetStore.get<string[]>("widgets.favorites", []),
        ]);
        widgetMeta.load(history, favorites);
    });
</script>

<div class="search">
    <div class="field">
        <Search size={12} aria-hidden="true" />
        <input
            bind:this={input}
            bind:value={query}
            spellcheck="false"
            placeholder="搜索 widget…"
            aria-label="搜索 widget"
            onkeydown={onKeydown}
        />
    </div>

    <div class="list" bind:this={listEl}>
        {#each results as w, i (w.manifest.id)}
            <div class="row" class:selected={i === selected}>
                <button
                    type="button"
                    class="main"
                    class:selected={i === selected}
                    onmouseenter={() => (selected = i)}
                    onclick={() => choose(i)}
                >
                    <span class="name">{w.manifest.name}</span>
                    <span class="kw">{w.manifest.id}</span>
                </button>
                <button
                    type="button"
                    class="star"
                    class:active={widgetMeta.isFavorite(w.manifest.id)}
                    onclick={(e) => onFav(e, w.manifest.id)}
                    aria-label={widgetMeta.isFavorite(w.manifest.id) ? "取消收藏" : "收藏"}
                    title={widgetMeta.isFavorite(w.manifest.id) ? "取消收藏" : "收藏"}
                >
                    <Star
                        size={11}
                        fill={widgetMeta.isFavorite(w.manifest.id) ? "currentColor" : "none"}
                        aria-hidden="true"
                    />
                </button>
            </div>
        {/each}
        {#if results.length === 0}
            <div class="empty">无匹配</div>
        {/if}
    </div>
</div>

<style>
    .search {
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
    }

    .field {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 0 8px;
        height: 26px;
        border-radius: 6px;
        background: var(--bg);
        color: var(--text-muted);
        box-shadow: inset 0 0 0 1px var(--border-strong);
    }

    .field:focus-within {
        box-shadow: inset 0 0 0 1px var(--accent);
    }

    input {
        flex: 1;
        min-width: 0;
        border: none;
        outline: none;
        background: transparent;
        color: var(--text);
        font-size: 12px;
        font-family: inherit;
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
        display: flex;
        align-items: center;
        gap: 2px;
        border-radius: 6px;
    }

    .row.selected {
        background: var(--accent-soft);
    }

    .main {
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

    .row.selected .main {
        color: var(--on-accent);
    }

    .star {
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

    .star:hover {
        color: var(--accent);
        background: var(--hover);
    }

    .star.active {
        color: #f5c211;
    }

    .row.selected .star {
        color: var(--on-accent);
    }

    .name {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .kw {
        flex: none;
        font-size: 10px;
        color: var(--text-muted);
    }

    .row.selected .kw {
        color: var(--on-accent);
    }

    .empty {
        color: var(--text-muted);
        text-align: center;
        padding: 5px;
        font-size: 12px;
    }
</style>