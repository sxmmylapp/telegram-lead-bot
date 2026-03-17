# Roadmap: Telegram Lead Bot

## Overview

This roadmap delivers a dual-component Telegram automation system in four phases. Foundation establishes the project skeleton, config validation, logging, and proves the GramJS session works on Railway. The DM reply engine -- the core value -- ships second with all safety measures baked in from day one (delays, typing simulation, rate limiting, active hours). Group posting ships third since it uses the low-risk official Bot API and only exists to feed leads into the DM pipeline. The final phase adds edge case handling and Sammy's manual takeover controls.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Foundation** - Config validation, structured logging, GramJS session persistence on Railway
- [ ] **Phase 2: DM Reply Engine** - DM monitoring, Claude AI responses, and all anti-detection safety measures
- [ ] **Phase 3: Group Posting** - Scheduled bot messages in Telegram groups with template rotation
- [ ] **Phase 4: Hardening & Lead Management** - Edge case handling, graceful degradation, and Sammy's manual takeover commands

## Phase Details

### Phase 1: Foundation
**Goal**: The system boots on Railway with validated config, structured logging, and a persistent GramJS session that survives redeploys
**Depends on**: Nothing (first phase)
**Requirements**: INFRA-01, INFRA-02, INFRA-03, DM-02
**Success Criteria** (what must be TRUE):
  1. Process starts on Railway, validates all config (API keys, session string, group IDs, schedule, active hours) via Zod, and exits with a clear error message if any value is missing or malformed
  2. Every event (startup, config loaded, connection established, errors) is logged as structured JSON to stdout with timestamp, level, and module name
  3. GramJS client connects using a StringSession from a Railway env var and maintains the session across Railway redeploys without requiring re-authentication
  4. Process stays running 24/7 on Railway as a single long-running service
**Plans**: TBD

Plans:
- [ ] 01-01: TBD
- [ ] 01-02: TBD

### Phase 2: DM Reply Engine
**Goal**: Leads who DM Sammy get intelligent, human-feeling Claude-powered replies that steer toward booking a discovery call -- with all anti-detection measures active from the first message
**Depends on**: Phase 1
**Requirements**: DM-01, DM-03, AI-01, AI-02, AI-03, AI-04, AI-05, SAFE-01, SAFE-02, SAFE-03, SAFE-04, SAFE-05, SAFE-06, SAFE-07
**Success Criteria** (what must be TRUE):
  1. When a lead sends a DM to Sammy's Telegram account, the system detects it, waits a random 30s-5min delay, shows a typing indicator proportional to reply length, and then sends a Claude-generated response that sounds like Sammy
  2. Claude receives the last 15-20 messages of conversation history so replies are contextually coherent across multiple turns, and the system prompt includes Sammy's portfolio, services, and guidance to steer toward booking a call
  3. The system only replies during configured active hours (queuing off-hours messages), enforces per-hour and per-day rate limits, marks messages as read after processing, and batches rapid consecutive messages from the same lead into one response
  4. Daily reply caps start low (5/day) and automatically ramp up over 3-4 weeks to the configured maximum
  5. If the Claude API fails, the system retries with backoff and never sends an error message to a lead
**Plans**: TBD

Plans:
- [ ] 02-01: TBD
- [ ] 02-02: TBD
- [ ] 02-03: TBD

### Phase 3: Group Posting
**Goal**: A bot account posts daily in configured Telegram groups advertising Sammy's services with a CTA to DM him, rotating messages to avoid fatigue and spam detection
**Depends on**: Phase 1
**Requirements**: POST-01, POST-02, POST-03, POST-04, POST-05
**Success Criteria** (what must be TRUE):
  1. Bot posts a message in each configured Telegram group on a per-group cron schedule, and each message includes a natural CTA directing leads to DM @sammylapp
  2. Messages rotate through 10+ templates so no two consecutive posts in the same group are identical
  3. When the bot is banned or kicked from a group (send failure), it logs an alert and continues operating in remaining groups without crashing
**Plans**: TBD

Plans:
- [ ] 03-01: TBD
- [ ] 03-02: TBD

### Phase 4: Hardening & Lead Management
**Goal**: Sammy can manually take over conversations, and the system handles edge cases gracefully without silent failures or double-replies
**Depends on**: Phase 2
**Requirements**: LEAD-01, LEAD-02
**Success Criteria** (what must be TRUE):
  1. Sammy can send /takeover @username to his bot and AI replies pause for that specific conversation while all other conversations continue normally
  2. Sammy can send /resume @username to re-enable AI for a paused conversation
  3. Connection health checks run periodically and the system auto-reconnects on GramJS connection failure without losing queued messages
**Plans**: TBD

Plans:
- [ ] 04-01: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4
Note: Phase 3 depends only on Phase 1 (not Phase 2), so it could theoretically run in parallel with Phase 2, but sequential execution is simpler.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 0/2 | Not started | - |
| 2. DM Reply Engine | 0/3 | Not started | - |
| 3. Group Posting | 0/2 | Not started | - |
| 4. Hardening & Lead Management | 0/1 | Not started | - |
