# Phase 1: Foundation - Context

**Gathered:** 2026-03-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Establish the project skeleton with validated config, structured logging, and a persistent GramJS session that survives Railway redeploys. The system boots, validates all config via Zod, connects to Telegram via GramJS StringSession, logs structured JSON to stdout via Pino, and stays running 24/7 as a single long-lived process. No message handling — just prove the connection works and persists.

</domain>

<decisions>
## Implementation Decisions

### Config Schema Design
- Nested Zod schema grouped by concern: `telegram` (apiId, apiHash, session, botToken), `claude` (apiKey, model), `schedule` (activeHours, timezone), `safety` (rateLimits, delays)
- Env vars use SCREAMING_SNAKE with service prefix: `TELEGRAM_API_ID`, `TELEGRAM_API_HASH`, `TELEGRAM_SESSION`, `TELEGRAM_BOT_TOKEN`, `CLAUDE_API_KEY`, etc.
- Single `src/config.ts` module validates all env vars at startup and exports a fully-typed config object
- All Phase 1 config is required — startup fails fast with clear error messages listing every missing/malformed value
- Future phases add optional config fields as needed without breaking existing validation

### Session Generation Workflow
- Separate one-time local script at `scripts/generate-session.ts` — prompts for phone number, receives Telegram code, outputs StringSession string to copy-paste into Railway
- StringSession stored as `TELEGRAM_SESSION` env var on Railway — survives redeploys without re-auth
- Session generation NEVER happens in production — it's a manual one-time operation run locally by Sammy
- If session expires or becomes invalid at runtime: log the error clearly and exit with code 1 — manual re-generation required

### Process Lifecycle
- GramJS client connection keeps the Node.js event loop alive — no setInterval hacks needed
- Graceful shutdown on SIGTERM (Railway redeploy) and SIGINT (local dev): disconnect GramJS client, flush Pino logs, exit cleanly
- No HTTP health endpoint — Railway monitors the process exit code (0 = healthy shutdown, 1 = error)
- Uncaught exceptions: log full stack trace via Pino, exit with code 1 — Railway auto-restarts the service
- Unhandled promise rejections: same treatment as uncaught exceptions

### Project Structure
- Single `src/` directory with flat module structure — no monorepo, no workspaces
- Both bot account (grammY) and user API (GramJS) live in same codebase, same Railway service
- Key modules: `src/index.ts` (entry), `src/config.ts` (Zod validation), `src/logger.ts` (Pino setup), `src/telegram.ts` (GramJS client init)
- Build with tsup (fast TypeScript bundling), tsx for local dev
- `src/index.ts` follows init order: validate config → init logger → connect GramJS → log "connected" → stay alive

### Claude's Discretion
- Exact tsconfig and tsup config options
- package.json scripts and dev tooling (eslint, prettier — keep it minimal)
- Pino log level configuration (INFO default, DEBUG via env var)
- Railway Dockerfile vs Nixpacks — pick what's simpler
- Error message formatting for config validation failures

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

No external specs — requirements are fully captured in REQUIREMENTS.md and decisions above.

### Project requirements
- `.planning/REQUIREMENTS.md` — Full requirement definitions, Phase 1 maps to INFRA-01, INFRA-02, INFRA-03, DM-02
- `.planning/PROJECT.md` — Tech stack constraints (TypeScript, grammY, GramJS, Claude API), hosting (Railway), no-database decision

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- None — greenfield project, no existing code

### Established Patterns
- None yet — Phase 1 establishes the patterns all subsequent phases follow

### Integration Points
- GramJS client created in this phase will be imported by Phase 2 (DM monitoring) and Phase 4 (takeover commands)
- Pino logger created here will be imported by every subsequent module
- Config schema created here will be extended by Phases 2-4 with additional fields
- grammY bot client (for group posting) can be initialized here or deferred to Phase 3

</code_context>

<specifics>
## Specific Ideas

- Sammy's global CLAUDE.md requires Pino for Node.js logging — already aligned with INFRA-02
- Sammy's global CLAUDE.md requires centralized logger module (`src/logger.ts`) — already planned
- Railway deployment must use GitHub repo as source (per Sammy's GitHub repo preference) — repo setup needed before first deploy
- Sammy wants structured JSON logs to stdout in production, pino-pretty in dev — standard Pino pattern

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-foundation*
*Context gathered: 2026-03-17*
