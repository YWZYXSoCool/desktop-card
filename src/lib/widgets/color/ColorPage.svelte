<script lang="ts">
    import { createCopyFeedback } from "$lib/core/copyFeedback.svelte";
    import ColorField from "./ColorField.svelte";
    import ColorTop from "./ColorTop.svelte";
    import Palette from "./Palette.svelte";
    import { consumeColorPick, isColorPickPending } from "./pickSignal.svelte";
    import {
        fmtHex,
        fmtHsl,
        fmtRgb,
        hexToRgb,
        hslToRgb,
        type RGB,
    } from "./convert";
    import type { WidgetContext } from "$lib/widgets/api/types";

    let { ctx }: { ctx: WidgetContext } = $props();

    /** 当前色（所有输入汇总到这里）。默认取主题 accent 蓝。 */
    let rgb = $state<RGB>({ r: 91, g: 141, b: 239 });

    /** 正在执行屏幕取色。 */
    let picking = $state(false);

    /** 当前 WebView 不支持原生 EyeDropper API。 */
    let unsupported = $state(false);

    /* ── 格式行：HEX / RGB / HSL，可编辑，任一改动反向驱动 rgb ── */
    const ROWS = [
        { key: "hex", name: "HEX", onInput: onHexInput },
        { key: "rgb", name: "RGB", onInput: onRgbInput },
        { key: "hsl", name: "HSL", onInput: onHslInput },
    ] as const;
    type RowKey = (typeof ROWS)[number]["key"];

    /** 每行当前文本；编辑中的源字段保留用户输入，其余由 rgb 格式化。 */
    const texts = $state<Record<RowKey, string>>({ hex: "", rgb: "", hsl: "" });

    /** 正在编辑的源字段；为 null 时全部行跟随 rgb。 */
    let source: RowKey | null = $state(null);

    /** 复制反馈：刚复制的行临时变 ✓。 */
    const feedback = createCopyFeedback();

    /** 把 rgb 同步到非编辑中的各行。 */
    function syncTexts() {
        if (source !== "hex") texts.hex = fmtHex(rgb);
        if (source !== "rgb") texts.rgb = fmtRgb(rgb);
        if (source !== "hsl") texts.hsl = fmtHsl(rgb);
    }
    $effect(() => syncTexts());

    /* 色盘拖动 → 更新 rgb（所有行随之刷新）。 */
    function onPalette(c: RGB) {
        rgb = c;
    }

    /* 屏幕取色：调用浏览器原生 EyeDropper API（WebView2 / Chromium 95+ 支持），
       弹出 Windows 原生取色框，跨屏取色，Esc 取消。 */
    type EyeDropperResult = { sRGBHex: string };
    interface EyeDropperCtor {
        new (): { open(): Promise<EyeDropperResult> };
    }
    async function pick() {
        const Ctor = (window as unknown as { EyeDropper?: EyeDropperCtor })
            .EyeDropper;
        if (!Ctor) {
            unsupported = true;
            return;
        }
        picking = true;
        try {
            const result = await new Ctor().open();
            const c = hexToRgb(result.sRGBHex);
            if (c) {
                rgb = c;
                // 设置页配置：取色后按所选格式自动复制（默认不复制）
                const fmt = ctx.settings?.get<string>("copyFormat") ?? "none";
                const text =
                    fmt === "rgb"
                        ? fmtRgb(c)
                        : fmt === "hsl"
                          ? fmtHsl(c)
                          : fmt === "hex"
                            ? fmtHex(c)
                            : "";
                if (text) void feedback.copy(text, fmt);
            }
        } catch {
            // 用户按 Esc / 取消，颜色不变
        } finally {
            picking = false;
        }
    }

    // 中键菜单「取色」项：宿主置信号，此处消费并调起取色（刚挂载或已激活都能触发）
    $effect(() => {
        if (isColorPickPending()) {
            consumeColorPick();
            void pick();
        }
    });

    /* 编辑格式行：保留源文本 + 尝试解析驱动 rgb。 */
    function onHexInput(raw: string) {
        source = "hex";
        texts.hex = raw;
        const c = hexToRgb(raw);
        if (c) rgb = c;
    }
    function onRgbInput(raw: string) {
        source = "rgb";
        texts.rgb = raw;
        const m = raw.match(/\d+[\.\d]*\s*,\s*\d+[\.\d]*\s*,\s*\d+[\.\d]*/);
        if (m) {
            const [r, g, b] = m[0]
                .split(",")
                .map((n) => Math.round(parseFloat(n)));
            if (
                r >= 0 &&
                r <= 255 &&
                g >= 0 &&
                g <= 255 &&
                b >= 0 &&
                b <= 255
            ) {
                rgb = { r, g, b };
            }
        }
    }
    function onHslInput(raw: string) {
        source = "hsl";
        texts.hsl = raw;
        const m = raw.match(/\d+[\.\d]*\s*,?\s*\d+[\.\d]*%\s*,?\s*\d+[\.\d]*%/);
        if (m) {
            const parts = m[0].split(/,|\s/).filter(Boolean);
            const h = Math.round(parseFloat(parts[0]));
            const s = Math.round(parseFloat(parts[1]));
            const l = Math.round(parseFloat(parts[2]));
            if (
                h >= 0 &&
                h <= 360 &&
                s >= 0 &&
                s <= 100 &&
                l >= 0 &&
                l <= 100
            ) {
                rgb = hslToRgb({ h, s, l });
            }
        }
    }
</script>

<div class="color">
    <ColorTop
        hex={fmtHex(rgb)}
        {picking}
        {unsupported}
        onpick={pick}
    />

    <Palette {rgb} onchange={onPalette} />

    <!-- 格式行：可编辑 + 复制 -->
    <div class="rows">
        {#each ROWS as row (row.key)}
            <ColorField
                name={row.name}
                value={texts[row.key]}
                copied={feedback.copiedKey === row.key}
                oninput={(v) => row.onInput(v)}
                onblur={() => (source = null)}
                oncopy={() => void feedback.copy(texts[row.key], row.key)}
            />
        {/each}
    </div>
</div>

<style>
    .color {
        height: 100%;
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding: 12px;
    }

    .rows {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }
</style>