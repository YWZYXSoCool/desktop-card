import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { widgetStore } from "./settings";

/**
 * Widget 商店逻辑层（纯逻辑，无 UI）。
 *
 * 遵循「业务留在前端」约定：GitHub 目录的抓取/解析/下载全部经现有裸请求通道
 * `http_request` 在前端完成，Rust 只做 webview 做不了的写/删 widget 目录文件。
 * 源仓库为 `owner/repo[#branch]`，首开默认值，可在商店窗口内编辑并持久化。
 */

/** 目录里一个可安装 widget 的条目。 */
export interface StoreWidget {
    /** 唯一标识（须与 widget.json 的 id 一致，安装时写入该目录名） */
    id: string;
    /** 展示名 */
    name: string;
    /** 一句话简介 */
    description?: string;
    /** 版本号 */
    version?: string;
    /** 作者 */
    author?: string;
    /** 仓库内相对目录（含 widget.json 与入口 JS） */
    path: string;
    /** 额外要下载的文件名（相对该 widget 目录）；默认为空 */
    files?: string[];
}

/** GitHub 源仓库目录（catalog.json 解析结果）。 */
export interface WidgetCatalog {
    widgets: StoreWidget[];
}

/** 解析后的源仓库三元组。 */
export interface WidgetSource {
    owner: string;
    repo: string;
    branch: string;
}

/** 首次打开商店的默认源仓库。 */
export const DEFAULT_SOURCE: WidgetSource = {
    owner: "YWZYXSoCool",
    repo: "desktop-card-widgets",
    branch: "main",
};

/** 持久化源仓库字符串的存储键。 */
const SOURCE_KEY = "store.source";

/** 读取持久化的源字符串；无记录回落默认值。 */
export async function loadSourceString(): Promise<string> {
    const s = await widgetStore.get<string>(SOURCE_KEY, "");
    return s.trim() || `${DEFAULT_SOURCE.owner}/${DEFAULT_SOURCE.repo}`;
}

/** 保存源仓库字符串（空则回落默认）。 */
export async function saveSourceString(s: string): Promise<void> {
    await widgetStore.set(SOURCE_KEY, s.trim());
}

/**
 * 解析 `owner/repo[#branch]` 为三元组。仓库名不接受子路径（防越权读取）。
 * 解析失败返回 null，由 UI 提示。
 */
export function parseSource(s: string): WidgetSource | null {
    const text = s.trim();
    if (!text) return null;
    const [loc, branch = "main"] = text.split("#", 2);
    const parts = loc.trim().split("/");
    if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
    return { owner: parts[0], repo: parts[1], branch };
}

/**
 * 抓取 GitHub 仓库文件的候选 URL 列表。
 * 首选 jsDelivr CDN（`cdn.jsdelivr.net/gh/<owner>/<repo>@<branch>/<path>`）——
 * 国内直连可达，无需代理；备选 raw.githubusercontent.com（大陆常被墙，作兜底）。
 */
function candidateUrls(src: WidgetSource, path: string): string[] {
    return [
        `https://cdn.jsdelivr.net/gh/${src.owner}/${src.repo}@${src.branch}/${path}`,
        `https://raw.githubusercontent.com/${src.owner}/${src.repo}/${src.branch}/${path}`,
    ];
}

/** 发起 HTTP 请求（后端 http_request 只做裸转发，超时由后端兜底）。 */
async function httpRequest(
    url: string,
): Promise<{ status: number; body: string }> {
    return invoke<{ status: number; body: string }>("http_request", {
        req: { method: "GET", url, headers: {}, body: null },
    });
}

/**
 * 依次尝试候选 URL，返回第一个 2xx 的正文；全部失败抛错（带最后一条原因）。
 * jsDelivr 对刚推送的内容可能有短暂缓存延迟，网络不通时回退 raw 原站。
 */
async function getRaw(src: WidgetSource, path: string): Promise<string> {
    let lastErr = "";
    for (const url of candidateUrls(src, path)) {
        try {
            const res = await httpRequest(url);
            if (res.status >= 200 && res.status < 300) return res.body;
            lastErr = `HTTP ${res.status}`;
        } catch (e) {
            lastErr = e instanceof Error ? e.message : String(e);
        }
    }
    throw new Error(`抓取失败：${path}（${lastErr}）`);
}

/** 抓取并解析目录；抓取 / 解析失败抛错给 UI。 */
export async function fetchCatalog(src: WidgetSource): Promise<WidgetCatalog> {
    const body = await getRaw(src, "catalog.json");
    try {
        return JSON.parse(body) as WidgetCatalog;
    } catch (e) {
        throw new Error(`目录解析失败: ${e}`);
    }
}

/** 抓取某个 widget 目录下的原始文件内容（抓取失败抛错）。 */
async function fetchFile(src: WidgetSource, relPath: string): Promise<string> {
    return getRaw(src, relPath);
}

/** 抓取 widget 的 manifest（widget.json），含 entry 与 permissions。 */
export async function fetchManifest(
    src: WidgetSource,
    sw: StoreWidget,
): Promise<{ entry: string; permissions: string[] }> {
    const text = await fetchFile(src, `${sw.path}/widget.json`);
    let manifest: { entry?: string; permissions?: string[] };
    try {
        manifest = JSON.parse(text);
    } catch (e) {
        throw new Error(`manifest 解析失败: ${e}`);
    }
    if (!manifest.entry) throw new Error("widget.json 缺少 entry 字段");
    return {
        entry: manifest.entry,
        permissions: manifest.permissions ?? [],
    };
}

/**
 * 下载 widget 的全部文件并写入 widget 根目录（复用 Rust 写文件命令）。
 * 返回声明的权限，供 UI 在安装前展示。
 */
export async function installWidget(
    src: WidgetSource,
    sw: StoreWidget,
): Promise<string[]> {
    const { entry, permissions } = await fetchManifest(src, sw);

    // 并行抓取：widget.json + entry + 额外 files
    const names = ["widget.json", entry, ...(sw.files ?? [])];
    const contents = await Promise.all(
        names.map((name) => fetchFile(src, `${sw.path}/${name}`)),
    );

    await invoke("write_external_widget", {
        id: sw.id,
        files: names.map((name, i) => ({ name, content: contents[i] })),
    });
    return permissions;
}

/** 卸载：删除 widget 根目录下的该 id 目录（幂等）。 */
export async function uninstallWidget(id: string): Promise<void> {
    await invoke("remove_external_widget", { id });
}

/** 已安装的外部 widget（来自 Rust 枚举，含目录路径与 manifest）。 */
export interface InstalledWidgetEntry {
    path: string;
    manifest: { id: string; name: string; version?: string };
}

/** 枚举已安装的外部 widget，返回 id → 条目 的映射（判定已安装 + 卸载用）。 */
export async function fetchInstalled(): Promise<
    Map<string, InstalledWidgetEntry>
> {
    const entries = await invoke<InstalledWidgetEntry[]>("list_external_widgets");
    return new Map(entries.map((e) => [e.manifest.id, e]));
}

/**
 * 从本地导入一个 widget 目录：弹系统文件夹选择器，Rust 校验并整目录复制进
 * widget 根目录。用户取消返回 null，否则返回导入的 widget id。
 */
export async function importLocalWidget(): Promise<string | null> {
    const picked = await open({
        directory: true,
        multiple: false,
        title: "选择 widget 目录（含 widget.json）",
    });
    if (typeof picked !== "string") return null; // 取消
    const id = await invoke<string>("import_local_widget", { dir: picked });
    return id;
}

/** 权限代号 → 中文说明（安装确认时展示）。 */
export const PERMISSION_LABELS: Record<string, string> = {
    store: "持久化读写（保存自己的数据）",
    settings: "声明式设置项",
    drop: "接收拖入的文件",
    toast: "显示通知提示",
    menu: "注册右键菜单项",
    window: "自定义窗口（预留）",
    execute: "执行系统命令（默认不开放）",
};