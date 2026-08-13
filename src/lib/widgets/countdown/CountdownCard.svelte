<script lang="ts">
    import { Check, RotateCcw } from "lucide-svelte";
    import { toast } from "svelte-sonner";
    import type { WidgetContext } from "$lib/widgets/api/types";
    import { countdown } from "./countdown.svelte";

    // 声明了 store 权限，defineWidget 已注入 ctx.store
    let { ctx }: { ctx: WidgetContext } = $props();

    let now = $state(new Date());
    $effect(() => {
        const id = setInterval(() => (now = new Date()), 1000);
        return () => clearInterval(id);
    });

    const target = $derived(
        countdown.target ? new Date(countdown.target) : null,
    );
    const remain = $derived(target ? remaining(target, now) : null);

    // 到点只提醒一次，避免每秒都弹
    let notified = $state(false);
    $effect(() => {
        if (remain?.done && !notified) {
            notified = true;
            toast(`倒计时结束：${countdown.name || "时间到"}`);
        }
    });

    // 编辑态输入
    let dateInput = $state("");
    let nameInput = $state(countdown.name);

    function confirm() {
        const d = dateInput.trim();
        if (!d) return;
        // 目标定为该日 00:00（本地时区），存储为 ISO 保证跨时区一致
        countdown.set(
            new Date(`${d}T00:00:00`).toISOString(),
            nameInput.trim(),
        );
        notified = false;
        persist();
    }

    function reset() {
        countdown.clear();
        notified = false;
        persist();
    }

    function persist() {
        ctx.store!.set("countdown.target", countdown.target).catch(() => {});
        ctx.store!.set("countdown.name", countdown.name).catch(() => {});
    }

    function remaining(target: Date, now: Date) {
        const ms = target.getTime() - now.getTime();
        const done = ms <= 0;
        const a = Math.abs(ms);
        return {
            days: Math.floor(a / 86_400_000),
            hours: Math.floor((a % 86_400_000) / 3_600_000),
            minutes: Math.floor((a % 3_600_000) / 60_000),
            seconds: Math.floor((a % 60_000) / 1000),
            done,
        };
    }
</script>

<div class="countdown">
    {#if !target}
        <div class="edit">
            <label class="field">
                <span class="label">目标日期</span>
                <input type="date" bind:value={dateInput} />
            </label>
            <label class="field">
                <span class="label">名称（可选）</span>
                <input
                    type="text"
                    placeholder="如 春节 / 生日"
                    bind:value={nameInput}
                />
            </label>
            <button
                type="button"
                class="confirm"
                onclick={confirm}
                disabled={!dateInput}
            >
                <Check size={12} aria-hidden="true" />
                开始倒计时
            </button>
        </div>
    {:else if remain}
        <div class="live">
            <div class="name">{countdown.name || "倒计时"}</div>
            <div class="big">
                <span class="days">{remain.days}</span>
                <span class="unit">天</span>
                {#if !remain.done}
                    <span class="hms"
                        >{String(remain.hours).padStart(2, "0")}:{String(
                            remain.minutes,
                        ).padStart(2, "0")}:{String(remain.seconds).padStart(
                            2,
                            "0",
                        )}</span
                    >
                {/if}
            </div>
            <button
                type="button"
                class="reset"
                onclick={reset}
                aria-label="重置倒计时"
                title="重置倒计时"
            >
                <RotateCcw size={12} aria-hidden="true" />
            </button>
        </div>
    {/if}
</div>

<style>
    .countdown {
        flex: 1;
        min-width: 0;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .edit {
        display: flex;
        flex-direction: column;
        gap: 8px;
        width: 100%;
    }

    .field {
        display: flex;
        flex-direction: column;
        gap: 3px;
    }

    .label {
        font-size: 11px;
        color: var(--text-dim);
    }

    .edit input {
        pointer-events: auto;
        width: 100%;
        padding: 4px 8px;
        font-size: 12px;
        color-scheme: dark;
        color: var(--text);
        background: var(--bg-input);
        border: 1px solid transparent;
        border-radius: 6px;
        outline: none;
        transition:
            background 150ms ease,
            border-color 150ms ease;
    }

    .edit input::placeholder {
        color: var(--text-dim);
    }

    .edit input:focus {
        border-color: var(--accent);
        background: var(--bg-input-focus);
    }

    .confirm {
        pointer-events: auto;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 5px;
        padding: 5px 10px;
        font-size: 12px;
        border: none;
        border-radius: 6px;
        background: var(--accent);
        color: var(--on-accent);
        cursor: pointer;
        transition:
            background 150ms ease,
            opacity 150ms ease;
    }

    .confirm:hover {
        background: var(--accent-2);
    }

    .confirm:disabled {
        opacity: 0.5;
        cursor: default;
    }

    .live {
        position: relative;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
        width: 100%;
    }

    .name {
        font-size: 12px;
        color: var(--text-muted);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 100%;
        padding: 0 22px;
    }

    .big {
        display: flex;
        align-items: baseline;
        gap: 2px;
        font-variant-numeric: tabular-nums;
    }

    .days {
        font-size: 40px;
        font-weight: 600;
        line-height: 1;
        color: var(--text);
    }

    .unit {
        font-size: 14px;
        color: var(--text-muted);
        margin-left: 2px;
    }

    .hms {
        font-size: 16px;
        color: var(--text-soft);
        margin-left: 6px;
    }

    .reset {
        pointer-events: auto;
        position: absolute;
        right: 2px;
        top: 2px;
        width: 20px;
        height: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        border: none;
        border-radius: 5px;
        background: transparent;
        color: var(--text-muted);
        cursor: pointer;
        transition:
            color 150ms ease,
            background 150ms ease;
    }

    .reset:hover {
        color: var(--danger);
        background: var(--hover);
    }
</style>
