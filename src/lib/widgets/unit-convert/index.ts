import manifest from "./widget.json";
import UnitConverter from "./UnitConverter.svelte";
import { defineWidget } from "$lib/widgets/api/defineWidget";
import type { WidgetManifest, WidgetSetting } from "$lib/widgets/api/types";

/** 换算配置：结果小数位（进制页为整数，不受影响）。 */
const settings: WidgetSetting[] = [
    { type: "section", name: "换算" },
    {
        key: "unit.decimals",
        label: "结果小数位",
        type: "select",
        default: "auto",
        options: [
            { label: "自动", value: "auto" },
            { label: "0 位", value: "0" },
            { label: "1 位", value: "1" },
            { label: "2 位", value: "2" },
            { label: "3 位", value: "3" },
            { label: "4 位", value: "4" },
            { label: "5 位", value: "5" },
            { label: "6 位", value: "6" },
        ],
    },
];

export const definition = defineWidget({
    manifest: manifest as unknown as WidgetManifest,
    settings,
    component: UnitConverter,
});