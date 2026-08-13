<script lang="ts">
    import { LoaderCircle, Star } from "lucide-svelte";
    import type { ApiEntry } from "./dictionary.svelte";

    /** 每个词条附上收藏态（容器从 dict.isFavorite 算好下传）。 */
    type Entry = ApiEntry & { isFav: boolean };

    interface Props {
        loading: boolean;
        error: string;
        entries: Entry[];
        onfav: (word: string) => void;
    }

    let { loading, error, entries, onfav }: Props = $props();
</script>

<div class="result">
    {#if loading}
        <div class="empty state">
            <span class="spin">
                <LoaderCircle size={16} aria-hidden="true" />
            </span>
            查询中…
        </div>
    {:else if error}
        <div class="empty error">{error}</div>
    {:else if entries.length}
        {#each entries as entry (entry.word)}
            <div class="entry">
                <div class="head">
                    <span class="word">{entry.word}</span>
                    {#if entry.phonetic}
                        <span class="phonetic">{entry.phonetic}</span>
                    {/if}
                    <div class="head-spacer"></div>
                    <button
                        type="button"
                        class="fav"
                        class:active={entry.isFav}
                        onclick={() => onfav(entry.word)}
                        aria-label={entry.isFav ? "取消收藏" : "收藏"}
                        title={entry.isFav ? "取消收藏" : "收藏"}
                    >
                        <Star
                            size={12}
                            fill={entry.isFav ? "currentColor" : "none"}
                            aria-hidden="true"
                        />
                    </button>
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

<style>
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
        align-items: center;
        gap: 8px;
    }

    .head-spacer {
        flex: 1;
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

    .fav {
        pointer-events: auto;
        flex: none;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 20px;
        height: 20px;
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

    .fav:hover {
        color: var(--accent);
        background: var(--hover);
    }

    .fav.active {
        color: #f5c211;
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