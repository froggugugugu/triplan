#!/usr/bin/env bash
# ==============================================================================
# instructions-log.sh — InstructionsLoaded hook(観測専用)
#
# CLAUDE.md / AGENTS.md(import 経由)/ .agents/rules/*.md が context に載った事実を
# testreport/instructions/<session>.jsonl に記録する。load_reason の意味:
#   - session_start       : 起動時に必ず載るファイル(= 毎セッション払うコスト)
#   - path_glob_match     : paths: 付き rule が該当ファイルの操作で遅延 load された
#   - nested_traversal    : サブディレクトリの CLAUDE.md が遅延 load された
#   - include             : @import で取り込まれた(AGENTS.md はここに出る)
#   - compact             : コンパクト後に再 load された
#
# 用途: 「どの rule が実際に load されたか」の実測。/harness-refine の棚卸しで
#   - 直近 N セッションで一度も load されない paths: 付き rule → paths の誤り、または不要
#   - 毎セッション load される rule → CLAUDE.md への統合か paths: の絞り込みの候補
#   を判定する材料にする。prose の指示は発火実績が無ければ剪定候補になる
#   (強制系の hook / deny は発火が無くても維持コストがほぼ無いので別扱い)。
#
# InstructionsLoaded は decision control を一切持たない(systemMessage も捨てられる)。記録のみ。
#
# Input:  {"hook_event_name":"InstructionsLoaded","file_path":"...","memory_type":"Project",
#          "load_reason":"session_start|nested_traversal|path_glob_match|include|compact",
#          "globs":[...],"trigger_file_path":"...","parent_file_path":"..."}
# Output: testreport/instructions/<session>.jsonl に 1 行追記(gitignore 対象)
# Policy: fail-open(何が失敗しても exit 0)
# ==============================================================================

set -uo pipefail

PROFILE="${BLUEPRINT_HOOK_PROFILE:-standard}"
[[ "$PROFILE" == "minimal" ]] && exit 0
command -v jq &>/dev/null || exit 0

INPUT="$(cat 2>/dev/null || true)"
[[ -z "$INPUT" ]] && exit 0

PROJECT_DIR="${BLUEPRINT_PROJECT_DIR:-${CLAUDE_PROJECT_DIR:-$(pwd)}}"
LOG_DIR="$PROJECT_DIR/testreport/instructions"
mkdir -p "$LOG_DIR" 2>/dev/null || exit 0

SID="$(printf '%s' "$INPUT" | jq -r '.session_id // "unknown"' 2>/dev/null)"
SID="$(printf '%s' "$SID" | tr -c 'A-Za-z0-9._-' '_' | cut -c1-8)"
[[ -z "$SID" ]] && SID="unknown"
TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# パスはプロジェクト相対に正規化し、プロジェクト外(~/.claude/CLAUDE.md 等)はファイル名だけ残す
# (ホームディレクトリのパスを共有ログに書かない)
printf '%s' "$INPUT" | jq -c --arg ts "$TS" --arg root "$PROJECT_DIR/" '
    def rel: if type == "string" and length > 0 then
                 (if startswith($root) then .[($root | length):] else ("…/" + (split("/") | last)) end)
             else "" end;
    {
        ts: $ts,
        file: ((.file_path // "") | rel),
        memory_type: (.memory_type // ""),
        load_reason: (.load_reason // ""),
        trigger: ((.trigger_file_path // "") | rel),
        parent: ((.parent_file_path // "") | rel),
        globs: ((.globs // []) | length)
    }' >> "$LOG_DIR/$SID.jsonl" 2>/dev/null

exit 0
