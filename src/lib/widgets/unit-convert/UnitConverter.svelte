<script lang="ts">
    import BaseConvertPage from "./BaseConvertPage.svelte";
    import UnitPage from "./UnitPage.svelte";
    import { CATEGORIES } from "./conversions";
    import type { WidgetContext } from "$lib/widgets/api/types";

    let { ctx }: { ctx: WidgetContext } = $props();

    /** 顶部标签：第一页固定「进制」，其余为各物理量类别。 */
    const TABS = [
        { key: "base", name: "进制" },
        ...CATEGORIES.map((c) => ({ key: c.key, name: c.name })),
    ];

    let active = $state("base");

    /** 设置页配置的结果小数位（"auto" 或 0–6 数字字符串）。 */
    const decimals = $derived(ctx.settings?.get<string>("decimals") ?? "auto");
</script>

<div class="converter">
    <div class="tabs" role="tablist" aria-label="转换类型">
        {#each TABS as tab (tab.key)}
            <button
                type="button"
                role="tab"
                class="pill"
                class:active={active === tab.key}
                aria-selected={active === tab.key}
                onclick={() => (active = tab.key)}
            >
                {tab.name}
            </button>
        {/each}
    </div>

    <div class="body">
        {#key active}
            {#if active === "base"}
                <BaseConvertPage />
            {:else}
                {@const cat = CATEGORIES.find((c) => c.key === active)}
                {#if cat}
                    <UnitPage units={cat.units} decimals={decimals} />
                {/if}
            {/if}
        {/key}
    </div>
</div>

<style>
    .converter {
        flex: 1;
        display: flex;
        flex-direction: column;
        min-height: 0;
    }

    /* 顶部标签：一键可点（卡片模式内容层 pointer-events:none，需在此恢复），
       超宽自动换行而非横向溢出窗口 */
    .tabs {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        padding: 4px 0 0;
        flex-shrink: 0;
        pointer-events: auto;
    }

    .pill {
        flex-shrink: 0;
        padding: 3px 9px;
        font-size: 11px;
        color: var(--text-muted);
        border: none;
        border-radius: 999px;
        background: transparent;
        cursor: pointer;
        transition:
            background 150ms ease,
            color 150ms ease;
    }

    .pill:hover {
        background: var(--hover);
        color: var(--text);
    }

    .pill.active {
        background: var(--accent-soft);
        color: var(--accent-text);
    }

    .body {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        padding: 4px 8px 8px;
        display: flex;
    }
</style>