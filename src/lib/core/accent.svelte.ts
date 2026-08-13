import { emit, listen } from "@tauri-apps/api/event";
import { store } from "./settings";
import { getTheme } from "./theme.svelte";

/**
 * 全局主题色（强调色）：响应式 $state + 持久化到 `theme.accent` 键。
 * 提供一组固定主题色预设，布局层据此把强调色 CSS 变量内联写到
 * `<html style>`（内联样式覆盖 :root 与 :root[data-theme="light"] 两条规则，
 * 因此主题切换时也要按当前明暗重新应用）。
 *
 * 与 theme.svelte 同款约定：禁止导出被重赋值的模块级 $state，
 * 用 getAccentKey() 读取、setAccent() 修改（都会被响应式追踪）。
 */
export interface AccentColors {
    accent: string;
    accent2: string;
    accentText: string;
}

export interface AccentPalette {
    label: string;
    dark: AccentColors;
    light: AccentColors;
}

/** 固定主题色预设：key → 明暗两套强调色族。 */
export const ACCENTS: Record<string, AccentPalette> = {
    blue: {
        label: "蓝（默认）",
        dark: { accent: "#5b8def", accent2: "#7ba4f3", accentText: "#8fb0f5" },
        light: { accent: "#4a7bd6", accent2: "#3f6fd6", accentText: "#3f6fd6" },
    },
    purple: {
        label: "紫",
        dark: { accent: "#a78bfa", accent2: "#c4b0fc", accentText: "#d1c2fd" },
        light: { accent: "#7c5cd6", accent2: "#6a4bc4", accentText: "#6a4bc4" },
    },
    teal: {
        label: "青",
        dark: { accent: "#2dd4bf", accent2: "#5eead4", accentText: "#7df2e0" },
        light: { accent: "#0d9488", accent2: "#0b8378", accentText: "#0b8378" },
    },
    green: {
        label: "绿",
        dark: { accent: "#34d399", accent2: "#6ee7b7", accentText: "#8becc6" },
        light: { accent: "#0f9d58", accent2: "#0d8a4c", accentText: "#0d8a4c" },
    },
    orange: {
        label: "橙",
        dark: { accent: "#fb923c", accent2: "#fbb276", accentText: "#fcc396" },
        light: { accent: "#d97706", accent2: "#c26a05", accentText: "#c26a05" },
    },
    red: {
        label: "红",
        dark: { accent: "#f87171", accent2: "#fca5a5", accentText: "#fdc2c2" },
        light: { accent: "#dc2626", accent2: "#c41f1f", accentText: "#c41f1f" },
    },
    pink: {
        label: "粉",
        dark: { accent: "#f472b6", accent2: "#f9a8d4", accentText: "#fbc3e0" },
        light: { accent: "#db2777", accent2: "#c6246c", accentText: "#c6246c" },
    },
    gold: {
        label: "金",
        dark: { accent: "#fbbf24", accent2: "#fcd34d", accentText: "#fde68a" },
        light: { accent: "#ca8a04", accent2: "#b57c03", accentText: "#b57c03" },
    },
};

/** 主页设置项下拉用的固定选项（value = 预设 key）。 */
export const ACCENT_OPTIONS = Object.entries(ACCENTS).map(([value, p]) => ({
    label: p.label,
    value,
}));

/** 默认主题色（与 app.css 的 :root 保持一致）。 */
const DEFAULT_ACCENT = "blue";

let accentKey = $state<string>(DEFAULT_ACCENT);

/** 读取当前主题色 key（响应式：在 $derived / 模板中调用可追踪）。 */
export function getAccentKey(): string {
    return accentKey;
}

/** 启动时读取持久化主题色；缺键回落默认。 */
export async function loadAccent(): Promise<void> {
    const saved = await store.get<string>("theme.accent");
    accentKey = saved && ACCENTS[saved] ? saved : DEFAULT_ACCENT;
}

/** 设置主题色并持久化 + 广播到其他窗口（写失败/广播失败静默）。 */
export function setAccent(key: string): void {
    if (!ACCENTS[key]) return;
    accentKey = key;
    store.set("theme.accent", key).catch(() => {});
    emit("desktop-card:accent-changed", key).catch(() => {});
}

/**
 * 监听其他窗口的主题色变更事件，同步到本窗内存（每个窗口是独立 webview，
 * 模块级 $state 不共享，需经事件联动）。返回取消监听函数，随布局卸载调用。
 */
export function listenAccentChanges(): () => void {
    return listen("desktop-card:accent-changed", (e) => {
        const key = e.payload as string;
        if (ACCENTS[key]) accentKey = key;
    });
}

/** hex → rgba() 字符串，用于推导 --accent-soft / --accent-soft-2。 */
function rgba(hex: string, alpha: number): string {
    const n = parseInt(hex.slice(1), 16);
    const r = (n >> 16) & 0xff;
    const g = (n >> 8) & 0xff;
    const b = n & 0xff;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * 把当前主题色写进 `<html style>`（内联覆盖 app.css 的默认强调色）。
 * 需在响应式上下文里调用，且同时追踪 getTheme() —— 明暗切换时重算一遍。
 */
export function applyAccent(): void {
    const palette = ACCENTS[accentKey] ?? ACCENTS[DEFAULT_ACCENT];
    const colors = getTheme() === "light" ? palette.light : palette.dark;
    const softAlpha = getTheme() === "light" ? 0.16 : 0.18;
    const soft2Alpha = getTheme() === "light" ? 0.1 : 0.12;
    const el = document.documentElement;
    el.style.setProperty("--accent", colors.accent);
    el.style.setProperty("--accent-2", colors.accent2);
    el.style.setProperty("--accent-text", colors.accentText);
    el.style.setProperty("--accent-soft", rgba(colors.accent, softAlpha));
    el.style.setProperty("--accent-soft-2", rgba(colors.accent, soft2Alpha));
}