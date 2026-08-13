import manifest from "./widget.json";
import ColorPage from "./ColorPage.svelte";
import { defineWidget } from "$lib/widgets/api/defineWidget";
import type { WidgetManifest } from "$lib/widgets/api/types";

export const definition = defineWidget({
    manifest: manifest as unknown as WidgetManifest,
    component: ColorPage,
});