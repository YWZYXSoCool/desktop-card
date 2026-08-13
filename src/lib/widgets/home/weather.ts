/**
 * 天气数据层：Open-Meteo 免费天气 API（免 key、开 CORS）。
 *
 * 纯逻辑、框架无关，供 weather.svelte.ts store 调用。图标以语义键返回
 * （而非 lucide 组件），由展示层做键→图标映射，便于复用与测试。
 *
 * 城市留空则按 IP 自动定位（ipwho.is）。
 */

/** 天气图标的语义键（展示层映射到具体图标组件）。 */
export type WeatherIconKey =
    | "sun"
    | "cloud-sun"
    | "cloud"
    | "fog"
    | "drizzle"
    | "snow"
    | "rain"
    | "thunder";

/** WMO 天气代码 → 中文描述。 */
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

/** WMO 天气代码 → 语义图标键。 */
function weatherIcon(code: number): WeatherIconKey {
    if (code === 0) return "sun";
    if (code <= 2) return "cloud-sun";
    if (code === 3) return "cloud";
    if (code <= 48) return "fog";
    if (code <= 57) return "drizzle";
    if (code <= 77) return "snow";
    if (code <= 86) return "rain";
    return "thunder";
}

export interface WeatherData {
    temp: number;
    icon: WeatherIconKey;
    desc: string;
    city: string;
}

/**
 * 拉取当前天气。城市留空则按 IP 自动定位；失败返回 null（不抛错）。
 * 典型三次请求：geocoding（指定城市）或 ipwho.is（IP 定位）+ open-meteo 预报。
 */
export async function fetchWeather(city: string, unit: string): Promise<WeatherData | null> {
    try {
        let lat: number;
        let lon: number;
        let name: string;
        const cityName = city.trim();
        if (cityName) {
            const geo = await fetch(
                `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityName)}&count=1&language=zh&format=json`,
            ).then((r) => r.json());
            const hit = geo?.results?.[0];
            if (!hit) return null;
            lat = hit.latitude;
            lon = hit.longitude;
            name = hit.name;
        } else {
            const ip = await fetch("https://ipwho.is/").then((r) => r.json());
            if (!ip?.success) return null;
            lat = ip.latitude;
            lon = ip.longitude;
            name = ip.city || "当前位置";
        }

        const tempUnit = unit === "fahrenheit" ? "fahrenheit" : "celsius";
        const w = await fetch(
            `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
                `&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m` +
                `&temperature_unit=${tempUnit}&timezone=auto`,
        ).then((r) => r.json());
        const cur = w?.current;
        if (!cur) return null;

        return {
            temp: Math.round(cur.temperature_2m),
            icon: weatherIcon(cur.weather_code),
            desc: WEATHER_DESC[cur.weather_code] ?? "未知",
            city: name,
        };
    } catch {
        return null;
    }
}