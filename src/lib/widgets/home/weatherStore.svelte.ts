import { fetchWeather, type WeatherData } from "./weather";

/**
 * 天气 store 单例：缓存最近一次拉取结果 + 失败标记。
 *
 * 注意：store 拿不到响应式 ctx.settings（组件层的能力），refresh 接收
 * city/unit 参数，触发时机由容器 HomeCard 的 $effect 控制（监听设置变化 +
 * 轮询）。
 */
class WeatherStore {
    current = $state<WeatherData | null>(null);
    error = $state(false);

    /** 拉取一次并更新状态；失败置 error（不清空已有数据）。 */
    async refresh(city: string, unit: string): Promise<void> {
        const data = await fetchWeather(city, unit);
        if (data) {
            this.current = data;
            this.error = false;
        } else {
            this.error = true;
        }
    }
}

export const weather = new WeatherStore();