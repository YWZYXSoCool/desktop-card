<script lang="ts">
    interface Props {
        time: string;
        date: string;
        fontSize: number;
        color: string;
    }

    let { time, date, fontSize, color }: Props = $props();
</script>

<div
    class="time"
    style:font-size={`${fontSize}px`}
    style:color={color}
>
    {time}
</div>
<div class="date">{date}</div>

<style>
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
</style>