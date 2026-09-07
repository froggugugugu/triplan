#!/usr/bin/env bash
# ==============================================================================
# user-prompt-submit.sh — UserPromptSubmit hook (2026 spec)
#
# 役割: ユーザー入力を Claude が処理する前に検査し、機密語・誤投稿を検出する。
# Profile 切替: $BLUEPRINT_HOOK_PROFILE で挙動切替
#   - minimal:  パススルー(検査スキップ)
#   - standard: 機密パターン検出のみ警告(non-blocking、既定)
#   - strict:   stdout に JSON {"decision":"block"} を出して差し戻し(公式仕様、exit 0)
#
# Input:  JSON via stdin {"prompt": "...", "session_id": "..."}
# Output:
#   exit 0 + plain stdout = additional context を Claude に注入
#   exit 0 + JSON {"decision":"block","reason":"..."} = プロンプトを差し戻し
#                                                       (2026 仕様は exit 2 ではなく exit 0 + JSON)
#
# Policy: fail-open — jq 未導入環境やパース失敗時は素通り(壊さない)。
# ==============================================================================

set -uo pipefail

PROFILE="${BLUEPRINT_HOOK_PROFILE:-standard}"
[[ "$PROFILE" == "minimal" ]] && exit 0

# jq が無ければ機密検出を諦めて通過(fail-open)。
# 脆弱な sed フォールバックは誤検出/見逃しのリスクが高いため使わない。
command -v jq &>/dev/null || exit 0

INPUT="$(cat 2>/dev/null || true)"
PROMPT="$(printf '%s' "$INPUT" | jq -r '.prompt // empty' 2>/dev/null || true)"
[[ -z "$PROMPT" ]] && exit 0

# 機密パターン(誤投稿リスク高い)
SECRET_PATTERNS=(
    'AKIA[0-9A-Z]{16}'                    # AWS Access Key ID
    'sk-[a-zA-Z0-9]{32,}'                  # OpenAI / Anthropic 形式
    'ghp_[a-zA-Z0-9]{36}'                                  # GitHub PAT (legacy)
    'github_pat_[A-Za-z0-9]{22}_[A-Za-z0-9]{59}'           # GitHub PAT (fine-grained)
    'gho_[a-zA-Z0-9]{36}'                                  # GitHub OAuth Token
    'xox[baprs]-[a-zA-Z0-9-]+'             # Slack Token
    '-----BEGIN [A-Z ]+PRIVATE KEY-----'   # PEM private key
)

DETECTED=""
for pat in "${SECRET_PATTERNS[@]}"; do
    if printf '%s' "$PROMPT" | grep -qE -- "$pat"; then
        DETECTED="$pat"
        break
    fi
done

if [[ -n "$DETECTED" ]]; then
    case "$PROFILE" in
        strict)
            # 公式仕様: stdout に block JSON を出して exit 0(プロンプト差し戻し)
            printf '{"decision":"block","reason":"プロンプトに機密値の可能性のあるパターン (%s) が含まれます。値を [REDACTED] に置換して再送してください。"}\n' "$DETECTED"
            exit 0
            ;;
        standard|*)
            # standard 警告は **stderr** に出す。stdout に出すと Claude のプロンプトに
            # 注入されるため(2026 仕様)、人間向けフィードバックとして stderr が正しい。
            printf '⚠️  user-prompt-submit hook: 機密パターン (%s) を検出しました。プロンプト内のシークレットを伏字化することを推奨します。\n' "$DETECTED" >&2
            exit 0
            ;;
    esac
fi

exit 0
