import type { SectionSetting, WidgetSetting, WidgetStore } from "./types";

/** 有 key / 有值 / 可读写的设置项（排除纯展示的分隔组）。 */
type Field = Exclude<WidgetSetting, SectionSetting>;

/** 类型守卫：分隔组（无 key）以外都是可读写字段。 */
function isField(s: WidgetSetting): s is Field {
    return s.type !== "section";
}

/**
 * 声明式设置 → 响应式状态。一个设置项只声明一次（defineWidget 的 settings 数组，
 * 或 widget.json 的 settings），这里自动派生：
 *  - 响应式值（含 schema 默认值，深响应式，模板 / $derived 可追踪）
 *  - setup 时从 store 恢复（load）
 *  - 设置变更副作用（apply，含按类型的收窄）
 *
 * 持久化写入由宿主统一负责（WidgetHost 监听变更事件后写 store），本对象只管状态；
 * 只在 setup 时从 store 读回。key 支持短名（去命名空间前缀），组件里写 `get("hour12")` 即可。
 */
export function createSettings(settings: WidgetSetting[]) {
    // 一张表同时支持短名（`hour12`）与完整 key（`clock.hour12`）→ 设置项。
    // schema 用完整 key，组件读值用短名，二者都须能解析到同一条设置。
    const byKey = new Map<string, Field>();
    for (const s of settings) {
        if (!isField(s)) continue; // 分隔组无 key、无值，不参与读写
        byKey.set(s.key, s);
        const i = s.key.lastIndexOf(".");
        if (i >= 0) byKey.set(s.key.slice(i + 1), s);
    }

    // 铺 schema 默认值（深响应式，后续写入同样被追踪）
    const values = $state<Record<string, unknown>>({});
    for (const s of settings) if (isField(s)) values[s.key] = s.default;

    /** 按设置类型把原始值收窄为存储/渲染用的类型。 */
    function coerce(raw: unknown, type: WidgetSetting["type"]): unknown {
        switch (type) {
            case "toggle":
                return Boolean(raw);
            case "number":
            case "slider":
                return Number(raw);
            case "select":
                return raw; // string | number，原样保留
            default:
                return String(raw); // text / color / textarea
        }
    }

    /** 读响应式值（模板 / $derived 中可追踪）。传短名或完整 key 均可。 */
    function get<T = unknown>(key: string): T {
        const s = byKey.get(key);
        return values[s ? s.key : key] as T;
    }

    /** setup：从 store 恢复全部设置（缺键 / 读取出错回落 schema 默认值）。并行读取，避免逐项串行 IPC。 */
    async function load(store: WidgetStore): Promise<void> {
        await Promise.all(
            settings.filter(isField).map(async (s) => {
                try {
                    values[s.key] = coerce(
                        await store.get(s.key, s.default),
                        s.type,
                    );
                } catch {
                    values[s.key] = s.default;
                }
            }),
        );
    }

    /** onSettingChange 副作用：收窄并更新响应式值（key 为宿主传来的完整键）。 */
    function apply(key: string, value: unknown): void {
        const s = byKey.get(key);
        if (!s) return;
        values[s.key] = coerce(value, s.type);
    }

    return { get, apply, load };
}
