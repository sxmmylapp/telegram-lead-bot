# Technology Stack

**Project:** Telegram Lead Bot
**Researched:** 2026-03-17
**Overall Confidence:** HIGH

## Recommended Stack

### Runtime & Language

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Node.js | 22 LTS | Runtime | Long-term support, Railway default, stable for long-running processes | HIGH |
| TypeScript | ^5.9.3 | Type safety | First-class support in grammY and Anthropic SDK, catches config mistakes early | HIGH |
| tsx | ^4.21.0 | TS execution | Zero-config TypeScript execution, no build step needed, faster dev cycle than tsc+node | HIGH |

**Rationale:** Node 22 LTS is the correct Railway target. tsx eliminates the need for a separate TypeScript compilation step -- it runs .ts files directly using esbuild under the hood. For a bot with no frontend build, this is simpler than maintaining a tsconfig.json build pipeline. Use tsx in development and production.

### Telegram Bot Account (Group Posting)

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| grammy | ^1.41.1 | Bot API framework | TypeScript-first, plugin ecosystem, actively maintained (published 9 days ago), best-in-class for Bot API bots | HIGH |

**Rationale:** grammY is the clear winner for TypeScript Telegram bots in 2026. It ships with full type safety, has an active plugin ecosystem (@grammyjs/* packages), and its middleware pattern makes it easy to compose bot logic. The framework handles all Bot API complexities (polling, webhooks, error recovery) so you focus on business logic.

**Key grammY capability for this project:** `bot.api.sendMessage(chatId, text)` for posting to group chats on a schedule. No plugins needed for the group-posting component -- it is a simple cron-triggered API call.

### Telegram User API (DM Monitoring & Replies)

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| telegram (GramJS) | ^2.26.22 | MTProto user API | Only mature TypeScript MTProto client, supports StringSession for persistent auth, NewMessage events for real-time DM monitoring | HIGH |

**Rationale:** GramJS (npm package name: `telegram`) is the only production-ready TypeScript MTProto implementation. It provides the full user API surface needed for this project:

- **`NewMessage` event handler** with `isPrivate` flag to filter DMs only
- **`client.iterMessages()`** to read conversation history (last N messages for Claude context)
- **`messages.SetTyping`** to send typing indicators before replies
- **`client.sendMessage()`** to send replies as Sammy's account
- **`StringSession`** for persistent auth (save session string as env var, no re-login on redeploy)

**Session persistence approach:** Use `StringSession`. After initial interactive login, call `client.session.save()` to get a session string. Store this in Railway env vars (`TELEGRAM_SESSION`). On startup, pass it to `new StringSession(process.env.TELEGRAM_SESSION)`. Zero file I/O, survives redeployments, no Railway volume needed for auth.

### AI Response Generation

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| @anthropic-ai/sdk | ^0.79.0 | Claude API client | Official Anthropic TypeScript SDK, typed responses, streaming support, actively maintained (published today) | HIGH |

**Rationale:** Direct Anthropic SDK, not a wrapper like Vercel AI SDK. For this use case (generate a single text reply per incoming DM), the SDK is straightforward:

```typescript
const response = await anthropic.messages.create({
  model: 'claude-haiku-4-5-20251001',
  max_tokens: 1024,
  system: SAMMY_SYSTEM_PROMPT,
  messages: conversationHistory,
});
```

**Model choice: `claude-haiku-4-5-20251001`** because:
- DM replies need to be fast (haiku is the fastest Claude model)
- Replies are short-form conversational text, not complex reasoning
- Cost-efficient for high volume (every incoming DM triggers a call)
- Haiku 4.5 is smart enough to qualify leads and steer toward booking calls

Do NOT use Sonnet or Opus for this. The quality delta is negligible for short conversational replies, and the latency/cost penalty is real. If reply quality proves insufficient during testing, upgrade to `claude-sonnet-4-5-20250929` as a fallback.

### Scheduling

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| croner | ^10.0.1 | Cron scheduling | Zero dependencies, native TypeScript types, used by PM2/Uptime Kuma, timezone support, async function support | HIGH |

**Rationale:** Use croner over node-cron. croner has zero dependencies, ships with TypeScript types natively (no @types package needed), supports timezone-aware scheduling (important for posting during target audience active hours), and handles async functions cleanly. node-cron works but lacks native TS types and timezone support.

Use croner for:
- Daily group posting schedule (e.g., "post at 10am EST to groups A, B, C")
- Active hours enforcement (check if current time is within Sammy's configured waking hours before replying)
- Queued message processing (flush queued replies at start of active hours)

### Logging

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| pino | ^10.3.1 | Structured logging | 5x faster than Winston, JSON output for Railway log capture, child loggers for component isolation | HIGH |
| pino-pretty | ^13.1.3 | Dev log formatting | Human-readable logs in local development | HIGH |

**Rationale:** Pino is the standard for Node.js structured logging. Railway captures stdout automatically as structured JSON. Pino's child logger pattern maps perfectly to this project's dual-component architecture:

```typescript
const logger = pino({ name: 'telegram-lead-bot' });
const botLogger = logger.child({ component: 'bot' });
const userLogger = logger.child({ component: 'user-api' });
const aiLogger = logger.child({ component: 'claude' });
```

### Configuration & Validation

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| zod | ^4.3.6 | Schema validation | Validate env vars and config at startup, TypeScript type inference from schemas, zero runtime dependencies | HIGH |
| dotenv | ^17.3.1 | Env var loading | Load .env file in local development, Railway sets env vars natively | HIGH |

**Rationale:** Zod validates all configuration at startup so the bot fails fast with clear error messages instead of crashing mid-operation when a missing env var is first accessed. Define a config schema, parse `process.env` through it, and get a typed config object.

```typescript
const ConfigSchema = z.object({
  TELEGRAM_BOT_TOKEN: z.string(),
  TELEGRAM_API_ID: z.coerce.number(),
  TELEGRAM_API_HASH: z.string(),
  TELEGRAM_SESSION: z.string(),
  ANTHROPIC_API_KEY: z.string(),
  GROUP_CHAT_IDS: z.string().transform(s => s.split(',')),
  ACTIVE_HOURS_START: z.coerce.number().default(9),
  ACTIVE_HOURS_END: z.coerce.number().default(22),
});
```

### Infrastructure

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Railway | - | Hosting | 24/7 long-running process, no function timeouts, env var management, stdout log capture, volume support if needed | HIGH |
| Docker | - | Build/deploy | Railway auto-detects Dockerfile, multi-stage build for smaller image | MEDIUM |

**Rationale:** Railway is the correct host for this workload. It runs services as long-lived processes (no cold starts, no invocation timeouts), which is essential for the GramJS MTProto connection that must stay alive to receive real-time NewMessage events. Railway captures stdout as logs, so Pino JSON output works out of the box.

**Dockerfile vs. Nixpacks:** Use Nixpacks (Railway default) for simplicity. Nixpacks auto-detects Node.js + TypeScript projects and handles the build. Only switch to a custom Dockerfile if you need specific system dependencies or image optimization. For a bot with no native modules, Nixpacks is sufficient.

**Railway volume:** NOT needed for the primary flow. StringSession is stored as an env var. However, if you later add a lightweight JSON state file (e.g., tracking which groups have been posted to today), mount a volume at `/app/data`. Cost: included in Railway plan.

## Supporting Libraries

| Library | Version | Purpose | When to Use | Confidence |
|---------|---------|---------|-------------|------------|
| @grammyjs/types | ^3.25.0 | Telegram Bot API types | Auto-installed with grammy, provides type definitions for all Bot API objects | HIGH |
| big-integer | (transitive) | Large number math | Transitive dep of GramJS, handles Telegram's 64-bit IDs | HIGH |

**Note on minimal dependencies:** This project deliberately avoids adding libraries for things that are simple enough in plain TypeScript:

- **Random delays:** `await new Promise(r => setTimeout(r, randomBetween(30000, 300000)))` -- no library needed
- **Rate limiting:** Simple counter with timestamp reset -- no library needed
- **Message templates:** Array of strings with random selection -- no library needed
- **Active hours check:** Compare `new Date().getHours()` against config range -- no library needed

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Bot framework | grammy | telegraf | Telegraf is older, grammY is its spiritual successor with better TS support and active development |
| Bot framework | grammy | node-telegram-bot-api | Lacks middleware pattern, no plugin ecosystem, weaker TypeScript support |
| MTProto client | telegram (GramJS) | tgsnake | Less mature, smaller community, fewer examples |
| MTProto client | telegram (GramJS) | @kirill_kopylov/telegram | Fork of GramJS with proxy support -- only use if proxy is needed |
| AI SDK | @anthropic-ai/sdk | @ai-sdk/anthropic (Vercel) | Unnecessary abstraction layer for single-provider usage, adds complexity |
| AI SDK | @anthropic-ai/sdk | langchain | Massive overkill for "send messages, get reply" -- LangChain adds complexity without value here |
| Scheduler | croner | node-cron | No native TypeScript types, no timezone support, more dependencies |
| Scheduler | croner | node-schedule | Heavier, less actively maintained, unnecessary features |
| Logger | pino | winston | Slower, more configuration overhead, Pino is the modern standard |
| Database | None (Telegram history) | SQLite | Out of scope per project requirements -- Telegram stores conversation history natively |
| Database | None (Telegram history) | Supabase | Explicitly out of scope -- avoids infra complexity for a bot that reads context from Telegram |

## Environment Variables

```bash
# Telegram Bot (Group Posting)
TELEGRAM_BOT_TOKEN=           # From BotFather via /setup-telegram-bot

# Telegram User API (DM Monitoring)
TELEGRAM_API_ID=              # From https://my.telegram.org/apps
TELEGRAM_API_HASH=            # From https://my.telegram.org/apps
TELEGRAM_SESSION=             # StringSession string, generated during first-time auth

# AI
ANTHROPIC_API_KEY=            # From ~/templates/.env.master

# Configuration
GROUP_CHAT_IDS=               # Comma-separated Telegram group/chat IDs for daily posting
ACTIVE_HOURS_START=9          # Hour (24h) to start responding to DMs
ACTIVE_HOURS_END=22           # Hour (24h) to stop responding to DMs
TIMEZONE=America/New_York     # Timezone for active hours and scheduling
MAX_REPLIES_PER_HOUR=10       # Rate limit for DM replies
MIN_REPLY_DELAY_MS=30000      # Minimum delay before replying (30s)
MAX_REPLY_DELAY_MS=300000     # Maximum delay before replying (5min)

# Environment
NODE_ENV=production           # Set by Railway
LOG_LEVEL=info                # Pino log level
```

## Installation

```bash
# Core dependencies
npm install grammy telegram @anthropic-ai/sdk pino croner zod dotenv

# Dev dependencies
npm install -D typescript tsx pino-pretty @types/node
```

## Project Structure (Recommended)

```
src/
  index.ts              # Entry point, starts both components
  config.ts             # Zod schema + env var parsing
  logger.ts             # Pino logger setup with child loggers
  bot/
    index.ts            # grammY bot setup and group posting logic
    messages.ts         # Message templates and rotation
    scheduler.ts        # Croner cron job for daily posts
  user/
    index.ts            # GramJS client setup and DM monitoring
    handler.ts          # NewMessage event handler
    typing.ts           # Typing simulation utility
    delay.ts            # Random delay utility
    rate-limiter.ts     # Reply rate limiting
    active-hours.ts     # Active hours check + message queueing
  ai/
    index.ts            # Anthropic client setup
    prompts.ts          # System prompt and conversation formatting
    respond.ts          # Generate reply from conversation context
```

## Sources

- [grammY official site](https://grammy.dev/) - Framework docs, plugin ecosystem (HIGH confidence)
- [grammY npm](https://www.npmjs.com/package/grammy) - v1.41.1, published 9 days ago (HIGH confidence, verified via npm CLI)
- [GramJS GitHub](https://github.com/gram-js/gramjs) - MTProto client source and examples (HIGH confidence)
- [GramJS docs - Authorization](https://gram.js.org/getting-started/authorization) - StringSession pattern (HIGH confidence)
- [GramJS docs - Events](https://painor.gitbook.io/gramjs/getting-started/updates-events) - NewMessage handler (HIGH confidence)
- [GramJS docs - SetTyping](https://gram.js.org/tl/messages/SetTyping) - Typing indicator API (HIGH confidence)
- [GramJS docs - GetHistory](https://gram.js.org/tl/messages/GetHistory) - Message history retrieval (HIGH confidence)
- [@anthropic-ai/sdk npm](https://www.npmjs.com/package/@anthropic-ai/sdk) - v0.79.0, published today (HIGH confidence, verified via npm CLI)
- [Anthropic TypeScript SDK GitHub](https://github.com/anthropics/anthropic-sdk-typescript) - Streaming examples, API patterns (HIGH confidence)
- [Anthropic Models Overview](https://platform.claude.com/docs/en/about-claude/models/overview) - Model IDs and capabilities (HIGH confidence)
- [Pino npm](https://www.npmjs.com/package/pino) - v10.3.1 (HIGH confidence, verified via npm CLI)
- [Croner docs](https://croner.56k.guru/) - Scheduler with TS types, timezone support (MEDIUM confidence)
- [Railway Volumes docs](https://docs.railway.com/reference/volumes) - Persistent storage (HIGH confidence)
- [Railway deployment blog](https://blog.railway.com/p/deploy-full-stack-typescript-apps-architectures-execution-models-and-deployment-choices) - Long-running process architecture (HIGH confidence)
- [Railway Dockerfiles docs](https://docs.railway.com/builds/dockerfiles) - Build configuration (HIGH confidence)
