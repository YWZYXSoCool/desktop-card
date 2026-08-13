import { toast } from "svelte-sonner";
import { widgetStore } from "$lib/core/settings";
import * as bus from "$lib/core/widgetBus";
import type { HostApis } from "./context";

/**
 * 宿主侧的真实能力实现（privileged）。仅供 `createWidgetContext` 在内部
 * 按权限抽取，**绝不直接导出给 widget**。widget 只能拿到 context 里的副本。
 */
export const hostApis: HostApis = {
    store: widgetStore,
    toast: {
        info: (msg) => toast(msg),
        error: (msg) => toast.error(msg),
    },
    bus: {
        emit: (channel, payload) => bus.emit(channel, payload),
        on: (channel, cb) => bus.on(channel, cb),
    },
};