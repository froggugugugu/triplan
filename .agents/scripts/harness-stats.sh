#!/usr/bin/env bash
# ==============================================================================
# harness-stats.sh — 観測フックが testreport/ に残した JSONL を集計する
#
# 役割: ガードレールの発火数・拒否・失敗・設定変更・rule の load 実績・subagent 起動を
#       1 枚の Markdown にまとめる。`/harness-refine` Round 0 の「コントロールの棚卸し」と、
#       guardrails.md の「強制は発火が無くても消さない / 指示は load 実績で判定する」の実測値。
#
# 使い方:
#   bash .agents/scripts/harness-stats.sh                # 全期間
#   bash .agents/scripts/harness-stats.sh --since 30     # 直近 30 日
#   bash .agents/scripts/harness-stats.sh --json         # 機械可読(集計値のみ)
#   bash .agents/scripts/harness-stats.sh --project /path/to/project
#
# 入力(フックが書く JSONL。いずれも無ければ 0 件として扱う):
#   testreport/denials/*.jsonl         permission-denied-log.sh  {ts, kind, tool, reason, permission_mode, input}
#   testreport/failures/*.jsonl        post-failure-log.sh       {timestamp, tool, error, is_interrupt}
#   testreport/config-changes/*.jsonl  config-guard.sh / scan-harness.sh  {ts, source, decision, violations[]}
#   testreport/instructions/*.jsonl    instructions-log.sh       {ts, file, memory_type, load_reason}
#   testreport/agents/*.jsonl          subagent-audit.sh         {timestamp, event, agent_name}
#   output/reports/sessions/*.md       session-end.sh            1 セッション 1 行
#
# 要件: jq。終了コード: 0 = 出力成功 / 2 = jq 不在
# ==============================================================================

set -uo pipefail

PROJECT="${CLAUDE_PROJECT_DIR:-.}"
SINCE_DAYS=""
FORMAT="md"

while [[ $# -gt 0 ]]; do
    case "$1" in
        --since) SINCE_DAYS="${2:-}"; shift 2 ;;
        --since=*) SINCE_DAYS="${1#*=}"; shift ;;
        --json) FORMAT="json"; shift ;;
        --project) PROJECT="${2:-.}"; shift 2 ;;
        -h|--help) sed -n '2,24p' "$0"; exit 0 ;;
        *) echo "unknown option: $1" >&2; exit 2 ;;
    esac
done

command -v jq &>/dev/null || { echo "harness-stats: jq が必要です" >&2; exit 2; }

TR="$PROJECT/testreport"
SINCE=""
if [[ -n "$SINCE_DAYS" ]]; then
    # macOS(BSD date)と GNU date の両方に対応
    SINCE="$(date -u -v-"${SINCE_DAYS}"d +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -d "-${SINCE_DAYS} days" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || true)"
fi

# load <dir> → 期間内の JSON 行を 1 行ずつ出す(ts / timestamp のどちらでも比較できる)
load() {
    local dir="$TR/$1"
    [[ -d "$dir" ]] || return 0
    cat "$dir"/*.jsonl 2>/dev/null | jq -c --arg since "$SINCE" \
        'select(type == "object") | select($since == "" or ((.ts // .timestamp // "") >= $since))' 2>/dev/null
}

DENIALS="$(load denials)"
FAILURES="$(load failures)"
CONFIG="$(load config-changes)"
INSTR="$(load instructions)"
AGENTS="$(load agents)"
SESSIONS=0
if [[ -d "$PROJECT/output/reports/sessions" ]]; then
    SESSIONS="$(cat "$PROJECT/output/reports/sessions"/*.md 2>/dev/null | grep -c '^| ' || true)"
fi

count() { printf '%s' "$1" | grep -c . || true; }

# 集計(jq -s で配列化して group_by)
summary_json() {
    jq -n \
        --arg since "${SINCE:-all}" \
        --argjson sessions "${SESSIONS:-0}" \
        --slurpfile denials <(printf '%s\n' "$DENIALS" | jq -c 'select(. != null)' 2>/dev/null; true) \
        --slurpfile failures <(printf '%s\n' "$FAILURES" | jq -c 'select(. != null)' 2>/dev/null; true) \
        --slurpfile config <(printf '%s\n' "$CONFIG" | jq -c 'select(. != null)' 2>/dev/null; true) \
        --slurpfile instr <(printf '%s\n' "$INSTR" | jq -c 'select(. != null)' 2>/dev/null; true) \
        --slurpfile agents <(printf '%s\n' "$AGENTS" | jq -c 'select(. != null)' 2>/dev/null; true) \
        '
        def top(f): group_by(f) | map({key: (.[0] | f), count: length}) | sort_by(-.count) | .[0:10];
        {
          since: $since,
          sessions: $sessions,
          denials: {
            total: ($denials | length),
            by_kind: ($denials | group_by(.kind) | map({key: .[0].kind, count: length})),
            by_tool: ($denials | top(.tool))
          },
          failures: {
            total: ($failures | length),
            interrupts: ($failures | map(select(.is_interrupt == "true")) | length),
            by_tool: ($failures | top(.tool))
          },
          config_changes: {
            total: ($config | length),
            blocked: ($config | map(select(.decision == "block")) | length),
            warned: ($config | map(select(.decision == "warn")) | length),
            violations: ($config | map(.violations[]?) | top(.))
          },
          instructions: {
            total: ($instr | length),
            by_file: ($instr | top(.file)),
            by_reason: ($instr | group_by(.load_reason) | map({key: .[0].load_reason, count: length}))
          },
          subagents: {
            starts: ($agents | map(select(.event == "SubagentStart")) | length),
            stops: ($agents | map(select(.event == "SubagentStop")) | length),
            by_agent: ($agents | map(select(.event == "SubagentStart")) | top(.agent_name))
          }
        }'
}

JSON="$(summary_json)"

if [[ "$FORMAT" == "json" ]]; then
    printf '%s\n' "$JSON"
    exit 0
fi

table() { # table <json-array of {key,count}> <header>
    local rows="$1" header="$2"
    if [[ "$(printf '%s' "$rows" | jq 'length')" == "0" ]]; then
        echo "(記録なし)"
        return
    fi
    echo "| $header | 件数 |"
    echo "| --- | --- |"
    printf '%s' "$rows" | jq -r '.[] | "| `\(.key | tostring | .[0:80])` | \(.count) |"'
}

echo "# ハーネス観測サマリ(${SINCE_DAYS:+直近 ${SINCE_DAYS} 日 / }$(date -u +%Y-%m-%d))"
echo
echo "- セッション数(output/reports/sessions): $SESSIONS"
echo "- 拒否・確認ダイアログ(denials): $(printf '%s' "$JSON" | jq '.denials.total')"
echo "- ツール失敗 / API エラー(failures): $(printf '%s' "$JSON" | jq '.failures.total')(中断 $(printf '%s' "$JSON" | jq '.failures.interrupts'))"
echo "- 設定変更(config-changes): $(printf '%s' "$JSON" | jq '.config_changes.total')(差し止め $(printf '%s' "$JSON" | jq '.config_changes.blocked') / 警告 $(printf '%s' "$JSON" | jq '.config_changes.warned'))"
echo "- 指示ファイルの load(instructions): $(printf '%s' "$JSON" | jq '.instructions.total')"
echo "- subagent 起動(agents): $(printf '%s' "$JSON" | jq '.subagents.starts')"
echo
echo "## 拒否・確認(ツール別)"
echo
table "$(printf '%s' "$JSON" | jq '.denials.by_tool')" "ツール"
echo
echo "## ツール失敗(ツール別)"
echo
table "$(printf '%s' "$JSON" | jq '.failures.by_tool')" "ツール"
echo
echo "## 設定変更の違反内容"
echo
table "$(printf '%s' "$JSON" | jq '.config_changes.violations')" "違反"
echo
echo "## 指示ファイルの load 実績(rule 棚卸しの根拠。0 件の \`paths:\` 付き rule は剪定候補)"
echo
table "$(printf '%s' "$JSON" | jq '.instructions.by_file')" "ファイル"
echo
echo "## subagent 起動(agent 別)"
echo
table "$(printf '%s' "$JSON" | jq '.subagents.by_agent')" "agent"
echo
echo "> 判定基準は \`.agents/guardrails.md\` の「コントロールの棚卸し」。強制(hook / deny)は発火 0 でも消さない。指示は load 0 なら消す候補。"
exit 0
