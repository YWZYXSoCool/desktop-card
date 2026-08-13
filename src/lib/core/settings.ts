import { LazyStore } from "@tauri-apps/plugin-store";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import type { WidgetStore } from "./types";

/**
 * 共享持久化 store（settings.json）。核心与各 widget 共用这一个实例，
 * 各自用命名空间键读写：核心管 `window.*` / `autostart.*`，widget 管自己的键。
 */
export const store = new LazyStore("settings.json");

export interface CoreSettings {
    /** 窗口左上角物理坐标；null 表示首次启动，用 center() */
    windowX: number | null;
    windowY: number | null;
    autostartEnabled: boolean;
}

/** 启动时一次性读取核心设置，缺键回落到默认值。自启状态以系统实际注册为准并回写 store。 */
export async function loadCoreSettings(): Promise<CoreSettings> {
    const [windowX, windowY] = await Promise.all([
        store.get<number | null>("window.x"),
        store.get<number | null>("window.y"),
    ]);

    let autostartEnabled = false;
    try {
        autostartEnabled = await isEnabled();
    } catch {
        autostartEnabled = (await store.get<boolean>("autostart.enabled")) ?? false;
    }
    // 与系统真实状态保持一致
    await store.set("autostart.enabled", autostartEnabled);

    return {
        windowX: typeof windowX === "number" ? windowX : null,
        windowY: typeof windowY === "number" ? windowY : null,
        autostartEnabled,
    };
}

/** 写入窗口位置（调用方已做防抖）。 */
export async function saveWindowPosition(x: number, y: number): Promise<void> {
    await store.set("window.x", x);
    await store.set("window.y", y);
    await store.save();
}

/** 切换开机自启：先操作系统注册，成功后立即持久化。失败则抛出，由调用方回滚 UI。 */
export async function applyAutostart(enabled: boolean): Promise<void> {
    if (enabled) {
        await enable();
    } else {
        await disable();
    }
    await store.set("autostart.enabled", enabled);
    await store.save();
}

/** 供 widget 使用的命名空间读写（每次写即保存）。 */
export const widgetStore: WidgetStore = {
    async get<T>(key: string, fallback: T): Promise<T> {
        const v = await store.get<unknown>(key);
        return (v as T) ?? fallback;
    },
    async set(key: string, value: unknown): Promise<void> {
        await store.set(key, value);
        await store.save();
    },
};