/**
 * Widget 平台公开契约（唯一来源）。
 *
 * 这是宿主与 widget 之间的唯一接口。**仅类型声明（.d.ts），零 Svelte / 宿主依赖**，
 * 外部 widget 作者可直接 `/// <reference path=".../widgets/api/types.d.ts" />`
 * 或原样拷贝，用来声明自己的 widget。
 *
 * 权限模型：widget 只能通过 `WidgetContext` 触达宿主，而上下文只包含
 * `widget.json` 的 `permissions` 里显式声明的能力。未声明的权限一律拿不到。
 */

/** 宿主可下放给 widget 的能力名。widget.json 的 `permissions` 据此声明。 */
export type WidgetPermission =
    | "store" // 持久化读写（WidgetStore）
    | "settings" // 声明式设置项 + onSettingChange
    | "drop" // 文件拖拽 onDrop + dropHint
    | "toast" // 通知
    | "menu" // 右键菜单（统一放进卡片右键菜单的「widget 功能」子菜单）
    | "window" // 保留：自定义窗口
    | "execute"; // 保留：系统命令（默认不开放）

/** 持久化读写句柄。键由 widget 用命名空间管理（如 `volume.level`），互不冲突。 */
export interface WidgetStore {
    get<T>(key: string, fallback: T): Promise<T>;
    set(key: string, value: unknown): Promise<void>;
}

/** 通知（对应宿主卡片上的 toast）。 */
export interface WidgetToast {
    info(msg: string): void;
    error(msg: string): void;
}

/**
 * 右键菜单句柄：widget 用它把一项功能放进卡片右键菜单里统一的
 * 「widget 功能」子菜单。handler 在卡片窗口内执行，可调用宿主能力
 * （切换 widget、读剪贴板、触发查询等）。仅申请了 `menu` 权限才有。
 */
export interface WidgetMenu {
    /** 注册一项右键菜单（进入统一的子菜单）。返回注销函数。 */
    add(label: string, action: () => void): () => void;
}

/**
 * 声明式设置的响应式读取句柄（由 defineWidget 从 schema 派生并注入 ctx.settings）。
 * 只有申请了 `settings` 权限、且声明了设置项的 widget 才有。
 */
export interface WidgetSettings {
    /** 读响应式值（模板 / $derived 可追踪）。key 传短名（`hour12`）或完整键（`clock.hour12`）均可。 */
    get<T = unknown>(key: string): T;
}

/**
 * 权限作用域上下文：只含 `permissions` 声明的那几个键，其余为 `undefined`。
 * widget 从这里拿自己申请到的能力，触不到宿主其它特权。
 */
export interface WidgetContext {
    /** 申请了 `store` 权限才有。 */
    store?: WidgetStore;
    /** 申请了 `drop` 权限才有。`hint` 为拖拽悬停提示文案。 */
    drop?: { hint: string };
    /** 申请了 `toast` 权限才有。 */
    toast?: WidgetToast;
    /** 申请了 `settings` 权限才有：schema 派生的设置读取（defineWidget 注入）。 */
    settings?: WidgetSettings;
    /** 申请了 `menu` 权限才有：注册卡片右键菜单项。 */
    menu?: WidgetMenu;
    // 随权限扩展（window / execute …）
}

/**
 * 声明式 UI 树节点 —— 沙箱 widget 的渲染契约（QuickJS 无 DOM）。
 * `render()` 返回一棵该结构的树，宿主 webview 水合为真实 DOM；
 * 交互经 `on` 上的事件 id 回调沙箱 `handleEvent`，随后重调 `render()` 刷新。
 */
export interface UINode {
    /** 节点类型：row|column|stack|box|spacer|text|button|input|number|toggle|select|slider|color|textarea|image */
    type: string;
    /** 各类型专属属性：text=value、button=label、input/toggle=value/checked、select=options、image=src … */
    props?: Record<string, unknown>;
    /** 内联样式子集（flex/宽高/字号/颜色/圆角/间距/对齐等），键为 CSS 属性名 */
    style?: Record<string, string>;
    children?: UINode[];
    /** 交互节点的事件 id：触发时回调沙箱 `handleEvent(id, type, data)` */
    on?: string;
}

/** widget 期望的窗口尺寸（切换时自动 resize）。 */
export interface WidgetSize {
    width: number;
    height: number;
}

/** 设置项类型。 */
export type WidgetSettingType =
    | "toggle"
    | "slider"
    | "select"
    | "text"
    | "number"
    | "color"
    | "textarea"
    | "section";

/** 选项框（select）的单个选项。 */
export interface SelectOption {
    label: string;
    value: string | number;
}

/** 各设置项共有的字段：`key` 是持久化存储键（widget 自己命名空间）。 */
interface SettingBase {
    key: string;
    label: string;
    /** 条件可见：仅当 `key`（另一个设置项的完整键）当前值 === `equals` 时才显示本项。
     *  依赖项自身不可见时，本项同样隐藏。缺省则始终显示。 */
    visibleWhen?: { key: string; equals: string | number | boolean };
}

export interface ToggleSetting extends SettingBase {
    type: "toggle";
    default: boolean;
}

export interface SliderSetting extends SettingBase {
    type: "slider";
    default: number;
    min?: number;
    max?: number;
    step?: number;
}

export interface SelectSetting extends SettingBase {
    type: "select";
    default: string | number;
    /** 候选选项（用户从 n 个中选一） */
    options: SelectOption[];
}

export interface TextSetting extends SettingBase {
    type: "text";
    default: string;
    /** 输入框占位提示 */
    placeholder?: string;
}

export interface NumberSetting extends SettingBase {
    type: "number";
    default: number;
    min?: number;
    max?: number;
    step?: number;
}

export interface ColorSetting extends SettingBase {
    type: "color";
    default: string;
}

export interface TextareaSetting extends SettingBase {
    type: "textarea";
    default: string;
    /** 输入框占位提示 */
    placeholder?: string;
}

/**
 * 设置分隔组（纯展示，无值、不持久化）：把设置面板按组切分，`name` 为组标题。
 * 放在 settings 数组里任意位置，渲染为一个小标题 + 分隔。
 */
export interface SectionSetting {
    type: "section";
    /** 分组标题 */
    name: string;
}

/** 一个可设置项（声明式，按 `type` 判别）。设置页由平台统一提供，widget 只声明有哪些项。 */
export type WidgetSetting =
    | ToggleSetting
    | SliderSetting
    | SelectSetting
    | TextSetting
    | NumberSetting
    | ColorSetting
    | TextareaSetting
    | SectionSetting;

/**
 * widget 的声明元数据（序列化进 widget.json）。内置 widget 也从各自目录下的
 * widget.json 读取，与外部 widget 结构一致。
 */
export interface WidgetManifest {
    /** 唯一标识（也参与搜索匹配） */
    id: string;
    /** 展示名（也参与搜索匹配） */
    name: string;
    /** 版本号（可选） */
    version?: string;
    /** 搜索关键词（中英文别名等，参与模糊匹配） */
    keywords: string[];
    /** 该 widget 期望的窗口尺寸（切换时自动 resize） */
    size: WidgetSize;
    /** 拖拽悬停时卡片上显示的提示文案（申请了 `drop` 权限才生效） */
    dropHint?: string;
    /** 显式声明要用到的宿主能力。**未声明的能力一律不下放**。 */
    permissions?: WidgetPermission[];
    /** 声明式可设置项（设置页由平台统一渲染）。缺省则视为无设置 */
    settings?: WidgetSetting[];
    /** 相对该 widget 目录的入口 bundle 路径（内置为构建入口，外部为运行时加载的 JS） */
    entry: string;
}

/** 渲染器：把 widget 挂进宿主给的容器，返回卸载函数。框架无关。 */
export interface WidgetRenderer {
    mount(container: HTMLElement, ctx: WidgetContext): () => void;
}

/** 外部 widget bundle 通过 `registerWidget(...)` 注册的运行时实现。 */
export interface WidgetRuntime {
    render: WidgetRenderer;
    /** 启动时回调：用它恢复本 widget 的持久化状态 */
    setup?(ctx: WidgetContext): Promise<void> | void;
    /** 设置项变更时的副作用（在窗口内执行，用于改运行中的状态） */
    onSettingChange?(key: string, value: unknown, ctx: WidgetContext): void;
    /** 处理被拖入的文件：widget 自行判定是否处理，不处理则静默忽略 */
    onDrop?(path: string, ctx: WidgetContext): void;
}

/**
 * 一个可插拔的 widget 定义 = 声明元数据（manifest）+ 运行实现（runtime）。
 * 卡片核心只认识这个契约，不关心具体业务或渲染框架。
 */
export interface WidgetDefinition {
    manifest: WidgetManifest;
    render: WidgetRenderer;
    setup?(ctx: WidgetContext): Promise<void> | void;
    onSettingChange?(key: string, value: unknown, ctx: WidgetContext): void;
    onDrop?(path: string, ctx: WidgetContext): void;
}

// ─────────────────────────────────────────────────────────────────────────
// QuickJS 沙箱契约（外部 widget）
//
// 外部 widget 在 Rust 内嵌的 QuickJS 沙箱里执行，无 DOM / 无浏览器 API。
// 它以 `registerWidget(runtime)` 把实现对象交给宿主（宿主注入的全局触点）。
// 沙箱 ctx 与内置宿主不同：store 是**同步**版（见 SandboxStore）。
// 参考实现：src-tauri/src/sandbox.rs、external-widgets/counter/index.js。
// ─────────────────────────────────────────────────────────────────────────

/** 沙箱内 ctx.store：同步版（宿主经 JSON 字符串转发，直接返回，非 Promise）。 */
export interface SandboxStore {
    get<T>(key: string, fallback: T): T;
    set(key: string, value: unknown): void;
}

/** 沙箱 widget 的权限作用域 ctx（只含 widget.json 里声明过的权限）。 */
export interface SandboxContext {
    /** 申请了 `store` 权限才有。 */
    store?: SandboxStore;
    /** 申请了 `toast` 权限才有。 */
    toast?: WidgetToast;
}

/** 外部沙箱 widget 通过 `registerWidget` 注册的实现对象。 */
export interface SandboxWidgetRuntime {
    /** 启动时调用一次，常用于同步恢复持久化状态。 */
    setup?(ctx: SandboxContext): void;
    /** 返回声明式 UI 树（宿主水合渲染）；每次交互后宿主重调此方法。 */
    render(ctx: SandboxContext): UINode;
    /** 带 `on` 的交互节点触发时回调（id, type, data）；随后宿主重调 render()。 */
    handleEvent(id: string, type: string, data: unknown, ctx: SandboxContext): void;
    /** 设置项变更副作用。 */
    onSettingChange?(key: string, value: unknown, ctx: SandboxContext): void;
    /** 处理被拖入的文件：widget 自行判定是否处理，不处理则静默忽略。 */
    onDrop?(path: string, ctx: SandboxContext): void;
}

/** 宿主注入的全局触点：外部沙箱 widget 调用它把实现对象交给宿主。 */
declare global {
    function registerWidget(widget: SandboxWidgetRuntime): void;
}