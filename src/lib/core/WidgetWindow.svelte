<script lang="ts">
    import { onDestroy, onMount } from "svelte";
    import { page } from "$app/state";
    import { getCurrentWindow } from "@tauri-apps/api/window";
    import { toast } from "svelte-sonner";
    import { findWidget, waitReady } from "$lib/widgets/registry.svelte";
    import { createWidgetContext, hostApis } from "$lib/widgets/api";
    import { widgetStore } from "./settings";
    import Window from "./Window.svelte";
    import WidgetSearch from "./WidgetSearch.svelte";
    import { debounce, restorePositionAt, watchMovedAt } from "./window";
    import { openSettingsWindow } from "./widgetWindows";

    /**
     * 独立 widget 窗口宿主（`?mode=widget&widget=<id>`，每 widget 至多一个窗口）。
     * 顶部标题栏：设置 / 钉住 / 关闭。位置按 widget 记忆（多显示器越界回落居中）。
     */

    const widgetId = $derived(page.url.searchParams.get("widget") ?? "");
    const widget = $derived(findWidget(widgetId));

    let hostEl = $state<HTMLDivElement>();
    let searchOpen = $state(false);
    // 钉住：读/写 store `window.widget.<id>.pinned`（重启后保留）。
    let pinned = $state(false);

    const win = getCurrentWindow();

    const persistPosition = debounce((x: number, y: number) => {
        widgetStore
            .set(`window.widget.${widgetId}.x`, x)
            .then(() => widgetStore.set(`window.widget.${widgetId}.y`, y))
            .catch(() => {});
    }, 300);

    function close() {
        win.close().catch(() => {});
    }

    function togglePin() {
        pinned = !pinned;
        // 钉住 ⇄ 置顶：真正切换窗口的 always-on-top（而非仅视觉高亮）
        win.setAlwaysOnTop(pinned).catch(() => {});
        widgetStore
            .set(`window.widget.${widgetId}.pinned`, pinned)
            .catch(() => {});
    }

    async function openSettings() {
        await openSettingsWindow(widgetId);
    }

    const unlisteners: Array<() => void> = [];

    function track(u: Promise<() => void>): void {
        Promise.resolve(u)
            .then((un) => unlisteners.push(un))
            .catch(() => {});
    }

    $effect(() => {
        const el = hostEl;
        const w = widget;
        if (!el || !w) return;
        const ctx = createWidgetContext(w.manifest, hostApis);
        // 独立窗口也要跑 setup：剪贴板等 widget 靠 setup 拉历史 + 订阅宿主广播，
        // 否则多开窗口里历史为空且不随复制实时更新（与 WidgetHost 的启动回调对齐）。
        Promise.resolve(w.setup?.(ctx)).catch(() => {});
        return w.render.mount(el, ctx);
    });

    onMount(async () => {
        // 等注册表就绪（内置 + 外部扫描），widget 定义就位后 $effect 自动挂载
        await waitReady();

        // 钉住态恢复：置顶态随钉住态一起应用（窗口默认不置顶）
        widgetStore
            .get<boolean>(`window.widget.${widgetId}.pinned`, false)
            .then((p) => {
                pinned = p;
                win.setAlwaysOnTop(p).catch(() => {});
            })
            .catch(() => {});

        // 位置恢复（多显示器越界回落居中）
        Promise.all([
            widgetStore.get<number | null>(`window.widget.${widgetId}.x`, null),
            widgetStore.get<number | null>(`window.widget.${widgetId}.y`, null),
        ])
            .then(([x, y]) => restorePositionAt(win, x, y))
            .catch(() => {});
        track(watchMovedAt(win, (x, y) => persistPosition(x, y)));

        // 文件拖拽：判定下放给 widget
        track(
            win.onDragDropEvent((e) => {
                const p = e.payload;
                if (p.type === "drop" && p.paths?.length) {
                    widget?.onDrop?.(
                        p.paths,
                        createWidgetContext(widget.manifest, hostApis),
                    );
                }
            }),
        );
    });

    // Esc 关闭窗口；Ctrl+F 搜索 widget（在独立窗口打开）
    function onKeydown(e: KeyboardEvent) {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
            e.preventDefault();
            searchOpen = true;
        } else if (e.key === "Escape") {
            if (searchOpen) searchOpen = false;
            else close();
        }
    }

    onDestroy(() => {
        unlisteners.forEach((u) => u());
        persistPosition.cancel();
    });
</script>

<svelte:window onkeydown={onKeydown} />

<Window
    title={widget?.manifest.name ?? "widget"}
    draggable={false}
    {pinned}
    onPin={togglePin}
    onSettings={() => void openSettings()}
    onClose={close}
>
    <div class="widget-view" bind:this={hostEl}></div>
</Window>

{#if searchOpen}
    <WidgetSearch onclose={() => (searchOpen = false)} />
{/if}

<style>
    .widget-view {
        position: relative;
        flex: 1;
        min-height: 0;
        display: flex;
        gap: 10px;
        padding: 12px;
    }
</style>