<script lang="ts">
    import { getCurrentWindow } from "@tauri-apps/api/window";
    import { findWidget, waitReady } from "$lib/widgets/registry.svelte";
    import SettingsPanel from "./SettingsPanel.svelte";
    import Window from "./Window.svelte";

    let { widgetId }: { widgetId: string } = $props();
    let widget = $state<ReturnType<typeof findWidget>>();

    $effect(() => {
        waitReady().then(() => {
            widget = findWidget(widgetId);
        });
    });

    function onKeydown(e: KeyboardEvent) {
        if (e.key === "Escape") getCurrentWindow().close();
    }

    function onClose() {
        getCurrentWindow().close();
    }
</script>

<svelte:window onkeydown={onKeydown} />

<!-- 面板模式：标题栏可拖拽移动窗口，内容为交互式设置项 -->
<Window
    title={widget?.manifest.name ?? "设置"}
    draggable={false}
    onClose={onClose}
>
    {#if widget}
        <SettingsPanel {widget} />
    {:else}
        <div class="empty">未知 widget</div>
    {/if}
</Window>

<style>
    .empty {
        color: var(--text-muted);
        font-size: 13px;
        text-align: center;
        padding: 12px 0;
    }
</style>
