import {
    PhysicalPosition,
    availableMonitors,
    getCurrentWindow,
} from "@tauri-apps/api/window";
// 通用防抖（trailing，返回带 .cancel()/.flush() 的函数），沿用原调用点
export { debounce } from "es-toolkit";

/**
 * 恢复窗口位置：无记录则居中；记录点不在任何显示器内（如曾接外接屏）则回落到居中。
 * 坐标统一使用物理像素（onMoved 与 availableMonitors 均为物理坐标）。
 */
export async function restorePosition(
    x: number | null,
    y: number | null,
): Promise<void> {
    const win = getCurrentWindow();
    if (x == null || y == null) {
        await win.center();
        return;
    }
    try {
        const monitors = await availableMonitors();
        const inside = monitors.some(
            (m) =>
                x >= m.position.x &&
                x < m.position.x + m.size.width &&
                y >= m.position.y &&
                y < m.position.y + m.size.height,
        );
        if (inside) {
            await win.setPosition(new PhysicalPosition(x, y));
        } else {
            await win.center();
        }
    } catch {
        await win.center();
    }
}

/** 监听窗口移动，回调收到物理坐标。返回 unlisten。 */
export async function watchMoved(
    onMoved: (x: number, y: number) => void,
): Promise<() => void> {
    return getCurrentWindow().onMoved(({ payload }) => {
        onMoved(payload.x, payload.y);
    });
}
