<script lang="ts">
    import type { UINode } from "$lib/widgets/api/types";
    import type { EventCb } from "./style";
    import UiLayout from "./UiLayout.svelte";
    import UiText from "./UiText.svelte";
    import UiButton from "./UiButton.svelte";
    import UiInput from "./UiInput.svelte";
    import UiNumber from "./UiNumber.svelte";
    import UiSearch from "./UiSearch.svelte";
    import UiTextarea from "./UiTextarea.svelte";
    import UiToggle from "./UiToggle.svelte";
    import UiSelect from "./UiSelect.svelte";
    import UiSlider from "./UiSlider.svelte";
    import UiColor from "./UiColor.svelte";
    import UiDate from "./UiDate.svelte";
    import UiTime from "./UiTime.svelte";
    import UiImage from "./UiImage.svelte";
    import UiIcon from "./UiIcon.svelte";
    import UiAvatar from "./UiAvatar.svelte";
    import UiBadge from "./UiBadge.svelte";
    import UiDivider from "./UiDivider.svelte";
    import UiCard from "./UiCard.svelte";
    import UiProgress from "./UiProgress.svelte";
    import UiLink from "./UiLink.svelte";
    import UiCheckbox from "./UiCheckbox.svelte";
    import UiRadio from "./UiRadio.svelte";
    import UiField from "./UiField.svelte";

    let { node, onEvent }: { node: UINode; onEvent?: EventCb } = $props();
</script>

{#if node.type === "text"}
    <UiText {node} />
{:else if node.type === "button"}
    <UiButton {node} {onEvent} />
{:else if node.type === "input"}
    <UiInput {node} {onEvent} />
{:else if node.type === "number"}
    <UiNumber {node} {onEvent} />
{:else if node.type === "search"}
    <UiSearch {node} {onEvent} />
{:else if node.type === "textarea"}
    <UiTextarea {node} {onEvent} />
{:else if node.type === "toggle"}
    <UiToggle {node} {onEvent} />
{:else if node.type === "select"}
    <UiSelect {node} {onEvent} />
{:else if node.type === "slider"}
    <UiSlider {node} {onEvent} />
{:else if node.type === "color"}
    <UiColor {node} {onEvent} />
{:else if node.type === "date"}
    <UiDate {node} {onEvent} />
{:else if node.type === "time"}
    <UiTime {node} {onEvent} />
{:else if node.type === "image"}
    <UiImage {node} />
{:else if node.type === "icon"}
    <UiIcon {node} />
{:else if node.type === "avatar"}
    <UiAvatar {node} />
{:else if node.type === "badge"}
    <UiBadge {node} />
{:else if node.type === "divider"}
    <UiDivider {node} />
{:else if node.type === "progress"}
    <UiProgress {node} />
{:else if node.type === "link"}
    <UiLink {node} {onEvent} />
{:else if node.type === "checkbox"}
    <UiCheckbox {node} {onEvent} />
{:else if node.type === "radio"}
    <UiRadio {node} {onEvent} />
{:else if node.type === "card"}
    <UiCard {node} {onEvent} />
{:else if node.type === "field"}
    <UiField {node} {onEvent} />
{:else}
    <!-- 布局容器：row/column/stack/box/spacer 及未知类型统一走 UiLayout -->
    <UiLayout {node} {onEvent} />
{/if}