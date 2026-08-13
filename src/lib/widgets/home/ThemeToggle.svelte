<script lang="ts">
    import { Moon, Sun } from "lucide-svelte";

    interface Props {
        theme: "dark" | "light";
        ontoggle: () => void;
    }

    let { theme, ontoggle }: Props = $props();
</script>

<button
    type="button"
    class="theme-toggle"
    onclick={ontoggle}
    aria-label="切换明暗主题"
>
    {#if theme === "dark"}
        <Sun size={13} aria-hidden="true" />
    {:else}
        <Moon size={13} aria-hidden="true" />
    {/if}
</button>

<style>
    .theme-toggle {
        pointer-events: auto;
        position: absolute;
        right: 8px;
        bottom: 8px;
        width: 22px;
        height: 22px;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        border: none;
        border-radius: 6px;
        background: transparent;
        color: var(--text-muted);
        cursor: pointer;
        transition:
            color 150ms ease,
            background 150ms ease;
    }

    .theme-toggle:hover {
        color: var(--text);
        background: var(--hover);
    }
</style>