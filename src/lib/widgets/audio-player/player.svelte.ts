import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { Howl } from "howler";
import Lyric from "lrc-file-parser";
import { basename, extname } from "pathe";
import type { WidgetStore, WidgetToast } from "$lib/widgets/api/types";

export type PlayerState = "idle" | "playing" | "paused";

/** 一个时间点的歌词组：允许同一时刻同时有多句（如中英双语）。 */
export interface LyricGroup {
    start: number;
    lines: string[];
}

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
    /** 上次播放的文件路径（持久化，重启后恢复，不自动播放） */
    lastFile = $state("");
    currentTime = $state(0);
    /** 0 = 时长未知（进度条不可拖） */
    duration = $state(0);
    volume = $state(DEFAULT_VOLUME);
    muted = $state(false);
    /** 循环播放：自然播完从头重播；关闭则播完停在末尾（paused） */
    loop = $state(false);
    /** 歌词（按时间升序的时间点+行组）；无歌词文件为空数组 */
    lyrics = $state<LyricGroup[]>([]);

    /** 展示用曲名：由 filePath 派生（去掉扩展名），无需单独维护状态。 */
    get fileName(): string {
        const b = basename(this.filePath);
        const e = extname(b);
        return e ? b.slice(0, -e.length) : b;
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

    /**
     * 加载文件：替换当前并从头播放。
     * @param autoplay 是否立即播放；false 用于启动时恢复上次文件（加载但不出声）。
     */
    load(path: string, autoplay = true): void {
        const gen = ++this.generation;
        this.disposeHowl();
        this.stopTicker();

        this.filePath = path;
        this.resetPlayback();
        this.lastFile = path;
        this.persistLastFile(path);
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
                if (this.loop) {
                    // 循环播放：回到开头继续播（onplay 会重新拉起 ticker）
                    howl.seek(0);
                    this.currentTime = 0;
                    howl.play();
                    return;
                }
                // 播完暂停 → paused 态停在末尾
                this.currentTime = this.duration || this.readSeek();
                this.state = "paused";
                this.stopTicker();
            },
            onloaderror: () => this.onLoadError(gen),
            onplayerror: () => this.onLoadError(gen),
        });

        this.howl = howl;
        if (autoplay) {
            howl.play();
        } else {
            // 恢复上次文件：已加载、待播放（onload 会更新时长，onloaderror 会走 fail）
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

    /** 循环播放开关：只影响自然播完时的行为（重播 vs 暂停）。 */
    setLoop(loop: boolean): void {
        this.loop = loop;
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

    /** widget 启动时恢复持久化的音量 / 静音 / 循环。 */
    applyStored(volume: number, muted: boolean, loop: boolean): void {
        this.setVolume(volume);
        this.setMuted(muted);
        this.loop = loop;
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

    /** 记住播放的文件路径（fire-and-forget 持久化）。 */
    private persistLastFile(path: string): void {
        this.store?.set("player.lastFile", path).catch(() => {});
    }

    /** 出错 → toast + 回到空闲态。 */
    private fail(message: string): void {
        this.toast?.error(message);
        this.disposeHowl();
        this.stopTicker();
        this.state = "idle";
        this.filePath = "";
        this.resetPlayback();
        // 文件已不可用：清掉恢复记录，避免每次启动都尝试打开坏文件
        this.lastFile = "";
        this.persistLastFile("");
    }
}

export const player = new PlayerStore();
