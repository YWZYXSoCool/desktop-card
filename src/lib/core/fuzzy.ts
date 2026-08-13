/**
 * 子序列模糊打分：在 text 中按顺序找 needle 的每个字符，命中加 1 分、跳过减 1 分，
 * 连续命中得分更高。无匹配返回 -1。供 widget 搜索、词典建议等复用。
 */
export function fuzzyScore(text: string, needle: string): number {
    if (!needle) return 0;
    let score = 0;
    let skip = 0;
    let from = 0;
    const lower = text.toLowerCase();
    const nl = needle.toLowerCase();
    for (let i = 0; i < nl.length; i++) {
        const idx = lower.indexOf(nl[i], from);
        if (idx < 0) return -1;
        if (idx > from) skip += 1;
        score += 1;
        from = idx + 1;
    }
    return score - skip;
}