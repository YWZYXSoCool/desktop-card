import { widgetStore } from "./settings";

/** 一条 widget 使用历史：次数 + 最近打开时间。 */
export interface UseEntry {
    count: number;
    lastAt: number;
}

/**
 * widget 搜索的元数据：使用历史 + 收藏。
 * 持久化到共享 store 的 `widgets.*` 键，搜索框据此排序（收藏优先 → 最近使用）。
 */
class WidgetMetaStore {
    history = $state<Record<string, UseEntry>>({});
    favorites = $state<string[]>([]);

    /** 启动时从持久化恢复历史 + 收藏。 */
    load(history: Record<string, UseEntry>, favorites: string[]): void {
        this.history = history;
        this.favorites = favorites;
    }

    /** 记录一次打开：次数 +1、时间更新，并持久化。 */
    record(id: string): void {
        const prev = this.history[id] ?? { count: 0, lastAt: 0 };
        this.history = {
            ...this.history,
            [id]: { count: prev.count + 1, lastAt: Date.now() },
        };
        void widgetStore.set("widgets.history", this.history);
    }

    /** 切换某 widget 的收藏状态，并持久化。 */
    toggleFavorite(id: string): void {
        this.favorites = this.favorites.includes(id)
            ? this.favorites.filter((x) => x !== id)
            : [...this.favorites, id];
        void widgetStore.set("widgets.favorites", this.favorites);
    }

    isFavorite(id: string): boolean {
        return this.favorites.includes(id);
    }
}

export const widgetMeta = new WidgetMetaStore();