<script lang="ts">
    import {
        AlertCircle,
        Check,
        Download,
        Info,
        Link as LinkIcon,
        Loader2,
        Pin,
        Play,
        Search,
        Trash2,
        X,
    } from "lucide-svelte";
    import type { ComponentType } from "svelte";
    import type { UINode } from "$lib/widgets/api/types";
    import { styleStr } from "./style";

    let { node }: { node: UINode } = $props();
    const style = $derived(styleStr(node.style));

    // 安全子集：外部 widget 只可按名取这几个图标，未命中退回占位。
    const registry: Record<string, ComponentType> = {
        alert: AlertCircle,
        check: Check,
        download: Download,
        info: Info,
        link: LinkIcon,
        pin: Pin,
        play: Play,
        search: Search,
        spinner: Loader2,
        trash: Trash2,
        x: X,
    };

    const name = $derived(String(node.props?.name ?? "").toLowerCase());
    const Icon = $derived(registry[name] ?? AlertCircle);
    const size = $derived(Number(node.props?.size ?? 14));
    const color = $derived(String(node.props?.color ?? "currentColor"));
</script>

<Icon {size} {color} {style} aria-hidden="true" />

<style>
    :global(svg) {
        flex: none;
    }
</style>
