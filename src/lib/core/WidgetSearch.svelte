<script lang="ts">
    import { onMount } from "svelte";
    import { waitReady, MAIN_ID } from "$lib/widgets/registry.svelte";
    import type { WidgetDefinition } from "$lib/widgets/api/types";
    import { widgetMeta, type UseEntry } from "$lib/core/widgetMeta.svelte";
    import { widgetStore } from "$lib/core/settings";
    import { openWidgetWindow } from "$lib/core/widgetWindows";
    import { fuzzySearch } from "./widgetSearch";
    import SearchBox from "./SearchBox.svelte";

    let { onclose }: { onclose: () => void } = $props();

    let query = $state("");
    let selected = $state(0);

    const results = $derived(fuzzySearch(query.trim()));

    // 结果变化后复位选中项，避免越界
    $effect(() => {
        if (results.length > 0) selected = Math.min(selected, results.length - 1);
    });

    /** 选中 widget：记录历史 → 在独立窗口打开（主页已在主卡片，直接关闭）。 */
    function choose(w: WidgetDefinition) {
        widgetMeta.record(w.manifest.id);
        if (w.manifest.id !== MAIN_ID) void openWidgetWindow(w.manifest.id);
        onclose();
    }

    /** 收藏/取消收藏（阻止冒泡已在 SearchBox 内处理）。 */
    function onFav(w: WidgetDefinition) {
        widgetMeta.toggleFavorite(w.manifest.id);
    }

    onMount(async () => {
        // 等待外部 widget 扫描完成，保证列表完整
        waitReady();
        // 恢复历史 + 收藏用于排序（缺省为空，不影响首屏展示）
        const [history, favorites] = await Promise.all([
            widgetStore.get<Record<string, UseEntry>>("widgets.history", {}),
            widgetStore.get<string[]>("widgets.favorites", []),
        ]);
        widgetMeta.load(history, favorites);
    });
</script>

<SearchBox
    mode="overlay"
    value={query}
    oninput={(v) => (query = v)}
    placeholder="搜索 widget…"
    ariaLabel="搜索 widget"
    items={results}
    {selected}
    onselect={(i) => (selected = i)}
    onchoose={choose}
    onescape={onclose}
    empty="无匹配"
    getKey={(w) => w.manifest.id}
    showFav
    isFav={(w) => widgetMeta.isFavorite(w.manifest.id)}
    onfav={onFav}
>
    {#snippet row(w, sel)}
        <span class="name">{w.manifest.name}</span>
        <span class="kw" class:muted={!sel}>{w.manifest.id}</span>
    {/snippet}
</SearchBox>

<style>
    .name {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .kw {
        flex: none;
        font-size: 10px;
    }

    .kw.muted {
        color: var(--text-muted);
    }
</style>