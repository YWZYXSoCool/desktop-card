import manifest from "./widget.json";
import ClockCard from "./HomeCard.svelte";
import { defineWidget } from "$lib/widgets/api/defineWidget";
import type { WidgetManifest, WidgetSetting } from "$lib/widgets/api/types";
import { ACCENT_OPTIONS, setAccent } from "$lib/core/accent.svelte";

/**
 * 声明式设置（TS 单一来源）：状态、恢复、应用、类型收窄全由 defineWidget 自动派生。
 * 增删一个设置只改这里一处；组件用 `ctx.settings.get("fontSize")` 读。
 */
const settings = [
    { type: "section", name: "时钟" },
    {
        key: "clock.hour12",
        label: "12 小时制",
        type: "toggle" as const,
        default: false,
    },
    {
        key: "clock.weekdayStyle",
        label: "星期样式",
        type: "select" as const,
        default: "long",
        options: [
            { label: "完整（星期二）", value: "long" },
            { label: "简短（周二）", value: "short" },
        ] as const,
    },
    {
        key: "clock.fontSize",
        label: "时钟字号",
        type: "number" as const,
        default: 34,
        min: 16,
        max: 72,
        step: 1,
    },
    {
        key: "clock.color",
        label: "时间颜色",
        type: "color" as const,
        default: "#f2f2f5",
    },
    { type: "section", name: "天气" },
    {
        key: "weather.city",
        label: "天气城市",
        type: "text" as const,
        default: "",
        placeholder: "留空自动定位",
    },
    {
        key: "weather.unit",
        label: "温度单位",
        type: "select" as const,
        default: "celsius",
        options: [
            { label: "摄氏度 °C", value: "celsius" },
            { label: "华氏度 °F", value: "fahrenheit" },
        ] as const,
    },
    { type: "section", name: "外观" },
    {
        key: "theme.accent",
        label: "主题色",
        type: "select" as const,
        default: "blue",
        options: ACCENT_OPTIONS,
    },
    { type: "section", name: "系统" },
    {
        key: "autostart.enabled",
        label: "开机自启",
        type: "toggle" as const,
        default: false,
    },
    {
        key: "global.shortcut",
        label: "全局快捷键",
        type: "text" as const,
        default: "ctrl+alt+space",
        placeholder: "如 ctrl+alt+space",
    },
] satisfies WidgetSetting[];

export const definition = defineWidget({
    manifest: manifest as unknown as WidgetManifest,
    settings,
    component: ClockCard,
    onSettingChange: (key, value) => {
        if (key === "theme.accent") setAccent(String(value));
    },
});
