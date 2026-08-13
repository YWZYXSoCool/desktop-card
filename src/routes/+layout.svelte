<script lang="ts">
    import { onMount } from "svelte";
    import { Toaster } from "svelte-sonner";
    import {
        getTheme,
        listenThemeChanges,
        loadTheme,
    } from "$lib/core/theme.svelte";
    import {
        applyAccent,
        getAccentKey,
        listenAccentChanges,
        loadAccent,
    } from "$lib/core/accent.svelte";
    import "../app.css";

    let { children } = $props();

    // 主题：启动读持久化，变更时同步到 <html data-theme>（CSS 变量据此翻转）
    onMount(() => {
        void loadTheme();
        void loadAccent();
        // 跨窗口联动：其他窗口改了主题/主题色，本窗也同步（独立 webview 内存不共享）
        const offTheme = listenThemeChanges();
        const offAccent = listenAccentChanges();
        return () => {
            offTheme.then((u) => u());
            offAccent.then((u) => u());
        };
    });

    $effect(() => {
        document.documentElement.dataset.theme = getTheme();
    });

    // 主题色：明暗或主题色变更时把强调色 CSS 变量内联写到 <html>（覆盖 app.css 默认）
    $effect(() => {
        // 同时追踪主题与主题色，二者任一变化都重算
        getTheme();
        getAccentKey();
        applyAccent();
    });
</script>

{@render children()}

<!--
    窄窗口（240px）适配：sonner 默认 356px 会溢出，用 CSS 变量收紧宽度，
    并对齐原自写 toast 的蓝底圆角风格。
-->
<Toaster
    position="top-center"
    theme="dark"
    offset="0px"
    style="--width: 216px; --border-radius: 0 0 6px 6px; --normal-bg: var(--accent); --normal-text: var(--on-accent); --normal-border: transparent;"
/>
