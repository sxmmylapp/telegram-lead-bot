# Pitfalls Research

**Domain:** Telegram lead generation bot (user API automation + bot API group posting)
**Researched:** 2026-03-17
**Confidence:** MEDIUM-HIGH (verified across official Telegram docs, GramJS GitHub issues, and multiple community sources)

## Critical Pitfalls

Mistakes that cause account bans, rewrites, or total system failure.

### Pitfall 1: Aggressive Messaging on Day One

**What goes wrong:**
The user API component sends too many DM replies too quickly on a fresh or newly-automated account. Telegram's anti-spam system flags the account within hours, resulting in a temporary restriction (can only message mutual contacts) or a permanent ban. Just 3-5 user reports can trigger restrictions, and Telegram's velocity detection catches accounts that message too many strangers in a short window.

**Why it happens:**
Developers build the system, test it locally with 1-2 messages, then deploy to production where real DM volume hits. They skip the account warmup phase because it feels like wasted time. Sammy's account is already aged, which helps, but switching from manual usage to automated replies is itself a behavioral change Telegram detects.

**How to avoid:**
- Implement a hard-coded ramp-up schedule in the config: Week 1 max 5 replies/day, Week 2 max 15/day, Week 3 max 30/day, Week 4+ max 50-100/day
- Randomize delays between 90-300 seconds per reply (not a fixed interval -- Telegram detects regular timing patterns)
- Never exceed 200 messages/day even on a fully warmed, trusted account
- Continue normal manual Telegram usage on the account during the warmup period to maintain natural usage patterns

**Warning signs:**
- @SpamBot reports account as "limited" when queried
- FLOOD_WAIT errors start appearing in logs (even short ones like 5-10 seconds are early warnings)
- Recipients stop receiving messages (shadow restriction -- messages send but don't deliver)
- Account receives a "Your account was limited" notification from Telegram

**Phase to address:**
Phase 1 (Core Infrastructure) -- rate limiting and ramp-up config must be built before any DM replies go live. This is not a "nice to have" added later.

---

### Pitfall 2: Session Invalidation on Cloud Deployment

**What goes wrong:**
GramJS StringSession works perfectly in local development, but after deploying to Railway, Telegram detects the login from a datacenter IP and forcibly logs the session out within hours or days. The bot goes silent with no error -- it simply stops receiving updates. This is a documented issue (gram-js/gramjs#773) with no confirmed workaround for certain cloud providers.

**Why it happens:**
Telegram flags datacenter/cloud IP ranges (especially GCP, and potentially other providers) as high-risk because they are commonly used for spam operations. A session that was authenticated from a residential IP suddenly appearing on a datacenter IP triggers Telegram's security system. The session appears valid to GramJS (no error thrown), but Telegram silently stops delivering updates or eventually forces a logout.

**How to avoid:**
- Authenticate the StringSession locally on Sammy's machine first, save it, then deploy with the saved session string as an environment variable
- Use Railway's volume storage for any session state files (Railway's filesystem is ephemeral -- files vanish on redeploy)
- Implement a health check that periodically calls `client.getMe()` and verifies the response -- if it fails, alert immediately rather than running silently dead
- Consider Railway specifically -- Railway uses varied infrastructure that may not be as aggressively flagged as GCP. Test and monitor
- Have a manual re-authentication procedure ready (run locally, get new session string, update Railway env var)
- Set `connectionRetries: 5` and `retryDelay: 1000` in the TelegramClient config, but understand this only helps with network drops, not session invalidation

**Warning signs:**
- NewMessage events stop firing but the process stays alive (no crash)
- `client.getMe()` starts returning errors or hanging
- Health check heartbeats stop in logs despite the process running
- Telegram sends "New login from [datacenter location]" notification to Sammy's other devices

**Phase to address:**
Phase 1 (Core Infrastructure) -- session management and health monitoring must be the first thing built and tested on Railway before any business logic.

---

### Pitfall 3: Identical/Templated Message Content Detected as Spam

**What goes wrong:**
Claude AI generates responses that, while personalized per conversation, may produce similar sentence structures, similar opening phrases, or identical call-to-action text across different leads. Telegram's content analysis detects repetitive patterns across outgoing messages from the same account and flags it as automated/spam behavior.

**Why it happens:**
Developers focus on making Claude responses sound human in isolation but forget that Telegram sees ALL outgoing messages from the account. If every DM reply ends with "Would you like to schedule a 15-minute discovery call?" or starts with "Hey! Thanks for reaching out," that pattern is detectable across messages even though each individual message seems natural.

**How to avoid:**
- Include explicit instructions in the Claude system prompt to vary phrasing significantly between conversations -- different greetings, different CTA wording, different sentence structures
- Provide Claude with 5-10 different CTA variations and instruct it to rotate
- Never include shortened URLs (bit.ly etc.) in replies -- Telegram flags these heavily
- Avoid excessive emoji, all-caps, or marketing language in AI-generated replies
- Log and periodically review AI responses to check for repetitive patterns
- Add a post-generation check that compares the reply against the last 10 sent messages for similarity

**Warning signs:**
- Multiple leads reporting the same message content (unlikely they'd tell you, but check)
- Sudden spike in FLOOD_WAIT or restriction errors after a day with many similar replies
- @SpamBot status changes to restricted

**Phase to address:**
Phase 2 (AI Response Engine) -- the Claude prompt engineering and response variation logic must account for cross-conversation uniqueness, not just within-conversation coherence.

---

### Pitfall 4: GramJS Update Handler Silently Stops Receiving Messages

**What goes wrong:**
The NewMessage event handler works initially but silently stops receiving updates after a period of inactivity or after Telegram Desktop/mobile is used on the same account. The GramJS process stays alive and connected, but no new DMs trigger the handler. Leads message Sammy and get no response for hours or days.

**Why it happens:**
Telegram's MTProto protocol requires clients to periodically signal active interest in receiving updates. If the GramJS client sits idle without making high-level API calls, Telegram deprioritizes update delivery to that session. Using Telegram on another device can also disrupt update delivery to the GramJS session. This is a documented GramJS behavior (gram-js/gramjs#280).

**How to avoid:**
- Call `client.getMe()` on a periodic interval (every 5-10 minutes) as a keepalive signal to Telegram
- After every `.connect()` or reconnection, immediately call `client.getMe()` before expecting updates
- Implement a "last update received" timestamp tracker -- if no updates arrive for 30+ minutes during active hours, trigger a reconnection cycle
- Add an external health check endpoint (HTTP) that reports the last-received-update timestamp so you can monitor from outside the process
- Handle the reconnection event explicitly and re-register interest in updates

**Warning signs:**
- Gap in "message received" logs during hours when DMs should be arriving
- Health check shows process alive but last-update timestamp is stale
- `client.getMe()` succeeds but no NewMessage events fire
- Sammy checks Telegram manually and sees unread DMs that the bot never processed

**Phase to address:**
Phase 1 (Core Infrastructure) -- the keepalive/health-check mechanism is part of core connection management, not an afterthought.

---

### Pitfall 5: Railway Ephemeral Filesystem Destroys State on Redeploy

**What goes wrong:**
Any state stored to the filesystem (session files, conversation state, queued messages, config overrides) vanishes on every Railway deployment. The bot restarts with no memory of ongoing conversations, no session persistence, and potentially triggers a re-authentication flow that sends a login code to Sammy's phone.

**Why it happens:**
Railway's default filesystem is ephemeral -- it resets on every deploy and restart. Developers who test locally (where files persist) don't realize their file writes are temporary in production. The 1GB ephemeral storage works fine during a single run, creating a false sense of security.

**How to avoid:**
- Store the StringSession as a Railway environment variable, not a file -- env vars persist across deploys
- If any file-based state is needed (conversation logs, queue data), attach a Railway volume and mount it explicitly (e.g., `/data`)
- Remember: volumes are NOT available during the build phase, only at runtime
- Keep state minimal -- the project already plans to read conversation history from Telegram API directly, which is the right approach
- If using SQLite for lightweight state, the database file must live on a mounted volume

**Warning signs:**
- Bot works after deploy but loses all state after the next deploy
- Session authentication prompts appear in logs after every redeploy
- "File not found" errors in logs for paths that existed before the deploy

**Phase to address:**
Phase 1 (Core Infrastructure) -- Railway deployment configuration including volume setup and env var strategy must be established before any code runs in production.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Hardcoded rate limits instead of config-driven | Faster to implement | Every tuning change requires a code deploy | Never -- use env vars or config file from day one |
| No conversation state tracking (rely purely on Telegram history) | Avoids database entirely | Cannot track which leads are qualified, which conversations are stale, or measure conversion | Acceptable for MVP, but plan migration path to lightweight state (SQLite on volume) within weeks |
| Single-process architecture (bot + user API in one process) | Simpler deployment, one Railway service | If user API crashes, bot stops posting; if bot errors, user API goes down; cannot scale independently | Acceptable for MVP since resource usage is minimal, but design code with clean separation so splitting is easy |
| No message deduplication | Less code | If GramJS reconnects and replays missed updates, Claude responds to the same message twice, annoying the lead | Never -- track processed message IDs from the start |
| Skipping typing indicator simulation | Faster replies | Instant replies to DMs are a strong bot-detection signal | Never -- typing simulation is a core anti-detection feature |

## Integration Gotchas

Common mistakes when connecting to external services.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| GramJS (MTProto) | Assuming `connect()` alone enables update reception | Must call `client.getMe()` after every `connect()` to signal update interest to Telegram servers |
| GramJS (MTProto) | Using `destroy()` instead of `disconnect()` for cleanup | `destroy()` removes event handlers; `disconnect()` preserves them for reconnection |
| GramJS (MTProto) | Not handling `FLOOD_WAIT` errors with actual waits | Parse the wait seconds from the error, sleep for that duration plus random jitter, then retry. Never ignore or fixed-retry |
| grammY (Bot API) | Posting the same message format to groups daily | Rotate templates, vary timing, add natural imperfections. Groups will kick bots that post identical content |
| Claude API | Sending entire conversation history as context on every reply | Token costs explode and latency increases. Send only last 10-15 messages with a system summary of earlier context |
| Claude API | Not handling API timeouts or rate limits | Wrap calls in retry logic with exponential backoff. Queue the reply if Claude is slow -- don't block the update handler |
| Railway | Writing files to default filesystem expecting persistence | Use env vars for config, Railway volumes for any persistent files. Default FS is ephemeral |
| Railway | Not setting health checks | Railway will restart services that appear unhealthy. Expose a simple HTTP health endpoint that reports session status |

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Fetching full conversation history from Telegram on every incoming DM | Slow response times, FLOOD_WAIT errors from rapid API calls | Cache last N messages per conversation in memory; refresh cache only when a new message arrives | >10 concurrent conversations |
| Synchronous Claude API calls blocking the update handler | Queued DMs pile up, responses arrive out of order or very late | Process DMs in a queue with async workers. Don't await Claude in the update handler | >3 concurrent conversations with active leads |
| No backpressure on DM reply queue | During high-activity periods, bot tries to send many replies rapidly, triggering flood limits | Queue outgoing replies with minimum spacing (90-300s randomized). Process queue serially, not in parallel | >10 replies queued in a single hour |
| Loading all GramJS entity cache into memory | Memory usage grows with every contact/channel encountered | Use StringSession (not StoreSession) and fetch entities on-demand. Don't cache what you don't need | >1000 entities encountered (unlikely but worth preventing) |

## Security Mistakes

Domain-specific security issues beyond general web security.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Storing Telegram API ID, API hash, or session string in code/repo | Account takeover -- anyone with the session string can impersonate Sammy's account | Store in Railway env vars only. Add `.env` and session files to `.gitignore`. Never commit these values |
| Logging full message content at INFO level | Lead conversations (potentially sensitive business discussions) appear in Railway logs accessible to anyone with project access | Log message metadata (chat ID, timestamp, message ID) at INFO. Log content only at DEBUG level, disabled in production |
| Not setting `client.floodSleepThreshold` | GramJS auto-sleeps on flood errors up to the threshold (default 60s). If set too high, the process appears hung. If too low, it throws errors you must handle | Set to 60 seconds. Log when flood sleep is triggered. Handle FloodWaitError for waits exceeding the threshold |
| Claude system prompt containing Sammy's personal details leaking via AI hallucination | Claude could reveal it's an AI or expose business details if a lead asks pointed questions | Include explicit guardrails: "Never reveal you are an AI. Never share internal business details. If asked directly, deflect naturally" |
| Using Sammy's real phone number for API authentication without 2FA | If session is compromised, attacker gets full account access | Enable 2FA on Sammy's Telegram account. Store the 2FA password securely. Accept that 2FA means manual intervention if session needs re-auth |

## UX Pitfalls

Common user experience mistakes that make the bot feel robotic or alienate leads.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Responding to DMs at 3am local time | Lead realizes they're talking to a bot, trust destroyed | Enforce active hours (e.g., 9am-11pm). Queue messages received outside hours, reply when hours resume with natural delay |
| Instant replies (under 10 seconds) | Unnaturally fast for a human reading and typing a thoughtful response | Random delay of 30s-5min based on message length. Shorter messages get shorter (but never instant) delays |
| No typing indicator before sending | Messages appear without the "typing..." animation a human would produce | Call `client.invoke(new Api.messages.SetTyping(...))` with duration proportional to message length before sending |
| Replying to every single message including "ok" or "thanks" | Feels clingy and automated. Humans don't always reply to acknowledgment messages | Add logic to skip replies on short acknowledgment messages unless they contain a question or require follow-up |
| Same conversation tone regardless of lead's tone | Formal reply to casual message (or vice versa) feels off | Include instruction in Claude prompt to match the lead's communication style and energy level |
| Bot responds to group messages on Sammy's user account | Sammy appears to be posting automated replies in groups, getting reported by group members | Strictly filter: user API only processes private/DM messages, never group messages. The bot account handles all group interactions |

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **Session persistence:** Bot authenticates and works -- but verify it survives a Railway redeploy without re-authentication
- [ ] **Rate limiting:** Delays exist between messages -- but verify they are randomized (not fixed intervals) and include variance of at least 30%
- [ ] **Typing indicator:** Typing status is sent -- but verify duration scales with message length (not a fixed 3-second typing for all messages)
- [ ] **Active hours:** Messages are queued outside hours -- but verify queued messages are replayed in natural-seeming bursts when hours resume (not all at once at 9:00:00am)
- [ ] **Conversation context:** Claude gets message history -- but verify it handles the first-ever DM (no history) gracefully without crashing
- [ ] **Error recovery:** FLOOD_WAIT is caught -- but verify the bot actually waits the required time and resumes (not just logs and moves on)
- [ ] **Message deduplication:** Replies go out -- but verify the same incoming message doesn't get replied to twice after a reconnection
- [ ] **Health monitoring:** Process is running -- but verify there's a way to detect the "alive but deaf" state where no updates arrive
- [ ] **Group posting:** Bot posts in groups -- but verify it handles being kicked from a group gracefully (no crash loop, just skip that group)
- [ ] **Claude fallback:** AI generates replies -- but verify what happens when Claude API is down or returns an error (queue the reply? skip it? send a generic response?)

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Account temporarily restricted | LOW | Stop all automated activity immediately. Wait 24-48 hours. Check @SpamBot. Resume at 25% of previous volume. Ramp up slowly over 2 weeks |
| Account permanently banned | HIGH | Appeal via @SpamBot (low success rate). If unsuccessful, project is dead for this account. Requires new Telegram number and complete restart. This is why prevention is critical |
| Session invalidated on Railway | LOW | Run local auth script to generate new StringSession. Update Railway env var. Redeploy. Takes 5 minutes if the procedure is documented |
| GramJS stops receiving updates | LOW | Restart the Railway service. If persists, disconnect and reconnect with `getMe()` call. Check if the session is still valid |
| Claude generates inappropriate response | MEDIUM | Implement a review queue for first N days. Add post-generation content filtering. Update system prompt guardrails. Review and apologize to affected lead manually |
| Railway filesystem wipes state | LOW (if planned for) | Non-issue if StringSession is in env vars and conversation state comes from Telegram API. If using SQLite on volume, data persists. Only costly if you forgot to use a volume |
| Leads realize they're talking to AI | MEDIUM | Sammy manually takes over the conversation. Review what triggered the detection (too-fast reply? unnatural phrasing? direct question about being AI?). Update Claude prompt and timing logic |

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Aggressive messaging on day one | Phase 1: Core Infrastructure | Config includes ramp-up schedule. Rate limiter tested with volume exceeding limits -- verify it throttles |
| Session invalidation on cloud | Phase 1: Core Infrastructure | Deploy to Railway, wait 48 hours, verify session still active and updates still arriving |
| Railway ephemeral filesystem | Phase 1: Core Infrastructure | Redeploy on Railway and verify session + state persist without re-authentication |
| Update handler goes silent | Phase 1: Core Infrastructure | Health check endpoint reports last-update timestamp. Simulate 30min gap and verify alert fires |
| Identical message content | Phase 2: AI Response Engine | Generate 20 sample replies to similar prompts. Manually review for repetitive patterns |
| Typing indicator missing | Phase 2: AI Response Engine | Watch a test conversation in real Telegram -- verify "typing..." appears before each reply |
| Active hours violated | Phase 2: AI Response Engine | Send test DM at 3am. Verify no reply until configured morning hour |
| No message deduplication | Phase 1: Core Infrastructure | Force a reconnection while messages are pending. Verify no duplicate replies |
| Claude API failure unhandled | Phase 2: AI Response Engine | Kill Claude API access temporarily. Verify graceful degradation (queued retry or skip, no crash) |
| Bot kicked from group | Phase 3: Group Posting | Manually remove bot from a test group. Verify it continues posting to other groups without crashing |
| Leads detect AI | Phase 2: AI Response Engine + ongoing | Run adversarial test prompts ("Are you a bot?", "Prove you're human"). Verify Claude deflects naturally |
| Account permanently banned | Pre-Phase 1: Warmup | No code can prevent this -- it's a behavioral discipline issue. Document the warmup procedure and follow it before any automation goes live |

## Sources

- [Telegram Official Spam FAQ](https://telegram.org/faq_spam) -- account limitation rules and appeal process (HIGH confidence)
- [Telegram API Error Documentation](https://core.telegram.org/api/errors) -- FLOOD_WAIT and FLOOD_PREMIUM_WAIT error codes (HIGH confidence)
- [GramJS GitHub Issue #773](https://github.com/gram-js/gramjs/issues/773) -- session logout on Google Cloud VMs (MEDIUM confidence -- issue is open, no confirmed fix)
- [GramJS GitHub Issue #280](https://github.com/gram-js/gramjs/issues/280) -- NewMessage events stop after inactivity, fix via getMe() (HIGH confidence -- confirmed by maintainer)
- [GramJS Authentication Docs](https://gram.js.org/getting-started/authorization) -- StringSession save/restore workflow (HIGH confidence)
- [Railway Volumes Documentation](https://docs.railway.com/reference/volumes) -- ephemeral filesystem and volume constraints (HIGH confidence)
- [Telegram Growth Studio: Bulk Message Guide](https://telegramgrowthstudio.com/blog/telegram-bulk-message-sender.html) -- daily limits, warmup strategy, detection patterns (MEDIUM confidence -- community source, consistent with multiple other sources)
- [grammY Flood Limits Documentation](https://grammy.dev/advanced/flood) -- Bot API rate limits and retry strategies (HIGH confidence)
- [MadelineProto: Avoiding FLOOD_WAITs](https://docs.madelineproto.xyz/docs/FLOOD_WAIT.html) -- user API flood avoidance patterns (MEDIUM confidence -- different library but same MTProto protocol)
- [Telegram Limits Info](https://limits.tginfo.me/en) -- community-maintained limit documentation (MEDIUM confidence)
- [IPFoxy: Telegram Account Warmup Guide](https://www.ipfoxy.com/blog/ideas-inspiration/5466) -- 7-day warmup SOP (MEDIUM confidence)

---
*Pitfalls research for: Telegram lead generation bot (user API automation + bot API group posting)*
*Researched: 2026-03-17*
