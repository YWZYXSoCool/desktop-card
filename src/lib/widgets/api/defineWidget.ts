import { mount, unmount } from "svelte";
import type { Component } from "svelte";
import type {
    WidgetContext,
    WidgetDefinition,
    WidgetManifest,
    WidgetSetting,
} from "./types";
import { createSettings } from "./settings.svelte";

/**
 * 内置 widget 的声明式蓝图。
 *
 * 组件只需声明 manifest + 组件 + 可选钩子；响应式设置状态、setup 恢复、
 * onSettingChange 副作用、`{ ctx }` prop 注入全由 defineWidget 自动派生。
 * 设置项在 `settings` 字段（类型化 TS 数组）里声明一次即可，勿再在别处抄写。
 */
export interface WidgetBlueprint {
    /** 元数据（id/name/size/permissions…）。设置项由本文件 `settings` 提供并注入 manifest.settings。 */
    manifest: WidgetManifest;
    /** Svelte 组件，接收 `{ ctx }` prop，从 ctx 拿 store / settings / drop / toast 等能力。 */
    component: Component<{ ctx: WidgetContext }>;
    /** 声明式设置（TS 单一来源，注入 manifest.settings，设置页据此渲染）。 */
    settings?: WidgetSetting[];
    /** 可选：启动副作用（框架会先加载设置再调用）。用于恢复非设置态。 */
    setup?(ctx: WidgetContext): void | Promise<void>;
    /** 可选：设置变更的额外副作用（框架已自动应用设置到响应式状态）。 */
    onSettingChange?(key: string, value: unknown, ctx: WidgetContext): void;
    /** 可选：处理被拖入的文件（可能一次多份，widget 自行判定处理哪些）。 */
    onDrop?(paths: string[], ctx: WidgetContext): void;
}

/**
 * 把蓝图构造成宿主可识别的 `WidgetDefinition`。
 * - 设置 schema 注入 manifest（SettingsPanel 照常读取）
 * - 自动建响应式设置 store，组件经 ctx.settings 读写
 * - setup 先 load 设置，再跑可选 setup 钩子
 * - onSettingChange 先 apply 设置，再跑可选钩子（持久化由宿主统一负责）
 */
export function defineWidget(bp: WidgetBlueprint): WidgetDefinition {
    const manifest: WidgetManifest = {
        ...bp.manifest,
        settings: bp.settings ?? bp.manifest.settings,
    };
    const settings = createSettings(bp.settings ?? []);

    return {
        manifest,
        render: {
            mount(container: HTMLElement, ctx: WidgetContext): () => void {
                const app = mount(bp.component, {
                    target: container,
                    props: { ctx: { ...ctx, settings } },
                });
                return () => unmount(app);
            },
        },
        setup: async (ctx: WidgetContext) => {
            if (ctx.store) await settings.load(ctx.store);
            await bp.setup?.(ctx);
        },
        onSettingChange: (key: string, value: unknown, ctx: WidgetContext) => {
            settings.apply(key, value);
            bp.onSettingChange?.(key, value, ctx);
        },
        onDrop: bp.onDrop,
    };
}