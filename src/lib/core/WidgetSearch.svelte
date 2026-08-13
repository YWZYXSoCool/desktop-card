<script lang="ts">
    import { onMount } from "svelte";
    import { Search } from "lucide-svelte";
    import {
        waitReady,
        getWidgets,
        setActiveWidget,
    } from "$lib/widgets/registry.svelte";
    import type { WidgetDefinition } from "$lib/widgets/api/types";

    let { onclose }: { onclose: () => void } = $props();

    let query = $state("");
    let selected = $state(0);
    let input: HTMLInputElement | undefined = $state();
    let listEl: HTMLDivElement | undefined = $state();

    const results = $derived(fuzzySearch(query.trim()));

    /**
     * 对 name / id / keywords 逐个做子序列模糊打分，取最高分；无匹配返回 -1。
     * 分数 = 命中字符数 - 跳过的字符数（连续命中得分更高）。
     */
    function scoreText(text: string, needle: string): number {
        if (!needle) return 0;
        let score = 0;
        let skip = 0;
        let from = 0;
        const lower = text.toLowerCase();
        for (let i = 0; i < needle.length; i++) {
            const idx = lower.indexOf(needle[i], from);
            if (idx < 0) return -1;
            if (idx > from) skip += 1;
            score += 1;
            from = idx + 1;
        }
        return score - skip;
    }

    function fuzzySearch(q: string): WidgetDefinition[] {
        const list = getWidgets();
        if (!q) return list;
        const needle = q.toLowerCase();
        return list
            .map((w) => ({
                w,
                score: Math.max(
                    scoreText(w.manifest.name, needle),
                    scoreText(w.manifest.id, needle),
                    ...w.manifest.keywords.map((k) => scoreText(k, needle)),
                ),
            }))
            .filter((x) => x.score >= 0)
            .sort((a, b) => b.score - a.score)
            .map((x) => x.w);
    }

    // 选中项越界（如过滤后结果变少）时复位
    $effect(() => {
        if (results.length > 0) selected = Math.min(selected, results.length - 1);
    });

    function move(delta: number) {
        if (results.length === 0) return;
        selected = (selected + delta + results.length) % results.length;
        // 仅键盘导航时滚动到选中项（block:"nearest" 做最小滚动，不干扰鼠标悬停/点击）。
        // 用 rAF 等 DOM 更新后再定位，querySelectorAll("button") 按显示顺序取第 selected 项。
        requestAnimationFrame(() => {
            listEl
                ?.querySelectorAll("button")
                [selected]?.scrollIntoView({ block: "nearest" });
        });
    }

    function choose(i = selected) {
        const w = results[i];
        if (!w) return;
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

    onMount(() => {
        // 等待外部 widget 扫描完成，保证列表完整
        waitReady();
        input?.focus();
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
            <button
                type="button"
                class:selected={i === selected}
                onmouseenter={() => (selected = i)}
                onclick={() => choose(i)}
            >
                <span class="name">{w.manifest.name}</span>
                <span class="kw">{w.manifest.id}</span>
            </button>
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

    .list button {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        width: 100%;
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

    .list button.selected {
        background: var(--accent-soft);
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

    .empty {
        color: var(--text-muted);
        text-align: center;
        padding: 5px;
        font-size: 12px;
    }
</style>
