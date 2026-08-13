<script lang="ts">
    interface Props {
        fileName: string | null;
        idle: boolean;
        /** 当前激活的歌词行（可能为空）。 */
        lines: string[];
    }

    let { fileName, idle, lines }: Props = $props();
</script>

<div class="meta">
    <div class="name" class:idle>
        {idle ? "拖入音频以播放" : fileName}
    </div>

    {#if lines.length}
        <div class="lyric">
            {#each lines as line}
                <!-- 歌词已用 overflow-wrap 完整换行显示，无需 title 悬停提示；
                     原生 tooltip 会在悬停时弹出并盖住滚动中的歌词，故移除。 -->
                <div class="lyric-line">{line}</div>
            {/each}
        </div>
    {/if}
</div>

<style>
    /* 标题+歌词独占上方弹性区：过长时在此滚动/裁剪，进度条与控件不受影响地固定在底部 */
    .meta {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 2px;
    }

    .name {
        pointer-events: auto;
        font-size: 13px;
        line-height: 1.3;
        color: var(--text);
        /* 过长自动换行而非省略号 */
        overflow-wrap: anywhere;
        overflow: hidden;
        /* 关闭按钮悬浮在右上，给曲名右侧留出空间避免遮挡 */
        padding-right: 16px;
    }

    .name.idle {
        color: var(--text-muted);
    }

    .lyric {
        pointer-events: auto;
        display: flex;
        flex-direction: column;
        gap: 1px;
        /* 与曲名对齐，右侧同样给关闭按钮让位 */
        padding-right: 16px;
    }

    .lyric-line {
        font-size: 11px;
        line-height: 1.3;
        /* 当前正在唱的词句用主题强调色，随主题（accent）变色 */
        color: var(--accent);
        /* 过长自动换行而非省略号 */
        overflow-wrap: anywhere;
        overflow: hidden;
    }
</style>