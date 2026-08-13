import manifest from "./widget.json";
import TodoCard from "./TodoCard.svelte";
import { todo } from "./todo.svelte";
import type { TodoItem } from "./todo.svelte";
import { defineWidget } from "$lib/widgets/api/defineWidget";
import type { WidgetContext, WidgetManifest } from "$lib/widgets/api/types";

// 启动时恢复持久化的待办列表（至组件，组件负责后续增删改的持久化）
async function setup(ctx: WidgetContext): Promise<void> {
    const items = await ctx.store!.get<TodoItem[]>("todo.items", []);
    todo.load(items);
}

export const definition = defineWidget({
    manifest: manifest as unknown as WidgetManifest,
    component: TodoCard,
    setup,
});