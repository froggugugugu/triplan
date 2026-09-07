#!/usr/bin/env bash
# ==============================================================================
# subagent-audit.sh — SubagentStop hook
#
# Records subagent completion events as JSONL for observability in parallel
# team workflows (TEAM_PJM --parallel etc.).
# Does NOT block subagent execution (observation only).
#
# Input:  JSON via stdin  {"hook_event":"SubagentStop", ...}
# Output: appends one JSONL line to testreport/agents/<session>.jsonl
#
# Policy: fail-open (if parsing fails, the event is allowed to proceed)
# Note:   `SubagentStart` is NOT an official Claude Code hook event (as of 2026-04).
#         Invocation-start events can be captured via PreToolUse matcher="Task" instead.
# ==============================================================================

set -uo pipefail

# --- Paths ---
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
LOG_DIR="$PROJECT_DIR/testreport/agents"
# Sanitize SESSION_ID to prevent path traversal (reject `/`, `..`, etc.)
SESSION_ID_RAW="${CLAUDE_SESSION_ID:-$(date +%Y%m%d)}"
SESSION_ID="$(printf '%s' "$SESSION_ID_RAW" | tr -c 'A-Za-z0-9._-' '_' | cut -c1-64)"
[[ -z "$SESSION_ID" ]] && SESSION_ID="$(date +%Y%m%d)"
LOG_FILE="$LOG_DIR/$SESSION_ID.jsonl"

# --- Read stdin JSON ---
INPUT="$(cat)"

# Fail-open: empty input is allowed
if [[ -z "$INPUT" ]]; then
    exit 0
fi

# --- Extract event fields ---
if command -v jq &>/dev/null; then
    EVENT="$(echo "$INPUT" | jq -r '.hook_event // .hookEventName // "unknown"' 2>/dev/null)"
    AGENT_NAME="$(echo "$INPUT" | jq -r '.subagent_type // .tool_input.subagent_type // "unknown"' 2>/dev/null)"
    AGENT_ID="$(echo "$INPUT" | jq -r '.subagent_id // .agent_id // "unknown"' 2>/dev/null)"
else
    # Fallback: rough extraction without jq
    EVENT="$(echo "$INPUT" | sed -n 's/.*"hook_event"\s*:\s*"\([^"]*\)".*/\1/p' | head -1)"
    AGENT_NAME="$(echo "$INPUT" | sed -n 's/.*"subagent_type"\s*:\s*"\([^"]*\)".*/\1/p' | head -1)"
    AGENT_ID="unknown"
fi

# Fail-open: couldn't parse event
if [[ -z "${EVENT:-}" ]]; then
    exit 0
fi

# --- Ensure log directory exists ---
mkdir -p "$LOG_DIR" 2>/dev/null || exit 0

# --- Write JSONL line (properly escaped) ---
TIMESTAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

if command -v jq &>/dev/null; then
    # jq handles escaping for all values (quotes, backslashes, control chars)
    jq -nc \
        --arg timestamp "$TIMESTAMP" \
        --arg event "$EVENT" \
        --arg agent_name "$AGENT_NAME" \
        --arg agent_id "$AGENT_ID" \
        --arg session "$SESSION_ID" \
        '{timestamp: $timestamp, event: $event, agent_name: $agent_name, agent_id: $agent_id, session_id: $session}' \
        >> "$LOG_FILE" 2>/dev/null || true
else
    # Fallback: best-effort manual escaping (backslashes, double quotes, control chars stripped)
    esc() { printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g' | tr -d '\000-\037'; }
    printf '{"timestamp":"%s","event":"%s","agent_name":"%s","agent_id":"%s","session_id":"%s"}\n' \
        "$TIMESTAMP" "$(esc "$EVENT")" "$(esc "$AGENT_NAME")" "$(esc "$AGENT_ID")" "$(esc "$SESSION_ID")" \
        >> "$LOG_FILE" 2>/dev/null || true
fi

# Always exit 0 — this is observation only, never blocks
exit 0
