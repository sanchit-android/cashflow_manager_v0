// Chat entry: type a sentence, it's saved straight away, and the new row flashes in the grid.
// Corrections happen in the grid itself. The chat only stops to ask when it can't save at all
// (no amount, a transfer with nowhere to go, "rent" that could be money in or out).
// Desktop: a floating chat window you can drag by its header, or minimise to just the header at the bottom right. Phone: a full-height sheet that confirms each
// entry in a plain sentence (with any warnings) and stays in the chat instead of jumping to the grid.
import { catIcon } from "./icons.js";
import { parseEntry, answer, parseAmount, normalize, splitEntries, parseAddTo } from "./parser.js";
import { parseCommand, HELP } from "./commands.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const EXAMPLES = ["450 swiggy", "1200 petrol with atlas yesterday", "change swiggy to 500", "totals by category", "spend trend", "help"];
const isPhone = () => window.matchMedia("(max-width: 640px)").matches;

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
  return `${m.card ? cardHtml(m.card) : ""}${m.title ? `<strong class="msg-title">${esc(m.title)}</strong>` : ""}${m.text ? `<span class="msg-text">${esc(m.text)}</span>` : ""}
    ${t && t.rows.length ? `<table class="msg-table"><tbody>${t.rows.map(([l, v, sub]) => `<tr><td>${esc(l)}${sub ? `<small>${esc(sub)}</small>` : ""}</td><td class="num">${esc(v)}</td></tr>`).join("")}</tbody>${t.total ? `<tfoot><tr><td>${esc(t.total[0])}</td><td class="num">${esc(t.total[1])}</td></tr></tfoot>` : ""}</table>` : ""}
    ${m.chart ? `<div class="msg-chart" data-chart="${i}"></div>` : ""}
    ${m.examples ? m.examples.map(([g, ex]) => `<div class="msg-help"><small>${esc(g)}</small><div class="msg-chips">${ex.map((e) => `<button type="button" class="chat-chip" data-try="${esc(e)}">${esc(e)}</button>`).join("")}</div></div>`).join("") : ""}
    ${m.actions && !m.acted ? `<div class="msg-chips">${m.actions.map((a, j) => `<button type="button" class="chat-chip" data-act="${i}:${j}">${esc(a.label)}</button>`).join("")}</div>` : ""}
    ${m.month || (m.reveal && m.reveal.length) ? `<button type="button" class="msg-open" ${m.reveal && m.reveal.length ? `data-show="${i}"` : `data-month="${esc(m.month)}"`}>Show in the grid</button>` : ""}`;
}
let pending = null;       // { draft, rest: [drafts still to save after this one] }
let ui = null;            // the open chat: { el, input, close, expand }
let pos = { x: 0, y: 0 }; // desktop: how far the window has been dragged from its usual spot (kept while the page is open)
let mini = false;         // desktop: minimised to just the header, bottom right

export function initChat(d) { deps = d; }
export const chatOpen = () => !!ui;

/** Open the chat, or focus it if it's already open. */
export function openChat({ accountId } = {}) {
  if (ui) { ui.expand(); ui.input.focus(); return; }
  const phone = isPhone();
  const wrap = document.createElement("div");
  wrap.className = phone ? "ml-back chat-back" : "chat-dock-wrap";
  wrap.innerHTML = `<section class="${phone ? "ml-sheet chat-panel" : "chat-dock"}" role="dialog" aria-label="Quick add" ${phone ? 'aria-modal="true"' : ""}>
    ${phone ? '<div class="ml-grab" aria-hidden="true"></div>' : ""}
    <header class="chat-head"><span class="chat-head-ico" aria-hidden="true">${BUBBLE}</span><strong>Quick add</strong>
      <span class="chat-head-hint">Add, change or ask · type “help” for examples</span>
      ${phone ? "" : `<button type="button" class="chat-x chat-min" aria-label="Minimise chat" title="Minimise">${MINIMISE}</button>`}
      <button type="button" class="chat-x chat-close" aria-label="Close chat" title="Close">✕</button></header>
    <div class="chat-thread" aria-live="polite"></div>
    <div class="chat-suggest" aria-label="Suggestions"></div>
    <form class="chat-bar" autocomplete="off">
      <input class="chat-in" type="text" enterkeyhint="send" aria-label="Type an entry" placeholder="e.g. “450 swiggy”, “change swiggy to 500”, “food trend”">
      <button type="submit" class="chat-send" aria-label="Save">${SEND}</button>
    </form></section>`;
  document.body.appendChild(wrap);
  document.body.classList.add(phone ? "ml-open" : "chat-docked");
  const panel = wrap.firstElementChild, thread = wrap.querySelector(".chat-thread"), input = wrap.querySelector(".chat-in"), sugEl = wrap.querySelector(".chat-suggest");
  const prevFocus = document.activeElement;

  const close = () => {
    wrap.remove(); document.body.classList.remove("ml-open", "chat-docked"); ui = null; mini = false;
    if (window.visualViewport) window.visualViewport.removeEventListener("resize", fit);
    window.removeEventListener("resize", place);
    if (!phone && prevFocus && prevFocus.focus && document.contains(prevFocus)) prevFocus.focus({ preventScroll: true });
  };
  // Desktop: put the window where it was dragged to, kept fully on screen (it grows upwards as the conversation gets longer).
  const place = () => {
    if (phone || mini) return;
    const W = document.documentElement.clientWidth, H = document.documentElement.clientHeight, m = 8;
    const w = panel.offsetWidth, h = panel.offsetHeight, left = (W - w) / 2, top = H - 16 - h; // where it sits undragged
    pos = { x: Math.max(m - left, Math.min(W - m - w - left, pos.x)), y: Math.max(m - top, Math.min(H - m - h - top, pos.y)) };
    panel.style.translate = `${pos.x}px ${pos.y}px`;
  };
  const setMini = (on) => {
    if (phone || mini === on) return;
    mini = on;
    wrap.classList.toggle("mini", on); document.body.classList.toggle("chat-docked", !on);
    const b = wrap.querySelector(".chat-min");
    b.innerHTML = on ? RESTORE : MINIMISE; b.title = on ? "Open" : "Minimise"; b.setAttribute("aria-label", on ? "Open chat" : "Minimise chat");
    if (on) input.blur(); else { place(); thread.scrollTop = thread.scrollHeight; input.focus({ preventScroll: true }); }
  };
  ui = { el: wrap, input, close, expand: () => setMini(false) };
  wrap.querySelector(".chat-close").onclick = close;
  if (!phone) {
    const head = wrap.querySelector(".chat-head");
    // Stop here: setMini swaps the button's icon, so the header's click handler below would see a detached target and reopen straight away.
    wrap.querySelector(".chat-min").onclick = (e) => { e.stopPropagation(); setMini(!mini); };
    head.addEventListener("click", (e) => { if (mini && !e.target.closest("button")) setMini(false); });
    // Drag the window by its header.
    head.addEventListener("pointerdown", (e) => {
      if (mini || e.button !== 0 || e.target.closest("button")) return;
      const sx = e.clientX - pos.x, sy = e.clientY - pos.y;
      head.setPointerCapture(e.pointerId); wrap.classList.add("dragging");
      const move = (ev) => { pos = { x: ev.clientX - sx, y: ev.clientY - sy }; place(); };
      const up = () => {
        for (const t of ["pointermove", "pointerup", "pointercancel"]) head.removeEventListener(t, t === "pointermove" ? move : up);
        wrap.classList.remove("dragging"); input.focus({ preventScroll: true });
      };
      head.addEventListener("pointermove", move); head.addEventListener("pointerup", up); head.addEventListener("pointercancel", up);
    });
    window.addEventListener("resize", place);
  }
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

  function render() {
    if (!msgs.length) {
      thread.innerHTML = `<div class="chat-empty"><p>Type what you spent or received, in plain words. It's saved straight away and ${phone ? "I'll confirm what was added" : "highlighted in the grid"}. You can also change or delete rows, mark cards billed, add accounts and ask about any month. Type “help” to see how.</p>
        <div class="chat-examples">${EXAMPLES.map((e) => `<button type="button" class="chat-chip" data-ex="${esc(e)}">${esc(e)}</button>`).join("")}</div></div>`;
      thread.querySelectorAll("[data-ex]").forEach((b) => (b.onclick = () => { input.value = b.dataset.ex; keepFocus(); }));
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
      res.summaries.forEach((s, i) => msgs.push({ who: "bot", ids: i === res.summaries.length - 1 ? res.ids : null, txIds: [res.txIds[i]],
        notes: res.notes[i], card: res.cards && res.cards[i], ...(phone ? { text: res.sentences[i], ok: true } : { text: "✓ " + s }) }));
      render();
      // Phone: stay in the conversation; the grid behind is only brought up to date.
      if (phone) deps.refresh(); else deps.reveal(res.txIds);
      keepFocus(); setTimeout(keepFocus, 450);
    } catch (e) {
      msgs.push({ who: "bot", text: "Couldn't save: " + (e.message || e), err: true }); render();
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
      if (res.none) { msgs.push({ who: "bot", err: true, text: `Nothing was changed. I couldn't find a row matching “${hit.target}” in ${res.month}${res.account ? ` on ${res.account}` : ""}. To add it as a new entry, type “${hit.amount} ${hit.target}”.` }); render(); return true; }
      msgs.push({ who: "bot", ids: [], txIds: [res.id], restore: { id: res.id, before: res.before }, notes: res.notes, card: res.card, ...(phone ? { text: res.sentence, ok: true } : { text: "✓ " + res.sentence }) });
      render();
      if (phone) deps.refresh(); else deps.reveal([res.id]);
      keepFocus(); setTimeout(keepFocus, 450);
    } catch (e) { msgs.push({ who: "bot", text: "Couldn't save: " + (e.message || e), err: true }); render(); }
    return true;
  }

  async function undo(m) {
    if (!m || !m.ids) return;
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
    msgs.push({ who: "me", text });
    if (/^undo$/i.test(text)) { const m = [...msgs].reverse().find((x) => x.ids && !x.undone); if (m) undo(m); else { msgs.push({ who: "bot", text: "Nothing to undo." }); render(); } return; }
    // Answer to "How much?" — a bare amount fills the waiting entry.
    if (pending && pending.draft.ask.slot === "amount" && /^[\d.,+\s]+(k|l|lakh|lakhs|cr|crore)?$/i.test(text) && parseAmount(normalize(text))) return reply(text);
    // Answer by typing one of the offered choices.
    if (pending && pending.draft.ask.options.length) {
      const hit = pending.draft.ask.options.find(([v, l]) => l.toLowerCase().includes(text.toLowerCase()) || String(v).toLowerCase() === text.toLowerCase());
      if (hit) return reply(hit[0]);
    }
    if (pending) { msgs.push({ who: "bot", text: `Skipped “${pending.draft.raw}”.` }); pending = null; }
    enter(text);
  }
  /** Show a command's answer; changes are undoable and shown in the grid. */
  function reply_(r) {
    r = r || { text: "Done." };
    msgs.push({ who: "bot", rich: true, ...r, ...(r.revert ? { ids: [] } : {}), ...(r.reveal ? { txIds: r.reveal } : {}) });
    render();
    if (r.reveal && r.reveal.length && !phone) deps.reveal(r.reveal); else if (r.changed || r.revert) deps.refresh();
    keepFocus();
  }
  async function command(cmd) {
    if (cmd.kind === "help") return reply_({ title: "Things you can type", examples: HELP });
    try { reply_(await deps.command(cmd)); } catch (e) { msgs.push({ who: "bot", text: "Couldn't do that: " + (e.message || e), err: true }); render(); }
  }
  async function enter(text) {
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
  input.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    e.preventDefault(); e.stopPropagation();
    if (input.value) { input.value = ""; sugEl.innerHTML = ""; } else close();
  });
  render();
  setTimeout(keepFocus, 30);
}

const BUBBLE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16v11H9l-5 4V5Z"/><path d="M8 9.5h8M8 12.5h5"/></svg>';
const SEND = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6"/></svg>';
const MINIMISE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 18h12"/></svg>';
const RESTORE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 15l6-6 6 6"/></svg>';
export const CHAT_ICON = BUBBLE;
