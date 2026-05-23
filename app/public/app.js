// ============================================================================
// Family OS — freeform board
// ============================================================================

let TODAY = "";
let loops = { active: [], done: [] };
let sessionId = null;
let totalCost = 0;
let busy = false;
let saveTimer = null;

const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------- card drag
let _z = 10;
function nextZ() { return ++_z; }

// Drag a card by its header. onEnd(left, top) fires after a move (for persistence).
function attachDrag(card, header, onEnd) {
  let sx, sy, ox, oy, on = false;
  header.addEventListener("pointerdown", (e) => {
    if (e.target.closest("button, input, textarea, summary, .resize-handle")) return;
    on = true; card.style.zIndex = String(nextZ());
    sx = e.clientX; sy = e.clientY; ox = card.offsetLeft; oy = card.offsetTop;
    header.setPointerCapture(e.pointerId);
  });
  header.addEventListener("pointermove", (e) => {
    if (!on) return;
    card.style.left = Math.max(0, ox + e.clientX - sx) + "px";
    card.style.top = Math.max(0, oy + e.clientY - sy) + "px";
  });
  const end = (e) => { if (!on) return; on = false; try { header.releasePointerCapture(e.pointerId); } catch {} onEnd && onEnd(card.offsetLeft, card.offsetTop); };
  header.addEventListener("pointerup", end);
  header.addEventListener("pointercancel", end);
}

// Add a bottom-right resize grip. onEnd(width, height) fires after a resize.
function attachResize(card, onEnd) {
  const h = document.createElement("div");
  h.className = "resize-handle";
  h.title = "drag to resize";
  card.appendChild(h);
  let sx, sy, sw, sh, on = false;
  h.addEventListener("pointerdown", (e) => {
    e.preventDefault(); e.stopPropagation();
    on = true; card.style.zIndex = String(nextZ());
    sx = e.clientX; sy = e.clientY; sw = card.offsetWidth; sh = card.offsetHeight;
    h.setPointerCapture(e.pointerId);
  });
  h.addEventListener("pointermove", (e) => {
    if (!on) return;
    card.style.width = Math.max(240, sw + e.clientX - sx) + "px";
    card.style.height = Math.max(140, sh + e.clientY - sy) + "px";
  });
  const end = (e) => { if (!on) return; on = false; try { h.releasePointerCapture(e.pointerId); } catch {} onEnd && onEnd(card.offsetWidth, card.offsetHeight); };
  h.addEventListener("pointerup", end);
  h.addEventListener("pointercancel", end);
}

// Static cards (Today / This Week / Chat): persist pos + size by id.
function setupStaticCard(card) {
  const header = card.querySelector(".card-header");
  try { const p = JSON.parse(localStorage.getItem("pos:" + card.id)); if (p) { card.style.left = p.left; card.style.top = p.top; } } catch {}
  try { const s = JSON.parse(localStorage.getItem("size:" + card.id)); if (s) { card.style.width = s.w; card.style.height = s.h; } } catch {}
  attachDrag(card, header, (l, t) => localStorage.setItem("pos:" + card.id, JSON.stringify({ left: l + "px", top: t + "px" })));
  attachResize(card, (w, h) => localStorage.setItem("size:" + card.id, JSON.stringify({ w: w + "px", h: h + "px" })));
}

// ---------------------------------------------------------------- scratch notes
// Free sticky-note cards: jot anything, then fling it into the COS chat.
const NOTES_KEY = "scratchNotes";
let scratchNotes = (() => { try { return JSON.parse(localStorage.getItem(NOTES_KEY)) || []; } catch { return []; } })();
function persistNotes() { localStorage.setItem(NOTES_KEY, JSON.stringify(scratchNotes)); }

function renderScratchNotes() {
  document.querySelectorAll(".note-card").forEach((n) => n.remove());
  scratchNotes.forEach(renderNote);
}
function renderNote(note) {
  const card = document.createElement("section");
  card.className = "card note-card";
  card.dataset.id = note.id;
  card.style.left = note.left; card.style.top = note.top;
  card.style.width = note.w; card.style.height = note.h;
  card.style.zIndex = String(nextZ());
  card.innerHTML = `
    <header class="card-header">
      <span class="grip">⠿</span><h2>Note</h2>
      <button class="note-del" title="discard note">✕</button>
    </header>
    <div class="card-body note-body"><textarea class="scratch-area" placeholder="Jot anything — then send it to your COS…"></textarea></div>
    <footer class="note-foot"><button class="scratch-send">→ Send to COS</button></footer>`;
  $("board").appendChild(card);
  const ta = card.querySelector(".scratch-area");
  ta.value = note.text || "";
  ta.addEventListener("input", () => { note.text = ta.value; persistNotes(); });
  card.querySelector(".note-del").addEventListener("click", () => removeNote(note.id));
  card.querySelector(".scratch-send").addEventListener("click", () => sendNote(note));
  attachDrag(card, card.querySelector(".card-header"), (l, t) => { note.left = l + "px"; note.top = t + "px"; persistNotes(); });
  attachResize(card, (w, h) => { note.w = w + "px"; note.h = h + "px"; persistNotes(); });
  return card;
}
function addNote() {
  const id = "n" + Date.now();
  const note = { id, text: "", left: "150px", top: "150px", w: "280px", h: "220px" };
  scratchNotes.push(note); persistNotes();
  const card = renderNote(note);
  card.querySelector(".scratch-area").focus();
}
function removeNote(id) {
  scratchNotes = scratchNotes.filter((n) => n.id !== id);
  persistNotes();
  const card = document.querySelector(`.note-card[data-id="${id}"]`);
  if (card) card.remove();
}
function sendNote(note) {
  const text = (note.text || "").trim();
  removeNote(note.id);
  if (text && !busy) sendMessage(text);
}

// ---------------------------------------------------------------- inbox (Outlook)
function wireConnectBtn() { const b = $("connect-ms"); if (b) b.onclick = startMsConnect; }
async function initInbox() {
  try { const c = await (await fetch("/api/connections")).json(); if (c.microsoft) { loadInbox(); loadCalendar(); return; } } catch {}
  wireConnectBtn();
}
async function startMsConnect() {
  const body = $("inbox-body");
  body.innerHTML = `<div class="inbox-cta"><p>Starting…</p></div>`;
  let r;
  try { r = await (await fetch("/api/connect/microsoft", { method: "POST" })).json(); }
  catch (e) { body.innerHTML = `<div class="inbox-cta"><p>Error: ${esc(String(e))}</p></div>`; return; }
  if (r.error) { body.innerHTML = `<div class="inbox-cta"><p>${esc(r.error)}</p><button class="primary" id="connect-ms">Try again</button></div>`; wireConnectBtn(); return; }
  body.innerHTML = `<div class="inbox-cta">
    <p>1 · Open <a href="${r.verification_uri}" target="_blank" rel="noopener">${esc(r.verification_uri)}</a></p>
    <p>2 · Enter this code:</p>
    <div class="ms-code">${esc(r.user_code)}</div>
    <p class="ms-wait">Waiting for you to approve…</p></div>`;
  pollMsStatus();
}
let msPoll = null;
function pollMsStatus() {
  clearInterval(msPoll);
  msPoll = setInterval(async () => {
    let s;
    try { s = await (await fetch("/api/connect/status")).json(); } catch { return; }
    if (s.connected) { clearInterval(msPoll); loadInbox(); return; }
    if (s.pending && (s.pending.status === "error" || s.pending.status === "expired")) {
      clearInterval(msPoll);
      $("inbox-body").innerHTML = `<div class="inbox-cta"><p>${s.pending.status === "expired" ? "Code expired — try again." : "Couldn't connect: " + esc(s.pending.error || "")}</p><button class="primary" id="connect-ms">Try again</button></div>`;
      wireConnectBtn();
    }
  }, 3000);
}
async function loadInbox() {
  const body = $("inbox-body");
  body.innerHTML = `<div class="inbox-cta"><p>Loading today's mail…</p></div>`;
  let d;
  try { d = await (await fetch("/api/inbox/today")).json(); }
  catch (e) { body.innerHTML = `<div class="inbox-cta"><p>Error: ${esc(String(e))}</p></div>`; return; }
  if (d.error) { body.innerHTML = `<div class="inbox-cta"><p>${esc(d.error)}</p><button class="primary" id="connect-ms">Reconnect</button></div>`; wireConnectBtn(); return; }
  $("inbox-count").textContent = d.count ? `${d.count} today` : "none today";
  if (!d.items.length) { body.innerHTML = `<div class="inbox-cta"><p>No mail received today.</p></div>`; return; }
  body.innerHTML = `<ul class="inbox-list">` + d.items.map((m) => `
    <li class="mail-item${m.isRead ? "" : " unread"}">
      <div class="mail-top"><span class="mail-from">${esc(m.from)}</span><span class="mail-time">${fmtTime(m.at)}</span></div>
      <div class="mail-subj">${esc(m.subject)}</div>
      <div class="mail-prev">${esc(m.preview)}</div>
    </li>`).join("") + `</ul>`;
}
function fmtTime(iso) { try { return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }); } catch { return ""; } }
function fmtDay(iso) { try { return new Date(iso).toLocaleDateString(undefined, { weekday: "short" }); } catch { return ""; } }

// ---------------------------------------------------------------- calendar (read-only)
let calEvents = { today: [], week: [] };
async function loadCalendar() {
  try { const d = await (await fetch("/api/calendar")).json(); if (!d.error) { calEvents = d; render(); } } catch {}
}
function eventRow(ev, withDay) {
  const li = document.createElement("li");
  li.className = "cal-event";
  const when = ev.isAllDay ? "all-day" : (withDay ? `${fmtDay(ev.startUtc)} ${fmtTime(ev.startUtc)}` : fmtTime(ev.startUtc));
  li.innerHTML = `<span class="cal-time">${esc(when)}</span><span class="cal-subj">📅 ${esc(ev.subject)}</span>`;
  if (ev.link) { li.style.cursor = "pointer"; li.title = "open in Outlook"; li.onclick = () => window.open(ev.link, "_blank"); }
  return li;
}
function calIsOpen(key) { const v = localStorage.getItem("cal." + key); return v === null ? key === "today" : v === "1"; }
function isOpen(key, def) { const v = localStorage.getItem(key); return v === null ? def : v === "1"; }
function toggleOpen(key, def) { localStorage.setItem(key, isOpen(key, def) ? "0" : "1"); render(); }
function toggleLi(label, icon, open, onclick) { const li = document.createElement("li"); li.className = "cal-toggle todo-toggle"; li.innerHTML = `<span>${icon} ${esc(label)}</span><span class="cal-caret">${open ? "▾" : "▸"}</span>`; li.onclick = onclick; return li; }
// Collapsible calendar block: a clickable header + (when open) the event rows.
function renderCalSection(list, events, key, withDay) {
  if (!events || !events.length) return;
  const open = calIsOpen(key);
  const head = document.createElement("li");
  head.className = "cal-toggle";
  head.innerHTML = `<span>📅 ${events.length} event${events.length > 1 ? "s" : ""}</span><span class="cal-caret">${open ? "▾" : "▸"}</span>`;
  head.onclick = () => { localStorage.setItem("cal." + key, open ? "0" : "1"); render(); };
  list.appendChild(head);
  if (open) events.forEach((ev) => list.appendChild(eventRow(ev, withDay)));
}

// ---------------------------------------------------------------- end-of-day reflection
async function loadReflection() { try { const r = await (await fetch("/api/reflection")).json(); if (r && r.markdown) renderReflection(r); } catch {} }
function renderReflection(r) {
  const when = r.generatedAt ? new Date(r.generatedAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "";
  $("reflection-body").innerHTML = `<div class="cos-md">${renderMarkdown(r.markdown)}</div><div class="brief-time">reflected ${esc(when)}</div>`;
}
async function runReflect() {
  $("reflection-body").innerHTML = `<div class="prop-empty">Looking back on your day…</div>`;
  try {
    const r = await (await fetch("/api/reflect", { method: "POST" })).json();
    if (r.error) { $("reflection-body").innerHTML = `<div class="prop-empty">${esc(r.error)}</div>`; return; }
    renderReflection(r);
    loadLoops();
  } catch (e) { $("reflection-body").innerHTML = `<div class="prop-empty">error</div>`; }
}

// ---------------------------------------------------------------- reminders (Taps)
let seenFired = new Set((() => { try { return JSON.parse(localStorage.getItem("seenFired")) || []; } catch { return []; } })());
function fmtTapTime(local) { try { return new Date(local).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); } catch { return local; } }
function notify(title, body) { try { if (window.Notification && Notification.permission === "granted") new Notification(title, { body }); } catch {} }
async function loadTaps() {
  let d; try { d = await (await fetch("/api/taps")).json(); } catch { return; }
  const taps = d.taps || [];
  const body = $("taps-body");
  const fired = taps.filter((t) => t.status === "fired").sort((a, b) => (b.firedAt || "").localeCompare(a.firedAt || ""));
  const pending = taps.filter((t) => t.status === "pending").sort((a, b) => (a.fireAtLocal || "").localeCompare(b.fireAtLocal || ""));
  $("taps-count").textContent = fired.length ? `${fired.length} now` : (pending.length ? `${pending.length} set` : "");
  if (!taps.length) { body.innerHTML = `<div class="prop-empty">No reminders. Tell the COS "remind me at 5:20 to set up John's laptop."</div>`; return; }
  body.innerHTML =
    fired.map((t) => `<div class="tap fired" data-id="${t.id}"><div class="tap-line">🔔 ${esc(t.text)}</div><div class="tap-meta">now · was for ${esc(fmtTapTime(t.fireAtLocal))}</div><button class="tap-done">Done</button></div>`).join("") +
    pending.map((t) => `<div class="tap" data-id="${t.id}"><div class="tap-line">⏰ ${esc(t.text)}</div><div class="tap-meta">${esc(fmtTapTime(t.fireAtLocal))}</div><button class="tap-done" title="cancel">✕</button></div>`).join("");
  body.querySelectorAll(".tap").forEach((el) => el.querySelector(".tap-done")?.addEventListener("click", async () => { await fetch(`/api/taps/${el.dataset.id}/done`, { method: "POST" }); loadTaps(); }));
  fired.forEach((t) => { if (!seenFired.has(t.id)) { seenFired.add(t.id); notify("⏰ Reminder", t.text); } });
  localStorage.setItem("seenFired", JSON.stringify([...seenFired]));
}

// ---------------------------------------------------------------- morning brief
async function loadBrief() { try { const b = await (await fetch("/api/brief")).json(); if (b && b.markdown) renderBrief(b); } catch {} }
function renderBrief(b) {
  const when = b.generatedAt ? new Date(b.generatedAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "";
  const stale = b.stale ? `<div class="stale-note">⚠ This brief is from an earlier day — click <b>Brief me</b> to refresh.</div>` : "";
  $("brief-body").innerHTML = `${stale}<div class="cos-md">${renderMarkdown(b.markdown)}</div><div class="brief-time">generated ${esc(when)}</div>`;
}
async function runBrief() {
  $("brief-body").innerHTML = `<div class="prop-empty">Putting your brief together…</div>`;
  try {
    const b = await (await fetch("/api/brief/regenerate", { method: "POST" })).json();
    if (b.error) { $("brief-body").innerHTML = `<div class="prop-empty">${esc(b.error)}</div>`; return; }
    renderBrief(b);
  } catch (e) { $("brief-body").innerHTML = `<div class="prop-empty">error generating brief</div>`; }
}

// ---------------------------------------------------------------- proposals (inbox triage)
const HANDLED_KEY = "triagedEmails";
function handledSet() { try { return new Set(JSON.parse(localStorage.getItem(HANDLED_KEY)) || []); } catch { return new Set(); } }
function markHandled(emailId) { const s = handledSet(); s.add(emailId); localStorage.setItem(HANDLED_KEY, JSON.stringify([...s])); }
let lastProposals = [];
let lastEmailCount = 0;

function logLearn(p, action) {
  try { fetch("/api/learn", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ from: p._from, subject: p._subject, action, category: p.category }) }); } catch {}
}
async function loadProposalsCached() {
  try {
    const d = await (await fetch("/api/triage/cached")).json();
    if (d && d.proposals && d.proposals.length) { lastProposals = d.proposals; lastEmailCount = d.emailCount || 0; renderProposals(); }
  } catch {}
}
async function runTriage() {
  const body = $("proposals-body");
  body.innerHTML = `<div class="prop-empty">Reading today's inbox… (a few seconds)</div>`;
  let d;
  try { d = await (await fetch("/api/triage", { method: "POST" })).json(); }
  catch (e) { body.innerHTML = `<div class="prop-empty">Error: ${esc(String(e))}</div>`; return; }
  if (d.error) { body.innerHTML = `<div class="prop-empty">${esc(d.error)}</div>`; return; }
  lastProposals = d.proposals || [];
  lastEmailCount = d.emailCount || 0;
  renderProposals();
}

function renderProposals() {
  const body = $("proposals-body");
  const handled = handledSet();
  const live = lastProposals.filter((p) => !handled.has(p.emailId));
  const actionable = live.filter((p) => p.type !== "fyi");
  const fyiCount = live.length - actionable.length;
  if (!actionable.length) {
    body.innerHTML = `<div class="prop-empty">Nothing needs you right now. ${fyiCount} FYI from ${lastEmailCount} emails today.</div>`;
    return;
  }
  body.innerHTML = actionable.map(propRow).join("") +
    (fyiCount ? `<div class="prop-fyi">— ${fyiCount} FYI (newsletters, receipts…) hidden</div>` : "");
  actionable.forEach((p) => {
    const el = body.querySelector(`[data-pid="${p.pid}"]`);
    if (!el) return;
    el.querySelector(".prop-accept")?.addEventListener("click", () => acceptProposal(p));
    el.querySelector(".prop-asnew")?.addEventListener("click", () => acceptAsNew(p));
    el.querySelector(".prop-dismiss")?.addEventListener("click", () => { logLearn(p, "dismiss"); markHandled(p.emailId); renderProposals(); });
    el.querySelector(".prop-draft")?.addEventListener("click", () => el.querySelector(".prop-draftbox")?.classList.toggle("show"));
    el.querySelector(".prop-copy")?.addEventListener("click", () => navigator.clipboard?.writeText(p.draft || ""));
  });
}

function propRow(p) {
  const cat = p.category ? `<span class="cat-dot" style="background:${catMeta(p.category).color}"></span>${catMeta(p.category).label}` : "";
  const due = p.due ? ` · due ${esc(p.due)}` : "";
  const open = p._link ? `<a class="prop-open" href="${p._link}" target="_blank" rel="noopener" title="read the original email">Open email ↗</a>` : "";
  const subj = p._subject ? `<div class="prop-subj">${esc(p._from || "")} · “${esc(p._subject)}”</div>` : "";
  if (p.type === "new") {
    return `<div class="prop" data-pid="${p.pid}">
      <div class="prop-line"><span class="prop-icon new">＋</span><b>${esc(p.title || "(task)")}</b></div>
      ${subj}
      <div class="prop-meta">${cat}${due} · ${esc(p.reason || "")}</div>
      <div class="prop-acts"><button class="prop-accept">✓ Add to-do</button>${open}<button class="prop-dismiss">✕</button></div></div>`;
  }
  if (p.type === "new_event") {
    const when = p.eventStart ? new Date(p.eventStart).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "(time TBD)";
    const dur = p.eventDuration ? `${p.eventDuration}m` : "60m";
    return `<div class="prop" data-pid="${p.pid}">
      <div class="prop-line"><span class="prop-icon evt">📅</span><b>${esc(p.title || "(meeting)")}</b></div>
      ${subj}
      <div class="prop-meta">${cat} · ${esc(when)} · ${esc(dur)} · ${esc(p.reason || "")}</div>
      <div class="prop-acts">${p.eventStart ? `<button class="prop-accept">✓ Add to calendar</button>` : ""}<button class="prop-asnew">Make to-do instead</button>${open}<button class="prop-dismiss">✕</button></div></div>`;
  }
  if (p.type === "update") {
    const loop = loops.active[p.loopIndex];
    const loopTitle = loop ? parseItem(loop.text).title : `loop #${p.loopIndex}`;
    return `<div class="prop" data-pid="${p.pid}">
      <div class="prop-line"><span class="prop-icon upd">✎</span>Update: <b>${esc(loopTitle)}</b></div>
      ${subj}
      <div class="prop-meta">${esc(p.summary || p.reason || "")}</div>
      <div class="prop-acts"><button class="prop-accept">✓ Attach to notes</button><button class="prop-asnew">Make new instead</button>${open}<button class="prop-dismiss">✕</button></div></div>`;
  }
  if (p.type === "reply") {
    return `<div class="prop" data-pid="${p.pid}">
      <div class="prop-line"><span class="prop-icon rep">↩</span>Reply: <b>${esc(p._subject || "")}</b></div>
      <div class="prop-meta">${esc(p._from || "")} · ${esc(p.reason || "")}</div>
      <div class="prop-draftbox"><textarea readonly>${esc(p.draft || "")}</textarea></div>
      <div class="prop-acts"><button class="prop-draft">Draft ▾</button><button class="prop-copy">Copy</button>${open}<button class="prop-dismiss">✕</button></div></div>`;
  }
  return "";
}

async function acceptProposal(p) {
  logLearn(p, p.type === "new_event" ? "accept_event" : p.type === "new" ? "accept_new" : "accept_update");
  if (p.type === "new_event") {
    if (!p.eventStart) { markHandled(p.emailId); renderProposals(); return; }
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      const r = await (await fetch("/api/calendar/event", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subject: p.title || p._subject || "Meeting", startLocal: p.eventStart, durationMins: p.eventDuration || 60, timeZone: tz }) })).json();
      if (!r.error) loadCalendar();
    } catch {}
    markHandled(p.emailId);
    renderProposals();
    return;
  }
  if (p.type === "new") {
    let text = (p.title || "task").trim();
    if (p.nextAction) text += ` · next: ${p.nextAction}`;
    if (p.due) text += ` · due:${p.due}`;
    text += ` #${p.category || "personal"} src:email opened:${TODAY}`;
    loops.active.push({ done: false, text });
    save(); render();
  } else if (p.type === "update") {
    const loop = loops.active[p.loopIndex];
    if (loop) {
      const ref = refFor(loop);
      try {
        const cur = await (await fetch(`/api/note?ref=${encodeURIComponent(ref)}`)).json();
        const base = cur.content || `# ${parseItem(loop.text).title}\n`;
        const content = `${base}\n## ${TODAY} — from email\n${p.summary || ""}\n`;
        await fetch("/api/note", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ref, content }) });
        if (!refOf(loop)) { loop.text = loop.text.trim() + ` ref:${ref}`; save(); }
        render();
      } catch {}
    }
  }
  markHandled(p.emailId);
  renderProposals();
}

// Convert any proposal (esp. a wrong "update") into a brand-new to-do.
function acceptAsNew(p) {
  logLearn(p, "accept_new");
  let text = (p.title || p._subject || "Follow up").trim();
  if (p.nextAction) text += ` · next: ${p.nextAction}`;
  if (p.due) text += ` · due:${p.due}`;
  text += ` #${p.category || "personal"} src:email opened:${TODAY}`;
  loops.active.push({ done: false, text });
  save(); render();
  markHandled(p.emailId);
  renderProposals();
}

// ---------------------------------------------------------------- categories
const CATS = {
  house:     { label: "House",     color: "#f0b35e" },
  health:    { label: "Health",    color: "#4ade80" },
  education: { label: "Education", color: "#7aa2ff" },
  finance:   { label: "Finance",   color: "#b98cff" },
  goals:     { label: "Goals",     color: "#2dd4bf" },
  personal:  { label: "Personal",  color: "#9aa3b2" },
};
const CAT_ORDER = ["house", "health", "education", "finance", "goals", "personal"];
const CAT_RE = /#(house|health|education|finance|goals|personal)\b/i;
const CAT_RE_G = /\s*#(house|health|education|finance|goals|personal)\b/ig;
function catOf(item) { const m = (item.text || "").match(CAT_RE); return m ? m[1].toLowerCase() : "uncategorized"; }
function stripCat(text) { return text.replace(CAT_RE_G, "").trim(); }
function catMeta(cat) { return CATS[cat] || { label: "Uncategorized", color: "#5b6478" }; }
function catDot(cat) { const m = catMeta(cat); return `<span class="cat-dot" style="background:${m.color}" title="${m.label}"></span>`; }

// result/notes records: each item may link to a knowledge file via `ref:cat/slug`
const REF_RE = /\bref:([a-z0-9\-_]+\/[a-z0-9\-_]+)/i;
const SRC_RE = /\bsrc:(email|calendar)\b/i;
const EID_RE = /\beid:\S+/i;
function refOf(item) { const m = (item.text || "").match(REF_RE); return m ? m[1].toLowerCase() : null; }
function srcOf(item) { const m = (item.text || "").match(SRC_RE); return m ? m[1].toLowerCase() : null; }
function slugify(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "note"; }
function refFor(item) { return refOf(item) || `${catOf(item)}/${slugify(parseItem(item.text).title)}`; }
function hasNote(item) { return !!refOf(item); }
function srcBadge(item) { const s = srcOf(item); return s === "email" ? '<span class="src-badge" title="from email">✉</span>' : s === "calendar" ? '<span class="src-badge" title="from calendar">📅</span>' : ""; }
const OPENED_RE = /\bopened:\d{4}-\d{2}-\d{2}/i;
const CLOSED_RE = /\bclosed:\d{4}-\d{2}-\d{2}/i;
function stripTokens(text) { return text.replace(CAT_RE_G, "").replace(REF_RE, "").replace(SRC_RE, "").replace(EID_RE, "").replace(OPENED_RE, "").replace(CLOSED_RE, "").replace(/\s{2,}/g, " ").trim(); }
function withOpened(text) { return OPENED_RE.test(text) ? text : text.trim() + ` opened:${TODAY}`; }
function withClosed(text) { return CLOSED_RE.test(text) ? text : text.trim() + ` closed:${TODAY}`; }

let weekView = localStorage.getItem("weekView") || "priority"; // "priority" | "category"
let dragItem = null;

// ---------------------------------------------------------------- loop parse
function parseItem(text) {
  const clean = stripTokens(text);
  const segs = clean.split("·").map((s) => s.trim()).filter(Boolean);
  const dueM = clean.match(/due:(\d{4}-\d{2}-\d{2})/);
  let title = segs[0] || clean;
  const meta = [];
  for (let i = 1; i < segs.length; i++) {
    let s = segs[i];
    if (/^due:/.test(s)) continue; // shown separately
    if (/^next:\s*/i.test(s)) { meta.push("next: " + s.replace(/^next:\s*/i, "")); continue; }
    meta.push(s);
  }
  return { title, due: dueM ? dueM[1] : null, meta: meta.join(" · ") };
}

// ---------------------------------------------------------------- rendering
function render() {
  renderWeek();
  renderToday();
  $("today-date").textContent = fmtDate(TODAY);
}

function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function metaHtml(p) {
  const overdue = p.due && p.due < TODAY;
  const due = p.due
    ? `<span class="due${overdue ? " overdue" : ""}">${overdue ? "overdue " : "due "}${fmtDate(p.due)}</span>`
    : "";
  return [p.meta, due].filter(Boolean).join(" · ");
}
function addDays(iso, n) {
  const d = new Date((iso || TODAY) + "T00:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

// Shared row component. variant: "week" (planning surface) | "today" (focus surface).
// Both expose check-off + inline edit; the chrome and the secondary action differ
// on purpose — Week is for ranking/triage (drag + delete), Today is for doing (defer).
function loopRow(item, variant, opts = {}) {
  const li = document.createElement("li");
  li.className = `loop-item ${variant}${opts.focus ? " focus" : ""}${opts.rolled ? " rolled" : ""}`;
  const p = parseItem(item.text);
  const meta = metaHtml(p);
  const dot = opts.dot ? catDot(catOf(item)) : "";
  const src = srcBadge(item);
  const arrow = opts.focus ? '<span class="arrow">→</span>' : "";

  if (variant === "week") {
    li.draggable = true;
    li.innerHTML = `
      <span class="li-grip" title="drag to re-rank or recategorize">⠿</span>
      <input type="checkbox" class="li-check" ${item.done ? "checked" : ""} title="mark done" />
      <div class="li-main">
        <div class="li-title">${dot}${src}${esc(p.title)}</div>
        ${meta ? `<div class="li-meta">${meta}</div>` : ""}
      </div>
      <button class="li-sched" title="schedule on calendar">📅</button>
      <button class="li-note${hasNote(item) ? " has" : ""}" title="result / notes">${hasNote(item) ? "▤" : "＋"}</button>
      <button class="li-del" title="delete">×</button>`;
    li.querySelector(".li-del").addEventListener("click", () => deleteItem(item));
    li.querySelector(".li-note").addEventListener("click", (e) => { e.stopPropagation(); toggleNotes(li, item); });
    li.querySelector(".li-sched").addEventListener("click", (e) => { e.stopPropagation(); toggleSchedule(li, item); });
    wireRowDrag(li, item);
  } else {
    li.innerHTML = `
      <input type="checkbox" class="li-check" title="done" />
      <div class="li-main">
        <div class="li-title">${dot}${src}${arrow}${opts.rolled ? '<span class="rolled-badge" title="rolled over from a past day">↩</span>' : ""}${esc(p.title)}</div>
        ${meta ? `<div class="li-meta">${meta}</div>` : ""}
      </div>
      <button class="li-defer" title="defer to tomorrow">Defer</button>`;
    li.querySelector(".li-defer").addEventListener("click", () => deferItem(item));
  }
  li.querySelector(".li-check").addEventListener("change", () => completeItem(item));
  li.querySelector(".li-main").addEventListener("click", () => editItem(li, item));
  return li;
}

function renderWeek() {
  const list = $("week-list");
  list.innerHTML = "";
  renderCalSection(list, calEvents.week, "week", true);
  if (weekView === "category") renderWeekByCategory(list);
  else if (loops.active.length) {
    const opn = isOpen("todo.priority", true);
    list.appendChild(toggleLi(`${loops.active.length} open`, "📋", opn, () => toggleOpen("todo.priority", true)));
    if (opn) loops.active.forEach((item) => list.appendChild(loopRow(item, "week", { dot: true })));
  } else { const li = document.createElement("li"); li.className = "empty"; li.textContent = "No open loops."; list.appendChild(li); }

  $("week-count").textContent = loops.active.length ? `${loops.active.length} open` : "clear";
  $("week-toggle").textContent = weekView === "category" ? "By Category ▾" : "By Priority ▾";

  const dl = $("done-list");
  dl.innerHTML = "";
  loops.done.forEach((item) => dl.appendChild(doneRow(item)));
  $("done-count").textContent = loops.done.length ? `(${loops.done.length})` : "";
  $("done-block").style.display = loops.done.length ? "block" : "none";
}

function renderWeekByCategory(list) {
  const groups = {};
  loops.active.forEach((item) => { const c = catOf(item); (groups[c] ||= []).push(item); });
  const order = [...CAT_ORDER, "uncategorized"].filter((c) => groups[c] && groups[c].length);
  if (!order.length) { const li = document.createElement("li"); li.className = "empty"; li.textContent = "No open loops."; list.appendChild(li); return; }
  order.forEach((cat) => {
    const m = catMeta(cat);
    const opn = isOpen("todocat." + cat, true);
    const section = document.createElement("li");
    section.className = "cat-section";
    section.dataset.cat = cat;
    const header = document.createElement("div");
    header.className = "cat-header";
    header.style.cursor = "pointer";
    header.innerHTML = `${catDot(cat)}<span class="cat-name">${m.label}</span><span class="cat-ct">${groups[cat].length}</span><span class="cal-caret">${opn ? "▾" : "▸"}</span>`;
    header.onclick = () => toggleOpen("todocat." + cat, true);
    const sub = document.createElement("ul");
    sub.className = "cat-items";
    if (opn) groups[cat].forEach((item) => sub.appendChild(loopRow(item, "week", { dot: false })));
    section.appendChild(header);
    section.appendChild(sub);
    wireSectionDrop(section, cat);
    list.appendChild(section);
  });
}

function doneRow(item) {
  const li = document.createElement("li");
  li.className = "loop-item done-row";
  const p = parseItem(item.text);
  li.innerHTML = `
    <input type="checkbox" class="li-check" checked title="reopen" />
    <div class="li-main"><div class="li-title">${catDot(catOf(item))}${esc(p.title)}</div></div>
    <button class="li-note${hasNote(item) ? " has" : ""}" title="result / notes">${hasNote(item) ? "▤" : "＋"}</button>`;
  li.querySelector(".li-check").addEventListener("change", () => reopenItem(item));
  li.querySelector(".li-note").addEventListener("click", (e) => { e.stopPropagation(); toggleNotes(li, item); });
  return li;
}

// ---------------------------------------------------------------- notes drawer
async function toggleNotes(li, item) {
  const existing = li.querySelector(".note-drawer");
  if (existing) { existing.remove(); return; }
  document.querySelectorAll(".note-drawer").forEach((d) => d.remove()); // one at a time
  const ref = refFor(item);
  const drawer = document.createElement("div");
  drawer.className = "note-drawer";
  drawer.innerHTML = `<div class="note-head"><span>Result / notes</span><button class="note-close" title="close notes">Close ✕</button></div>
    <textarea class="note-area" placeholder="Result / notes — quotes, comparison, decision + why…"></textarea>
    <div class="note-cap">saved to knowledge/${ref}.md</div>`;
  li.appendChild(drawer);
  const ta = drawer.querySelector(".note-area");
  drawer.querySelector(".note-close").addEventListener("click", (e) => { e.stopPropagation(); drawer.remove(); });
  try {
    const data = await (await fetch(`/api/note?ref=${encodeURIComponent(ref)}`)).json();
    ta.value = data.content || `# ${parseItem(item.text).title}\n\n`;
  } catch { ta.value = ""; }
  autoGrow(ta);
  ta.focus();
  ta.addEventListener("input", () => autoGrow(ta));
  ta.addEventListener("focus", () => { li.draggable = false; });
  ta.addEventListener("blur", () => { li.draggable = true; saveNote(item, ref, ta.value); });
}
function autoGrow(ta) { ta.style.height = "auto"; ta.style.height = Math.min(ta.scrollHeight, 280) + "px"; }

// Infer date/time/duration from a to-do's text so the slot is accurate.
const WEEKDAYS = { sunday:0, monday:1, tuesday:2, wednesday:3, thursday:4, friday:5, saturday:6, sun:0, mon:1, tue:2, tues:2, wed:3, thu:4, thur:4, thurs:4, fri:5, sat:6 };
function parseSlot(item) {
  const p = parseItem(item.text);
  const txt = (p.title + " " + (p.meta || "")).toLowerCase();
  let time = null, m;
  if ((m = txt.match(/\b(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m\.?\b/))) {
    let h = +m[1] % 12; if (m[3] === "p") h += 12;
    time = `${String(h).padStart(2, "0")}:${m[2] ? m[2] : "00"}`;
  } else if ((m = txt.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/))) {
    time = `${String(+m[1]).padStart(2, "0")}:${m[2]}`;
  } else if (/\bnoon\b/.test(txt)) time = "12:00";
  let date = null;
  if (/\btomorrow\b/.test(txt)) date = addDays(TODAY, 1);
  else {
    const wd = Object.keys(WEEKDAYS).find((d) => new RegExp("\\b" + d + "\\b").test(txt));
    if (wd) { const base = new Date(TODAY + "T00:00:00"); date = addDays(TODAY, (WEEKDAYS[wd] - base.getDay() + 7) % 7); }
  }
  if (!date) date = p.due || TODAY;
  let dur = 60;
  if ((m = txt.match(/(\d+(?:\.\d+)?)\s*(h|hr|hour)/))) dur = Math.round(parseFloat(m[1]) * 60);
  else if ((m = txt.match(/(\d+)\s*(m|min)/))) dur = +m[1];
  return { date, time: time || "09:00", dur };
}

// schedule a to-do onto the calendar (write — only on explicit click)
function toggleSchedule(li, item) {
  const existing = li.querySelector(".sched-drawer");
  if (existing) { existing.remove(); return; }
  li.querySelectorAll(".note-drawer").forEach((d) => d.remove());
  const p = parseItem(item.text);
  const slot = parseSlot(item);
  const durBest = [30, 60, 90, 120].reduce((a, b) => (Math.abs(b - slot.dur) < Math.abs(a - slot.dur) ? b : a));
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const opt = (v, label) => `<option value="${v}"${v === durBest ? " selected" : ""}>${label}</option>`;
  const drawer = document.createElement("div");
  drawer.className = "sched-drawer";
  drawer.innerHTML = `
    <input type="date" class="sched-date" value="${slot.date}">
    <input type="time" class="sched-time" value="${slot.time}">
    <select class="sched-dur">${opt(30, "30m")}${opt(60, "1h")}${opt(90, "1.5h")}${opt(120, "2h")}</select>
    <button class="sched-go">Add to calendar</button>
    <span class="sched-msg"></span>`;
  li.appendChild(drawer);
  drawer.querySelector(".sched-go").addEventListener("click", async () => {
    const date = drawer.querySelector(".sched-date").value;
    const time = drawer.querySelector(".sched-time").value || "09:00";
    const dur = drawer.querySelector(".sched-dur").value;
    const msg = drawer.querySelector(".sched-msg");
    if (!date) { msg.textContent = "pick a date"; return; }
    msg.textContent = "adding…";
    try {
      const r = await (await fetch("/api/calendar/event", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: p.title, startLocal: `${date}T${time}`, durationMins: dur, timeZone: tz }),
      })).json();
      if (r.error) { msg.textContent = /scope|permission|token/i.test(r.error) ? "reconnect Outlook for write access" : r.error; return; }
      msg.textContent = "✓ added";
      loadCalendar();
      setTimeout(() => drawer.remove(), 900);
    } catch (e) { msg.textContent = "error"; }
  });
}
async function saveNote(item, ref, content) {
  // "meaningful" = something beyond the auto-inserted "# Title" header line.
  const body = content.replace(/^#.*$/m, "").trim();
  // Don't create a note from an untouched/empty drawer.
  if (!body && !refOf(item)) return;
  try {
    await fetch("/api/note", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ref, content }) });
  } catch (e) { console.error("saveNote", e); return; }
  if (!refOf(item) && body) {
    item.text = item.text.trim() + ` ref:${ref}`;
    save(); render();
  }
}

function editItem(li, item) {
  const main = li.querySelector(".li-main");
  if (!main || li.querySelector(".li-edit")) return;
  const input = document.createElement("input");
  input.className = "li-edit";
  input.value = item.text;
  main.replaceWith(input);
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);
  const commit = () => {
    const v = input.value.trim();
    if (v) item.text = v;
    else { const i = loops.active.indexOf(item); if (i >= 0) loops.active.splice(i, 1); }
    save(); render();
  };
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); commit(); }
    if (e.key === "Escape") render();
  });
  input.addEventListener("blur", commit);
}

function renderToday() {
  const list = $("today-list");
  const hint = $("backlog-hint");
  list.innerHTML = "";
  renderCalSection(list, calEvents.today, "today", false);
  const open = loops.active.filter((it) => !it.done);
  if (!open.length) {
    if (!(calEvents.today || []).length) list.innerHTML = `<li class="empty">Nothing open. Clear runway.</li>`;
    hint.textContent = "";
    return;
  }
  // Rolled-over (overdue from a past day) float to the very top as reminders,
  // then today's due items. Both keep her priority order within each group.
  const overdue = open.filter((it) => { const p = parseItem(it.text); return p.due && p.due < TODAY; });
  const dueToday = open.filter((it) => { const p = parseItem(it.text); return p.due && p.due === TODAY; });
  const ordered = [...overdue, ...dueToday];

  if (ordered.length) {
    ordered.forEach((it, i) => list.appendChild(loopRow(it, "today", { dot: true, focus: i === 0, rolled: overdue.includes(it) })));
    const remaining = open.length - ordered.length;
    hint.textContent = remaining > 0 ? `+ ${remaining} more in the backlog →` : "";
  } else {
    // nothing dated for today — gently surface the top of the stack
    list.appendChild(loopRow(open[0], "today", { dot: true, focus: true }));
    hint.textContent = open.length > 1 ? `Nothing due today · ${open.length - 1} more in the backlog →` : "Nothing due today.";
  }
}

// ---------------------------------------------------------------- mutations (by reference)
function completeItem(item) {
  const i = loops.active.indexOf(item);
  if (i < 0) return;
  loops.active.splice(i, 1);
  item.done = true;
  item.text = withClosed(item.text);
  loops.done.unshift(item);
  save(); render();
}
function reopenItem(item) {
  const i = loops.done.indexOf(item);
  if (i < 0) return;
  loops.done.splice(i, 1);
  item.done = false;
  loops.active.push(item);
  save(); render();
}
function deleteItem(item) {
  const i = loops.active.indexOf(item);
  if (i < 0) return;
  loops.active.splice(i, 1);
  save(); render();
  showUndo(item, i); // deletes are recoverable
}
let undoTimer = null;
function showUndo(item, index) {
  clearTimeout(undoTimer);
  let toast = document.getElementById("undo-toast");
  if (!toast) { toast = document.createElement("div"); toast.id = "undo-toast"; document.body.appendChild(toast); }
  toast.innerHTML = `<span>Deleted “${esc(parseItem(item.text).title)}”</span><button id="undo-btn">Undo</button>`;
  toast.classList.add("show");
  document.getElementById("undo-btn").onclick = () => {
    loops.active.splice(Math.min(index, loops.active.length), 0, item);
    save(); render(); hideUndo();
  };
  undoTimer = setTimeout(hideUndo, 7000);
}
function hideUndo() { const t = document.getElementById("undo-toast"); if (t) t.classList.remove("show"); }
function deferItem(item) {
  const tomorrow = addDays(TODAY, 1);
  if (/due:\d{4}-\d{2}-\d{2}/.test(item.text)) {
    item.text = item.text.replace(/due:\d{4}-\d{2}-\d{2}/, "due:" + tomorrow);
  } else if (CAT_RE.test(item.text)) {
    item.text = item.text.replace(CAT_RE, `· due:${tomorrow} $&`);
  } else {
    item.text = item.text.trim() + ` · due:${tomorrow}`;
  }
  save(); render();
}

function addItem(text) {
  const t = text.trim();
  if (!t) return;
  loops.active.push({ done: false, text: withOpened(t) });
  save(); render();
}

// ---------------------------------------------------------------- drag (by reference)
// Priority view: reorder. Category view: reorder within a section AND drag
// between sections to recategorize. Direct manipulation everywhere.
function insertItemBefore(item, beforeItem) {
  const arr = loops.active;
  const cur = arr.indexOf(item);
  if (cur >= 0) arr.splice(cur, 1);
  if (beforeItem && arr.includes(beforeItem)) arr.splice(arr.indexOf(beforeItem), 0, item);
  else arr.push(item);
}
function reorderBefore(item, beforeItem) {
  if (item !== beforeItem) insertItemBefore(item, beforeItem);
  save(); render();
}
function moveItem(item, targetCat, beforeItem) {
  if (catOf(item) !== targetCat) {
    item.text = stripCat(item.text) + (targetCat === "uncategorized" ? "" : ` #${targetCat}`);
  }
  if (item !== beforeItem) insertItemBefore(item, beforeItem);
  save(); render();
}
function arrAfter(item) {
  const i = loops.active.indexOf(item);
  return i >= 0 && i + 1 < loops.active.length ? loops.active[i + 1] : null;
}
function wireRowDrag(li, item) {
  li.addEventListener("dragstart", (e) => { dragItem = item; li.classList.add("dragging"); e.dataTransfer.effectAllowed = "move"; e.stopPropagation(); });
  li.addEventListener("dragend", () => { li.classList.remove("dragging"); clearDropMarks(); dragItem = null; });
  li.addEventListener("dragover", (e) => {
    e.preventDefault(); e.stopPropagation();
    clearDropMarks();
    const rect = li.getBoundingClientRect();
    li.classList.add(e.clientY > rect.top + rect.height / 2 ? "drop-below" : "drop-above");
  });
  li.addEventListener("drop", (e) => {
    e.preventDefault(); e.stopPropagation();
    if (!dragItem) return;
    const rect = li.getBoundingClientRect();
    const below = e.clientY > rect.top + rect.height / 2;
    const beforeItem = below ? arrAfter(item) : item;
    if (weekView === "category") moveItem(dragItem, catOf(item), beforeItem);
    else reorderBefore(dragItem, beforeItem);
    clearDropMarks();
  });
}
function wireSectionDrop(section, cat) {
  section.addEventListener("dragover", (e) => { e.preventDefault(); section.classList.add("cat-drop"); });
  section.addEventListener("dragleave", () => section.classList.remove("cat-drop"));
  section.addEventListener("drop", (e) => {
    e.preventDefault();
    section.classList.remove("cat-drop");
    if (dragItem) moveItem(dragItem, cat, null); // append to end of this category
    clearDropMarks();
  });
}
function clearDropMarks() {
  document.querySelectorAll(".drop-above,.drop-below,.cat-drop").forEach((el) => el.classList.remove("drop-above", "drop-below", "cat-drop"));
}

// ---------------------------------------------------------------- persistence
async function loadLoops() {
  try {
    const r = await fetch("/api/loops");
    const data = await r.json();
    TODAY = data.today;
    loops = { active: data.active || [], done: data.done || [] };
    render();
  } catch (e) { console.error("loadLoops", e); }
}
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      await fetch("/api/loops", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: loops.active, done: loops.done }),
      });
    } catch (e) { console.error("save", e); }
  }, 250);
}

function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

// ============================================================================
// Chat
// ============================================================================
const log = $("log"), welcome = $("welcome"), form = $("composer"),
      input = $("input"), sendBtn = $("send"), costEl = $("cost"), modeTag = $("mode-tag");

function inline(s) {
  let t = esc(s);
  t = t.replace(/`([^`]+)`/g, "<code>$1</code>");
  t = t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  return t;
}
function renderMarkdown(md) {
  const lines = md.split("\n"); let html = ""; let i = 0; let listOpen = false; let q = [];
  const flushList = () => { if (listOpen) { html += "</ul>"; listOpen = false; } };
  const flushQ = () => { if (q.length) { html += `<blockquote>${q.map(inline).join("<br>")}</blockquote>`; q = []; } };
  while (i < lines.length) {
    const line = lines[i].replace(/\s+$/, "");
    if (/^>\s?/.test(line)) { flushList(); q.push(line.replace(/^>\s?/, "")); i++; continue; } else flushQ();
    if (line.trim() === "") { flushList(); i++; continue; }
    if (/^###\s+/.test(line)) { flushList(); html += `<h3>${inline(line.replace(/^###\s+/, ""))}</h3>`; i++; continue; }
    if (/^##\s+/.test(line)) { flushList(); html += `<h2>${inline(line.replace(/^##\s+/, ""))}</h2>`; i++; continue; }
    if (/^\s*[-*·]\s+/.test(line)) { if (!listOpen) { html += "<ul>"; listOpen = true; } html += `<li>${inline(line.replace(/^\s*[-*·]\s+/, ""))}</li>`; i++; continue; }
    flushList(); html += `<p>${inline(line)}</p>`; i++;
  }
  flushQ(); flushList(); return html;
}
function extractChips(md) {
  const chips = [];
  const cleaned = md.replace(/\[([^\]\n]{1,40})\]/g, (m, label) => { chips.push(label.trim()); return ""; });
  return { cleaned, chips };
}
function scrollDown() { log.scrollTop = log.scrollHeight; }
function addYou(text) {
  const w = document.createElement("div"); w.className = "msg you";
  w.innerHTML = `<div class="role-label">You</div><div class="bubble"></div>`;
  w.querySelector(".bubble").textContent = text; log.appendChild(w); scrollDown();
}
function addCos() {
  const w = document.createElement("div"); w.className = "msg cos";
  w.innerHTML = `<div class="role-label">Chief of Staff</div><div class="tools"></div>
    <div class="bubble"><div class="cos-md"></div><div class="chips"></div></div>`;
  log.appendChild(w); scrollDown();
  return { text: "", tools: w.querySelector(".tools"), md: w.querySelector(".cos-md"), chips: w.querySelector(".chips") };
}
function renderCos(node) {
  const { cleaned, chips } = extractChips(node.text);
  node.md.innerHTML = renderMarkdown(cleaned);
  node.chips.innerHTML = "";
  chips.forEach((label) => { const b = document.createElement("button"); b.className = "chip"; b.textContent = label;
    b.onclick = () => { if (!busy) sendMessage(label); }; node.chips.appendChild(b); });
  scrollDown();
}
function detectMode(text) {
  const m = text.match(/\b(Quick|Working|Deep|Silent)\s+mode\b/i);
  if (m) modeTag.textContent = m[1][0].toUpperCase() + m[1].slice(1).toLowerCase();
}

async function sendMessage(message, kickoff) {
  if (busy) return; busy = true; sendBtn.disabled = true;
  if (welcome) welcome.style.display = "none";
  if (!kickoff) addYou(message);
  const node = addCos();
  const thinking = document.createElement("div"); thinking.className = "thinking"; thinking.textContent = "thinking…";
  node.md.appendChild(thinking);
  try {
    const resp = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, sessionId, kickoff }) });
    const reader = resp.body.getReader(); const dec = new TextDecoder(); let buf = ""; let first = true;
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      buf += dec.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf("\n\n")) !== -1) {
        const chunk = buf.slice(0, idx); buf = buf.slice(idx + 2);
        const ev = parseSse(chunk); if (!ev) continue;
        if (ev.event === "session") sessionId = ev.data.sessionId;
        else if (ev.event === "tool") { const d = document.createElement("div"); d.className = "tool-line"; d.textContent = ev.data.summary; node.tools.appendChild(d); scrollDown(); }
        else if (ev.event === "text") { if (first) { node.text = ""; first = false; } node.text += ev.data.text; detectMode(ev.data.text); renderCos(node); }
        else if (ev.event === "done") { if (ev.data.sessionId) sessionId = ev.data.sessionId;
          if (typeof ev.data.costUsd === "number") { totalCost += ev.data.costUsd; costEl.textContent = "$" + totalCost.toFixed(4); } }
        else if (ev.event === "error") { node.text += `\n\n_Error: ${ev.data.message}_`; renderCos(node); }
      }
    }
    if (first) { node.text = "(no response)"; renderCos(node); }
  } catch (err) { node.text = `_Connection error: ${err.message}_`; renderCos(node); }
  finally {
    busy = false; sendBtn.disabled = false; input.focus();
    loadLoops(); // COS may have changed the file
    loadCalendar(); // COS may have cancelled/changed a calendar event
  }
}
function parseSse(chunk) {
  const lines = chunk.split("\n"); let event = "message"; let data = "";
  for (const l of lines) { if (l.startsWith("event:")) event = l.slice(6).trim(); else if (l.startsWith("data:")) data += l.slice(5).trim(); }
  if (!data) return null;
  try { return { event, data: JSON.parse(data) }; } catch { return null; }
}

// ---------------------------------------------------------------- wire up
form.addEventListener("submit", (e) => { e.preventDefault(); const t = input.value.trim(); if (!t) return;
  input.value = ""; input.style.height = "auto"; sendMessage(t); });
input.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });
input.addEventListener("input", () => { input.style.height = "auto"; input.style.height = Math.min(input.scrollHeight, 120) + "px"; });

$("add-input").addEventListener("keydown", (e) => { if (e.key === "Enter") { addItem(e.target.value); e.target.value = ""; } });
$("week-toggle").addEventListener("click", () => {
  weekView = weekView === "category" ? "priority" : "category";
  localStorage.setItem("weekView", weekView);
  renderWeek();
});
$("today-add").addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  let t = e.target.value.trim();
  if (t) { if (!/due:/.test(t)) t += ` · due:${TODAY}`; addItem(t); }
  e.target.value = "";
});

document.querySelectorAll("[data-kickoff]").forEach((b) => b.addEventListener("click", () => sendMessage(null, b.dataset.kickoff)));
$("just-chat").addEventListener("click", () => { if (welcome) welcome.style.display = "none"; input.focus(); });
$("reset-layout").addEventListener("click", () => {
  ["card-today", "card-week", "card-chat", "card-inbox", "card-proposals", "card-brief", "card-reminders", "card-reflection"].forEach((id) => { localStorage.removeItem("pos:" + id); localStorage.removeItem("size:" + id); });
  location.reload();
});
$("triage-btn").addEventListener("click", runTriage);
$("brief-btn").addEventListener("click", runBrief);
$("reflect-btn").addEventListener("click", runReflect);
$("add-note").addEventListener("click", addNote);

["card-today", "card-week", "card-chat", "card-inbox", "card-proposals", "card-brief", "card-reminders", "card-reflection"].forEach((id) => setupStaticCard($(id)));
renderScratchNotes();
initInbox();
loadBrief();
loadReflection();
loadProposalsCached();
loadTaps();
setInterval(loadTaps, 30000);
try { if (window.Notification && Notification.permission === "default") Notification.requestPermission(); } catch {}
loadLoops();
