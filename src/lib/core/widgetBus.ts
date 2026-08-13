import { emit as tauriEmit, listen } from "@tauri-apps/api/event";

/**
 * Widget 数据通信总线（宿主特权实现，仅供 `createWidgetContext` 按 `bus` 权限下放，
 * 不直接导出给 widget）。widget 通过 `ctx.bus` 做跨窗口 pub/sub。
 *
 * 统一用单个 Tauri 事件名 `widget-bus`（而非按 channel 建事件），避免通配符/海量
 * 事件名问题：广播时把 `{ channel, payload }` 塞进 payload，订阅方按 channel 过滤。
 * 事件经 Tauri 全局通道分发，多个 webview（主卡片 + 各 widget 窗口）都能收到。
 */
export interface BusMessage {
    channel: string;
    payload: unknown;
}

const EVENT = "widget-bus";

/** 广播一条消息到某 channel（发给所有订阅者，含自身所在窗口）。 */
export function emit(channel: string, payload?: unknown): void {
    void tauriEmit(EVENT, { channel, payload } satisfies BusMessage);
}

/** 订阅某 channel；返回注销函数。payload 为 JSON 可序列化值。 */
export function on(channel: string, cb: (payload: unknown) => void): () => void {
    let unlisten: () => void = () => {};
    void listen<BusMessage>(EVENT, (e) => {
        if (e.payload?.channel === channel) cb(e.payload.payload);
    }).then((u) => (unlisten = u));
    return () => unlisten();
}