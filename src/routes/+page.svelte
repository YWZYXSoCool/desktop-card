<script lang="ts">
    import { page } from "$app/state";
    import WidgetHost from "$lib/core/WidgetHost.svelte";
    import SettingsPage from "$lib/core/SettingsPage.svelte";
    import StorePage from "$lib/core/StorePage.svelte";
    import WidgetWindow from "$lib/core/WidgetWindow.svelte";
    import SnipOverlay from "$lib/core/SnipOverlay.svelte";

    // 设置窗口以 ?mode=settings 加载同一入口，命中时渲染设置页而非卡片
    const isSettings = $derived(
        page.url.searchParams.get("mode") === "settings",
    );
    // Widget 商店窗口以 ?mode=store 加载同一入口
    const isStore = $derived(page.url.searchParams.get("mode") === "store");
    // 独立 widget 窗口以 ?mode=widget&widget=<id>&inst=<n> 加载
    const isWidget = $derived(
        page.url.searchParams.get("mode") === "widget",
    );
    // 截图框选覆盖层以 ?mode=snip 加载（全屏窗口）
    const isSnip = $derived(page.url.searchParams.get("mode") === "snip");
    const widgetId = $derived(page.url.searchParams.get("widget") ?? "");
</script>

{#if isSnip}
    <SnipOverlay />
{:else if isSettings}
    <SettingsPage {widgetId} />
{:else if isStore}
    <StorePage />
{:else if isWidget}
    <WidgetWindow />
{:else}
    <WidgetHost />
{/if}
