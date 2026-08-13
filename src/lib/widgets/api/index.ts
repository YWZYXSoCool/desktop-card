/**
 * Widget 平台 API 公共出口。
 * - types / context / hostApis：宿主与外部 widget 共享的契约与权限下放。
 * - defineWidget：内置 Svelte widget 的声明式蓝图工厂（含设置状态派生）。
 * - loadExternal：外部 widget 扫描与加载。
 */
export type * from "./types";
export { createWidgetContext } from "./context";
export type { HostApis } from "./context";
export { hostApis } from "./hostApis";
export { defineWidget } from "./defineWidget";
export { createSettings } from "./settings.svelte";
export { scanExternalWidgets } from "./loadExternal";