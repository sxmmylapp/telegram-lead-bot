# Feature Research

**Domain:** Telegram lead generation and AI-powered DM qualification bot for freelance software development services
**Researched:** 2026-03-17
**Confidence:** MEDIUM-HIGH

## Feature Landscape

### Table Stakes (Users Expect These)

Features the system must have to function as a viable lead generation and qualification tool. Missing any of these means the bot either does not work, gets detected, or fails to convert.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Daily group posting via Bot API** | Core lead generation mechanism -- no posts, no leads. Every competitor (TGDesk, TelePilot) does automated group posting. | LOW | Use grammY with the official Bot API. Zero account risk since bot accounts are designed for this. Schedule via cron or internal timer. |
| **Message template rotation** | Posting the same message repeatedly triggers anti-spam bots (Combot, ProtectronBot, MissRose) and annoys group members. Groups will ban bots posting identical content. | LOW | Maintain 10-20+ templates. Rotate randomly or round-robin. Vary structure, not just word swaps -- some as questions, some as offers, some as mini case studies. |
| **CTA directing to Sammy's DMs** | The entire funnel depends on leads knowing where to go. Without a clear CTA, group posts are just noise. | LOW | Deep link format: `https://t.me/sammylapp` or inline mention. Keep it natural -- "DM me" not "CLICK HERE NOW." |
| **User API DM monitoring** | The core value prop. When a lead messages Sammy, the system must detect it immediately. This is what every AI-DM-qualification system does. | MEDIUM | GramJS (MTProto) listening for new incoming private messages. Must handle reconnections gracefully. Persistent session string stored securely. |
| **AI-powered conversational replies** | Table stakes for 2026. Every lead qualification chatbot uses AI (Claude, GPT, etc.) for natural conversation. Static decision trees feel robotic and convert poorly. | MEDIUM | Claude API with system prompt defining Sammy's voice, services, pricing philosophy, and qualification criteria. Must pass the "is this a human?" test. |
| **Conversation context from Telegram history** | Multi-turn coherence is non-negotiable. Repeating questions or contradicting earlier messages kills trust instantly. | MEDIUM | Fetch last N messages from the Telegram conversation via GramJS before each Claude call. No database needed -- Telegram is the source of truth. |
| **Goal-directed conversation steering** | The bot exists to book discovery calls. Without explicit steering toward booking, conversations meander and leads go cold. | LOW | Bake the goal into the Claude system prompt. After 2-3 qualification exchanges, naturally introduce booking. |
| **Random time delays (30s-5min)** | Primary detection mitigation for user API automation. Instant replies from a "human" account are a red flag. TGDesk and similar tools all implement "human-like random delays." | LOW | Random delay between detecting a message and sending a reply. Vary the range based on message length and time of day. |
| **Typing indicator simulation** | Telegram shows "typing..." to the other user. A message appearing without a prior typing indicator is suspicious. The official API exposes `messages.setTyping` for exactly this. Indicator lasts ~5 seconds, so repeat the call for longer simulated typing periods. | LOW | Call setTyping before sending. Duration should roughly correlate with message length. For longer delays, re-send the typing action every 4-5 seconds. |
| **Active hours enforcement** | People do not reply at 3am. A "human" account responding at all hours is a detection signal. Standard practice for all userbot automation. | LOW | Configurable window (e.g., 9am-11pm EST). Queue messages received outside hours, process them when the window opens with staggered delays. |
| **Rate limiting** | Telegram enforces flood limits (~1 msg/sec per chat, 20 msg/min per group, ~30 msg/sec across chats). Hitting FloodWait and ignoring it leads to temporary or permanent bans. grammY docs are explicit: the only correct response is to wait the `retry_after` duration. | LOW | Implement per-chat and global rate limiters. Respect FloodWait errors with exponential backoff. Cap daily DM replies to a sane maximum (start with 20-30/day, increase gradually). |
| **Persistent session reuse** | Logging in repeatedly triggers security alerts on the account. Session strings must persist across restarts. | LOW | GramJS supports StringSession. Store encrypted on Railway volume or as environment variable. Never re-authenticate unless session is invalidated. |
| **Structured logging** | Cannot diagnose issues, monitor performance, or detect problems without logs. Essential for a headless Railway deployment with no UI. | LOW | Pino logger with JSON output to stdout (Railway captures automatically). Log every incoming message, every AI call, every sent reply, every rate limit hit. |
| **Config validation at startup** | Fail fast with clear errors, not runtime crashes from missing env vars mid-conversation. | LOW | Zod schema validates all required config (API keys, session string, group IDs, schedule, active hours) before anything starts. |

### Differentiators (Competitive Advantage)

Features that go beyond basic functionality and give this system an edge over generic tools. Not required for MVP, but high value relative to effort.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Lead notification to Sammy via separate bot** | Sammy gets a real-time Telegram notification (from a separate bot) every time a new lead DMs. Includes lead summary, conversation stage, and option to take over. Most competitors lack live owner alerting. | LOW | A second bot (created via BotFather) sends formatted messages to Sammy's account. Include lead username, first message, and conversation summary. Simple grammY bot. |
| **Manual takeover signal** | Sammy can send a command (e.g., `/takeover @username`) to pause AI for a specific conversation and handle it personally. Critical for high-value or complex leads. | LOW | Store a "paused" flag per conversation (in-memory Map or JSON file). AI checks this before replying. Sammy resumes with `/resume @username`. |
| **Conversation stage tracking** | Track where each lead is in the funnel: new, qualifying, interested, booking, booked, dead. Enables smarter AI behavior and reporting. | MEDIUM | Lightweight state per conversation. Can be in-memory with periodic JSON backup to Railway volume. Claude can infer and set stage based on conversation content. |
| **Discovery call booking link delivery** | When the lead is qualified and ready, the AI sends a Calendly/Cal.com booking link. Direct path from conversation to calendar. Removes friction entirely. | LOW | Simply send the URL at the right moment. Claude decides when based on conversation flow. No complex Calendly API integration needed -- just a link. |
| **Gradual ramp-up strategy** | New or freshly-automated accounts should start with low activity and increase over days/weeks. Mimics natural behavior patterns. Standard practice in the userbot community. | LOW | Configurable daily caps that auto-increase. Day 1: 5 replies. Day 7: 15 replies. Day 30: 30 replies. Simple counter with date-based progression. |
| **Multi-group management** | Post to multiple groups with different schedules, templates, and frequencies. Some groups tolerate daily posts, others only weekly. | LOW | Config file mapping group IDs to posting schedules and template pools. grammY handles the actual posting. |
| **Message variation with spintax or AI** | Go beyond template rotation -- use Claude to generate unique messages per posting, or use spintax patterns for mechanical variation. Avoids pattern detection by anti-spam bots that flag similar messages across groups. | MEDIUM | Two approaches: (1) AI-generated posts via Claude at post time, or (2) spintax templates with {option1/option2/option3} syntax. AI approach is more natural but costs per post. |
| **Conversation analytics summary** | Weekly summary of leads contacted, conversations had, calls booked, response rates. Sammy can see ROI without digging through logs. | MEDIUM | Aggregate from conversation state data. Send weekly summary via the notification bot. Track: new leads, replies sent, booking links delivered, calls booked. |
| **Group health monitoring** | Detect if the bot has been banned from a group (message send failures). Alert Sammy so he can rejoin or replace the group. | LOW | Catch send errors per group. If a group returns FORBIDDEN or CHAT_WRITE_FORBIDDEN, mark it as banned and notify Sammy. |
| **Contextual system prompt with portfolio** | Claude's system prompt includes Sammy's actual portfolio, past projects, pricing range, tech stack expertise, and testimonials. Makes qualification conversations rich and credible. | LOW | Static content in the system prompt or a separate context document. Update manually when portfolio changes. No RAG or vector DB needed at this scale. |
| **Message read receipts** | Mark messages as read after processing to look natural. An "unread" message that got a reply is a detection signal. | LOW | GramJS `messages.ReadHistory` after sending a reply. |
| **Conversation cooldown** | Avoid replying to the same person 50 times in rapid succession if they send many messages. | LOW | Track last reply time per user, enforce minimum gap between replies. Batch multiple rapid messages into one response. |
| **Single gentle follow-up** | If a lead goes silent for 24+ hours mid-qualification, send ONE natural follow-up message. Not a drip sequence -- a single nudge. | LOW | Timer per conversation. After 24h of silence, Claude generates a brief, natural check-in. Only once. |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem valuable but should be deliberately excluded. They add complexity, risk, or distraction without proportional benefit for this specific use case.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Web dashboard / admin UI** | Visual management feels professional. Competitors like TGDesk have desktop dashboards. | Massive scope increase for a single-user system. Sammy is the only operator. Building a UI doubles the project timeline for zero additional lead generation. | Manage via config files (JSON/YAML) and structured logs. Use Telegram bot commands for runtime control. |
| **Database (Supabase/Postgres)** | Storing conversation data, lead profiles, analytics in a proper DB seems correct. | Telegram already stores all conversation history. Adding a DB means syncing two sources of truth, handling migrations, and managing infrastructure. For a single-user bot, it is pure overhead. | Read conversation history directly from Telegram API. Use a JSON file on Railway volume for lightweight state (conversation stages, daily counters). |
| **Multi-account support** | "What if I want to run this for multiple clients?" is a natural scaling question. | Premature optimization. This is Sammy's personal lead gen tool, not a SaaS product. Multi-tenancy adds auth, isolation, billing, and 10x complexity. | Build for one account. If it works and there is demand, refactor later. Config-driven architecture naturally supports this without building it now. |
| **Bulk/mass DM outreach** | Proactively DMing group members (not just replying to inbound DMs) could increase lead volume. TelePilot and TGDesk offer "safe mass DM." | Extremely high ban risk. Unsolicited DMs from user accounts violate Telegram ToS. Even with delays, mass outreach is the number one cause of account bans. Sammy's personal account is irreplaceable. | Stick to inbound-only DM replies. Group posts create the inbound flow. Leads who DM first have higher intent anyway. |
| **Automated follow-up sequences** | Multi-day drip campaigns (day 1, day 3, day 7) are standard in email marketing. Seems logical for Telegram. | Unsolicited follow-up messages from a "human" account that has gone quiet look suspicious. Telegram does not have the opt-in framework that email has. Leads may report the account as spam. | Let Claude naturally follow up within active conversations. If a lead goes silent, send ONE gentle follow-up at most. No automated multi-day sequences. |
| **Voice message support** | Voice messages feel more personal and human. Some lead gen tools support voice. | Adds speech synthesis complexity (TTS), voice cloning concerns, and output quality is not consistently convincing. A bad voice message is worse than a good text message. | Text only. Sammy can manually send voice messages for high-value leads when he takes over the conversation. |
| **Payment/invoice processing** | End-to-end: qualify lead, book call, send invoice, collect payment. | Way out of scope. This is a lead gen tool, not a billing system. Mixing concerns creates a fragile monolith. | Sammy handles payments separately after discovery calls. The bot's job ends at booking. |
| **RAG/vector database for knowledge** | Feed the bot Sammy's entire website, portfolio docs, and case studies via embeddings and retrieval. | Overkill for a single freelancer's service offerings. The relevant context (services, pricing, tech stack, past work) fits comfortably in a Claude system prompt. RAG adds embedding pipeline, vector DB, chunking logic, and retrieval latency. | Put key information directly in the system prompt. Claude's context window is large enough for a freelancer's full portfolio description. Update the prompt when offerings change. |
| **Inline keyboard menus for leads** | Interactive buttons in DM conversations for selecting services, budget ranges, timelines. | Makes the conversation feel like a bot, not a human. The whole point is natural conversation. Inline keyboards scream "automated system." | Let Claude ask questions conversationally. "What kind of project are you thinking about?" beats a grid of buttons. |
| **Auto-joining new groups** | Automatically discover and join relevant Telegram groups to expand posting reach. | Aggressive group-joining behavior is a ban signal. Groups with CAPTCHA bots will block automated joins. Quality of groups matters more than quantity. | Sammy manually finds and joins relevant groups. The bot posts to the configured list. |
| **Scraping group member lists** | Extract member lists for targeted outreach. TelePilot recommends this strategy. | Against Telegram ToS. High ban risk. Not needed when the inbound model (post -> DM -> qualify) already targets interested leads. | Let leads self-select by responding to group posts. Higher intent than cold outreach. |
| **Webhook mode for grammY** | Some guides recommend webhooks for bots. | Long-polling is simpler for a single-instance Railway service. No need for an HTTP server, SSL certificates, or public URL. Webhooks add complexity without benefit for this use case. | Use `bot.start()` with long-polling. |

## Feature Dependencies

```
[Config validation + Logging]
    |
    +--> [Everything else] (system fails fast if config is wrong, logs are required for operations)

[Bot API group posting]
    |
    +--> [Message template rotation] (enhances posting, avoids spam bans)
    |
    +--> [Multi-group management] (extends posting to many groups)
    |
    +--> [Group health monitoring] (detects posting failures)
    |
    +--> [AI-generated post messages] (advanced variation beyond templates)

[Persistent session]
    |
    +--> [User API DM monitoring] (requires authenticated session to connect)
              |
              +--> [AI conversational replies] (requires incoming message to respond to)
              |        |
              |        +--> [Conversation context from history] (feeds prior messages to Claude)
              |        |
              |        +--> [Contextual system prompt] (defines AI personality and knowledge)
              |        |
              |        +--> [Goal-directed steering] (built into system prompt)
              |        |
              |        +--> [Conversation stage tracking] (enriches AI context and decisions)
              |        |
              |        +--> [Discovery call booking link] (end goal of AI conversation)
              |
              +--> [Random time delays] (safety layer before all replies)
              |
              +--> [Typing indicator simulation] (safety layer before all replies)
              |
              +--> [Active hours enforcement] (safety layer gating all replies)
              |
              +--> [Rate limiting] (safety layer gating all replies)
              |
              +--> [Message read receipts] (natural behavior after processing)
              |
              +--> [Conversation cooldown] (prevents rapid-fire replies)
              |
              +--> [Single gentle follow-up] (requires tracking conversation silence)

[Lead notification bot] -- independent component, runs alongside both
    |
    +--> [Manual takeover signal] (requires notification bot as command interface)
    |
    +--> [Conversation analytics] (requires stage tracking data to aggregate)
    |
    +--> [Group health monitoring alerts] (notification delivery channel)
```

### Dependency Notes

- **AI replies require DM monitoring:** Cannot respond to messages the system has not detected.
- **Conversation context requires DM monitoring:** Must be listening to know which conversation to fetch history for.
- **Booking link requires AI steering:** The AI decides when the lead is qualified enough to receive the link.
- **Manual takeover requires notification bot:** Sammy needs a command interface, and the notification bot provides it.
- **Stage tracking enhances AI but is not blocking:** AI can function without explicit stages -- it just gets smarter with them.
- **Group health monitoring enhances multi-group posting:** Useful only when posting to multiple groups.
- **Follow-up requires conversation state:** Must track when the last message was exchanged to know when 24h has passed.
- **Analytics require stage tracking:** Cannot report funnel metrics without knowing where conversations stand.

## MVP Definition

### Launch With (v1)

Minimum viable product -- what is needed to start generating and qualifying leads.

- [ ] **Config validation (Zod) + structured logging (Pino)** -- Foundation. Fail fast on bad config, see what happens in production.
- [ ] **Bot API group posting with template rotation** -- The lead generation engine. No posts = no leads.
- [ ] **User API DM monitoring with persistent session** -- The lead capture mechanism. Must detect incoming DMs reliably.
- [ ] **AI conversational replies via Claude** -- The qualification engine. Natural, context-aware responses that feel like Sammy.
- [ ] **Conversation context from Telegram history** -- Coherent multi-turn dialogue. Without this, every reply is a non sequitur.
- [ ] **Time delays + typing simulation + active hours** -- Detection mitigation bundle. Non-negotiable for user API safety.
- [ ] **Rate limiting with FloodWait respect** -- Prevents account bans from Telegram's flood control.
- [ ] **Goal-directed steering toward booking** -- The entire point is booking calls. System prompt handles this.

### Add After Validation (v1.x)

Features to add once the core loop (post -> DM -> qualify -> book) is working.

- [ ] **Lead notification bot** -- Add when Sammy wants real-time visibility into incoming leads without checking logs.
- [ ] **Manual takeover signal** -- Add when Sammy encounters leads that need personal attention.
- [ ] **Discovery call booking link (Calendly/Cal.com)** -- Add when Sammy has a scheduling page set up. Just a URL -- no API integration.
- [ ] **Multi-group management with per-group config** -- Add when Sammy has identified more than 2-3 groups to post in.
- [ ] **Gradual ramp-up strategy** -- Add before scaling reply volume. Start conservative, increase over weeks.
- [ ] **Group health monitoring** -- Add when posting to enough groups that manual checking is tedious.
- [ ] **Message read receipts** -- Add for additional natural behavior signals.
- [ ] **Conversation cooldown** -- Add when encountering leads who send many rapid messages.
- [ ] **Portfolio-enriched system prompt** -- Start with basic prompt, enrich after seeing what leads ask about.

### Future Consideration (v2+)

Features to defer until the system is proven and Sammy wants to optimize.

- [ ] **Conversation stage tracking** -- Defer until there is enough volume to warrant funnel analytics.
- [ ] **AI-generated unique post messages** -- Defer until template rotation shows limits (groups catching on to patterns).
- [ ] **Conversation analytics/weekly summary** -- Defer until there is enough data to make summaries meaningful.
- [ ] **Single gentle follow-up** -- Defer until understanding typical conversation patterns and drop-off rates.

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Config validation (Zod) | HIGH | LOW | P1 |
| Structured logging (Pino) | HIGH | LOW | P1 |
| Bot API group posting | HIGH | LOW | P1 |
| Message template rotation | HIGH | LOW | P1 |
| CTA to Sammy's DMs | HIGH | LOW | P1 |
| User API DM monitoring | HIGH | MEDIUM | P1 |
| AI conversational replies (Claude) | HIGH | MEDIUM | P1 |
| Conversation context from history | HIGH | MEDIUM | P1 |
| Goal-directed steering | HIGH | LOW | P1 |
| Random time delays | HIGH | LOW | P1 |
| Typing indicator simulation | MEDIUM | LOW | P1 |
| Active hours enforcement | MEDIUM | LOW | P1 |
| Rate limiting | HIGH | LOW | P1 |
| Persistent session reuse | HIGH | LOW | P1 |
| Lead notification bot | MEDIUM | LOW | P2 |
| Manual takeover signal | MEDIUM | LOW | P2 |
| Discovery call booking link | MEDIUM | LOW | P2 |
| Multi-group management | MEDIUM | LOW | P2 |
| Gradual ramp-up strategy | MEDIUM | LOW | P2 |
| Group health monitoring | LOW | LOW | P2 |
| Message read receipts | LOW | LOW | P2 |
| Conversation cooldown | LOW | LOW | P2 |
| Portfolio system prompt | MEDIUM | LOW | P2 |
| Conversation stage tracking | MEDIUM | MEDIUM | P3 |
| AI-generated post messages | LOW | MEDIUM | P3 |
| Conversation analytics | LOW | MEDIUM | P3 |
| Single gentle follow-up | LOW | LOW | P3 |

**Priority key:**
- P1: Must have for launch -- the core lead gen and qualification loop plus safety features
- P2: Should have, add in first iteration -- enhances operations, safety, and conversion
- P3: Nice to have, future consideration -- optimization and analytics

## Competitor Feature Analysis

| Feature | TGDesk | TelePilot Pro | CRMChat | Telegram Leads Monitor | **Our Approach** |
|---------|--------|---------------|---------|----------------------|-----------------|
| Group monitoring | 1000+ groups, keyword triggers | Member scraping, group-to-DM pipeline | CRM-focused chat management | Real-time multi-chat monitoring with Airtable sync | Bot posts to groups; DM monitoring on Sammy's account only |
| AI chatbot | RAG-powered, multi-language, trained on docs | Not AI-native; manual DM campaigns | AI-assisted conversation tagging | NLP intent detection | Claude API with personalized system prompt -- deeper, more natural than RAG keyword matching |
| Lead qualification | Keyword-based intent detection ("price", "buy", "demo") | Manual via DM campaigns with spintax | Conversation tagging and routing | Airtable-based profiling | AI-driven conversational qualification -- asks contextual follow-ups, judges intent from conversation |
| Anti-ban protection | Human-like delays, rate limits, "zero ban incidents" claim | Account rotation, 25-30 DMs/hr cap | N/A | N/A | Delays + typing + active hours + rate limits + gradual ramp-up + inbound-only (no mass DM) |
| Mass DM | "Safe Mass DM" feature | Bulk DM with spintax (25-30/hr per account) | N/A | N/A | **Deliberately excluded** -- inbound only, protects Sammy's irreplaceable personal account |
| CRM integration | CRM routing, lead distribution | CSV export for external CRM | Native CRM with pipeline | Airtable sync with avatar extraction | None needed -- single user, Telegram is the CRM. Notification bot covers visibility. |
| Dashboard | Desktop app with visual UI for Windows/Mac | Web dashboard | Web app | Airtable dashboard | **No dashboard** -- config files + logs + Telegram bot commands |
| Booking integration | Not native | Not native | Not native | Not native | Calendly/Cal.com link delivered conversationally by AI when lead is qualified |
| Pricing | Freemium + paid tiers | Paid tool | Paid SaaS | Custom development cost | Self-hosted on Railway -- only Claude API costs (~$0.01-0.05 per conversation turn) |
| Content scheduling | Visual content scheduler with media support | N/A | N/A | N/A | Cron-based scheduling with template rotation. No visual editor needed for single operator. |

**Key competitive insight:** Competitors are general-purpose tools designed for marketing teams managing many accounts across many groups. Our system is purpose-built for a single freelancer's personal lead generation. This means we can be more opinionated (no dashboard, no database, no multi-tenant), focus entirely on conversation quality and account safety, and ship faster with less infrastructure.

**The real differentiator is conversation quality.** TGDesk's keyword-matching and RAG approach cannot match Claude having a free-form, intelligent conversation as Sammy. Leads will feel like they are talking to a real developer who understands their problem, not a menu-driven chatbot.

## Sources

- [TGDesk - Telegram Group Bot](https://tg.wadesk.io/) -- Competitor feature analysis (MEDIUM confidence)
- [TelePilot Pro - 12 Telegram Lead Generation Strategies](https://www.telepilotpro.com/blog/telegram-lead-generation-strategies) -- Industry strategies and tactics (MEDIUM confidence)
- [Telegram Leads Monitor](https://www.incode-group.com/solutions/telegram-leads-monitor) -- Competitor feature analysis (MEDIUM confidence)
- [CRMChat](https://crmchat.ai/) -- Competitor positioning (LOW confidence -- could not extract full features)
- [Telegram Limits](https://limits.tginfo.me/en) -- Rate limit data: ~1msg/sec per chat, 20msg/min per group, ~30msg/sec across chats (HIGH confidence)
- [grammY Flood Limits Guide](https://grammy.dev/advanced/flood) -- Bot API rate limit handling: respect retry_after, do not pre-throttle (HIGH confidence)
- [Telegram messages.setTyping](https://core.telegram.org/method/messages.setTyping) -- Official typing indicator API (HIGH confidence)
- [Telegram Bots FAQ](https://core.telegram.org/bots/faq) -- Official bot rate limits (HIGH confidence)
- [FastBots - AI Chatbot for Sales Teams 2026](https://blog.fastbots.ai/ai-chatbot-for-sales-teams-how-to-qualify-leads-book-more-meetings-and-shorten-sales-cycles-in-2026/) -- AI qualification conversation patterns (MEDIUM confidence)
- [CloseBot Custom Scenarios](https://closebot.com/blog/custom-scenarios-harness-ai-for-sales-success-today/) -- AI sales flow: open conversation first, then jump to specific job when intent detected (MEDIUM confidence)
- [GoHighLevel - AI in the DMs](https://www.gohighlevel.com/post/ai-in-dms-qualify-leads-in-chat) -- AI DM qualification patterns (MEDIUM confidence)
- [BlackHatWorld Telegram Rate Limits](https://www.blackhatworld.com/seo/telegram-rate-limit-how-to-warmup-telegram-account.1539567/) -- Account warm-up practices (LOW confidence -- community forum)
- [Telegram Ban Service Guide](https://telegramgrowthstudio.com/blog/telegram-ban-service-guide.html) -- Ban risk factors and prevention (LOW confidence)

---
*Feature research for: Telegram lead generation bot*
*Researched: 2026-03-17*
