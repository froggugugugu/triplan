#!/usr/bin/env bash
# ==============================================================================
# permission-denied-log.sh — PermissionDenied / PermissionRequest hook(観測専用)
#
# auto mode(v2.1.283 以降は全プラン・全プロバイダで既定の権限モード)の分類器が拒否した
# ツール呼び出しを JSONL に記録する。拒否履歴は次の改善入力になる:
#   - 繰り返し拒否される正当な操作 → settings.local.json の allow ルールに追加
#   - 組織のインフラが「外部」扱いされる → ~/.claude/settings.json の
#     autoMode.environment を /auto-mode-setup で整備
#
# 引数 request(PermissionRequest)では「権限ダイアログが出た / 無人実行で自動拒否された」呼び出しを
# kind=request で同じファイルに記録する。dontAsk の CI や background subagent で何が止まったかは
# この記録でしか分からない(PermissionDenied は auto mode の分類器の拒否だけ)。
#
# 決定制御はしない(retry も返さない)。記録のみ。
#
# Input:  JSON via stdin
#         {"hook_event_name":"PermissionDenied","tool_name":"Bash",
#          "tool_input":{...},"reason":"Blocked by classifier","permission_mode":"auto"}
# Output: testreport/denials/<session>.jsonl に 1 行追記(gitignore 対象)
# Policy: fail-open(何が失敗しても exit 0)
# ==============================================================================

set -uo pipefail

MODE="${1:-denied}"   # denied = PermissionDenied / request = PermissionRequest
PROFILE="${BLUEPRINT_HOOK_PROFILE:-standard}"
[[ "$PROFILE" == "minimal" ]] && exit 0
command -v jq &>/dev/null || exit 0

INPUT="$(cat 2>/dev/null || true)"
[[ -z "$INPUT" ]] && exit 0

LOG_DIR="${BLUEPRINT_PROJECT_DIR:-${CLAUDE_PROJECT_DIR:-.}}/testreport/denials"
mkdir -p "$LOG_DIR" 2>/dev/null || exit 0

SID="$(printf '%s' "$INPUT" | jq -r '.session_id // "unknown"' 2>/dev/null)"
SID="${SID:0:8}"
TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# tool_input は 500 文字で切り詰める(秘密値の長期保存を避ける)
printf '%s' "$INPUT" | jq -c --arg ts "$TS" --arg kind "$MODE" '{
    ts: $ts,
    kind: $kind,
    tool: (.tool_name // "unknown"),
    reason: (.reason // ""),
    permission_mode: (.permission_mode // ""),
    suggestions: ((.permission_suggestions // []) | length),
    input: ((.tool_input // {}) | tostring | .[0:500])
}' >> "$LOG_DIR/$SID.jsonl" 2>/dev/null

exit 0
