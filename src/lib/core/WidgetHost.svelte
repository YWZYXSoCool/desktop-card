<script lang="ts">
    import { onDestroy, onMount } from "svelte";
    import { cubicOut } from "svelte/easing";
    import { invoke } from "@tauri-apps/api/core";
    import { getCurrentWindow } from "@tauri-apps/api/window";
    import {
        activeWidget,
        getWidgets,
        reloadWidgets,
        waitReady,
    } from "$lib/widgets/registry.svelte";
    import { createWidgetContext, hostApis } from "$lib/widgets/api";
    import WidgetSearch from "./WidgetSearch.svelte";
    import Window from "./Window.svelte";
    import { getMenuEntries } from "./menu.svelte";
    import { debounce, restorePosition } from "./window";
    import { checkForUpdate, openUpdateToast } from "./update";
    import { loadCoreSettings, saveWindowPosition } from "./settings";
    import { openSettingsWindow, openSnip } from "./widgetWindows";
    import {
        wireCardMenuClick,
        wireCardMenuOpen,
        wireDragDrop,
        wireKeyboard,
        wireSettingChanged,
        wireCheckUpdate,
        wireWidgetToast,
        wireWidgetsChanged,
        wireWindowMove,
        type Unlisten,
    } from "./hostBus";

    /**
     * 主卡片（main 窗口）宿主：只显示主页 widget（时钟/天气 + 启动器）。
     * widget 不再在主卡片内部轮换，而是从主页启动器在独立窗口打开。
     * 保留：快捷键显隐（Rust）、托盘、位置记忆、自启、中键菜单、设置路由、商店热重载。
     */

    const widget = $derived(activeWidget());

    let dragOver = $state(false);
    let searchOpen = $state(false);
    let hostEl = $state<HTMLDivElement>();

    /** 把已注册菜单项交给 Rust 弹出原生系统菜单（取色项 + widget 功能平铺）。
     *  `screenX`/`screenY` 为全局鼠标钩子上报的屏幕物理坐标。 */
    async function showCardMenu(screenX: number, screenY: number) {
        // 只收 widget 注册的功能（host 系统项不进中键菜单），并用括号标注来源
        const items = getMenuEntries()
            .filter((it) => it.widget !== "host")
            .map((it) => ({
                id: it.id,
                label: `${it.label}（${it.widget}）`,
            }));
        await invoke("show_card_menu", {
            widgetItems: items,
            x: screenX,
            y: screenY,
        });
    }

    /** 请求检查更新；有更新则弹 toast。网络失败静默（不打扰）。 */
    async function checkUpdate(): Promise<void> {
        const u = await checkForUpdate();
        if (u) openUpdateToast(u);
    }

    /** 切换动画：轻微缩放 + 淡入淡出，cubicOut 缓出，避免切换突兀。 */
    function smoothTransition(
        _node: Element,
        { duration = 220 }: { duration?: number } = {},
    ) {
        return {
            duration,
            easing: cubicOut,
            css: (t: number) =>
                `opacity: ${t}; transform: scale(${0.96 + 0.04 * t});`,
        };
    }

    const unlisteners: Array<() => void> = [];

    /** 订阅宿主事件并登记清理函数；监听失败静默忽略（不影响功能）。 */
    function track(us: Unlisten[]): void {
        us.forEach((u) =>
            Promise.resolve(u)
                .then((un) => unlisteners.push(un))
                .catch(() => {}),
        );
    }

    const persistPosition = debounce((x: number, y: number) => {
        saveWindowPosition(x, y).catch(() => {});
    }, 300);

    /** ✕ 收进托盘；彻底退出由托盘右键菜单完成。 */
    function hideToTray() {
        getCurrentWindow().hide();
    }

    $effect(() => {
        const el = hostEl;
        const w = widget;
        if (!el || !w) return;
        const ctx = createWidgetContext(w.manifest, hostApis);
        return w.render.mount(el, ctx);
    });

    onMount(() => {
        // 启动：先等注册表就绪（内置 + 外部扫描），再恢复核心设置与各 widget 状态
        waitReady()
            .then(() => {
                loadCoreSettings()
                    .then(async (s) => {
                        await restorePosition(s.windowX, s.windowY);
                    })
                    .catch(() => {});

                // 所有 widget 的启动回调：各自恢复自己的持久化状态
                getWidgets().forEach((w) =>
                    Promise.resolve(
                        w.setup?.(createWidgetContext(w.manifest, hostApis)),
                    ).catch(() => {}),
                );

                // 启动后台自检更新（不阻塞其它初始化，网络失败静默）
                void checkUpdate();
            })
            .catch(() => {});

        // 窗口移动 → 防抖保存位置
        track(wireWindowMove((x, y) => persistPosition(x, y)));

        // 文件拖拽：enter/over 高亮，drop 判定下放给 widget，leave 复位
        track(
            wireDragDrop({
                onEnterOver: () => {
                    dragOver = true;
                },
                onLeave: () => {
                    dragOver = false;
                },
                onDrop: (paths) => {
                    // 拖拽判定下放给 widget：处理 or 静默忽略
                    const w = activeWidget();
                    w?.onDrop?.(
                        paths,
                        createWidgetContext(w.manifest, hostApis),
                    );
                },
            }),
        );

        // 聚焦时键盘：Ctrl+F 搜索 widget（在独立窗口打开）、Ctrl+S 打开主页设置
        track(
            wireKeyboard({
                onKeyDown: (e) => {
                    if (
                        (e.ctrlKey || e.metaKey) &&
                        e.key.toLowerCase() === "f"
                    ) {
                        e.preventDefault();
                        searchOpen = true;
                    } else if (
                        (e.ctrlKey || e.metaKey) &&
                        e.key.toLowerCase() === "s"
                    ) {
                        e.preventDefault();
                        void openSettingsWindow(activeWidget()?.manifest.id ?? "");
                    }
                },
            }),
        );

        // 托盘「检查更新」：跑既有检查流程并弹 toast
        track(wireCheckUpdate(() => void checkUpdate()));

        // Widget 商店安装/卸载：热重载注册表（新 widget 立即可用）
        track(wireWidgetsChanged(() => void reloadWidgets()));

        // 全局鼠标钩子：长按中键（任意位置）松开后，在光标处弹出系统级菜单
        track(wireCardMenuOpen((sx, sy) => void showCardMenu(sx, sy)));

        // 沙箱内 ctx.toast 触发的通知：转发为卡片 toast
        track(wireWidgetToast());

        // 设置窗口发来的变更：在卡片窗口内应用副作用并持久化（单一写入者）
        track(wireSettingChanged());

        // 系统级菜单（Rust 弹出）的点击：widget 功能按 id 路由；宿主项（截图）在此处理
        track(
            wireCardMenuClick((hostId) => {
                if (hostId === "host:screenshot") void openSnip();
            }),
        );
    });

    onDestroy(() => {
        unlisteners.forEach((u) => u());
        persistPosition.cancel();
    });
</script>

<div class="root">
    <Window
        draggable
        {dragOver}
        dropHint={widget?.manifest.dropHint}
        onClose={hideToTray}
    >
        <!-- 主页内容：由上方 effect 挂进 hostEl（时钟/天气 + 启动器） -->
        <div class="widget-view" transition:smoothTransition bind:this={hostEl}></div>
    </Window>

    {#if searchOpen}
        <WidgetSearch onclose={() => (searchOpen = false)} />
    {/if}
</div>

<style>
    .root {
        position: relative;
        /* 撑满窗口：卡片铺满，内容区由 .widget-view 的 padding 与窗口尺寸共同决定 */
        height: 100%;
    }

    .widget-view {
        position: absolute;
        inset: 0;
        display: flex;
        gap: 10px;
        padding: 12px;
    }
</style>