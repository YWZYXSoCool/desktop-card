<script lang="ts">
    import { onMount } from "svelte";
    import { invoke } from "@tauri-apps/api/core";
    import { convertFileSrc } from "@tauri-apps/api/core";
    import { toast } from "svelte-sonner";
    import { Camera, Copy } from "lucide-svelte";
    import type { WidgetContext } from "$lib/widgets/api/types";
    import { openSnip } from "$lib/core/widgetWindows";

    let { ctx }: { ctx: WidgetContext } = $props();

    let shots = $state<string[]>([]); // 截图路径（最新在前）

    async function refresh() {
        try {
            shots = await invoke<string[]>("list_screenshots");
        } catch {
            /* 目录不存在等：静默 */
        }
    }

    /** 把一张截图复制到剪贴板（经 asset 协议取字节 → base64 → 剪贴板）。 */
    async function copyShot(path: string) {
        try {
            const res = await fetch(convertFileSrc(path));
            const buf = await res.arrayBuffer();
            const bytes = new Uint8Array(buf);
            let bin = "";
            for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
            await invoke("copy_png_to_clipboard", {
                pngB64: btoa(bin),
            });
            toast("已复制到剪贴板");
        } catch {
            toast.error("复制失败");
        }
    }

    onMount(() => {
        void refresh();
        // 保存新截图 → 刷新列表
        const un = ctx.bus?.on("screenshot/new", () => void refresh());
        return () => un?.();
    });
</script>

<div class="card">
    <button class="snip-btn" onclick={() => void openSnip()}>
        <Camera size={14} aria-hidden="true" /> 截图
    </button>

    <div class="list">
        {#if shots.length === 0}
            <div class="empty">暂无截图</div>
        {:else}
            {#each shots as path, i (path)}
                <button
                    class="thumb"
                    class:first={i === 0}
                    onclick={() => void copyShot(path)}
                    title="点击复制到剪贴板"
                >
                    <img src={convertFileSrc(path)} alt="截图" loading="lazy" />
                    <span class="copy"><Copy size={12} aria-hidden="true" /></span>
                </button>
            {/each}
        {/if}
    </div>
</div>

<style>
    .card {
        display: flex;
        flex-direction: column;
        gap: 8px;
        width: 100%;
    }

    .snip-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        padding: 7px 10px;
        border: none;
        border-radius: 8px;
        background: var(--accent);
        color: var(--accent-text, #fff);
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        transition: background 120ms ease;
    }

    .snip-btn:hover {
        background: var(--accent-2, var(--accent));
    }

    .list {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 6px;
        flex: 1;
        min-height: 0;
        overflow-y: auto;
    }

    .thumb {
        position: relative;
        aspect-ratio: 16 / 10;
        border: none;
        border-radius: 6px;
        padding: 0;
        overflow: hidden;
        background: var(--bg-2);
        cursor: pointer;
    }

    .thumb img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
    }

    .thumb .copy {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgb(0 0 0 / 0.5);
        color: #fff;
        opacity: 0;
        transition: opacity 120ms ease;
    }

    .thumb:hover .copy {
        opacity: 1;
    }

    .empty {
        grid-column: 1 / -1;
        color: var(--text-muted);
        font-size: 12px;
        text-align: center;
        padding: 12px 0;
    }
</style>