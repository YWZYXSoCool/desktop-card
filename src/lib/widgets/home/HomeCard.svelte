<script lang="ts">
    import { getVersion } from "@tauri-apps/api/app";
    import {
        checkForUpdate,
        startUpdateDownload,
        type UpdateInfo,
    } from "$lib/core/update";
    import { getTheme, toggleTheme } from "$lib/core/theme.svelte";
    import type { WidgetContext } from "$lib/widgets/api/types";
    import Clock from "./Clock.svelte";
    import Meta from "./Meta.svelte";
    import ThemeToggle from "./ThemeToggle.svelte";
    import Weather from "./Weather.svelte";
    import { weather as weatherStore } from "./weatherStore.svelte";

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

    // 天气：跟随设置变更 + 挂载拉取 + 每 10 分钟刷新（触发由容器 $effect 驱动，
    // 因 weather store 拿不到响应式 settings）
    $effect(() => {
        const city = String(ctx.settings!.get("city") ?? "");
        const unit = String(ctx.settings!.get("unit") ?? "");
        void weatherStore.refresh(city, unit);
        const id = setInterval(
            () => void weatherStore.refresh(city, unit),
            10 * 60 * 1000,
        );
        return () => clearInterval(id);
    });

    // 左下角：应用版本号 + 有更新时显示更新图标（仅挂载时检查一次）
    let version = $state("");
    let update = $state<UpdateInfo | null>(null);
    $effect(() => {
        void getVersion()
            .then((v) => (version = v))
            .catch(() => {});
        void checkForUpdate().then((u) => (update = u));
    });
</script>

<div class="home">
    <Clock
        {time}
        {date}
        fontSize={Number(ctx.settings!.get("fontSize"))}
        color={timeColor}
    />

    <Weather
        temp={weatherStore.current?.temp}
        desc={weatherStore.current?.desc}
        iconKey={weatherStore.current?.icon}
        error={weatherStore.error}
        onrefresh={() =>
            void weatherStore.refresh(
                String(ctx.settings!.get("city") ?? ""),
                String(ctx.settings!.get("unit") ?? ""),
            )}
    />

    <!-- 左下角版本号 + 更新提示（卡片内容层 pointer-events:none，交互按钮需恢复） -->
    <div class="meta">
        <Meta
            {version}
            {update}
            onupdate={() => update && startUpdateDownload(update)}
        />
    </div>

    <!-- 右下角明暗主题切换（卡片模式内容层 pointer-events:none，需恢复） -->
    <ThemeToggle theme={getTheme()} ontoggle={toggleTheme} />
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

    .meta {
        position: absolute;
        left: 8px;
        bottom: 8px;
        display: flex;
        align-items: center;
        gap: 4px;
        pointer-events: none; /* 非交互区穿透，避免挡住卡片拖动 */
    }
</style>
