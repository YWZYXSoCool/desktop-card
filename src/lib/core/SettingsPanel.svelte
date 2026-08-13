<script lang="ts">
    import { emit } from "@tauri-apps/api/event";
    import { widgetStore } from "$lib/core/settings";
    import type { WidgetDefinition, WidgetSetting } from "./types";

    let { widget }: { widget: WidgetDefinition } = $props();
    const settings = $derived(widget.manifest.settings ?? []);

    // 当前各设置项的值（先铺 schema 默认值，随后从持久化覆盖，避免加载期的可见性闪烁）。
    // 面板按 widget 打开、props 生命周期内不变，故一次性捕获初始值是预期行为。
    // svelte-ignore state_referenced_locally
    let values = $state<Record<string, unknown>>(
        Object.fromEntries(
            (widget.manifest.settings ?? [])
                .filter((s) => s.type !== "section")
                .map((s) => [s.key, s.default]),
        ),
    );

    // 按 visibleWhen 过滤：分隔组恒显示；依赖项当前值不匹配则隐藏本项（依赖项自身不可见时同样隐藏）
    const visibleSettings = $derived(
        settings.filter(
            (s) =>
                s.type === "section" ||
                !s.visibleWhen ||
                values[s.visibleWhen.key] === s.visibleWhen.equals,
        ),
    );

    $effect(() => {
        for (const s of settings) {
            if (s.type === "section") continue; // 分隔组无持久化值
            const key = s.key;
            widgetStore
                .get<unknown>(key, s.default)
                .then((v) => {
                    values = { ...values, [key]: v };
                })
                .catch(() => {});
        }
    });

    /** 变更：通知卡片窗口应用副作用（由卡片持久化 + 触发 onSettingChange）。 */
    function change(
        s: Extract<WidgetSetting, { key: string }>,
        value: unknown,
    ) {
        values = { ...values, [s.key]: value };
        emit("widget-setting-changed", {
            widgetId: widget.manifest.id,
            key: s.key,
            value,
        });
    }

    function formatValue(
        s: Extract<WidgetSetting, { type: "slider" }>,
        value: unknown,
    ): string {
        const n = Number(value);
        if (Number.isNaN(n)) return "";
        if ((s.max ?? 100) <= 1) return `${Math.round(n * 100)}%`;
        return String(n);
    }
</script>

<div class="panel">
    {#each visibleSettings as s (s.type === "section" ? s.name : s.key)}
        {#if s.type === "section"}
            <div class="section">{s.name}</div>
        {:else}
        <div class="row" class:stack={s.type === "textarea"}>
            <span class="label">{s.label}</span>

            {#if s.type === "toggle"}
                <button
                    type="button"
                    class="switch"
                    class:on={values[s.key]}
                    onclick={() => change(s, !values[s.key])}
                    aria-pressed={!!values[s.key]}
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
                        value={Number(values[s.key] ?? s.default)}
                        oninput={(e) =>
                            change(
                                s,
                                Number((e.target as HTMLInputElement).value),
                            )}
                        aria-label={s.label}
                    />
                    <span class="val">
                        {formatValue(s, values[s.key] ?? s.default)}
                    </span>
                </div>
            {:else if s.type === "select"}
                <select
                    class="select"
                    value={String(values[s.key] ?? s.default)}
                    onchange={(e) => {
                        const raw = (e.target as HTMLSelectElement).value;
                        const opt = (s.options ?? []).find(
                            (o) => String(o.value) === raw,
                        );
                        change(s, opt ? opt.value : raw);
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
                    value={String(values[s.key] ?? s.default ?? "")}
                    placeholder={s.placeholder}
                    onchange={(e) =>
                        change(s, (e.target as HTMLInputElement).value)}
                    aria-label={s.label}
                />
            {:else if s.type === "number"}
                <input
                    type="number"
                    class="input num"
                    value={Number(values[s.key] ?? s.default)}
                    min={s.min}
                    max={s.max}
                    step={s.step}
                    onchange={(e) => {
                        const raw = (e.target as HTMLInputElement).value;
                        change(s, raw === "" ? "" : Number(raw));
                    }}
                    aria-label={s.label}
                />
            {:else if s.type === "color"}
                <input
                    type="color"
                    class="color"
                    value={String(values[s.key] ?? s.default ?? "#5b8def")}
                    oninput={(e) =>
                        change(s, (e.target as HTMLInputElement).value)}
                    aria-label={s.label}
                />
            {:else if s.type === "textarea"}
                <textarea
                    class="input area"
                    value={String(values[s.key] ?? s.default ?? "")}
                    placeholder={s.placeholder}
                    onchange={(e) =>
                        change(s, (e.target as HTMLTextAreaElement).value)}
                    aria-label={s.label}
                ></textarea>
            {/if}
        </div>
        {/if}
    {/each}

    {#if visibleSettings.length === 0}
        <div class="empty">该 widget 无设置</div>
    {/if}
</div>

<style>
    .panel {
        display: flex;
        flex-direction: column;
        gap: 12px;
    }

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

    .section {
        margin-top: 6px;
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 0.05em;
        color: var(--text-muted);
    }

    .empty {
        color: var(--text-muted);
        font-size: 13px;
        text-align: center;
        padding: 12px 0;
    }
</style>