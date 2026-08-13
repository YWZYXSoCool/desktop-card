<script lang="ts">
    import { Check, Copy } from "lucide-svelte";

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

    /** 刚复制的行（显示临时 ✓ 反馈）。 */
    let copiedKey: RowKey | null = $state(null);

    /** 复制某进制的当前文本到系统剪贴板；成功后按钮短暂变 ✓。 */
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
            // 剪贴板写入失败则静默忽略（不打断输入）
        }
    }

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
        <label class="field">
            <span class="name">{row.name}</span>
            <input
                type="text"
                inputmode="numeric"
                autocomplete="off"
                spellcheck="false"
                value={texts[row.key]}
                onkeydown={(e) => onKeydown(row, e)}
                oninput={(e) =>
                    onInput(row, (e.target as HTMLInputElement).value)}
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

    /* display:contents 让 label 内的 span/input 直接成为网格项（仍保留 label 的可点击关联） */
    .field {
        display: contents;
    }

    .name {
        font-size: 12px;
        color: var(--text-muted);
        text-align: right;
    }

    input {
        pointer-events: auto;
        width: 150px;
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