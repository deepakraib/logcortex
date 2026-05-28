#!/usr/bin/env bash
# Blocks committing log files, home paths, and common secret/PII patterns.
set -euo pipefail

staged=$(git diff --cached --name-only --diff-filter=ACMRTUXB || true)
if [ -z "$staged" ]; then
  exit 0
fi

fail=0

while IFS= read -r file; do
  case "$file" in
    *.log|*.log.gz|*.logs|*.jsonl)
      echo "check-privacy: refuse to commit log file: $file"
      fail=1
      ;;
  esac
done <<< "$staged"

check_content() {
  local file="$1"
  local content
  content=$(git show ":$file" 2>/dev/null || true)
  [ -z "$content" ] && return 0

  if printf '%s' "$content" | grep -qE 'prefix=/home/|prefix=/Users/'; then
    echo "check-privacy: machine-specific npm prefix in $file (remove prefix= line from .npmrc)"
    fail=1
  fi

  if printf '%s' "$content" | grep -qE '"planSummary":"COLLSCAN".*"remote":"[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+"'; then
    echo "check-privacy: possible real MongoDB log line in $file"
    fail=1
  fi

  if printf '%s' "$content" | grep -qE 'BEGIN (RSA |OPENSSH |EC |DSA )PRIVATE KEY'; then
    echo "check-privacy: private key material in $file"
    fail=1
  fi
}

while IFS= read -r file; do
  case "$file" in
    *)
      check_content "$file"
      ;;
  esac
done <<< "$staged"

if [ "$fail" -ne 0 ]; then
  echo ""
  echo "Commit rejected. Do not commit log files, home paths, or private keys."
  exit 1
fi

exit 0
