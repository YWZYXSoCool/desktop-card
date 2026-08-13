<script lang="ts">
    let {
        current,
        duration,
        onseek,
    }: {
        current: number;
        /** 0 = 时长未知，进度条不可拖 */
        duration: number;
        onseek: (time: number) => void;
    } = $props();

    let track: HTMLDivElement | undefined = $state();
    let dragging = $state(false);

    const disabled = $derived(duration <= 0);
    const ratio = $derived(
        disabled ? 0 : Math.min(Math.max(current / duration, 0), 1),
    );

    function ratioFromEvent(e: PointerEvent): number {
        if (!track) return 0;
        const rect = track.getBoundingClientRect();
        if (rect.width <= 0) return 0;
        return Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
    }

    function onPointerDown(e: PointerEvent) {
        if (disabled) return;
        e.preventDefault();
        dragging = true;
        track?.setPointerCapture(e.pointerId);
        onseek(ratioFromEvent(e) * duration);
    }

    function onPointerMove(e: PointerEvent) {
        if (dragging && !disabled) onseek(ratioFromEvent(e) * duration);
    }

    function onPointerUp() {
        dragging = false;
    }
</script>

<div class="progress" class:disabled class:dragging>
    <div
        class="track"
        bind:this={track}
        role="slider"
        aria-label="进度"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(current)}
        aria-disabled={disabled}
        tabindex={disabled ? -1 : 0}
        onpointerdown={onPointerDown}
        onpointermove={onPointerMove}
        onpointerup={onPointerUp}
        onpointercancel={onPointerUp}
    >
        <div class="fill" style="width: {ratio * 100}%"></div>
        <div class="thumb" style="left: {ratio * 100}%"></div>
    </div>
</div>

<style>
    .progress {
        pointer-events: auto;
        width: 100%;
    }

    .track {
        position: relative;
        height: 12px;
        display: flex;
        align-items: center;
        cursor: pointer;
        touch-action: none;
    }

    .track::before {
        content: "";
        position: absolute;
        left: 0;
        right: 0;
        height: 3px;
        border-radius: 1.5px;
        background: var(--hover-2);
    }

    .fill {
        position: absolute;
        left: 0;
        height: 3px;
        border-radius: 1.5px;
        background: var(--accent);
    }

    .thumb {
        position: absolute;
        width: 8px;
        height: 8px;
        margin-left: -4px;
        border-radius: 50%;
        background: var(--on-accent);
        opacity: 0;
        transition: opacity 150ms ease;
    }

    .progress:hover .thumb,
    .progress.dragging .thumb {
        opacity: 1;
    }

    .disabled .track {
        cursor: default;
    }

    .disabled .fill {
        width: 0 !important;
    }
</style>
