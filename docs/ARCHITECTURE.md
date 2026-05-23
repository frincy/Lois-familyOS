# Family OS — Architecture

A CTO walkthrough. Written for someone who's going to read the code next.

This document covers:

1. [Design principles](#1-design-principles) — the trade-offs we made up front
2. [The cognitive system frame](#2-the-cognitive-system-frame) — three memory types + living models
3. [The agentic engine](#3-the-agentic-engine) — what happens during one chat turn
4. [Per-member family models](#4-per-member-family-models) — the structure that's hard to copy
5. [The Outlook layer](#5-the-outlook-layer) — device-code OAuth + MCP tools
6. [The scheduler](#6-the-scheduler) — proactivity in a 60-second tick
7. [Security & permission model](#7-security--permission-model) — what the COS can and can't do
8. [Trade-offs we made](#8-trade-offs-we-made) — and why
9. [Repo layout](#9-repo-layout) — where the code lives

---

## 1. Design principles

Three principles, all enforced architecturally — not by policy or marketing.

### 1.1. Local-first

Your data is plain markdown in `./data/`. Open it in VS Code, edit it, version it with git, sync it with OneDrive. Nothing is encrypted-by-us, hidden in a database, or shipped to a server we control.

We deliberately avoided:

- **A database.** Even SQLite is opaque to "open the folder and see what the system remembers". Markdown is the worst data format except for all the others when the use case is "a human reads this in 2031 to remember why we picked GreenThumb."
- **A binary serialization layer.** Decisions, daybook entries, knowledge records — all are human-authorable. The COS doesn't own the schema; you do.
- **A vendor lock-in via "the model trained on your data."** Family OS is stateless from Anthropic's side. Every chat turn sends only the slices it needs.

What we accepted in trade:

- Concurrent writes are not coordinated. The COS and the user can both edit `open-loops.md`. Race conditions are rare in practice (one user, one COS process), but you'd lose this for a multi-tenant SaaS.
- Search is grep, not vector. We use the LLM's own context window as the recall mechanism for now (with explicit re-reads). When the knowledge base gets large enough to matter, we'll add embeddings — but locally, indexing your own folder, never as a hosted service.

### 1.2. Read + propose, you confirm

The COS has file tools (Read / Write / Edit / Glob / Grep) and our own scoped MCP tools (`calendar_list`, `calendar_create`, `calendar_update`, `calendar_cancel`, `set_reminder`). It does **not** have Bash, network fetch, or shell access — those are denied by the permission gate.

The mental model:

- **File writes are immediate.** The COS writes the daybook entry, opens the loop, updates the people file — these all happen without a confirm dialog. The file IS the receipt; you read the receipt in chat and the file is already updated. (You can see what changed via `git diff` if you've initialized git in `data/`.)
- **External actions are read + propose.** Email triage produces *proposals*; you tap to accept. Calendar create from a board button shows a drawer; you confirm. The chat COS can move/cancel calendar events via the MCP tools, but it confirms in its receipt with old → new times. **Nothing is sent.** Reply drafts go into proposals; they're never auto-sent.

This isn't a setting. It's enforced by `canUseTool` in `app/server.mjs`:

```js
canUseTool: async (toolName, input) => {
  if (ALLOWED_TOOLS.has(toolName) || toolName.startsWith("mcp__familyos__")) {
    return { behavior: "allow", updatedInput: input };
  }
  return { behavior: "deny", message: `${toolName} is not permitted in the Family OS app.` };
}
```

`ALLOWED_TOOLS` is exactly `{Read, Write, Edit, MultiEdit, Glob, Grep}`. There is no escape hatch.

### 1.3. The skill is the brain

The COS's behavior — how it talks, when it pushes back, what it captures — is defined entirely in **one markdown file**: `family-os/skills/family-os/SKILL.md`.

It's:

- Read fresh on every chat turn (`buildSystemPrompt()` in `server.mjs`)
- The single source of truth for COS persona and behavior
- Editable by the user — change the file, the next turn picks it up

This is the most under-rated property of the system. Want the COS to be more terse? Edit the skill. Want it to never use the word "circle back"? Edit the skill. Want a new mode? Add a section. No code change, no restart.

The code's job is to enforce the *contract* (tool permissions, file I/O, integration plumbing). The skill's job is to define the *behavior*. Keeping these separated is what lets the brain evolve without rebuilding the body.

---

## 2. The cognitive system frame

Family OS is shaped after cognitive science's view of memory, not after agent-framework engineering. There are three memory types, plus the working memory of the current turn.

### 2.1. The three memory types

| Type | What it answers | Where it lives |
|---|---|---|
| **Episodic** | *What happened?* | `data/daybook/YYYY/MM/YYYY-MM-DD.md`, plus the Interactions log inside each person file |
| **Semantic** | *What's true?* | `data/principal/profile.md`, `data/principal/north-star.md`, `data/people/<name>.md` (Facts + Living model), `data/knowledge/<cat>/<slug>.md` |
| **Procedural** | *How do I decide?* | `data/decisions/YYYY-MM-DD-<slug>.md`, `data/playbooks/<slug>.md`, `data/principal/learned.json` |

Each layer has different write rules:

- **Episodic** grows monotonically. We never overwrite a daybook entry; we append.
- **Semantic** is the most-updated layer — facts, themes, "what they need from you" — and is the one most likely to drift. The COS is conservative about overwriting fact lines (asks first) but freely maintains the Living model section.
- **Procedural** is the moat. A decision record captures not the outcome but the *criteria*. After ~3 decisions share a tag, we propose distilling them into a playbook. Your reasoning patterns become explicit, durable, and reusable.

### 2.2. Why three, and not one

Most agent products have *one* memory: a vector store of past messages, or a flat key-value scratchpad. That's fine if you treat your assistant as a search engine for your own past words. It's wrong if you want it to act like a Chief of Staff.

A real CoS knows three different things, and they need to be queried differently:

- "When did X happen?" → episodic, time-indexed
- "What does Mom's situation look like right now?" → semantic, entity-indexed
- "When you've made similar decisions before, what criteria did you weight?" → procedural, tag-indexed

Conflating these into one store is why most assistants don't surface the right thing at the right moment. They can recall *what you said*, but not *how you tend to decide*.

### 2.3. Working memory = the system prompt

For each chat turn, `buildSystemPrompt()` assembles the working memory:

```text
[SKILL.md — the persona + behavior rules]

# Runtime context
- date / time
- the current standing-instructions.md (verbatim)
- the current profile.md (verbatim)
- the current north-star.md (verbatim)
- onboarding behavior (if applicable)
```

Read fresh, every turn. There's no caching layer that could go stale on you.

The long-term memory (people files, open loops, daybook history, decisions, knowledge base) is *not* pre-loaded into the prompt — the SKILL.md instructs the COS to read those files on demand using its file tools. This keeps the prompt small and the context focused, while letting the model fetch what it actually needs.

---

## 3. The agentic engine

What happens during one chat turn, end to end:

```
1. User types in the chat box.
2. POST /api/chat { message, sessionId? } → SSE stream
3. Server expands slash commands (`/today` → "show me the /today view…")
4. Server builds the system prompt (SKILL + runtime context, fresh)
5. Server calls query({ prompt, options }) from the Agent SDK
6. SDK starts the model with:
     - the system prompt
     - the prior session (resume: sessionId, if any)
     - cwd = repo root (so all file tools are relative)
     - mcpServers: { familyos: calendarMcp }
     - canUseTool: scoped to Read/Write/Edit/Glob/Grep + mcp__familyos__*
7. Model emits streaming messages:
     - assistant text       → SSE "text" event → typed into the chat
     - tool_use (file)      → SSE "tool" event ("read data/open-loops.md")
                              → the SDK runs the tool, returns the result
     - tool_use (MCP)       → the MCP server handles it locally
                              (e.g. calendar_create hits Graph API)
     - result message       → SSE "done" event with cost + session id
8. Browser typesets text incrementally; on "done" refreshes board (loops may
   have changed) and shows total cost.
```

Key things to notice:

- **Tool use is a first-class event in the stream**, not a hidden side effect. The UI shows what the COS is doing ("read data/people/mom.md", "edited data/open-loops.md") in real time. That's how you build trust with users who would otherwise distrust an agent.
- **`resume: sessionId` is how multi-turn continuity works.** The Agent SDK manages session state; we just pass the id back and forth.
- **`canUseTool` is the security boundary.** Anything not in the allow-list is denied with a message the model sees, so it doesn't loop trying to find a way around. (See [section 7](#7-security--permission-model).)

### 3.1. Slash command expansion

The Agent SDK treats a leading-slash message as a slash command and no-ops on unknown ones. We work around this with `expandCommand()`:

```js
function expandCommand(message) {
  // "/today" → "Show me the /today view now, exactly following your /today
  //            rendering rules from your skill. Read data/open-loops.md live
  //            first. This is a VIEW — do not modify any file."
  // "/quick" → "Switch to Quick mode."
  // anything else → passed through unchanged
}
```

The SKILL.md owns the *meaning* of `/today` and `/week`; the server just rewords the message so the SDK doesn't eat it.

### 3.2. JSON-only sub-queries

For triage / brief / reflection, we don't want the COS to use tools — we just want a structured response. Those go through `runJsonQuery()`:

```js
async function runJsonQuery(systemPrompt, prompt) {
  let text = "";
  const q = query({
    prompt,
    options: {
      model: MODEL,
      systemPrompt,
      canUseTool: async () => ({ behavior: "deny", message: "no tools during triage" })
    }
  });
  for await (const m of q) {
    if (m.type === "assistant") for (const b of m.message.content) if (b.type === "text") text += b.text;
  }
  return text;
}
```

A separate, scoped permission gate. The same SDK; different rules. This is the pattern for any future "computation-only" surface (e.g. a planner that generates a draft week, or a one-shot summarizer).

---

## 4. Per-member family models

This is the single hardest piece to replicate. Other systems track *the user*. We track everyone the user cares about — and we treat each one as a living entity that the COS reasons about.

### 4.1. The file format

```
# {Name} · {role}

## Cadence
target: weekly | monthly | quarterly | (or specific)
last-touch: YYYY-MM-DD

## Facts (the user edits — COS asks before changing)
- DOB / age:
- Lives:
- Health baseline:
- Key relationships:
- Communication preferences:
- Sensitivities / never-bring-up:

## Living model (COS-maintained)
**Current themes (last 14 days):**
- (one-line themes the COS observes from recent interactions)

**What they need from the user right now:**
- (deliverables, drop-offs, replies the user owes them)

**Open items touching them:**
- (cross-reference to data/open-loops.md)

## Interactions (most recent first)
- YYYY-MM-DD · 1-line note

## Notes
- (the user's private notes about this person)
```

This is a *living* file. The COS appends an Interactions entry every time you mention them. It rewrites the Living model section as themes shift. It bumps `last-touch:` to today on every mention.

### 4.2. Cadence + overdue surfacing

Each person has a `target:` cadence (`weekly`, `biweekly`, `monthly`, `quarterly`, or `every 6 weeks`). The server parses it and computes whether `last-touch` is older than the cadence target:

```js
function cadenceDays(c) {
  if (!c) return null;
  const m = c.match(/(\d+)\s*(day|week|month|year)/i);
  if (m) { const n = +m[1]; const u = m[2].toLowerCase(); return n * (u.startsWith("d") ? 1 : u.startsWith("w") ? 7 : u.startsWith("m") ? 30 : 365); }
  const map = { daily: 1, weekly: 7, biweekly: 14, monthly: 30, quarterly: 90, yearly: 365 };
  return map[c.toLowerCase()] || null;
}
```

Overdue people get surfaced in the **"Who needs you today"** section of the morning brief:

> **Who needs you today.** Mom: overdue for a check-in, last touch 3 weeks ago. Anna: drop dress shoes by 9am.

That sentence is structurally impossible for Cozi, ChatGPT, or Motion to generate. The data model isn't there.

### 4.3. The parser is forgiving

`parsePersonFile()` accepts both the canonical template *and* legacy formats — if you migrate from an older notes app, it'll fall back to reading "Open items" as needs and the Interactions log as themes. The COS migrates files to canonical on next touch.

---

## 5. The Outlook layer

### 5.1. Why Microsoft Graph (and not Gmail)

The first user runs on Hotmail / Outlook personal — that's where we started. Gmail is a planned next integration with the same pattern: device-code OAuth, scoped read+propose, never auto-send.

### 5.2. Why the public Graph CLI client

Most Outlook integrations require you to register an app in Microsoft Entra ID (formerly Azure AD), which is a multi-page configuration wizard, sometimes blocked for personal accounts entirely.

We don't do that. We use Microsoft's **public first-party client ID** — `14d82eec-204b-4c2f-b7e8-296a70dab67e`, the "Graph Command Line Tools" application — which works for any personal Microsoft account via device-code flow, with no Azure setup.

This is the same client ID `mgc` (Microsoft Graph CLI) uses. It's safe to bake into our `.env.example` because it's intended for exactly this use case.

### 5.3. The flow

```
1. user clicks "Connect Outlook" in the canvas
2. POST /api/connect/microsoft
   → server hits /devicecode with our scopes
   → returns { user_code: "ABCD-1234", verification_uri: "..." }
3. user opens the URL on any device, enters the code, signs in, consents
4. server polls /token until it sees access_token (every 5s)
5. server writes { access_token, refresh_token, expires_at } to
   data/connections/microsoft.json
6. all subsequent API calls use msAccessToken() which auto-refreshes
```

Scopes:

```
Mail.Read · Calendars.ReadWrite · User.Read · offline_access
```

`offline_access` is what gives us the refresh token. We never asked for `Mail.Send` because we never auto-send. (Replies are drafted, shown as proposals, and require a click to send via the Outlook web link.)

### 5.4. In-SDK MCP tools

The chat COS gets calendar capability through an in-process MCP server:

```js
const calendarMcp = createSdkMcpServer({
  name: "familyos",
  version: "1.0.0",
  tools: [
    tool("set_reminder", "...", { whenLocal: z.string(), text: z.string() }, async ({...}) => {...}),
    tool("calendar_create", "...", {...}, async ({...}) => {...}),
    tool("calendar_list",   "...", {...}, async ({...}) => {...}),
    tool("calendar_update", "...", {...}, async ({...}) => {...}),
    tool("calendar_cancel", "...", {...}, async ({...}) => {...}),
  ],
});
```

These tools are registered via `mcpServers: { familyos: calendarMcp }` in the `query()` options. The permission gate explicitly allows `mcp__familyos__*` alongside the file tools.

Why MCP and not just function calls? Because **MCP is the right ontology**: tools are versioned, schema'd (zod), and the SDK handles the marshalling. When we add a Gmail integration, it'll be `gmailMcp` registered the same way. The COS's mental model doesn't change.

---

## 6. The scheduler

A single `setInterval(60 * 1000)` runs three jobs:

```js
setInterval(async () => {
  // 1. fire any reminders whose fireAtLocal <= now
  // 2. once/day after BRIEF_HOUR (default 7am):
  //    - generateBrief() and cache it
  //    - computeTriage() and cache it
  // 3. once/day after 20:00:
  //    - generateReflection(), write to daybook + cache
}, 60000);
```

Why a 60s tick and not cron-style scheduling? Because:

- The user might launch the app at 10am, after the brief should've fired. We want it to generate as soon as we notice.
- "Once per day" is implemented as "the cached one's date is older than today" — naturally idempotent.
- Sub-minute precision is enough for a household assistant.

The flip side: this means the app needs to be running for proactivity. On Windows we ship a `start-familyos.vbs` you can register as a logon task; mac/Linux are TODO (good first contribution).

---

## 7. Security & permission model

The COS is sandboxed in three layers:

### 7.1. The SDK permission gate

`canUseTool` is the hard boundary. Anything not allow-listed is denied:

```js
ALLOWED_TOOLS = { Read, Write, Edit, MultiEdit, Glob, Grep }
// plus: anything starting with "mcp__familyos__"
```

Bash, WebFetch, ExecuteCode — denied. No way for the model to call out to a shell, run a script, or fetch a URL.

### 7.2. The working directory

`query({ options: { cwd: ROOT } })` — the SDK sets the model's working directory to the repo root. The skill instructs the model to always use **relative paths** (`data/people/dad.md`, never `/Users/.../data/people/dad.md`). Combined with the file tools being scoped to cwd, this confines reads/writes to your repo.

If a user really wants to use absolute paths anyway, the file tools allow them — we depend on the skill discipline to prevent that. Adding a path-prefix check at the `canUseTool` level is a possible future hardening (it'd reject any tool input whose path escapes ROOT).

### 7.3. The Microsoft Graph token

`data/connections/microsoft.json` holds the access + refresh tokens. It's `.gitignore`'d by default. If you delete this file (or hit "Disconnect" in the UI), the COS loses Outlook access immediately. The tokens are bearer tokens tied to your account — guard the file.

### 7.4. What an attacker who compromised the COS process could do

- Read every file in `data/` (which they could anyway — local-first, your filesystem)
- Write to those files (same)
- Read your inbox + manipulate your calendar (via the Graph token in connections/)
- Send chat to Anthropic on your API key (cost concern)

What they could *not* do, even via prompt injection:

- Run arbitrary shell commands (no Bash tool)
- Open arbitrary network connections (no WebFetch)
- Send email (no `Mail.Send` scope, no `mcp__familyos__email_send` tool)

This is meaningful. The COS gives a sophisticated prompt-injection attacker far fewer levers than ChatGPT's Operator / Comet / a code-execution agent would.

---

## 8. Trade-offs we made

Every architecture has them. Naming ours up front:

### 8.1. Markdown as the source of truth

**Win:** Human-readable, grep-able, diffable, syncable, durable across decades. The COS doesn't own the schema.

**Loss:** No transactional safety. No indexed search. No constraints. We can't enforce that `target: weekly` is one of the documented cadences — we accept whatever's there and parse leniently. Forgiving parsers are a smell, but for this use case they're correct.

### 8.2. One COS process, single user

**Win:** No coordination problems. Race conditions essentially don't happen. The system is conceptually small.

**Loss:** No multi-tenant story. If you want your partner to use Family OS, they run their own copy on their machine. Multi-user family with a shared graph is on the roadmap, but it's a real change — not "add an auth layer" but "design what shared looks like".

### 8.3. Anthropic only

**Win:** The Agent SDK gives us tool-use, permission gating, MCP servers, streaming, session resumption — all in one package. The model quality is enough to do decide-with-me, north-star alignment, and proper triage at $0.05–0.12 per turn.

**Loss:** Vendor concentration. If Anthropic raises prices or sunsets the SDK, we have work to do. Mitigation: the SKILL.md is portable to any sufficiently capable model + tool-use loop; the persona is the asset, not the SDK.

### 8.4. Scheduler is a 60s setInterval, not a real cron

**Win:** Simple. Works offline. Handles "app was launched mid-day" gracefully.

**Loss:** Sub-minute precision impossible. No backfill if the app was down for days. Mitigation: when needed, we'll add a startup-time backfill pass; not a top priority for a household scale.

### 8.5. No vector embeddings yet

**Win:** Zero infrastructure. Search is grep + LLM context. For folders under ~1000 files it's fine.

**Loss:** Recall is *eager* (the model rereads files) rather than *semantic* (embedding similarity). When the knowledge base hits a few thousand records, we'll need local embeddings (something like `sqlite-vec` or `lancedb` running entirely on disk). Never as a hosted service.

---

## 9. Repo layout

```
family-os/
├── README.md                 # the front door
├── LICENSE                   # MIT
├── CONTRIBUTING.md
├── .gitignore                # data/, .env, tokens — never committed
├── package.json              # root-level: setup, start, dev
├── setup.mjs                 # one-command interactive setup wizard
│
├── app/                      # the runtime
│   ├── server.mjs            # Express + Agent SDK + MS Graph + MCP
│   ├── package.json
│   ├── .env.example
│   └── public/               # the canvas UI (vanilla JS)
│       ├── index.html
│       ├── app.js
│       └── style.css
│
├── family-os/                # the skill — the brain
│   ├── README.md
│   ├── .claude-plugin/
│   │   └── plugin.json
│   └── skills/
│       └── family-os/
│           └── SKILL.md      # ← edit this to change behavior
│
├── data.example/             # templates copied to data/ on setup
│   ├── open-loops.md
│   ├── principal/
│   │   ├── profile.md
│   │   ├── standing-instructions.md
│   │   └── north-star.md
│   ├── people/
│   ├── daybook/
│   ├── decisions/
│   ├── knowledge/
│   ├── playbooks/
│   └── connections/
│
└── docs/
    ├── ARCHITECTURE.md       # you are here
    ├── SETUP.md              # detailed manual setup
    └── images/
```

The `data/` folder appears after `npm run setup` (or on first run) — copied from `data.example/`. It's `.gitignore`'d, so your data never enters source control by accident.

---

## What to read next

- **[`family-os/skills/family-os/SKILL.md`](../family-os/skills/family-os/SKILL.md)** — the COS persona. This is the most-edited file in the repo.
- **[`app/server.mjs`](../app/server.mjs)** — the runtime. ~800 lines, organized top-to-bottom: helpers → chat → loops → notes → Graph OAuth → inbox → triage → calendar → brief → reflection → people → scheduler → MCP tools → listen.
- **[`SETUP.md`](SETUP.md)** — if `npm run setup` failed you and you want to do it by hand.
