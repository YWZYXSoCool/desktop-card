import { builtinWidgets } from "./builtin";
import { scanExternalWidgets } from "./api/loadExternal";
import type { WidgetDefinition } from "./api/types";

/**
 * 已注册的 widget（内置 + 外部合并）。启动时经 `waitReady()` 填充，
 * 外部 widget 放在运行时扫描目录，放入即用。不直接导出（Svelte 禁止导出被重赋值的 $state）。
 */
let widgets = $state<WidgetDefinition[]>([]);

/** 读取 widget 列表（响应式：读取 $state，可在 $derived/$effect 中追踪）。 */
export function getWidgets(): WidgetDefinition[] {
    return widgets;
}

/** 是否已发起初始化（幂等，两个窗口共用同一份就绪态）。 */
let ready: Promise<void> | null = null;

/** main widget：特殊驻留首页（主页）。启动默认显示，不参与 Tab 循环，有专属快捷键返回。 */
export const MAIN_ID = "home";

/** 当前激活的 widget id（响应式，切换后自动重渲染）。 */
let activeId = $state(MAIN_ID);

/**
 * 等待注册表就绪（渲染/搜索/设置页在读取前 await），首次调用时初始化：
 * 内置恒有，外部按需扫描合并。同名 id 时外部覆盖内置（提供方以后到者为准）。
 */
export function waitReady(): Promise<void> {
    ready ??= (async () => {
        const external = await scanExternalWidgets();
        const merged = [...builtinWidgets];
        for (const w of external) {
            const i = merged.findIndex((x) => x.manifest.id === w.manifest.id);
            if (i >= 0) merged[i] = w;
            else merged.push(w);
        }
        widgets = merged;
    })();
    return ready;
}

/** 按 id 查找 widget（搜索选中、设置窗口用）。未知 id 返回 undefined。 */
export function findWidget(id: string): WidgetDefinition | undefined {
    return widgets.find((w) => w.manifest.id === id);
}

/** 当前激活的 widget（响应式，切换后自动重渲染）。 */
export function activeWidget(): WidgetDefinition {
    return (
        findWidget(activeId) ??
        widgets.find((w) => w.manifest.id === MAIN_ID) ??
        widgets[0]
    );
}

/** 切换到 main widget。 */
export function goMain(): void {
    activeId = MAIN_ID;
}

/** 聚焦时 Tab 键：在普通 widget 间循环（main 不参与，需显式返回）。 */
export function cycleWidget(): void {
    const appWidgets = widgets.filter((w) => w.manifest.id !== MAIN_ID);
    if (appWidgets.length === 0) return;
    if (activeId === MAIN_ID) {
        activeId = appWidgets[0].manifest.id;
        return;
    }
    const i = appWidgets.findIndex((w) => w.manifest.id === activeId);
    activeId = appWidgets[(i + 1) % appWidgets.length].manifest.id;
}

/** 切换到指定 id 的 widget（搜索选中用，含 home）。未知 id 忽略。 */
export function setActiveWidget(id: string): void {
    if (widgets.some((w) => w.manifest.id === id)) activeId = id;
}