#!/usr/bin/env bash
# ==============================================================================
# console-warn.sh — PostToolUse hook for Edit/Write tools
#
# Detects debug statements left in edited files:
#   console.log, console.debug, debugger, print() (Python), dd() (PHP/Laravel)
#
# Input:  JSON via stdin  {"tool_name":"Edit","tool_input":{"file_path":"..."}}
# Output: exit 0 = allow (warnings via stderr)
#
# Policy: warn-only (never blocks, provides feedback)
# ==============================================================================

set -uo pipefail

# --- Extract the file path from stdin JSON ---
INPUT="$(cat)"

if command -v jq &>/dev/null; then
    FILE_PATH="$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_input.filePath // empty' 2>/dev/null)"
else
    FILE_PATH="$(echo "$INPUT" | sed -n 's/.*"file_path"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)"
    if [[ -z "$FILE_PATH" ]]; then
        FILE_PATH="$(echo "$INPUT" | sed -n 's/.*"filePath"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)"
    fi
fi

# Skip if no file path or file doesn't exist
if [[ -z "$FILE_PATH" ]] || [[ ! -f "$FILE_PATH" ]]; then
    exit 0
fi

# Skip non-source files (config, docs, etc.)
case "$FILE_PATH" in
    *.md|*.json|*.yaml|*.yml|*.toml|*.xml|*.csv|*.txt|*.lock|*.log)
        exit 0
        ;;
esac

# --- Debug statement patterns ---
# Each entry: "pattern|description"
DEBUG_PATTERNS=(
    'console\.log([[:space:]]|\()|console.log (JavaScript/TypeScript)'
    'console\.debug([[:space:]]|\()|console.debug (JavaScript/TypeScript)'
    '(^|[^[:alnum:]_])debugger([^[:alnum:]_]|$)|debugger statement (JavaScript/TypeScript)'
    '(^|[^[:alnum:]_])print[[:space:]]*\(|print() (Python)'
    '(^|[^[:alnum:]_])pp([[:space:]]|\()|pp (Ruby)'
    '(^|[^[:alnum:]_])dd[[:space:]]*\(|dd() (PHP/Laravel)'
    '(^|[^[:alnum:]_])var_dump[[:space:]]*\(|var_dump() (PHP)'
    '(^|[^[:alnum:]_])puts([[:space:]]|\()|puts (Ruby)'
    'NSLog[[:space:]]*\(|NSLog() (Swift/ObjC)'
    'System\.out\.print|System.out.print (Java)'
    'fmt\.Print|fmt.Print (Go)'
    'println![[:space:]]*\(|println!() (Rust)'
)

WARNINGS=()

for entry in "${DEBUG_PATTERNS[@]}"; do
    PATTERN="${entry%|*}"
    DESC="${entry##*|}"

    # Search the file for the pattern (limit to first 3 matches)
    MATCHES="$(grep -nE -- "$PATTERN" "$FILE_PATH" 2>/dev/null | head -3 || true)"
    if [[ -n "$MATCHES" ]]; then
        WARNINGS+=("$DESC を検出:")
        while IFS= read -r line; do
            WARNINGS+=("  $FILE_PATH:$line")
        done <<< "$MATCHES"
    fi
done

# --- Output warnings ---
if [[ ${#WARNINGS[@]} -gt 0 ]]; then
    echo "⚠ デバッグステートメント検出（コミット前に削除を検討してください）:" >&2
    for w in "${WARNINGS[@]}"; do
        echo "  $w" >&2
    done
fi

exit 0
