/**
 * 全局「取色」请求信号：中键菜单的取色项与颜色 widget 之间的搭桥。
 *
 * 取色状态在颜色 widget（ColorPage）内部维护，而取色菜单项由宿主（WidgetHost）
 * 点击。用模块级 $state 做一次性信号：宿主把 `pending` 置 true，颜色 widget 挂载后
 * 的 $effect 观察到即消费并取色。这样无论取色时颜色 widget 是否已激活都能触发，
 * 且消费后复位，不会在切走再切回时误触发。
 */
let pending = $state(false);

/** 宿主读取信号（在 $effect 中追踪）。 */
export function isColorPickPending(): boolean {
    return pending;
}

/** 中键菜单「取色」点击：请求一次屏幕取色。 */
export function requestColorPick(): void {
    pending = true;
}

/** 颜色 widget 消费取色请求（取到后复位，避免重复/误触发）。 */
export function consumeColorPick(): void {
    pending = false;
}