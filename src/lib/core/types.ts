/**
 * 兼容层：公开契约已迁移至 `$lib/widgets/api/types`。
 * 既有内部引用（settings.ts / 组件）统一从这里转发，契约唯一来源在 api/types。
 */
export type * from "$lib/widgets/api/types";
export type { HostApis } from "$lib/widgets/api/context";