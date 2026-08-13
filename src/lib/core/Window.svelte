<script lang="ts">
    import type { Snippet } from "svelte";
    import { cubicOut } from "svelte/easing";
    import { fade } from "svelte/transition";
    import { Pin, Settings, X } from "lucide-svelte";

    /** 窗口出现动效：轻微从 96% 放大 + 淡入，cubicOut 缓出。 */
    function windowIn(
        _node: Element,
        { duration = 220 }: { duration?: number } = {},
    ) {
        return {
            duration,
            easing: cubicOut,
            css: (t: number) =>
                `opacity: ${t}; transform: scale(${0.96 + 0.04 * t});`,
        };
    }

    let {
        title = "",
        draggable = true,
        dragOver = false,
        dropHint = "",
        pinned = false,
        onPin,
        onSettings,
        onClose,
        children,
    }: {
        /** 面板窗口标题（widget 卡片窗口不显示，此时 draggable 通常为 true） */
        title?: string;
        /**
         * widget 卡片模式：整窗可拖拽移动，内容层不拦截指针（交互控件自行恢复
         * pointer-events:auto）。面板模式传 false，内容正常交互、标题栏可拖拽。
         */
        draggable?: boolean;
        /** 文件拖拽悬停高亮（widget 卡片模式） */
        dragOver?: boolean;
        /** 拖拽悬停时显示的提示文案（由当前 widget 提供） */
        dropHint?: string;
        /** 钉住状态（面板模式顶部标题栏显示钉住按钮时） */
        pinned?: boolean;
        /** 钉住按钮动作（面板模式；缺省不显示钉住按钮） */
        onPin?: () => void;
        /** 设置按钮动作（面板模式；缺省不显示设置按钮） */
        onSettings?: () => void;
        /** 关闭按钮动作（widget 卡片为收进托盘，面板为关闭窗口） */
        onClose: () => void;
        children: Snippet;
    } = $props();
</script>

<div
    class="window"
    class:headed={!!title}
    class:noninteractive={draggable}
    class:drag-over={dragOver}
    transition:windowIn
>
    {#if draggable}
        <!-- 底层拖拽区：移动整窗。内容层 pointer-events:none，点击穿透到这里 -->
        <div class="drag-region" data-tauri-drag-region></div>
    {/if}

    {#if title}
        <header class="head" data-tauri-drag-region>
            <span class="title">{title}</span>
            <span class="actions">
                {#if onSettings}
                    <button
                        class="act"
                        onclick={onSettings}
                        aria-label="设置"
                        title="设置"
                    >
                        <Settings size={12} strokeWidth={2.2} aria-hidden="true" />
                    </button>
                {/if}
                {#if onPin}
                    <button
                        class="act"
                        class:active={pinned}
                        onclick={onPin}
                        aria-label={pinned ? "取消钉住" : "钉住"}
                        title={pinned ? "取消钉住" : "钉住"}
                    >
                        <Pin size={12} strokeWidth={2.2} aria-hidden="true" />
                    </button>
                {/if}
                <!-- 面板模式：关闭按钮收进标题栏动作区 -->
                <button class="act" onclick={onClose} aria-label="关闭" title="关闭">
                    <X size={12} strokeWidth={2.2} aria-hidden="true" />
                </button>
            </span>
        </header>
    {:else}
        <button class="close" onclick={onClose} aria-label="关闭" title="关闭">
            <X size={10} strokeWidth={2.4} aria-hidden="true" />
        </button>
    {/if}

    {#if dragOver}
        <div class="drop-overlay" transition:fade={{ duration: 120 }}>
            {dropHint || "松开"}
        </div>
    {/if}

    <div class="content">
        {@render children()}
    </div>
</div>

<style>
    .window {
        /* 铺满窗口：absolute + inset 0 确保在固定尺寸的设置窗口里严格等于视口，
           内容通过 flex + overflow 自适应而非把窗口撑高 */
        position: absolute;
        inset: 0;
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
        width: 100%;
        height: 100%;
        border-radius: 12px;
        background: var(--bg);
        overflow: hidden;
        box-shadow: inset 0 0 0 1px var(--border);
        transition:
            background 150ms ease,
            box-shadow 150ms ease;
    }

    .window.drag-over {
        background: var(--bg-2);
        box-shadow: inset 0 0 0 1.5px var(--accent);
    }

    /* 面板模式：四下留出平台内边距，标题与内容纵向排列 */
    .window.headed {
        padding: 12px;
        gap: 10px;
    }

    .drag-region {
        position: absolute;
        inset: 0;
        z-index: 0;
    }

    /* 标题栏：整行可拖拽移动窗口（面板模式唯一的拖拽把手，加高便于抓取） */
    .head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        flex: none;
        min-height: 30px;
        cursor: grab;
    }

    .head:active {
        cursor: grabbing;
    }

    .head .title {
        font-size: 13px;
        font-weight: 600;
        color: var(--text);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .head .actions {
        display: flex;
        align-items: center;
        gap: 2px;
        flex: none;
    }

    .head .act {
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

    .head .act:hover {
        color: var(--text);
        background: var(--hover-strong);
    }

    .head .act:active {
        transform: scale(0.85);
    }

    .head .act.active {
        color: var(--accent);
    }

    .content {
        /* 定位层：widget 内容由 WidgetHost 的 .widget-view（绝对定位叠层）承载 */
        position: relative;
        flex: 1;
        min-height: 0;
        z-index: 1;
    }

    /* 面板模式：内容可滚动 */
    .window.headed .content {
        overflow-y: auto;
    }

    /* 整窗拖拽模式：内容层不拦截指针（让背景可拖动），交互控件各自恢复 pointer-events */
    .window.noninteractive .content {
        pointer-events: none;
    }

    .drop-overlay {
        position: absolute;
        inset: 0;
        z-index: 2;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--accent-soft-2);
        color: var(--accent);
        font-size: 13px;
        font-weight: 600;
        letter-spacing: 0.05em;
        pointer-events: none;
    }

    .close {
        position: absolute;
        top: 6px;
        right: 6px;
        z-index: 3;
        width: 18px;
        height: 18px;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        border: none;
        border-radius: 5px;
        background: transparent;
        color: var(--text-muted);
        cursor: pointer;
        opacity: 0;
        transition:
            opacity 150ms ease,
            color 150ms ease,
            background 150ms ease;
    }

    .window:hover .close {
        opacity: 1;
    }

    .close:hover {
        color: var(--text);
        background: var(--hover-strong);
    }

    .close:active {
        transform: scale(0.85);
    }
</style>
