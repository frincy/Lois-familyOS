<div align="center">

# Lois - Your Family OS

**A cognitive Chief of Staff for the household.**

Memory + Models + Decisions · Local-first · Learns you over time

[![License: MIT](https://img.shields.io/badge/License-MIT-14B8A6.svg)](https://opensource.org/licenses/MIT)
[![Node](https://img.shields.io/badge/node-%E2%89%A518.17-14B8A6)](https://nodejs.org)
[![Claude Agent SDK](https://img.shields.io/badge/built%20on-Claude%20Agent%20SDK-14B8A6)](https://docs.anthropic.com/en/api/agent-sdk)
[![Local-first](https://img.shields.io/badge/data-local--first-14B8A6)](#your-data-is-yours)

</div>

---

## Why this exists

A household is a complex operation with no operating system.

- Calendars in three places. Inboxes triaged by hand.
- Mental load lives in one person's head — usually mom's.
- The average family runs more concurrent threads than a small business.

Every "AI assistant" treats the user as a single entity. Family OS models the **household** — every member, their needs, the relationships, the cadences — and works as a real Chief of Staff for the person running it.

It runs on **your device**, on **your data**, and uses **your Claude API key** (or your existing Claude Code session). No cloud database, no telemetry, no SaaS — just markdown files in a folder you can open in VS Code or Obsidian whenever you want.

> **Be precise:** *storage* is local. *Inference* is the Anthropic API — so chat content, the files the COS reads on each turn, and (for triage) your email bodies do cross the network to Anthropic, who don't train on it or persist it long-term but do process it. Read **[docs/PRIVACY.md](docs/PRIVACY.md)** for the exact accounting. If you need fully local inference, that's a roadmap item — see below.

---

## What it does, in three concrete moments

#### 1. It triages

You wake up. 34 emails overnight. Click **Triage**.

> 30 are FYI. 4 are actionable:
> · *Vendor confirms Friday install* — proposes attaching to your existing "landscaping" loop
> · *School auction committee invite* — pushes back: "doesn't fit your north-star (Anna's transition)"
> · *Dentist appointment confirmation* — proposes a calendar event (not a to-do)
> · *Your partner's reply about Saturday* — drafted a one-line "yes, see you then" reply for you to send

One tap to accept any of them. Read+propose only — it never sends email on its own.

#### 2. It reasons

You type: *"Should I enroll Sam in summer art camp?"*

The COS responds in **decide-with-me** mode:

> **Situation** — You're weighing a $1,800 4-week commitment for July.
>
> **Options:** Art camp · Library reading program (free) · Unstructured + a tutor · Defer to next year
>
> **Criteria:** cost · Sam's energy level by July · what your north-star said about "less structured time this summer" · the family vacation overlap
>
> **Recommend:** Art camp, but the 2-week not the 4-week. It satisfies the structure while leaving room for the August vacation. ~$900.
>
> [Decide it] · [Sit with it] · [More options]

You decide. The COS writes a Decision Record at `data/decisions/2026-05-22-summer-camp.md`. Next May, when the question comes back, your past reasoning surfaces first.

#### 3. It anticipates

7:02am. The morning brief writes itself:

> **First line.** Lead the day with Anna's middle-school registration — the form closes Friday.
>
> **Today.** 9am pediatrician (Quinn). 2pm conflicts with school pickup — push to 4pm? 7pm dinner with your partner.
>
> **Needs you.** Passport renewal (due in 11 days). Landscaping quote (stale, 14 days no movement).
>
> **Who needs you today.** Mom: overdue for a check-in, last touch 3 weeks ago. Anna: drop dress shoes by 9am.
>
> **Focus.** One thing: the registration form.

Generated from your calendar + open loops + family models + the unread inbox count. Recomputed every morning. Refreshable on demand.

---

## Quick start

```bash
git clone https://github.com/frincy/Lois-familyOS.git
cd Lois-familyOS
npm run setup          # one command: asks two questions, scaffolds data/, writes app/.env
npm start              # open http://localhost:4317
```

The setup wizard asks for:

1. Your **Anthropic API key** (from [console.anthropic.com](https://console.anthropic.com/settings/keys)) — ~$0.05–0.12 per chat turn. Leave blank to fall back to an existing [Claude Code](https://docs.anthropic.com/en/docs/claude-code) session on your machine.
2. Your **first name** — what the COS calls you in prompts. Defaults to "the user".

Then click **Connect Outlook** in the app to wire up email + calendar. Uses Microsoft's public Graph CLI client via device-code OAuth — **no Azure setup, no app registration**, works with any personal Microsoft account (Hotmail, Outlook.com, Office 365 personal).

If you don't connect Outlook, you still get the full chat / canvas / decisions / family-models loop — just no inbox/calendar surfaces.

> **Heads-up:** Family OS is a personal-use tool. It runs on your laptop, stores data on your disk, and reaches out to Anthropic + (optionally) Microsoft on your behalf. There's no multi-tenant story.

---

## What it looks like

A freeform draggable canvas. Each card is one surface — `Today`, `This Week`, `Chat with COS`, `Today's Inbox`, `COS Proposals`, `Morning Brief`, `End of Day`, `Reminders`. Drag to rearrange, resize, collapse. Sticky-note `+ Note` cards for jotting that flings into the chat. Items carry `#category` tags the COS assigns; lens toggle switches between priority view and category view.

*Screenshots: coming.*

---

## Architecture, in one paragraph

Family OS is a **cognitive system**, not an agent loop with memory bolted on. It has three memory layers borrowed from cognitive science (**episodic** / **semantic** / **procedural**), per-member **family models** that update with every relevant chat turn, and a thin **agentic engine** that perceives, recalls, decides, and acts. The Chief of Staff persona — the orchestrator — is defined by a skill markdown that's read fresh on every turn, so editing behavior is editing one file. Every action is read+propose: you confirm anything that touches the outside world.

For the full picture, see **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** — written as a CTO walkthrough, not a sales pitch. It covers the design principles, the three memory types, the agentic loop, why the family-graph + procedural memory is the moat, the security model, and the trade-offs we made and why.

```
┌─ SENSES ────────────────────────────────────────────────────┐
│  Chat · Outlook Mail · Outlook Calendar · Board · Signals   │
└──────────────────────────────┬──────────────────────────────┘
                               ▼
┌─ COGNITIVE CORE ────────────────────────────────────────────┐
│  EPISODIC      SEMANTIC          PROCEDURAL                 │
│  daybook       family models     decision records           │
│  interactions  principal model   playbooks                  │
│  chronicle     knowledge · NS    learned prefs              │
│                                                             │
│  per-member family models: living, with cadence + needs     │
└──────────────────────────────┬──────────────────────────────┘
                               ▼
┌─ AGENTIC ENGINE ────────────────────────────────────────────┐
│  Chief of Staff Orchestrator                                │
│  Triage  ·  Decide-with-me  ·  Morning Brief  ·  Reflect    │
│  modes: Quick · Working · Deep · Silent                     │
│                                                             │
│  scheduler (60s tick): brief · auto-triage · reflection     │
│  MCP tools: calendar_{list,create,update,cancel} + reminder │
└──────────────────────────────┬──────────────────────────────┘
                               ▼
┌─ SURFACE & EFFECTORS ───────────────────────────────────────┐
│  Freeform draggable canvas · read + propose · you confirm   │
└──────────────────────────────┬──────────────────────────────┘
                               ▼
                       you · the principal
```

---

## Why it's different (from the 2026 field)

| You're used to | What it does | What Family OS adds |
|---|---|---|
| **ChatGPT / Claude (with memory)** | Flat memory: a vector store of past chats | Three memory *types* (episodic / semantic / procedural). Decisions are stored *as decisions*, not as chat logs. |
| **Motion · Reclaim · Sunsama** | Auto-schedule blocks; defend focus time | We don't move blocks. We help make the underlying decision and capture the reasoning. |
| **Superhuman · Shortwave** | Triage + drafted replies + meeting links | We operate across mail **and** calendar from one cognitive loop. "Move my 2pm to 4pm and tell my partner" is one chat turn. |
| **Cozi · Hearth · FamilyWall** | Shared calendar + lists | We model each family member as a living entity with cadence, needs, and current themes. None of those apps can write the sentence "Mom is overdue for a check-in." |
| **Apple Intelligence / Siri 2.0** | On-device, Apple-ecosystem agentic actions | Works with the email/calendar most parents actually use (Hotmail/Outlook). Per-family-member modeling. |

The summary, in one line:

> **Privacy as architecture. Family models that grow. Decisions that compound.**

---

## Your data is yours — what local-first actually means

We'd rather you understand the trade-offs than oversell. The one-liner:

> **Storage is local. Training is opt-out. Inference is remote.**

Everything lives under `data/` as plain markdown:

```
data/
├── open-loops.md             # the one ranked list
├── principal/
│   ├── profile.md            # the COS's model of you (you can edit)
│   ├── standing-instructions.md
│   └── north-star.md         # your strategic priorities this season
├── people/                   # one .md per family member / vendor
│   ├── mom.md
│   ├── partner.md
│   └── ...
├── daybook/                  # the episodic chronicle, by date
│   └── 2026/05/2026-05-22.md
├── decisions/                # procedural — your real decisions
│   └── 2026-05-22-summer-camp.md
├── knowledge/                # outcomes by topic
│   └── house/landscaping-service.md
└── playbooks/                # distilled patterns
    └── vendor-selection.md
```

- **Storage:** all of this is on your disk. Edit any file in VS Code or Obsidian; the COS reads it fresh next turn. Sync with OneDrive / iCloud / Dropbox / git for backup. Nothing is hidden in a database.
- **Inference:** when you chat, click "Triage", or auto-fire the morning brief, Family OS sends data to Anthropic's API to run the model. Per Anthropic's commercial API ToS, your data is **not used for training** and is **not retained long-term** (~30 days for abuse monitoring, then deleted).
- **What crosses the wire by surface:** chat turn → your message + relevant files. Triage → **full email bodies** (truncated). Brief → calendar events + loop titles + people summaries (no email content). Reflection → closed/open loop titles + tomorrow's calendar.
- **Optional Outlook:** if you connect, Microsoft Graph sees your inbox and calendar via OAuth (`Mail.Read`, `Calendars.ReadWrite` — we never ask for `Mail.Send`). The refresh token lives in `data/connections/microsoft.json` — `.gitignore`'d. Disconnect any time.
- **No third parties.** No analytics, no Sentry, no Mixpanel. The server's only outbound calls are to `api.anthropic.com` and (optionally) `graph.microsoft.com`. You can verify with `mitmproxy` or `grep -r "https://" app/`.

**Read [docs/PRIVACY.md](docs/PRIVACY.md) for the full per-surface accounting, threat models we handle and don't, and how to audit any of it.**

---

## Tech stack, quickly

- **Node 18.17+** (ESM, no build step in the app)
- **Express** for the local server, **SSE** for chat streaming
- **[Claude Agent SDK](https://docs.anthropic.com/en/api/agent-sdk)** (`@anthropic-ai/claude-agent-sdk` v0.3.x) — the agent loop, tool-use, permission gating, MCP server registration
- **In-SDK MCP tools** for calendar operations (`createSdkMcpServer` + zod schemas)
- **Microsoft Graph** for Outlook (device-code OAuth via the public Graph CLI first-party client)
- **Vanilla JS** for the canvas UI — no framework, ~50KB total
- **Markdown files** for everything that isn't a token cache

The COS persona is defined entirely in **one skill file** (`family-os/skills/family-os/SKILL.md`). Editing it changes behavior — no restart needed.

---

## Roadmap

What's shipped (v0.1):

- Chat with Chief of Staff persona, four modes (Quick / Working / Deep / Silent)
- Freeform canvas UI, draggable + resizable cards, lens toggle
- Outlook mail + calendar (device-code OAuth, no Azure setup)
- Triage engine: full-body inbox → JSON proposals (new / new_event / update / reply / fyi)
- Morning Brief + End-of-Day Reflection (scheduled auto-generation)
- Decide-with-me + decision records + playbook distillation
- Per-member family models with cadence + last-touch + "who needs you today"
- North-star alignment (the COS pushes back on misaligned commitments)
- Calendar create/move/cancel via the chat COS
- Tap reminders (set + fire + browser notify)

What's next:

- **Phone (PWA + web-push)** for the morning brief and ticklers
- **Multi-user family** — every member has their own COS view, all writing into one household graph
- **More integrations** — Gmail, Apple Calendar, Things/Todoist for the principal who lives elsewhere
- **Voice / ambient** — answer "what's on for today?" by speaking
- **Playbook execution mode** — run a documented playbook against a fresh decision
- **Fully local inference** — optional Ollama / LM Studio backend for users whose threat model requires zero data over the wire. Real work (the Agent SDK targets Anthropic's API), and open-weight models lose some judgment quality on decide-with-me, but it's the only honest path to "fully private." See [PRIVACY.md → Roadmap](docs/PRIVACY.md#roadmap--fully-local).

What we will *not* add:

- Cloud sync as a feature (sync your folder yourself — it's a folder)
- Themes, color pickers, kanban, streak counters, gamification
- A freemium tier

---

## Contributing

We're picky on purpose. Read **[CONTRIBUTING.md](CONTRIBUTING.md)** before opening a PR. Good first contributions: cross-platform start scripts, a second integration (Gmail / Apple Calendar), a playbook template. Bad first contributions: themes, cloud anything, productivity-app feature creep.

---

## Philosophy

We hold three things tightly:

1. **Local-first by default.** Your data is in plain markdown on your device. We don't add cloud sync, cloud storage, or telemetry by default — ever.
2. **Read + propose, you confirm.** The COS earns the right to act. Writes happen to files immediately (the file IS the receipt), but anything that touches the outside world is staged or one-tap confirmed.
3. **Not a productivity app.** This is a Chief of Staff. We optimize for *judgment*, *memory*, and *trust* — not throughput.

If those three resonate, you'll like it here.

---

<div align="center">

**Family OS** · MIT · Built on the [Claude Agent SDK](https://docs.anthropic.com/en/api/agent-sdk)

</div>
