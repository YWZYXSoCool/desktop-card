<script lang="ts">
    import { onDestroy, onMount } from "svelte";
    import { cubicOut } from "svelte/easing";
    import { invoke } from "@tauri-apps/api/core";
    import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
    import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
    import { toast } from "svelte-sonner";
    import {
        activeWidget,
        cycleWidget,
        getWidgets,
        goMain,
        waitReady,
    } from "$lib/widgets/registry.svelte";
    import { createWidgetContext, hostApis } from "$lib/widgets/api";
    import WidgetSearch from "./WidgetSearch.svelte";
    import Window from "./Window.svelte";
    import { getMenuEntries } from "./menu.svelte";
    import { debounce, restorePosition } from "./window";
    import { checkForUpdate, openUpdateToast } from "./update";
    import { loadCoreSettings, saveWindowPosition } from "./settings";
    import {
        wireCardMenuClick,
        wireCardMenuOpen,
        wireDragDrop,
        wireKeyboard,
        wireOpenSearch,
        wireSettingChanged,
        wireCheckUpdate,
        wireWidgetToast,
        wireWindowMove,
        type Unlisten,
    } from "./hostBus";

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

    /** 打开（或聚焦已存在的）设置窗口：全新窗口、屏幕居中。无设置项的 widget 不打开。 */
    async function openSettings() {
        const w = activeWidget();
        if (!w?.manifest.settings?.length) return; // 无设置项 → 不弹窗
        const existing = await WebviewWindow.getByLabel("settings");
        if (existing) {
            await existing.show();
            await existing.setFocus();
            return;
        }
        const win = new WebviewWindow("settings", {
            url: `/?mode=settings&widget=${activeWidget()?.manifest.id}`,
            title: "设置",
            width: 320,
            height: 200,
            center: true,
            resizable: false,
            // 与主卡片一致的观感：无边框、透明、无阴影，圆角由 CSS 呈现
            decorations: false,
            transparent: true,
            shadow: false,
            skipTaskbar: true,
        });
        win.once("tauri://error", () => toast("无法打开设置窗口"));
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

    // 窗口尺寸 = widget 声明的内容尺寸 + 平台内边距（四周各 12px）。
    // widget 的 size 只决定内容区大小，卡片/窗口在四周留出平台 padding。
    // 与渲染同 effect：widget 切换时保证 resize 与内容替换同步发生。
    const CONTENT_PADDING = 12;
    /** 程序化改大小：临时可缩放保证 setSize 生效，随后立刻恢复不可缩放，避免用户拖拽。 */
    async function resizeToWidget(s: { width: number; height: number }) {
        const win = getCurrentWindow();
        const target = new LogicalSize(
            s.width + CONTENT_PADDING * 2,
            s.height + CONTENT_PADDING * 2,
        );
        try {
            await win.setResizable(true);
            await win.setSize(target);
            await win.setResizable(false);
        } catch (e) {
            console.warn("[WidgetHost] resize failed", e);
        }
    }
    $effect(() => {
        const el = hostEl;
        const w = widget;
        if (!el || !w) return;
        const s = w.manifest.size;
        resizeToWidget(s);
        const ctx = createWidgetContext(w.manifest, hostApis);
        return w.render.mount(el, ctx);
    });

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

    onMount(() => {
        // 启动：先等注册表就绪（内置 + 外部扫描），再恢复核心设置与各 widget 状态
        waitReady()
            .then(() => {
                loadCoreSettings()
                    .then(async (s) => {
                        await restorePosition(s.windowX, s.windowY);
                    })
                    .catch(() => {});

                // 所有 widget 的启动回调：各自恢复自己的持久化状态（切换时无需再初始化）
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
                onDrop: (path) => {
                    // 拖拽判定下放给 widget：处理 or 静默忽略
                    const w = activeWidget();
                    w?.onDrop?.(
                        path,
                        createWidgetContext(w.manifest, hostApis),
                    );
                },
            }),
        );

        // 聚焦时键盘：Tab 循环切换 widget，Ctrl+F 搜索，Ctrl+S 打开设置窗口
        track(
            wireKeyboard({
                onKeyDown: (e) => {
                    if (e.key === "Tab") {
                        if (searchOpen) return; // 搜索打开时 Tab 让位
                        e.preventDefault();
                        cycleWidget();
                    } else if (
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
                        openSettings();
                    } else if (e.key === "Home") {
                        if (searchOpen) return; // 搜索打开时 Home 让位（输入框光标）
                        e.preventDefault();
                        goMain();
                    }
                },
            }),
        );

        // 全局快捷键唤起：显示后自动打开搜索页
        track(wireOpenSearch(() => (searchOpen = true)));

        // 托盘「检查更新」：跑既有检查流程并弹 toast
        track(wireCheckUpdate(() => void checkUpdate()));

        // 全局鼠标钩子：长按中键（任意位置）松开后，在光标处弹出系统级菜单
        track(wireCardMenuOpen((sx, sy) => void showCardMenu(sx, sy)));

        // 沙箱内 ctx.toast 触发的通知：转发为卡片 toast
        track(wireWidgetToast());

        // 设置窗口发来的变更：在卡片窗口内应用副作用并持久化（单一写入者）
        track(wireSettingChanged());

        // 系统级菜单（Rust 弹出）的点击：按 id 路由到对应 widget 动作
        track(wireCardMenuClick());
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
        {#key widget?.manifest.id}
            <!-- 切换动画：key 变化时旧 widget 缩放淡出、新 widget 缩放淡入（绝对定位叠层交叉）。
                 widget 内容由上方 effect 挂进 hostEl。 -->
            <div
                class="widget-view"
                transition:smoothTransition
                bind:this={hostEl}
            ></div>
        {/key}
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

    /* 绝对定位叠层：交叉淡出时新旧 widget 重叠而非并排，保证动画顺滑 */
    .widget-view {
        position: absolute;
        inset: 0;
        display: flex;
        gap: 10px;
        padding: 12px;
    }
</style>