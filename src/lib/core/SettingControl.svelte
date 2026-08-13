<script lang="ts">
    import type { WidgetSetting } from "./types";

    /** 可读写设置项（排除纯展示的分隔组）。 */
    type Field = Exclude<WidgetSetting, { type: "section" }>;

    interface Props {
        setting: Field;
        /** 当前值（容器算好下传）。 */
        value: unknown;
        onchange: (value: unknown) => void;
    }

    let { setting: s, value, onchange }: Props = $props();

    /** 滑杆数值→显示文本：max<=1 视为 0~1 比例显示为百分比，否则原样。 */
    function formatValue(n: number): string {
        if (Number.isNaN(n)) return "";
        if ((s.type === "slider" ? s.max ?? 100 : 100) <= 1) {
            return `${Math.round(n * 100)}%`;
        }
        return String(n);
    }
</script>

<div class="row" class:stack={s.type === "textarea"}>
    <span class="label">{s.label}</span>

    {#if s.type === "toggle"}
        <button
            type="button"
            class="switch"
            class:on={value}
            onclick={() => onchange(!value)}
            aria-pressed={!!value}
            aria-label={s.label}
        >
            <span class="knob"></span>
        </button>
    {:else if s.type === "slider"}
        <div class="ctrl">
            <input
                type="range"
                min={s.min ?? 0}
                max={s.max ?? 100}
                step={s.step ?? 1}
                value={Number(value ?? s.default)}
                oninput={(e) =>
                    onchange(Number((e.target as HTMLInputElement).value))}
                aria-label={s.label}
            />
            <span class="val">{formatValue(Number(value ?? s.default))}</span>
        </div>
    {:else if s.type === "select"}
        <select
            class="select"
            value={String(value ?? s.default)}
            onchange={(e) => {
                const raw = (e.target as HTMLSelectElement).value;
                const opt = (s.options ?? []).find(
                    (o) => String(o.value) === raw,
                );
                onchange(opt ? opt.value : raw);
            }}
            aria-label={s.label}
        >
            {#each s.options ?? [] as opt (opt.value)}
                <option value={opt.value}>{opt.label}</option>
            {/each}
        </select>
    {:else if s.type === "text"}
        <input
            type="text"
            class="input"
            value={String(value ?? s.default ?? "")}
            placeholder={s.placeholder}
            onchange={(e) => onchange((e.target as HTMLInputElement).value)}
            aria-label={s.label}
        />
    {:else if s.type === "number"}
        <input
            type="number"
            class="input num"
            value={Number(value ?? s.default)}
            min={s.min}
            max={s.max}
            step={s.step}
            onchange={(e) => {
                const raw = (e.target as HTMLInputElement).value;
                onchange(raw === "" ? "" : Number(raw));
            }}
            aria-label={s.label}
        />
    {:else if s.type === "color"}
        <input
            type="color"
            class="color"
            value={String(value ?? s.default ?? "#5b8def")}
            oninput={(e) => onchange((e.target as HTMLInputElement).value)}
            aria-label={s.label}
        />
    {:else if s.type === "textarea"}
        <textarea
            class="input area"
            value={String(value ?? s.default ?? "")}
            placeholder={s.placeholder}
            onchange={(e) =>
                onchange((e.target as HTMLTextAreaElement).value)}
            aria-label={s.label}
        ></textarea>
    {/if}
</div>

<style>
    .row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
    }

    .label {
        font-size: 13px;
        color: var(--text);
    }

    .ctrl {
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .ctrl input[type="range"] {
        width: 120px;
        accent-color: var(--accent);
        cursor: pointer;
    }

    .select {
        padding: 4px 8px;
        border: 1px solid var(--border-strong);
        border-radius: 6px;
        background: var(--bg-panel);
        color: var(--text);
        font-size: 13px;
        cursor: pointer;
        outline: none;
    }

    .select:focus {
        border-color: var(--accent);
    }

    .input {
        padding: 4px 8px;
        border: 1px solid var(--border-strong);
        border-radius: 6px;
        background: var(--bg-panel);
        color: var(--text);
        font-size: 13px;
        outline: none;
        width: 120px;
    }

    .input::placeholder {
        color: var(--text-dim);
    }

    .input:focus {
        border-color: var(--accent);
    }

    .input.num {
        width: 90px;
    }

    .area {
        width: 100%;
        resize: vertical;
        min-height: 56px;
        line-height: 1.5;
    }

    .color {
        width: 40px;
        height: 26px;
        padding: 0;
        border: 1px solid var(--border-strong);
        border-radius: 6px;
        background: var(--bg-panel);
        cursor: pointer;
    }

    .row.stack {
        flex-direction: column;
        align-items: stretch;
        gap: 6px;
    }

    .val {
        width: 40px;
        text-align: right;
        font-size: 12px;
        font-variant-numeric: tabular-nums;
        color: var(--text-muted);
    }

    .switch {
        position: relative;
        width: 36px;
        height: 20px;
        padding: 0;
        border: none;
        border-radius: 10px;
        background: var(--bg-input-focus);
        cursor: pointer;
        transition: background 150ms ease;
    }

    .switch.on {
        background: var(--accent);
    }

    .knob {
        position: absolute;
        top: 2px;
        left: 2px;
        width: 16px;
        height: 16px;
        border-radius: 50%;
        background: var(--on-accent);
        transition: transform 150ms ease;
    }

    .switch.on .knob {
        transform: translateX(16px);
    }
</style>