#!/usr/bin/env bash
# commit.sh — 交互式 git commit 提交助手
# 用法: sh scripts/commit.sh   或   ./scripts/commit.sh
# 遵循 commit-lint 格式：<emoji> <type>: <中文描述> [(TRACK-ID)]
# 提交时仍会经过 .git/hooks/commit-msg 校验。

set -u

# 定位仓库根目录
ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || {
  echo "❌ 当前目录不在 git 仓库中" >&2
  exit 1
}
cd "$ROOT" || exit 1

# ── 1. 显示工作区状态 ──────────────────────────────────────
echo ""
echo "━━━━ 当前改动 ━━━━"
git status --short
echo ""

if [ -z "$(git status --porcelain)" ]; then
  echo "✅ 工作区干净，没有需要提交的改动。"
  exit 0
fi

# ── 2. 是否暂存全部 ────────────────────────────────────────
read -r -p "是否暂存全部改动？[Y/n] " stage_all
stage_all="${stage_all:-Y}"
case "$stage_all" in
  [Nn]*) echo "→ 跳过暂存，使用当前已暂存的内容（可先手动 git add 选择）" ;;
  *) git add -A && echo "→ 已暂存全部改动" ;;
esac

# ── 3. 暂存区概览 ──────────────────────────────────────────
if [ -z "$(git diff --cached --name-only)" ]; then
  echo "⚠️  暂存区为空，无可提交内容。请先 git add 需要提交的文件。" >&2
  exit 1
fi
echo ""
echo "━━━━ 待提交内容 ━━━━"
git diff --cached --stat
echo ""

# ── 4. 选择提交类型 ────────────────────────────────────────
echo "━━━━ 选择提交类型 ━━━━"
cat <<'EOF'
  1) ✨ feat       新功能
  2) 🐛 fix        修复bug
  3) ♻️ refactor   重构
  4) ✅ test       测试
  5) 📝 docs       文档
  6) 🔧 chore      构建/工具/依赖
  7) ⚡ perf       性能优化
  8) 💄 style      代码风格/格式
EOF
read -r -p "输入编号 [1-8]：" type_no
case "$type_no" in
  1) emoji_type="✨ feat" ;;
  2) emoji_type="🐛 fix" ;;
  3) emoji_type="♻️ refactor" ;;
  4) emoji_type="✅ test" ;;
  5) emoji_type="📝 docs" ;;
  6) emoji_type="🔧 chore" ;;
  7) emoji_type="⚡ perf" ;;
  8) emoji_type="💄 style" ;;
  *) echo "❌ 无效编号：$type_no" >&2; exit 1 ;;
esac

# ── 5. 描述 ────────────────────────────────────────────────
while :; do
  read -r -p "描述（中文，动词开头，句末不加标点）： " desc
  case "$desc" in
    "") echo "⚠️  描述不能为空" ;;
    *[.。！!]) echo "⚠️  描述句末不要加标点" ;;
    *) break ;;
  esac
done

# ── 6. 可选 track 任务 ID ─────────────────────────────────
read -r -p "关联任务 ID（可选，如 JIRA-123，回车跳过）：" track
track="$(printf '%s' "$track" | tr -d '[:space:]')"

# ── 7. 组装首行 ────────────────────────────────────────────
first_line="${emoji_type}: ${desc}"
[ -n "$track" ] && first_line="${first_line} (${track})"

# ── 8. 预览确认 ────────────────────────────────────────────
echo ""
echo "━━━━ 提交预览 ━━━━"
printf '%s\n' "$first_line"
echo ""
read -r -p "确认提交？[Y/n] " confirm
confirm="${confirm:-Y}"
case "$confirm" in
  [Yy]*)
    git commit -m "$first_line"
    ;;
  *)
    echo "→ 已取消，改动保留在暂存区。"
    exit 0
    ;;
esac
