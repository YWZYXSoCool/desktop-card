import { getWidgets } from "$lib/widgets/registry.svelte";
import { fuzzyScore } from "$lib/core/fuzzy";
import { widgetMeta } from "$lib/core/widgetMeta.svelte";
import type { WidgetDefinition } from "$lib/widgets/api/types";

/**
 * 模糊搜索 widget：关键词命中过滤后，按 收藏 → 最近使用 → 匹配分数 → 名称 排序。
 * 无关键词时展示全部，同样按收藏/最近使用排序（常用项靠前）。
 *
 * 依赖模块级 store（registry / widgetMeta），属容器侧逻辑，供 WidgetSearch 调用。
 */
export function fuzzySearch(q: string): WidgetDefinition[] {
    const needle = q.toLowerCase();
    const items = getWidgets().map((w) => ({
        w,
        score: needle
            ? Math.max(
                  fuzzyScore(w.manifest.name, needle),
                  fuzzyScore(w.manifest.id, needle),
                  ...w.manifest.keywords.map((k) => fuzzyScore(k, needle)),
              )
            : 0,
    }));
    const filtered = needle ? items.filter((x) => x.score >= 0) : items;
    filtered.sort(
        (a, b) =>
            Number(widgetMeta.isFavorite(b.w.manifest.id)) -
                Number(widgetMeta.isFavorite(a.w.manifest.id)) ||
            (widgetMeta.history[b.w.manifest.id]?.lastAt ?? 0) -
                (widgetMeta.history[a.w.manifest.id]?.lastAt ?? 0) ||
            b.score - a.score ||
            a.w.manifest.name.localeCompare(b.w.manifest.name),
    );
    return filtered.map((x) => x.w);
}