# Research Summary: Telegram Lead Bot

**Domain:** Telegram lead generation bot (dual-component: Bot API + User API/MTProto)
**Researched:** 2026-03-17
**Overall confidence:** HIGH

## Executive Summary

The Telegram lead bot stack is well-defined and mature. grammY (v1.41.1) is the clear TypeScript-first Bot API framework for group posting, and GramJS/telegram (v2.26.22) is the only production-ready TypeScript MTProto client for user API DM monitoring. Both libraries are actively maintained and well-documented. The Anthropic TypeScript SDK (v0.79.0) provides a clean interface for Claude-powered response generation, with Haiku 4.5 being the right model choice for fast, cost-efficient conversational replies.

The architecture is a single Node.js process running two independent Telegram clients (grammY for bot, GramJS for user API) that share a common AI service layer. This is deployed as a single Railway service. No database is needed -- Telegram stores conversation history natively, and the bot reads the last 15-20 messages via `iterMessages()` to provide context for Claude. Session persistence uses GramJS StringSession stored as a Railway environment variable.

The primary risk is Telegram account ban from user API automation. This is mitigated through a multi-layered defense: random reply delays (30s-5min), typing indicator simulation, active hours enforcement, per-hour/per-day rate limiting, and a gradual ramp-up schedule over the first 3-4 weeks. A secondary risk is GramJS silently dropping its MTProto connection without error -- mitigated by a periodic health check that calls `client.getMe()` every 5 minutes and triggers reconnection on failure.

The stack is intentionally minimal: 7 production dependencies (grammy, telegram, @anthropic-ai/sdk, pino, croner, zod, dotenv) and 4 dev dependencies (typescript, tsx, pino-pretty, @types/node). Random delays, rate limiting, message templates, and active hours checking are all simple enough to implement in plain TypeScript without additional libraries.

## Key Findings

**Stack:** TypeScript + grammY (Bot API) + GramJS (User API/MTProto) + Anthropic SDK (Haiku 4.5) + Pino + croner + Zod, deployed on Railway as a single long-running process.

**Architecture:** Single process, two independent Telegram clients, shared AI service layer. No database -- reads conversation history from Telegram API. StringSession in env vars for auth persistence.

**Critical pitfall:** Telegram account ban from automated user API behavior. Must implement delays, typing simulation, rate limits, active hours, and gradual ramp-up from day one. This is not a "nice to have" -- it is existential risk mitigation.

## Implications for Roadmap

Based on research, suggested phase structure:

1. **Foundation & Infrastructure** - Config, logging, session management, health checks
   - Addresses: Config validation (Zod), Pino logging, GramJS StringSession setup, connection health monitoring
   - Avoids: Session invalidation on Railway (test StringSession survives redeploy before building features)

2. **User API + AI Replies** - DM monitoring, Claude integration, risk mitigation
   - Addresses: NewMessage handler, conversation context, AI response generation, delays, typing simulation, rate limiting, active hours
   - Avoids: Account ban (all anti-detection measures must ship with the first DM reply, not added later)

3. **Bot Group Posting** - Scheduled group messages with template rotation
   - Addresses: grammY bot, croner scheduler, message templates, multi-group posting
   - Avoids: Group ban from repetitive content (template rotation from day one)

4. **Hardening & Monitoring** - Edge cases, graceful degradation, handoff
   - Addresses: Message deduplication, Claude API failure handling, graceful Sammy handoff, conversation cooldown
   - Avoids: Silent failures, double-replies, runaway conversations

**Phase ordering rationale:**
- Infrastructure first because everything depends on config, logging, and a working GramJS session on Railway
- User API before Bot API because DM replies are the core value -- group posting is just lead generation input
- Risk mitigation ships WITH the DM reply feature, not after it -- this is non-negotiable
- Bot group posting is lower risk (official Bot API, worst case = kicked from group) so it goes after the higher-risk User API component is stable

**Research flags for phases:**
- Phase 1: Needs careful testing of StringSession on Railway (known issue with datacenter IPs, see GramJS #773)
- Phase 2: System prompt engineering for Claude will need iteration based on real conversation quality
- Phase 3: Standard patterns, unlikely to need additional research
- Phase 4: Standard patterns, driven by production observations

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All library versions verified via npm registry. grammY, GramJS, and Anthropic SDK are well-documented and actively maintained. |
| Features | HIGH | Feature set is straightforward and well-understood. All required APIs confirmed to exist in the chosen libraries. |
| Architecture | HIGH | Single-process dual-client pattern is well-supported. Railway long-running process model confirmed in official docs. |
| Pitfalls | HIGH | Account ban risk is well-documented across multiple sources. GramJS connection issues confirmed in GitHub issues. |

## Gaps to Address

- **Railway + MTProto session stability:** GramJS issue #773 reports session invalidation on cloud providers. Railway may or may not be affected. Must test empirically in Phase 1 before building features.
- **Claude prompt engineering:** The system prompt for lead qualification and call booking will need iteration based on real conversation quality. Research can provide guidelines, but the prompt is tuned through production testing.
- **Telegram anti-spam thresholds:** Exact rate limits for user API DMs are not publicly documented. The recommended limits (10/hour, 50/day) are community-derived best practices, not official numbers. Must monitor and adjust.
- **GramJS typing indicator duration:** How long to show typing relative to message length is a UX judgment call, not a technical question. Start with 2-5 seconds per 100 characters and tune based on feel.
