<script lang="ts">
    import {
        Sun,
        Moon,
        CloudSun,
        Cloud,
        CloudFog,
        CloudDrizzle,
        CloudRain,
        CloudSnow,
        CloudLightning,
    } from "lucide-svelte";
    import { getTheme, toggleTheme } from "$lib/core/theme.svelte";

    // 所有 lucide 图标出自同一工厂，类型一致，用 Sun 作代表即可
    type WeatherIcon = typeof Sun;
    import type { WidgetContext } from "$lib/widgets/api/types";

    // defineWidget 已注入 ctx.settings（声明了 settings 权限 + 设置项）
    let { ctx }: { ctx: WidgetContext } = $props();

    let now = $state(new Date());

    $effect(() => {
        const id = setInterval(() => {
            now = new Date();
        }, 1000);
        return () => clearInterval(id);
    });

    const time = $derived(
        now.toLocaleTimeString("zh-CN", {
            hour12: ctx.settings!.get("hour12"),
        }),
    );
    const date = $derived(
        now.toLocaleDateString("zh-CN", {
            month: "long",
            day: "numeric",
            weekday: ctx.settings!.get("weekdayStyle"),
        }),
    );

    // 时间颜色：默认值随主题翻转（深色下仍为 #f2f2f5）；用户自定义颜色则原样使用
    const timeColor = $derived(
        String(ctx.settings!.get("color") ?? "") === "#f2f2f5"
            ? "var(--text)"
            : String(ctx.settings!.get("color")),
    );

    // ── 天气（Open-Meteo，免费免 key、开 CORS；城市留空则按 IP 自动定位）──
    const WEATHER_DESC: Record<number, string> = {
        0: "晴",
        1: "多云",
        2: "多云",
        3: "阴",
        45: "雾",
        48: "雾",
        51: "毛毛雨",
        53: "毛毛雨",
        55: "毛毛雨",
        56: "冻毛毛雨",
        57: "冻毛毛雨",
        61: "小雨",
        63: "中雨",
        65: "大雨",
        66: "冻雨",
        67: "冻雨",
        71: "小雪",
        73: "中雪",
        75: "大雪",
        77: "雪粒",
        80: "阵雨",
        81: "阵雨",
        82: "强阵雨",
        85: "阵雪",
        86: "阵雪",
        95: "雷暴",
        96: "雷暴伴冰雹",
        99: "雷暴伴冰雹",
    };

    function weatherIcon(code: number): WeatherIcon {
        if (code === 0) return Sun;
        if (code <= 2) return CloudSun;
        if (code === 3) return Cloud;
        if (code <= 48) return CloudFog;
        if (code <= 57) return CloudDrizzle;
        if (code <= 77) return CloudSnow;
        if (code <= 86) return CloudRain;
        return CloudLightning;
    }

    let weather = $state<{
        temp: number;
        icon: WeatherIcon;
        desc: string;
    } | null>(null);
    let weatherCity = $state("");
    let weatherError = $state(false);

    async function fetchWeather() {
        const city = String(ctx.settings!.get("city") ?? "").trim();
        try {
            let lat: number;
            let lon: number;
            let name: string;
            if (city) {
                const geo = await fetch(
                    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=zh&format=json`,
                ).then((r) => r.json());
                const hit = geo?.results?.[0];
                if (!hit) return;
                lat = hit.latitude;
                lon = hit.longitude;
                name = hit.name;
            } else {
                const ip = await fetch("https://ipwho.is/").then((r) =>
                    r.json(),
                );
                if (!ip?.success) return;
                lat = ip.latitude;
                lon = ip.longitude;
                name = ip.city || "当前位置";
            }

            const unit =
                ctx.settings!.get("unit") === "fahrenheit"
                    ? "fahrenheit"
                    : "celsius";
            const w = await fetch(
                `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
                    `&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m` +
                    `&temperature_unit=${unit}&timezone=auto`,
            ).then((r) => r.json());
            const cur = w?.current;
            if (!cur) return;

            weatherCity = name;
            weather = {
                temp: Math.round(cur.temperature_2m),
                icon: weatherIcon(cur.weather_code),
                desc: WEATHER_DESC[cur.weather_code] ?? "未知",
            };
            weatherError = false;
        } catch {
            weatherError = true;
        }
    }

    // 跟随设置变更 + 挂载拉取 + 每 10 分钟刷新
    $effect(() => {
        ctx.settings!.get("city");
        ctx.settings!.get("unit");
        void fetchWeather();
        const id = setInterval(() => void fetchWeather(), 10 * 60 * 1000);
        return () => clearInterval(id);
    });
</script>

<div class="home">
    <div
        class="time"
        style:font-size={`${ctx.settings!.get("fontSize")}px`}
        style:color={timeColor}
    >
        {time}
    </div>
    <div class="date">{date}</div>
    {#if weather}
        {@const Icon = weather.icon}
        <div
            class="weather"
            role="button"
            tabindex="0"
            onclick={fetchWeather}
            onkeydown={(e) => e.key === "Enter" && fetchWeather()}
        >
            <Icon size={13} />
            <span class="temp">{weather.temp}°</span>
            <span class="desc">{weather.desc}</span>
        </div>
    {:else if weatherError}
        <div
            class="weather muted"
            role="button"
            tabindex="0"
            onclick={fetchWeather}
            onkeydown={(e) => e.key === "Enter" && fetchWeather()}
        >
            天气 —
        </div>
    {/if}

    <!-- 右下角明暗主题切换（卡片模式内容层 pointer-events:none，需恢复） -->
    <button
        type="button"
        class="theme-toggle"
        onclick={toggleTheme}
        aria-label="切换明暗主题"
    >
        {#if getTheme() === "dark"}
            <Sun size={13} aria-hidden="true" />
        {:else}
            <Moon size={13} aria-hidden="true" />
        {/if}
    </button>
</div>

<style>
    .home {
        position: relative;
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 6px;
        min-width: 0;
    }

    .time {
        font-size: 34px;
        font-weight: 600;
        font-variant-numeric: tabular-nums;
        letter-spacing: 0.02em;
        color: var(--text);
        line-height: 1;
        white-space: nowrap;
    }

    .date {
        font-size: 12px;
        color: var(--text-muted);
        white-space: nowrap;
    }

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

    .theme-toggle {
        pointer-events: auto;
        position: absolute;
        right: 8px;
        bottom: 8px;
        width: 22px;
        height: 22px;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        border: none;
        border-radius: 6px;
        background: transparent;
        color: var(--text-muted);
        cursor: pointer;
        transition:
            color 150ms ease,
            background 150ms ease;
    }

    .theme-toggle:hover {
        color: var(--text);
        background: var(--hover);
    }
</style>
