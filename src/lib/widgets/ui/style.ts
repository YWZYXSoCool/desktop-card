/**
 * 沙箱 UI 组件库的共享助手。
 *
 * UINode.style 是 camelCase 键的 CSS 记录（如 `{ overflowY: "auto" }`），
 * 组件根元素用 `style` 属性接收 —— 需要转成 kebab-case 的 CSS 字符串。
 */

/** 把 UINode.style（camelCase 键）转成 kebab-case 的 CSS 样文字符串。 */
export function styleStr(style?: Record<string, string>): string {
    if (!style) return "";
    return Object.entries(style)
        .map(([k, v]) => `${k.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase())}: ${v}`)
        .join("; ");
}

/** 交互节点触发时回调宿主的签名：`(eventId, type, data)`。 */
export type EventCb = (id: string, type: string, data: unknown) => void;