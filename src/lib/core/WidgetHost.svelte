<script lang="ts">
    import { onDestroy, onMount } from "svelte";
    import { cubicOut } from "svelte/easing";
    import { invoke } from "@tauri-apps/api/core";
    import { listen } from "@tauri-apps/api/event";
    import { getCurrentWebview } from "@tauri-apps/api/webview";
    import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
    import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
    import { openUrl } from "@tauri-apps/plugin-opener";
    import { toast } from "svelte-sonner";
    import {
        activeWidget,
        cycleWidget,
        getWidgets,
        goMain,
        setActiveWidget,
        waitReady,
    } from "$lib/widgets/registry.svelte";
    import { createWidgetContext, hostApis } from "$lib/widgets/api";
    import { requestColorPick } from "$lib/widgets/color/pickSignal.svelte";
    import WidgetSearch from "./WidgetSearch.svelte";
    import Window from "./Window.svelte";
    import { getMenuEntries, registerMenuEntry } from "./menu.svelte";
    import { debounce, restorePosition, watchMoved } from "./window";
    import {
        applyAutostart,
        loadCoreSettings,
        saveWindowPosition,
        widgetStore,
    } from "./settings";

    const widget = $derived(activeWidget());

    let dragOver = $state(false);
    let searchOpen = $state(false);
    let hostEl = $state<HTMLDivElement>();

    /** 把已注册菜单项交给 Rust 弹出原生系统菜单（取色项 + widget 功能平铺）。
     *  `screenX`/`screenY` 为全局鼠标钩子上报的屏幕物理坐标。 */
    async function showCardMenu(screenX: number, screenY: number) {
        const items = getMenuEntries().map((it) => ({
            id: it.id,
            label: it.label,
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

    /** 更新检查结果（对应 Rust `update.rs` 的 UpdateInfo）。 */
    interface UpdateInfo {
        updateAvailable: boolean;
        currentVersion: string;
        latestVersion: string;
        assetName: string | null;
        assetUrl: string | null;
        releaseUrl: string;
    }

    /** 请求检查更新；有更新则弹提示。网络失败静默（不打扰）。 */
    async function checkUpdate(): Promise<void> {
        try {
            const u = await invoke<UpdateInfo>("check_for_update");
            if (u.updateAvailable) showUpdateToast(u);
        } catch {
            // 静默：占位仓库 / 无网络时不打扰用户
        }
    }

    /** 有新版本：toast + 操作按钮（下载安装；找不到安装包则退化打开 Releases 页）。 */
    function showUpdateToast(u: UpdateInfo) {
        const label = `下载并安装 v${u.latestVersion}`;
        if (u.assetUrl) {
            toast(`发现新版本 v${u.latestVersion}`, {
                action: { label, onClick: () => startDownload(u) },
                duration: 20000,
            });
        } else {
            toast(`发现新版本 v${u.latestVersion}`, {
                action: {
                    label: "打开 Releases 页",
                    onClick: () => openUrl(u.releaseUrl).catch(() => {}),
                },
                duration: 20000,
            });
        }
    }

    /** 下载安装包：loading toast + 进度更新，成功后 Rust 侧启动安装器并退出主程序。 */
    async function startDownload(u: UpdateInfo) {
        const id = toast.loading(`正在下载 v${u.latestVersion}…`);
        const unlisten = await listen<{ received: number; total: number }>(
            "update-download-progress",
            (e) => {
                const { received, total } = e.payload;
                const mb = (b: number) => (b / 1024 / 1024).toFixed(1);
                const text = total
                    ? `正在下载 v${u.latestVersion}… ${Math.round((received / total) * 100)}% (${mb(received)}/${mb(total)} MB)`
                    : `正在下载 v${u.latestVersion}… ${mb(received)} MB`;
                toast(text, { id });
            },
        );
        try {
            await invoke("download_and_install", { assetUrl: u.assetUrl });
            toast.success("更新已下载，正在安装…", { id });
        } catch (e) {
            unlisten();
            toast.error(`下载失败：${String(e)}`, { id });
        }
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
    function track(sub: Promise<() => void>): void {
        sub.then((u) => unlisteners.push(u)).catch(() => {});
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
        track(watchMoved((x, y) => persistPosition(x, y)));

        // 右键菜单「检查更新」：手动重查新版本
        unlisteners.push(registerMenuEntry("host", "检查更新", () => void checkUpdate()));

        // 文件拖拽：enter/over 高亮，drop 交给当前 widget 判定/处理，leave 复位
        track(
            getCurrentWebview().onDragDropEvent((e) => {
                const p = e.payload;
                if (p.type === "enter" || p.type === "over") {
                    dragOver = true;
                } else if (p.type === "leave") {
                    dragOver = false;
                } else if (p.type === "drop") {
                    dragOver = false;
                    const path = p.paths?.[0];
                    if (!path) return;
                    // 拖拽判定下放给 widget：处理 or 静默忽略
                    const w = activeWidget();
                    w?.onDrop?.(
                        path,
                        createWidgetContext(w.manifest, hostApis),
                    );
                }
            }),
        );

        // 聚焦时键盘：Tab 循环切换 widget，Ctrl+F 搜索，Ctrl+S 打开设置窗口
        const onKeyDown = (e: KeyboardEvent) => {
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
        };
        document.addEventListener("keydown", onKeyDown);
        unlisteners.push(() =>
            document.removeEventListener("keydown", onKeyDown),
        );

        // 全局快捷键唤起：显示后自动打开搜索页
        track(
            listen("open-search", () => {
                searchOpen = true;
            }),
        );

        // 全局鼠标钩子：长按中键（任意位置）松开后，在光标处弹出系统级菜单
        track(
            listen<{ 0: number; 1: number } | [number, number]>(
                "card-menu-open",
                (e) => {
                    const [sx, sy] = Array.isArray(e.payload)
                        ? e.payload
                        : [e.payload[0], e.payload[1]];
                    void showCardMenu(sx, sy);
                },
            ),
        );

        // 沙箱内 ctx.toast 触发的通知：转发为卡片 toast
        track(
            listen<{ msg: string; kind: string }>("widget-toast", (e) => {
                const { msg, kind } = e.payload;
                if (kind === "error") toast.error(msg);
                else toast(msg);
            }),
        );

        // 设置窗口发来的变更：在卡片窗口内应用副作用并持久化（单一写入者）。
        // 主页里声明的主机级设置（开机自启 / 全局快捷键）由宿主负责应用，且只在成功后才落库。
        track(
            listen<{ widgetId: string; key: string; value: unknown }>(
                "widget-setting-changed",
                (e) => {
                    const { widgetId, key, value } = e.payload;
                    const w = getWidgets().find((x) => x.manifest.id === widgetId);

                    if (key === "autostart.enabled") {
                        // 开机自启：applyAutostart 注册/注销系统并自行持久化（失败仅提示）
                        void applyAutostart(Boolean(value)).catch(() =>
                            toast.error("开机自启设置失败"),
                        );
                        return;
                    }
                    if (key === "global.shortcut") {
                        // 自定义快捷键：Rust 校验 + 注册 + 持久化（失败仅提示，旧键不变）
                        void invoke("set_toggle_shortcut", {
                            shortcut: String(value),
                        }).catch(() => toast.error("快捷键无效"));
                        return;
                    }

                    if (w) {
                        w.onSettingChange?.(
                            key,
                            value,
                            createWidgetContext(w.manifest, hostApis),
                        );
                    }
                    widgetStore.set(key, value).catch(() => {});
                },
            ),
        );

        // 系统级菜单（Rust 弹出）的点击：按 id 路由到各动作，执行后夺回卡片焦点
        track(
            listen<string>("card-menu-click", (e) => {
                const id = e.payload;
                if (id === "color-pick") {
                    // 取色：切到颜色 widget 并请求取色（ColorPage 挂载后消费并调起吸管）
                    setActiveWidget("color-picker");
                    requestColorPick();
                } else {
                    getMenuEntries().find((it) => it.id === id)?.action();
                }
                getCurrentWindow().setFocus().catch(() => {});
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
