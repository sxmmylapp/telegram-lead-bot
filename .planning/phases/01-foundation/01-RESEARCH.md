# Phase 1: Foundation - Research

**Researched:** 2026-03-17
**Domain:** TypeScript project scaffolding, GramJS MTProto client, structured logging, config validation, Railway deployment
**Confidence:** HIGH

## Summary

Phase 1 establishes the project skeleton: validated config via Zod, structured logging via Pino, a persistent GramJS StringSession connection to Telegram, and a 24/7 Railway deployment. This is a greenfield TypeScript project with no existing code.

The core technical risk is GramJS session stability on cloud provider IPs. Issue #773 documents Telegram forcibly logging out sessions on GCP and Azure VMs. Railway uses GCP infrastructure under the hood, so this risk applies directly. The mitigation is to set realistic `deviceModel`, `systemVersion`, and `appVersion` values on the GramJS client to appear like a legitimate desktop client, and to test empirically during Phase 1 before building dependent phases.

**Primary recommendation:** Use Zod v4 (latest stable) for config validation, Pino v10 for structured JSON logging, GramJS (`telegram` npm package v2.26.x) with StringSession for Telegram connectivity, and tsup for building. Deploy via Railway's Railpack auto-detection (no Dockerfile needed for Phase 1). Start the process directly with `node dist/index.js` -- NOT via `npm start` -- so SIGTERM reaches the app for graceful shutdown.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Nested Zod schema grouped by concern: `telegram` (apiId, apiHash, session, botToken), `claude` (apiKey, model), `schedule` (activeHours, timezone), `safety` (rateLimits, delays)
- Env vars use SCREAMING_SNAKE with service prefix: `TELEGRAM_API_ID`, `TELEGRAM_API_HASH`, `TELEGRAM_SESSION`, `TELEGRAM_BOT_TOKEN`, `CLAUDE_API_KEY`, etc.
- Single `src/config.ts` module validates all env vars at startup and exports a fully-typed config object
- All Phase 1 config is required -- startup fails fast with clear error messages listing every missing/malformed value
- Future phases add optional config fields as needed without breaking existing validation
- Separate one-time local script at `scripts/generate-session.ts` -- prompts for phone number, receives Telegram code, outputs StringSession string to copy-paste into Railway
- StringSession stored as `TELEGRAM_SESSION` env var on Railway -- survives redeploys without re-auth
- Session generation NEVER happens in production -- it's a manual one-time operation run locally by Sammy
- If session expires or becomes invalid at runtime: log the error clearly and exit with code 1 -- manual re-generation required
- GramJS client connection keeps the Node.js event loop alive -- no setInterval hacks needed
- Graceful shutdown on SIGTERM (Railway redeploy) and SIGINT (local dev): disconnect GramJS client, flush Pino logs, exit cleanly
- No HTTP health endpoint -- Railway monitors the process exit code (0 = healthy shutdown, 1 = error)
- Uncaught exceptions: log full stack trace via Pino, exit with code 1 -- Railway auto-restarts the service
- Unhandled promise rejections: same treatment as uncaught exceptions
- Single `src/` directory with flat module structure -- no monorepo, no workspaces
- Both bot account (grammY) and user API (GramJS) live in same codebase, same Railway service
- Key modules: `src/index.ts` (entry), `src/config.ts` (Zod validation), `src/logger.ts` (Pino setup), `src/telegram.ts` (GramJS client init)
- Build with tsup (fast TypeScript bundling), tsx for local dev
- `src/index.ts` follows init order: validate config -> init logger -> connect GramJS -> log "connected" -> stay alive

### Claude's Discretion
- Exact tsconfig and tsup config options
- package.json scripts and dev tooling (eslint, prettier -- keep it minimal)
- Pino log level configuration (INFO default, DEBUG via env var)
- Railway Dockerfile vs Nixpacks -- pick what's simpler
- Error message formatting for config validation failures

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| INFRA-01 | System validates all config (API keys, session string, group IDs, schedule, active hours) at startup via Zod and fails fast with clear errors | Zod v4 `safeParse` with nested schema, `z.object()` grouping, custom error formatting -- see Standard Stack and Code Examples sections |
| INFRA-02 | System logs all events as structured JSON via Pino to stdout | Pino v10 with child loggers per module, JSON to stdout in production, pino-pretty in dev -- see Standard Stack and Architecture Patterns sections |
| INFRA-03 | System runs as a single long-running process on Railway 24/7 | Railpack auto-detection, direct `node dist/index.js` start command, SIGTERM handler, no HTTP port needed -- see Architecture Patterns and Common Pitfalls sections |
| DM-02 | System uses persistent StringSession stored as Railway env var -- no repeated logins across restarts | GramJS `StringSession` from env var, `scripts/generate-session.ts` for one-time local generation, `client.session.save()` outputs string -- see Code Examples section |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `telegram` (GramJS) | 2.26.22 | MTProto user API client for Telegram | Only maintained Node.js MTProto library; handles StringSession, auto-reconnect, flood wait |
| `zod` | ^4.0.0 (v4 stable) | Config/env validation with static type inference | 14x faster parsing than v3, 57% smaller bundle, TypeScript-first, industry standard for env validation |
| `pino` | ^10.3.1 | Structured JSON logging | Fastest Node.js JSON logger, outputs to stdout by default, child logger pattern for per-module context |
| `tsup` | ^8.5.1 | TypeScript bundling for production | Zero-config esbuild wrapper, outputs CJS for Node.js, fast builds |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `pino-pretty` | ^13.1.2 | Human-readable log formatting | Dev dependency only -- used in local development via Pino transport |
| `tsx` | ^4.21.0 | TypeScript execution without compilation | Dev dependency -- used for `npm run dev` and running `scripts/generate-session.ts` locally |
| `input` | latest | Interactive CLI prompts | Used only in `scripts/generate-session.ts` for phone number and code input |
| `typescript` | ^5.7 | Type checking (not compilation -- tsup handles that) | Dev dependency for `tsc --noEmit` type checking |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| tsup | esbuild directly | tsup wraps esbuild with sane defaults (clean, dts, target) -- no reason to go lower-level |
| tsup | tsc | tsc is slower and doesn't bundle; tsup uses esbuild under the hood for speed |
| Zod v4 | Zod v3 | v3 is now maintenance-only; v4 is the new stable default as of July 2025 |
| Pino | Winston | Winston is 5-10x slower; Pino's JSON-first design matches Railway's stdout log capture |

**Installation:**
```bash
npm install telegram zod pino
npm install -D tsup tsx pino-pretty typescript input @types/node
```

## Architecture Patterns

### Recommended Project Structure
```
telegram-lead-bot/
├── src/
│   ├── index.ts          # Entry point: validate -> log -> connect -> stay alive
│   ├── config.ts          # Zod schema + parse process.env -> typed config object
│   ├── logger.ts          # Pino instance factory + child logger exports
│   └── telegram.ts        # GramJS TelegramClient creation + connect/disconnect
├── scripts/
│   └── generate-session.ts # One-time local script to get StringSession
├── tsup.config.ts         # Build configuration
├── tsconfig.json          # TypeScript config (type checking only)
├── package.json
├── .env.example           # Template showing required env vars
└── .gitignore
```

### Pattern 1: Startup Sequence (index.ts)
**What:** Linear boot sequence with fail-fast validation
**When to use:** Always -- this is the entry point
**Example:**
```typescript
// src/index.ts
import { loadConfig } from './config';
import { createLogger } from './logger';
import { connectTelegram, disconnectTelegram } from './telegram';

async function main() {
  // Step 1: Validate config (throws on failure)
  const config = loadConfig();

  // Step 2: Initialize logger
  const logger = createLogger(config);
  logger.info({ event: 'startup' }, 'Config validated, starting up');

  // Step 3: Connect GramJS
  const client = await connectTelegram(config, logger);
  logger.info({ event: 'connected' }, 'Telegram client connected');

  // Step 4: Graceful shutdown handlers
  const shutdown = async (signal: string) => {
    logger.info({ event: 'shutdown', signal }, 'Received signal, shutting down');
    await disconnectTelegram(client);
    logger.flush();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

// Global error handlers
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
  process.exit(1);
});

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
```

### Pattern 2: Nested Zod Config Schema (config.ts)
**What:** Grouped env var validation with type-safe output
**When to use:** Single source of truth for all configuration
**Example:**
```typescript
// src/config.ts
import { z } from 'zod';

const configSchema = z.object({
  telegram: z.object({
    apiId: z.coerce.number().int().positive(),
    apiHash: z.string().min(1),
    session: z.string().min(1),
    botToken: z.string().min(1),
  }),
  claude: z.object({
    apiKey: z.string().min(1),
    model: z.string().default('claude-sonnet-4-20250514'),
  }),
  schedule: z.object({
    activeHoursStart: z.coerce.number().int().min(0).max(23),
    activeHoursEnd: z.coerce.number().int().min(0).max(23),
    timezone: z.string().default('America/New_York'),
  }),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export type Config = z.infer<typeof configSchema>;

export function loadConfig(): Config {
  const result = configSchema.safeParse({
    telegram: {
      apiId: process.env.TELEGRAM_API_ID,
      apiHash: process.env.TELEGRAM_API_HASH,
      session: process.env.TELEGRAM_SESSION,
      botToken: process.env.TELEGRAM_BOT_TOKEN,
    },
    claude: {
      apiKey: process.env.CLAUDE_API_KEY,
      model: process.env.CLAUDE_MODEL,
    },
    schedule: {
      activeHoursStart: process.env.ACTIVE_HOURS_START,
      activeHoursEnd: process.env.ACTIVE_HOURS_END,
      timezone: process.env.TIMEZONE,
    },
    logLevel: process.env.LOG_LEVEL,
  });

  if (!result.success) {
    const formatted = result.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    console.error(`Config validation failed:\n${formatted}`);
    process.exit(1);
  }

  return result.data;
}
```

### Pattern 3: Centralized Logger with Child Loggers (logger.ts)
**What:** Single Pino instance with per-module child loggers
**When to use:** Every module imports from logger.ts
**Example:**
```typescript
// src/logger.ts
import pino from 'pino';
import type { Config } from './config';

let rootLogger: pino.Logger;

export function createLogger(config: Config): pino.Logger {
  rootLogger = pino({
    level: config.logLevel,
    transport:
      process.env.NODE_ENV === 'development'
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined,
    base: { service: 'telegram-lead-bot' },
    timestamp: pino.stdTimeFunctions.isoTime,
  });
  return rootLogger;
}

export function getLogger(module: string): pino.Logger {
  if (!rootLogger) {
    throw new Error('Logger not initialized. Call createLogger first.');
  }
  return rootLogger.child({ module });
}
```

### Pattern 4: GramJS Client with StringSession (telegram.ts)
**What:** GramJS TelegramClient creation with realistic client parameters
**When to use:** Single client instance used throughout app lifecycle
**Example:**
```typescript
// src/telegram.ts
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';
import type { Config } from './config';
import type { Logger } from 'pino';

export async function connectTelegram(
  config: Config,
  logger: Logger
): Promise<TelegramClient> {
  const session = new StringSession(config.telegram.session);

  const client = new TelegramClient(session, config.telegram.apiId, config.telegram.apiHash, {
    connectionRetries: 5,
    retryDelay: 1000,
    autoReconnect: true,
    deviceModel: 'MacBook Pro',
    systemVersion: '14.0',
    appVersion: '1.0.0',
    floodSleepThreshold: 60,
  });

  await client.connect();

  const me = await client.getMe();
  logger.info(
    { event: 'telegram_connected', userId: me?.id?.toString() },
    'GramJS client connected'
  );

  return client;
}

export async function disconnectTelegram(client: TelegramClient): Promise<void> {
  await client.disconnect();
}
```

### Anti-Patterns to Avoid
- **Using `npm start` as Railway start command:** npm intercepts SIGTERM and your shutdown handlers never fire. Use `node dist/index.js` directly.
- **Calling `process.exit()` inside SIGTERM handler without disconnecting GramJS:** The GramJS `_updateLoop` has a hanging promise. Always call `client.disconnect()` first, then `process.exit(0)` after a short timeout as fallback.
- **Using `setInterval` to keep process alive:** GramJS's connection loop already keeps the event loop alive. A keepalive interval is unnecessary and wastes resources.
- **Importing pino-pretty in production:** Only use via `transport` option and only when `NODE_ENV === 'development'`. In production, Pino outputs JSON to stdout by default -- Railway captures it automatically.
- **Generating StringSession in production code:** The interactive auth flow (phone number, code) must only run locally via `scripts/generate-session.ts`. Production loads the pre-generated session from an env var.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Env var validation | Custom `if (!process.env.X)` chains | Zod `safeParse` with nested schema | Zod gives type inference, coercion (string->number for API_ID), and aggregated error reporting for free |
| Structured logging | Custom `JSON.stringify` wrapper around console.log | Pino with child loggers | Pino handles timestamps, levels, serialization, redaction, and is 5-10x faster than alternatives |
| TypeScript compilation | Raw `tsc` for production builds | tsup (esbuild under the hood) | tsup handles bundling, tree shaking, and target configuration in one step; tsc is for type checking only |
| MTProto protocol | Raw WebSocket/TCP to Telegram | GramJS `telegram` package | MTProto is a complex binary protocol with encryption layers, DC migration, and flood handling |
| Session persistence | Custom file/database session storage | GramJS `StringSession` + env var | StringSession serializes the entire auth state into a single string, perfect for env var storage |
| Graceful shutdown | Manual signal handling with complex cleanup | Structured shutdown sequence (see Pattern 1) | The disconnect + flush + exit pattern is well-established; the main pitfall (GramJS hanging promise) is documented |

**Key insight:** Every "simple" thing in this phase (logging, config, session management) has edge cases that existing libraries handle. The session string alone encodes DC info, auth keys, and server salts -- building that from scratch would be months of work.

## Common Pitfalls

### Pitfall 1: GramJS Session Logout on Cloud IPs
**What goes wrong:** Telegram forcibly terminates sessions running from datacenter IPs (GCP, Azure confirmed). Railway runs on GCP infrastructure.
**Why it happens:** Telegram's anti-abuse system flags datacenter IPs as suspicious, especially when device metadata looks like a server (e.g., `deviceModel: "Linux"` from `os.type()`).
**How to avoid:**
1. Set realistic client parameters: `deviceModel: 'MacBook Pro'`, `systemVersion: '14.0'`, `appVersion: '1.0.0'`
2. Generate the session locally on a residential IP (Sammy's MacBook), then deploy the session string to Railway
3. Avoid excessive `connect`/`disconnect` cycles -- stay connected
4. Monitor for `AuthKeyError` or forced logout in logs
**Warning signs:** Repeated "session expired" errors within hours/days of deployment, Telegram sending "new login from unknown device" notifications to Sammy's phone.
**Confidence:** MEDIUM -- Issue #773 confirms the problem on GCP/Azure but no definitive fix. Railway's specific IP ranges may or may not be flagged. Must test empirically.

### Pitfall 2: SIGTERM Never Reaches Node.js App
**What goes wrong:** Railway sends SIGTERM on redeploy, but the app doesn't shut down gracefully -- logs show abrupt termination.
**Why it happens:** If the start command is `npm start`, npm becomes PID 1 and intercepts SIGTERM. Your `process.on('SIGTERM')` handler never fires.
**How to avoid:** Set Railway's start command to `node dist/index.js` (direct Node invocation). Alternatively, set the custom start command in Railway service settings.
**Warning signs:** No "shutting down" log messages during redeploys; GramJS connection state may become corrupted.
**Confidence:** HIGH -- Railway's official documentation explicitly warns about this.

### Pitfall 3: GramJS Disconnect Hangs the Process
**What goes wrong:** `client.disconnect()` is called but the process doesn't exit for 1-2 minutes.
**Why it happens:** GramJS has an internal `_updateLoop` with a hanging promise that runs every ~60 seconds to ping Telegram. After `disconnect()`, this promise may still be pending.
**How to avoid:** After calling `client.disconnect()`, set a 5-second timeout then call `process.exit(0)` as a forced fallback:
```typescript
const shutdown = async (signal: string) => {
  logger.info({ signal }, 'Shutting down...');
  await client.disconnect();
  logger.flush();
  // Force exit after 5s if disconnect hangs
  setTimeout(() => process.exit(0), 5000).unref();
};
```
**Warning signs:** Process stays alive after SIGTERM; Railway force-kills it after its timeout.
**Confidence:** HIGH -- Confirmed in GramJS issue #242 and #615.

### Pitfall 4: Zod v4 Import Path Confusion
**What goes wrong:** Code imports from wrong path or uses v3 API patterns with v4.
**Why it happens:** Zod v4 was published at `zod/v4` during beta, then promoted to the default `zod` export in July 2025. Old tutorials show v3 patterns.
**How to avoid:** Install `zod@^4.0.0` and import from `"zod"` (not `"zod/v4"`). The v3 API is mostly compatible but check for breaking changes in custom error handling.
**Warning signs:** TypeScript compilation errors referencing missing Zod methods.
**Confidence:** HIGH -- Official Zod v4 documentation confirms the transition.

### Pitfall 5: Pino Transport in Production
**What goes wrong:** Logs are formatted as pretty-printed text instead of JSON in production, or pino-pretty crashes because it's not installed.
**Why it happens:** Transport configuration doesn't properly gate on `NODE_ENV`, or pino-pretty is a devDependency but the production build tries to load it.
**How to avoid:** Only set `transport` option when `NODE_ENV === 'development'`. In production, Pino outputs JSON to stdout by default -- no transport needed. Ensure pino-pretty is in devDependencies only.
**Warning signs:** Pretty-printed logs in Railway log viewer; slower log throughput.
**Confidence:** HIGH -- Standard Pino documentation.

## Code Examples

### Session Generation Script
```typescript
// scripts/generate-session.ts
// Run locally with: npx tsx scripts/generate-session.ts
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';
import input from 'input';

const apiId = Number(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH!;

(async () => {
  const session = new StringSession('');
  const client = new TelegramClient(session, apiId, apiHash, {
    connectionRetries: 5,
    deviceModel: 'MacBook Pro',
    systemVersion: '14.0',
    appVersion: '1.0.0',
  });

  await client.start({
    phoneNumber: async () => await input.text('Phone number (with country code): '),
    password: async () => await input.text('2FA password (if enabled): '),
    phoneCode: async () => await input.text('Code from Telegram: '),
    onError: (err) => console.error('Auth error:', err),
  });

  console.log('\n--- Copy this StringSession to TELEGRAM_SESSION env var ---');
  console.log(client.session.save());
  console.log('--- End of session string ---\n');

  await client.disconnect();
  process.exit(0);
})();
```

### tsup Configuration
```typescript
// tsup.config.ts
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs'],
  target: 'node20',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  // Do NOT enable dts -- type checking is done separately via tsc
  // Do NOT bundle node_modules -- they're installed in production
  noExternal: [],
  external: ['telegram', 'zod', 'pino', 'pino-pretty'],
});
```

### tsconfig.json
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "strict": true,
    "outDir": "dist",
    "rootDir": "src",
    "declaration": false,
    "noEmit": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "scripts"]
}
```

### package.json Scripts
```json
{
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsup",
    "start": "node dist/index.js",
    "typecheck": "tsc --noEmit",
    "generate-session": "tsx scripts/generate-session.ts"
  }
}
```

### Railway Start Command
Set in Railway service settings (not in package.json):
```
node dist/index.js
```
This ensures SIGTERM is received directly by the Node.js process.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Zod v3 (z.object) | Zod v4 (same API, 14x faster) | July 2025 | Install `zod@^4.0.0`, import from `"zod"` -- no code changes needed |
| Pino v8/v9 | Pino v10 | Late 2024 | Minor API changes, same configuration pattern |
| tsc for builds | tsup (esbuild) for builds, tsc for type checking | 2023+ | Faster builds, proper bundling; tsc --noEmit for types only |
| Dockerfile for Railway | Railpack auto-detection | 2024+ | Railway detects Node.js, runs build script, no Dockerfile needed |
| npm start on Railway | Direct `node dist/index.js` | Always (documented) | SIGTERM reaches app; mandatory for graceful shutdown |

**Deprecated/outdated:**
- `telegram/gramjs` import path: Use `telegram` and `telegram/sessions` (the npm package name)
- Zod v3 (`zod@3.x`): Now in maintenance mode; v4 is the new default
- GramJS `client.start()` for production auth: Only use for interactive session generation; production loads StringSession from env

## Open Questions

1. **Will Railway's specific IP ranges trigger Telegram's anti-abuse?**
   - What we know: GCP and Azure VMs are confirmed to trigger logouts (issue #773). Railway runs on GCP.
   - What's unclear: Whether Railway's specific IP allocation is flagged, and whether realistic device parameters mitigate the risk.
   - Recommendation: Test empirically in Phase 1. Deploy, connect, and monitor for 48+ hours. If sessions are killed, investigate proxy options or alternative hosting.

2. **GramJS `_updateLoop` cleanup after disconnect**
   - What we know: `client.disconnect()` may leave a hanging promise for up to 60 seconds (issues #242, #615).
   - What's unclear: Whether this was fixed in recent GramJS versions (2.26.x).
   - Recommendation: Implement the 5-second timeout fallback to `process.exit(0)` regardless. Test in development to verify disconnect behavior.

3. **tsup external dependencies configuration**
   - What we know: tsup can bundle or externalize dependencies. For a Node.js service (not a library), externalizing `node_modules` is standard.
   - What's unclear: Whether GramJS has any special bundling requirements (native modules, dynamic imports).
   - Recommendation: Start with all dependencies external (standard Node.js service pattern). If build issues arise, selectively bundle.

## Sources

### Primary (HIGH confidence)
- [GramJS Official Docs - Quick Start](https://gram.js.org/) - Client setup, StringSession, authentication flow
- [GramJS npm package](https://www.npmjs.com/package/telegram) - Version 2.26.22, installation
- [GramJS TelegramClientParams](https://cdn.jsdelivr.net/npm/telegram@2.19.5/client/telegramBaseClient.d.ts) - Full TypeScript interface for client options
- [Pino API Documentation](https://github.com/pinojs/pino/blob/main/docs/api.md) - Configuration, child loggers, transports, timestamp functions
- [Zod v4 Official Docs](https://zod.dev/v4) - Stable release, installation, migration from v3
- [Zod v4 Versioning](https://zod.dev/v4/versioning) - Import paths, package structure
- [Railway SIGTERM Documentation](https://docs.railway.com/deployments/troubleshooting/nodejs-sigterm-handling) - Direct node invocation required for signal handling
- [Railway Dockerfile Docs](https://docs.railway.com/builds/dockerfiles) - Build detection, ARG handling, custom paths
- [tsup Official Docs](https://tsup.egoist.dev/) - Configuration, esbuild backend, output formats
- [tsx npm package](https://tsx.is/) - TypeScript execution for development

### Secondary (MEDIUM confidence)
- [GramJS Issue #773](https://github.com/gram-js/gramjs/issues/773) - Session logout on cloud VMs (GCP, Azure confirmed)
- [GramJS Issue #242](https://github.com/gram-js/gramjs/issues/242) - Disconnect hanging promise behavior
- [GramJS Issue #615](https://github.com/gram-js/gramjs/issues/615) - _updateLoop not fully cleaned up after disconnect
- [Railway Node.js Deployment Guide](https://docs.railway.com/guides/deploy-node-express-api-with-auto-scaling-secrets-and-zero-downtime) - Build/start commands, env vars, health checks
- [Pino Logger Guide (SigNoz)](https://signoz.io/guides/pino-logger/) - Child logger patterns, TypeScript setup, dev/prod configuration
- [Zod Env Validation Patterns](https://www.creatures.sh/blog/env-type-safety-and-validation/) - safeParse, error formatting, coercion

### Tertiary (LOW confidence)
- [GramJS InitConnection API](https://gram.js.org/beta/classes/Api.InitConnection.html) - deviceModel, systemVersion, appVersion defaults
- [Railway Blog - Full-Stack TypeScript](https://blog.railway.com/p/deploy-full-stack-typescript-apps-architectures-execution-models-and-deployment-choices) - General deployment patterns

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries are well-established, actively maintained, and versions confirmed via npm
- Architecture: HIGH - Patterns are standard Node.js service patterns, verified against official docs
- Pitfalls: MEDIUM - GramJS cloud IP issue (#773) is confirmed but Railway-specific impact is untested; other pitfalls are HIGH confidence
- Config validation: HIGH - Zod v4 is stable and well-documented for this exact use case
- Session persistence: MEDIUM - StringSession mechanism is well-documented, but cloud IP behavior is the risk factor

**Research date:** 2026-03-17
**Valid until:** 2026-04-17 (30 days -- stable technology stack, low churn)
