<script lang="ts">
    import { createCopyFeedback } from "$lib/core/copyFeedback.svelte";
    import ConvertRow from "./ConvertRow.svelte";

    /** 合法数字字符集（按基数截取 0-f）。 */
    const DIGITS = "0123456789abcdef";

    /** 进制行：key / 显示名 / 基数 / 合法字符集（按基数预截取，避免每次按键重算）。 */
    const ROWS = (
        [
            { key: "dec", name: "十进制", base: 10 },
            { key: "hex", name: "十六进制", base: 16 },
            { key: "oct", name: "八进制", base: 8 },
            { key: "bin", name: "二进制", base: 2 },
        ] as const
    ).map((r) => ({ ...r, valid: DIGITS.slice(0, r.base) }));

    type RowKey = (typeof ROWS)[number]["key"];
    type Row = (typeof ROWS)[number];

    /** 每个进制的展示文本（编辑中的源字段保留用户输入，其余由当前值格式化）。 */
    const texts = $state<Record<RowKey, string>>({
        dec: "",
        hex: "",
        oct: "",
        bin: "",
    });

    /** 当前规范值（bigint 避免大数溢出）；空输入为 null。 */
    let value: bigint | null = $state(null);

    /** 复制反馈：刚复制的行临时变 ✓。 */
    const feedback = createCopyFeedback();

    /** 剔除非法字符与常见前缀（0x/0o/0b），返回可解析的纯数字串。 */
    function sanitize(raw: string, base: number, valid: string): string {
        let s = raw.trim();
        if (base === 16) s = s.replace(/^0[xX]/, "");
        else if (base === 2) s = s.replace(/^0[bB]/, "");
        else if (base === 8) s = s.replace(/^0[oO]/, "");
        const re = new RegExp(`[^${valid}]`, "gi");
        return s.replace(re, "");
    }

    /** 解析某进制的纯数字串为 bigint；带前缀适配 BigInt 语法。 */
    function parse(cleaned: string, base: number): bigint {
        const prefix =
            base === 16 ? "0x" : base === 8 ? "0o" : base === 2 ? "0b" : "";
        return BigInt(prefix + cleaned);
    }

    /** 阻止非法按键：十进制里按字母被直接拦截，字符不会出现。粘贴仍由 onInput 的 sanitize 兜底。 */
    function onKeydown(row: Row, e: KeyboardEvent) {
        if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return; // 快捷键 / 输入法
        if (e.key.length > 1) return; // 控制键（Backspace / 方向 / Tab / Enter…）
        if (!row.valid.includes(e.key.toLowerCase())) {
            e.preventDefault();
        }
    }

    /** 在一个输入框里输入/粘贴：剔除非法字符 → 解析 → 同步其余进制。 */
    function onInput(row: Row, raw: string) {
        const cleaned = sanitize(raw, row.base, row.valid);

        if (cleaned === "") {
            for (const r of ROWS) texts[r.key] = "";
            value = null;
            return;
        }

        texts[row.key] = cleaned; // 源字段保留用户输入（光标不跳）
        try {
            value = parse(cleaned, row.base);
        } catch {
            return; // 理论上 sanitize 后必可解析，兜底不传播
        }
        for (const r of ROWS) {
            if (r.key === row.key) continue;
            texts[r.key] = value ? value.toString(r.base) : "";
        }
    }
</script>

<div class="grid">
    {#each ROWS as row (row.key)}
        <ConvertRow
            name={row.name}
            value={texts[row.key]}
            copied={feedback.copiedKey === row.key}
            canCopy={!!texts[row.key]}
            inputmode="numeric"
            oninput={(v) => onInput(row, v)}
            oncopy={() => void feedback.copy(texts[row.key], row.key)}
            onkeydown={(e) => onKeydown(row, e)}
        />
    {/each}
</div>

<style>
    /* 三列网格：标签列 auto（按内容/最宽标签测量），输入列固定宽，复制按钮列 auto。
       作为宿主 flex 子项，margin:auto 让整块在窗口内垂直+水平居中 */
    .grid {
        margin: auto;
        display: grid;
        grid-template-columns: auto 1fr auto;
        gap: 8px 10px;
        align-items: center;
    }
</style>