import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { toast } from "svelte-sonner";
import { getWidgets } from "$lib/widgets/registry.svelte";
import { createWidgetContext, hostApis } from "$lib/widgets/api";
import { getMenuEntries } from "./menu.svelte";
import { watchMoved } from "./window";
import { applyAutostart, widgetStore } from "./settings";

/**
 * 宿主事件总线的注册逻辑集中层（放在配置态，便于测试与复用）。
 *
 * 每个 `wireXxx` 只负责「监听 + 事件类型归一化」，把业务状态（dragOver/searchOpen）
 * 与副作用（showCardMenu/openSettings/…）交给容器通过 handler 回调注入。
 * 返回 unlisten 数组，由容器统一 `track()` 收集、onDestroy 时清理。
 */
export type Unlisten = (() => void) | Promise<() => void>;

/** 窗口移动 → 物理坐标回调（供容器防抖落库）。 */
export function wireWindowMove(
    onMoved: (x: number, y: number) => void,
): Unlisten[] {
    return [watchMoved(onMoved)];
}

/** 文件拖拽：enter/over → onEnterOver，leave/drop → onLeave，drop 附全部路径交给 onDrop。 */
export function wireDragDrop(h: {
    onEnterOver: () => void;
    onLeave: () => void;
    onDrop: (paths: string[]) => void;
}): Unlisten[] {
    return [
        getCurrentWebview().onDragDropEvent((e) => {
            const p = e.payload;
            if (p.type === "enter" || p.type === "over") {
                h.onEnterOver();
            } else if (p.type === "leave") {
                h.onLeave();
            } else if (p.type === "drop") {
                h.onLeave();
                if (p.paths?.length) h.onDrop(p.paths);
            }
        }),
    ];
}

/** 聚焦时键盘：把原始 keydown 分发给容器 handler（容器自行判断让位与 preventDefault）。 */
export function wireKeyboard(h: {
    onKeyDown: (e: KeyboardEvent) => void;
}): Unlisten[] {
    const onKeyDown = (e: KeyboardEvent) => h.onKeyDown(e);
    document.addEventListener("keydown", onKeyDown);
    return [() => document.removeEventListener("keydown", onKeyDown)];
}

/** 全局快捷键唤起：显示后打开搜索页。 */
export function wireOpenSearch(onOpen: () => void): Unlisten[] {
    return [listen("open-search", onOpen)];
}

/** 托盘「检查更新」：转发给容器跑既有检查流程并弹 toast。 */
export function wireCheckUpdate(onCheck: () => void): Unlisten[] {
    return [listen("check-update", onCheck)];
}

/** Widget 商店安装/卸载后发来的「注册表已变化」：主窗口据此热重载 widget 列表。 */
export function wireWidgetsChanged(onChange: () => void): Unlisten[] {
    return [listen("widgets-changed", onChange)];
}

/** 全局鼠标钩子：长按中键（任意位置）松开后，在光标处弹系统级菜单。 */
export function wireCardMenuOpen(
    onOpen: (screenX: number, screenY: number) => void,
): Unlisten[] {
    return [
        listen<{ 0: number; 1: number } | [number, number]>(
            "card-menu-open",
            (e) => {
                const [sx, sy] = Array.isArray(e.payload)
                    ? e.payload
                    : [e.payload[0], e.payload[1]];
                onOpen(sx, sy);
            },
        ),
    ];
}

/** 沙箱内 ctx.toast 的通知：转发为卡片 toast。 */
export function wireWidgetToast(): Unlisten[] {
    return [
        listen<{ msg: string; kind: string }>("widget-toast", (e) => {
            const { msg, kind } = e.payload;
            if (kind === "error") toast.error(msg);
            else toast(msg);
        }),
    ];
}

/**
 * 设置窗口发来的变更路由（纯函数，供 wireSettingChanged 的 handler 复用）。
 * 在卡片窗口内应用副作用并持久化（单一写入者）。
 * 主页里声明的主机级设置（开机自启 / 全局快捷键）由宿主负责应用，且只在成功后才落库。
 */
export async function applySettingChanged(
    widgetId: string,
    key: string,
    value: unknown,
): Promise<void> {
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
}

/** 设置窗口发来的变更：归一化 payload 后交给 applySettingChanged。 */
export function wireSettingChanged(): Unlisten[] {
    return [
        listen<{ widgetId: string; key: string; value: unknown }>(
            "widget-setting-changed",
            (e) => {
                const { widgetId, key, value } = e.payload;
                void applySettingChanged(widgetId, key, value);
            },
        ),
    ];
}

/** 系统级菜单（Rust 弹出）点击 → 按 id 路由到对应 widget 动作，执行后夺回卡片焦点。
 *  `onHostAction` 处理宿主级菜单项（如 `host:screenshot`），其余按 widget 注册表路由。 */
export function wireCardMenuClick(onHostAction?: (id: string) => void): Unlisten[] {
    return [
        listen<string>("card-menu-click", (e) => {
            const id = e.payload;
            if (id.startsWith("host:")) {
                onHostAction?.(id);
            } else {
                getMenuEntries().find((it) => it.id === id)?.action();
            }
            getCurrentWindow().setFocus().catch(() => {});
        }),
    ];
}