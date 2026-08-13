<script lang="ts">
    import { emit } from "@tauri-apps/api/event";
    import { getCurrentWindow } from "@tauri-apps/api/window";
    import { toast } from "svelte-sonner";
    import { RefreshCw, Trash2, Download, FolderPlus } from "lucide-svelte";
    import {
        fetchCatalog,
        fetchInstalled,
        fetchManifest,
        installWidget,
        importLocalWidget,
        uninstallWidget,
        loadSourceString,
        saveSourceString,
        parseSource,
        PERMISSION_LABELS,
        type StoreWidget,
        type InstalledWidgetEntry,
    } from "./store";
    import Window from "./Window.svelte";

    // 当前 tab：已安装 / 商店
    let tab = $state<"installed" | "store">("store");

    // 源仓库字符串（可编辑，失焦持久化）
    let source = $state("");
    let sourceParsed = $state(false); // 当前字符串能否解析为 owner/repo[#branch]

    // 目录与已安装
    let catalog = $state<StoreWidget[]>([]);
    let installed = $state<Map<string, InstalledWidgetEntry>>(new Map());
    let search = $state("");
    let loading = $state(false);
    let error = $state("");

    // 安装流程：pending 为等待权限确认的 widget
    let pending = $state<StoreWidget | null>(null);
    let pendingPermissions = $state<string[]>([]);
    let installing = $state<string | null>(null);
    let uninstalling = $state<string | null>(null);

    const filtered = $derived(
        search.trim()
            ? catalog.filter(
                  (w) =>
                      w.name.includes(search.trim()) ||
                      w.id.includes(search.trim()) ||
                      (w.description ?? "").includes(search.trim()),
              )
            : catalog,
    );

    $effect(() => {
        void loadSourceString().then((s) => {
            source = s;
            sourceParsed = parseSource(s) !== null;
            void refresh();
        });
    });

    /** 变更源仓库：失焦时持久化（解析失败仅提示，不改已加载内容）。 */
    function onSourceBlur() {
        const parsed = parseSource(source);
        sourceParsed = parsed !== null;
        if (!parsed) {
            toast.error("源仓库格式应为 owner/repo[#branch]");
            return;
        }
        void saveSourceString(source).catch(() => {});
        void refresh();
    }

    /** 抓取目录 + 已安装列表。解析失败只提示，不清空旧列表。 */
    async function refresh() {
        const src = parseSource(source);
        if (!src) return;
        loading = true;
        error = "";
        try {
            const [cat, inst] = await Promise.all([
                fetchCatalog(src),
                fetchInstalled(),
            ]);
            catalog = cat.widgets;
            installed = inst;
        } catch (e) {
            error = e instanceof Error ? e.message : String(e);
        } finally {
            loading = false;
        }
    }

    /** 点「安装」：抓 manifest 拿权限 → 弹确认；确认后真正下载。 */
    async function askInstall(w: StoreWidget) {
        const src = parseSource(source);
        if (!src) return;
        installing = w.id;
        try {
            const { permissions } = await fetchManifest(src, w);
            pending = w;
            pendingPermissions = permissions;
        } catch (e) {
            toast.error(e instanceof Error ? e.message : String(e));
        } finally {
            installing = null;
        }
    }

    /** 确认安装：下载写入 → 通知主窗口重载 → 刷新列表。 */
    async function confirmInstall() {
        const w = pending;
        if (!w) return;
        const src = parseSource(source);
        if (!src) return;
        pending = null;
        installing = w.id;
        try {
            await installWidget(src, w);
            await emit("widgets-changed", {});
            toast.success(`已安装「${w.name}」`);
            await refresh();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : String(e));
        } finally {
            installing = null;
        }
    }

    /** 从本地导入 widget 目录：弹选择器 → Rust 复制 → 通知主窗口 → 刷新。 */
    async function importLocal() {
        try {
            const id = await importLocalWidget();
            if (!id) return; // 用户取消
            await emit("widgets-changed", {});
            toast.success(`已导入「${id}」`);
            await refresh();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : String(e));
        }
    }

    /** 卸载：删除 → 通知主窗口重载 → 刷新列表。 */
    async function remove(w: InstalledWidgetEntry) {
        uninstalling = w.manifest.id;
        try {
            await uninstallWidget(w.manifest.id);
            await emit("widgets-changed", {});
            toast.success(`已卸载「${w.manifest.name}」`);
            await refresh();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : String(e));
        } finally {
            uninstalling = null;
        }
    }

    function onClose() {
        getCurrentWindow().close();
    }
</script>

<svelte:window onkeydown={(e) => e.key === "Escape" && onClose()} />

<Window title="Widget 商店" draggable={false} onClose={onClose}>
    <!-- 顶部：源仓库 + 刷新 -->
    <div class="source-bar">
        <input
            class="source"
            type="text"
            bind:value={source}
            onblur={onSourceBlur}
            placeholder="owner/repo[#branch]"
            aria-label="Widget 源仓库"
        />
        <button
            class="icon-btn"
            class:spin={loading}
            onclick={() => void refresh()}
            title="刷新"
            aria-label="刷新"
        >
            <RefreshCw size={14} aria-hidden="true" />
        </button>
    </div>

    {#if error}
        <div class="error">{error}</div>
    {/if}

    <!-- Tab 切换：已安装 / 商店 -->
    <div class="tabs" role="tablist">
        <button
            type="button"
            class="tab"
            class:active={tab === "installed"}
            role="tab"
            aria-selected={tab === "installed"}
            onclick={() => (tab = "installed")}
        >
            已安装
            {#if installed.size > 0}
                <span class="badge">{installed.size}</span>
            {/if}
        </button>
        <button
            type="button"
            class="tab"
            class:active={tab === "store"}
            role="tab"
            aria-selected={tab === "store"}
            onclick={() => (tab = "store")}
        >
            商店
        </button>
    </div>

    {#if tab === "installed"}
        <!-- 已安装 -->
        <section class="group">
            <div class="group-head">
                <h3 class="group-title">已安装</h3>
                <button
                    class="local-btn"
                    onclick={() => void importLocal()}
                    title="从本地文件夹导入 widget"
                >
                    <FolderPlus size={13} aria-hidden="true" />
                    <span>从本地添加</span>
                </button>
            </div>
            {#if installed.size === 0}
                <div class="empty">暂无已安装的外部 widget</div>
            {:else}
                <ul class="list">
                    {#each [...installed.values()] as w (w.manifest.id)}
                        <li class="row">
                            <span class="row-name">{w.manifest.name}</span>
                            {#if w.manifest.version}
                                <span class="ver">v{w.manifest.version}</span>
                            {/if}
                            <span class="spacer"></span>
                            <button
                                class="icon-btn danger"
                                class:loading={uninstalling === w.manifest.id}
                                onclick={() => void remove(w)}
                                title="卸载"
                                aria-label={`卸载 ${w.manifest.name}`}
                            >
                                <Trash2 size={13} aria-hidden="true" />
                            </button>
                        </li>
                    {/each}
                </ul>
            {/if}
        </section>
    {:else}
        <!-- 商店（目录） -->
        <section class="group">
            <input
                class="search"
                type="text"
                bind:value={search}
                placeholder="搜索 widget…"
                aria-label="搜索 widget"
            />
            {#if filtered.length === 0}
                <div class="empty">{loading ? "加载中…" : "没有可安装的 widget"}</div>
            {:else}
                <ul class="list">
                    {#each filtered as w (w.id)}
                        {@const isInstalled = installed.has(w.id)}
                        <li class="row store-row">
                            <div class="store-info">
                                <span class="row-name">{w.name}</span>
                                {#if w.version}
                                    <span class="ver">v{w.version}</span>
                                {/if}
                                {#if w.author}
                                    <span class="author">{w.author}</span>
                                {/if}
                                {#if w.description}
                                    <p class="desc">{w.description}</p>
                                {/if}
                            </div>
                            <button
                                class="icon-btn"
                                class:accent={!isInstalled}
                                class:loading={installing === w.id}
                                disabled={isInstalled}
                                onclick={() => void askInstall(w)}
                                title={isInstalled ? "已安装" : "安装"}
                                aria-label={`安装 ${w.name}`}
                            >
                                <Download size={13} aria-hidden="true" />
                            </button>
                        </li>
                    {/each}
                </ul>
            {/if}
        </section>
    {/if}

    <!-- 权限确认遮罩 -->
    {#if pending}
        <div class="overlay">
            <div class="dialog">
                <h3>安装「{pending.name}」</h3>
                <p class="dialog-hint">该 widget 将申请以下权限：</p>
                <ul class="perms">
                    {#if pendingPermissions.length === 0}
                        <li>无（仅展示界面）</li>
                    {:else}
                        {#each pendingPermissions as p (p)}
                            <li>{PERMISSION_LABELS[p] ?? p}</li>
                        {/each}
                    {/if}
                </ul>
                <div class="dialog-actions">
                    <button class="btn" onclick={() => (pending = null)}>
                        取消
                    </button>
                    <button class="btn primary" onclick={() => void confirmInstall()}>
                        确认安装
                    </button>
                </div>
            </div>
        </div>
    {/if}
</Window>

<style>
    .source-bar {
        display: flex;
        align-items: center;
        gap: 6px;
    }

    .source,
    .search {
        flex: 1;
        min-width: 0;
        padding: 6px 8px;
        border: none;
        border-radius: 7px;
        background: var(--bg-input);
        color: var(--text);
        font-size: 12px;
        outline: none;
        transition: background 150ms ease;
    }

    .source:focus,
    .search:focus {
        background: var(--bg-input-focus);
    }

    .error {
        margin-top: 8px;
        font-size: 12px;
        color: #e06c6c;
    }

    .tabs {
        display: flex;
        gap: 4px;
        margin-top: 12px;
        padding: 3px;
        border-radius: 8px;
        background: var(--bg-sunken);
    }

    .tab {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        padding: 5px 0;
        border: none;
        border-radius: 6px;
        background: transparent;
        color: var(--text-muted);
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        transition:
            color 150ms ease,
            background 150ms ease;
    }

    .tab:hover {
        color: var(--text);
    }

    .tab.active {
        color: var(--text);
        background: var(--bg-panel);
        box-shadow: inset 0 0 0 1px var(--border);
    }

    .badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 16px;
        height: 16px;
        padding: 0 4px;
        border-radius: 999px;
        background: var(--accent-soft);
        color: var(--accent-text);
        font-size: 10px;
        line-height: 1;
    }

    .group {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin-top: 14px;
    }

    .group-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
    }

    .group-title {
        margin: 0;
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 0.05em;
        color: var(--text-muted);
    }

    .local-btn {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 4px 8px;
        border: none;
        border-radius: 6px;
        background: var(--accent-soft);
        color: var(--accent-text);
        font-size: 11px;
        font-weight: 500;
        cursor: pointer;
        transition:
            color 150ms ease,
            background 150ms ease;
    }

    .local-btn:hover {
        background: var(--accent-soft-2);
        color: var(--accent);
    }

    .list {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 6px;
    }

    .row {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 7px 9px;
        border-radius: 8px;
        background: var(--bg-2);
    }

    .store-row {
        align-items: flex-start;
    }

    .row-name {
        font-size: 13px;
        font-weight: 500;
        color: var(--text);
    }

    .ver {
        font-size: 11px;
        color: var(--text-dim);
        font-variant-numeric: tabular-nums;
    }

    .author {
        font-size: 11px;
        color: var(--text-dim);
    }

    .desc {
        margin: 2px 0 0;
        font-size: 12px;
        color: var(--text-muted);
        line-height: 1.4;
    }

    .store-info {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
        gap: 6px;
    }

    .spacer {
        flex: 1;
    }

    .empty {
        font-size: 12px;
        color: var(--text-muted);
        padding: 8px 0;
    }

    .icon-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        flex: none;
        width: 24px;
        height: 24px;
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

    .icon-btn:hover:not(:disabled) {
        color: var(--text);
        background: var(--hover-strong);
    }

    .icon-btn:disabled {
        opacity: 0.4;
        cursor: default;
    }

    .icon-btn.accent {
        color: var(--accent);
    }

    .icon-btn.danger:hover:not(:disabled) {
        color: #e06c6c;
    }

    .spin,
    .loading {
        animation: rotate 0.8s linear infinite;
    }

    @keyframes rotate {
        to {
            transform: rotate(360deg);
        }
    }

    /* 权限确认遮罩 */
    .overlay {
        position: absolute;
        inset: 0;
        z-index: 5;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(0, 0, 0, 0.45);
        border-radius: 12px;
    }

    .dialog {
        width: 260px;
        padding: 14px;
        border-radius: 10px;
        background: var(--bg-panel);
        box-shadow: inset 0 0 0 1px var(--border);
    }

    .dialog h3 {
        margin: 0 0 6px;
        font-size: 13px;
        font-weight: 600;
        color: var(--text);
    }

    .dialog-hint {
        margin: 0 0 6px;
        font-size: 12px;
        color: var(--text-muted);
    }

    .perms {
        margin: 0 0 12px;
        padding-left: 18px;
        font-size: 12px;
        color: var(--text);
        line-height: 1.7;
    }

    .dialog-actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
    }

    .btn {
        padding: 5px 12px;
        border: none;
        border-radius: 6px;
        background: var(--hover);
        color: var(--text);
        font-size: 12px;
        cursor: pointer;
        transition: background 150ms ease;
    }

    .btn:hover {
        background: var(--hover-strong);
    }

    .btn.primary {
        background: var(--accent);
        color: var(--on-accent);
    }

    .btn.primary:hover {
        background: var(--accent-2);
    }
</style>