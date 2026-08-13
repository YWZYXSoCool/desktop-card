<script lang="ts">
    import { Check, Copy, Pipette } from "lucide-svelte";
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

    /** 刚复制的行（临时 ✓ 反馈）。 */
    let copiedKey: RowKey | null = $state(null);

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
            if (c) rgb = c;
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

    /* 复制某行文本到剪贴板；成功后按钮短暂变 ✓。 */
    async function copy(key: RowKey) {
        const text = texts[key];
        if (!text) return;
        try {
            await navigator.clipboard.writeText(text);
            copiedKey = key;
            setTimeout(() => {
                if (copiedKey === key) copiedKey = null;
            }, 1200);
        } catch {
            // 剪贴板写入失败则静默忽略
        }
    }

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
    <!-- 顶部：当前色大色块 + 取色按钮 -->
    <div class="top">
        <div class="swatch" style:background={fmtHex(rgb)}></div>
        <button
            type="button"
            class="pick"
            onclick={pick}
            disabled={picking}
            aria-label="从屏幕取色"
            aria-busy={picking}
        >
            <Pipette size={13} aria-hidden="true" />
        </button>
    </div>

    {#if unsupported}
        <div class="unsupported">当前环境不支持屏幕取色</div>
    {/if}

    <Palette {rgb} onchange={onPalette} />

    <!-- 格式行：可编辑 + 复制 -->
    <div class="rows">
        {#each ROWS as row (row.key)}
            <label class="field">
                <span class="name">{row.name}</span>
                <input
                    type="text"
                    autocomplete="off"
                    spellcheck="false"
                    value={texts[row.key]}
                    oninput={(e) =>
                        row.onInput((e.target as HTMLInputElement).value)}
                    onblur={() => (source = null)}
                    aria-label={row.name}
                />
                <button
                    type="button"
                    class="copy"
                    class:copied={copiedKey === row.key}
                    disabled={!texts[row.key]}
                    onclick={() => copy(row.key)}
                    aria-label={`复制${row.name}结果`}
                >
                    {#if copiedKey === row.key}
                        <Check size={13} aria-hidden="true" />
                    {:else}
                        <Copy size={13} aria-hidden="true" />
                    {/if}
                </button>
            </label>
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

    .top {
        display: flex;
        align-items: center;
        gap: 10px;
    }

    .swatch {
        flex: 1;
        height: 40px;
        border-radius: 6px;
        border: 1px solid var(--border-strong);
    }

    .pick {
        pointer-events: auto;
        width: 28px;
        height: 28px;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        border: 1px solid var(--border-strong);
        border-radius: 6px;
        background: transparent;
        color: var(--text);
        cursor: pointer;
        transition:
            background 150ms ease,
            border-color 150ms ease,
            color 150ms ease;
    }

    .pick:hover:not(:disabled) {
        background: var(--accent-soft);
        border-color: var(--accent);
        color: var(--accent-text);
    }

    .pick:disabled {
        opacity: 0.6;
        cursor: default;
    }

    .unsupported {
        font-size: 12px;
        color: var(--accent-text);
        background: var(--accent-soft);
        padding: 6px 10px;
        border-radius: 6px;
    }

    .rows {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .field {
        display: grid;
        grid-template-columns: auto 1fr auto;
        gap: 8px 10px;
        align-items: center;
    }

    .name {
        font-size: 12px;
        color: var(--text-muted);
        text-align: right;
        min-width: 30px;
        font-variant-numeric: tabular-nums;
    }

    input {
        pointer-events: auto;
        width: 100%;
        min-width: 0;
        padding: 4px 8px;
        font-size: 12px;
        font-variant-numeric: tabular-nums;
        color: var(--text);
        background: var(--bg-input);
        border: 1px solid transparent;
        border-radius: 6px;
        outline: none;
        transition:
            background 150ms ease,
            border-color 150ms ease;
    }

    input::placeholder {
        color: var(--text-dim);
    }

    input:focus {
        border-color: var(--accent);
        background: var(--bg-input-focus);
    }

    .copy {
        pointer-events: auto;
        width: 22px;
        height: 22px;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        border: 1px solid transparent;
        border-radius: 6px;
        background: transparent;
        color: var(--text-muted);
        cursor: pointer;
        transition:
            background 150ms ease,
            color 150ms ease,
            opacity 150ms ease;
    }

    .copy:hover:not(:disabled) {
        background: var(--hover);
        color: var(--text);
    }

    .copy:disabled {
        opacity: 0.35;
        cursor: default;
    }

    .copy.copied {
        color: var(--accent);
    }
</style>
