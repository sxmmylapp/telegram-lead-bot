# Requirements: Telegram Lead Bot

**Defined:** 2026-03-17
**Core Value:** Every lead who DMs gets a fast, intelligent, human-feeling response that drives toward booking a call.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Infrastructure

- [ ] **INFRA-01**: System validates all config (API keys, session string, group IDs, schedule, active hours) at startup via Zod and fails fast with clear errors
- [ ] **INFRA-02**: System logs all events (incoming messages, AI calls, sent replies, rate limit hits, errors) as structured JSON via Pino to stdout
- [ ] **INFRA-03**: System runs as a single long-running process on Railway 24/7

### Group Posting

- [ ] **POST-01**: Bot account posts daily messages in configured Telegram group chats advertising software dev services
- [ ] **POST-02**: Bot rotates through 10+ message templates to avoid repetition and anti-spam detection
- [ ] **POST-03**: Each group post includes a natural CTA directing leads to DM Sammy's personal account (@sammylapp)
- [ ] **POST-04**: Bot detects when it has been banned from a group (send failure) and logs an alert
- [ ] **POST-05**: Posting schedule is configurable via cron expression per group

### DM Monitoring

- [ ] **DM-01**: System monitors incoming private messages to Sammy's personal Telegram account via GramJS (MTProto user API)
- [ ] **DM-02**: System uses persistent StringSession stored as Railway env var — no repeated logins across restarts
- [ ] **DM-03**: System implements connection health checks (periodic getMe() calls) and automatic reconnection on failure

### AI Responses

- [ ] **AI-01**: System generates conversational replies using Claude API that sound natural and match Sammy's voice
- [ ] **AI-02**: System fetches last 15-20 messages from Telegram conversation history to provide multi-turn context to Claude
- [ ] **AI-03**: Claude system prompt includes Sammy's portfolio, past projects, pricing philosophy, tech stack expertise, and services offered
- [ ] **AI-04**: Every conversation is steered toward booking a discovery call via system prompt guidance
- [ ] **AI-05**: System handles Claude API failures gracefully (retry with backoff, don't send error messages to leads)

### Safety & Risk Mitigation

- [ ] **SAFE-01**: System applies random time delays (30s–5min) before each reply
- [ ] **SAFE-02**: System simulates typing indicator for a duration proportional to message length before sending
- [ ] **SAFE-03**: System only responds during configurable active hours (e.g., 9am–11pm) and queues messages received outside that window
- [ ] **SAFE-04**: System enforces per-hour and per-day rate limits on DM replies and respects Telegram FloodWaitError with backoff
- [ ] **SAFE-05**: System implements gradual ramp-up — auto-increasing daily reply caps over first 3-4 weeks (5/day → 15 → 30)
- [ ] **SAFE-06**: System marks messages as read after processing to look natural
- [ ] **SAFE-07**: System batches rapid consecutive messages from the same lead into one response instead of replying to each individually

### Lead Management

- [ ] **LEAD-01**: Sammy can send /takeover @username to pause AI for a specific conversation and handle it personally
- [ ] **LEAD-02**: Sammy can send /resume @username to re-enable AI for a paused conversation

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Notifications

- **NOTF-01**: Separate notification bot DMs Sammy when a new lead arrives with summary and conversation stage
- **NOTF-02**: Notification bot sends weekly analytics summary (leads, replies, booking links sent)

### Conversion

- **CONV-01**: AI delivers Calendly/Cal.com booking link when lead is qualified and ready
- **CONV-02**: System tracks conversation stages (new, qualifying, interested, booking, booked, dead)

### Content Enhancement

- **CONT-01**: Multi-group management with different schedules and template pools per group
- **CONT-02**: AI-generated unique post messages via Claude instead of template rotation
- **CONT-03**: Single gentle follow-up message if a lead goes silent for 24+ hours

## Out of Scope

| Feature | Reason |
|---------|--------|
| Web dashboard / admin UI | Single-user system — config files + logs + bot commands sufficient |
| Database (Supabase/Postgres) | Telegram stores conversation history; JSON file for lightweight state |
| Multi-account support | Built for Sammy only — not a SaaS product |
| Mass/bulk DM outreach | #1 ban risk — inbound-only protects Sammy's irreplaceable personal account |
| Automated follow-up sequences | Multi-day drips from a "human" account look suspicious; single follow-up deferred to v2 |
| Voice messages | Speech synthesis complexity without proportional benefit |
| Payment/invoice processing | Bot's job ends at booking; payments handled separately |
| RAG/vector database | System prompt is sufficient for a single freelancer's portfolio |
| Inline keyboard menus | Makes conversation feel like a bot, not a human |
| Auto-joining groups | Aggressive group-joining is a ban signal |
| Scraping group member lists | Against Telegram ToS, not needed with inbound model |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| INFRA-01 | Phase 1 | Pending |
| INFRA-02 | Phase 1 | Pending |
| INFRA-03 | Phase 1 | Pending |
| DM-02 | Phase 1 | Pending |
| DM-01 | Phase 2 | Pending |
| DM-03 | Phase 2 | Pending |
| AI-01 | Phase 2 | Pending |
| AI-02 | Phase 2 | Pending |
| AI-03 | Phase 2 | Pending |
| AI-04 | Phase 2 | Pending |
| AI-05 | Phase 2 | Pending |
| SAFE-01 | Phase 2 | Pending |
| SAFE-02 | Phase 2 | Pending |
| SAFE-03 | Phase 2 | Pending |
| SAFE-04 | Phase 2 | Pending |
| SAFE-05 | Phase 2 | Pending |
| SAFE-06 | Phase 2 | Pending |
| SAFE-07 | Phase 2 | Pending |
| POST-01 | Phase 3 | Pending |
| POST-02 | Phase 3 | Pending |
| POST-03 | Phase 3 | Pending |
| POST-04 | Phase 3 | Pending |
| POST-05 | Phase 3 | Pending |
| LEAD-01 | Phase 4 | Pending |
| LEAD-02 | Phase 4 | Pending |

**Coverage:**
- v1 requirements: 25 total
- Mapped to phases: 25
- Unmapped: 0

---
*Requirements defined: 2026-03-17*
*Last updated: 2026-03-17 after roadmap creation*
