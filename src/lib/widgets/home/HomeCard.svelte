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
    <!-- 四块内容错峰入场（CSS 动画，每次切回主页重放）。包装层保持原布局：时钟/天气为普通 flex 子项，版本/主题仍绝对定位 -->
    <div class="enter clock-wrap" style="--d: 0ms">
        <Clock
            {time}
            {date}
            fontSize={Number(ctx.settings!.get("fontSize"))}
            color={timeColor}
        />
    </div>

    <div class="enter" style="--d: 90ms">
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
    </div>

    <!-- 左下角版本号 + 更新提示（卡片内容层 pointer-events:none，交互按钮需恢复） -->
    <div class="meta enter" style="--d: 180ms">
        <Meta
            {version}
            {update}
            onupdate={() => update && startUpdateDownload(update)}
        />
    </div>

    <!-- 右下角明暗主题切换（卡片模式内容层 pointer-events:none，需恢复） -->
    <div class="enter theme-wrap" style="--d: 220ms">
        <ThemeToggle theme={getTheme()} ontoggle={toggleTheme} />
    </div>
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

    /* 入场动画：轻微上移淡入，`both` 填充保证延迟期间保持首帧隐藏 */
    .enter {
        animation: home-in 300ms cubic-bezier(0.2, 0.7, 0.3, 1) both;
        animation-delay: var(--d, 0ms);
    }

    /* 时钟包装层：内部纵向居中，保证日期缩在时间正下方（.home 只能居中整块） */
    .clock-wrap {
        display: flex;
        flex-direction: column;
        align-items: center;
    }

    @keyframes home-in {
        from {
            opacity: 0;
            transform: translateY(8px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }

    /* 主题按钮的包装层：绝对定位贴底，继承右下角定位；不拦截指针（按钮自身恢复） */
    .theme-wrap {
        position: absolute;
        inset: auto 0 0 0;
        pointer-events: none;
    }
</style>
