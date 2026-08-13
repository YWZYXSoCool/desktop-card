import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

/** 一条剪贴板历史（与 Rust clipboard.rs 的 ClipboardItem 对应）。 */
export interface ClipboardItem {
    id: string;
    kind: "text" | "image" | "files";
    text?: string;
    png?: string;
    files?: string[];
    timestamp: number;
}

/** 剪贴板 widget 的可变状态：历史列表 + 暂停 + 过滤。历史由 Rust 后台监控维护，widget 只读 + 操作。 */
class ClipboardStore {
    items = $state<ClipboardItem[]>([]);
    paused = $state(false);
    filter = $state("");
    loaded = $state(false);

    /** 首次挂载时拉起历史并订阅宿主广播（幂等）。 */
    async init(): Promise<void> {
        if (this.loaded) return;
        this.loaded = true;
        try {
            this.items = await invoke<ClipboardItem[]>("clipboard_get_history");
        } catch {
            this.items = [];
        }
        await listen("clipboard-changed", (e) => {
            this.items = e.payload as ClipboardItem[];
        });
    }

    /** 点击条目 = 写回剪贴板（复制到前面）。 */
    copy(id: string): void {
        invoke("clipboard_write", { id }).catch(() => {});
    }

    remove(id: string): void {
        invoke("clipboard_remove", { id }).catch(() => {});
    }

    clear(): void {
        invoke("clipboard_clear").catch(() => {});
    }

    togglePause(): void {
        this.paused = !this.paused;
        invoke("clipboard_set_paused", { paused: this.paused }).catch(() => {});
    }

    /** 按过滤词筛选：匹配文本内容或类型名。$derived 按 filter/items 变化记忆化。 */
    filtered = $derived.by(() => {
        const q = this.filter.trim().toLowerCase();
        if (!q) return this.items;
        return this.items.filter((i) => {
            if (i.kind === "text") return (i.text ?? "").toLowerCase().includes(q);
            if (i.kind === "files") return (i.files ?? []).join(" ").toLowerCase().includes(q);
            return i.kind.includes(q);
        });
    });

    /** 最新一条纯文本（供词典等外部 widget 读取）；历史未加载则现拉。 */
    async latestText(): Promise<string | null> {
        if (!this.loaded) await this.init();
        return this.items.find((i) => i.kind === "text" && i.text)?.text ?? null;
    }
}

export const clipboard = new ClipboardStore();