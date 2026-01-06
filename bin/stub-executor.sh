#!/bin/bash
# Stub executor for testing - reads prompt from stdin, waits 5 seconds, returns empty array

# Read the entire prompt from stdin
PROMPT=$(cat)

# Print the prompt to stderr (so it doesn't interfere with JSON output)
echo "=== STUB EXECUTOR ===" >&2
echo "Received prompt:" >&2
echo "$PROMPT" >&2
echo "===================" >&2
echo "Waiting 5 seconds..." >&2

# Wait 5 seconds
sleep 5

# Return empty JSON array (no issues found)
echo "[]"

