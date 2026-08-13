<script lang="ts">
    import { emit } from "@tauri-apps/api/event";
    import { widgetStore } from "$lib/core/settings";
    import SettingControl from "./SettingControl.svelte";
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
</script>

<div class="panel">
    {#each visibleSettings as s (s.type === "section" ? s.name : s.key)}
        {#if s.type === "section"}
            <div class="section">{s.name}</div>
        {:else}
            <SettingControl
                setting={s}
                value={values[s.key]}
                onchange={(v) => change(s, v)}
            />
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