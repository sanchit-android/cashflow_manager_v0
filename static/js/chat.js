// Chat entry: type a sentence, it's saved straight away, and the new row flashes in the grid.
// Corrections happen in the grid itself. The chat only stops to ask when it can't save at all
// (no amount, a transfer with nowhere to go, "rent" that could be money in or out).
// Desktop: a floating chat window you can drag by its header, or minimise to just the header at the bottom right. Phone: a full-height sheet that confirms each
// entry in a plain sentence (with any warnings) and stays in the chat instead of jumping to the grid.
import { catIcon } from "./icons.js";
import { parseEntry, answer, parseAmount, normalize, splitEntries, parseAddTo } from "./parser.js";
import { parseCommand, HELP } from "./commands.js";
import { logMiss } from "./chatlog.js";
import { isBankAlert, parseBankAlerts } from "./bankalert.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const EXAMPLES = ["450 swiggy", "1200 petrol with atlas yesterday", "change swiggy to 500", "totals by category", "spend trend", "help"];
const ASK_EXAMPLES = ["Where did my money go?", "food this month vs last month", "what's left to pay", "runway", "top merchants", "savings rate"];
const FOLLOW_UPS = {
  spend: ["totals by category", "spend trend", "compare with last month"],
  categories: ["category trend", "top merchants", "what's left to pay"],
  category: ["totals by category", "spend trend", "compare with last month"],
  chart: ["totals by category", "savings rate", "top merchants"],
  runway: ["savings rate", "what's left to pay", "spend trend"],
  default: ["totals by category", "spend trend", "what's left to pay"],
};
const isPhone = () => window.matchMedia("(max-width: 640px)").matches;
const CMD_HIST_KEY = "po.chat.hist";
function getCmdHist() {
  try { return JSON.parse(localStorage.getItem(CMD_HIST_KEY) || "[]"); } catch { return []; }
}
function recordCmdHist(text) {
  const clean = String(text || "").trim();
  if (!clean || clean.length > 80 || /^undo$/i.test(clean)) return;
  try {
    const list = getCmdHist();
    const now = Date.now(), weekAgo = now - 7 * 86400e3;
    const hit = list.find((x) => x.text.toLowerCase() === clean.toLowerCase());
    if (hit) { hit.runs = [...(hit.runs || []).filter((t) => t > weekAgo), now]; hit.at = now; }
    else list.unshift({ text: clean, runs: [now], at: now });
    list.sort((a, b) => b.at - a.at);
    localStorage.setItem(CMD_HIST_KEY, JSON.stringify(list.slice(0, 20)));
  } catch {}
}
function isRepeatedCmd(text) {
  const clean = String(text || "").trim().toLowerCase();
  const hit = getCmdHist().find((x) => x.text.toLowerCase() === clean);
  return hit && (hit.runs || []).length >= 2;
}

// deps: { ctx(), save(drafts) -> { ids, txIds, summaries, sentences, notes }, undo(ids), reveal(txIds), refresh(), suggestions(prefix),
//         addTo(target, amount, accountIds?) -> { skip } | { none, month } | { id, before, sentence, notes }, restore(id, before),
//         command(cmd) -> Reply, commandCtx() -> { period } }
// Reply (a command's answer) = { title?, text?, table?: { rows: [[label, value, sub?]], total?: [label, value] }, chart?(host), notes?, err?,
//   reveal?: txIds, month?: period (link to open it), revert?() (makes it undoable), actions?: [{ label, run() -> Reply }], changed? }
let deps = null;
// The conversation lives for the whole session, across opening and closing.
const msgs = [];          // { who: "me" | "bot", text, card?, ids?, txIds?, undone?, ask?, ok?, notes?, restore? }

/** A saved row as a small card: what, how much, which account (and where to), category and day. */
function cardHtml(c) {
  const acct = (a) => `<span class="tx-chip tx-acct">${a.icon}${esc(a.name)}</span>`;
  return `<span class="tx-card">
    <span class="tx-top"><span class="tx-ok" aria-hidden="true">✓</span> ${esc(c.verb)} <strong>${esc(c.sign)}${esc(c.amount)}</strong>${c.desc ? ` <span class="tx-desc">${esc(c.desc)}</span>` : ""}</span>
    <span class="tx-meta">${c.from ? acct(c.from) : ""}${c.to ? `<span class="tx-arrow" aria-label="to">→</span>${acct(c.to)}` : ""}${c.category ? `<span class="tx-chip">${c.catIcon}${esc(c.category)}</span>` : ""}<span class="tx-chip">${catIcon("Annual")}${esc(c.day)}</span></span>
    ${c.extra ? `<span class="tx-extra">${esc(c.extra)}</span>` : ""}</span>`;
}
/** A command's answer: heading, sentence, small table, chart, example chips and buttons. */
function richHtml(m, i) {
  const t = m.table;
  const suggestPin = pinnable(m) && isRepeatedCmd(m.src);
  const fups = m.followUps || (m.rich && !m.err && !m.examples ? (FOLLOW_UPS[m.what || m.kind] || FOLLOW_UPS.default) : null);
  return `${m.card ? cardHtml(m.card) : ""}${m.title ? `<strong class="msg-title">${esc(m.title)}</strong>` : ""}${m.text ? `<span class="msg-text">${esc(m.text)}</span>` : ""}
    ${t && t.rows.length ? `<table class="msg-table"><tbody>${t.rows.map(([l, v, sub]) => `<tr><td>${esc(l)}${sub ? `<small>${esc(sub)}</small>` : ""}</td><td class="num">${esc(v)}</td></tr>`).join("")}</tbody>${t.total ? `<tfoot><tr><td>${esc(t.total[0])}</td><td class="num">${esc(t.total[1])}</td></tr></tfoot>` : ""}</table>` : ""}
    ${m.chart ? `<div class="msg-chart" data-chart="${i}"></div>` : ""}
    ${m.examples ? m.examples.map(([g, ex]) => `<div class="msg-help"><small>${esc(g)}</small><div class="msg-chips">${ex.map((e) => `<button type="button" class="chat-chip" data-try="${esc(e)}">${esc(e)}</button>`).join("")}</div></div>`).join("") : ""}
    ${m.actions && !m.acted ? `<div class="msg-chips">${m.actions.map((a, j) => `<button type="button" class="chat-chip" data-act="${i}:${j}">${esc(a.label)}</button>`).join("")}</div>` : ""}
    <div class="msg-foot">
      ${pinnable(m) ? `<button type="button" class="msg-pin${suggestPin ? " suggest" : ""}" data-pin="${i}" title="Pin this answer to Home and Review">${suggestPin ? "📌 Pin this?" : "📌 Pin"}</button>` : ""}
      ${m.month || (m.reveal && m.reveal.length) ? `<button type="button" class="msg-open" ${m.reveal && m.reveal.length ? `data-show="${i}"` : `data-month="${esc(m.month)}"`}>See rows</button>` : ""}
    </div>
    ${fups && i === msgs.length - 1 ? `<div class="msg-chips msg-fups">${fups.filter((f) => f.toLowerCase() !== String(m.src || "").toLowerCase()).slice(0, 3).map((e) => `<button type="button" class="chat-chip" data-try="${esc(e)}">${esc(e)}</button>`).join("")}</div>` : ""}`;
}
let current = "";         // the message being handled, kept on bot replies (src) so an undo can report it
let pending = null;       // { draft, rest: [drafts still to save after this one] }
let ui = null;            // the open chat: { el, input, close, expand }
let pos = { x: 0, y: 0 }; // desktop: how far the window has been dragged from its usual spot (kept while the page is open)
let mini = false;         // desktop: minimised to just the header, bottom right

export function initChat(d) { deps = d; }
// Read-only answers (tables or charts) can be pinned; they re-run for the month being viewed.
const pinnable = (m) => m.rich && m.src && (m.table || m.chart) && !m.revert && !m.changed && !m.err && !m.examples && deps.pin;
/** Re-run a pinned question. Returns the Reply, or null if the text no longer parses as a question. */
export async function runPinned(text, period) {
  const cmd = parseCommand(text, { ...deps.ctx(), ...deps.commandCtx(), ...(period ? { period } : {}) });
  if (!cmd || cmd.kind === "help") return null;
  return deps.command(cmd);
}
export const chatOpen = () => !!ui;

/** Open the chat, or focus it if it's already open. */
// Desktop: the assistant is a column docked on the right of every screen inside the centered app-shell. Collapsing it leaves a slim rail.
const DOCK_KEY = "po.dock";
const DOCK_W_KEY = "po.dock.w";
export const dockCollapsed = () => { try { return localStorage.getItem(DOCK_KEY) === "closed"; } catch { return false; } };
const setCollapsed = (on) => { try { on ? localStorage.setItem(DOCK_KEY, "closed") : localStorage.removeItem(DOCK_KEY); } catch {} };
function applyDockWidth(w) {
  const clamped = Math.max(280, Math.min(560, Math.round(+w || 360)));
  document.documentElement.style.setProperty("--dock-w", clamped + "px");
  return clamped;
}
try { const sw = localStorage.getItem(DOCK_W_KEY); if (sw) applyDockWidth(sw); } catch {}
const hostContainer = () => (!isPhone() && document.querySelector(".app-shell")) || document.body;

const PANEL_RIGHT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16"/></svg>';
const EXPAND_LEFT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>';

function ensureHeaderToggle(open) {
  const top = document.querySelector("header.top");
  if (!top) return null;
  let t = document.getElementById("chat-side-toggle");
  if (isPhone()) { t?.remove(); return null; }
  if (!t) {
    t = document.createElement("button");
    t.type = "button";
    t.id = "chat-side-toggle";
    t.className = "chat-side-toggle";
    const tabs = top.querySelector("#tabs");
    if (tabs && tabs.nextSibling) top.insertBefore(t, tabs.nextSibling);
    else top.appendChild(t);
  }
  const isOpen = !!ui;
  t.classList.toggle("on", isOpen);
  t.setAttribute("aria-pressed", String(isOpen));
  t.title = isOpen ? "Collapse assistant sidebar" : "Expand assistant sidebar (/ or Ctrl+K)";
  t.setAttribute("aria-label", t.title);
  t.innerHTML = `${PANEL_RIGHT}`;
  t.onclick = () => {
    if (ui) ui.close();
    else { setCollapsed(false); open(); }
  };
  return t;
}

function showRail(open) {
  ensureHeaderToggle(open);
  if (isPhone()) return;
  let b = document.querySelector(".chat-rail");
  if (!b) {
    b = document.createElement("button");
    b.type = "button"; b.className = "chat-rail"; b.title = "Expand assistant (/ or Ctrl+K)"; b.setAttribute("aria-label", "Expand assistant");
    b.innerHTML = `${EXPAND_LEFT}${BUBBLE}<span class="chat-rail-label">Assistant</span>`;
    hostContainer().appendChild(b);
  }
  b.onclick = () => { b.remove(); document.body.classList.remove("chat-railed"); setCollapsed(false); open(); };
  document.body.classList.add("chat-railed");
}
/** Desktop only: open the docked assistant unless the user collapsed it (then show the rail). */
export function ensureDock(opts) {
  if (isPhone()) { document.querySelector(".chat-rail")?.remove(); document.getElementById("chat-side-toggle")?.remove(); document.body.classList.remove("chat-railed"); if (ui && !ui.phone) ui.close(true); return; }
  const open = () => openChat({ ...opts, focus: true });
  ensureHeaderToggle(open);
  if (ui) { if (ui.refreshIdle) ui.refreshIdle(); return; }
  if (dockCollapsed()) showRail(open);
  else openChat({ ...opts, focus: false });
}

export function openChat({ accountId, focus = true, mode = "default" } = {}) {
  if (ui) { if (mode && ui.setMode) ui.setMode(mode); ui.expand(); if (focus) ui.input.focus(); return; }
  document.querySelector(".chat-rail")?.remove(); document.body.classList.remove("chat-railed"); setCollapsed(false);
  const phone = isPhone();
  let curMode = mode; // "default" | "type" | "keypad" | "ask"
  const wrap = document.createElement("div");
  wrap.className = phone ? "ml-back chat-back" : "chat-side";
  wrap.innerHTML = `${!phone ? '<div class="chat-resize" title="Drag to resize · double-click to reset" aria-hidden="true"></div>' : ""}
  <section class="${phone ? "ml-sheet chat-panel" : "chat-dock"}" ${phone ? 'role="dialog" aria-modal="true"' : 'role="complementary"'} aria-label="Assistant">
    ${phone ? '<div class="ml-grab" aria-hidden="true"></div>' : ""}
    <header class="chat-head"><span class="chat-head-ico" aria-hidden="true">${BUBBLE}</span><strong>${phone ? (curMode === "ask" ? "Ask" : "Add") : "Assistant"}</strong>
      ${phone && curMode !== "ask" ? `<div class="seg chat-mode-seg" role="group" aria-label="Entry mode"><button type="button" data-cmode="type" class="${curMode !== "keypad" ? "on" : ""}">Type</button><button type="button" data-cmode="keypad" class="${curMode === "keypad" ? "on" : ""}">Keypad</button></div>` : `<span class="chat-head-hint">${phone ? "Ask about your spending, trends or bills" : "runs on your device 🔒"}</span>`}
      ${!phone ? `<button type="button" class="chat-x chat-hist" aria-label="Recent commands" title="Recent commands">⟲</button>` : ""}
      <button type="button" class="chat-x chat-close" aria-label="${phone ? "Close chat" : "Collapse the assistant"}" title="${phone ? "Close" : "Collapse"}">${phone ? "✕" : COLLAPSE}</button></header>
    <div class="chat-hist-pop" hidden></div>
    <div class="chat-keypad" hidden></div>
    <div class="chat-thread" aria-live="polite"></div>
    <div class="chat-suggest" aria-label="Suggestions"></div>
    <form class="chat-bar" autocomplete="off">
      <input class="chat-in" type="text" enterkeyhint="send" aria-label="Type an entry" placeholder="${phone ? (curMode === "ask" ? "Ask anything… e.g. food vs last month" : "e.g. 450 swiggy, 230 uber upi") : "Ask, log or go…  ⌘K /"}">
      ${phone && curMode !== "ask" ? '<button type="button" class="chat-paste" title="Paste bank SMS / UPI alert">📋 SMS</button>' : ""}
      <button type="submit" class="chat-send" aria-label="Save">${SEND}</button>
    </form></section>`;
  hostContainer().appendChild(wrap);
  document.body.classList.add(phone ? "ml-open" : "chat-side-open");
  const panel = wrap.querySelector("section"), thread = wrap.querySelector(".chat-thread"), input = wrap.querySelector(".chat-in"), sugEl = wrap.querySelector(".chat-suggest"), kpEl = wrap.querySelector(".chat-keypad"), histPop = wrap.querySelector(".chat-hist-pop");
  const prevFocus = document.activeElement;

  // Desktop resize handle
  const resizer = wrap.querySelector(".chat-resize");
  if (resizer) {
    resizer.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const x0 = e.clientX, w0 = wrap.getBoundingClientRect().width;
      document.body.classList.add("xl-resizing");
      const move = (ev) => { applyDockWidth(w0 + (x0 - ev.clientX)); };
      const up = () => {
        window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up);
        document.body.classList.remove("xl-resizing");
        const finalW = wrap.getBoundingClientRect().width;
        try { localStorage.setItem(DOCK_W_KEY, String(Math.round(finalW))); } catch {}
      };
      window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
    });
    resizer.addEventListener("dblclick", () => {
      applyDockWidth(360);
      try { localStorage.removeItem(DOCK_W_KEY); } catch {}
    });
  }

  const close = (silent) => {
    wrap.remove(); document.body.classList.remove("ml-open", "chat-docked", "chat-side-open", "chat-active"); ui = null; mini = false;
    if (!phone && silent !== true) { setCollapsed(true); showRail(() => openChat({ accountId, focus: true })); }
    if (window.visualViewport) window.visualViewport.removeEventListener("resize", fit);
    window.removeEventListener("resize", place);
    if (!phone && prevFocus && prevFocus.focus && document.contains(prevFocus)) prevFocus.focus({ preventScroll: true });
  };
  const place = () => {};
  const setMode = (m) => {
    curMode = m;
    wrap.querySelectorAll("[data-cmode]").forEach((b) => b.classList.toggle("on", b.dataset.cmode === m));
    if (kpEl) kpEl.hidden = m !== "keypad";
    thread.hidden = m === "keypad";
    wrap.querySelector(".chat-bar").hidden = m === "keypad";
    sugEl.hidden = m === "keypad";
    if (m === "keypad") renderKeypad();
    else { render(); if (phone) keepFocus(); }
  };
  ui = { el: wrap, input, close, phone, expand: () => {}, setMode, refreshIdle: () => { if (!msgs.length) render(); } };
  if (!phone) ensureHeaderToggle(() => openChat({ accountId, focus: true }));
  wrap.querySelector(".chat-close").onclick = () => close();
  wrap.querySelectorAll("[data-cmode]").forEach((b) => (b.onclick = () => setMode(b.dataset.cmode)));

  // History button (⟲)
  const histBtn = wrap.querySelector(".chat-hist");
  if (histBtn && histPop) {
    histBtn.onclick = (e) => {
      e.stopPropagation();
      if (!histPop.hidden) { histPop.hidden = true; return; }
      const list = getCmdHist();
      histPop.innerHTML = list.length
        ? `<div class="chat-hist-head">Recent queries &amp; entries</div>` + list.slice(0, 10).map((x) => `<button type="button" class="chat-hist-item" data-hcmd="${esc(x.text)}"><span>${esc(x.text)}</span>${(x.runs || []).length > 1 ? `<small>${x.runs.length}×</small>` : ""}</button>`).join("")
        : `<div class="chat-hist-head muted">No recent commands yet.</div>`;
      histPop.hidden = false;
      histPop.querySelectorAll("[data-hcmd]").forEach((b) => (b.onclick = () => {
        histPop.hidden = true;
        input.value = b.dataset.hcmd;
        submit();
      }));
    };
    document.addEventListener("click", (e) => { if (histPop && !histPop.hidden && !histPop.contains(e.target) && e.target !== histBtn) histPop.hidden = true; });
  }

  // Paste SMS button on mobile
  const pasteBtn = wrap.querySelector(".chat-paste");
  if (pasteBtn) {
    pasteBtn.onclick = async () => {
      try {
        const text = await navigator.clipboard.readText();
        if (text && text.trim()) {
          msgs.push({ who: "me", text: text.trim() }); current = text.trim(); render(); enter(text.trim());
          return;
        }
      } catch {}
      input.placeholder = "Long-press here and tap Paste to paste your bank SMS…";
      keepFocus();
    };
  }

  // Keypad mode renderer (M2)
  function renderKeypad() {
    if (!kpEl) return;
    const c = ctx(), accts = c.accounts || [], cats = c.categories || [];
    let dir = "out", amtStr = "", merch = "", cat = cats[0] || "Food", acct = c.defaultAccountId || (accts[0] && accts[0].id) || "", toAcct = (accts.find((a) => a.id !== acct) || accts[0] || {}).id || "", dt = c.today;
    const recentMerchs = (deps.suggestions ? deps.suggestions("") : []).slice(0, 8);
    const evalAmt = (s) => {
      const clean = String(s || "").replace(/[^0-9.+*/-]/g, "");
      if (!clean) return 0;
      try { const p = parseAmount(normalize(clean.replace(/\+/g, " + "))); if (p) return p.value; } catch {}
      const parts = clean.split("+").map((x) => parseFloat(x) || 0);
      return Math.round(parts.reduce((a, b) => a + b, 0) * 100) / 100;
    };
    const drawKp = () => {
      kpEl.innerHTML = `<div class="kp-wrap">
        <div class="seg kp-dir">${[["out", "Spent"], ["in", "Received"], ["transfer", "Transfer"]].map(([v, l]) => `<button type="button" data-kdir="${v}" class="${dir === v ? "on" : ""}">${l}</button>`).join("")}</div>
        <div class="kp-display"><span class="kp-cur">₹</span><span class="kp-val">${esc(amtStr || "0")}</span>${amtStr.includes("+") ? `<small class="kp-eq">= ${evalAmt(amtStr)}</small>` : ""}</div>
        <div class="kp-row"><input class="kp-merch" placeholder="${dir === "transfer" ? "Note (optional)" : "Merchant / description (e.g. Swiggy)"}" value="${esc(merch)}" list="kp-merch-list">
          <datalist id="kp-merch-list">${recentMerchs.map((m) => `<option value="${esc(m)}">`).join("")}</datalist>
          <input type="date" class="kp-date" value="${esc(dt)}"></div>
        ${dir !== "transfer" ? `<div class="kp-chips" aria-label="Category">${cats.slice(0, 8).map((k) => `<button type="button" class="chat-chip ${cat === k ? "on" : ""}" data-kcat="${esc(k)}">${esc(k)}</button>`).join("")}</div>` : ""}
        <div class="kp-chips" aria-label="Account">${accts.map((a) => `<button type="button" class="chat-chip ${acct === a.id ? "on" : ""}" data-kacct="${esc(a.id)}">${esc(a.name)}</button>`).join("")}</div>
        ${dir === "transfer" ? `<div class="kp-chips" aria-label="To account"><small class="muted">To:</small>${accts.filter((a) => a.id !== acct).map((a) => `<button type="button" class="chat-chip ${toAcct === a.id ? "on" : ""}" data-kto="${esc(a.id)}">${esc(a.name)}</button>`).join("")}</div>` : ""}
        <div class="kp-pad">
          ${["1", "2", "3", "4", "5", "6", "7", "8", "9", "+", "0", "⌫"].map((k) => `<button type="button" class="kp-key" data-kkey="${k}">${k}</button>`).join("")}
        </div>
        <div class="kp-actions"><button type="button" class="primary kp-save" data-kmore="0">Save</button><button type="button" class="kp-save" data-kmore="1">Save + another</button></div>
        <div class="kp-log"></div>
      </div>`;
      kpEl.querySelectorAll("[data-kdir]").forEach((b) => (b.onclick = () => { dir = b.dataset.kdir; drawKp(); }));
      kpEl.querySelector(".kp-merch").oninput = (e) => {
        merch = e.target.value;
        if (c.infer && merch.length > 2) { const inf = c.infer(merch); if (inf && inf.category) cat = inf.category; }
      };
      kpEl.querySelector(".kp-date").onchange = (e) => { dt = e.target.value || c.today; };
      kpEl.querySelectorAll("[data-kcat]").forEach((b) => (b.onclick = () => { cat = b.dataset.kcat; drawKp(); }));
      kpEl.querySelectorAll("[data-kacct]").forEach((b) => (b.onclick = () => { acct = b.dataset.kacct; drawKp(); }));
      kpEl.querySelectorAll("[data-kto]").forEach((b) => (b.onclick = () => { toAcct = b.dataset.kto; drawKp(); }));
      kpEl.querySelectorAll("[data-kkey]").forEach((b) => (b.onclick = () => {
        const k = b.dataset.kkey;
        if (k === "⌫") amtStr = amtStr.slice(0, -1);
        else if (k === "+" && (!amtStr || amtStr.endsWith("+"))) return;
        else amtStr += k;
        kpEl.querySelector(".kp-val").textContent = amtStr || "0";
        const eq = kpEl.querySelector(".kp-eq");
        if (eq) eq.textContent = amtStr.includes("+") ? `= ${evalAmt(amtStr)}` : "";
      }));
      kpEl.querySelectorAll(".kp-save").forEach((b) => (b.onclick = async () => {
        const val = evalAmt(amtStr);
        if (!(val > 0)) return;
        const draft = {
          date: dt, description: merch.trim() || (dir === "in" ? "Income" : dir === "transfer" ? "Transfer" : cat),
          account_id: acct, direction: dir, to_account_id: dir === "transfer" ? toAcct : "",
          category: dir === "transfer" ? "" : cat, nature: dir === "in" ? "income" : "variable", amount: val, raw: `${val} ${merch}`,
        };
        await saveBatch([draft]);
        amtStr = ""; merch = "";
        if (b.dataset.kmore === "1") drawKp();
        else setMode("type");
      }));
    };
    drawKp();
  }

  // Collapse hero strip on desktop while the assistant thread is actively focused
  input.addEventListener("focus", () => { if (!phone && msgs.length) document.body.classList.add("chat-active"); });
  document.addEventListener("mousedown", (e) => { if (!phone && !wrap.contains(e.target)) document.body.classList.remove("chat-active"); });
  if (phone) {
    wrap.addEventListener("click", (e) => { if (e.target === wrap) close(); });
    let y0 = null; const grab = wrap.querySelector(".ml-grab");
    grab.addEventListener("touchstart", (e) => { y0 = e.touches[0].clientY; }, { passive: true });
    grab.addEventListener("touchend", (e) => { if (y0 != null && e.changedTouches[0].clientY - y0 > 60) close(); y0 = null; });
  }
  // Keep the text box above the on-screen keyboard.
  const fit = () => { const vv = window.visualViewport; if (vv) panel.style.height = Math.round(vv.height - 8) + "px"; };
  if (phone && window.visualViewport) { window.visualViewport.addEventListener("resize", fit); fit(); }

  const ctx = () => ({ ...deps.ctx(), ...(accountId ? { defaultAccountId: accountId } : {}) });
  const keepFocus = () => input.focus({ preventScroll: true });
  // Failed or undone messages are logged (redacted) to improve the parser.
  const miss = (reason, text, kind = "") => logMiss(reason, text || current, { kind, accounts: ctx().accounts || [] });

  function render() {
    if (!msgs.length) {
      const exList = curMode === "ask" ? ASK_EXAMPLES : EXAMPLES;
      thread.innerHTML = `<div class="chat-empty">
        ${!phone ? `<div class="chat-idle-pins"></div>` : ""}
        <p>${curMode === "ask" ? "Ask anything about your money, trends, or categories." : `Type what you spent or received, in plain words. It's saved straight away and ${phone ? "I'll confirm what was added" : "highlighted in the grid"}. You can also change or delete rows, mark cards billed, add accounts and ask about any month. Type “help” to see how.`}</p>
        <div class="chat-examples">${exList.map((e) => `<button type="button" class="chat-chip" data-ex="${esc(e)}">${esc(e)}</button>`).join("")}</div></div>`;
      thread.querySelectorAll("[data-ex]").forEach((b) => (b.onclick = () => {
        input.value = b.dataset.ex;
        if (curMode === "ask") submit(); else keepFocus();
      }));
      const idleBox = thread.querySelector(".chat-idle-pins");
      if (idleBox && deps.renderIdlePins) { try { deps.renderIdlePins(idleBox); } catch (_) {} }
      place();
      return;
    }
    const lastSaved = [...msgs].reverse().find((m) => m.ids && !m.undone);
    thread.innerHTML = msgs.map((m, i) => m.who === "me"
      ? `<div class="msg me">${esc(m.text)}</div>`
      : `<div class="msg bot${m.chart || m.table || m.examples ? " wide" : ""}${m.undone ? " undone" : ""}${m.err ? " err" : ""}">
          ${m.rich ? richHtml(m, i) : m.card ? (m.txIds && !m.undone ? `<button type="button" class="msg-link" data-show="${i}" title="Show in the grid">${cardHtml(m.card)}</button>` : cardHtml(m.card))
            : `${m.ok ? `<strong class="msg-ok">${m.notes && m.notes.length ? "✓ Confirmed, with a note" : "✓ Confirmed"}</strong> ` : ""}${m.txIds && !m.undone ? `<button type="button" class="msg-link" data-show="${i}" title="Show in the grid">${esc(m.text)}</button>` : esc(m.text)}`}
          ${(m.notes || []).map((n) => `<div class="msg-warn">⚠ ${esc(n)}</div>`).join("")}
          ${m === lastSaved ? ` <button type="button" class="msg-undo" data-undo="${i}">Undo</button>` : ""}
          ${m.ask && pending && m === msgs[msgs.length - 1] && m.ask.options.length ? `<div class="msg-chips">${m.ask.options.map(([v, l]) => `<button type="button" class="chat-chip" data-ans="${esc(v)}">${esc(l)}</button>`).join("")}</div>` : ""}
        </div>`).join("");
    thread.querySelectorAll("[data-show]").forEach((b) => (b.onclick = () => {
      const ids = msgs[+b.dataset.show].txIds;
      if (phone) close(); // the sheet covers the grid
      deps.reveal(ids); if (!phone) keepFocus();
    }));
    thread.querySelectorAll("[data-chart]").forEach((el) => { try { msgs[+el.dataset.chart].chart(el); } catch (e) { el.textContent = "Couldn't draw this chart."; } });
    thread.querySelectorAll("[data-act]").forEach((b) => (b.onclick = async () => {
      const [i, j] = b.dataset.act.split(":").map(Number), m = msgs[i];
      if (m.acted) return; m.acted = true;
      msgs.push({ who: "me", text: m.actions[j].label });
      try { reply_(await m.actions[j].run()); } catch (e) { msgs.push({ who: "bot", text: "Couldn't do that: " + (e.message || e), err: true }); render(); }
    }));
    thread.querySelectorAll("[data-month]").forEach((b) => (b.onclick = () => { if (phone) close(); deps.openMonth(b.dataset.month); }));
    thread.querySelectorAll("[data-try]").forEach((b) => (b.onclick = () => { input.value = b.dataset.try; keepFocus(); }));
    thread.querySelectorAll("[data-pin]").forEach((b) => (b.onclick = async () => {
      const m = msgs[+b.dataset.pin];
      try { await deps.pin(m.src, m.title || m.src); b.textContent = "📌 Pinned"; b.disabled = true; } catch (e) { b.textContent = "Couldn't pin"; }
    }));
    thread.querySelectorAll("[data-undo]").forEach((b) => (b.onclick = () => undo(msgs[+b.dataset.undo])));
    thread.querySelectorAll("[data-ans]").forEach((b) => (b.onclick = () => { msgs.push({ who: "me", text: b.textContent }); reply(b.dataset.ans); }));
    thread.scrollTop = thread.scrollHeight;
    place();
  }

  // Fill in what we can guess so the entry can be saved now; the grid is where it gets corrected.
  function autoFill(d) {
    const c = ctx(), notes = [...(d.notes || [])];
    for (let n = 0; d.ask && n < 6; n++) {
      const { slot, options } = d.ask;
      if (slot === "category") { d = answer(d, "category", "Other", c); notes.push("I couldn't tell the category, so it's under Other."); }
      else if (slot === "new_account") { const nm = d.new_account && d.new_account.name; d = answer(d, "new_account", "create", c); if (nm) notes.push(`I created a new account “${nm}” for this.`); }
      else if (slot === "account" && options.length) { const o = options.find(([v]) => v === c.defaultAccountId) || options[0]; d = answer(d, "account", o[0], c); notes.push(`You didn't say which account, so I used ${o[1]}.`); }
      else if (slot === "to_account" && options.length && /^Which /.test(d.ask.text)) { const o = options[0]; d = answer(d, "to_account", o[0], c); notes.push(`You didn't say where it went, so I used ${o[1]}.`); }
      else break;
    }
    if (notes.length) d.notes = notes;
    return d;
  }

  async function run(drafts) {
    const ok = [];
    while (drafts.length) {
      const d = autoFill(drafts.shift());
      if (d.ask) { // can't save this one without an answer
        await saveBatch(ok); ok.length = 0;
        pending = { draft: d, rest: drafts };
        msgs.push({ who: "bot", text: d.ask.slot === "amount" ? `How much for “${d.description || d.raw}”?` : d.ask.text, ask: d.ask });
        render(); keepFocus();
        return;
      }
      ok.push(d);
    }
    pending = null;
    await saveBatch(ok);
    render(); keepFocus();
  }

  async function saveBatch(drafts) {
    if (!drafts.length) return;
    try {
      const res = await deps.save(drafts);
      // Undo removes the whole batch; keep the ids on the last line of it.
      drafts.forEach((d) => { if ((d.notes || []).some((n) => /couldn't tell the category/.test(n))) miss("guessed", d.raw, "entry"); });
      res.summaries.forEach((s, i) => msgs.push({ who: "bot", src: current, kind: "entry", ids: i === res.summaries.length - 1 ? res.ids : null, txIds: [res.txIds[i]],
        notes: res.notes[i], card: res.cards && res.cards[i], ...(phone ? { text: res.sentences[i], ok: true } : { text: "✓ " + s }) }));
      render();
      // Phone: stay in the conversation; the grid behind is only brought up to date.
      if (phone) deps.refresh(); else deps.reveal(res.txIds);
      keepFocus(); setTimeout(keepFocus, 450);
    } catch (e) {
      msgs.push({ who: "bot", text: "Couldn't save: " + (e.message || e), err: true }); render();
      miss("error", "", "entry");
    }
  }

  function reply(value) {
    const { draft, rest } = pending;
    const d = answer(draft, draft.ask.slot, value, ctx());
    if (d.ask && d.ask.slot === draft.ask.slot && draft.ask.slot === "amount") { msgs.push({ who: "bot", text: "I need a number, like 450 or 1.2L.", ask: draft.ask }); render(); return; }
    run([d, ...rest]);
  }

  /** "add 272 to instamart": put +272 on the row that's already there. Returns false when it should be a normal entry instead. */
  async function addTo(piece, hit) {
    try {
      const res = await deps.addTo(hit.target, hit.amount, hit.account_ids);
      if (res.skip) return false;
      if (res.none) { miss("no_match", piece, "add_to"); msgs.push({ who: "bot", err: true, text: `Nothing was changed. I couldn't find a row matching “${hit.target}” in ${res.month}${res.account ? ` on ${res.account}` : ""}. To add it as a new entry, type “${hit.amount} ${hit.target}”.` }); render(); return true; }
      msgs.push({ who: "bot", src: current, kind: "add_to", ids: [], txIds: [res.id], restore: { id: res.id, before: res.before }, notes: res.notes, card: res.card, ...(phone ? { text: res.sentence, ok: true } : { text: "✓ " + res.sentence }) });
      render();
      if (phone) deps.refresh(); else deps.reveal([res.id]);
      keepFocus(); setTimeout(keepFocus, 450);
    } catch (e) { msgs.push({ who: "bot", text: "Couldn't save: " + (e.message || e), err: true }); render(); miss("error", piece, "add_to"); }
    return true;
  }

  async function undo(m) {
    if (!m || !m.ids) return;
    if (m.src) miss("undone", m.src, m.kind || "");
    if (m.revert) { try { await m.revert(); } catch (e) { msgs.push({ who: "bot", text: "Couldn't undo: " + (e.message || e), err: true }); render(); return; } deps.refresh(); }
    else if (m.restore) await deps.restore(m.restore.id, m.restore.before); else await deps.undo(m.ids);
    // Strike out every line of that batch.
    const set = new Set(m.ids);
    for (const x of msgs) if (x.txIds && x.txIds.some((id) => set.has(id))) x.undone = true;
    m.undone = true;
    msgs.push({ who: "bot", text: "Undone." });
    render(); keepFocus();
  }

  function submit() {
    const text = input.value.trim();
    if (!text) return;
    input.value = ""; sugEl.innerHTML = "";
    recordCmdHist(text);
    if (!phone) document.body.classList.add("chat-active");
    msgs.push({ who: "me", text });
    if (/^undo$/i.test(text)) { const m = [...msgs].reverse().find((x) => x.ids && !x.undone); if (m) undo(m); else { msgs.push({ who: "bot", text: "Nothing to undo." }); render(); } return; }
    // Answer to "How much?" — a bare amount fills the waiting entry.
    if (pending && pending.draft.ask.slot === "amount" && /^[\d.,+\s]+(k|l|lakh|lakhs|cr|crore)?$/i.test(text) && parseAmount(normalize(text))) return reply(text);
    // Answer by typing one of the offered choices.
    if (pending && pending.draft.ask.options.length) {
      const hit = pending.draft.ask.options.find(([v, l]) => l.toLowerCase().includes(text.toLowerCase()) || String(v).toLowerCase() === text.toLowerCase());
      if (hit) return reply(hit[0]);
    }
    if (pending) { miss("skipped", pending.draft.raw, "entry_" + pending.draft.ask.slot); msgs.push({ who: "bot", text: `Skipped “${pending.draft.raw}”.` }); pending = null; }
    current = text;
    enter(text);
  }
  /** Show a command's answer; changes are undoable and shown in the grid. */
  function reply_(r) {
    r = r || { text: "Done." };
    if (r.err || r.unknown) miss(r.unknown ? "unknown" : "failed", "", r.kind || "");
    msgs.push({ who: "bot", rich: true, src: current, ...r, ...(r.revert ? { ids: [] } : {}), ...(r.reveal ? { txIds: r.reveal } : {}) });
    render();
    if (r.reveal && r.reveal.length && !phone) deps.reveal(r.reveal); else if (r.changed || r.revert) deps.refresh();
    keepFocus();
  }
  async function command(cmd) {
    if (cmd.kind === "help") return reply_({ title: "Things you can type", examples: HELP });
    try { reply_({ kind: cmd.kind, ...(await deps.command(cmd)) }); } catch (e) { msgs.push({ who: "bot", text: "Couldn't do that: " + (e.message || e), err: true }); render(); miss("error", "", cmd.kind); }
  }
  async function enter(text) {
    // Theme command: "theme dark", "dark mode", "light mode"
    const thm = /^(?:(?:set|switch|change)\s+)?(?:theme\s+(?:to\s+)?([a-z0-9_-]+)|(dark|light)\s+mode)$/i.exec(text.trim());
    if (thm && deps.setTheme) {
      const name = (thm[1] || (thm[2].toLowerCase() === "dark" ? "dark" : "default")).toLowerCase();
      await deps.setTheme(name);
      msgs.push({ who: "bot", text: `Theme set to ${name}.` });
      render();
      return;
    }
    // Pin command: "pin food trend", "pin top merchants"
    const pinM = /^pin\s+(.+)$/i.exec(text.trim());
    if (pinM && deps.pin) {
      const q = pinM[1].trim();
      await deps.pin(q, q);
      msgs.push({ who: "bot", text: `📌 Pinned “${q}” to Home & Review.` });
      render();
      return;
    }
    // Account filter: "show all accounts", "filter hdfc infinia"
    const flt = /^(?:show|filter(?:\s+by)?)\s+(all\s+accounts?|.+?\s+(?:card|account|bank))$/i.exec(text.trim());
    if (flt && deps.filterAccount) {
      const q = flt[1].toLowerCase();
      if (/^all\s+accounts?$/.test(q)) {
        deps.filterAccount("__all");
        msgs.push({ who: "bot", text: "Showing all accounts." });
        render();
        return;
      }
      const acc = (ctx().accounts || []).find((a) => a.name.toLowerCase().includes(q.replace(/\s+(?:card|account|bank)$/, "").trim()) || a.name.toLowerCase() === q);
      if (acc) {
        deps.filterAccount(acc.id);
        msgs.push({ who: "bot", text: `Filtered to ${acc.name}.` });
        render();
        return;
      }
    }
    // Navigation: "go to plan", "open settings", "import", "year view"…
    const nav = /^(?:(?:go\s+to|open|show(?:\s+me)?|take\s+me\s+to)\s+(?:the\s+)?)?(home|ledger|review|plan|settings|accounts?|cards|import|year(?:\s+view)?|insights|savings|projection|checkpoints)(?:\s+(?:page|tab|screen))?$/i.exec(text.trim());
    if (nav && deps.go) {
      const w = nav[1].toLowerCase().replace(/\s+view$/, "");
      const k = { home: "month", account: "accounts", cards: "accounts", projection: "savings", checkpoints: "savings" }[w] || w;
      msgs.push({ who: "bot", text: `Opened ${w.replace(/^\w/, (c) => c.toUpperCase())}.` });
      render(); deps.go(k); if (phone) close();
      return;
    }
    // A pasted bank SMS / UPI alert: rewrite each alert as a plain sentence the entry parser already understands.
    if (isBankAlert(text)) {
      const c = ctx(), MON = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
      const alerts = parseBankAlerts(text, { today: c.today, accounts: c.accounts || [] });
      if (alerts.length) {
        const sentences = alerts.map((a) => {
          const accs = c.accounts || [], isCard = /\bcard\b/i.test(a.raw), low = a.raw.toLowerCase();
          // No last-4 match: fall back to an account whose bank name appears in the alert (a card for card alerts).
          const acc = accs.find((x) => x.id === a.account_id) || accs.find((x) => (isCard ? x.role === "card" : x.role !== "card") && low.includes(String(x.name || "").split(" ")[0].toLowerCase())), day = `${+a.date.slice(8)} ${MON[+a.date.slice(5, 7) - 1]}`;
          return a.direction === "out" ? `spent ${a.amount} on ${a.merchant || "payment"}${acc ? " with " + acc.name : ""} on ${day}`
            : `received ${a.amount} ${a.merchant || "credit"}${acc ? " on " + acc.name : ""} on ${day}`;
        });
        return run(sentences.flatMap((t) => parseEntry(t, c)));
      }
    }
    const cmd = parseCommand(text, { ...ctx(), ...deps.commandCtx() });
    if (cmd) return command(cmd);
    const rest = [];
    for (const piece of splitEntries(text)) {
      const hit = parseAddTo(piece, ctx().accounts);
      if (!hit || !(await addTo(piece, hit))) rest.push(piece);
    }
    if (rest.length) run(parseEntry(rest.join("; "), ctx())); else keepFocus();
  }

  // Suggestions for the word being typed: accounts, planned items, past descriptions.
  function suggest() {
    const v = input.value, m = /(\S+)$/.exec(v), word = m ? m[1].toLowerCase() : "";
    if (word.length < 2 || /^\d/.test(word)) { sugEl.innerHTML = ""; return; }
    sugEl.innerHTML = deps.suggestions(word).slice(0, 6).map((s) => `<button type="button" class="chat-chip" data-sug="${esc(s)}">${esc(s)}</button>`).join("");
    sugEl.querySelectorAll("[data-sug]").forEach((b) => {
      b.onmousedown = (e) => e.preventDefault();
      b.onclick = () => { input.value = v.slice(0, v.length - word.length) + b.dataset.sug.toLowerCase() + " "; sugEl.innerHTML = ""; keepFocus(); };
    });
  }

  wrap.querySelector("form").onsubmit = (e) => { e.preventDefault(); submit(); };
  input.addEventListener("input", suggest);
  // Pasting bank alerts: a single-line box would glue several alerts together, so read the clipboard ourselves.
  input.addEventListener("paste", (e) => {
    const t = (e.clipboardData || window.clipboardData)?.getData("text") || "";
    if (!/\n/.test(t.trim()) || !isBankAlert(t)) return;
    e.preventDefault(); input.value = ""; sugEl.innerHTML = "";
    msgs.push({ who: "me", text: t.trim() }); current = t.trim(); render(); enter(t);
  });
  input.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    e.preventDefault(); e.stopPropagation();
    document.body.classList.remove("chat-active");
    if (input.value) { input.value = ""; sugEl.innerHTML = ""; } else if (phone) close(); else input.blur();
  });
  render();
  if (focus) setTimeout(keepFocus, 30);
}

const BUBBLE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16v11H9l-5 4V5Z"/><path d="M8 9.5h8M8 12.5h5"/></svg>';
const SEND = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6"/></svg>';
const MINIMISE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 18h12"/></svg>';
const RESTORE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 15l6-6 6 6"/></svg>';
const COLLAPSE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';
export const CHAT_ICON = BUBBLE;
