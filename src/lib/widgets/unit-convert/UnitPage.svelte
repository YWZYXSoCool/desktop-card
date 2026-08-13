<script lang="ts">
    import { createCopyFeedback } from "$lib/core/copyFeedback.svelte";
    import ConvertRow from "./ConvertRow.svelte";
    import { fmt } from "./conversions";
    import type { Unit } from "./conversions";

    let {
        units,
        decimals = "auto",
    }: {
        units: Unit[];
        /** 结果小数位配置："auto" 或 0–6 数字字符串。 */
        decimals?: string;
    } = $props();

    /** 解析小数位：auto → undefined（自动去尾零），否则固定位数。 */
    const precision = $derived(
        decimals === "auto" ? undefined : Number(decimals),
    );

    /** 每个单位当前展示的文本（编辑中的源字段保留用户输入，其余由基准值格式化）。 */
    const texts = $state<Record<string, string>>({});

    /** 当前基准单位数值；空输入为 null。 */
    let canonical: number | null = $state(null);

    /** 复制反馈：刚复制的行临时变 ✓。 */
    const feedback = createCopyFeedback();

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
            texts[u.key] = fmt(u.fromBase(canonical), precision);
        }
    }
</script>

<div class="grid">
    {#each units as u (u.key)}
        <ConvertRow
            name={u.name}
            value={texts[u.key] ?? ""}
            copied={feedback.copiedKey === u.key}
            canCopy={!!texts[u.key]}
            inputmode="decimal"
            oninput={(v) => onInput(u.key, v)}
            oncopy={() => void feedback.copy(texts[u.key] ?? "", u.key)}
        />
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
</style>