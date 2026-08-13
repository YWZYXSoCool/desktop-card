/// <reference path="./types.d.ts" />

// B站下载器（外部沙箱 widget）。
//
// 全部 B 站业务都在这里：解析链接、请求 view/playurl API、选流、拼文件名、编排批量。
// 后端只提供通用原语（ctx.download 的裸 HTTP / URL→文件 / 文本→文件 / 目录 / 状态 / 取消），
// 不关心 B 站任何细节。下载进度由宿主发 `widget-progress` 事件 → 沙箱自动重渲染。

const TYPES = [
    { label: "视频音频", value: "videoaudio" },
    { label: "视频", value: "video" },
    { label: "音频", value: "audio" },
    { label: "封面", value: "cover" },
    { label: "弹幕", value: "barrage" },
];

const UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";
const REFERER = "https://www.bilibili.com";
const API_HEADERS = { "User-Agent": UA, Referer: REFERER };
const TYPE_LABEL = Object.fromEntries(TYPES.map((t) => [t.value, t.label]));

// ffmpeg 不在仓库里捆绑二进制（GitHub 单文件 100MB 限制），首次 DASH 高清合并时
// 自动下载一份到下载目录。用 eugeneware/ffmpeg-static 的 win64 静态单文件构建。
const FFMPEG_URL =
    "https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1/ffmpeg-win32-x64";
const FFMPEG_FILENAME = "ffmpeg.exe";

const state = {
    items: [], // { key, url, type, title, pic, cid, bvid, resolved }
    inputUrl: "",
    inputType: "videoaudio",
    jobs: {}, // jobId -> { label }
    merges: [], // DASH 合并计划：{ label, videoJob, audioJob, videoFile, audioFile, outFile, ffmpeg, execJob, merged, cleaned, notified }
    ffmpegSetting: "",
    ffmpegJob: null, // 运行时 ffmpeg 下载任务 id（null=未发起/已就绪）
    keySeq: 1,
};

function san(name) {
    return (name || "")
        .replace(/[\/\\:*?"<>|]/g, "")
        .trim()
        .replace(/[. ]+$/, "") || "视频";
}

function httpGet(ctx, url) {
    const r = ctx.download.http("GET", url, API_HEADERS, "");
    if (!r.ok || r.status !== 200) {
        throw new Error("请求失败 HTTP " + (r.status || "") + (r.error ? " " + r.error : ""));
    }
    try {
        return JSON.parse(r.body);
    } catch (e) {
        throw new Error("响应解析失败");
    }
}

// ─────────────────────────────────────────────────────────────────────────
// WBI 签名（https://api.bilibili.com/x/player/wbi/playurl 已强制 WBI 鉴权）。
// 算法见 misc/sign/wbi：img_key+sub_key 打乱 → mixin_key，参数按 key 升序、
// 过滤 !'()*、encodeURIComponent（大写 %XX、空格 %20），追加 wts 后算 MD5。
// MD5 由宿主 `ctx.crypto.md5` 提供（沙箱无 crypto 全局）。
// ─────────────────────────────────────────────────────────────────────────

const MIXIN_KEY_ENC_TAB = [
    46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49,
    33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40,
    61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11,
    36, 20, 34, 44, 52,
];

const wbiKeys = { imgKey: "", subKey: "", ts: 0 };

// 从 nav 接口拿实时口令（img_key/sub_key 伪装成 png url，取文件名即可）。
// 口令每日更替，缓存一天，过期或失败时重新拉取。
function fetchWbiKeys(ctx) {
    if (wbiKeys.imgKey && Date.now() - wbiKeys.ts < 86400000) return wbiKeys;
    const j = httpGet(ctx, "https://api.bilibili.com/x/web-interface/nav");
    const wbi = j && j.data && j.data.wbi_img;
    if (!wbi) throw new Error("获取 WBI 密钥失败");
    wbiKeys.imgKey = wbi.img_url.slice(
        wbi.img_url.lastIndexOf("/") + 1,
        wbi.img_url.lastIndexOf("."),
    );
    wbiKeys.subKey = wbi.sub_url.slice(
        wbi.sub_url.lastIndexOf("/") + 1,
        wbi.sub_url.lastIndexOf("."),
    );
    wbiKeys.ts = Date.now();
    return wbiKeys;
}

function getMixinKey(orig) {
    return MIXIN_KEY_ENC_TAB.map((n) => orig[n]).join("").slice(0, 32);
}

// 给参数加 w_rid/wts，返回可直接拼到 URL 的 query 串。
function signWbi(ctx, params) {
    const keys = fetchWbiKeys(ctx);
    const mixinKey = getMixinKey(keys.imgKey + keys.subKey);
    const wts = Math.round(Date.now() / 1000);
    params.wts = wts;
    const chrFilter = /[!'()*]/g;
    const query = Object.keys(params)
        .sort()
        .map((k) => {
            const v = String(params[k]).replace(chrFilter, "");
            return encodeURIComponent(k) + "=" + encodeURIComponent(v);
        })
        .join("&");
    return query + "&w_rid=" + ctx.crypto.md5(query + mixinKey);
}

// 带 WBI 签名的播放流请求。
function playUrl(ctx, item, fnval, qn) {
    const query = signWbi(ctx, {
        bvid: item.bvid,
        cid: item.cid,
        qn: qn,
        fnval: fnval,
        fourk: 1,
    });
    return httpGet(ctx, "https://api.bilibili.com/x/player/wbi/playurl?" + query);
}

function extractKeys(url) {
    const b = /BV[0-9A-Za-z]{10,}/.exec(url);
    if (b) return { bvid: b[0] };
    const a = /av(\d+)/i.exec(url);
    if (a) return { aid: a[1] };
    return null;
}

function resolveItem(ctx, item) {
    const keys = extractKeys(item.url);
    if (!keys) throw new Error("无法识别的链接");
    const q = keys.bvid ? "bvid=" + keys.bvid : "aid=" + keys.aid;
    const j = httpGet(ctx, "https://api.bilibili.com/x/web-interface/view?" + q);
    const d = j && j.data;
    if (!d) throw new Error("视频不存在或无权访问");
    const page = (d.pages && d.pages[0]) || {};
    item.bvid = d.bvid || keys.bvid;
    item.aid = d.aid;
    item.cid = page.cid;
    item.title = d.title || page.part || "未命名";
    item.pic = d.pic;
    item.resolved = true;
    ctx.store.set("bilibili.items", state.items);
}

// DASH 流：视频/音频各挑最高码率。fnval=16 取 DASH（一次拿到全部清晰度）。
function playDash(ctx, item) {
    const j = playUrl(ctx, item, 16, 80);
    const dash = j.data && j.data.dash;
    if (!dash) throw new Error("无法获取播放流");
    return dash;
}

function pickHighest(list) {
    if (!list || !list.length) throw new Error("无可用流");
    let best = list[0];
    for (const s of list) if ((s.bandwidth || 0) > (best.bandwidth || 0)) best = s;
    return best.baseUrl || best.base_url;
}

// MP4 单文件（本身含音轨）。fnval=1 取 MP4（platform=pc，referer 鉴权）。
function playMp4(ctx, item) {
    const j = playUrl(ctx, item, 1, 80);
    const durl = j.data && j.data.durl;
    if (!durl || !durl.length) throw new Error("该画质需合并，暂不支持");
    return durl[0].url;
}

// ── ffmpeg 探测 ──────────────────────────────────────────────────────────
// widget 自备 ffmpeg（平台不注入）。解析顺序：设置里显式指定 → 随附目录
// base()/ffmpeg/ffmpeg(.exe) → 运行时下载到下载目录的 ffmpeg.exe。都找不到
// 返回 null，调用方据此退回 MP4 单文件（不在 PATH 上猜，避免白下载两条流后
// merge 失败）。想用 PATH 里的 ffmpeg 就在设置里指一下。
function findFfmpeg(ctx) {
    const exe = ctx.execute && ctx.execute.exists;
    if (!exe) return null;
    const cands = [];
    if (state.ffmpegSetting) {
        cands.push(state.ffmpegSetting + "/ffmpeg.exe", state.ffmpegSetting + "/ffmpeg");
    }
    try {
        const base = ctx.execute.base();
        cands.push(base + "/ffmpeg/ffmpeg.exe", base + "/ffmpeg/ffmpeg");
    } catch (_) {}
    try {
        cands.push(ctx.download.dir() + "/ffmpeg.exe");
    } catch (_) {}
    for (const c of cands) if (exe(c)) return c;
    return null;
}

// 首次高清合并需要 ffmpeg 时自动下载到下载目录（幂等：已就绪或已在下载则跳过）。
// 返回发起的 job id，未发起返回 null。下载完成后 findFfmpeg 命中下载目录。
function ensureFfmpeg(ctx) {
    if (findFfmpeg(ctx)) return null;
    if (state.ffmpegJob) return null;
    const id = ctx.download.download(FFMPEG_URL, {}, FFMPEG_FILENAME);
    state.ffmpegJob = id;
    state.jobs[id] = { label: "ffmpeg（高清合并工具）" };
    if (ctx.toast) ctx.toast("首次高清合并：正在后台下载 ffmpeg…");
    return id;
}

// DASH 高画质：拆视频/音频两条流下载，随后用 ffmpeg 合并成单文件。
// 记入 state.merges，由 maybeMerge 在渲染时推进（下载进度事件会自动重渲染）。
function downloadDASH(ctx, item) {
    if (!item.resolved) resolveItem(ctx, item);
    const title = san(item.title || item.url);
    const label = title + " · " + TYPE_LABEL[item.type];
    const dash = playDash(ctx, item);
    const vUrl = pickHighest(dash.video);
    // 无音轨（罕见）时退回 MP4 单文件。
    if (!dash.audio || !dash.audio.length) {
        const id = ctx.download.download(playMp4(ctx, item), API_HEADERS, title + ".mp4");
        state.jobs[id] = { label };
        return;
    }
    const aUrl = pickHighest(dash.audio);
    const videoJob = ctx.download.download(vUrl, API_HEADERS, title + "_视频.mp4");
    const audioJob = ctx.download.download(aUrl, API_HEADERS, title + "_音频.m4a");
    state.jobs[videoJob] = { label: label + " · 视频流" };
    state.jobs[audioJob] = { label: label + " · 音频流" };
    state.merges.push({
        label,
        videoJob,
        audioJob,
        videoFile: title + "_视频.mp4",
        audioFile: title + "_音频.m4a",
        outFile: title + ".mp4",
        ffmpeg: findFfmpeg(ctx),
        execJob: null,
        merged: false,
        cleaned: false,
        notified: false,
    });
}

// 推进 DASH 合并：两条流都下完 → 起 ffmpeg；ffmpeg 完 → 清临时文件。
// 幂等（靠 merged/cleaned 标志），每次渲染调一次即可。
function maybeMerge(ctx) {
    if (!ctx.download || !ctx.execute) return;
    const byId = {};
    for (const s of ctx.download.status()) byId[s.id] = s;
    for (const p of state.merges) {
        if (p.cleaned) continue;
        const v = byId[p.videoJob];
        const a = byId[p.audioJob];
        if (!v) continue;
        if (!p.merged) {
            const bad = (s) => s && (s.state === "error" || s.state === "cancelled");
            if (bad(v) || bad(a)) {
                p.cleaned = true; // 放弃合并，临时文件保留供手动处理
                continue;
            }
            if (v.state === "done" && a.state === "done") {
                const args = ["-y", "-i", p.videoFile, "-i", p.audioFile, "-c", "copy", "-movflags", "+faststart", p.outFile];
                p.execJob = ctx.execute.exec(p.ffmpeg, args, ctx.download.dir());
                state.jobs[p.execJob] = { label: p.label + " · 合并" };
                p.merged = true;
            }
        } else if (p.execJob) {
            const e = byId[p.execJob];
            if (!e) continue;
            if (e.state === "done") {
                if (ctx.download.remove) ctx.download.remove(p.audioFile);
                if (ctx.download.remove) ctx.download.remove(p.videoFile);
                p.cleaned = true;
            } else if (e.state === "error" || e.state === "cancelled") {
                if (!p.notified) {
                    if (ctx.toast) ctx.toast.error(p.label + "：合并失败，视频/音频临时文件已保留");
                    p.notified = true;
                }
                p.cleaned = true;
            }
        }
    }
    // 清理已结束的合并计划，防止无限增长。
    state.merges = state.merges.filter((p) => !p.cleaned);
}

function extOf(pic) {
    const m = /\.(jpg|jpeg|png|webp)(\?|$)/i.exec(pic || "");
    return m ? "." + m[1].toLowerCase() : ".jpg";
}

// 按条目类型构建下载任务并提交，job id 记入 state.jobs（标明展示标签）。
function downloadItem(ctx, item) {
    if (!item.resolved) resolveItem(ctx, item);
    const title = san(item.title || item.url);
    const label = title + " · " + TYPE_LABEL[item.type];

    if (item.type === "cover") {
        const id = ctx.download.download(item.pic, {}, title + "_封面" + extOf(item.pic));
        state.jobs[id] = { label };
    } else if (item.type === "barrage") {
        const r = ctx.download.http(
            "GET",
            "https://api.bilibili.com/x/v1/dm/list.so?oid=" + item.cid,
            API_HEADERS,
            "",
        );
        if (!r.ok || r.status !== 200) throw new Error("弹幕获取失败 HTTP " + r.status);
        const id = ctx.download.writeText(title + ".xml", r.body);
        state.jobs[id] = { label };
    } else if (item.type === "videoaudio") {
        // 有 ffmpeg → DASH 高画质 + 合并；否则自动下载 ffmpeg 并退回 MP4 单文件
        // （本次仍能拿到成片，下次起 ffmpeg 就绪走高清）。
        if (findFfmpeg(ctx)) {
            downloadDASH(ctx, item);
        } else {
            ensureFfmpeg(ctx);
            const id = ctx.download.download(playMp4(ctx, item), API_HEADERS, title + ".mp4");
            state.jobs[id] = { label };
        }
    } else if (item.type === "video") {
        const dash = playDash(ctx, item);
        const id = ctx.download.download(
            pickHighest(dash.video),
            API_HEADERS,
            title + "_视频.mp4",
        );
        state.jobs[id] = { label };
    } else if (item.type === "audio") {
        const dash = playDash(ctx, item);
        const id = ctx.download.download(
            pickHighest(dash.audio),
            API_HEADERS,
            title + ".m4a",
        );
        state.jobs[id] = { label };
    }
}

function persist(ctx) {
    ctx.store.set("bilibili.items", state.items);
}

function addItem(ctx) {
    const url = state.inputUrl.trim();
    if (!url) {
        ctx.toast.error("请先粘贴 B 站链接");
        return;
    }
    if (!extractKeys(url)) {
        ctx.toast.error("链接格式无法识别");
        return;
    }
    state.items.push({
        key: "i" + state.keySeq++,
        url,
        type: state.inputType,
        title: "",
        pic: "",
        cid: 0,
        bvid: "",
        resolved: false,
    });
    state.inputUrl = "";
    persist(ctx);
}

registerWidget({
    setup(ctx) {
        state.items = ctx.store.get("bilibili.items", []) || [];
        for (const it of state.items) {
            if (!it.key) it.key = "i" + state.keySeq++;
        }
        state.ffmpegSetting = String(ctx.store.get("ffmpeg.path", "") || "");
        // merges 是瞬态（job id 随会话有效），不持久化，重启即空。
    },

    render(ctx) {
        maybeMerge(ctx); // 下载进度会触发重渲染，借此推进 DASH 合并
        const dir = ctx.download ? ctx.download.dir() : "";
        const statuses = ctx.download ? ctx.download.status() : [];
        // ffmpeg 下载终态：完成即从列表移除（文件已在下载目录，findFfmpeg 命中）；
        // 失败/取消则清标记，允许下次重试。
        if (state.ffmpegJob) {
            const fs = statuses.find((x) => x.id === state.ffmpegJob);
            if (
                fs &&
                (fs.state === "done" || fs.state === "error" || fs.state === "cancelled")
            ) {
                delete state.jobs[state.ffmpegJob];
                state.ffmpegJob = null;
            }
        }
        // 只展示本 widget 提交的任务（后端注册表是进程级，可能混入其它 widget）
        const shown = statuses.filter((s) => state.jobs[s.id]);

        return {
            type: "column",
            style: { gap: "8px", height: "100%", overflowY: "auto" },
            children: [
                // 输入行：URL + 类型 + 添加
                {
                    type: "row",
                    style: { gap: "6px", alignItems: "center" },
                    children: [
                        {
                            type: "input",
                            props: {
                                value: state.inputUrl,
                                placeholder: "粘贴 B 站视频链接（BV / av / URL）",
                            },
                            style: { flex: "1", minWidth: "0" },
                            on: "urlInput",
                        },
                        {
                            type: "select",
                            props: { options: TYPES, value: state.inputType },
                            on: "typeInput",
                        },
                        { type: "button", props: { label: "＋添加" }, on: "add" },
                    ],
                },

                // 条目列表
                state.items.length
                    ? {
                          type: "column",
                          style: { gap: "6px" },
                          children: state.items.map((it) => ({
                              type: "row",
                              style: { gap: "6px", alignItems: "center" },
                              children: [
                                  {
                                      type: "text",
                                      props: {
                                          value: it.resolved
                                              ? it.title
                                              : it.url,
                                      },
                                      style: {
                                          flex: "1",
                                          minWidth: "0",
                                          fontSize: "12px",
                                          overflow: "hidden",
                                          textOverflow: "ellipsis",
                                          whiteSpace: "nowrap",
                                      },
                                  },
                                  {
                                      type: "select",
                                      props: { options: TYPES, value: it.type },
                                      on: "itemType_" + it.key,
                                  },
                                  {
                                      type: "button",
                                      props: { label: it.resolved ? "下载" : "解析" },
                                      on: "itemRun_" + it.key,
                                  },
                                  {
                                      type: "button",
                                      props: { label: "✕" },
                                      on: "itemRemove_" + it.key,
                                  },
                              ],
                          })),
                      }
                    : {
                          type: "text",
                          props: { value: "添加链接后，可逐项或批量下载（类型可混合）" },
                          style: { color: "#999", fontSize: "12px" },
                      },

                // 操作 + 目录
                {
                    type: "row",
                    style: { gap: "6px", alignItems: "center" },
                    children: [
                        { type: "button", props: { label: "全部下载" }, on: "downloadAll" },
                        {
                            type: "text",
                            props: { value: state.items.length + " 项" },
                            style: { color: "#999", fontSize: "12px" },
                        },
                        {
                            type: "text",
                            props: { value: "→ " + dir },
                            style: {
                                flex: "1",
                                minWidth: "0",
                                color: "#999",
                                fontSize: "11px",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                            },
                        },
                    ],
                },

                // 下载进度
                shown.length
                    ? {
                          type: "column",
                          style: { gap: "6px" },
                          children: shown.map((s) => {
                              const pct = Math.round((s.progress || 0) * 100);
                              const info =
                                  s.state === "done"
                                      ? "✓ " + (s.dest || "")
                                      : s.state === "error"
                                        ? "✗ " + (s.err || "错误")
                                        : s.state === "cancelled"
                                          ? "已取消"
                                          : s.state === "running"
                                            ? s.kind === "exec"
                                              ? "合并中…"
                                              : pct + "%"
                                            : "…";
                              return {
                                  type: "column",
                                  style: { gap: "3px" },
                                  children: [
                                      {
                                          type: "row",
                                          style: { gap: "6px", alignItems: "center" },
                                          children: [
                                              {
                                                  type: "text",
                                                  props: { value: state.jobs[s.id].label },
                                                  style: {
                                                      flex: "1",
                                                      minWidth: "0",
                                                      fontSize: "12px",
                                                      overflow: "hidden",
                                                      textOverflow: "ellipsis",
                                                      whiteSpace: "nowrap",
                                                  },
                                              },
                                              {
                                                  type: "text",
                                                  props: { value: info },
                                                  style: {
                                                      color:
                                                          s.state === "error"
                                                              ? "#e5484d"
                                                              : s.state === "done"
                                                                ? "#2f9e44"
                                                                : "#666",
                                                      fontSize: "12px",
                                                  },
                                              },
                                              s.state === "running" ||
                                              s.state === "queued"
                                                  ? {
                                                        type: "button",
                                                        props: { label: "取消" },
                                                        on: "cancel_" + s.id,
                                                    }
                                                  : null,
                                          ].filter(Boolean),
                                      },
                                      {
                                          type: "progress",
                                          props: {
                                              value: pct,
                                              tone:
                                                  s.state === "error"
                                                      ? "danger"
                                                      : "accent",
                                          },
                                      },
                                  ],
                              };
                          }),
                      }
                    : {
                          type: "text",
                          props: { value: "暂无任务" },
                          style: { color: "#999", fontSize: "12px" },
                      },
            ],
        };
    },

    handleEvent(id, type, data, ctx) {
        if (id === "urlInput") state.inputUrl = String(data);
        else if (id === "typeInput") state.inputType = String(data);
        else if (id === "add") addItem(ctx);
        else if (id === "downloadAll") {
            if (!state.items.length) {
                ctx.toast.error("列表为空，先添加链接");
                return;
            }
            for (const it of state.items) {
                try {
                    downloadItem(ctx, it);
                } catch (e) {
                    ctx.toast.error((it.title || it.url) + "：" + e.message);
                }
            }
        } else if (id.startsWith("itemType_")) {
            const it = state.items.find((x) => x.key === id.slice("itemType_".length));
            if (it) it.type = String(data);
        } else if (id.startsWith("itemRun_")) {
            const key = id.slice("itemRun_".length);
            const it = state.items.find((x) => x.key === key);
            if (!it) return;
            try {
                downloadItem(ctx, it);
            } catch (e) {
                ctx.toast.error((it.title || it.url) + "：" + e.message);
            }
        } else if (id.startsWith("itemRemove_")) {
            const key = id.slice("itemRemove_".length);
            state.items = state.items.filter((x) => x.key !== key);
            persist(ctx);
        } else if (id.startsWith("cancel_")) {
            const jid = Number(id.slice("cancel_".length));
            if (ctx.download) ctx.download.cancel(jid);
        }
    },

    onSettingChange(key, value, ctx) {
        if (key === "download.dir") {
            ctx.store.set("download.dir", String(value));
        } else if (key === "ffmpeg.path") {
            state.ffmpegSetting = String(value || "");
            ctx.store.set("ffmpeg.path", state.ffmpegSetting);
        }
    },
});