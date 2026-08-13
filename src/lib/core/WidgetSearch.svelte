<script lang="ts">
    import { onMount } from "svelte";
    import { Search } from "lucide-svelte";
    import {
        waitReady,
        getWidgets,
        setActiveWidget,
    } from "$lib/widgets/registry.svelte";
    import { widgetMeta, type UseEntry } from "$lib/core/widgetMeta.svelte";
    import { widgetStore } from "$lib/core/settings";
    import { fuzzySearch } from "./widgetSearch";
    import SearchRow from "./SearchRow.svelte";

    let { onclose }: { onclose: () => void } = $props();

    let query = $state("");
    let selected = $state(0);
    let input: HTMLInputElement | undefined = $state();
    let listEl: HTMLDivElement | undefined = $state();

    const results = $derived(fuzzySearch(query.trim()));

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
            <SearchRow
                widget={w}
                selected={i === selected}
                isFav={widgetMeta.isFavorite(w.manifest.id)}
                onhover={() => (selected = i)}
                onchoose={() => choose(i)}
                onfav={(e) => onFav(e, w.manifest.id)}
            />
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

    .empty {
        color: var(--text-muted);
        text-align: center;
        padding: 5px;
        font-size: 12px;
    }
</style>