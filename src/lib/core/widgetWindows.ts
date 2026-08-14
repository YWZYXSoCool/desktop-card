import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { toast } from "svelte-sonner";
import { findWidget } from "$lib/widgets/registry.svelte";

/**
 * 窗口管理工具：打开 widget 独立实例窗口 / 设置窗口 / 截图框选窗口。
 * 常量与 WidgetHost / WidgetWindow 共用，保证尺寸一致。
 */

/** widget 独立窗口标题栏高度（既是 设置/钉住/关闭 按钮所在行，也是拖拽把手）。 */
export const HEADER_HEIGHT = 34;
/** 内容四周平台内边距（与 WidgetHost 原 CONTENT_PADDING 一致）。 */
export const CONTENT_PADDING = 12;

/** 打开（或聚焦已存在的）某 widget 的设置窗口：全新窗口、屏幕居中。无设置项的 widget 不打开。 */
export async function openSettingsWindow(widgetId: string): Promise<void> {
    const w = findWidget(widgetId);
    if (!w?.manifest.settings?.length) return; // 无设置项 → 不弹窗
    const existing = await WebviewWindow.getByLabel("settings");
    if (existing) {
        await existing.show();
        await existing.setFocus();
        return;
    }
    const win = new WebviewWindow("settings", {
        url: `/?mode=settings&widget=${widgetId}`,
        title: "设置",
        width: 400,
        height: 460,
        center: true,
        resizable: false,
        // 与主卡片一致的观感：无边框、透明、无阴影，圆角由 CSS 呈现
        alwaysOnTop: true,
        decorations: false,
        transparent: true,
        shadow: false,
        skipTaskbar: true,
    });
    win.once("tauri://error", () => toast("无法打开设置窗口"));
}

/**
 * 打开（或聚焦已存在的）某 widget 的独立窗口：每个 widget 至多一个，重复打开复用已有窗口。
 * 窗口大小 = widget 内容尺寸 + 标题栏 + 四周内边距。钉住逻辑在 WidgetWindow 内。
 */
export async function openWidgetWindow(widgetId: string): Promise<void> {
    const w = findWidget(widgetId);
    if (!w) return;
    const label = `widget-${widgetId}`;
    const existing = await WebviewWindow.getByLabel(label);
    if (existing) {
        await existing.show();
        await existing.setFocus();
        return;
    }
    const s = w.manifest.size;
    const win = new WebviewWindow(label, {
        url: `/?mode=widget&widget=${widgetId}`,
        title: w.manifest.name,
        width: s.width + CONTENT_PADDING * 2,
        height: s.height + HEADER_HEIGHT + CONTENT_PADDING * 2,
        // 统一挂到主卡片（main）下：所有 widget 窗口互为兄弟，不互相持有。
        // 否则从某个 widget 窗口内 Ctrl+F 再开一个时，新窗口会成为它的子窗口，
        // 关闭父窗口会连带关闭子窗口（Tauri 的窗口所有权）——即「关一个其他也没」。
        parent: "main",
        resizable: false,
        // 与主卡片一致的观感：无边框、透明、无阴影、不进任务栏。
        // 默认不置顶；钉住后才置顶（WidgetWindow 内 togglePin 调 setAlwaysOnTop）。
        alwaysOnTop: false,
        decorations: false,
        transparent: true,
        shadow: false,
        skipTaskbar: true,
        dragDropEnabled: true,
    });
    win.once("tauri://error", () => toast("无法打开 widget 窗口"));
}

/** 打开（或聚焦已存在的）全屏截图框选窗口。 */
export async function openSnip(): Promise<void> {
    const existing = await WebviewWindow.getByLabel("snip");
    if (existing) {
        await existing.show();
        await existing.setFocus();
        return;
    }
    const win = new WebviewWindow("snip", {
        url: "/?mode=snip",
        title: "截图",
        fullscreen: true,
        alwaysOnTop: true,
        decorations: false,
        skipTaskbar: true,
    });
    win.once("tauri://error", () => toast("无法打开截图窗口"));
}