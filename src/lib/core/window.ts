import {
    PhysicalPosition,
    availableMonitors,
    getCurrentWindow,
    type Window,
} from "@tauri-apps/api/window";
// 通用防抖（trailing，返回带 .cancel()/.flush() 的函数），沿用原调用点
export { debounce } from "es-toolkit";

/** 当前窗口是否在任一显示器内（物理像素判定，多显示器越界回落用）。 */
export async function isInsideAnyMonitor(
    x: number,
    y: number,
): Promise<boolean> {
    const monitors = await availableMonitors();
    return monitors.some(
        (m) =>
            x >= m.position.x &&
            x < m.position.x + m.size.width &&
            y >= m.position.y &&
            y < m.position.y + m.size.height,
    );
}

/**
 * 恢复指定窗口位置：无记录或记录点不在任何显示器内（如曾接外接屏）则居中。
 * 供主窗口与各 widget 窗口共用（多显示器位置记忆）。坐标统一物理像素。
 */
export async function restorePositionAt(
    win: Window,
    x: number | null,
    y: number | null,
): Promise<void> {
    if (x == null || y == null) {
        await win.center();
        return;
    }
    try {
        if (await isInsideAnyMonitor(x, y)) {
            await win.setPosition(new PhysicalPosition(x, y));
        } else {
            await win.center();
        }
    } catch {
        await win.center();
    }
}

/** 恢复当前窗口位置（主窗口用）。无记录则居中；越界回落居中。 */
export async function restorePosition(
    x: number | null,
    y: number | null,
): Promise<void> {
    return restorePositionAt(getCurrentWindow(), x, y);
}

/** 监听指定窗口移动，回调收到物理坐标。返回 unlisten。 */
export async function watchMovedAt(
    win: Window,
    onMoved: (x: number, y: number) => void,
): Promise<() => void> {
    return win.onMoved(({ payload }) => {
        onMoved(payload.x, payload.y);
    });
}

/** 监听当前窗口移动，回调收到物理坐标。返回 unlisten。 */
export async function watchMoved(
    onMoved: (x: number, y: number) => void,
): Promise<() => void> {
    return watchMovedAt(getCurrentWindow(), onMoved);
}
