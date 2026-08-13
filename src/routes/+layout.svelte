<script lang="ts">
    import { onMount } from "svelte";
    import { Toaster } from "svelte-sonner";
    import { getTheme, loadTheme } from "$lib/core/theme.svelte";
    import "../app.css";

    let { children } = $props();

    // 主题：启动读持久化，变更时同步到 <html data-theme>（CSS 变量据此翻转）
    onMount(() => {
        void loadTheme();
    });

    $effect(() => {
        document.documentElement.dataset.theme = getTheme();
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
    style="--width: 216px; --border-radius: 0 0 6px 6px; --normal-bg: rgba(91, 141, 239, 0.92); --normal-text: #f2f2f5; --normal-border: transparent;"
/>
