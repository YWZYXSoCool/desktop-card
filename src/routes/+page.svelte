<script lang="ts">
    import { page } from "$app/state";
    import WidgetHost from "$lib/core/WidgetHost.svelte";
    import SettingsPage from "$lib/core/SettingsPage.svelte";
    import StorePage from "$lib/core/StorePage.svelte";

    // 设置窗口以 ?mode=settings 加载同一入口，命中时渲染设置页而非卡片
    const isSettings = $derived(
        page.url.searchParams.get("mode") === "settings",
    );
    // Widget 商店窗口以 ?mode=store 加载同一入口
    const isStore = $derived(page.url.searchParams.get("mode") === "store");
    const widgetId = $derived(page.url.searchParams.get("widget") ?? "");
</script>

{#if isSettings}
    <SettingsPage {widgetId} />
{:else if isStore}
    <StorePage />
{:else}
    <WidgetHost />
{/if}
