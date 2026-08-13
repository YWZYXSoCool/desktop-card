<script lang="ts">
    import {
        Cloud,
        CloudDrizzle,
        CloudFog,
        CloudLightning,
        CloudRain,
        CloudSnow,
        CloudSun,
        Sun,
    } from "lucide-svelte";
    import type { WeatherIconKey } from "./weather";

    // 语义图标键 → lucide 组件（类型一致，用 Sun 作代表即可）
    type Icon = typeof Sun;
    const ICONS: Record<WeatherIconKey, Icon> = {
        sun: Sun,
        "cloud-sun": CloudSun,
        cloud: Cloud,
        fog: CloudFog,
        drizzle: CloudDrizzle,
        snow: CloudSnow,
        rain: CloudRain,
        thunder: CloudLightning,
    };

    interface Props {
        temp?: number;
        desc?: string;
        iconKey?: string;
        error: boolean;
        onrefresh: () => void;
    }

    let { temp, desc, iconKey, error, onrefresh }: Props = $props();

    const Icon = $derived(
        iconKey && iconKey in ICONS
            ? ICONS[iconKey as WeatherIconKey]
            : undefined,
    );
</script>

{#if !error && temp !== undefined && Icon}
    <div
        class="weather"
        role="button"
        tabindex="0"
        onclick={onrefresh}
        onkeydown={(e) => e.key === "Enter" && onrefresh()}
    >
        <Icon size={13} />
        <span class="temp">{temp}°</span>
        {#if desc}
            <span class="desc">{desc}</span>
        {/if}
    </div>
{:else if error}
    <div
        class="weather muted"
        role="button"
        tabindex="0"
        onclick={onrefresh}
        onkeydown={(e) => e.key === "Enter" && onrefresh()}
    >
        天气 —
    </div>
{/if}

<style>
    .weather {
        display: flex;
        align-items: center;
        gap: 4px;
        font-size: 12px;
        color: var(--text-soft);
        white-space: nowrap;
        cursor: pointer;
    }

    .weather .temp {
        font-variant-numeric: tabular-nums;
    }

    .weather.muted {
        color: var(--text-dim);
    }
</style>