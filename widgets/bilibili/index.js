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

const state = {
    items: [], // { key, url, type, title, pic, cid, bvid, resolved }
    inputUrl: "",
    inputType: "videoaudio",
    jobs: {}, // jobId -> { label }
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

// DASH 流：视频/音频各挑最高码率。
function playDash(ctx, item) {
    const url =
        "https://api.bilibili.com/x/player/playurl?bvid=" + item.bvid +
        "&cid=" + item.cid + "&qn=80&fnval=1&fourk=1";
    const j = httpGet(ctx, url);
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

// MP4 单文件（本身含音轨）。
function playMp4(ctx, item) {
    const url =
        "https://api.bilibili.com/x/player/playurl?bvid=" + item.bvid +
        "&cid=" + item.cid + "&qn=80&fnval=16&fourk=1";
    const j = httpGet(ctx, url);
    const durl = j.data && j.data.durl;
    if (!durl || !durl.length) throw new Error("该画质需合并，暂不支持");
    return durl[0].url;
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
        const id = ctx.download.download(playMp4(ctx, item), API_HEADERS, title + ".mp4");
        state.jobs[id] = { label };
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
    },

    render(ctx) {
        const dir = ctx.download ? ctx.download.dir() : "";
        const statuses = ctx.download ? ctx.download.status() : [];
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
                                            ? pct + "%"
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
                                          type: "box",
                                          style: {
                                              height: "5px",
                                              background: "#eee",
                                              borderRadius: "3px",
                                              overflow: "hidden",
                                          },
                                          children: [
                                              {
                                                  type: "box",
                                                  style: {
                                                      width: pct + "%",
                                                      height: "100%",
                                                      background:
                                                          s.state === "error"
                                                              ? "#e5484d"
                                                              : "#4a9dff",
                                                  },
                                              },
                                          ],
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
        }
    },
});