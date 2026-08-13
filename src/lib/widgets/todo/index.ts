import manifest from "./widget.json";
import TodoCard from "./TodoCard.svelte";
import { todo } from "./todo.svelte";
import type { TodoItem } from "./todo.svelte";
import { defineWidget } from "$lib/widgets/api/defineWidget";
import type {
    WidgetContext,
    WidgetManifest,
    WidgetSetting,
} from "$lib/widgets/api/types";

/** 显示偏好（卡片上没有的配置项）。 */
const settings: WidgetSetting[] = [
    { type: "section", name: "显示" },
    {
        key: "todo.showCompleted",
        label: "显示已完成",
        type: "toggle",
        default: true,
    },
    {
        key: "todo.doneToBottom",
        label: "已完成置底",
        type: "toggle",
        default: false,
    },
];

// 启动时恢复持久化的待办列表（至组件，组件负责后续增删改的持久化）
async function setup(ctx: WidgetContext): Promise<void> {
    const items = await ctx.store!.get<TodoItem[]>("todo.items", []);
    todo.load(items);
}

export const definition = defineWidget({
    manifest: manifest as unknown as WidgetManifest,
    settings,
    component: TodoCard,
    setup,
});