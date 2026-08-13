<script lang="ts">
    import { toast } from "svelte-sonner";
    import type { WidgetContext } from "$lib/widgets/api/types";
    import CountdownEdit from "./CountdownEdit.svelte";
    import CountdownLive from "./CountdownLive.svelte";
    import { countdown, remaining } from "./countdown.svelte";

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
</script>

<div class="countdown">
    {#if !target}
        <CountdownEdit
            date={dateInput}
            name={nameInput}
            canConfirm={!!dateInput}
            ondate={(v) => (dateInput = v)}
            onname={(v) => (nameInput = v)}
            onconfirm={confirm}
        />
    {:else if remain}
        <CountdownLive
            name={countdown.name}
            {remain}
            onreset={reset}
        />
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
</style>