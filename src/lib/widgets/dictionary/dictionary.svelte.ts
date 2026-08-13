import { invoke } from "@tauri-apps/api/core";
import type { WidgetStore } from "$lib/widgets/api/types";
import { fuzzyScore } from "$lib/core/fuzzy";

/** 查询渠道配置（设置项镜像，与 store 持久化键对应）。 */
export interface DictConfig {
    channel: string;
    apiSource: string;
    aiProvider: string;
    apiKey: string;
    model: string;
    baseUrl: string;
}

/**
 * 配置字段元数据：对象键 / 完整命名空间键 / 默认值。
 * 组件经 ctx.settings 读短名、菜单动作直接读 store 全键，二者共用此表，字段增减只改一处。
 */
export const DICT_CONFIG_FIELDS = [
    { key: "channel", full: "dict.channel", def: "api" },
    { key: "apiSource", full: "dict.apiSource", def: "dictionaryapi" },
    { key: "aiProvider", full: "dict.aiProvider", def: "deepseek" },
    { key: "apiKey", full: "dict.apiKey", def: "" },
    { key: "model", full: "dict.model", def: "" },
    { key: "baseUrl", full: "dict.baseUrl", def: "" },
] as const satisfies ReadonlyArray<{ key: keyof DictConfig; full: string; def: string }>;

/** 从 store 恢复全部字段（键为完整命名空间键）。 */
export async function readConfigFromStore(store: WidgetStore): Promise<DictConfig> {
    const values = await Promise.all(
        DICT_CONFIG_FIELDS.map((f) => store.get<string>(f.full, f.def)),
    );
    return Object.fromEntries(DICT_CONFIG_FIELDS.map((f, i) => [f.key, values[i]])) as unknown as DictConfig;
}

/** 从响应式 settings 句柄恢复全部字段（键为短名，去命名空间前缀）。 */
export function readConfigFromSettings(s: { get<T = unknown>(k: string): T }): DictConfig {
    return Object.fromEntries(
        DICT_CONFIG_FIELDS.map((f) => [
            f.key,
            s.get<string>(f.full.slice(f.full.lastIndexOf(".") + 1)),
        ]),
    ) as unknown as DictConfig;
}

/** 通用 HTTP 请求通道返回的原始响应（后端只做裸转发，业务解析在本文件）。 */
interface HttpResponse {
    status: number;
    body: string;
}

/** Free Dictionary API 返回的单条释义（一个词可能对应多个词条）。 */
export interface ApiDefinition {
    definition: string;
    example?: string;
    synonyms: string[];
    antonyms: string[];
}

export interface ApiMeaning {
    partOfSpeech: string;
    definitions: ApiDefinition[];
}

export interface ApiEntry {
    word: string;
    phonetic?: string;
    meanings: ApiMeaning[];
}

/** 查询结果：API 与 AI 渠道统一为结构化词条列表。 */
export type DictResult = { entries: ApiEntry[] };

/* ============================ 业务逻辑（本应在前端） ============================ */

/** 各 AI 提供商的默认接入参数（base 为 OpenAI 兼容宿主，末尾自行拼接 /chat/completions）。
 *  model 留空表示必须由用户在设置里显式填写（如火山方舟 / 自定义）。 */
const PROVIDER_DEFAULTS: Record<string, { base: string; model: string }> = {
    // 火山方舟 base 已提供，但模型名必须显式填写（见 lookupViaAi 的校验）
    volc: { base: "https://ark.cn-beijing.volces.com/api/v3", model: "" },
    deepseek: { base: "https://api.deepseek.com", model: "deepseek-chat" },
    openai: { base: "https://api.openai.com/v1", model: "gpt-4o-mini" },
    zhipu: { base: "https://open.bigmodel.cn/api/paas/v4", model: "glm-4-flash" },
    moonshot: { base: "https://api.moonshot.cn/v1", model: "moonshot-v1-8k" },
    qwen: { base: "https://dashscope.aliyuncs.com/compatible-mode/v1", model: "qwen-plus" },
    openrouter: { base: "https://openrouter.ai/api/v1", model: "openai/gpt-4o-mini" },
    // 自定义来源：无默认 base/model，全部由用户手动填写
    custom: { base: "", model: "" },
};

/** AI 系统提示：要求严格返回约定的 JSON 结构，避免每次返回格式漂移。 */
const AI_SYSTEM_PROMPT = `你是英英词典。用户会给出一个英文单词，你只返回一个 JSON 对象，不要输出任何其它文字或 markdown 代码块。

JSON 结构严格固定如下：
{
  "entries": [
    {
      "word": "单词",
      "phonetic": "英式音标，如 /wɜːd/，不知道就省略该字段",
      "meanings": [
        {
          "partOfSpeech": "词性，如 noun / verb / adjective",
          "definitions": [
            {
              "definition": "一行英文释义",
              "example": "一个用法例句（可选）",
              "synonyms": ["近义词"],
              "antonyms": ["反义词"]
            }
          ]
        }
      ]
    }
  ]
}
规则：
- 释义用简洁的英英定义，不要翻译成中文。
- 不知道或不存在该词时，"entries" 返回空数组 []。
- 只允许上述唯一一种结构，键名必须完全一致。`;

/** 结果缓存：按 (渠道, 词) 缓存解析后的词条，TTL 内命中直接返回，避免重复请求。 */
interface CacheEntry {
    inserted: number;
    value: ApiEntry[];
}
let cache = new Map<string, CacheEntry>();
const CACHE_TTL = 3_600_000; // 1 小时
const CACHE_MAX = 200;

/** 缓存键：AI 结果依赖提供商与模型，写进键里避免换配置后串结果。 */
function cacheKey(channel: string, word: string, cfg: DictConfig): string {
    if (channel === "api") return `api|${word.toLowerCase()}`;
    // 结果依赖接入点/模型，写进键里避免换配置后串结果（自定义来源 base 千变万化）
    if (channel === "ai") return `ai|${cfg.aiProvider}|${cfg.model}|${cfg.baseUrl}|${word.toLowerCase()}`;
    return `${channel}|${word}`;
}

/** 读取缓存（命中直接返回，不做额外清理）。 */
function cacheGet(key: string): ApiEntry[] | null {
    return cache.get(key)?.value ?? null;
}

/**
 * 写入缓存：顺带清理过期项；仍超上限时按插入顺序丢弃最旧一条（Map 保序，无需排序）。
 * 清理只在写路径做，避免每次读都扫全表。
 */
function cachePut(key: string, value: ApiEntry[]): void {
    const now = Date.now();
    for (const [k, v] of cache) {
        if (now - v.inserted > CACHE_TTL) cache.delete(k);
    }
    if (cache.size >= CACHE_MAX && !cache.has(key)) {
        const oldestKey = cache.keys().next().value;
        if (oldestKey !== undefined) cache.delete(oldestKey);
    }
    cache.set(key, { inserted: now, value });
}

/** 发起 HTTP 请求（后端 http_request 只做裸转发，超时由后端兜底）。 */
async function httpRequest(
    method: string,
    url: string,
    headers: Record<string, string>,
    body?: string,
): Promise<HttpResponse> {
    return invoke<HttpResponse>("http_request", { req: { method, url, headers, body } });
}

/** 查询英文词的英英释义。API 与 AI 渠道统一返回词条数组 ApiEntry[]。 */
async function lookup(word: string, cfg: DictConfig): Promise<ApiEntry[]> {
    const channel = cfg.channel;
    const key = cacheKey(channel, word, cfg);
    const hit = cacheGet(key);
    if (hit) return hit;

    if (channel !== "api" && channel !== "ai") {
        throw new Error(`未知的查询渠道: ${channel}`);
    }
    const entries = channel === "api" ? await lookupViaApi(word, cfg) : await lookupViaAi(word, cfg);

    cachePut(key, entries);
    return entries;
}

/** Free Dictionary API：dictionaryapi.dev。解析为统一词条结构（丢弃次要字段）。 */
async function lookupViaApi(word: string, cfg: DictConfig): Promise<ApiEntry[]> {
    if (cfg.apiSource && cfg.apiSource !== "dictionaryapi") {
        throw new Error(`不支持的 API 数据源: ${cfg.apiSource}`);
    }
    const url = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`;
    const res = await httpRequest("GET", url, {});
    if (res.status === 404) throw new Error(`未找到「${word}」的释义`);
    if (res.status < 200 || res.status >= 300) {
        throw new Error(`查询失败（HTTP ${res.status}）`);
    }
    try {
        return JSON.parse(res.body) as ApiEntry[];
    } catch (e) {
        throw new Error(`解析失败: ${e}`);
    }
}

/** AI 生成：OpenAI 兼容 chat/completions，要求返回 JSON，解析并归一化为统一词条结构。 */
async function lookupViaAi(word: string, cfg: DictConfig): Promise<ApiEntry[]> {
    const provider = cfg.aiProvider.trim() || "deepseek";
    const defaults = PROVIDER_DEFAULTS[provider];
    const base = (cfg.baseUrl.trim() || defaults?.base || "").replace(/\/+$/, "");
    // 自定义来源必须显式填写接口地址
    if (!base) throw new Error("请在设置里填写接口地址（base URL）");
    // 火山方舟必须显式指定模型/推理接入点（ep-xxx / doubao-xxx）
    let model = cfg.model.trim();
    if (!model) {
        if (provider === "volc") {
            throw new Error("火山方舟需要在设置里填写模型名（如 ep-xxx 或 doubao-xxx）");
        }
        if (!defaults?.model) {
            throw new Error("请在设置里填写模型名");
        }
        model = defaults.model;
    }
    const apiKey = cfg.apiKey.trim();
    if (!apiKey) throw new Error("请先在设置里填写所选 AI 提供商的 API Key");

    const url = `${base}/chat/completions`;
    const headers: Record<string, string> = {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
    };
    const body = JSON.stringify({
        model,
        temperature: 0.2,
        // 强制模型输出合法 JSON，配合系统提示固定结构
        response_format: { type: "json_object" },
        messages: [
            { role: "system", content: AI_SYSTEM_PROMPT },
            { role: "user", content: word },
        ],
    });

    const res = await httpRequest("POST", url, headers, body);
    if (res.status < 200 || res.status >= 300) {
        throw new Error(`AI 请求失败（HTTP ${res.status}）: ${res.body.slice(0, 200)}`);
    }
    let cc: { choices?: { message?: { content?: string } }[] };
    try {
        cc = JSON.parse(res.body);
    } catch (e) {
        throw new Error(`解析失败: ${e}`);
    }
    const text = cc.choices?.[0]?.message?.content ?? "";
    if (!text.trim()) throw new Error("AI 未返回内容");

    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch (e) {
        throw new Error(`AI 返回不是合法 JSON: ${e}`);
    }
    try {
        return normalizeEntries(extractEntries(parsed));
    } catch (e) {
        throw new Error(`AI 返回结构与约定不符: ${e}`);
    }
}

/** 把 AI 返回的 JSON 归一化为词条数组（对象则包成单元素数组，数组原样返回）。 */
function extractEntries(v: unknown): unknown {
    if (v && typeof v === "object" && !Array.isArray(v)) {
        const o = v as Record<string, unknown>;
        const inner = o.entries ?? o.result ?? { ...o };
        if (Array.isArray(inner)) return inner;
        if (inner && typeof inner === "object") return [inner];
        return [];
    }
    return Array.isArray(v) ? v : [];
}

/** 校验并把词条数组归一到 ApiEntry 结构（与后端旧的 serde 校验等价）。 */
function normalizeEntries(arr: unknown): ApiEntry[] {
    if (!Array.isArray(arr)) throw new Error("结果不是数组");
    return arr.map((e) => {
        const entry = e as ApiEntry;
        if (!entry || typeof entry !== "object" || !Array.isArray(entry.meanings)) {
            throw new Error("词条缺少 meanings");
        }
        return entry;
    });
}

/* ============================ 历史 & 收藏 ============================ */

/** 一条搜索历史：次数 + 最近查询时间。 */
export interface HistoryEntry {
    count: number;
    lastAt: number;
}

/**
 * 从历史 + 收藏构建建议列表。
 * 空输入 → 按最近搜索排序；有输入 → 模糊命中过滤。
 * 排序：收藏优先 → 最近搜索 → 字母序。
 */
function buildSuggestions(
    q: string,
    history: Record<string, HistoryEntry>,
    favorites: string[],
): string[] {
    const lower = q.toLowerCase();
    const pool = new Set([...Object.keys(history), ...favorites]);
    const items = [...pool].map((w) => {
        const h = history[w];
        return {
            w,
            isFav: favorites.includes(w),
            count: h?.count ?? 0,
            lastAt: h?.lastAt ?? 0,
            score: lower ? fuzzyScore(w, lower) : 0,
        };
    });
    const filtered = lower ? items.filter((x) => x.score >= 0) : items;
    filtered.sort(
        (a, b) =>
            Number(b.isFav) - Number(a.isFav) ||
            b.lastAt - a.lastAt ||
            a.w.localeCompare(b.w),
    );
    return filtered.slice(0, 6).map((x) => x.w);
}

/* ============================ Store 状态 ============================ */

/** 词典 widget 的可变状态：当前词 + 结果 + 加载/错误 + 历史 + 收藏。 */
class DictStore {
    word = $state("");
    result = $state<DictResult | null>(null);
    loading = $state(false);
    error = $state("");

    history = $state<Record<string, HistoryEntry>>({});
    favorites = $state<string[]>([]);

    /** 启动时用持久化的历史 + 收藏填充。 */
    loadMeta(history: Record<string, HistoryEntry>, favorites: string[]): void {
        this.history = history;
        this.favorites = favorites;
    }

    /** 记录一次成功查询：次数 +1、时间更新。 */
    record(word: string): void {
        const w = word.trim().toLowerCase();
        if (!w) return;
        const prev = this.history[w] ?? { count: 0, lastAt: 0 };
        this.history = {
            ...this.history,
            [w]: { count: prev.count + 1, lastAt: Date.now() },
        };
    }

    /** 切换某词的收藏状态。 */
    toggleFavorite(word: string): void {
        const w = word.trim().toLowerCase();
        this.favorites = this.favorites.includes(w)
            ? this.favorites.filter((x) => x !== w)
            : [...this.favorites, w];
    }

    isFavorite(word: string): boolean {
        return this.favorites.includes(word.trim().toLowerCase());
    }

    /** 当前输入对应的建议列表（历史 + 收藏，收藏优先、按最近搜索排序）。 */
    suggestions(): string[] {
        return buildSuggestions(this.word, this.history, this.favorites);
    }

    /** 按当前输入词发起查询（渠道/参数来自设置）。错误落到 error，不抛出。 */
    async lookup(cfg: DictConfig): Promise<void> {
        const word = this.word.trim();
        if (!word) return;
        this.loading = true;
        this.error = "";
        this.result = null;
        try {
            const entries = await lookup(word, cfg);
            this.result = { entries };
        } catch (e) {
            this.error = String(e);
        } finally {
            this.loading = false;
        }
    }

    /** 清空结果与错误（换词重查时由组件调用）。 */
    clear(): void {
        this.result = null;
        this.error = "";
    }
}

export const dict = new DictStore();