#!/usr/bin/env bash
# Run the extension in a fresh Firefox profile: esbuild rebuilds dist/ on every
# change and web-ext reloads it. Test pages are served over http:// because
# Firefox never runs extension content scripts on file:// pages.
set -euo pipefail
cd "$(dirname "$0")/.."

PORT="${PORT:-8765}"
FIREFOX_BIN="${FIREFOX_BIN:-/Applications/Firefox.app/Contents/MacOS/firefox}"

python3 -m http.server "$PORT" --bind 127.0.0.1 --directory tests/e2e/fixtures >/dev/null 2>&1 &
SERVER_PID=$!
rm -rf dist # so the wait below can't see files from an older build
node scripts/build.mjs --watch &
BUILD_PID=$!
trap 'kill $SERVER_PID $BUILD_PID 2>/dev/null' EXIT

# Wait for the first build so web-ext starts from a complete dist/.
until [ -f dist/background.js ] && [ -f dist/content.js ] && [ -f dist/popup.js ]; do sleep 0.2; done

npx web-ext run \
  --source-dir dist \
  --firefox="$FIREFOX_BIN" \
  --start-url "http://127.0.0.1:$PORT/links.html" \
  --start-url "http://127.0.0.1:$PORT/short.html"
