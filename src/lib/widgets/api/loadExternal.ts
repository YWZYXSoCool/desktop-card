import { invoke } from "@tauri-apps/api/core";
import type { WidgetDefinition, WidgetManifest } from "./types";
import { createSandboxWidget } from "./sandbox";

/** 外部 widget 目录条目（来自 Rust `list_external_widgets`）。 */
interface ExternalWidgetEntry {
    /** widget 目录的绝对路径 */
    path: string;
    /** 解析后的 widget.json 内容 */
    manifest: WidgetManifest;
}

/**
 * 扫描外部 widget 目录（Rust 侧枚举），逐个在 QuickJS 沙箱里创建。
 * 单个 widget 加载失败仅告警，不影响其余与内置。
 */
export async function scanExternalWidgets(): Promise<WidgetDefinition[]> {
    let entries: ExternalWidgetEntry[];
    try {
        entries = await invoke<ExternalWidgetEntry[]>("list_external_widgets");
    } catch (err) {
        console.warn("[widget] 扫描外部 widget 失败：", err);
        return [];
    }

    // 各 widget 沙箱彼此独立，并行创建以缩短启动时间；单个失败仅告警，不影响其余。
    const defs = (
        await Promise.all(
            entries.map(async (e) => {
                try {
                    return await createSandboxWidget(e.path, e.manifest);
                } catch (err) {
                    console.error(`[widget] 加载失败 ${e.manifest.id}:`, err);
                    return null;
                }
            }),
        )
    ).filter((d): d is WidgetDefinition => d !== null);
    return defs;
}