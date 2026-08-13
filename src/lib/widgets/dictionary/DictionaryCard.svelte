<script lang="ts">
    import { onMount } from "svelte";
    import type { WidgetContext } from "$lib/widgets/api/types";
    import { clipboard } from "$lib/widgets/clipboard/clipboard.svelte";
    import { dict, readConfigFromSettings } from "./dictionary.svelte";
    import DictResult from "./DictResult.svelte";
    import DictTopbar from "./DictTopbar.svelte";
    import SearchBox from "$lib/core/SearchBox.svelte";

    let { ctx }: { ctx: WidgetContext } = $props();
    let focused = $state(false);
    let selected = $state(0);

    /** 从设置构建查询配置（ctx.settings 由 defineWidget 注入，读短名）。 */
    function readConfig() {
        return readConfigFromSettings(ctx.settings!);
    }

    /** 建议列表（历史 + 收藏，收藏优先、按最近搜索排序），预构造为展示组件所需结构。 */
    const suggestions = $derived(
        dict.suggestions().map((w) => ({
            word: w,
            isFav: dict.isFavorite(w),
            count: dict.history[w]?.count ?? 0,
        })),
    );
    /** 建议下拉仅在输入框聚焦且无结果/无加载时展示。 */
    const suggestionsVisible = $derived(focused && !dict.loading && !dict.result);

    // 建议列表变化时复位选中项，避免越界
    $effect(() => {
        if (suggestions.length > 0) {
            selected = Math.min(selected, suggestions.length - 1);
        }
    });

    /** 切换到本 widget 时：把最新剪贴板文本自动填入输入框（聚焦由 SearchBox 负责）。 */
    onMount(async () => {
        try {
            const word = (await clipboard.latestText())?.trim();
            if (word) dict.word = word;
        } catch {
            // 读不到剪贴板则留空，不影响手动输入
        }
    });

    /** 发起查询：成功后记录进历史并持久化。 */
    async function onSearch() {
        if (!dict.word.trim() || dict.loading) return;
        dict.clear();
        await dict.lookup(readConfig());
        if (!dict.error) {
            dict.record(dict.word);
            persistMeta();
        }
    }

    /** 选中建议：填入输入框并立即查询。 */
    function chooseSuggestion(s: { word: string }) {
        dict.word = s.word;
        dict.clear();
        void onSearch();
    }

    /** 收藏/取消收藏，并持久化（同时刷新建议排序）。 */
    function toggleFav(word: string) {
        dict.toggleFavorite(word);
        persistMeta();
    }

    /** 持久化历史与收藏（写入 store 即保存）。 */
    function persistMeta() {
        ctx.store!.set("dict.history", dict.history).catch(() => {});
        ctx.store!.set("dict.favorites", dict.favorites).catch(() => {});
    }

    /** 结果词条附上收藏态。 */
    const entries = $derived(
        dict.result?.entries.map((entry) => ({
            ...entry,
            isFav: dict.isFavorite(entry.word),
        })) ?? [],
    );
</script>

<div class="dict">
    <DictTopbar
        channel={readConfig().channel === "ai" ? "AI" : "API"}
    />

    <SearchBox
        mode="inline"
        value={dict.word}
        oninput={(v) => {
            dict.word = v;
            // 重置结果让建议下拉能重新出现
            dict.clear();
        }}
        placeholder="输入单词，回车查询…"
        ariaLabel="查询单词"
        items={suggestions}
        {selected}
        onselect={(i) => (selected = i)}
        onchoose={chooseSuggestion}
        onenter={() => void onSearch()}
        onfocus={() => (focused = true)}
        onblur={() => (focused = false)}
        empty="无匹配"
        listVisible={suggestionsVisible}
        getKey={(s) => s.word}
    >
        {#snippet row(s, sel)}
            <span class="s-word">{s.word}</span>
            <span class="s-tag" class:muted={!sel}
                >{#if s.isFav}★{/if}{#if s.count > 1}
                    × {s.count}{/if}</span
            >
        {/snippet}
    </SearchBox>

    <DictResult
        loading={dict.loading}
        error={dict.error}
        {entries}
        onfav={toggleFav}
    />
</div>

<style>
    .dict {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .s-word {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .s-tag {
        flex: none;
        font-size: 10px;
        font-variant: tabular-nums;
    }

    .s-tag.muted {
        color: var(--text-muted);
    }
</style>