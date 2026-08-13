<script lang="ts">
    import { Check, Copy } from "lucide-svelte";

    interface Props {
        name: string;
        value: string;
        copied: boolean;
        oninput: (v: string) => void;
        onblur: () => void;
        oncopy: () => void;
    }

    let { name, value, copied, oninput, onblur, oncopy }: Props = $props();
</script>

<label class="field">
    <span class="name">{name}</span>
    <input
        type="text"
        autocomplete="off"
        spellcheck="false"
        {value}
        oninput={(e) => oninput((e.target as HTMLInputElement).value)}
        onblur={onblur}
        aria-label={name}
    />
    <button
        type="button"
        class="copy"
        class:copied
        disabled={!value}
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