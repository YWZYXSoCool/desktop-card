<script lang="ts">
    import { onMount } from "svelte";
    import { fade } from "svelte/transition";
    import { invoke } from "@tauri-apps/api/core";
    import { getCurrentWindow } from "@tauri-apps/api/window";
    import { toast } from "svelte-sonner";
    import { Copy, Save, X } from "lucide-svelte";
    import * as bus from "./widgetBus";

    /**
     * 截图框选覆盖层（`?mode=snip`，全屏窗口）。
     * 挂载时截取整屏合成图，等比缩放铺在画布上，鼠标拖拽框选，松开后按缩放比例
     * 映射回原始像素裁剪，供「保存 / 复制到剪贴板」。
     */

    let display = $state<HTMLCanvasElement>();
    // 合成图（原始像素）与当前框选（画布坐标）
    let img = $state<HTMLImageElement | null>(null);
    let imgW = $state(0);
    let imgH = $state(0);
    // 画布上图片实际绘制区（等比 contain 后的偏移与尺寸）
    let drawRect = $state({ x: 0, y: 0, w: 0, h: 0 });
    // 框选（画布坐标）与裁剪结果
    let sel = $state<{ x: number; y: number; w: number; h: number } | null>(null);
    let cropping = $state(false); // 正在拖拽
    let cropPng = $state<string | null>(null); // 裁剪出的 base64 PNG

    const win = getCurrentWindow();

    function close() {
        win.close().catch(() => {});
    }

    function onKeydown(e: KeyboardEvent) {
        if (e.key === "Escape") {
            if (cropPng) {
                cropPng = null;
                sel = null;
            } else {
                close();
            }
        }
    }

    /** 把画布坐标映射回合成图原始像素坐标（裁剪用）。 */
    function mapToImage(px: number, py: number, pw: number, ph: number) {
        const sx = (px - drawRect.x) / drawRect.w;
        const sy = (py - drawRect.y) / drawRect.h;
        const x = Math.max(0, Math.min(imgW, Math.round(sx * imgW)));
        const y = Math.max(0, Math.min(imgH, Math.round(sy * imgH)));
        const w = Math.max(1, Math.min(imgW - x, Math.round((pw / drawRect.w) * imgW)));
        const h = Math.max(1, Math.min(imgH - y, Math.round((ph / drawRect.h) * imgH)));
        return { x, y, w, h };
    }

    function redraw() {
        const c = display;
        if (!c || !img) return;
        const ctx = c.getContext("2d")!;
        ctx.clearRect(0, 0, c.width, c.height);
        // 半透明遮罩全屏
        ctx.fillStyle = "rgba(0,0,0,0.35)";
        ctx.fillRect(0, 0, c.width, c.height);
        // 图片区域恢复清晰
        ctx.drawImage(img, drawRect.x, drawRect.y, drawRect.w, drawRect.h);
        // 用目标源-out 把选区外重新压暗，选区保持原样
        if (sel && sel.w > 0 && sel.h > 0) {
            ctx.globalCompositeOperation = "destination-out";
            ctx.fillStyle = "rgba(0,0,0,1)";
            ctx.fillRect(sel.x, sel.y, sel.w, sel.h);
            ctx.globalCompositeOperation = "source-over";
            // 选区描边
            ctx.strokeStyle = "#5b8def";
            ctx.lineWidth = 2;
            ctx.strokeRect(sel.x + 1, sel.y + 1, sel.w - 2, sel.h - 2);
        }
    }

    function onDown(e: MouseEvent) {
        const c = display!;
        const r = c.getBoundingClientRect();
        const x = e.clientX - r.left;
        const y = e.clientY - r.top;
        sel = { x, y, w: 0, h: 0 };
        cropping = true;
        cropPng = null;
    }

    function onMove(e: MouseEvent) {
        if (!cropping || !sel) return;
        const c = display!;
        const r = c.getBoundingClientRect();
        const x = Math.max(0, Math.min(c.width, e.clientX - r.left));
        const y = Math.max(0, Math.min(c.height, e.clientY - r.top));
        sel = { ...sel, w: x - sel.x, h: y - sel.y };
        redraw();
    }

    function onUp() {
        if (!cropping || !sel) {
            cropping = false;
            return;
        }
        cropping = false;
        const { x, y, w, h } = sel;
        if (w < 4 || h < 4) {
            sel = null;
            redraw();
            return;
        }
        // 归一化（反向拖拽时 x/y 可能为负）
        const nx = Math.min(x, x + w);
        const ny = Math.min(y, y + h);
        const nw = Math.abs(w);
        const nh = Math.abs(h);
        const { x: ix, y: iy, w: iw, h: ih } = mapToImage(nx, ny, nw, nh);
        // 裁剪
        const c = document.createElement("canvas");
        c.width = iw;
        c.height = ih;
        c.getContext("2d")!.drawImage(img!, ix, iy, iw, ih, 0, 0, iw, ih);
        cropPng = c.toDataURL("image/png").split(",")[1];
        sel = { x: nx, y: ny, w: nw, h: nh };
        redraw();
    }

    async function save() {
        if (!cropPng) return;
        try {
            const path = await invoke<string>("save_screenshot", { pngB64: cropPng });
            toast("已保存");
            // 广播给截图 widget 刷新列表
            bus.emit("screenshot/new", { path });
            close();
        } catch {
            toast.error("保存失败");
        }
    }

    async function copyToClipboard() {
        if (!cropPng) return;
        try {
            await invoke("copy_png_to_clipboard", { pngB64: cropPng });
            toast("已复制到剪贴板");
            close();
        } catch {
            toast.error("复制失败");
        }
    }

    onMount(async () => {
        const c = display!;
        c.width = window.innerWidth;
        c.height = window.innerHeight;

        try {
            const res = await invoke<{ png_b64: string; width: number; height: number }>(
                "capture_screen",
            );
            imgW = res.width;
            imgH = res.height;
            const im = new Image();
            im.onload = () => {
                img = im;
                // 等比 contain
                const scale = Math.min(c.width / imgW, c.height / imgH);
                const w = Math.floor(imgW * scale);
                const h = Math.floor(imgH * scale);
                drawRect = {
                    x: Math.floor((c.width - w) / 2),
                    y: Math.floor((c.height - h) / 2),
                    w,
                    h,
                };
                redraw();
            };
            im.src = `data:image/png;base64,${res.png_b64}`;
        } catch {
            toast.error("截图失败");
            close();
        }
    });
</script>

<svelte:window onkeydown={onKeydown} />

<div class="snip" class:has-crop={!!cropPng}>
    <canvas
        bind:this={display}
        onmousedown={onDown}
        onmousemove={onMove}
        onmouseup={onUp}
    ></canvas>

    {#if cropPng}
        <div class="toolbar" transition:fade>
            <button class="btn" onclick={() => void copyToClipboard()}>
                <Copy size={13} aria-hidden="true" /> 复制
            </button>
            <button class="btn primary" onclick={() => void save()}>
                <Save size={13} aria-hidden="true" /> 保存
            </button>
            <button class="btn" onclick={() => (cropPng = null)}>
                <X size={13} aria-hidden="true" /> 取消
            </button>
        </div>
    {/if}
</div>

<style>
    .snip {
        position: fixed;
        inset: 0;
        background: #000;
        overflow: hidden;
    }

    canvas {
        width: 100%;
        height: 100%;
        cursor: crosshair;
        display: block;
    }

    .snip.has-crop canvas {
        cursor: default;
    }

    .toolbar {
        position: fixed;
        left: 50%;
        bottom: 24px;
        transform: translateX(-50%);
        display: flex;
        gap: 8px;
        padding: 8px;
        border-radius: 10px;
        background: #20202a;
        box-shadow: 0 6px 24px rgb(0 0 0 / 0.5);
    }

    .btn {
        display: flex;
        align-items: center;
        gap: 5px;
        padding: 7px 12px;
        border: none;
        border-radius: 7px;
        background: transparent;
        color: #e8e8ee;
        font-size: 13px;
        cursor: pointer;
        transition: background 120ms ease;
    }

    .btn:hover {
        background: rgba(255, 255, 255, 0.1);
    }

    .btn.primary {
        background: #5b8def;
        color: #fff;
    }

    .btn.primary:hover {
        background: #4a7bd6;
    }
</style>