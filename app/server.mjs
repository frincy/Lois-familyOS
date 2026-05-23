import { query, tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, ".."); // repo root
const DATA = path.join(ROOT, "data");
const SKILL_PATH = path.join(ROOT, "family-os", "skills", "family-os", "SKILL.md");

// ---- load app/.env BEFORE we touch process.env ---------------------------
(function loadEnv() {
  try {
    const txt = fs.readFileSync(path.join(__dirname, ".env"), "utf8");
    for (const line of txt.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !line.trim().startsWith("#") && !process.env[m[1]]) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
      }
    }
  } catch {}
})();

const PORT = process.env.PORT || 4317;
const MODEL = process.env.MODEL || "claude-opus-4-7";
const PRINCIPAL = process.env.PRINCIPAL_NAME || "the user";
const ALLOWED_TOOLS = new Set(["Read", "Write", "Edit", "MultiEdit", "Glob", "Grep"]);

if (!process.env.ANTHROPIC_API_KEY) {
  console.warn("[warn] ANTHROPIC_API_KEY is not set. The Agent SDK will try to fall back to a Claude Code session if one is installed. To use API-key auth, set ANTHROPIC_API_KEY in app/.env (run `npm run setup` to do this interactively).");
}

const app = express();
app.use(express.json({ limit: "1mb" }));
// no-store so the browser always loads the latest UI (no stale cached CSS/JS)
app.use(express.static(path.join(__dirname, "public"), {
  setHeaders: (res) => res.setHeader("Cache-Control", "no-store"),
}));

function lanAddresses() {
  const out = [];
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const i of ifaces[name] || []) {
      if (i.family === "IPv4" && !i.internal) out.push(i.address);
    }
  }
  return out;
}

// ---- helpers ---------------------------------------------------------------

function readFileSafe(p, fallback = "(file not found)") {
  try {
    return fs.readFileSync(p, "utf8");
  } catch {
    return fallback;
  }
}

// Strip YAML frontmatter from a SKILL.md so we keep just the instruction body.
function stripFrontmatter(md) {
  if (md.startsWith("---")) {
    const end = md.indexOf("\n---", 3);
    if (end !== -1) return md.slice(md.indexOf("\n", end + 1) + 1).trim();
  }
  return md.trim();
}

function today() { return new Date().toLocaleDateString("en-CA"); } // YYYY-MM-DD, local time

// Built fresh each request so edits to the skill / principal files are picked up.
function buildSystemPrompt() {
  const skill = stripFrontmatter(readFileSafe(SKILL_PATH));
  const standing = readFileSafe(path.join(DATA, "principal", "standing-instructions.md"));
  const profile = readFileSafe(path.join(DATA, "principal", "profile.md"));

  return `${skill}

---
# Runtime context — you are running inside ${PRINCIPAL}'s local Family OS app

- Working directory is the repo root. All data lives under \`data/\`.
- ALWAYS use paths relative to the working directory (e.g. \`data/people/dad.md\`). NEVER use absolute paths or \`~\` — they will fail on this machine.
- You can read and write files with your file tools, and writes apply immediately with NO confirmation prompt. So "file IS the response" — do the filing, then show the receipt, exactly as your skill describes.
- Today's date is ${today()}. Use it for "opened {date}", daybook filenames (data/daybook/${today().slice(0, 4)}/${today().slice(5, 7)}/${today()}.md), etc.
- Current local time is ${new Date().toLocaleString()}. When ${PRINCIPAL} says "remind me at/in/by …" or asks you to nudge them later, call \`set_reminder\` with a local datetime (YYYY-MM-DDTHH:MM) computed from that current time, and confirm in your receipt.
- You can read and modify ${PRINCIPAL}'s Outlook **calendar** (if connected): \`calendar_list\` (find events + ids), \`calendar_create\` (ADD an event — compute local time), \`calendar_update\` (MOVE/reschedule an event — use when they say "move my 2pm to 4pm" / "push X to Friday"), and \`calendar_cancel\` (remove). Calendar events are real time blocks; \`set_reminder\` is just a nudge — pick the right one. When they ask for a move, always call \`calendar_list\` first to find the right id, then \`calendar_update\`. When they say a meeting is cancelled / ask you to cancel or remove one: call \`calendar_list\` to find the matching event, and if more than one could match, ask which (one short question). Once you're sure, call \`calendar_cancel\` with that event's id, then confirm in your receipt what you cancelled (title + time). Never cancel an event you're not sure about. You can also use \`calendar_list\` to answer "what's on my calendar".
- ${PRINCIPAL}'s standing instructions and profile are reproduced below, so you do NOT need to re-read those two files each turn. You SHOULD still read data/open-loops.md and any relevant data/people/<name>.md before acting on them, and you MUST write to those files (and append today's daybook) whenever your skill says to.

## Current data/principal/standing-instructions.md
${standing}

## Current data/principal/profile.md
${profile}

## Current data/principal/north-star.md (their strategic priorities this season)
${readFileSafe(path.join(DATA, "principal", "north-star.md"))}

When ${PRINCIPAL} is considering a new commitment, optional ask, or a non-trivial decision, briefly check it against the north-star above. If it clearly fits, just proceed. If it clearly DOESN'T fit, push back in one short line citing which north-star item it conflicts with — then let them decide. Don't moralize and don't do this on every small thing.

---
# Onboarding behavior (when ${PRINCIPAL} is setting up the OS)

When ${PRINCIPAL} is setting things up (or you receive a setup kickoff), your job is to populate two primitives conversationally, ONE step at a time, in Quick mode:

1. **People directory** — \`data/people/<name>.md\`. Use the canonical template from your skill ("Updating people — living family models" — Cadence + Facts + Living model + Interactions + ${PRINCIPAL}'s notes). Don't interrogate — get name + relationship + 1-2 key facts, create the file with the template (Facts populated, Living model blank, Cadence set), show a receipt, move on. If the file already exists in an older format (Profile/Notes/Interaction log/Open items), MIGRATE it to the canonical template when you next touch it.

2. **Open loops** — append to \`data/open-loops.md\` Active section in the format: \`- ○ {title} · {context} · opened ${today()} · next: {action}\`.

Go one captured item at a time. After each, show a receipt with the real file path and offer next actions like [Add another person] · [Move to open loops] · [Done for now]. When they signal they're done, give a one-paragraph summary of what's now set up and the natural next step (start using it day-to-day; flesh out the principal profile later). Stay terse — this is still Quick mode.`;
}

// The Agent SDK treats a leading-slash message as a slash command and no-ops on
// unknown ones. So we expand our known commands into plain-text instructions
// before they reach the model (the COS already knows the view + mode rules).
const VIEW_INSTRUCTION = (which) =>
  `Show me the /${which} view now, exactly following your "/${which}" rendering rules from your skill. Read data/open-loops.md live first. This is a VIEW — do not modify any file.`;

const MODE_NAMES = { quick: "Quick", working: "Working", deep: "Deep", silent: "Silent" };

function expandCommand(message) {
  const trimmed = (message || "").trim();
  const m = trimmed.match(/^\/(\w+)\b\s*([\s\S]*)$/);
  if (!m) return trimmed;
  const cmd = m[1].toLowerCase();
  const rest = m[2].trim();
  if (cmd === "today" || cmd === "week") return VIEW_INSTRUCTION(cmd);
  if (MODE_NAMES[cmd]) {
    return `Switch to ${MODE_NAMES[cmd]} mode.` + (rest ? `\n\n${rest}` : "");
  }
  return trimmed; // unknown — pass through unchanged
}

const SETUP_KICKOFF =
  `[SYSTEM EVENT: ${PRINCIPAL} just opened the Family OS app and chose to set it up. Begin guided onboarding now. Give a one-line orientation of what you'll set up together (people directory + current open loops), then ask your FIRST question to start the people directory. Quick mode — terse, warm, no preamble, no fluff.]`;

function summarizeTool(name, input = {}) {
  switch (name) {
    case "Read":
      return `read ${rel(input.file_path)}`;
    case "Write":
      return `wrote ${rel(input.file_path)}`;
    case "Edit":
    case "MultiEdit":
      return `edited ${rel(input.file_path)}`;
    case "Glob":
      return `searched ${input.pattern || ""}`;
    case "Grep":
      return `grepped "${input.pattern || ""}"`;
    default:
      return name;
  }
}

function rel(p) {
  if (!p) return "";
  return String(p).replace(ROOT + path.sep, "").replace(ROOT + "/", "").replace(/\\/g, "/");
}

// ---- chat endpoint (SSE) ---------------------------------------------------

app.post("/api/chat", async (req, res) => {
  const { message, sessionId, kickoff } = req.body || {};
  const prompt = kickoff === "setup" ? SETUP_KICKOFF : expandCommand(message);

  if (!prompt.trim()) {
    res.status(400).json({ error: "empty message" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const send = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  let newSessionId = sessionId || null;

  try {
    const options = {
      cwd: ROOT,
      model: MODEL,
      mcpServers: { familyos: calendarMcp },
      // permission gate: file tools + our familyos calendar tools; deny the rest.
      canUseTool: async (toolName, input) => {
        if (ALLOWED_TOOLS.has(toolName) || toolName.startsWith("mcp__familyos__")) return { behavior: "allow", updatedInput: input };
        return { behavior: "deny", message: `${toolName} is not permitted in the Family OS app.` };
      },
      systemPrompt: buildSystemPrompt(),
    };
    if (sessionId) options.resume = sessionId;

    const q = query({ prompt, options });

    for await (const msg of q) {
      if (msg.type === "system" && msg.subtype === "init") {
        newSessionId = msg.session_id;
        send("session", { sessionId: newSessionId });
      } else if (msg.type === "assistant") {
        for (const block of msg.message.content) {
          if (block.type === "text" && block.text) {
            send("text", { text: block.text });
          } else if (block.type === "tool_use" && ALLOWED_TOOLS.has(block.name)) {
            send("tool", { summary: summarizeTool(block.name, block.input) });
          }
        }
      } else if (msg.type === "result") {
        send("done", {
          sessionId: newSessionId,
          costUsd: msg.total_cost_usd ?? null,
          isError: !!msg.is_error,
        });
      }
    }
  } catch (err) {
    send("error", { message: err?.message || String(err) });
  } finally {
    res.end();
  }
});

// ---- structured open-loops read/write (for the board) ---------------------

const LOOPS_PATH = path.join(DATA, "open-loops.md");

function parseLoops() {
  const md = readFileSafe(LOOPS_PATH, "");
  const lines = md.split(/\r?\n/);
  const activeIdx = lines.findIndex((l) => /^##\s+Active\b/.test(l));
  const doneIdx = lines.findIndex((l) => /^##\s+Done\b/.test(l));
  const header = activeIdx >= 0 ? lines.slice(0, activeIdx).join("\n").replace(/\s+$/, "") : md.replace(/\s+$/, "");
  const activeHeading = activeIdx >= 0 ? lines[activeIdx] : "## Active  (top = highest priority — reorder freely)";
  const doneHeading = doneIdx >= 0 ? lines[doneIdx] : "## Done (recent)";
  const parseSection = (from, to) => {
    const out = [];
    for (let i = from; i < to; i++) {
      const m = lines[i].match(/^- \[([ xX])\]\s+(.*)$/);
      if (m) out.push({ done: m[1].toLowerCase() === "x", text: m[2].trim() });
    }
    return out;
  };
  const active = activeIdx >= 0 ? parseSection(activeIdx + 1, doneIdx >= 0 ? doneIdx : lines.length) : [];
  const done = doneIdx >= 0 ? parseSection(doneIdx + 1, lines.length) : [];
  return { header, activeHeading, doneHeading, active, done };
}

function serializeLoops({ header, activeHeading, doneHeading, active, done }) {
  const activeBlock = active.length
    ? active.map((i) => `- [${i.done ? "x" : " "}] ${i.text}`).join("\n")
    : "(none yet)";
  const doneBlock = done.length
    ? done.map((i) => `- [x] ${i.text}`).join("\n")
    : "(none yet)";
  return `${header}\n\n${activeHeading}\n\n${activeBlock}\n\n${doneHeading}\n\n${doneBlock}\n`;
}

app.get("/api/loops", (req, res) => {
  const p = parseLoops();
  res.json({ today: today(), active: p.active, done: p.done });
});

app.post("/api/loops", (req, res) => {
  const { active, done } = req.body || {};
  if (!Array.isArray(active) || !Array.isArray(done)) {
    res.status(400).json({ error: "active and done must be arrays" });
    return;
  }
  const cur = parseLoops();
  const clean = (arr, forceDone) =>
    arr
      .map((i) => ({ done: forceDone || !!i.done, text: String(i.text || "").trim() }))
      .filter((i) => i.text);
  const md = serializeLoops({
    header: cur.header,
    activeHeading: cur.activeHeading,
    doneHeading: cur.doneHeading,
    active: clean(active, false),
    done: clean(done, true),
  });
  fs.mkdirSync(path.dirname(LOOPS_PATH), { recursive: true });
  fs.writeFileSync(LOOPS_PATH, md, "utf8");
  res.json({ ok: true });
});

// ---- note / result records (the knowledge base) ---------------------------
// Each item's result lives at data/knowledge/<category>/<slug>.md — a durable
// record you can reference next time something similar comes up.
const KNOWLEDGE = path.join(DATA, "knowledge");

function safeRef(ref) {
  const parts = String(ref || "")
    .split("/")
    .map((s) => s.replace(/[^a-z0-9\-_]/gi, "").toLowerCase())
    .filter(Boolean);
  if (parts.length < 2) return null;
  return [parts[0], parts.slice(1).join("-")]; // [category, slug]
}

app.get("/api/note", (req, res) => {
  const r = safeRef(req.query.ref);
  if (!r) { res.status(400).json({ error: "bad ref" }); return; }
  const fp = path.join(KNOWLEDGE, r[0], r[1] + ".md");
  res.json({ ref: r.join("/"), content: readFileSafe(fp, "") });
});

app.post("/api/note", (req, res) => {
  const { ref, content } = req.body || {};
  const r = safeRef(ref);
  if (!r) { res.status(400).json({ error: "bad ref" }); return; }
  const dir = path.join(KNOWLEDGE, r[0]);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, r[1] + ".md"), String(content || ""), "utf8");
  res.json({ ok: true, ref: r.join("/") });
});

// ---- Microsoft Graph (Outlook) — device-code flow --------------------------
const MS_CLIENT_ID = process.env.MS_CLIENT_ID || "";
const MS_AUTHORITY = "https://login.microsoftonline.com/consumers/oauth2/v2.0";
const MS_SCOPE = "Mail.Read Calendars.ReadWrite User.Read offline_access";
const CONN_DIR = path.join(DATA, "connections");
const MS_TOKEN_PATH = path.join(CONN_DIR, "microsoft.json");
let msPending = null;

function readMsToken() { try { return JSON.parse(fs.readFileSync(MS_TOKEN_PATH, "utf8")); } catch { return null; } }
function writeMsToken(t) { fs.mkdirSync(CONN_DIR, { recursive: true }); fs.writeFileSync(MS_TOKEN_PATH, JSON.stringify(t, null, 2)); }

async function msForm(endpoint, params) {
  const r = await fetch(MS_AUTHORITY + endpoint, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  return r.json();
}
async function msRefresh(token) {
  const j = await msForm("/token", { client_id: MS_CLIENT_ID, grant_type: "refresh_token", refresh_token: token.refresh_token, scope: MS_SCOPE });
  if (!j.access_token) throw new Error("refresh failed: " + (j.error_description || JSON.stringify(j)));
  const t = { ...token, access_token: j.access_token, refresh_token: j.refresh_token || token.refresh_token, expires_at: Date.now() + j.expires_in * 1000 - 60000 };
  writeMsToken(t); return t;
}
async function msAccessToken() {
  let t = readMsToken();
  if (!t) throw new Error("not connected");
  if (Date.now() >= (t.expires_at || 0)) t = await msRefresh(t);
  return t.access_token;
}
async function pollDeviceCode() {
  const p = msPending;
  while (msPending === p && Date.now() < p.expires_at) {
    await new Promise((r) => setTimeout(r, (p.interval + 1) * 1000));
    if (msPending !== p) return;
    const j = await msForm("/token", { client_id: MS_CLIENT_ID, grant_type: "urn:ietf:params:oauth:grant-type:device_code", device_code: p.device_code });
    if (j.access_token) {
      writeMsToken({ access_token: j.access_token, refresh_token: j.refresh_token, scope: j.scope, expires_at: Date.now() + j.expires_in * 1000 - 60000 });
      p.status = "connected"; msPending = null; return;
    }
    if (j.error === "slow_down") { p.interval += 5; continue; }
    if (j.error && j.error !== "authorization_pending") { p.status = "error"; p.error = j.error_description || j.error; return; }
  }
  if (msPending === p) p.status = "expired";
}

app.get("/api/connections", (req, res) => res.json({ microsoft: !!readMsToken(), clientConfigured: !!MS_CLIENT_ID }));

app.post("/api/connect/microsoft", async (req, res) => {
  if (!MS_CLIENT_ID) { res.status(400).json({ error: "MS_CLIENT_ID not set in app/.env. The default is Microsoft's public Graph CLI client (14d82eec-204b-4c2f-b7e8-296a70dab67e), set during `npm run setup`. Re-run setup or edit app/.env." }); return; }
  try {
    const j = await msForm("/devicecode", { client_id: MS_CLIENT_ID, scope: MS_SCOPE });
    if (!j.device_code) { res.status(400).json({ error: j.error_description || "device code request failed" }); return; }
    msPending = { user_code: j.user_code, verification_uri: j.verification_uri, device_code: j.device_code, interval: j.interval || 5, expires_at: Date.now() + j.expires_in * 1000, status: "pending" };
    pollDeviceCode();
    res.json({ user_code: j.user_code, verification_uri: j.verification_uri });
  } catch (e) { res.status(500).json({ error: String(e) }); }
});

app.get("/api/connect/status", (req, res) => {
  res.json({ connected: !!readMsToken(), pending: msPending ? { status: msPending.status, error: msPending.error } : null });
});

app.post("/api/disconnect/microsoft", (req, res) => { try { fs.rmSync(MS_TOKEN_PATH); } catch {} msPending = null; res.json({ ok: true }); });

function stripHtml(html) {
  return String(html || "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"')
    .replace(/\s+/g, " ").trim();
}
async function fetchTodayInbox(includeBody) {
  const token = await msAccessToken();
  const midnight = new Date(today() + "T00:00:00").toISOString();
  const select = "id,conversationId,from,subject,bodyPreview,receivedDateTime,isRead,webLink" + (includeBody ? ",body" : "");
  const params = new URLSearchParams({
    "$filter": `receivedDateTime ge ${midnight}`,
    "$select": select,
    "$orderby": "receivedDateTime desc",
    "$top": "50",
  }).toString().replace(/\+/g, "%20");
  const r = await fetch("https://graph.microsoft.com/v1.0/me/mailFolders/Inbox/messages?" + params, { headers: { Authorization: "Bearer " + token } });
  const j = await r.json();
  if (j.error) throw new Error(j.error.message);
  return (j.value || []).map((m) => ({
    id: m.id,
    conversationId: m.conversationId,
    from: m.from?.emailAddress?.name || m.from?.emailAddress?.address || "(unknown)",
    subject: m.subject || "(no subject)",
    preview: (m.bodyPreview || "").replace(/\s+/g, " ").slice(0, 200),
    body: includeBody ? stripHtml(m.body?.content).slice(0, 1400) : undefined,
    at: m.receivedDateTime, isRead: m.isRead, link: m.webLink,
  }));
}

app.get("/api/inbox/today", async (req, res) => {
  try {
    const items = await fetchTodayInbox();
    try { fs.mkdirSync(path.join(DATA, "sync"), { recursive: true }); fs.writeFileSync(path.join(DATA, "sync", "inbox.json"), JSON.stringify({ syncedAt: new Date().toISOString(), items }, null, 2)); } catch {}
    res.json({ today: today(), count: items.length, items });
  } catch (e) { res.status(400).json({ error: String(e.message || e) }); }
});

// ---- triage: COS reads inbox + open loops → structured proposals (read-only)
async function runJsonQuery(systemPrompt, prompt) {
  let text = "";
  const q = query({ prompt, options: { model: MODEL, systemPrompt, canUseTool: async () => ({ behavior: "deny", message: "no tools during triage" }) } });
  for await (const m of q) {
    if (m.type === "assistant") for (const b of m.message.content) if (b.type === "text") text += b.text;
  }
  return text;
}
function parseJsonLoose(text) {
  let t = (text || "").trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const s = t.indexOf("{"), e = t.lastIndexOf("}");
  if (s >= 0 && e > s) t = t.slice(s, e + 1);
  return JSON.parse(t);
}
const TRIAGE_SYSTEM = `You are ${PRINCIPAL}'s Chief of Staff triaging their email inbox. Output ONLY JSON, no prose.
Categories: house, health, education, finance, goals, personal.
For each email choose a "type":
- "new": a TASK ${PRINCIPAL} must DO (follow-up work / something to complete) that's not already tracked → "title" (terse, <8 words), "category", "due" (YYYY-MM-DD or null; extract any deadline), "nextAction".
- "new_event": the email implies a MEETING / EVENT to put on the CALENDAR — someone proposes a meeting, asks them to confirm a time, sends an invite-like message, or schedules an appointment → "title" (event subject), "category", "eventStart" (LOCAL "YYYY-MM-DDTHH:MM" — extract from the email if a time is given; if not, propose a sensible one in business hours), "eventDuration" (minutes, default 60). Leave "due"/"nextAction" null.
  DISTINGUISH carefully: "please review X" / "send me Y" → new (task). "Let's meet at 3pm Thursday" / "confirm our call" / "book your appointment at …" → new_event.
- "update": ONLY when the email clearly concerns ONE specific existing open loop (same thread, same specific matter) → "loopIndex" + "summary". ALSO include "title" + "category" as a fallback (in case it's really new).
- "reply": needs a reply from ${PRINCIPAL} → "draft" (1-2 sentences). ALSO include "title" + "category" fallback.
- "fyi": newsletter, promo, receipt, automated notice, or anything needing no action.

CRITICAL accuracy rules (mismatches are worse than misses):
- Be VERY CONSERVATIVE about "update". Sharing the same category, person, or general topic is NOT enough — it must be the SAME specific task/thread as the loop. Read the email body and use conversationId to judge thread continuity.
- If the email is a DIFFERENT matter from every loop, choose "new" (or fyi) — never force a loose "update".
- When unsure between "update" and "new", choose "new".
- "reason" MUST cite the specific evidence (e.g. quote the loop title and why it matches, or why it's new).

Output exactly: {"proposals":[{"emailId":"...","type":"new|new_event|update|reply|fyi","title":null,"category":null,"due":null,"nextAction":null,"loopIndex":null,"summary":null,"draft":null,"eventStart":null,"eventDuration":null,"reason":"..."}]}`;

const TRIAGE_CACHE = path.join(DATA, "sync", "triage.json");
function writeTriageCache(out) { fs.mkdirSync(path.join(DATA, "sync"), { recursive: true }); fs.writeFileSync(TRIAGE_CACHE, JSON.stringify({ date: today(), generatedAt: new Date().toISOString(), ...out }, null, 2)); }
function readTriageCache() { try { return JSON.parse(fs.readFileSync(TRIAGE_CACHE, "utf8")); } catch { return null; } }

const LEARNED_PATH = path.join(DATA, "principal", "learned.json");
function readLearned() { try { return JSON.parse(fs.readFileSync(LEARNED_PATH, "utf8")); } catch { return { events: [] }; } }
function writeLearned(l) { fs.mkdirSync(path.join(DATA, "principal"), { recursive: true }); fs.writeFileSync(LEARNED_PATH, JSON.stringify(l, null, 2)); }

async function computeTriage() {
  const items = await fetchTodayInbox(true);
  if (!items.length) return { proposals: [], emailCount: 0 };
  const loops = parseLoops().active.map((it, i) => ({ loopIndex: i, loop: it.text.trim() }));
  const recent = (readLearned().events || []).slice(-30);
  const prefBlock = recent.length
    ? `\n\n${PRINCIPAL}'s recent triage decisions — LEARN their preferences (e.g. senders/topics repeatedly dismissed should be "fyi"; ones accepted are actionable):\n${JSON.stringify(recent)}`
    : "";
  const emailsForModel = items.map((m) => ({
    emailId: m.id, from: m.from, subject: m.subject,
    isReply: /^\s*(re|fw|fwd)\s*:/i.test(m.subject), conversationId: m.conversationId, body: m.body, at: m.at,
  }));
  const prompt = `Today's inbox (full bodies; emails sharing a conversationId are the same thread):\n${JSON.stringify(emailsForModel, null, 2)}\n\nCurrent open loops (full text incl. #category):\n${JSON.stringify(loops, null, 2)}${prefBlock}\n\nTriage every email per the rules, applying what you've learned about ${PRINCIPAL}'s preferences. Output the JSON now.`;
  const text = await runJsonQuery(TRIAGE_SYSTEM, prompt);
  const parsed = parseJsonLoose(text); // throws on bad output
  const byId = Object.fromEntries(items.map((m) => [m.id, m]));
  const proposals = (parsed.proposals || []).map((p, idx) => {
    const m = byId[p.emailId] || {};
    return { ...p, pid: "p" + idx, _from: m.from, _subject: m.subject, _link: m.link };
  });
  return { proposals, emailCount: items.length };
}

app.post("/api/triage", async (req, res) => {
  try { const out = await computeTriage(); writeTriageCache(out); res.json(out); }
  catch (e) { res.status(400).json({ error: String(e.message || e) }); }
});
app.get("/api/triage/cached", (req, res) => { const c = readTriageCache(); res.json(c && c.date === today() ? c : { proposals: [], emailCount: 0, stale: true }); });
app.post("/api/learn", (req, res) => {
  const { from, subject, action, category } = req.body || {};
  if (!action) { res.status(400).json({ error: "action required" }); return; }
  const l = readLearned();
  l.events = (l.events || []).concat([{ from: from || "", subject: (subject || "").slice(0, 80), action, category: category || null, at: new Date().toISOString() }]).slice(-200);
  writeLearned(l);
  res.json({ ok: true });
});

async function fetchCalendar(startDate, days) {
  const token = await msAccessToken();
  const start = new Date(startDate + "T00:00:00");
  const end = new Date(start); end.setDate(end.getDate() + days);
  const params = new URLSearchParams({
    startDateTime: start.toISOString(),
    endDateTime: end.toISOString(),
    "$select": "id,subject,start,end,location,isAllDay,webLink",
    "$orderby": "start/dateTime",
    "$top": "100",
  }).toString().replace(/\+/g, "%20");
  const r = await fetch("https://graph.microsoft.com/v1.0/me/calendarView?" + params, { headers: { Authorization: "Bearer " + token } });
  const j = await r.json();
  if (j.error) throw new Error(j.error.message);
  const zsuf = (s) => (/Z$/.test(s) ? s : s + "Z"); // calendarView returns UTC
  return (j.value || []).map((e) => ({
    id: e.id,
    subject: e.subject || "(no title)",
    startUtc: zsuf(e.start.dateTime), endUtc: zsuf(e.end.dateTime),
    isAllDay: e.isAllDay, location: e.location?.displayName || "", link: e.webLink,
  }));
}

app.get("/api/calendar", async (req, res) => {
  try {
    const t = today();
    const todayEv = await fetchCalendar(t, 1);
    const weekEv = await fetchCalendar(t, 7);
    res.json({ today: todayEv, week: weekEv });
  } catch (e) { res.status(400).json({ error: String(e.message || e) }); }
});

// create an event (write) — only when the user clicks Schedule
async function createCalendarEvent({ subject, startLocal, durationMins, timeZone }) {
  const token = await msAccessToken();
  const dur = Math.max(15, +durationMins || 60);
  const pad = (n) => String(n).padStart(2, "0");
  const startDt = startLocal.length === 16 ? startLocal + ":00" : startLocal; // YYYY-MM-DDTHH:MM[:SS]
  const endDate = new Date(startLocal); endDate.setMinutes(endDate.getMinutes() + dur);
  const endDt = `${endDate.getFullYear()}-${pad(endDate.getMonth() + 1)}-${pad(endDate.getDate())}T${pad(endDate.getHours())}:${pad(endDate.getMinutes())}:00`;
  const tz = timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const body = { subject, start: { dateTime: startDt, timeZone: tz }, end: { dateTime: endDt, timeZone: tz } };
  const r = await fetch("https://graph.microsoft.com/v1.0/me/events", { method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json();
  if (j.error) throw new Error(j.error.message);
  return { id: j.id, webLink: j.webLink };
}
app.post("/api/calendar/event", async (req, res) => {
  try {
    const { subject, startLocal, durationMins, timeZone } = req.body || {};
    if (!subject || !startLocal) { res.status(400).json({ error: "subject and startLocal required" }); return; }
    const r = await createCalendarEvent({ subject, startLocal, durationMins, timeZone });
    res.json({ ok: true, ...r });
  } catch (e) { res.status(400).json({ error: String(e.message || e) }); }
});

// ---- morning brief (proactive) -------------------------------------------
const BRIEF_PATH = path.join(DATA, "sync", "brief.json");
const BRIEF_HOUR = +(process.env.BRIEF_HOUR || 7);
function readBrief() { try { return JSON.parse(fs.readFileSync(BRIEF_PATH, "utf8")); } catch { return null; } }
function writeBrief(b) { fs.mkdirSync(path.join(DATA, "sync"), { recursive: true }); fs.writeFileSync(BRIEF_PATH, JSON.stringify(b, null, 2)); }

const BRIEF_SYSTEM = `You are ${PRINCIPAL}'s Chief of Staff writing them a short brief. Terse, warm, prioritized — like a sharp human chief of staff, not a chatbot. Plain markdown. No emoji unless natural. No preamble ("Good morning, here's…") — just the brief.
DATE/TIME (critical): you are given today's exact weekday, date, and current local time. USE THEM VERBATIM — never compute or guess the day of week yourself, and never say "tomorrow is X" unless it follows from the given date. If a to-do's TEXT contains a weekday (e.g. "meeting on Friday"), that is just the task's own wording — do NOT treat it as today or tomorrow.
NOW-AWARENESS: brief the REST of the day from NOW — events already past are context only, don't tee them up as upcoming. The open to-dos you're given are things ALREADY on the list — surface, prioritize, and chase them; NEVER tell ${PRINCIPAL} to "add" something already there, and don't repeat items clearly handled. Late in the day, lean toward what's left tonight + what's coming tomorrow.
Structure (skip any empty section):
- **First line:** the single thing that matters most today.
- **Today:** key calendar events in time order; call out conflicts.
- **Needs you:** overdue / due-today to-dos, most important first.
- **Who needs you today:** if any family member has live "needs from ${PRINCIPAL}" or is overdue on their check-in cadence, surface one line per member ("Anna: drop dress shoes by 9am · Mom: overdue for a call, last touch 3 weeks ago"). Skip the section if no one needs surfacing.
- **Radar:** things creeping up — "due soon" (next 3 days) and "stale" loops (open a while, no deadline). Flag them proactively and, where useful, suggest chasing or scheduling so nothing slips.
- **Inbox:** if there's unread mail, one line nudging a Triage.
- **Focus:** one closing line.
Under ~140 words. Be specific using the data; never invent.`;

async function generateBrief() {
  const t = today();
  let events = [], inboxCount = null;
  try { events = (await fetchCalendar(t, 1)).map((e) => ({ time: e.isAllDay ? "all-day" : new Date(e.startUtc).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }), subject: e.subject })); } catch {}
  try { inboxCount = (await fetchTodayInbox()).length; } catch {}
  const addDaysStr = (iso, n) => { const d = new Date(iso + "T00:00:00"); d.setDate(d.getDate() + n); const p = (x) => String(x).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
  const soon = addDaysStr(t, 3), staleBefore = addDaysStr(t, -10);
  const active = parseLoops().active.map((it) => {
    const due = (it.text.match(/due:(\d{4}-\d{2}-\d{2})/) || [])[1] || null;
    const opened = (it.text.match(/opened:(\d{4}-\d{2}-\d{2})/) || [])[1] || null;
    let status = "open";
    if (due && due < t) status = "overdue";
    else if (due === t) status = "due today";
    else if (due && due <= soon) status = "due soon";
    else if (opened && opened <= staleBefore) status = "stale";
    return { title: it.text.split("·")[0].trim(), due, opened, status };
  });
  const DOW = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const dayName = DOW[new Date(t + "T00:00:00").getDay()];
  const peopleData = listPeople().map((p) => ({ name: p.name, needs: p.needs, themes: p.themes, overdueDays: p.overdueDays || 0 }));
  const northStar = readFileSafe(path.join(DATA, "principal", "north-star.md"), "");
  const prompt = `TODAY is ${dayName}, ${t}. Current local time: ${new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}.\nToday's calendar (times are local): ${JSON.stringify(events)}\nOpen to-dos already on the list (status noted; chase/prioritize, never re-add — any weekday inside a to-do's text is just its wording, not the actual day): ${JSON.stringify(active)}\nUnread emails today: ${inboxCount == null ? "unknown" : inboxCount}\nFamily/people models (use the "Who needs you today" section ONLY for people with active "needs" or overdueDays > 0): ${JSON.stringify(peopleData)}\n\n${PRINCIPAL}'s north-star (their strategic priorities this season — let it quietly shape the Focus line; don't force a mention):\n${northStar}\n\nWrite the brief for the rest of today (${dayName}) now.`;
  return (await runJsonQuery(BRIEF_SYSTEM, prompt)).trim();
}

app.get("/api/brief", (req, res) => { const b = readBrief(); res.json(b ? { ...b, stale: b.date !== today() } : { date: null, markdown: null }); });
app.post("/api/brief/regenerate", async (req, res) => {
  try { const md = await generateBrief(); const b = { date: today(), generatedAt: new Date().toISOString(), markdown: md }; writeBrief(b); res.json(b); }
  catch (e) { res.status(400).json({ error: String(e.message || e) }); }
});

// ---- end-of-day reflection + tomorrow plan -------------------------------
const REFLECT_SYSTEM = `You are ${PRINCIPAL}'s Chief of Staff writing a short END-OF-DAY REFLECTION that also sets up tomorrow. Warm, honest, concise markdown. No emoji unless natural. No preamble.
Given what closed today, what's still open, tomorrow's calendar, and whether it's Sunday:
- **Today:** 1-2 lines — what got done + an honest, kind read (don't inflate; if little closed, that's okay).
- **Carry into tomorrow:** the open items most worth moving forward, most important first.
- **Tomorrow:** tomorrow's key events + the 1-2 things to aim at; finish with one suggested focus.
- If it's Sunday, add **Week ahead:** one line on the week's shape or one adjustment to make.
- **Reflect:** one short question for ${PRINCIPAL} (they can answer or not).
Under ~160 words. Specific to the actual day; never generic.`;

async function generateReflection() {
  const t = today();
  const p = parseLoops();
  const closedToday = p.done.filter((d) => (d.text.match(/closed:(\d{4}-\d{2}-\d{2})/) || [])[1] === t).map((d) => d.text.split("·")[0].trim());
  const open = p.active.map((it) => { const due = (it.text.match(/due:(\d{4}-\d{2}-\d{2})/) || [])[1] || null; return { title: it.text.split("·")[0].trim(), due, status: due && due < t ? "overdue" : due === t ? "due today" : "open" }; });
  const dd = new Date(t + "T00:00:00"); dd.setDate(dd.getDate() + 1); const pad = (x) => String(x).padStart(2, "0");
  const tomorrow = `${dd.getFullYear()}-${pad(dd.getMonth() + 1)}-${pad(dd.getDate())}`;
  let tomEvents = [];
  try { tomEvents = (await fetchCalendar(tomorrow, 1)).map((e) => ({ time: e.isAllDay ? "all-day" : new Date(e.startUtc).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }), subject: e.subject })); } catch {}
  const dow = new Date(t + "T00:00:00").getDay();
  const prompt = `Date: ${t} (${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][dow]})\nClosed today: ${JSON.stringify(closedToday)}\nStill open (carry-over candidates): ${JSON.stringify(open)}\nTomorrow's calendar: ${JSON.stringify(tomEvents)}\nIs it Sunday (week's end)? ${dow === 0 ? "yes" : "no"}\n\nWrite the end-of-day reflection now.`;
  const md = (await runJsonQuery(REFLECT_SYSTEM, prompt)).trim();
  const dbDir = path.join(DATA, "daybook", t.slice(0, 4), t.slice(5, 7));
  fs.mkdirSync(dbDir, { recursive: true });
  const dbFile = path.join(dbDir, t + ".md");
  const existing = readFileSafe(dbFile, `# ${t}\n`).replace(/\s+$/, "");
  fs.writeFileSync(dbFile, `${existing}\n\n## Evening reflection (${new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })})\n${md}\n`);
  const out = { date: t, generatedAt: new Date().toISOString(), markdown: md };
  fs.mkdirSync(path.join(DATA, "sync"), { recursive: true });
  fs.writeFileSync(path.join(DATA, "sync", "reflection.json"), JSON.stringify(out, null, 2));
  return out;
}
app.get("/api/reflection", (req, res) => { try { res.json(JSON.parse(fs.readFileSync(path.join(DATA, "sync", "reflection.json"), "utf8"))); } catch { res.json({ date: null, markdown: null }); } });

// ---- people (living family models) ---------------------------------------
const PEOPLE_DIR = path.join(DATA, "people");
function parsePersonFile(fp) {
  let raw; try { raw = fs.readFileSync(fp, "utf8"); } catch { return null; }
  const name = (raw.match(/^#\s+(.+)$/m) || [])[1]?.split("·")[0].trim() || path.basename(fp, ".md");
  const cadence = (raw.match(/^target:\s*(.+)$/m) || [])[1]?.trim() || null;
  let lastTouch = (raw.match(/^last-touch:\s*(\d{4}-\d{2}-\d{2})/m) || [])[1] || null;
  const grab = (re) => { const m = raw.match(re); return m ? m[1].split("\n").map((s) => s.replace(/^[-*]\s*/, "").trim()).filter((s) => s && s !== "(empty)" && !/^\(.*\)$/.test(s)) : []; };
  let needs = grab(/\*\*What they need from [^*]+\*\*\s*([\s\S]*?)(?=\n\*\*|\n##\s|$)/i);
  let themes = grab(/\*\*Current themes[^*]*\*\*\s*([\s\S]*?)(?=\n\*\*|\n##\s|$)/i);
  if (!needs.length) needs = grab(/##\s+Open items\s*([\s\S]*?)(?=\n##\s|$)/i);
  if (!themes.length) {
    const log = grab(/##\s+Interactions?(?:\s+log)?\s*([\s\S]*?)(?=\n##\s|$)/i);
    themes = log.slice(0, 3);
    if (!lastTouch) {
      const dates = (raw.match(/\b\d{4}-\d{2}-\d{2}\b/g) || []).sort();
      if (dates.length) lastTouch = dates[dates.length - 1];
    }
  }
  return { name, slug: path.basename(fp, ".md"), cadence, lastTouch, needs, themes };
}
function cadenceDays(c) {
  if (!c) return null;
  const m = c.match(/(\d+)\s*(day|week|month|year)/i);
  if (m) { const n = +m[1]; const u = m[2].toLowerCase(); return n * (u.startsWith("d") ? 1 : u.startsWith("w") ? 7 : u.startsWith("m") ? 30 : 365); }
  const map = { daily: 1, weekly: 7, biweekly: 14, monthly: 30, quarterly: 90, yearly: 365 };
  return map[c.toLowerCase()] || null;
}
function daysSince(iso) { if (!iso) return null; const d = (Date.now() - new Date(iso + "T00:00:00").getTime()) / (1000 * 60 * 60 * 24); return Math.floor(d); }
function listPeople() {
  let files = []; try { files = fs.readdirSync(PEOPLE_DIR).filter((f) => f.endsWith(".md")); } catch {}
  return files.map((f) => parsePersonFile(path.join(PEOPLE_DIR, f))).filter(Boolean).map((p) => {
    const target = cadenceDays(p.cadence);
    const since = daysSince(p.lastTouch);
    const overdue = target && since !== null && since > target;
    return { ...p, overdueDays: overdue ? since - target : 0 };
  });
}
app.get("/api/people", (req, res) => res.json({ people: listPeople() }));
app.post("/api/reflect", async (req, res) => { try { res.json(await generateReflection()); } catch (e) { res.status(400).json({ error: String(e.message || e) }); } });

// scheduler: fire due reminders every minute; generate brief + triage each morning
setInterval(async () => {
  try {
    const ticks = readTicklers();
    const nowL = localNowString();
    let changed = false;
    for (const t of ticks) {
      if (t.status === "pending" && t.fireAtLocal && t.fireAtLocal <= nowL) { t.status = "fired"; t.firedAt = new Date().toISOString(); changed = true; }
    }
    if (changed) writeTicklers(ticks);
  } catch {}
  try {
    const now = new Date();
    if (now.getHours() >= BRIEF_HOUR) {
      const cached = readBrief();
      if (!cached || cached.date !== today()) {
        writeBrief({ date: today(), generatedAt: new Date().toISOString(), markdown: await generateBrief() });
        console.log("  [scheduler] morning brief generated for", today());
      }
      const tc = readTriageCache();
      if (!tc || tc.date !== today()) {
        try { writeTriageCache(await computeTriage()); console.log("  [scheduler] morning triage generated for", today()); } catch {}
      }
    }
  } catch {}
  try {
    if (new Date().getHours() >= 20) {
      let rf = null; try { rf = JSON.parse(fs.readFileSync(path.join(DATA, "sync", "reflection.json"), "utf8")); } catch {}
      if (!rf || rf.date !== today()) { await generateReflection(); console.log("  [scheduler] evening reflection generated for", today()); }
    }
  } catch {}
}, 60000);

// ---- tickler / Tap reminders ---------------------------------------------
const TICKLER_PATH = path.join(DATA, "tickler.json");
function readTicklers() { try { return JSON.parse(fs.readFileSync(TICKLER_PATH, "utf8")); } catch { return []; } }
function writeTicklers(arr) { fs.mkdirSync(path.dirname(TICKLER_PATH), { recursive: true }); fs.writeFileSync(TICKLER_PATH, JSON.stringify(arr, null, 2)); }
function localNowString() {
  const d = new Date(), p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
app.get("/api/taps", (req, res) => res.json({ taps: readTicklers().filter((t) => t.status !== "done") }));
app.post("/api/taps/:id/done", (req, res) => {
  const arr = readTicklers(); const t = arr.find((x) => x.id === req.params.id);
  if (t) { t.status = "done"; writeTicklers(arr); }
  res.json({ ok: true });
});

// in-SDK MCP tools so the CHAT COS can read calendar, cancel events, and set reminders
const calendarMcp = createSdkMcpServer({
  name: "familyos",
  version: "1.0.0",
  tools: [
    tool(
      "set_reminder",
      `Set a reminder/nudge for ${PRINCIPAL} at a specific LOCAL date-time. Use whenever they say 'remind me at/in/by …'. Compute whenLocal from the current local time given in your instructions.`,
      { whenLocal: z.string().describe("local datetime, format YYYY-MM-DDTHH:MM"), text: z.string().describe("what to remind about, short") },
      async ({ whenLocal, text }) => {
        const arr = readTicklers();
        arr.push({ id: "t" + Date.now(), fireAtLocal: whenLocal, text, status: "pending", createdAt: new Date().toISOString() });
        writeTicklers(arr);
        return { content: [{ type: "text", text: `reminder set for ${whenLocal}: ${text}` }] };
      }
    ),
    tool(
      "calendar_create",
      `Add/create an event on ${PRINCIPAL}'s Outlook calendar. Use when they say 'add X to my calendar', 'schedule X', 'put X on the calendar', or 'block time for X'. Compute whenLocal from the current local time in your instructions; default 60 min if no duration is given. This is different from set_reminder (a nudge) — use this for actual calendar events.`,
      { subject: z.string(), whenLocal: z.string().describe("local start datetime, format YYYY-MM-DDTHH:MM"), durationMins: z.number().optional() },
      async ({ subject, whenLocal, durationMins }) => {
        try { const r = await createCalendarEvent({ subject, startLocal: whenLocal, durationMins }); return { content: [{ type: "text", text: `created event "${subject}" at ${whenLocal}${r.webLink ? " · " + r.webLink : ""}` }] }; }
        catch (e) { return { content: [{ type: "text", text: "error: " + String(e.message || e) }] }; }
      }
    ),
    tool(
      "calendar_list",
      `List ${PRINCIPAL}'s Outlook calendar events (with ids) for today or the week, to find the event they mean.`,
      { range: z.enum(["today", "week"]).default("today") },
      async ({ range }) => {
        try {
          const evs = await fetchCalendar(today(), range === "week" ? 7 : 1);
          const lite = evs.map((e) => ({ id: e.id, subject: e.subject, start: e.isAllDay ? "all-day" : new Date(e.startUtc).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }), isAllDay: e.isAllDay }));
          return { content: [{ type: "text", text: JSON.stringify(lite) }] };
        } catch (e) { return { content: [{ type: "text", text: "error: " + String(e.message || e) }] }; }
      }
    ),
    tool(
      "calendar_update",
      `Move/reschedule a calendar event by its id (use calendar_list to find the id first). Provide newStartLocal (YYYY-MM-DDTHH:MM) and optionally newDurationMins. Use when ${PRINCIPAL} says 'move my 2pm to 4pm', 'push the X meeting to Friday', etc. Confirm in your receipt with the old → new time.`,
      { eventId: z.string(), newStartLocal: z.string().describe("local datetime YYYY-MM-DDTHH:MM"), newDurationMins: z.number().optional() },
      async ({ eventId, newStartLocal, newDurationMins }) => {
        try {
          const token = await msAccessToken();
          const dur = Math.max(15, +newDurationMins || 60);
          const pad = (n) => String(n).padStart(2, "0");
          const startDt = newStartLocal.length === 16 ? newStartLocal + ":00" : newStartLocal;
          const endDate = new Date(newStartLocal); endDate.setMinutes(endDate.getMinutes() + dur);
          const endDt = `${endDate.getFullYear()}-${pad(endDate.getMonth() + 1)}-${pad(endDate.getDate())}T${pad(endDate.getHours())}:${pad(endDate.getMinutes())}:00`;
          const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
          const body = { start: { dateTime: startDt, timeZone: tz }, end: { dateTime: endDt, timeZone: tz } };
          const r = await fetch("https://graph.microsoft.com/v1.0/me/events/" + encodeURIComponent(eventId), { method: "PATCH", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" }, body: JSON.stringify(body) });
          const j = await r.json();
          if (j.error) return { content: [{ type: "text", text: "error: " + j.error.message }] };
          return { content: [{ type: "text", text: `moved to ${newStartLocal} (${dur} min)` }] };
        } catch (e) { return { content: [{ type: "text", text: "error: " + String(e.message || e) }] }; }
      }
    ),
    tool(
      "calendar_cancel",
      `Delete/cancel a calendar event by its id. Only call after you are certain which event ${PRINCIPAL} means (confirm if ambiguous).`,
      { eventId: z.string(), subject: z.string().optional() },
      async ({ eventId }) => {
        try {
          const token = await msAccessToken();
          const r = await fetch("https://graph.microsoft.com/v1.0/me/events/" + encodeURIComponent(eventId), { method: "DELETE", headers: { Authorization: "Bearer " + token } });
          if (r.status === 204 || r.ok) return { content: [{ type: "text", text: "cancelled" }] };
          const j = await r.json().catch(() => ({}));
          return { content: [{ type: "text", text: "error: " + (j.error?.message || r.status) }] };
        } catch (e) { return { content: [{ type: "text", text: "error: " + String(e.message || e) }] }; }
      }
    ),
  ],
});

app.listen(PORT, "0.0.0.0", () => {
  const lans = lanAddresses();
  console.log(`\n  Family OS — Chief of Staff`);
  console.log(`  On this PC:  http://localhost:${PORT}`);
  if (lans.length) {
    console.log(`  On your phone (same Wi-Fi), open:`);
    lans.forEach((ip) => console.log(`     http://${ip}:${PORT}`));
  }
  console.log(`  Data:     ${DATA}`);
  console.log(`  Engine:   Claude Agent SDK · model ${MODEL}`);
  console.log(`  Auth:     ${process.env.ANTHROPIC_API_KEY ? "ANTHROPIC_API_KEY (env)" : "fallback (Claude Code session)"}\n`);
});
