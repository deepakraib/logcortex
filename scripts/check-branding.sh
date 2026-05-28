#!/usr/bin/env bash
# Blocks vendor / IDE / AI-tool branding in staged file content.
# MongoDB technical terms (cursor timeouts, cursorId, getMore cursor, CSS
# cursor-pointer) remain allowed. The branding-check tool itself is exempt
# because it must reference the strings it blocks.
set -euo pipefail

staged=$(git diff --cached --name-only --diff-filter=ACMRTUXB || true)
if [ -z "$staged" ]; then
  exit 0
fi

# Build patterns from non-literal pieces so this file does not itself trip
# its own check when staged.
ai="cur""sor""agent|cur""sor agent|son""net|cla""ude|chat""gpt|ope""nai|anth""ropic|ge""mini|cop""ilot|gpt-[0-9]"
coauth="^[[:space:]]*co-authored-by:.*(${ai})"
# Vendor literal; built piecewise.
vendor="p""er""cona[ -]?(server|backup|psmdb|inc)?"

# Files that legitimately reference these tokens (security tooling).
is_exempt() {
  case "$1" in
    scripts/check-branding.sh|.githooks/commit-msg|.githooks/prepare-commit-msg|.githooks/pre-commit)
      return 0 ;;
  esac
  return 1
}

fail=0

check_file() {
  local file="$1"
  is_exempt "$file" && return 0

  local content
  content=$(git show ":$file" 2>/dev/null || true)
  [ -z "$content" ] && return 0

  if printf '%s' "$content" | grep -qiE "$ai"; then
    echo "branding-check: blocked AI/IDE branding in $file"
    fail=1
  fi

  if printf '%s' "$content" | grep -qiE "$coauth"; then
    echo "branding-check: blocked AI co-author trailer in $file"
    fail=1
  fi

  case "$file" in
    *.md|*.html|*.json|README*|SECURITY*)
      if printf '%s' "$content" | grep -qiE "$vendor"; then
        echo "branding-check: blocked vendor literal in $file"
        fail=1
      fi
      ;;
  esac
}

while IFS= read -r file; do
  case "$file" in
    *.md|*.jsx|*.js|*.ts|*.tsx|*.html|*.json|*.css|*.sh|*.yml|*.yaml)
      check_file "$file"
      ;;
  esac
done <<< "$staged"

if [ "$fail" -ne 0 ]; then
  echo ""
  echo "Commit rejected. Remove vendor / AI / IDE branding before committing."
  exit 1
fi

exit 0
