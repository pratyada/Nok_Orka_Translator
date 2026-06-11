# Nokia Orka Translator — Issues & Learnings

## Session: 2026-06-10 (Initial Build & First Working Demo)

### Summary

Built the full translation pipeline from scratch and got live English→Spanish translation working in the browser. The core architecture (browser mic → WebSocket → Node.js backend → OpenAI Realtime API → translated audio+text back) is validated.

---

## Issues Encountered & Resolved

### 1. Shared Package ESM/CJS Mismatch
- **Symptom**: Browser console error: `does not provide an export named 'AUDIO_CONFIG'`
- **Root Cause**: `packages/shared` compiled to CommonJS (`module.exports`) via TypeScript, but Vite (frontend bundler) expected ESM (`export`)
- **Fix**: Added Vite `resolve.alias` to point `@orka/shared` directly to TypeScript source files instead of compiled `dist/`
- **File**: `packages/app/vite.config.ts`
```ts
resolve: {
  alias: {
    "@orka/shared": path.resolve(__dirname, "../shared/src"),
  },
},
```
- **Lesson**: In monorepos, Vite should resolve workspace packages to source, not compiled output. The server (Node.js) uses compiled output; the frontend uses source.

---

### 2. TypeScript `composite` Missing
- **Symptom**: `Referenced project must have setting "composite": true`
- **Root Cause**: Server's `tsconfig.json` referenced shared package via `references`, but shared didn't have `composite: true`
- **Fix**: Added `"composite": true` to `packages/shared/tsconfig.json`
- **Lesson**: TypeScript project references require `composite: true` in the referenced project.

---

### 3. Node.js Typed EventEmitter Incompatibility
- **Symptom**: Multiple TypeScript errors like `Type '(text: string) => void' is not assignable to type 'any[]'`
- **Root Cause**: Node.js `EventEmitter<T>` generic expects event maps with array types (args), not function signatures
- **Fix**: Dropped the generic parameter, used plain `EventEmitter` with JSDoc comments for event documentation
- **Lesson**: Node.js typed EventEmitter generics changed in recent versions. Plain `EventEmitter` with documentation is simpler and works.

---

### 4. OpenAI Realtime Beta API Deprecated
- **Symptom**: `TRANSLATION_ERROR: The Realtime Beta API is no longer supported`
- **Root Cause**: We sent `"OpenAI-Beta": "realtime=v1"` header, but the API graduated to GA
- **Fix**: Removed the `OpenAI-Beta` header from WebSocket connection
- **File**: `packages/server/src/services/openai-realtime.service.ts`
- **Lesson**: OpenAI Realtime API is now GA. No beta header needed.

---

### 5. Model `gpt-4o-realtime-preview` Not Found
- **Symptom**: `The model gpt-4o-realtime-preview does not exist or you do not have access to it`
- **Root Cause**: Model name changed in GA release. Old preview model no longer available.
- **Fix**: Queried available models via `GET /v1/models`, found `gpt-realtime`, `gpt-realtime-translate`, etc.
- **Final model used**: `gpt-realtime` (not `gpt-realtime-translate`)
- **Lesson**: Always verify model availability with `GET /v1/models` before hardcoding model names.

---

### 6. Stale Compiled Output (Model Name Not Updating)
- **Symptom**: Server kept using `gpt-4o-realtime-preview` even after source was updated
- **Root Cause**: `packages/shared/dist/constants.js` still had old model name. Server imports from compiled `dist/`, not source.
- **Fix**: Must run `npm run build -w packages/shared` after changing shared source before restarting server
- **Lesson**: After changing shared package source, always rebuild before restarting server. The server reads compiled output, not source.

---

### 7. OpenAI GA API Session Format Changed
- **Symptom**: `Unknown parameter: 'session.input_audio_format'`
- **Root Cause**: GA API uses nested structure `audio.input.format` instead of flat `input_audio_format`
- **Old (Beta)**:
```json
{ "input_audio_format": "pcm16", "output_audio_format": "pcm16" }
```
- **New (GA)**:
```json
{
  "audio": {
    "input": { "format": { "type": "audio/pcm", "rate": 24000 } },
    "output": { "format": { "type": "audio/pcm", "rate": 24000 }, "voice": "alloy" }
  }
}
```
- **Also requires**: `session.type: "realtime"` field
- **Lesson**: The GA Realtime API has a completely different session schema from the beta. Always inspect `session.created` payload to understand the expected shape.

---

### 8. `gpt-realtime-translate` Model Drops Connection
- **Symptom**: Session configures successfully but closes with code 1005 after receiving audio
- **Root Cause**: The `gpt-realtime-translate` model appears to be unstable or has stricter requirements not documented
- **Fix**: Switched to `gpt-realtime` model with translation instructions in the `instructions` field
- **Lesson**: `gpt-realtime` with translation instructions works reliably. `gpt-realtime-translate` may need specific undocumented parameters. Use the general model for now.

---

### 9. GA API Event Names Changed
- **Symptom**: Translation worked in test script but no text/audio appeared in UI
- **Root Cause**: GA API emits `response.output_audio_transcript.delta` and `response.output_audio.delta` instead of the beta's `response.audio_transcript.delta` and `response.audio.delta`
- **Fix**: Updated event handlers to listen for GA event names:
  - `response.output_audio_transcript.delta` → translated text
  - `response.output_audio.delta` → translated audio
  - `conversation.item.input_audio_transcription.completed` → original transcript
- **Lesson**: Always log unhandled events during development to catch API changes.

---

### 10. WebSocket Killed by React StrictMode
- **Symptom**: WebSocket connected then immediately disconnected, reconnect loop
- **Root Cause**: React StrictMode in dev mode calls `useEffect` twice (mount → unmount → mount). The cleanup function closed the WebSocket, and `onclose` triggered reconnection, creating a loop.
- **Fix**: Moved WebSocket to a **global singleton outside React**. The WebSocket lives in module scope and survives StrictMode double-mounts and HMR reloads.
- **Lesson**: For persistent connections (WebSocket, SSE), keep them outside React's lifecycle. Use module-level singletons with a listener pattern.

---

### 11. Audio Chunks Not Sending — Base64 Encoding Crash
- **Symptom**: Mic capture active (green bar moves) but server receives zero `audio_chunk` messages
- **Root Cause**: `String.fromCharCode(...new Uint8Array(pcmData))` — the spread operator can't handle 8192+ arguments, causes silent `RangeError: Maximum call stack size exceeded`
- **Fix**: Used a for-loop for base64 encoding:
```ts
const bytes = new Uint8Array(pcmData);
let binary = "";
for (let i = 0; i < bytes.length; i++) {
  binary += String.fromCharCode(bytes[i]);
}
const base64 = btoa(binary);
```
- **Lesson**: Never use spread operator (`...`) on large typed arrays. Use iterative approach for binary→base64 conversion.

---

### 12. Stale Closure in Audio Callback
- **Symptom**: Audio chunks captured but `sendAudio` never called — `socket.isTranslating` always `false`
- **Root Cause**: `useCallback` captured `socket.isTranslating` at creation time. When `isTranslating` changed to `true`, the callback passed to `useAudioCapture` still had the old `false` value (stale closure).
- **Fix**: Used a `useRef` to hold the current `isTranslating` value, read inside the callback:
```ts
const isTranslatingRef = useRef(false);
isTranslatingRef.current = socket.isTranslating;

// In callback:
if (isTranslatingRef.current) { socket.sendAudio(chunk); }
```
- **Lesson**: When React callbacks need to read frequently-changing state, use `useRef` to avoid stale closures. This is especially important for audio/video processing callbacks that are registered once.

---

### 13. Vite WebSocket Proxy Configuration
- **Symptom**: WebSocket connections to `ws://localhost:3000/ws/translate` failed
- **Root Cause**: Vite proxy had `target: "ws://localhost:3001"` — should use `http://` protocol
- **Fix**: Changed to `target: "http://localhost:3001"` with `ws: true` and `changeOrigin: true`
- **Lesson**: Vite proxy `ws: true` flag handles WebSocket upgrade. Target URL should always be `http://`.

---

## Architecture Decisions Validated

1. **OpenAI Realtime API (gpt-realtime)** works for real-time translation via instructions
2. **Browser mic capture via Web Audio API** works (getUserMedia + ScriptProcessorNode)
3. **Vite + React + Fluent UI** frontend serves well for POC
4. **Fastify + @fastify/websocket** backend handles WebSocket routing cleanly
5. **Module-level WebSocket singleton** is the right pattern for React apps with persistent connections

---

## Session: 2026-06-11 (Windows Packaging & Nokia Laptop Deployment)

### Summary

Packaged the Electron app for Windows, deployed to Nokia laptop, and fixed 6 issues to get the embedded server running inside the packaged app.

---

### 14. Electron Portable EXE Silently Blocked by SmartScreen
- **Symptom**: Double-clicking the `.exe` does nothing — no window, no process in Task Manager
- **Root Cause**: Windows SmartScreen silently blocks unsigned NSIS portable wrappers
- **Fix**: Use the unpacked folder (`win-unpacked/`) directly instead of the NSIS portable wrapper. User right-clicks `.exe` → Properties → Unblock. Or runs from command line to see the SmartScreen dialog.
- **Lesson**: For corporate Windows laptops, distribute as a zip of the unpacked folder, not as an NSIS portable `.exe`. Code-signing with a Nokia certificate would eliminate this for production.

---

### 15. Server Dependencies Not Bundled in Electron Package
- **Symptom**: App opens but shows "Server Error — The translation server crashed"
- **Root Cause**: `electron-builder` only packages the Electron-side deps (electron-store, ajv). The server's runtime dependencies (fastify, openai, ws, @anthropic-ai/sdk) were never copied into `resources/server/node_modules/`.
- **Why**: The build script tried to cherry-pick individual node_modules folders, but missed most of them and their transitive dependencies.
- **Fix**: Create a standalone `package.json` inside `bundle/server/` with all server dependencies listed, then run `npm install --omit=dev` inside the bundle directory. This installs the complete dependency tree.
- **File**: `scripts/build-desktop.sh`
- **Lesson**: Never cherry-pick node_modules. Always use `npm install` in the target directory with a proper `package.json` listing all dependencies.

---

### 16. @orka/shared Package Unresolvable in Packaged App
- **Symptom**: `Error: Cannot find module '@orka/shared'`
- **Root Cause**: Two issues:
  1. `resources/shared/package.json` had `"main": "./dist/index.js"` but files were at `resources/shared/index.js` (no `dist/` subfolder)
  2. No `node_modules/@orka/shared` symlink or folder existed inside `resources/server/`
- **Fix**: Flatten shared dist files into `server/node_modules/@orka/shared/` with a corrected `package.json` pointing `"main": "./index.js"`
- **Additional fix on Nokia laptop**: Rewrote `resources/shared/index.js` to use explicit `exports.X = ...` so ESM imports from the server could resolve named exports from the CJS module
- **Lesson**: In packaged apps, workspace packages must be properly installed as regular dependencies. The npm workspace symlink resolution doesn't carry over to packaged builds.

---

### 17. CJS/ESM Interop — Named Exports from @orka/shared
- **Symptom**: `import { SUPPORTED_LANGUAGES } from "@orka/shared"` fails — module has no named exports
- **Root Cause**: The shared package compiles to CJS (`module.exports`), but server is ESM (`"type": "module"`). Node.js CJS-to-ESM interop only guarantees `default` export, not named exports, unless the CJS module explicitly sets `exports.X`.
- **Fix**: Rewrote `resources/shared/index.js` to explicitly export each symbol:
  ```js
  exports.isValidLanguage = ...
  exports.SUPPORTED_LANGUAGES = ...
  exports.AUDIO_CONFIG = ...
  exports.OPENAI_REALTIME_CONFIG = ...
  ```
- **Lesson**: When a CJS package is consumed by ESM code in a packaged environment, explicit named exports are needed. TypeScript's `__createBinding` re-export helpers don't always work in ESM interop.

---

### 18. Electron Server Cold-Start Timeout on Slower Laptops
- **Symptom**: App shows blank white screen, server never loads
- **Root Cause**: `waitForServer()` in `main.js` had `retries = 30` (15 seconds). On Nokia laptops with corporate security scanning, the Node.js fork + npm module loading takes longer.
- **Fix**: Increased retries from 30 → 120 (60 seconds) to accommodate slower cold starts
- **Lesson**: Corporate laptops have endpoint protection (CrowdStrike, etc.) that scans new processes. Budget extra time for server startup.

---

### 19. NODE_ENV=development Hid the Webapp in Packaged App
- **Symptom**: Server starts but returns no HTML — only API endpoints work
- **Root Cause**: The `.env` file had `NODE_ENV=development`. In development mode, the server skips serving static files (expects Vite dev server). The webapp was bundled in `resources/webapp/` but never served.
- **Fix**: Set `NODE_ENV=production` in the `.env` file
- **Lesson**: Always ensure `.env` in packaged builds has `NODE_ENV=production`. The build script should enforce this.

---

## What's Working Now (Updated)
- Dual-stream conversation mode: mic (outgoing) + system audio (incoming) simultaneously
- 24 languages with Whisper language hints
- Nokia-branded UI with 4-pane conversation view
- Electron desktop app running on Windows Nokia laptop
- Embedded server with all dependencies bundled
- Self-contained — no Node.js or npm install needed on target machine
- OpenAI Realtime API (gpt-realtime) for live translation

## Deployment Checklist for Colleagues
1. Zip the `win-unpacked/` folder and share
2. Colleague unzips, edits `.env` to add `OPENAI_API_KEY`
3. Double-clicks `Nokia Orka Translator.exe`
4. Allow Windows Firewall if prompted
5. No Node.js or npm install required — `node_modules` shipped inside

## Next Steps
- Test bidirectional conversation with 2 people on a Teams call
- Build Teams Bot for meeting-level integration
- Add central server mode (API key stays with admin, clients connect to it)
- Code-sign the app with Nokia certificate to avoid SmartScreen warnings
- Add transcript export for post-meeting review
