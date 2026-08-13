import manifest from "./widget.json";
import DictionaryCard from "./DictionaryCard.svelte";
import { defineWidget } from "$lib/widgets/api/defineWidget";
import { setActiveWidget } from "$lib/widgets/registry.svelte";
import type { WidgetContext, WidgetManifest, WidgetSetting } from "$lib/widgets/api/types";
import { clipboard } from "$lib/widgets/clipboard/clipboard.svelte";
import { dict, readConfigFromStore } from "./dictionary.svelte";

/** 英英释义查询的设置项（单一来源，注入 manifest.settings，设置页据此渲染）。 */
const settings: WidgetSetting[] = [
    {
        key: "dict.channel",
        label: "查询渠道",
        type: "select",
        default: "api",
        options: [
            { label: "API 获取", value: "api" },
            { label: "AI 生成", value: "ai" },
        ],
    },
    {
        key: "dict.apiSource",
        label: "API 数据源",
        type: "select",
        default: "dictionaryapi",
        options: [{ label: "Free Dictionary API", value: "dictionaryapi" }],
        visibleWhen: { key: "dict.channel", equals: "api" },
    },
    {
        key: "dict.aiProvider",
        label: "AI 提供商",
        type: "select",
        default: "deepseek",
        options: [
            { label: "DeepSeek", value: "deepseek" },
            { label: "火山方舟", value: "volc" },
        ],
        visibleWhen: { key: "dict.channel", equals: "ai" },
    },
    {
        key: "dict.apiKey",
        label: "API Key",
        type: "text",
        default: "",
        placeholder: "DeepSeek / 火山 API Key",
        visibleWhen: { key: "dict.channel", equals: "ai" },
    },
    {
        key: "dict.model",
        label: "模型名",
        type: "text",
        default: "",
        placeholder: "火山必填，如 ep-xxx / doubao-xxx",
        visibleWhen: { key: "dict.channel", equals: "ai" },
    },
    {
        key: "dict.baseUrl",
        label: "接口地址",
        type: "text",
        default: "",
        placeholder: "默认由提供商填充，可覆盖",
        visibleWhen: { key: "dict.channel", equals: "ai" },
    },
];

/**
 * 注册卡片右键菜单项：一键跳转到词典 widget 查询“当前选中文本”的释义。
 * 长按中键已把前台窗口选中文本复制进剪贴板，动作在卡片窗口执行，读取最新剪贴板文本后切卡并直接发起查询。
 */
function setup(ctx: WidgetContext): void {
    ctx.menu?.add("查询选中文本释义", () => {
        void (async () => {
            try {
                const word = (await clipboard.latestText())?.trim();
                if (!word) {
                    ctx.toast?.error("剪贴板没有可查询的文本");
                    return;
                }
                const cfg = await readConfigFromStore(ctx.store!);
                dict.word = word;
                dict.clear();
                setActiveWidget(manifest.id);
                await dict.lookup(cfg);
            } catch {
                ctx.toast?.error("查询失败");
            }
        })();
    });
}

export const definition = defineWidget({
    manifest: manifest as unknown as WidgetManifest,
    component: DictionaryCard,
    settings,
    setup,
});