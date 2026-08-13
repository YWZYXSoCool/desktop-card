import { emit, listen } from "@tauri-apps/api/event";
import { store } from "./settings";

/**
 * 全局明暗主题（响应式 $state + 持久化到共享 settings.json 的 `theme.mode` 键）。
 * 布局层据此设置 `<html data-theme>`，各组件经 CSS 变量随主题翻转。
 * 主页右下角的切换按钮直接 import 本模块操控。
 *
 * 注意：Svelte 5 禁止「导出被重赋值的模块级 $state」，故用 getTheme() 读取、
 * toggleTheme() 修改（在 $derived / $effect / 模板里调用 getTheme() 都会被响应式追踪）。
 */
export type ThemeMode = "dark" | "light";

let mode = $state<ThemeMode>("dark");

/** 读取当前主题（响应式：在 $derived / 模板中调用可追踪）。 */
export function getTheme(): ThemeMode {
    return mode;
}

/** 启动时读取持久化主题；缺键回落深色。 */
export async function loadTheme(): Promise<void> {
    const saved = await store.get<ThemeMode>("theme.mode");
    mode = saved === "light" ? "light" : "dark";
}

/** 切换明暗并持久化 + 广播到其他窗口（写失败/广播失败静默）。 */
export function toggleTheme(): void {
    mode = mode === "dark" ? "light" : "dark";
    store.set("theme.mode", mode).catch(() => {});
    emit("desktop-card:theme-changed", mode).catch(() => {});
}

/**
 * 监听其他窗口的主题变更事件，同步到本窗内存（每个窗口是独立 webview，
 * 模块级 $state 不共享，需经事件联动）。返回取消监听函数，随布局卸载调用。
 */
export function listenThemeChanges(): () => void {
    return listen("desktop-card:theme-changed", (e) => {
        mode = e.payload === "light" ? "light" : "dark";
    });
}