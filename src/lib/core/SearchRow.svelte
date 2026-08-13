<script lang="ts">
    import { Star } from "lucide-svelte";
    import type { WidgetDefinition } from "$lib/widgets/api/types";

    interface Props {
        widget: WidgetDefinition;
        selected: boolean;
        isFav: boolean;
        /** 悬停选中本行（容器把 selected 置为当前下标）。 */
        onhover: () => void;
        onchoose: () => void;
        onfav: (e: MouseEvent) => void;
    }

    let { widget: w, selected, isFav, onhover, onchoose, onfav }: Props = $props();
</script>

<div class="row" class:selected>
    <button
        type="button"
        class="main"
        class:selected
        onmouseenter={onhover}
        onclick={onchoose}
    >
        <span class="name">{w.manifest.name}</span>
        <span class="kw">{w.manifest.id}</span>
    </button>
    <button
        type="button"
        class="star"
        class:active={isFav}
        onclick={onfav}
        aria-label={isFav ? "取消收藏" : "收藏"}
        title={isFav ? "取消收藏" : "收藏"}
    >
        <Star
            size={11}
            fill={isFav ? "currentColor" : "none"}
            aria-hidden="true"
        />
    </button>
</div>

<style>
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
</style>