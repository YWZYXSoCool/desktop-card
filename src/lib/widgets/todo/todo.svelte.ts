export interface TodoItem {
    id: string;
    text: string;
    done: boolean;
}

/** Todo widget 的可变状态：待办列表（增/勾选完成/删除）。 */
class TodoStore {
    items = $state<TodoItem[]>([]);

    /** 启动时用持久化的列表填充。 */
    load(list: TodoItem[]): void {
        this.items = list;
    }

    /** 新增一条待办：插到最前。 */
    add(text: string): void {
        this.items = [
            { id: crypto.randomUUID(), text, done: false },
            ...this.items,
        ];
    }

    toggle(id: string): void {
        this.items = this.items.map((t) =>
            t.id === id ? { ...t, done: !t.done } : t,
        );
    }

    remove(id: string): void {
        this.items = this.items.filter((t) => t.id !== id);
    }
}

export const todo = new TodoStore();