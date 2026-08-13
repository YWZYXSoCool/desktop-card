<script lang="ts">
    import { BookOpen } from "lucide-svelte";

    interface Props {
        /** 当前渠道标签（"AI" 或 "API"，容器算好下传）。 */
        channel: string;
    }

    let { channel }: Props = $props();
</script>

<div class="topbar">
    <span class="book"><BookOpen size={13} aria-hidden="true" /></span>
    <span class="title">英英词典</span>
    <div class="spacer"></div>
    <span class="source">{channel}</span>
</div>

<style>
    .topbar {
        display: flex;
        align-items: center;
        gap: 6px;
    }

    .book {
        color: var(--accent);
        display: flex;
    }

    .title {
        font-size: 12px;
        font-weight: 600;
        color: var(--text);
    }

    .spacer {
        flex: 1;
    }

    .source {
        font-size: 10px;
        color: var(--text-muted);
        background: var(--bg-input-focus);
        border-radius: 8px;
        padding: 1px 6px;
    }
</style>