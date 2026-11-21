#!/usr/bin/env bash
# ==============================================================================
# post-compact-restore.sh — PostCompact hook
#
# 役割: コンパクト完了後に生成されたサマリを testreport/ に保全する(監査・復旧用)。
#
# 公式仕様上の制約:
#   PostCompact は decision control を一切持たない(additionalContext も不可)。
#   side effect(ログ・外部状態更新)専用のイベントである。
#   「コンパクト後にルールが薄れる」問題は、SessionStart フック(source == "compact")が
#   session-start.sh で中核ルールを即座に再注入して解決する(公式パターン)。
#
# Input:  JSON via stdin
#         {"hook_event_name":"PostCompact","trigger":"manual|auto","compact_summary":"..."}
# Output: なし(stdout は debug log 止まり)。副作用のみ:
#         - testreport/transcripts/<session>-compact-<ts>.md  … サマリ保全
#
# Policy: fail-open(何が失敗しても exit 0。セッションを止めない)
# ==============================================================================

set -uo pipefail

PROFILE="${BLUEPRINT_HOOK_PROFILE:-standard}"
[[ "$PROFILE" == "minimal" ]] && exit 0

PROJECT_DIR="${BLUEPRINT_PROJECT_DIR:-${CLAUDE_PROJECT_DIR:-$(pwd)}}"
OUT_DIR="$PROJECT_DIR/testreport/transcripts"

# セッション ID をサニタイズ(パストラバーサル防止)
SESSION_ID_RAW="${BLUEPRINT_SESSION_ID:-${CLAUDE_SESSION_ID:-$(date +%Y%m%d)}}"
SESSION_ID="$(printf '%s' "$SESSION_ID_RAW" | tr -c 'A-Za-z0-9._-' '_' | cut -c1-64)"
[[ -z "$SESSION_ID" ]] && SESSION_ID="$(date +%Y%m%d)"

INPUT="$(cat 2>/dev/null || true)"
[[ -z "$INPUT" ]] && exit 0

TRIGGER="unknown"
SUMMARY=""
if command -v jq &>/dev/null; then
    TRIGGER="$(printf '%s' "$INPUT" | jq -r '.trigger // "unknown"' 2>/dev/null || echo unknown)"
    SUMMARY="$(printf '%s' "$INPUT" | jq -r '.compact_summary // empty' 2>/dev/null || true)"
fi

mkdir -p "$OUT_DIR" 2>/dev/null || exit 0

TS="$(date -u +%Y%m%dT%H%M%SZ)"
{
    echo "# Compact Summary — $SESSION_ID ($TRIGGER)"
    echo
    echo "- generated_at: $TS"
    echo "- trigger: $TRIGGER"
    echo
    if [[ -n "$SUMMARY" ]]; then
        echo "$SUMMARY"
    else
        echo "_(compact_summary を取得できませんでした。jq 未導入の可能性があります)_"
    fi
} > "$OUT_DIR/$SESSION_ID-compact-$TS.md" 2>/dev/null || true

exit 0
