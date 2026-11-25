#!/usr/bin/env bash
# ==============================================================================
# config-guard.sh — ConfigChange hook(設定変更の監査 + 防御層の無効化を阻止)
#
# 役割:
#   1. セッション中の設定ファイル変更(user / project / local settings、skills)を
#      testreport/config-changes/<session>.jsonl に記録する(可観測性)
#   2. project / local settings の変更が 3 層防御(constitution ⑤)を弱める場合は
#      exit 2 で「その変更をセッションに適用させない」:
#        - disableAllHooks: true(フック群の一括停止)
#        - settings.local.json に permissions.deny を定義(共有 deny の上書き。空配列も含む)
#        - .claude/settings.json から Layer 1 のブロック系フック
#          (safety-check.sh / protect-files.sh)が消える、またはその登録から
#          onFailure: block が消える(フェイルオープン化)
#
# 公式仕様:
#   - ConfigChange は exit 2 か {"decision":"block"} で変更の適用を止められる
#     (policy_settings だけは止められない)。systemMessage / continue は捨てられ、
#     ブロックしても Claude にもユーザーにも文言は出ない。だから理由はログに残す
#   - 入力: {"hook_event_name":"ConfigChange","source":"project_settings|local_settings|
#            user_settings|policy_settings|skills","file_path":"..."}
#
# Profile 切替: $BLUEPRINT_HOOK_PROFILE
#   - minimal:  何もしない(exit 0)
#   - standard / strict: 記録し、上記の弱体化はブロック(constitution ⑤ は profile で緩めない)
#
# Policy: fail-open(jq 不在・パース失敗・ファイル不在は exit 0)
# ==============================================================================

set -uo pipefail

PROFILE="${BLUEPRINT_HOOK_PROFILE:-standard}"
[[ "$PROFILE" == "minimal" ]] && exit 0
command -v jq &>/dev/null || exit 0

INPUT="$(cat 2>/dev/null || true)"
[[ -z "$INPUT" ]] && exit 0

PROJECT_DIR="${BLUEPRINT_PROJECT_DIR:-${CLAUDE_PROJECT_DIR:-$(pwd)}}"
SOURCE="$(printf '%s' "$INPUT" | jq -r '.source // "unknown"' 2>/dev/null || echo unknown)"
FILE="$(printf '%s' "$INPUT" | jq -r '.file_path // empty' 2>/dev/null || true)"
SID="$(printf '%s' "$INPUT" | jq -r '.session_id // "unknown"' 2>/dev/null || echo unknown)"
SID="$(printf '%s' "$SID" | tr -c 'A-Za-z0-9._-' '_' | cut -c1-8)"
[[ -z "$SID" ]] && SID="unknown"

# ── 弱体化の判定(project / local settings のときだけ。ファイルが読めなければ通す)──
VIOLATIONS=()
if [[ ( "$SOURCE" == "project_settings" || "$SOURCE" == "local_settings" ) && -n "$FILE" && -f "$FILE" ]]; then
    if jq -e . "$FILE" >/dev/null 2>&1; then
        if jq -e '.disableAllHooks == true' "$FILE" >/dev/null 2>&1; then
            VIOLATIONS+=("disableAllHooks: true(フック群の一括停止 — constitution ⑤)")
        fi
        if [[ "$SOURCE" == "local_settings" ]] && jq -e 'getpath(["permissions","deny"]) != null' "$FILE" >/dev/null 2>&1; then
            VIOLATIONS+=("settings.local.json の permissions.deny(共有 deny の上書き。空配列でも無効化される)")
        fi
        if [[ "$SOURCE" == "project_settings" ]]; then
            for guard in safety-check.sh protect-files.sh; do
                if ! jq -e --arg g "$guard" '[.hooks.PreToolUse[]?.hooks[]?.command // "" | select(contains($g))] | length > 0' "$FILE" >/dev/null 2>&1; then
                    VIOLATIONS+=("PreToolUse から $guard が消えています(Layer 1 のブロック系フック)")
                elif ! jq -e --arg g "$guard" '[.hooks.PreToolUse[]?.hooks[]? | select((.command // "") | contains($g)) | select(.onFailure == "block")] | length > 0' "$FILE" >/dev/null 2>&1; then
                    VIOLATIONS+=("$guard の登録から onFailure: block が消えています(フックが起動できないとき操作が素通りする)")
                fi
            done
        fi
    fi
fi

# ── 記録(gitignore 対象の testreport/ 配下)────────────────────────────────
LOG_DIR="$PROJECT_DIR/testreport/config-changes"
if mkdir -p "$LOG_DIR" 2>/dev/null; then
    TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    DECISION="allow"
    [[ ${#VIOLATIONS[@]} -gt 0 ]] && DECISION="block"
    printf '%s\n' "${VIOLATIONS[@]:-}" | jq -R . | jq -s -c --arg ts "$TS" --arg src "$SOURCE" --arg file "$FILE" --arg d "$DECISION" \
        '{ts: $ts, source: $src, file: $file, decision: $d, violations: (map(select(length > 0)))}' \
        >> "$LOG_DIR/$SID.jsonl" 2>/dev/null || true
fi

if [[ ${#VIOLATIONS[@]} -gt 0 ]]; then
    {
        echo "config-guard: 設定変更をブロックしました($SOURCE: $FILE)"
        for v in "${VIOLATIONS[@]}"; do echo "  - $v"; done
        echo "  詳細: testreport/config-changes/$SID.jsonl。防御層を変えるなら PR で settings.json を直し、validate-harness.sh を通すこと"
    } >&2
    exit 2
fi

exit 0
