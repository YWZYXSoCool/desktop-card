/**
 * 卡片右键菜单的全局注册表：各 widget（申请了 `menu` 权限）在 setup 时
 * 把一项功能注册进来，统一收进卡片右键菜单的「widget 功能」子菜单。
 * 响应式列表，ContextMenu 读取后渲染。
 */

/** 一条已注册的右键菜单项。 */
interface MenuEntry {
    id: string;
    /** 所属 widget 名（预留：可作分组 / 去重，当前统一平铺在子菜单里） */
    widget: string;
    label: string;
    action: () => void;
}

let entries = $state<MenuEntry[]>([]);

/** 读取已注册菜单项（响应式，可在 $derived / $effect 中追踪）。 */
export function getMenuEntries(): MenuEntry[] {
    return entries;
}

/** 注册一项右键菜单，返回注销函数。同 widget 重复注册会追加（各自独立）。 */
export function registerMenuEntry(
    widget: string,
    label: string,
    action: () => void,
): () => void {
    const id = crypto.randomUUID();
    entries = [...entries, { id, widget, label, action }];
    return () => {
        entries = entries.filter((e) => e.id !== id);
    };
}