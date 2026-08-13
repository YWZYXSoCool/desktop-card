/**
 * 复制反馈：跨组件共享的「复制后按钮短暂变 ✓」逻辑。
 *
 * 用 runes 返回响应式对象（与 store 同机制），供 UnitPage / BaseConvertPage /
 * ColorPage 等「复制一行文本 → 该行按钮变 ✓」的页面共用，消除逐字重复。
 * 每次调用创建独立实例（各页面各自持有），避免跨页串扰。
 */
export function createCopyFeedback() {
    /** 刚复制的行 key（显示临时 ✓ 反馈）；null 表示无反馈。 */
    let copiedKey = $state<string | null>(null);

    return {
        /** 当前处于 ✓ 反馈状态的行 key。 */
        get copiedKey() {
            return copiedKey;
        },
        /**
         * 复制文本到系统剪贴板；成功后该行按钮短暂变 ✓。
         * 剪贴板写入失败则静默忽略（不打断输入）。
         */
        async copy(text: string, key: string): Promise<void> {
            if (!text) return;
            try {
                await navigator.clipboard.writeText(text);
                copiedKey = key;
                setTimeout(() => {
                    if (copiedKey === key) copiedKey = null;
                }, 1200);
            } catch {
                // 写入失败静默
            }
        },
    };
}