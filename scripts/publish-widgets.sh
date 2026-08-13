#!/usr/bin/env bash
# 把 widgets/ 发布源同步推送到 YWZYXSoCool/desktop-card-widgets 仓库。
#
# 用法：
#   bash scripts/publish-widgets.sh
#   npm run publish:widgets
#
# 原理：维护一个被 gitignore 的发布工作区 .widgets-dist（远程仓库的本地镜像），
# 每次把 widgets/ 内容整目录同步进去，有变更则提交并 push 到 main 分支。
set -euo pipefail

REPO_URL="https://github.com/YWZYXSoCool/desktop-card-widgets.git"
BRANCH="main"

# 主项目根目录（脚本位于 scripts/ 下）
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$ROOT/widgets"
WORK="$ROOT/.widgets-dist"

[ -d "$SRC" ] || { echo "错误：找不到 $SRC" >&2; exit 1; }

# 1) 准备发布工作区：不存在则从远程克隆（空仓库也可），存在则对齐远程基线
if [ ! -d "$WORK/.git" ]; then
    echo "==> 初始化发布工作区 $WORK"
    rm -rf "$WORK"
    git clone --quiet "$REPO_URL" "$WORK"
    cd "$WORK"
    git branch -M "$BRANCH"
else
    cd "$WORK"
    git remote set-url origin "$REPO_URL"
    git fetch --quiet origin
    git reset --quiet --hard "origin/$BRANCH" 2>/dev/null || true
fi

# 2) 同步 widgets/ 内容：清空工作区（保留 .git），复制 widgets/ 全部文件
echo "==> 同步 widgets/ 内容"
find . -mindepth 1 -not -path "./.git" -not -path "./.git/*" -delete
cp -r "$SRC"/. .

git add -A

# 3) 有变更才提交（避免空提交）
if git diff --cached --quiet; then
    echo "==> 无变更，跳过提交"
else
    git config user.name "YWZYXSoCool"
    git config user.email "ywzyxsocool@qq.com"
    git commit --quiet -m "chore: 同步 widgets 源 $(date +%F)"
    echo "==> 已提交"
fi

# 4) 推送
echo "==> 推送到 $REPO_URL"
git push --quiet origin "$BRANCH"
echo "==> 完成"