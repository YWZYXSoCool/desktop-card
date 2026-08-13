<script lang="ts">
    import { fmtHex, hsbToRgb, rgbToHsb, type RGB } from "./convert";

    /** 当前色 + 变更回调（拖动时实时触发）。 */
    let { rgb, onchange }: { rgb: RGB; onchange: (c: RGB) => void } = $props();

    const hsb = $derived(rgbToHsb(rgb));

    /** 正在拖拽的区域："sv" 面板 / "h" 色相条。 */
    let dragging: "sv" | "h" | null = $state(null);

    /** 把一次指针事件换算成新的颜色并回调。 */
    function move(e: PointerEvent, kind: "sv" | "h") {
        const el = e.currentTarget as HTMLElement;
        const rect = el.getBoundingClientRect();
        if (kind === "h") {
            const h = Math.round(clamp((e.clientX - rect.left) / rect.width, 0, 1) * 359);
            onchange(hsbToRgb({ ...hsb, h }));
        } else {
            const s = clamp((e.clientX - rect.left) / rect.width, 0, 1) * 100;
            const b = (1 - clamp((e.clientY - rect.top) / rect.height, 0, 1)) * 100;
            onchange(hsbToRgb({ h: hsb.h, s, b }));
        }
    }

    function start(e: PointerEvent, kind: "sv" | "h") {
        dragging = kind;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        move(e, kind);
    }

    function clamp(n: number, lo: number, hi: number): number {
        return Math.min(hi, Math.max(lo, n));
    }
</script>

<div class="palette">
    <!-- 饱和度 / 亮度面板：纯 CSS 双渐变（左白→右当前色相，底黑→顶透明），指针映射 S/B -->
    <div
        class="sv"
        role="slider"
        aria-label="饱和度 / 亮度"
        aria-valuenow={Math.round(hsb.s * 100 + hsb.b)}
        tabindex="0"
        style:--h={hsb.h}
        onpointerdown={(e) => start(e, "sv")}
        onpointermove={(e) => dragging === "sv" && move(e, "sv")}
        onpointerup={() => (dragging = null)}
        onpointercancel={() => (dragging = null)}
    >
        <div
            class="thumb"
            style:left={hsb.s + "%"}
            style:top={100 - hsb.b + "%"}
            style:background={fmtHex(rgb)}
        ></div>
    </div>

    <!-- 色相条 -->
    <div
        class="hue"
        role="slider"
        aria-label="色相"
        aria-valuenow={hsb.h}
        tabindex="0"
        onpointerdown={(e) => start(e, "h")}
        onpointermove={(e) => dragging === "h" && move(e, "h")}
        onpointerup={() => (dragging = null)}
        onpointercancel={() => (dragging = null)}
    >
        <div class="thumb h" style:left={(hsb.h / 360) * 100 + "%"}></div>
    </div>
</div>

<style>
    .palette {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .sv {
        pointer-events: auto;
        position: relative;
        height: 110px;
        border-radius: 6px;
        cursor: crosshair;
        background:
            linear-gradient(0deg, #000, #0000),
            linear-gradient(90deg, #fff, hsl(var(--h) 100% 50%));
    }

    .hue {
        pointer-events: auto;
        position: relative;
        height: 14px;
        border-radius: 6px;
        cursor: ew-resize;
        background: linear-gradient(
            90deg,
            #f00,
            #ff0,
            #0f0,
            #0ff,
            #00f,
            #f0f,
            #f00
        );
    }

    .thumb {
        position: absolute;
        width: 12px;
        height: 12px;
        border-radius: 50%;
        border: 2px solid #fff;
        box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.4);
        transform: translate(-50%, -50%);
        pointer-events: none;
    }

    .thumb.h {
        top: 50%;
        width: 10px;
        height: 10px;
        background: #fff;
    }
</style>