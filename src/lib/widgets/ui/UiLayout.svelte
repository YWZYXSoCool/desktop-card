<script lang="ts">
    import type { UINode } from "$lib/widgets/api/types";
    import UiNode from "./UiNode.svelte";
    import { styleStr } from "./style";

    let { node, onEvent }: { node: UINode; onEvent?: import("./style").EventCb } =
        $props();

    const style = $derived(styleStr(node.style));
    const kind = $derived(node.type); // row | column | stack | box | spacer
</script>

{#if kind === "spacer"}
    <div class="sb-spacer" {style}></div>
{:else}
    <!-- 布局容器：按类型套 flex 方向，children 递归渲染为 <UiNode> 子树。 -->
    <div class="sb-layout {kind}" {style}>
        {#each node.children ?? [] as child (child)}
            <UiNode node={child} onEvent={onEvent} />
        {/each}
    </div>
{/if}

<style>
    .sb-layout {
        display: flex;
        min-width: 0;
        min-height: 0;
    }
    .sb-layout.row {
        flex-direction: row;
    }
    .sb-layout.column {
        flex-direction: column;
    }
    .sb-layout.stack {
        position: relative;
    }
    .sb-spacer {
        flex: 1 1 auto;
        min-width: 0;
        min-height: 0;
    }
</style>