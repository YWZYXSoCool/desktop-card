<script lang="ts">
    import { Check, Copy } from "lucide-svelte";
    import { fmt } from "./conversions";
    import type { Unit } from "./conversions";

    let { units }: { units: Unit[] } = $props();

    /** 每个单位当前展示的文本（编辑中的源字段保留用户输入，其余由基准值格式化）。 */
    const texts = $state<Record<string, string>>({});

    /** 当前基准单位数值；空输入为 null。 */
    let canonical: number | null = $state(null);

    /** 刚复制的行（临时 ✓ 反馈）。 */
    let copiedKey: string | null = $state(null);

    /** 复制某单位的当前文本到系统剪贴板；成功后按钮短暂变 ✓。 */
    async function copy(key: string) {
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

    /** 剔除非法字符：仅保留数字、小数点在、正负号与科学计数法指数。 */
    function sanitize(raw: string): string {
        return raw.replace(/[^0-9eE+\-.]/g, "");
    }

    /** 在一个输入框里输入/粘贴：剔除非法字符 → 换算到基准 → 同步其余单位。 */
    function onInput(key: string, raw: string) {
        const cleaned = sanitize(raw);

        if (cleaned === "") {
            for (const u of units) texts[u.key] = "";
            canonical = null;
            return;
        }

        texts[key] = raw; // 源字段保留用户输入（光标不跳）
        const num = parseFloat(cleaned);
        if (isNaN(num)) return; // 非法（如只有小数点）则不动其余行

        const unit = units.find((u) => u.key === key)!;
        canonical = unit.toBase(num);
        for (const u of units) {
            if (u.key === key) continue;
            texts[u.key] = fmt(u.fromBase(canonical));
        }
    }
</script>

<div class="grid">
    {#each units as u (u.key)}
        <label class="field">
            <span class="name">{u.name}</span>
            <input
                type="text"
                inputmode="decimal"
                autocomplete="off"
                spellcheck="false"
                value={texts[u.key] ?? ""}
                oninput={(e) => onInput(u.key, (e.target as HTMLInputElement).value)}
                aria-label={u.name}
            />
            <button
                type="button"
                class="copy"
                class:copied={copiedKey === u.key}
                disabled={!texts[u.key]}
                onclick={() => copy(u.key)}
                aria-label={`复制${u.name}结果`}
            >
                {#if copiedKey === u.key}
                    <Check size={13} aria-hidden="true" />
                {:else}
                    <Copy size={13} aria-hidden="true" />
                {/if}
            </button>
        </label>
    {/each}
</div>

<style>
    /* 三列网格：标签列 auto，输入列固定宽，复制按钮列 auto。
       作为宿主 flex 子项，margin:auto 让整块在窗口内垂直+水平居中 */
    .grid {
        margin: auto;
        display: grid;
        grid-template-columns: auto 1fr auto;
        gap: 8px 10px;
        align-items: center;
    }

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