#!/bin/bash
set -e

echo "=== Nokia Orka Translator — Desktop Build ==="
echo ""

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

# Step 1: Build shared package
echo "[1/6] Building shared package..."
npm run build -w packages/shared

# Step 2: Build server
echo "[2/6] Building server..."
npm run build -w packages/server

# Step 3: Build React frontend
echo "[3/6] Building React frontend..."
cd packages/app && npx vite build && cd "$ROOT_DIR"

# Step 4: Assemble production bundle
echo "[4/6] Assembling production bundle..."
BUNDLE_DIR="packages/desktop/bundle"
rm -rf "$BUNDLE_DIR"
mkdir -p "$BUNDLE_DIR/server"
mkdir -p "$BUNDLE_DIR/webapp"

# Copy server compiled JS
cp -r packages/server/dist/* "$BUNDLE_DIR/server/"

# Copy webapp
cp -r packages/app/dist/* "$BUNDLE_DIR/webapp/"

# Step 5: Install server dependencies with proper package.json
echo "[5/6] Installing server dependencies into bundle..."

cat > "$BUNDLE_DIR/server/package.json" << 'EOF'
{
  "name": "@orka/server-bundle",
  "version": "0.1.0",
  "type": "module",
  "main": "server.js",
  "dependencies": {
    "fastify": "^5.2.0",
    "@fastify/websocket": "^11.0.0",
    "@fastify/cors": "^10.0.0",
    "@fastify/static": "^9.1.3",
    "openai": "^4.80.0",
    "@anthropic-ai/sdk": "^0.39.0",
    "ws": "^8.18.0",
    "dotenv": "^16.4.0",
    "pino": "^9.6.0"
  }
}
EOF

cd "$BUNDLE_DIR/server"
npm install --omit=dev 2>&1 | tail -3
cd "$ROOT_DIR"

# Step 6: Bundle @orka/shared with explicit ESM-compatible exports
echo "[6/6] Bundling @orka/shared with ESM-compatible exports..."
SHARED_TARGET="$BUNDLE_DIR/server/node_modules/@orka/shared"
mkdir -p "$SHARED_TARGET"

# Copy compiled files
cp -r packages/shared/dist/* "$SHARED_TARGET/"

# Create ESM-compatible wrapper that explicitly exports named symbols
cat > "$SHARED_TARGET/index.js" << 'SHAREDJS'
"use strict";
// ESM-compatible CJS exports for @orka/shared
// Explicit named exports so ESM import { X } works correctly

const languages = require("./types/languages.js");
const messages = require("./types/messages.js");
const constants = require("./constants.js");

// Re-export everything explicitly
exports.SUPPORTED_LANGUAGES = languages.SUPPORTED_LANGUAGES;
exports.isValidLanguage = languages.isValidLanguage;

exports.AUDIO_CONFIG = constants.AUDIO_CONFIG;
exports.WS_CONFIG = constants.WS_CONFIG;
exports.OPENAI_REALTIME_CONFIG = constants.OPENAI_REALTIME_CONFIG;

// Re-export all message types (runtime values if any)
Object.keys(messages).forEach(key => {
  if (key !== '__esModule' && key !== 'default') {
    exports[key] = messages[key];
  }
});
SHAREDJS

# Create package.json pointing to flat index.js
cat > "$SHARED_TARGET/package.json" << 'EOF'
{
  "name": "@orka/shared",
  "version": "0.1.0",
  "main": "./index.js",
  "types": "./index.d.ts"
}
EOF

# Create production .env
cat > "$BUNDLE_DIR/.env" << 'ENVFILE'
OPENAI_API_KEY=
PORT=3001
NODE_ENV=production
ENVFILE

# Copy .env.example too
cp .env.example "$BUNDLE_DIR/.env.example"

echo ""
echo "Bundle contents:"
du -sh "$BUNDLE_DIR"/* 2>/dev/null || true
echo ""
echo "Server node_modules:"
du -sh "$BUNDLE_DIR/server/node_modules" 2>/dev/null || true
echo ""

# Verify critical files
echo "Verification:"
FAIL=0
for f in "$BUNDLE_DIR/server/server.js" \
         "$BUNDLE_DIR/server/app.js" \
         "$BUNDLE_DIR/server/node_modules/fastify/package.json" \
         "$BUNDLE_DIR/server/node_modules/openai/package.json" \
         "$BUNDLE_DIR/server/node_modules/ws/package.json" \
         "$BUNDLE_DIR/server/node_modules/@fastify/websocket/package.json" \
         "$BUNDLE_DIR/server/node_modules/@fastify/static/package.json" \
         "$BUNDLE_DIR/server/node_modules/@orka/shared/index.js" \
         "$BUNDLE_DIR/webapp/index.html"; do
  if [ -f "$f" ]; then
    echo "  OK: $f"
  else
    echo "  MISSING: $f"
    FAIL=1
  fi
done

if [ "$FAIL" = "1" ]; then
  echo ""
  echo "ERROR: Missing files detected! Build may not work."
  exit 1
fi

# Quick smoke test — start server and check health
echo ""
echo "Smoke test..."
cd "$BUNDLE_DIR/server"
OPENAI_API_KEY=test PORT=3099 NODE_ENV=production node server.js &
SERVER_PID=$!
sleep 4
if curl -s --max-time 3 http://127.0.0.1:3099/health > /dev/null 2>&1; then
  echo "  Smoke test PASSED — server starts and responds"
else
  echo "  Smoke test FAILED — server did not respond"
fi
kill $SERVER_PID 2>/dev/null
cd "$ROOT_DIR"

echo ""
echo "=== Build complete ==="
