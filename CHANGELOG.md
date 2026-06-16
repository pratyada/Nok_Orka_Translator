# Changelog

All notable changes to the Nokia Orka Translator are recorded here.
This project uses [Semantic Versioning](https://semver.org/): `MAJOR.MINOR.PATCH`.

## [1.0.1] — 2026-06-16

First versioned release of the multi-party translator, packaged for distribution to colleagues for testing.

### Added
- **In-app "Languages Supported" panel** — documents ~99 auto-detected source languages and the 24 selectable target languages.
- **In-app "Architecture & Security" panel** — transparent data-flow and security overview prepared for internal security review (what leaves the device, what never does, retention, known considerations, roadmap).
- **Setup Guide: subscription/seat key model** — each user pastes their own centrally-issued OpenAI key into `.env`; no shared secret is embedded in the build.
- **Setup Guide: notes for Nokia laptops & customer-protected systems** — SmartScreen, endpoint protection, outbound `api.openai.com` requirement, and a do-not-run-on-customer-systems-without-approval warning.

### Fixed
- **System audio capture in the desktop app.** The Electron capture path requested `getDisplayMedia({ video: false })`, which Chromium rejects, so no audio ever reached the translator. Now requests a video track (required by the API) and discards it, keeping only the loopback audio.

### Notes
- Distributed build ships with an **empty `.env`** (`OPENAI_API_KEY=`) by design.
- Build is **not yet code-signed** — Windows SmartScreen warns on first launch.
- Local server still binds `0.0.0.0`; loopback-only (`127.0.0.1`) hardening is planned.

## [0.1.0] — 2026-06-12

- Initial proof-of-concept: multi-party listen-only translator, Windows packaging.
