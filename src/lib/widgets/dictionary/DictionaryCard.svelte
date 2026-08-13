<script lang="ts">
    import { onMount } from "svelte";
    import { BookOpen, LoaderCircle, Search } from "lucide-svelte";
    import type { WidgetContext } from "$lib/widgets/api/types";
    import { clipboard } from "$lib/widgets/clipboard/clipboard.svelte";
    import { dict, readConfigFromSettings } from "./dictionary.svelte";

    let { ctx }: { ctx: WidgetContext } = $props();
    let input: HTMLInputElement | undefined = $state();

    /** 从设置构建查询配置（ctx.settings 由 defineWidget 注入，读短名）。 */
    function readConfig() {
        return readConfigFromSettings(ctx.settings!);
    }

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

    function onKeydown(e: KeyboardEvent) {
        if (e.key === "Enter" && !e.isComposing && !dict.loading) {
            e.preventDefault();
            dict.clear();
            void dict.lookup(readConfig());
        }
    }
</script>

<div class="dict">
    <div class="topbar">
        <span class="book"><BookOpen size={13} aria-hidden="true" /></span>
        <span class="title">英英词典</span>
        <div class="spacer"></div>
        <span class="source"
            >{readConfig().channel === "ai" ? "AI" : "API"}</span
        >
    </div>

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
            oninput={(e) => (dict.word = (e.target as HTMLInputElement).value)}
            onkeydown={onKeydown}
        />
    </div>

    <div class="result">
        {#if dict.loading}
            <div class="empty state">
                <span class="spin">
                    <LoaderCircle size={16} aria-hidden="true" />
                </span>
                查询中…
            </div>
        {:else if dict.error}
            <div class="empty error">{dict.error}</div>
        {:else if dict.result}
            {#each dict.result.entries as entry (entry.word)}
                <div class="entry">
                    <div class="head">
                        <span class="word">{entry.word}</span>
                        {#if entry.phonetic}
                            <span class="phonetic">{entry.phonetic}</span>
                        {/if}
                    </div>
                    {#each entry.meanings as m (m.partOfSpeech)}
                        <div class="meaning">
                            <span class="pos"
                                >{#if m.partOfSpeech}{m.partOfSpeech}{:else}·{/if}</span
                            >
                            <ol class="defs">
                                {#each m.definitions as d, i (i)}
                                    <li>
                                        <span class="def-text"
                                            >{d.definition}</span
                                        >
                                        {#if d.example}
                                            <span class="example"
                                                >"{d.example}"</span
                                            >
                                        {/if}
                                        {#if d.synonyms.length > 0}
                                            <span class="syn">
                                                ≈ {d.synonyms
                                                    .slice(0, 4)
                                                    .join(", ")}
                                            </span>
                                        {/if}
                                    </li>
                                {/each}
                            </ol>
                        </div>
                    {/each}
                </div>
            {/each}
        {:else}
            <div class="empty">
                复制单词后切到本卡，自动填入；回车查询英英释义
            </div>
        {/if}
    </div>
</div>

<style>
    .dict {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .topbar {
        display: flex;
        align-items: center;
        gap: 6px;
    }

    .book {
        color: var(--accent);
        display: flex;
    }

    .title {
        font-size: 12px;
        font-weight: 600;
        color: var(--text);
    }

    .spacer {
        flex: 1;
    }

    .source {
        font-size: 10px;
        color: var(--text-muted);
        background: var(--bg-input-focus);
        border-radius: 8px;
        padding: 1px 6px;
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

    .result {
        /* 内容层 pointer-events:none，需在滚动区恢复，否则滚轮/滚动条穿透到拖拽层 */
        pointer-events: auto;
        /* 全局 user-select:none（app.css 防拖选 UI），这里恢复让释义文本可选中复制 */
        user-select: text;
        -webkit-user-select: text;
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .entry {
        display: flex;
        flex-direction: column;
        gap: 6px;
    }

    .head {
        display: flex;
        align-items: baseline;
        gap: 8px;
    }

    .word {
        font-size: 15px;
        font-weight: 700;
        color: var(--text);
    }

    .phonetic {
        font-size: 11px;
        color: var(--text-muted);
    }

    .meaning {
        display: flex;
        gap: 6px;
    }

    .pos {
        flex: none;
        font-size: 10px;
        font-style: italic;
        color: var(--accent);
        background: var(--accent-soft-2);
        border-radius: 4px;
        padding: 1px 5px;
        height: fit-content;
        margin-top: 1px;
    }

    .defs {
        margin: 0;
        padding-left: 16px;
        display: flex;
        flex-direction: column;
        gap: 4px;
    }

    .defs li {
        font-size: 12px;
        color: var(--text);
        line-height: 1.45;
    }

    .def-text {
        word-break: break-word;
    }

    .example {
        display: block;
        font-style: italic;
        color: var(--text-muted);
        font-size: 11px;
        margin-top: 1px;
    }

    .syn {
        display: block;
        font-size: 10px;
        color: var(--text-dim);
        margin-top: 1px;
    }

    .empty {
        color: var(--text-dim);
        text-align: center;
        padding: 12px 0;
        font-size: 12px;
    }

    .empty.error {
        color: var(--danger);
    }

    .empty.state {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        color: var(--text-muted);
    }

    .spin {
        animation: spin 0.9s linear infinite;
    }

    @keyframes spin {
        to {
            transform: rotate(360deg);
        }
    }
</style>
