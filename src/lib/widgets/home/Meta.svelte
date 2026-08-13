<script lang="ts">
    import { CircleArrowUp } from "lucide-svelte";
    import type { UpdateInfo } from "$lib/core/update";

    interface Props {
        version: string;
        update: UpdateInfo | null;
        onupdate: () => void;
    }

    let { version, update, onupdate }: Props = $props();
</script>

{#if version}
    <span class="version">v{version}</span>
{/if}
{#if update}
    {@const u = update}
    <button
        type="button"
        class="update"
        onclick={onupdate}
        aria-label={`更新到 v${u.latestVersion}`}
        title={`更新到 v${u.latestVersion}`}
    >
        <CircleArrowUp size={12} aria-hidden="true" />
    </button>
{/if}

<style>
    .version {
        font-size: 10px;
        color: var(--text-dim);
        font-variant-numeric: tabular-nums;
        line-height: 1;
    }

    .update {
        pointer-events: auto;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 18px;
        height: 18px;
        padding: 0;
        border: none;
        border-radius: 5px;
        background: transparent;
        color: var(--accent, #4c9aff);
        cursor: pointer;
        transition:
            color 150ms ease,
            background 150ms ease;
    }

    .update:hover {
        color: var(--text);
        background: var(--hover);
    }
</style>