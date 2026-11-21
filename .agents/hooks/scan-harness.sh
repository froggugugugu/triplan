#!/usr/bin/env bash
# ==============================================================================
# scan-harness.sh — PreToolUse(Skill) / UserPromptExpansion / FileChanged hook — Self-SAST + 高リスク skill 抑止 + constitution 監視
#
# 役割:
#   1. ハーネス自身(.claude/, .mcp.json*, settings.json) の secret/逸脱検出
#   2. constitution.md の hash 監視(改竄検出)
#   3. 高リスク skill(deploy 系)を tool_input.skill で実効ブロック
#      ↑ settings.json の Skill(skill:deploy*) 等の deny と二重化した層。
#        deny は絶対、本フックは profile で緩められる運用層として機能する。
#
# Profile 切替: $BLUEPRINT_HOOK_PROFILE
#   - minimal:  通過のみ
#   - standard: 警告のみ(non-blocking、既定)
#   - strict:   検出時/高リスク skill 起動時にブロック
#
# Input:  JSON via stdin — PreToolUse {"tool_input":{"skill":...}} / UserPromptExpansion {"command_name":...} /
#         FileChanged {"file_path":...}(引数 filechanged でも同じ経路)
# Output: exit 0 = allow / exit 2 = block (strict or 高リスク skill)
# Policy: fail-open(パース失敗時は通過)
# ==============================================================================

set -uo pipefail

# ── Claude へ所見を届けるための共通エミッタ ────────────────────────────
# 公式仕様: exit 0 時の stderr は debug log にしか残らず、Claude にもユーザーにも
# 届かない。Claude に伝えるには stdout に hookSpecificOutput.additionalContext を出す。
emit_context() {
    local event="$1"; shift
    local text="$*"
    [[ -z "$text" ]] && return 0
    if command -v jq &>/dev/null; then
        jq -nc --arg e "$event" --arg t "$text" \
            '{hookSpecificOutput:{hookEventName:$e, additionalContext:$t}}'
    else
        local esc
        esc="$(printf '%s' "$text" | sed 's/\\/\\\\/g; s/"/\\"/g' | awk '{printf "%s\\n", $0}')"
        printf '{"hookSpecificOutput":{"hookEventName":"%s","additionalContext":"%s"}}\n' "$event" "$esc"
    fi
}

PROFILE="${BLUEPRINT_HOOK_PROFILE:-standard}"
[[ "$PROFILE" == "minimal" ]] && exit 0

INPUT="$(cat 2>/dev/null || true)"
MODE="${1:-}"

# ── 0. イベント判定(PreToolUse: Skill / UserPromptExpansion / FileChanged)──
# `/skill` を直接入力すると PreToolUse(Skill) は通らない(公式仕様)。
# UserPromptExpansion で同じ判定をかけ、FileChanged では constitution.md のハッシュだけを再検証する。
EVENT=""
if command -v jq &>/dev/null; then
    EVENT=$(printf '%s' "$INPUT" | jq -r '.hook_event_name // empty' 2>/dev/null)
else
    EVENT=$(printf '%s' "$INPUT" | sed -n 's/.*"hook_event_name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)
fi
[[ "$MODE" == "filechanged" ]] && EVENT="FileChanged"

PROJECT="${BLUEPRINT_PROJECT_DIR:-${CLAUDE_PROJECT_DIR:-.}}"

# クロスプラットフォーム sha256: GNU coreutils → shasum (macOS) の順でフォールバック
sha256_of() {
    if command -v sha256sum &>/dev/null; then
        sha256sum "$1" | cut -d' ' -f1
    elif command -v shasum &>/dev/null; then
        shasum -a 256 "$1" | cut -d' ' -f1
    else
        echo ""  # どちらも無い → 後段で fail-open
    fi
}

# constitution.md のハッシュ照合。戻り値 0 = 不一致(改変あり)/ 1 = 一致 or 検査不能
constitution_drift() {
    local const="$PROJECT/constitution.md" hash_file="$PROJECT/.agents/.constitution.sha256" current expected
    [[ -f "$const" && -f "$hash_file" ]] || return 1
    current=$(sha256_of "$const")
    expected=$(cat "$hash_file")
    [[ -n "$current" && "$current" != "$expected" ]]
}

# ── 0a. FileChanged(constitution.md の監視)— ブロック不可。stderr(ユーザー向け)+ 記録のみ ──
# protect-files.sh は Edit / Write を止めるが、Bash の sed -i や外部エディタの変更は通る。
# ファイル監視で検知し、testreport/config-changes/ に残す(config-guard.sh と同じ記録先)。
if [[ "$EVENT" == "FileChanged" ]]; then
    if constitution_drift; then
        echo "🛡️  scan-harness: constitution.md がディスク上で変更されました(ハッシュ不一致)。Edit ツール以外(sed -i・外部エディタ等)による変更です。意図的なら .agents/.constitution.sha256 を更新し、意図しないなら git diff constitution.md で確認してください" >&2
        LOG_DIR="$PROJECT/testreport/config-changes"
        if command -v jq &>/dev/null && mkdir -p "$LOG_DIR" 2>/dev/null; then
            SID="$(printf '%s' "$INPUT" | jq -r '.session_id // "unknown"' 2>/dev/null)"
            SID="$(printf '%s' "$SID" | tr -c 'A-Za-z0-9._-' '_' | cut -c1-8)"
            jq -nc --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --arg file "$PROJECT/constitution.md" \
                '{ts: $ts, source: "file_watch", file: $file, decision: "warn", violations: ["constitution.md hash mismatch"]}' \
                >> "$LOG_DIR/${SID:-unknown}.jsonl" 2>/dev/null || true
        fi
    fi
    exit 0
fi

# ── 1. skill 名の抽出(PreToolUse: tool_input.skill / UserPromptExpansion: command_name)──
SKILL=""
# Codex は skill をツール呼び出しではなくプロンプト中の `$name` で起動する。UserPromptSubmit では
# 最初の `$name` を skill 名として扱い、言及が無いプロンプトは検査しない(毎ターン走らせない)
if [[ "$EVENT" == "UserPromptSubmit" ]]; then
    command -v jq &>/dev/null || exit 0
    SKILL=$(printf '%s' "$INPUT" | jq -r '.prompt // empty' 2>/dev/null | grep -oE '(^|[[:space:]])\$[a-z][a-z0-9-]*' | head -1 | tr -d '[:space:]$')
    [[ -n "$SKILL" ]] || exit 0
elif [[ "$EVENT" == "UserPromptExpansion" ]]; then
    if command -v jq &>/dev/null; then
        EXP_TYPE=$(printf '%s' "$INPUT" | jq -r '.expansion_type // "slash_command"' 2>/dev/null)
        [[ "$EXP_TYPE" == "slash_command" ]] || exit 0   # MCP prompt の展開は対象外
        SKILL=$(printf '%s' "$INPUT" | jq -r '.command_name // empty' 2>/dev/null)
    else
        SKILL=$(printf '%s' "$INPUT" | sed -n 's/.*"command_name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)
    fi
    SKILL="${SKILL##*:}"   # plugin:name → name
elif command -v jq &>/dev/null; then
    SKILL=$(printf '%s' "$INPUT" | jq -r '.tool_input.skill // .tool_input.name // empty' 2>/dev/null)
else
    # jq 未導入時: deploy ブロックが無効化されないよう sed でフォールバック抽出
    SKILL=$(printf '%s' "$INPUT" | sed -n 's/.*"skill"\s*:\s*"\([^"]*\)".*/\1/p' | head -1)
    [[ -z "$SKILL" ]] && SKILL=$(printf '%s' "$INPUT" | sed -n 's/.*"name"\s*:\s*"\([^"]*\)".*/\1/p' | head -1)
fi

# ── 2. 高リスク skill 判定(常に実施、profile 非依存) ─────────────────
case "$SKILL" in
    # 注: `prod-*` は false-positive(prod-test, prod-validate 等)が多いため除外、
    #     明示的な deploy / production プレフィックスのみブロック対象とする
    deploy|deploy-*|*-deploy|production-*|*-production)
        echo "🛡️  scan-harness: 高リスク skill '$SKILL' は実効ブロックされます" >&2
        echo "  理由: 本テンプレートは deploy/production 系 skill を deny 対象としています(settings.json の Skill(skill:...) deny と二重化)" >&2
        echo "  許可するには: settings.local.json で BLUEPRINT_HOOK_PROFILE=minimal を設定" >&2
        exit 2
        ;;
esac

# ── 3. 重い SAST は constitution チェックのみ毎回実施。secret スキャンは
#     一定の skill のみ(security-scan, legal-check, review-fix の前)に絞る ─
NEED_FULL_SCAN=0
case "$SKILL" in
    security-scan|legal-check|review-fix|architecture|prd|"")
        NEED_FULL_SCAN=1
        ;;
esac

ISSUES=()

# 3a. constitution.md hash 監視(常に実施 — 軽量、決定論的)
if constitution_drift; then
    ISSUES+=("constitution.md が変更されています(ハッシュ不一致)。意図的な変更なら .agents/.constitution.sha256 を更新してください")
fi

# 3b. settings.local.json が deny を上書きしていないか(常に実施 — 軽量)
LOCAL="$PROJECT/.claude/settings.local.json"
if [[ -f "$LOCAL" ]] && command -v jq &>/dev/null; then
    # deny キーが存在する場合は警告(空配列 [] も deny ルールを上書きするため危険)
    if jq -e 'getpath(["permissions","deny"]) != null' "$LOCAL" >/dev/null 2>&1; then
        ISSUES+=("settings.local.json に permissions.deny が定義されています(空配列 [] は deny ルールを無効化します。共有 settings.json で管理すべき)")
    fi
fi

# 3c. Secret パターン検出(NEED_FULL_SCAN=1 のときのみ実施 — 重い)
# 注: \b 単語境界は BSD grep で挙動が異なるため使用しない(GNU/BSD 両対応のため)
if [[ "$NEED_FULL_SCAN" -eq 1 && -d "$PROJECT/.agents" ]]; then
    SCAN_TARGETS=(
        "$PROJECT/.agents"
        "$PROJECT/.claude"
        "$PROJECT/.codex"
        "$PROJECT/CLAUDE.md"
        "$PROJECT/AGENTS.md"
        "$PROJECT/.mcp.json"
        "$PROJECT/.mcp.json.template"
    )
    for target in "${SCAN_TARGETS[@]}"; do
        [[ -e "$target" ]] || continue
        if grep -rEq -- 'AKIA[0-9A-Z]{16}' "$target" 2>/dev/null; then
            ISSUES+=("AWS Access Key ID パターンが ${target} に含まれます")
        fi
        # GitHub PAT(legacy ghp_ + fine-grained github_pat_ 両形式)
        if grep -rEq -- 'ghp_[a-zA-Z0-9]{36}' "$target" 2>/dev/null; then
            ISSUES+=("GitHub PAT (legacy ghp_) パターンが ${target} に含まれます")
        fi
        if grep -rEq -- 'github_pat_[A-Za-z0-9]{22}_[A-Za-z0-9]{59}' "$target" 2>/dev/null; then
            ISSUES+=("GitHub PAT (fine-grained github_pat_) パターンが ${target} に含まれます")
        fi
        if grep -rEq -- 'sk-[a-zA-Z0-9]{32,}' "$target" 2>/dev/null; then
            ISSUES+=("API key パターン (sk-...) が ${target} に含まれます")
        fi
    done
fi

# ── 4. 結果出力 ──────────────────────────────────────────────────────
if [[ ${#ISSUES[@]} -eq 0 ]]; then
    exit 0
fi

SUMMARY="scan-harness: 自己 SAST で ${#ISSUES[@]} 件の問題を検出"
for i in "${ISSUES[@]}"; do
    SUMMARY="$SUMMARY"$'\n'"  - $i"
done

case "$PROFILE" in
    strict)
        # exit 2 は stderr が Claude に渡る唯一の経路(公式仕様)
        printf '%s\n' "$SUMMARY" >&2
        echo "(BLUEPRINT_HOOK_PROFILE=strict のため skill 起動をブロックします)" >&2
        exit 2
        ;;
    standard|*)
        # non-blocking: stdout の additionalContext で Claude に伝える
        # (UserPromptExpansion はプレーンテキストの stdout がそのまま文脈として渡る — 公式仕様)
        if [[ "$EVENT" == "UserPromptExpansion" ]]; then
            printf '%s\n' "$SUMMARY"
        else
            emit_context "${EVENT:-PreToolUse}" "$SUMMARY"
        fi
        exit 0
        ;;
esac
