# Privacy — what crosses the wire and what doesn't

A direct accounting. We'd rather you understand the trade-offs than oversell "local-first."

## The one-liner

> **Storage is local. Training is opt-out. Inference is remote.**

Your data lives on your disk in plain markdown. It is never stored in any database we control, never used to train any model. But to answer you, the COS sends parts of your data over the network to Anthropic (and, if you opt in, Microsoft) during each chat turn.

This page lists exactly what gets sent, by which surface, to whom, and what they do with it.

---

## What's local

| | |
|---|---|
| **All your markdown** | `data/principal/`, `data/people/`, `data/decisions/`, `data/knowledge/`, `data/playbooks/`, `data/daybook/`, `data/open-loops.md`, `data/tickler.json` |
| **The COS persona** | `family-os/skills/family-os/SKILL.md` |
| **All caches** | `data/sync/brief.json`, `data/sync/reflection.json`, `data/sync/triage.json`, `data/sync/inbox.json` |
| **All credentials** | `data/connections/microsoft.json` (refresh tokens), `app/.env` (API keys) |
| **All session state** | The Claude Agent SDK session id — held in memory; not persisted |

Nothing on this list ever leaves your disk on its own. We don't sync, we don't telemeter, we don't phone home. You can airplane-mode your laptop and the canvas still loads and you can still chat with the COS for as long as the SDK has connectivity (it can't, on airplane mode — that surface goes down — but everything else stays exactly where it is).

---

## What goes to Anthropic, and when

The COS calls `api.anthropic.com` for every chat turn and for the brief / triage / reflection surfaces. Here's the per-surface breakdown:

### Chat turn (every message you send the COS)

What's sent:

- Your typed message
- The system prompt, which contains:
  - The full body of `family-os/skills/family-os/SKILL.md`
  - The full body of `data/principal/standing-instructions.md`
  - The full body of `data/principal/profile.md`
  - The full body of `data/principal/north-star.md`
- Any files the COS reads during the turn via its file tools — e.g. `data/open-loops.md`, the relevant `data/people/<name>.md`, recalled `data/decisions/<file>.md`, recalled `data/knowledge/<cat>/<slug>.md`
- The conversation history of the current session (so the COS has continuity across turns)

What's *not* sent:

- Files the COS doesn't decide to read
- Sessions you closed earlier (the session id resets when you reload)

### Triage (when you click "Triage inbox")

What's sent:

- **The full body of every email in today's inbox**, truncated to ~1400 chars each, up to 50 emails
- Sender names, subjects, conversation IDs
- The full list of your current Active open loops
- A rolling window of your last 30 triage decisions (so the model can learn your preferences)

This is the single biggest data flow in the app. If your inbox has 30 emails today, ~30 truncated email bodies go to Anthropic in one request. The UI tells you the count before you click.

### Morning brief

What's sent:

- Today's calendar events (titles + times) — pulled from Microsoft Graph
- Your full open-loops list (just titles + status — *not* the full markdown lines)
- Unread email count *(integer only, not the content)*
- A summary of each person file: name, current needs, current themes, overdue days vs. cadence
- The full body of `data/principal/north-star.md`
- The current date/time and day of week

Email *bodies* are not sent during the brief. Only the count.

### End-of-day reflection

What's sent:

- Titles of loops you closed today
- Titles + statuses of loops still open
- Tomorrow's calendar events (titles + times)

Closed-loop full text is *not* sent. Only titles.

### Decide-with-me

Same as a regular chat turn — your message plus whatever files the COS pulls in. For a typical decide-with-me, this is your profile, north-star, the relevant person file(s), and any related past decisions in `data/decisions/`.

### Calendar tools (in-SDK MCP)

When the COS uses `calendar_list`, `calendar_create`, `calendar_update`, `calendar_cancel`, or `set_reminder` — those tools execute locally. Their *arguments* (the event subject, the new time, etc.) are in the model's reasoning, so they appear in Anthropic's request/response logs, but the tool runs against Microsoft Graph directly from your machine.

---

## What Anthropic does with that data

Per Anthropic's commercial API ToS (verify the current version at [anthropic.com/legal/commercial-terms](https://www.anthropic.com/legal/commercial-terms)):

- **Not used for training.** Customer API data is not used to train Anthropic's models.
- **Retained briefly.** Conversation contents are retained for a limited period (around 30 days at the time of writing) for trust-and-safety / abuse monitoring, then deleted. Check the current policy.
- **Not shared with third parties** other than as required by law or to operate the service (e.g. their cloud providers).
- **Subject to US legal process.** Anthropic is a US company; valid subpoenas would compel disclosure. This is true of essentially every US-based AI provider.

This is materially different from products that:

- Build a long-term server-side memory profile of you (e.g. ChatGPT's memory feature, Apple Intelligence with Apple-side persistence)
- Train models on your data (some "personalization" products)
- Store your data in their own cloud database (Cozi, Hearth, Sunsama, most calendar apps)

It's not, however, the same as fully local inference. If your threat model is "I cannot share this data with any US company under any circumstances" — for example, modeling a family member's medical situation that involves legal exposure, or running this in a jurisdiction that prohibits cross-border data flows — **Family OS is not the right tool today.** See [Roadmap → fully local](#roadmap--fully-local) below.

---

## What goes to Microsoft (optional, only if you connect Outlook)

If you click **Connect Outlook**, the app uses the public Microsoft Graph CLI client to talk to Microsoft Graph on your behalf via OAuth (device-code flow). After that, the server makes Graph API calls to:

- Read your inbox (`GET /me/mailFolders/Inbox/messages`)
- Read your calendar (`GET /me/calendarView`)
- Create / update / delete calendar events (`POST/PATCH/DELETE /me/events`)

The scopes you grant are:

- `Mail.Read` — read inbox content
- `Calendars.ReadWrite` — read and modify calendar
- `User.Read` — your basic profile (name, email)
- `offline_access` — refresh tokens so we don't ask you to sign in repeatedly

What Microsoft sees: the API calls themselves (Microsoft already has the underlying data — it's their service). What Microsoft *doesn't* see: anything else that's on your disk. The Family OS app is just another OAuth-authenticated client to your account.

We **never request** `Mail.Send`, `Mail.ReadWrite`, `Files.*`, `Contacts.*`, or anything else outside of email/calendar read + calendar write. If those scopes show up in a consent screen, something is wrong — bail out.

The token is in `data/connections/microsoft.json` and is `.gitignore`'d. Delete that file (or click "Disconnect") to revoke at any time.

---

## What goes to other services

**Nothing.** No Google Analytics, no Sentry, no Mixpanel, no Plausible. No telemetry framework is wired in. The server has zero outbound calls except to Anthropic and (optionally) Microsoft Graph. You can verify by running a network monitor (e.g. macOS Little Snitch, Windows Resource Monitor) while the app is up.

---

## How to verify any of this

### Inspect what's going over the wire

Set the proxy environment variable and route through a local intercepting proxy (e.g. [mitmproxy](https://mitmproxy.org)):

```bash
HTTPS_PROXY=http://localhost:8080 npm start
```

You'll see every Anthropic + Microsoft request in plaintext (the proxy terminates TLS for you). The requests are stateless JSON — you can read them.

### Audit the code

The full set of outbound calls in the app:

| File | Calls |
|---|---|
| `app/server.mjs` | `fetch("https://login.microsoftonline.com/...")` (OAuth) |
| `app/server.mjs` | `fetch("https://graph.microsoft.com/v1.0/me/...")` (Graph API) |
| `@anthropic-ai/claude-agent-sdk` | calls `api.anthropic.com` internally during `query()` |

That's it. There are no other network calls in the codebase. `grep -r "fetch\|https://" app/` will turn them up.

### Confirm nothing's sent to Anthropic if you don't chat

The morning brief / triage / reflection are the surfaces that call Anthropic *without* you pressing send on a chat. They:

- Only fire from the 60-second scheduler when the app is running, *and*
- Only after their respective time-of-day threshold (`BRIEF_HOUR` for brief, 20:00 for reflection)

If you don't want any of those auto-firing, set `BRIEF_HOUR=99` in `app/.env`. The scheduler still ticks, but those branches never trigger. (Or just don't run the app.)

---

## Threat models we handle, and don't

### We handle ✓

- **Your data persisting on a vendor's servers.** It doesn't — there is no Family OS server.
- **A vendor training a model on your family.** Anthropic's commercial ToS prohibits this.
- **Other users of Family OS seeing your data.** They can't — single-tenant, single-user.
- **Vendor lock-in.** Your data is markdown in a folder. Port it anywhere.
- **Telemetry surprise.** There is none.
- **Prompt injection privilege escalation.** The COS can't run shell commands, can't fetch arbitrary URLs, can't send email. See [ARCHITECTURE.md § 7](ARCHITECTURE.md#7-security--permission-model).

### We don't (yet) handle ✗

- **Confidentiality from Anthropic during inference.** Your data is in their request-handling pipeline during each chat turn.
- **Confidentiality from Microsoft for the Outlook bits.** Microsoft already has this data — it's their service — but you're explicitly authorizing Family OS to access it.
- **Anthropic-side log breach.** Conversation logs (~30 days) live on Anthropic's infrastructure.
- **US legal process.** Subpoenas would compel Anthropic to disclose.
- **A compromised laptop.** If your machine is owned by an attacker, they have your `data/` folder. (Standard local-data tradeoff — solvable with disk encryption.)
- **You forwarding chat logs.** If you paste a COS response into a Slack message, that's on you.

---

## Roadmap → fully local

We hear the request. The honest engineering: it's real work.

The Claude Agent SDK is the unit that gives us tool-use, permission gating, MCP server registration, and session resumption. It targets Anthropic's API. Swapping to a local model means we either:

1. **Build a parallel runtime against a different SDK** (e.g. Vercel AI SDK, LiteLLM) and re-implement the tool-use loop + permission gate + MCP bridge. Cost: meaningful, but tractable. Quality cost: today's open-weight models (Llama 3.1 70B, Qwen 2.5 72B) are noticeably weaker at multi-turn judgment + structured output than Opus/Sonnet. The decide-with-me surface degrades. The triage accuracy probably degrades.
2. **Wait for a sufficiently capable local model + a stable local inference stack** (Ollama, LM Studio, MLX). This is a 6–18 month bet.

Tracking this as a roadmap item. If it's a hard requirement for you, please open an issue with your specific threat model — we'd like the v0 of the local path to be designed for a concrete case, not in the abstract.

---

## Summary table

| Concern | Family OS today | Notes |
|---|---|---|
| Cloud database of your data | None | All data in `./data/` on your disk |
| Training on your data | None | Anthropic commercial ToS |
| Long-term server-side memory of you | None | Each Anthropic call is stateless |
| Telemetry to us | None | No analytics framework wired in |
| Data sent to Anthropic during chat | Yes | Your message + relevant files |
| Data sent during triage | Yes — full email bodies | Up to 50 emails, ~1400 chars each |
| Data sent during brief | Yes — calendar + loop titles + people summaries | No email content |
| Data sent during reflection | Yes — closed/open loop titles + tomorrow's calendar | No email content |
| Data sent to Microsoft Graph | Yes if you connect Outlook | Standard API calls; you're using your account |
| Data sent to anything else | No | No third parties wired in |
| Audit-able | Yes | mitmproxy + grep the code |
| Fully local inference | Not yet | Roadmap |

If any of this is wrong or has drifted from the code, please [open an issue](https://github.com/frincy/Lois-familyOS/issues) — accurate privacy framing matters more than the marketing.
