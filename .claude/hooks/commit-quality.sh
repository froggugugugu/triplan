#!/usr/bin/env bash
# ==============================================================================
# commit-quality.sh — PostToolUse hook for Bash (git commit)
#
# Validates commit quality after git commit commands:
#   1. Conventional Commits format check
#   2. Secret detection in staged files
#
# Input:  JSON via stdin  {"tool_name":"Bash","tool_input":{"command":"..."},"tool_output":"..."}
# Output: exit 0 = allow (warnings via stderr)
#
# Policy: warn-only (never blocks, provides feedback)
# ==============================================================================

set -uo pipefail

# --- Extract the command from stdin JSON ---
INPUT="$(cat)"

if command -v jq &>/dev/null; then
    CMD="$(echo "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null)"
else
    CMD="$(echo "$INPUT" | sed -n 's/.*"command"\s*:\s*"\(.*\)"/\1/p' | head -1)"
fi

# Only run on git commit commands
if [[ -z "$CMD" ]] || ! echo "$CMD" | grep -qE '^\s*git\s+commit\b'; then
    exit 0
fi

WARNINGS=()

# --- 1. Conventional Commits format check ---
# PostToolUse runs after git commit completes, so use git log as primary source.
COMMIT_MSG=""

# Primary: get the last commit message (works for all commit styles)
if command -v git &>/dev/null && git rev-parse --is-inside-work-tree &>/dev/null 2>&1; then
    COMMIT_MSG="$(git log -1 --format=%s 2>/dev/null || true)"
fi

# Fallback: extract from -m flag in command string
if [[ -z "$COMMIT_MSG" ]] && echo "$CMD" | grep -qE '\-m\s'; then
    COMMIT_MSG="$(echo "$CMD" | sed -n "s/.*-m\s*[\"']\(.*\)[\"'].*/\1/p" | head -1)"
    if [[ -z "$COMMIT_MSG" ]]; then
        COMMIT_MSG="$(echo "$CMD" | sed -n 's/.*-m\s*\([^ ]*\).*/\1/p' | head -1)"
    fi
fi

if [[ -n "$COMMIT_MSG" ]]; then
    FIRST_LINE="$(echo "$COMMIT_MSG" | head -1)"
    if ! echo "$FIRST_LINE" | grep -qE '^(feat|fix|docs|style|refactor|perf|test|chore|ci|build|revert)(\(.+\))?!?:\s'; then
        WARNINGS+=("コミットメッセージが Conventional Commits 形式ではありません: '$FIRST_LINE'")
        WARNINGS+=("期待形式: <type>: <description> (例: feat: 新機能を追加)")
    fi
fi

# --- 2. Secret detection in committed files ---
# PostToolUse runs after commit, so check the last commit's diff instead of staged files.
if command -v git &>/dev/null && git rev-parse --is-inside-work-tree &>/dev/null 2>&1; then
    SECRET_PATTERNS=(
        'API_KEY\s*='
        'API_SECRET\s*='
        'SECRET_KEY\s*='
        'PRIVATE_KEY\s*='
        'ACCESS_TOKEN\s*='
        'AUTH_TOKEN\s*='
        'AWS_ACCESS_KEY_ID\s*='
        'AWS_SECRET_ACCESS_KEY\s*='
        'GITHUB_TOKEN\s*='
        'password\s*=\s*["\x27][^"\x27]{8,}'
    )

    # git show works for all commits including the initial one (HEAD~1 doesn't exist on first commit)
    COMMIT_DIFF="$(git show --no-color --format="" HEAD -U0 2>/dev/null || true)"
    if [[ -n "$COMMIT_DIFF" ]]; then
        for pattern in "${SECRET_PATTERNS[@]}"; do
            MATCHES="$(echo "$COMMIT_DIFF" | grep -E "^\+" | grep -iE "$pattern" | head -3 || true)"
            if [[ -n "$MATCHES" ]]; then
                WARNINGS+=("コミット済みファイルにシークレットの可能性があるパターンを検出: $pattern")
                break
            fi
        done
    fi
fi

# --- Output warnings ---
if [[ ${#WARNINGS[@]} -gt 0 ]]; then
    echo "⚠ commit-quality チェック:" >&2
    for w in "${WARNINGS[@]}"; do
        echo "  - $w" >&2
    done
fi

exit 0
