<script lang="ts">
    import { page } from "$app/state";
    import WidgetHost from "$lib/core/WidgetHost.svelte";
    import SettingsPage from "$lib/core/SettingsPage.svelte";

    // 设置窗口以 ?mode=settings 加载同一入口，命中时渲染设置页而非卡片
    const isSettings = $derived(
        page.url.searchParams.get("mode") === "settings",
    );
    const widgetId = $derived(page.url.searchParams.get("widget") ?? "");
</script>

{#if isSettings}
    <SettingsPage {widgetId} />
{:else}
    <WidgetHost />
{/if}
