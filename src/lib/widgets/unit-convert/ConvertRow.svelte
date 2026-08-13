<script lang="ts">
    import { Check, Copy } from "lucide-svelte";

    interface Props {
        /** 单位名 / 进制名。 */
        name: string;
        /** 当前展示文本。 */
        value: string;
        /** 该行是否处于复制 ✓ 反馈态（由容器用 copyFeedback 算好下传）。 */
        copied: boolean;
        /** 无值则禁用复制按钮。 */
        canCopy: boolean;
        /** 软键盘提示（decimal=常规数字，numeric=进制数字）。 */
        inputmode?: "decimal" | "numeric";
        oninput: (v: string) => void;
        oncopy: () => void;
        /** 进制页的非法按键拦截用。 */
        onkeydown?: (e: KeyboardEvent) => void;
    }

    let { name, value, copied, canCopy, inputmode = "decimal", oninput, oncopy, onkeydown }: Props = $props();
</script>

<!-- display:contents 让 label 内的 span/input/button 直接成为外层 .grid 的网格项
     （仍保留 label 的可点击关联），与重构前行为一致 -->
<label class="field">
    <span class="name">{name}</span>
    <input
        type="text"
        {inputmode}
        autocomplete="off"
        spellcheck="false"
        {value}
        onkeydown={onkeydown}
        oninput={(e) => oninput((e.target as HTMLInputElement).value)}
        aria-label={name}
    />
    <button
        type="button"
        class="copy"
        class:copied
        disabled={!canCopy}
        onclick={oncopy}
        aria-label={`复制${name}结果`}
    >
        {#if copied}
            <Check size={13} aria-hidden="true" />
        {:else}
            <Copy size={13} aria-hidden="true" />
        {/if}
    </button>
</label>

<style>
    /* 三列网格项（父 .grid 为 auto 1fr auto）：标签列 auto，输入列固定宽，复制按钮列 auto。
       作为宿主 flex 子项，margin:auto 让整块在窗口内垂直+水平居中 */
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