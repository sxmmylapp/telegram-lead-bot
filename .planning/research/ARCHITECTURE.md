# Architecture Research

**Domain:** Dual-component Telegram automation (Bot API + MTProto User API)
**Researched:** 2026-03-17
**Confidence:** HIGH

## Standard Architecture

Single Node.js process running two independent Telegram clients that share a common AI service layer. No database -- Telegram stores conversation history, GramJS fetches it on demand. Session persistence via StringSession as an env var.

### System Overview

```
                    Railway Container (Single Process)
┌──────────────────────────────────────────────────────────────────┐
│                                                                  │
│                    +---------------------------+                  │
│                    |       Entry Point         |                  │
│                    |       (index.ts)          |                  │
│                    +---------------------------+                  │
│                    |  Config (Zod) | Logger    |                  │
│                    +------+----------+---------+                  │
│                           |          |                            │
│              +------------+          +------------+               │
│              |                                    |               │
│    +---------v---------+            +-------------v-----------+   │
│    |   Bot Component   |            |   User API Component    |   │
│    |   (grammy)        |            |   (GramJS / MTProto)    |   │
│    +-------------------+            +-------------------------+   │
│    | - Long polling    |            | - MTProto TCP conn      |   │
│    | - Group posting   |            | - NewMessage listener   |   │
│    | - Cron scheduler  |            | - Typing simulation     |   │
│    | - Template rotate |            | - Reply delays          |   │
│    | - Bot commands    |            | - Active hours gate     |   │
│    +-------------------+            +----------+--------------+   │
│                                                |                  │
│                                     +----------v--------------+   │
│                                     |    Shared Services      |   │
│                                     +-------------------------+   │
│                                     | - Rate limiter          |   │
│                                     | - Delay / timing        |   │
│                                     | - Active hours          |   │
│                                     +----------+--------------+   │
│                                                |                  │
│                                     +----------v--------------+   │
│                                     |    AI Service           |   │
│                                     |    (Anthropic SDK)      |   │
│                                     +-------------------------+   │
│                                     | - System prompt         |   │
│                                     | - History transformer   |   │
│                                     | - Response generation   |   │
│                                     +-------------------------+   │
│                                                                   │
│                                     +-------------------------+   │
│                                     |    External State       |   │
│                                     +-------------------------+   │
│                                     | - StringSession (env)   |   │
│                                     | - Telegram history (API)|   │
│                                     +-------------------------+   │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘

External connections:
  Bot Component ──HTTP──> Telegram Bot API (api.telegram.org)
  User API ──MTProto/TCP──> Telegram DC servers (149.154.x.x)
  AI Service ──HTTPS──> Anthropic API (api.anthropic.com)
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| **Entry Point** (`index.ts`) | Bootstrap config, logger, start both components, handle graceful shutdown | `Promise.all([startBot(), startUserClient()])` + SIGTERM handler |
| **Config** (`config.ts`) | Parse and validate all env vars via Zod at startup. Crash immediately on invalid config. | Zod schema with `.parse(process.env)`, typed exports |
| **Logger** (`logger.ts`) | Centralized Pino logger, child loggers per component | `pino` with JSON in production, `pino-pretty` in dev |
| **Bot Component** (`bot/`) | grammY bot lifecycle, group posting on cron schedule, message template rotation | grammY long polling + `node-cron` for scheduling |
| **User API Component** (`userapi/`) | GramJS client lifecycle, DM monitoring, reply orchestration (delays, typing, rate limits, active hours) | GramJS `TelegramClient` + `NewMessage` event handler filtered to `isPrivate` |
| **AI Service** (`ai/`) | Convert Telegram history to Claude messages, generate contextual replies as Sammy | `@anthropic-ai/sdk`, system prompt + history-to-messages transformer |
| **Shared Services** (`services/`) | Cross-cutting concerns: rate limiting, random delays, active hours gating | Custom rate limiter, `setTimeout`-based delays, timezone-aware hour checks |

## Recommended Project Structure

```
src/
├── index.ts               # Entry point: starts both components, graceful shutdown
├── config.ts              # Zod-validated env vars, typed config export
├── logger.ts              # Pino logger (centralized, structured)
├── types.ts               # Shared TypeScript interfaces
├── bot/                   # Bot API component (grammy)
│   ├── bot.ts             # grammy Bot instance, middleware, commands
│   ├── scheduler.ts       # node-cron daily posting logic
│   └── templates.ts       # Message templates with rotation
├── userapi/               # User API component (GramJS/MTProto)
│   ├── client.ts          # TelegramClient init, session, connection
│   ├── dm-listener.ts     # NewMessage event handler (private only)
│   └── actions.ts         # Typing simulation, read receipts, send reply
├── ai/                    # Claude integration
│   ├── claude.ts          # Anthropic SDK client, response generation
│   ├── prompt.ts          # System prompt definition and templates
│   └── history.ts         # Telegram messages -> Claude messages transformer
└── services/              # Shared utilities
    ├── rate-limiter.ts    # Token bucket or sliding window rate limiter
    ├── delay.ts           # Random delay generator, sleep utilities
    └── active-hours.ts    # Time-of-day gating logic
```

### Structure Rationale

- **`bot/` and `userapi/` separation:** Two fundamentally different protocols (HTTP Bot API vs. binary MTProto), different risk profiles, different responsibilities. They share no Telegram-specific code. The bot is disposable; the user API is critical.
- **`ai/` isolation:** Pure service that receives text history and returns a response string. Knows nothing about Telegram. Testable in isolation and swappable (different model, different provider) without touching Telegram code.
- **`services/` for cross-cutting concerns:** Rate limiting, delays, and active hours are used by the user API component but defined separately. Prevents the DM listener from becoming a god module.
- **Flat file structure within folders:** Each folder has 2-3 files max. No nested subdirectories. This project is small enough that flat-within-folder is clearer than deep nesting.

## Architectural Patterns

### Pattern 1: Single Process, Dual Connection

**What:** Both the grammY bot (long polling) and GramJS client (persistent MTProto connection) run in one Node.js process. The entry point starts both and handles graceful shutdown.
**When to use:** Always for this project. Low throughput (under 100 DMs/day), single user, no scaling needed.
**Trade-offs:**
- Pro: Simple deployment (one Railway service), shared config/logging, no IPC overhead
- Pro: A single process crash restarts both components together (Railway auto-restart)
- Con: If one component blocks the event loop, the other stalls (mitigated by async nature of both libs)

**Example:**
```typescript
// src/index.ts
import { startBot } from './bot/bot.js';
import { startUserClient } from './userapi/client.js';
import { config } from './config.js';
import { logger } from './logger.js';

async function main() {
  logger.info('Starting Telegram Lead Bot');

  await Promise.all([
    startBot(config, logger.child({ component: 'bot' })),
    startUserClient(config, logger.child({ component: 'user-api' })),
  ]);

  logger.info('All components running');
}

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down');
  await bot.stop();
  await userClient.disconnect();
  process.exit(0);
});

main().catch((err) => {
  logger.fatal(err, 'Fatal startup error');
  process.exit(1);
});
```

### Pattern 2: Fail-Fast Config Validation

**What:** Parse all environment variables through Zod at startup. Missing or invalid config crashes immediately with a clear error.
**When to use:** Always. The very first thing the process does.
**Trade-offs:**
- Pro: A missing `GRAMJS_SESSION` surfaces at startup, not 2 hours later when a DM arrives
- Pro: Typed config object for the rest of the codebase
- Con: Slightly more setup code than raw `process.env`

**Example:**
```typescript
// src/config.ts
import { z } from 'zod';
import 'dotenv/config';

const ConfigSchema = z.object({
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  TELEGRAM_API_ID: z.coerce.number().positive(),
  TELEGRAM_API_HASH: z.string().min(1),
  GRAMJS_SESSION: z.string().min(1),
  ANTHROPIC_API_KEY: z.string().startsWith('sk-'),
  GROUP_CHAT_IDS: z.string().transform(s => s.split(',').map(Number)),
  ACTIVE_HOURS_START: z.coerce.number().min(0).max(23).default(9),
  ACTIVE_HOURS_END: z.coerce.number().min(0).max(23).default(22),
  TIMEZONE: z.string().default('America/New_York'),
  MAX_REPLIES_PER_HOUR: z.coerce.number().positive().default(10),
  MIN_REPLY_DELAY_MS: z.coerce.number().positive().default(30000),
  MAX_REPLY_DELAY_MS: z.coerce.number().positive().default(300000),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export const config = ConfigSchema.parse(process.env);
export type Config = z.infer<typeof ConfigSchema>;
```

### Pattern 3: Event-Driven DM Pipeline

**What:** The DM flow is a pipeline of discrete steps triggered by GramJS's `NewMessage` event. Each step is a separate function: receive -> gate check -> delay -> fetch history -> generate reply -> simulate typing -> send.
**When to use:** Every incoming private message.
**Trade-offs:**
- Pro: Each step is independently testable and loggable
- Pro: Easy to add/remove steps (e.g., add sentiment analysis between fetch and generate)
- Con: More files/functions than a monolithic handler

**Example:**
```typescript
// src/userapi/dm-listener.ts
import { NewMessage, NewMessageEvent } from 'telegram/events';
import { TelegramClient } from 'telegram';
import { isWithinActiveHours } from '../services/active-hours.js';
import { checkRateLimit } from '../services/rate-limiter.js';
import { randomDelay } from '../services/delay.js';
import { generateReply } from '../ai/claude.js';
import { simulateTypingAndSend } from './actions.js';
import { logger } from '../logger.js';

export function registerDmListener(client: TelegramClient) {
  client.addEventHandler(async (event: NewMessageEvent) => {
    if (!event.isPrivate) return;          // Only DMs
    if (event.message.out) return;         // Ignore own outgoing messages

    const senderId = event.message.senderId?.toString();
    const log = logger.child({ senderId, messageId: event.message.id });

    // Step 1: Active hours gate
    if (!isWithinActiveHours()) {
      log.info('Outside active hours, skipping');
      return;
    }

    // Step 2: Rate limit check
    if (!checkRateLimit(senderId)) {
      log.warn('Rate limited, skipping reply');
      return;
    }

    // Step 3: Random pre-reply delay (30s-5min)
    await randomDelay(30_000, 300_000);

    // Step 4: Fetch last N messages from conversation
    const messages = await client.getMessages(event.message.senderId!, { limit: 20 });

    // Step 5: Generate reply via Claude
    const reply = await generateReply(messages, event.message.text);

    // Step 6: Simulate typing, then send
    await simulateTypingAndSend(client, event.message, reply);

    log.info({ replyLength: reply.length }, 'DM reply sent');
  }, new NewMessage({}));
}
```

### Pattern 4: History-to-Messages Transformer

**What:** A pure function that converts GramJS message objects into Claude API message format (`{role, content}[]`). Maps Sammy's outgoing messages to `assistant` role, incoming messages to `user` role.
**When to use:** Before every Claude API call.
**Trade-offs:**
- Pro: Pure function, trivially testable with mock data
- Pro: Handles edge cases (media messages, empty texts) in one place
- Con: Token count grows with long conversations -- must cap at last N messages

**Example:**
```typescript
// src/ai/history.ts
import { Api } from 'telegram';

interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string;
}

const MAX_HISTORY = 20;
const SAMMY_USER_ID = '5876179331';

export function telegramToClaudeMessages(
  messages: Api.Message[]
): ClaudeMessage[] {
  return messages
    .filter((m) => m.text && m.text.trim().length > 0)
    .slice(-MAX_HISTORY)
    .map((m) => ({
      role: m.senderId?.toString() === SAMMY_USER_ID ? 'assistant' : 'user',
      content: m.text!,
    }));
}
```

### Pattern 5: Graceful Shutdown

**What:** Listen for SIGTERM/SIGINT, disconnect both Telegram clients cleanly, then exit.
**When to use:** Always. Railway sends SIGTERM before stopping a service.
**Trade-offs:**
- Pro: Prevents orphaned MTProto sessions, avoids session corruption
- Pro: Ensures pending operations complete
- Con: Minimal -- this is standard practice

## Data Flow

### DM Reply Flow (Primary)

```
[Lead sends DM to @sammylapp]
    |
    v
[GramJS NewMessage event fires (MTProto push, not polling)]
    |
    v
[dm-listener.ts: filter isPrivate + incoming only]
    |
    v
[active-hours.ts: within waking hours?] --NO--> [Skip]
    |YES
    v
[rate-limiter.ts: under reply limit?] --NO--> [Skip, log warning]
    |YES
    v
[delay.ts: wait 30s-5min random delay]
    |
    v
[client.getMessages(senderId, {limit: 20}): fetch conversation history]
    |
    v
[history.ts: transform Telegram messages -> Claude messages array]
    |   Maps msg.out=true -> role:"assistant", msg.out=false -> role:"user"
    |   Filters non-text messages, caps at 20 messages
    v
[claude.ts: anthropic.messages.create({system, messages, model})]
    |
    v
[Anthropic API returns response text]
    |
    v
[actions.ts: messages.SetTyping(SendMessageTypingAction) for calculated duration]
    |   Duration proportional to response length (simulate reading + typing)
    v
[actions.ts: client.sendMessage(senderId, reply)]
    |
    v
[rate-limiter.ts: increment counter for this sender]
    |
    v
[logger: record completion with senderId, timing, token usage]
```

### Daily Group Posting Flow (Secondary)

```
[node-cron fires at configured time (e.g., 10:00 AM ET)]
    |
    v
[scheduler.ts: select next template (index modulo array length)]
    |
    v
[templates.ts: return message text with CTA ("DM @sammylapp")]
    |
    v
[For each configured group chat ID:]
    |
    v
[bot.ts: bot.api.sendMessage(groupId, text)]
    |
    v
[logger: record post success/failure per group]
    |
    v
[Optional: random delay between groups to space out posts]
```

### Session Persistence Flow

```
[First run: Local development only]
    |
    v
[GramJS interactive auth: phone number -> code -> password]
    |
    v
[client.session.save() returns StringSession string]
    |
    v
[Copy string to Railway env var: GRAMJS_SESSION]
    |
    v
[All subsequent starts:]
    |
    v
[new TelegramClient(new StringSession(process.env.GRAMJS_SESSION), ...)]
    |
    v
[Authenticated immediately, no interactive prompts]
```

### Key Data Flows

1. **Conversation context:** DM received -> `getMessages(peer, {limit: 20})` -> `telegramToClaudeMessages()` -> Claude API `messages` array -> response text -> `sendMessage()` back. State lives entirely in Telegram.

2. **Session persistence:** First-time auth produces a StringSession string -> stored as env var on Railway. No files, no database, no volumes.

3. **Template rotation:** Array of message strings in `templates.ts`. Scheduler tracks current index in memory (counter modulo array length). Process restart resets to 0 -- acceptable because templates are varied.

## Scaling Considerations

This is a single-user bot. Scalability is not a primary concern.

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 0-50 DMs/day | Current architecture. Single process, in-memory rate limiter. Expected operating range. |
| 50-200 DMs/day | Add conversation priority (new leads first). Consider caching Claude responses for FAQ-style questions. |
| 200+ DMs/day | Would need a queue (Redis/BullMQ via Upstash). Rate limiting becomes critical. At this scale, evaluate whether the personal account can sustain the volume without Telegram flagging. |

### Scaling Priorities

1. **First bottleneck: Telegram flood limits on user account.** Telegram enforces flood limits on MTProto user accounts (exact thresholds undocumented, generally ~30 messages/minute for established accounts). GramJS throws `FloodWaitError` with a retry-after duration. The rate limiter is the primary defense.

2. **Second bottleneck: Claude API latency.** Each DM reply requires an Anthropic API call (~1-3s). Masked by the 30s-5min pre-reply delay. If many DMs arrive simultaneously, a queue would serialize processing.

## Anti-Patterns

### Anti-Pattern 1: Using User API for Group Posting

**What people do:** Use the GramJS user client for both DM replies AND group posting, avoiding a separate bot account.
**Why it's wrong:** Posting in groups from a user account via MTProto is high-risk for account restrictions. Telegram monitors automated group activity on personal accounts aggressively. Getting Sammy's account banned kills the entire DM flow.
**Do this instead:** Use the grammY bot (official Bot API) for group posting. The bot is disposable. Sammy's personal account is not.

### Anti-Pattern 2: Polling for DMs

**What people do:** Use `setInterval` calling `getMessages()` every N seconds to check for new DMs.
**Why it's wrong:** Wastes API calls, increases detection risk, adds latency, harder to manage than event-driven code.
**Do this instead:** Use GramJS's `addEventHandler` with `NewMessage`. The MTProto connection receives updates in real-time via persistent TCP. No polling needed.

### Anti-Pattern 3: Storing Session in Files

**What people do:** Use GramJS `StoreSession` for file-based session persistence.
**Why it's wrong:** Railway redeployments destroy the filesystem. You'd need a volume mount just for a session file.
**Do this instead:** Use `StringSession`, store the string as a Railway env var. One string, no files, no volumes.

### Anti-Pattern 4: Webhook Mode for grammY

**What people do:** Run grammY in webhook mode with an HTTP server.
**Why it's wrong:** Adds HTTP server dependency, requires public URL/SSL, zero benefit for a single-instance bot.
**Do this instead:** Use long-polling via `bot.start()`. Simpler, no HTTP server needed. Container platforms handle persistent connections well.

### Anti-Pattern 5: Instant Replies

**What people do:** Reply to DMs within milliseconds of receiving them.
**Why it's wrong:** No human responds in 50ms. Instant replies are the strongest automation signal to Telegram. They also feel robotic to leads.
**Do this instead:** Random delay (30s-5min) + typing indicator proportional to response length. This is the project's primary risk mitigation.

### Anti-Pattern 6: Unbounded Conversation History

**What people do:** Fetch ALL messages from a conversation to send to Claude.
**Why it's wrong:** Long conversations can have hundreds of messages. Wastes Claude API tokens and can exceed context limits.
**Do this instead:** Cap at 15-20 most recent messages. Sufficient for coherent conversation, keeps costs low.

### Anti-Pattern 7: Database for Conversation State

**What people do:** Replicate every message into Postgres/SQLite, query for Claude context.
**Why it's wrong:** For this use case, adds infrastructure complexity (migrations, ORM, connections) with no benefit. Telegram stores history natively. `getMessages()` returns fresh, in-sync data with zero maintenance.
**Do this instead:** Call `client.getMessages(peer, { limit: 20 })` per incoming DM. Fast MTProto call. The only persisted state is the session string (one env var).

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| **Telegram Bot API** | grammY long polling via HTTP. Bot token from BotFather. | Standard, low-risk. Token as `TELEGRAM_BOT_TOKEN` env var. |
| **Telegram MTProto** | GramJS persistent TCP connection. `API_ID` + `API_HASH` from my.telegram.org + StringSession. | Higher risk. First-time auth requires interactive phone code (do locally, save session string, deploy). |
| **Anthropic Claude API** | `@anthropic-ai/sdk` HTTPS. One request per DM reply. | `ANTHROPIC_API_KEY` env var. Use `claude-sonnet-4-20250514` for cost efficiency -- DM replies don't need Opus. |
| **Railway** | Container hosting, env var management, auto-restart on crash. | No volumes needed. Health check via process staying alive (no HTTP server). |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Bot <-> User API | **None.** | Completely independent. The link is the Telegram user flow (group post CTA -> DM), not code. |
| Bot <-> Shared Services | Direct import | Uses logger and config only. |
| User API <-> AI Service | Function call: `generateReply(history, newMessage) -> string` | User API fetches history, passes to AI, gets text back. AI has zero Telegram awareness. |
| User API <-> Shared Services | Direct import | Uses rate limiter, delay, active hours. All sync checks except delay (`await sleep()`). |

## Build Order (Dependencies)

The architecture has a clear dependency chain that dictates implementation order:

```
Phase 1: config.ts, logger.ts, types.ts
    |
    v (everything depends on config + logger)
Phase 2: services/ (rate-limiter, delay, active-hours)
    |
    v (AI service needs no Telegram, just config)
Phase 3: ai/ (claude.ts, prompt.ts, history.ts)
    |
    v (User API needs services + AI)
Phase 4: userapi/ (client.ts, dm-listener.ts, actions.ts)
    |
    v (Bot is independent, lowest complexity, built last)
Phase 5: bot/ (bot.ts, scheduler.ts, templates.ts)
    |
    v
Phase 6: index.ts (wire everything together, graceful shutdown)
```

**Rationale:** The riskiest, most valuable piece (User API + Claude DM replies) gets built and validated in Phases 3-4 before the simpler group posting component. If the User API proves infeasible due to Telegram restrictions, the architecture degrades gracefully -- the bot component still works independently for group posting.

## Sources

- [grammY Official Documentation](https://grammy.dev/) -- Bot API framework, long polling vs. webhooks (HIGH confidence)
- [grammY Deployment Types](https://grammy.dev/guide/deployment-types) -- Long polling recommended for containers over webhooks (HIGH confidence)
- [GramJS Documentation](https://gram.js.org/) -- MTProto client, StringSession, TelegramClient setup (HIGH confidence)
- [GramJS StringSession API](https://gram.js.org/beta/classes/sessions.StringSession.html) -- save/load/encode methods (HIGH confidence)
- [GramJS Events Documentation](https://painor.gitbook.io/gramjs/getting-started/updates-events) -- NewMessage handler, isPrivate filter (MEDIUM confidence)
- [GramJS SetTyping API](https://gram.js.org/tl/messages/SetTyping) -- Typing action simulation (HIGH confidence)
- [GramJS GetHistory](https://painor.gitbook.io/gramjs/working-with-messages/messages.gethistory) -- Fetching conversation history with limit param (MEDIUM confidence)
- [Anthropic Messages API](https://platform.claude.com/docs/en/api/messages-examples) -- Multi-turn format, system prompts, TypeScript SDK (HIGH confidence)
- [Lucyna Project](https://github.com/ryukaizen/lucyna) -- Real-world grammY + GramJS dual-component example (LOW confidence -- self-described as rushed)
- [GramJS GitHub](https://github.com/gram-js/gramjs) -- Source, issues, discussions on NewMessage (HIGH confidence)

---
*Architecture research for: Dual-component Telegram lead generation bot*
*Researched: 2026-03-17*
