# Telegram Lead Bot

## What This Is

A dual-component Telegram automation system for Lapps Online Dynamics. A bot account posts daily in group chats advertising Sammy's software development services with a CTA to DM his personal account. A user API component monitors Sammy's incoming DMs and auto-replies using Claude AI to qualify leads and book discovery calls.

## Core Value

Every lead who DMs gets a fast, intelligent, human-feeling response that drives toward booking a call.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Bot posts daily messages in Telegram group chats advertising software dev services
- [ ] Daily messages include CTA linking leads to DM Sammy's personal account (@sammylapp)
- [ ] Message templates rotate to avoid repetition and group fatigue
- [ ] User API monitors incoming DMs to Sammy's personal Telegram account
- [ ] Bot auto-replies to DMs using Claude AI, conversing naturally as Sammy
- [ ] Conversation context pulled from Telegram message history for coherent multi-turn replies
- [ ] Every conversation is steered toward booking a discovery call
- [ ] Random time delays (30s–5min) before each reply
- [ ] Typing indicator simulation before sending messages
- [ ] Active hours enforcement — only responds during configurable waking hours, queues messages otherwise
- [ ] Rate limiting — max replies per hour/day to avoid Telegram flood detection
- [ ] Persistent Telegram session reuse (no repeated logins)
- [ ] Deployed on Railway for 24/7 operation

### Out of Scope

- Database (Supabase/Postgres) — read conversation history directly from Telegram API
- Impersonating Sammy's account for group posting — bot posts as itself, only DM replies use user API
- Web dashboard or admin UI — manage via config files and logs
- Payment processing or invoicing
- Multi-account support — single account (Sammy's) only

## Context

- Sammy runs Lapps Online Dynamics, offering software development services
- Target audience: people in Telegram groups who need software built
- Bot account handles group posting (zero risk, official Bot API)
- User API (GramJS/MTProto) handles DM monitoring and replies as Sammy — higher risk, mitigated by delays, rate limiting, typing simulation, active hours, and gradual ramp-up
- If bot gets banned from a group, that's acceptable — no impact on core DM flow
- No database needed — Telegram stores conversation history, bot reads last N messages for Claude context

## Constraints

- **Tech stack**: TypeScript — grammY (bot account), GramJS (user API), Claude API (responses)
- **Hosting**: Railway — must run 24/7, no local processes
- **Risk mitigation**: All user API interactions must include human-like delays and rate limiting
- **No Supabase**: Lightweight state only (JSON file or SQLite on Railway volume if needed)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Bot account for groups, user API for DMs | Minimizes ban risk — only DM replies touch Sammy's account | — Pending |
| grammY + GramJS (TypeScript) | Single language, both libraries mature, Railway-friendly | — Pending |
| Claude API for response generation | Intelligent, context-aware responses that feel human | — Pending |
| No database | Telegram history provides conversation context, avoids infra complexity | — Pending |
| Time delays + typing simulation | Primary risk mitigation for user API detection | — Pending |

---
*Last updated: 2026-03-17 after initialization*
