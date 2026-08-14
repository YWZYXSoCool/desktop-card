import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { toast } from "svelte-sonner";
import { widgetStore } from "./settings";

/** 更新检查结果（对应 Rust `update.rs` 的 UpdateInfo）。 */
export interface UpdateInfo {
    updateAvailable: boolean;
    currentVersion: string;
    latestVersion: string;
    assetName: string | null;
    assetUrl: string | null;
    releaseUrl: string;
}

/** 读取用户配置的 GitHub 代理前缀（主页「系统」设置的 `update.proxy`，空则直连）。 */
async function loadProxy(): Promise<string> {
    try {
        return String((await widgetStore.get("update.proxy", "")) ?? "").trim();
    } catch {
        return "";
    }
}

/** 请求检查更新；有更新返回 UpdateInfo，无更新 / 网络失败 / 解析失败返回 null（静默）。 */
export async function checkForUpdate(): Promise<UpdateInfo | null> {
    try {
        const proxy = await loadProxy();
        const u = await invoke<UpdateInfo>("check_for_update", { proxy });
        return u.updateAvailable ? u : null;
    } catch {
        return null;
    }
}

/** 有新版本：toast + 操作按钮（下载安装；找不到安装包则退化打开 Releases 页）。 */
export function openUpdateToast(u: UpdateInfo) {
    const label = `下载并安装 v${u.latestVersion}`;
    if (u.assetUrl) {
        toast(`发现新版本 v${u.latestVersion}`, {
            action: { label, onClick: () => startUpdateDownload(u) },
            duration: 20000,
        });
    } else {
        toast(`发现新版本 v${u.latestVersion}`, {
            action: {
                label: "打开 Releases 页",
                onClick: () => openUrl(u.releaseUrl).catch(() => {}),
            },
            duration: 20000,
        });
    }
}

/** 下载进行中守卫：避免重复点击触发多个下载 + 重复事件监听。 */
let downloading = false;

/** 下载并安装：loading toast + 进度更新，成功后 Rust 侧启动安装器并退出主程序。 */
export async function startUpdateDownload(u: UpdateInfo) {
    if (downloading) return;
    if (!u.assetUrl) {
        // 没有安装包：退化为打开 Releases 页
        openUrl(u.releaseUrl).catch(() => {});
        return;
    }
    downloading = true;
    const id = toast.loading(`正在下载 v${u.latestVersion}…`);
    const unlisten = await listen<{ received: number; total: number }>(
        "update-download-progress",
        (e) => {
            const { received, total } = e.payload;
            const mb = (b: number) => (b / 1024 / 1024).toFixed(1);
            const text = total
                ? `正在下载 v${u.latestVersion}… ${Math.round((received / total) * 100)}% (${mb(received)}/${mb(total)} MB)`
                : `正在下载 v${u.latestVersion}… ${mb(received)} MB`;
            toast(text, { id });
        },
    );
    try {
        await invoke("download_and_install", { assetUrl: u.assetUrl });
        toast.success("更新已下载，正在安装…", { id });
    } catch (e) {
        unlisten();
        toast.error(`下载失败：${String(e)}`, { id });
    } finally {
        downloading = false;
    }
}