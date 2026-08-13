<script lang="ts">
    import { Music2 } from "lucide-svelte";

    interface Props {
        coverUrl: string | null;
        idle: boolean;
        onplay: () => void;
    }

    let { coverUrl, idle, onplay }: Props = $props();
</script>

<button
    class="cover"
    class:idle
    onclick={onplay}
    disabled={idle}
    aria-label="播放或暂停"
>
    {#if coverUrl}
        <img class="cover-img" src={coverUrl} alt="专辑封面" />
    {:else}
        <Music2 size={26} strokeWidth={1.5} aria-hidden="true" />
    {/if}
</button>

<style>
    .cover {
        pointer-events: auto;
        flex: none;
        width: 64px;
        height: 64px;
        margin-top: 4px;
        display: flex;
        align-items: center;
        justify-content: center;
        border: none;
        border-radius: 8px;
        background: var(--bg-input);
        color: var(--accent);
        cursor: pointer;
        transition:
            background 150ms ease,
            color 150ms ease;
    }

    .cover:hover:not(:disabled) {
        background: var(--bg-input-focus);
    }

    .cover.idle {
        color: var(--text-muted);
        cursor: default;
    }

    .cover-img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        border-radius: 8px;
    }
</style>