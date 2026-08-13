import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { Howl } from "howler";
import Lyric from "lrc-file-parser";
import { basename, extname } from "pathe";
import type { WidgetStore, WidgetToast } from "$lib/widgets/api/types";

export type PlayerState = "idle" | "playing" | "paused";

/** 循环模式：列表循环 / 单曲循环 / 关闭（播完停在末尾）。 */
export type LoopMode = "all" | "one" | "off";

/** 一个时间点的歌词组：允许同一时刻同时有多句（如中英双语）。 */
export interface LyricGroup {
    start: number;
    lines: string[];
}

/** 倍速候选（循环切换用）。 */
export const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const;

/**
 * 用 lrc-file-parser 解析 LRC：meta 标签进 tags（丢弃），有时间的行按毫秒升序返回，
 * 同一时间戳的多句由库合并为一行（text 为主句 + extendedLyrics 收纳翻译/双语副句）。
 * 这里转成本身的组结构（start 用秒，lines 为主句+副句），无时间标签或格式异常的行由库丢弃。
 */
export function parseLyrics(raw: string): LyricGroup[] {
    const parsed = new Lyric({ lyric: raw, isRemoveBlankLine: true });
    return parsed.lines.map((l) => ({
        start: l.time / 1000,
        lines: [l.text, ...l.extendedLyrics],
    }));
}

/** widget 支持的扩展名（依赖 WebView2 内置解码） */
const SUPPORTED_EXT = new Set([
    "mp3",
    "wav",
    "ogg",
    "oga",
    "m4a",
    "aac",
    "flac",
]);

export function extensionOf(path: string): string {
    // pathe 会先把 Windows 反斜杠归一化为正斜杠，再取扩展名（含点）
    return extname(path).slice(1).toLowerCase();
}

export function isSupportedAudio(path: string): boolean {
    return SUPPORTED_EXT.has(extensionOf(path));
}

/** 展示用曲名：去掉所在路径与扩展名（列表与当前曲显示共用）。 */
export function displayName(path: string): string {
    const b = basename(path);
    const e = extname(b);
    return e ? b.slice(0, -e.length) : b;
}

export function formatTime(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
    const total = Math.floor(seconds);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
}

/** 默认音量（0..1），供持久化缺省与初始状态共用同一来源。 */
export const DEFAULT_VOLUME = 0.8;

class PlayerStore {
    state = $state<PlayerState>("idle");
    /** 用于 hover 显示全名 */
    filePath = $state("");
    /** 专辑封面 data URL；无封面为空串（UI 回落到占位图标） */
    coverUrl = $state("");
    /** 播放列表（文件绝对路径，持久化，重启后恢复） */
    playlist = $state<string[]>([]);
    /** 当前曲目在列表中的下标；无播放为 -1 */
    currentIndex = $state(-1);
    currentTime = $state(0);
    /** 0 = 时长未知（进度条不可拖） */
    duration = $state(0);
    volume = $state(DEFAULT_VOLUME);
    muted = $state(false);
    /** 循环模式（持久化） */
    loopMode = $state<LoopMode>("all");
    /** 随机播放（持久化）：开启后按洗牌序切歌，不重复直到一轮播完 */
    shuffle = $state(false);
    /** 播放倍速（持久化） */
    playbackRate = $state(1);
    /** 歌词（按时间升序的时间点+行组）；无歌词文件为空数组 */
    lyrics = $state<LyricGroup[]>([]);

    /** 展示用曲名：由 filePath 派生（去掉扩展名），无需单独维护状态。 */
    get fileName(): string {
        return displayName(this.filePath);
    }

    /** 当前正在唱的时间点的全部歌词行（双语时多句）；无歌词为空数组（UI 隐藏）。 */
    get activeLyrics(): string[] {
        return this.activeLyricIndex >= 0
            ? this.lyrics[this.activeLyricIndex]?.lines ?? []
            : [];
    }

    private howl: Howl | null = null;
    /**
     * 当前正在唱的时间点下标。必须用 $state：模板依赖它渲染歌词行，
     * 普通字段的写入不会触发 Svelte 重新渲染，导致歌词一直不显示。
     */
    private activeLyricIndex = $state(-1);
    /** 持久化句柄（setup 时经 ctx.store 注入，避免直连宿主 store） */
    private store: WidgetStore | null = null;
    /** 通知句柄（setup 时经 ctx.toast 注入，走权限作用域，不直连宿主 toast） */
    private toast?: WidgetToast;
    /** 每次 load 自增：丢弃旧 howl 的迟到事件（切换文件的竞态保护） */
    private generation = 0;
    /** 播放中轮询进度的 rAF 句柄 */
    private rafId = 0;
    /** 随机序（playlist 下标的排列）；shuffle 开启时决定 next/prev 走向 */
    private shuffleOrder: number[] = [];
    /** 当前曲在 shuffleOrder 里的位置 */
    private shufflePos = 0;

    /**
     * 添加文件到列表并视情况播放：
     * - 过滤掉不支持的扩展名
     * - 列表为空（或当前无播放）→ 播第一首新增
     * - 正在播放 → 仅追加，不打断
     * @param paths 拖入 / 选择的文件路径
     */
    addFiles(paths: string[], autoplay = true): void {
        const accepted = paths.filter(isSupportedAudio);
        if (accepted.length === 0) return;
        const wasIdle = this.state === "idle";
        this.playlist.push(...accepted);
        this.persistPlaylist();
        if (autoplay && wasIdle) {
            this.playIndex(this.playlist.length - accepted.length);
        }
    }

    /** 播放指定下标的曲目；越界忽略。 */
    playIndex(i: number): void {
        if (i < 0 || i >= this.playlist.length) return;
        // 切到随机序里对应位置，保证后续 next/prev 连续
        if (this.shuffle) {
            const pos = this.shuffleOrder.indexOf(i);
            if (pos >= 0) this.shufflePos = pos;
        }
        this.currentIndex = i;
        this.persistPlaylist();
        this.load(this.playlist[i]);
    }

    /** 下一首。shuffle 走洗牌序；顺序模式到末尾时按循环模式决定是否回卷。 */
    next(): void {
        const n = this.playlist.length;
        if (n === 0) return;
        const target = this.peekNext();
        if (target === null) {
            // 顺序模式播到末尾且关闭循环 → 停在末尾
            this.currentTime = this.duration || this.readSeek();
            this.state = "paused";
            this.stopTicker();
            return;
        }
        this.playIndex(target);
    }

    /**
     * 上一首。当前已播过 3 秒 → 回到本曲开头；否则按序/洗牌序后退。
     * 顺序模式在列表开头时，循环模式为列表循环则回卷到末曲，否则仍回本曲开头。
     */
    prev(): void {
        const n = this.playlist.length;
        if (n === 0) return;
        if (this.currentTime > 3) {
            this.seek(0);
            return;
        }
        if (this.shuffle) {
            if (this.shufflePos > 0) {
                this.playIndex(this.shuffleOrder[this.shufflePos - 1]);
            } else {
                this.playIndex(this.shuffleOrder[0]);
            }
            return;
        }
        const prev = this.currentIndex - 1;
        if (prev >= 0) {
            this.playIndex(prev);
        } else if (this.loopMode === "all") {
            this.playIndex(n - 1);
        } else {
            this.seek(0);
        }
    }

    /** 移除列表中的曲目；若移除的是当前曲，自动续播下一首（无则回到空闲）。 */
    removeAt(i: number): void {
        if (i < 0 || i >= this.playlist.length) return;
        const wasCurrent = i === this.currentIndex;
        const wasBefore = i < this.currentIndex;
        this.playlist.splice(i, 1);
        if (this.playlist.length === 0) {
            this.stop();
            this.currentIndex = -1;
        } else if (wasCurrent) {
            // 数组已前移：原位置即下一首；越界则回卷末曲
            const nextIdx = Math.min(i, this.playlist.length - 1);
            this.currentIndex = nextIdx;
            // 洗牌序里旧下标已失效，重排后再续播
            if (this.shuffle) this.rebuildShuffleDeck();
            this.load(this.playlist[nextIdx]);
        } else {
            if (wasBefore) this.currentIndex--;
            // 移除会错位洗牌序下标，重排（当前曲定位到开头）
            if (this.shuffle) this.rebuildShuffleDeck();
        }
        this.persistPlaylist();
    }

    /** 清空列表并停止播放，回到空闲态。 */
    clear(): void {
        this.stop();
        this.playlist = [];
        this.currentIndex = -1;
        this.shuffleOrder = [];
        this.shufflePos = 0;
        this.persistPlaylist();
    }

    setShuffle(on: boolean): void {
        this.shuffle = on;
        if (on) {
            this.rebuildShuffleDeck();
        } else {
            this.shuffleOrder = [];
            this.shufflePos = 0;
        }
    }

    setLoopMode(mode: LoopMode): void {
        this.loopMode = mode;
    }

    /** 循环切换倍速（SPEED_OPTIONS 里取下一个）。 */
    cycleSpeed(): void {
        const idx = SPEED_OPTIONS.indexOf(this.playbackRate as (typeof SPEED_OPTIONS)[number]);
        const next = SPEED_OPTIONS[(idx + 1) % SPEED_OPTIONS.length];
        this.setPlaybackRate(next);
    }

    setPlaybackRate(rate: number): void {
        this.playbackRate = rate;
        this.howl?.rate(rate);
    }

    /** 加载文件：替换当前并从头播放。
     *  @param autoplay 是否立即播放；false 用于启动时恢复上次曲目（加载但不出声）。 */
    load(path: string, autoplay = true): void {
        const gen = ++this.generation;
        this.disposeHowl();
        this.stopTicker();

        this.filePath = path;
        this.resetPlayback();
        this.fetchCover(path);
        this.fetchLyrics(path);

        let url: string;
        try {
            url = convertFileSrc(path);
        } catch {
            this.fail("无法播放该文件");
            return;
        }

        const howl = new Howl({
            src: [url],
            // html5 模式底层仍是 <audio>：沿用 WebView2 内置解码，并规避
            // asset 协议在 Web Audio（fetch+decode）下的 CORS 问题
            html5: true,
            format: [extensionOf(path)],
            volume: this.volume,
            mute: this.muted,
            rate: this.playbackRate,
            onload: () => {
                if (gen !== this.generation) return;
                const d = howl.duration();
                this.duration = Number.isFinite(d) && d > 0 ? d : 0;
            },
            onplay: () => {
                if (gen !== this.generation) return;
                this.state = "playing";
                this.startTicker();
            },
            onpause: () => {
                if (gen !== this.generation) return;
                this.state = "paused";
                this.stopTicker();
            },
            onend: () => {
                if (gen !== this.generation) return;
                if (this.loopMode === "one") {
                    // 单曲循环：回到开头继续播（onplay 会重新拉起 ticker）
                    howl.seek(0);
                    this.currentTime = 0;
                    howl.play();
                    return;
                }
                // 列表循环 / 关闭：交给 next 决定是续播下一首还是停在末尾
                this.next();
            },
            onloaderror: () => this.onLoadError(gen),
            onplayerror: () => this.onLoadError(gen),
        });

        this.howl = howl;
        if (autoplay) {
            howl.play();
        } else {
            // 恢复上次曲目：已加载、待播放（onload 会更新时长，onloaderror 会走 fail）
            this.state = "paused";
        }
    }

    /** 播放 / 暂停切换。idle 态无动作；停在末尾再按播放则从头重播。 */
    toggle(): void {
        if (!this.howl) return;
        if (this.state === "playing") {
            this.howl.pause();
        } else if (this.state === "paused") {
            if (this.duration > 0 && this.currentTime >= this.duration) {
                this.howl.seek(0);
                this.currentTime = 0;
            }
            this.howl.play();
        }
    }

    /**
     * 进度定位（时长未知时调用方应禁用）。
     * 进度条拖动时逐帧调用：立即同步 `currentTime` 并刷新歌词，避免
     * 暂停时 ticker 停止、播放时 ticker 滞后造成的歌词与进度不同步。
     */
    seek(time: number): void {
        if (!this.howl || this.state === "idle" || this.duration <= 0) return;
        const t = Math.min(Math.max(time, 0), this.duration);
        this.howl.seek(t);
        this.currentTime = t;
        this.updateActiveLyric();
    }

    setVolume(level: number): void {
        this.volume = Math.min(Math.max(level, 0), 1);
        this.howl?.volume(this.volume);
    }

    setMuted(muted: boolean): void {
        this.muted = muted;
        this.howl?.mute(muted);
    }

    /** 绑定持久化句柄（setup 时经 ctx.store 注入）。 */
    bindStore(store: WidgetStore): void {
        this.store = store;
    }

    /** 绑定通知句柄（setup 时经 ctx.toast 注入）。 */
    bindToast(t: WidgetToast): void {
        this.toast = t;
    }

    /** 清空播放内容相关状态（加载新文件 / 出错时共用）。不触碰 howl 与 ticker。 */
    private resetPlayback(): void {
        this.currentTime = 0;
        this.duration = 0;
        this.coverUrl = "";
        this.lyrics = [];
        this.activeLyricIndex = -1;
    }

    /** widget 启动时恢复持久化的音量 / 静音 / 循环模式 / 随机 / 倍速。 */
    applyStored(
        volume: number,
        muted: boolean,
        loopMode: LoopMode,
        shuffle: boolean,
        playbackRate: number,
    ): void {
        this.setVolume(volume);
        this.setMuted(muted);
        this.loopMode = loopMode;
        this.shuffle = shuffle;
        this.setPlaybackRate(playbackRate);
        if (shuffle && this.playlist.length > 0) this.rebuildShuffleDeck();
    }

    /** 启动时恢复播放列表与当前下标（校验越界），并加载当前曲目。
     *  @param autoplay 是否立即播放（默认 false，恢复后待用户按播放）。 */
    restore(list: string[], index: number, autoplay = false): void {
        this.playlist = list.filter(isSupportedAudio);
        if (this.playlist.length === 0) {
            this.currentIndex = -1;
            return;
        }
        this.currentIndex =
            index >= 0 && index < this.playlist.length ? index : 0;
        if (this.shuffle) this.rebuildShuffleDeck();
        this.load(this.playlist[this.currentIndex], autoplay);
    }

    /** 停止播放并回到空闲态（不触碰列表）。 */
    private stop(): void {
        this.disposeHowl();
        this.stopTicker();
        this.state = "idle";
        this.filePath = "";
        this.resetPlayback();
    }

    /** 顺序模式下「下一首」的目标下标；到末尾且不循环返回 null。 */
    private peekNext(): number | null {
        const n = this.playlist.length;
        if (n === 0) return null;
        if (this.shuffle) {
            // 洗牌序前进
            if (this.shufflePos + 1 < this.shuffleOrder.length) {
                return this.shuffleOrder[this.shufflePos + 1];
            }
            // 一轮播完：列表循环则重洗续播，否则停
            if (this.loopMode === "all") {
                this.rebuildShuffleDeck();
                return this.shuffleOrder[0];
            }
            return null;
        }
        const next = this.currentIndex + 1;
        if (next < n) return next;
        return this.loopMode === "all" ? 0 : null;
    }

    /** 重建洗牌序：playlist 下标的随机排列，并把当前曲定位到开头。 */
    private rebuildShuffleDeck(): void {
        const n = this.playlist.length;
        const arr = Array.from({ length: n }, (_, i) => i);
        for (let i = n - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        this.shuffleOrder = arr;
        this.shufflePos = Math.max(
            this.currentIndex >= 0 ? arr.indexOf(this.currentIndex) : 0,
            0,
        );
    }

    private readSeek(): number {
        const s = this.howl?.seek();
        return typeof s === "number" && Number.isFinite(s) ? s : 0;
    }

    /** Howler 不主动推 timeupdate：播放中用 rAF 轮询 seek() 刷新进度。 */
    private startTicker(): void {
        this.stopTicker();
        const tick = () => {
            if (this.howl && this.state === "playing") {
                this.currentTime = this.readSeek();
                this.updateActiveLyric();
                this.rafId = requestAnimationFrame(tick);
            }
        };
        this.rafId = requestAnimationFrame(tick);
    }

    private stopTicker(): void {
        if (this.rafId) cancelAnimationFrame(this.rafId);
        this.rafId = 0;
    }

    private disposeHowl(): void {
        if (this.howl) {
            // unload = 停止 + 解绑事件 + 释放资源
            this.howl.unload();
            this.howl = null;
        }
    }

    /** 异步读取嵌入专辑封面。失败/无封面静默回落（不打断播放）。 */
    private async fetchCover(path: string): Promise<void> {
        try {
            const art = await invoke<{ mime: string; data: string } | null>(
                "get_album_art",
                { path },
            );
            if (art) {
                this.coverUrl = `data:${art.mime};base64,${art.data}`;
            }
        } catch {
            // meta 解析失败不影响播放，保持占位图标
        }
    }

    /** 按当前进度定位歌词组：推进则更新 activeLyrics，回头（seek）则回退查找。 */
    private updateActiveLyric(): void {
        const groups = this.lyrics;
        if (groups.length === 0) return;
        const t = this.currentTime;
        const n = groups.length;
        // 常见情形是顺序推进：从当前组往后找第一个 start > t
        let i = this.activeLyricIndex < 0 ? 0 : this.activeLyricIndex;
        while (i < n && groups[i].start <= t) i++;
        let idx = i - 1;
        // seek 回退：从 0 起线性扫，保证落到正确组
        if (idx < 0 || (idx > 0 && groups[idx].start > t)) {
            idx = 0;
            while (idx < n && groups[idx].start <= t) idx++;
            idx--;
        }
        if (idx !== this.activeLyricIndex) {
            this.activeLyricIndex = idx; // $state 写入 → 触发模板重渲染
        }
    }

    /** 加载错误 / 播放错误共用：丢弃迟到的旧 howl 事件，回到空闲态。 */
    private onLoadError(gen: number): void {
        if (gen !== this.generation) return;
        this.fail("无法播放该文件");
    }

    /** 异步读取同名 .lrc 歌词。无文件 / 解析失败静默回落（不打断播放）。 */
    private async fetchLyrics(path: string): Promise<void> {
        try {
            const raw = await invoke<string | null>("read_lyrics", { path });
            if (raw) {
                this.lyrics = parseLyrics(raw);
            }
        } catch {
            // 读歌词失败不影响播放，保持无歌词状态
        }
    }

    /** 持久化播放列表与当前下标（fire-and-forget）。 */
    private persistPlaylist(): void {
        this.store?.set("player.playlist", this.playlist).catch(() => {});
        this.store?.set("player.currentIndex", this.currentIndex).catch(() => {});
    }

    /** 出错 → toast + 回到空闲态。 */
    private fail(message: string): void {
        this.toast?.error(message);
        this.stop();
    }
}

export const player = new PlayerStore();