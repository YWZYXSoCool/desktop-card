import type {
    WidgetContext,
    WidgetManifest,
    WidgetPermission,
    WidgetStore,
    WidgetToast,
} from "./types";
import { registerMenuEntry } from "$lib/core/menu.svelte";

/**
 * 宿主特权实现：真正能碰 Tauri / 窗口 / 持久化的对象，只在这里集中，
 * 绝不让 widget 直接拿到。widget 只能通过 `createWidgetContext` 得到
 * 一份按 manifest.permissions 过滤后的副本。
 */
export interface HostApis {
    store: WidgetStore;
    toast: WidgetToast;
}

/** 每种权限 → 从宿主抽取出下放对象。返回 undefined 表示该权限不下放任何东西。 */
const PROVIDERS: Record<
    WidgetPermission,
    (host: HostApis, manifest: WidgetManifest) => unknown
> = {
    // 持久化：把 store 句柄下放给申请者
    store: (host) => host.store,
    // 设置项：由宿主统一渲染设置面板并回调 onSettingChange，无需下放运行对象
    settings: () => undefined,
    // 拖拽：只下放提示文案（onDrop 由 manifest 声明后宿主回调）
    drop: (_host, manifest) => ({ hint: manifest.dropHint ?? "" }),
    // 通知
    toast: (host) => host.toast,
    // 右键菜单：走全局注册表（handler 进卡片右键菜单的「widget 功能」子菜单）
    menu: (_host, manifest) => ({
        add: (label: string, action: () => void) =>
            registerMenuEntry(manifest.name, label, action),
    }),
    // 保留，默认不开放
    window: () => undefined,
    execute: () => undefined,
};

/**
 * 按 widget 的 manifest.permissions 构建权限作用域上下文。
 * 只把声明过的能力放进返回对象，其余键保持 undefined —— 未声明的拿不到。
 */
export function createWidgetContext(
    manifest: WidgetManifest,
    host: HostApis,
): WidgetContext {
    const ctx: WidgetContext = {};
    for (const p of manifest.permissions ?? []) {
        const provide = PROVIDERS[p];
        if (!provide) continue;
        const value = provide(host, manifest);
        if (value !== undefined) {
            ctx[p as keyof WidgetContext] = value as never;
        }
    }
    return ctx;
}