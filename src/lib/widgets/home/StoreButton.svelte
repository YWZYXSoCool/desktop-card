<script lang="ts">
    import { Store } from "lucide-svelte";
    import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
    import { toast } from "svelte-sonner";

    /** 打开（或聚焦已存在的）Widget 商店窗口：全新窗口、屏幕居中，与设置窗口同款观感。 */
    async function openStore() {
        try {
            const existing = await WebviewWindow.getByLabel("store");
            if (existing) {
                await existing.show();
                await existing.setFocus();
                return;
            }
            const win = new WebviewWindow("store", {
                url: "/?mode=store",
                title: "Widget 商店",
                width: 380,
                height: 540,
                center: true,
                resizable: false,
                // 与主卡片一致的观感：无边框、透明、无阴影，圆角由 CSS 呈现
                alwaysOnTop: true,
                decorations: false,
                transparent: true,
                shadow: false,
                skipTaskbar: true,
            });
            win.once("tauri://error", () => toast("无法打开商店窗口"));
        } catch {
            toast("无法打开商店窗口");
        }
    }
</script>

<button
    type="button"
    class="store-btn"
    onclick={() => void openStore()}
    aria-label="Widget 商店"
    title="Widget 商店"
>
    <Store size={13} aria-hidden="true" />
</button>

<style>
    .store-btn {
        pointer-events: auto;
        position: absolute;
        left: 8px;
        top: 8px;
        width: 22px;
        height: 22px;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        border: none;
        border-radius: 6px;
        background: transparent;
        color: var(--text-muted);
        cursor: pointer;
        transition:
            color 150ms ease,
            background 150ms ease;
    }

    .store-btn:hover {
        color: var(--text);
        background: var(--hover);
    }

    .store-btn:active {
        transform: scale(0.9);
    }
</style>