<script lang="ts">
    import { Moon, Sun } from "lucide-svelte";
    import { cubicOut } from "svelte/easing";
    import { scale } from "svelte/transition";

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
    {#key theme}
        <!-- key 变化（明暗切换）时旧图标缩出、新图标从 0.3 弹入 -->
        <span
            class="icon-shell"
            in:scale={{ start: 0.3, duration: 200, easing: cubicOut }}
        >
            {#if theme === "dark"}
                <Sun size={13} aria-hidden="true" />
            {:else}
                <Moon size={13} aria-hidden="true" />
            {/if}
        </span>
    {/key}
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

    .theme-toggle:active {
        transform: scale(0.9);
    }

    .icon-shell {
        display: flex;
    }
</style>