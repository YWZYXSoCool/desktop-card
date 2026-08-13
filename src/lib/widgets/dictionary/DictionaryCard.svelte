<script lang="ts">
    import { onMount } from "svelte";
    import { Search } from "lucide-svelte";
    import type { WidgetContext } from "$lib/widgets/api/types";
    import { clipboard } from "$lib/widgets/clipboard/clipboard.svelte";
    import { dict, readConfigFromSettings } from "./dictionary.svelte";
    import DictResult from "./DictResult.svelte";
    import DictSuggest from "./DictSuggest.svelte";
    import DictTopbar from "./DictTopbar.svelte";

    let { ctx }: { ctx: WidgetContext } = $props();
    let input: HTMLInputElement | undefined = $state();
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

    /** 切换到本 widget 时：把最新剪贴板文本自动填入输入框并聚焦。 */
    onMount(async () => {
        input?.focus();
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

    /** 键盘移动选中项（suggestions 循环；滚动由 DictSuggest 内部跟随）。 */
    function move(delta: number) {
        if (suggestions.length === 0) return;
        selected = (selected + delta + suggestions.length) % suggestions.length;
    }

    /** 选中建议：填入输入框并立即查询。 */
    function chooseSel(i = selected) {
        const w = suggestions[i];
        if (!w) return;
        dict.word = w.word;
        dict.clear();
        void onSearch();
    }

    function onKeydown(e: KeyboardEvent) {
        // 有建议时：方向键/回车/ESC 操作建议下拉
        if (suggestionsVisible && suggestions.length > 0) {
            if (e.key === "ArrowDown") {
                e.preventDefault();
                move(1);
                return;
            }
            if (e.key === "ArrowUp") {
                e.preventDefault();
                move(-1);
                return;
            }
            if (e.key === "Enter" && !e.isComposing) {
                e.preventDefault();
                chooseSel();
                return;
            }
            if (e.key === "Escape") {
                e.preventDefault();
                input?.blur();
                return;
            }
        }
        // 无建议时：回车直接查询
        if (e.key === "Enter" && !e.isComposing && !dict.loading) {
            e.preventDefault();
            void onSearch();
        }
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

    <div class="query">
        <span class="search-icon">
            <Search size={12} aria-hidden="true" />
        </span>
        <input
            bind:this={input}
            type="text"
            placeholder="输入单词，回车查询…"
            spellcheck="false"
            autocomplete="off"
            value={dict.word}
            oninput={(e) => {
                dict.word = (e.target as HTMLInputElement).value;
                // 重置结果让建议下拉能重新出现
                dict.clear();
            }}
            onfocus={() => (focused = true)}
            onblur={() => (focused = false)}
            onkeydown={onKeydown}
        />
    </div>

    {#if suggestionsVisible}
        <DictSuggest
            items={suggestions}
            {selected}
            onselect={(i) => (selected = i)}
            onchoose={(i) => chooseSel(i)}
        />
    {/if}

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

    .query {
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

    .query input {
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

    .query input::placeholder {
        color: var(--text-dim);
    }

    .query input:focus {
        border-color: var(--accent);
        background: var(--bg-input-focus);
    }
</style>