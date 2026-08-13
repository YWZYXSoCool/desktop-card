<script lang="ts">
    import { Check } from "lucide-svelte";

    interface Props {
        /** 目标日期输入值（yyyy-mm-dd）。 */
        date: string;
        /** 名称输入值。 */
        name: string;
        /** 无日期时禁用确认按钮。 */
        canConfirm: boolean;
        ondate: (v: string) => void;
        onname: (v: string) => void;
        onconfirm: () => void;
    }

    let { date, name, canConfirm, ondate, onname, onconfirm }: Props = $props();
</script>

<div class="edit">
    <label class="field">
        <span class="label">目标日期</span>
        <input
            type="date"
            value={date}
            oninput={(e) => ondate((e.target as HTMLInputElement).value)}
        />
    </label>
    <label class="field">
        <span class="label">名称（可选）</span>
        <input
            type="text"
            placeholder="如 春节 / 生日"
            value={name}
            oninput={(e) => onname((e.target as HTMLInputElement).value)}
        />
    </label>
    <button
        type="button"
        class="confirm"
        onclick={onconfirm}
        disabled={!canConfirm}
    >
        <Check size={12} aria-hidden="true" />
        开始倒计时
    </button>
</div>

<style>
    .edit {
        display: flex;
        flex-direction: column;
        gap: 8px;
        width: 100%;
    }

    .field {
        display: flex;
        flex-direction: column;
        gap: 3px;
    }

    .label {
        font-size: 11px;
        color: var(--text-dim);
    }

    .edit input {
        pointer-events: auto;
        width: 100%;
        padding: 4px 8px;
        font-size: 12px;
        color-scheme: dark;
        color: var(--text);
        background: var(--bg-input);
        border: 1px solid transparent;
        border-radius: 6px;
        outline: none;
        transition:
            background 150ms ease,
            border-color 150ms ease;
    }

    .edit input::placeholder {
        color: var(--text-dim);
    }

    .edit input:focus {
        border-color: var(--accent);
        background: var(--bg-input-focus);
    }

    .confirm {
        pointer-events: auto;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 5px;
        padding: 5px 10px;
        font-size: 12px;
        border: none;
        border-radius: 6px;
        background: var(--accent);
        color: var(--on-accent);
        cursor: pointer;
        transition:
            background 150ms ease,
            opacity 150ms ease;
    }

    .confirm:hover {
        background: var(--accent-2);
    }

    .confirm:disabled {
        opacity: 0.5;
        cursor: default;
    }
</style>