#!/usr/bin/env bash
# design/ must equal Shepdesign-LLC/NetRelish/design at the commit in design/SOURCE.
set -euo pipefail
cd "$(dirname "$0")/.."
sha=$(tr -d '[:space:]' < design/SOURCE)
fail=0
for f in tokens.css logo.svg logo-cog.svg symbols.svg; do
  url="https://raw.githubusercontent.com/Shepdesign-LLC/NetRelish/$sha/design/$f"
  if ! curl -fsSL "$url" | cmp -s - "design/$f"; then
    echo "drift: design/$f differs from NetRelish@$sha"; fail=1
  fi
done
[ $fail -eq 0 ] && echo "design/ matches NetRelish@$sha"
exit $fail
