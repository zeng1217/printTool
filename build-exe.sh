#!/usr/bin/env bash
# 抖店监听打单 —— Windows exe 云端打包助手（GitHub Actions）
#
# 用法：
#   ./build-exe.sh                 提交+推送+递增tag，触发云端打包
#   ./build-exe.sh "改了打印逻辑"   自定义提交说明
#   ./build-exe.sh clean           删除所有【失败】的构建运行和对应 tag，只留成功的
#   GH_TOKEN=ghp_xxx ./build-exe.sh   用 token 推送（clean 也需要 token 调 API）
#
# 说明：Mac 无法本地打 exe，本脚本只负责推代码/打 tag 触发云端构建，
#      真正打包在云端 Windows 机器跑，完成后到 Actions 的 Artifacts 下载。

set -e

cd "$(dirname "$0")"

OWNER="zeng1217"
REPO="printTool"
BRANCH="main"
API="https://api.github.com/repos/${OWNER}/${REPO}"
REMOTE_URL="https://github.com/${OWNER}/${REPO}.git"

# 自动读取本地 .token（若未通过环境变量提供）。.token 已被 .gitignore 忽略，不会提交泄露。
if [ -z "${GH_TOKEN:-}" ] && [ -f ".token" ]; then
  GH_TOKEN="$(head -n1 .token | tr -d ' \t\r\n')"
  export GH_TOKEN
fi

# 解析一个可用于 REST API 的 token：优先 GH_TOKEN 环境变量，否则交互输入
resolve_token() {
  if [ -n "${GH_TOKEN:-}" ]; then
    echo "$GH_TOKEN"
  else
    echo "      （API 操作需要 token，去 https://github.com/settings/tokens 生成，勾 repo+workflow）" >&2
    read -r -s -p "      粘贴 GitHub Token: " tk >&2; echo >&2
    echo "$tk"
  fi
}

build() {
  git config credential.helper osxkeychain
  MSG="${1:-chore: 重新打包 Windows exe $(date '+%Y-%m-%d %H:%M')}"

  echo "==> 1/4 提交改动"
  git add -A
  git commit -m "$MSG" || echo "   （无新改动，跳过提交）"

  PUSH_URL="$REMOTE_URL"
  if [ -n "${GH_TOKEN:-}" ]; then
    PUSH_URL="https://${OWNER}:${GH_TOKEN}@github.com/${OWNER}/${REPO}.git"
  fi

  echo "==> 2/4 推送 ${BRANCH}"
  if [ -n "${GH_TOKEN:-}" ]; then
    git -c credential.helper= push "$PUSH_URL" "$BRANCH"
  else
    git push "$REMOTE_URL" "$BRANCH"
  fi

  echo "==> 3/4 计算并推送新 tag"
  LAST_TAG=$( { git tag --list 'v*'; git ls-remote --tags "$REMOTE_URL" 2>/dev/null | sed -E 's#.*refs/tags/##; s#\^{}##'; } 2>/dev/null | grep -E '^v[0-9]' | sort -V | tail -1 )
  if [ -z "$LAST_TAG" ]; then
    NEW_TAG="v0.1.0"
  else
    PREFIX=$(echo "$LAST_TAG" | sed -E 's/\.[0-9]+$//')
    NUM=$(echo "$LAST_TAG"  | grep -oE '[0-9]+$')
    NEW_TAG="${PREFIX}.$((NUM + 1))"
  fi
  echo "   上一个 tag: ${LAST_TAG:-无}  →  新 tag: ${NEW_TAG}"
  git tag "$NEW_TAG"
  if [ -n "${GH_TOKEN:-}" ]; then
    git -c credential.helper= push "$PUSH_URL" "$NEW_TAG"
  else
    git push "$REMOTE_URL" "$NEW_TAG"
  fi

  echo "==> 4/4 完成，云端开始构建"
  echo
  echo "去这里看进度 / 下载 exe（约 5~8 分钟）："
  echo "  https://github.com/${OWNER}/${REPO}/actions"
  echo "构建变绿后 → Artifacts → 下载 doudian-print-windows → 解压得到 -setup.exe"
}

clean() {
  local tk; tk="$(resolve_token)"
  echo "==> 拉取构建运行列表..."
  # 用 python3 解析：列出所有失败运行(含 id 与对应 tag/branch)，保留成功的
  curl -s -H "Authorization: Bearer ${tk}" "${API}/actions/runs?per_page=100" \
  | python3 -c "
import sys, json
d = json.load(sys.stdin)
fails = [r for r in d.get('workflow_runs', []) if r.get('conclusion') == 'failure']
oks   = [r for r in d.get('workflow_runs', []) if r.get('conclusion') == 'success']
for r in oks:
    print('KEEP-RUN', r['id'], r.get('head_branch'), file=sys.stderr)
for r in fails:
    print('RUN', r['id'])
    hb = r.get('head_branch') or ''
    if hb.startswith('v'):
        print('TAG', hb)
" > /tmp/clean_list.txt 2>/tmp/clean_keep.txt

  echo "   将保留的成功运行："
  cat /tmp/clean_keep.txt | sed 's/^/     /' || true

  echo "==> 删除失败构建运行..."
  while read -r kind id; do
    [ "$kind" = "RUN" ] || continue
    code=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE -H "Authorization: Bearer ${tk}" "${API}/actions/runs/${id}")
    echo "   删除 run ${id} -> HTTP ${code}"
  done < /tmp/clean_list.txt

  echo "==> 删除失败运行对应的 tag（远程+本地）..."
  while read -r kind name; do
    [ "$kind" = "TAG" ] || continue
    git push "$REMOTE_URL" --delete "$name" >/dev/null 2>&1 && echo "   远程删 tag ${name}" || echo "   远程无 ${name}（跳过）"
    git tag -d "$name" >/dev/null 2>&1 && echo "   本地删 tag ${name}" || true
  done < /tmp/clean_list.txt

  rm -f /tmp/clean_list.txt /tmp/clean_keep.txt
  echo
  echo "==> 清理完成，现在只剩成功的构建记录和 tag。"
}

# 命令分发
if [ "${1:-}" = "clean" ]; then
  clean
else
  build "$@"
fi
