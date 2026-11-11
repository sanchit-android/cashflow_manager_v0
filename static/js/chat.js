// Chat entry: type a sentence, it's saved straight away, and the new row flashes in the grid.
// Corrections happen in the grid itself. The chat only stops to ask when it can't save at all
// (no amount, a transfer with nowhere to go, "rent" that could be money in or out).
// Desktop: a floating chat window you can drag by its header, or minimise to just the header at the bottom right. Phone: a full-height sheet that confirms each
// entry in a plain sentence (with any warnings) and stays in the chat instead of jumping to the grid.
import { parseEntry, answer, parseAmount, normalize, splitEntries, parseAddTo } from "./parser.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const EXAMPLES = ["450 swiggy", "1200 petrol with atlas yesterday", "paid maid", "salary 1.8 lakh on 31 oct", "invested 50k in mutual fund"];
const isPhone = () => window.matchMedia("(max-width: 640px)").matches;

// deps: { ctx(), save(drafts) -> { ids, txIds, summaries, sentences, notes }, undo(ids), reveal(txIds), refresh(), suggestions(prefix),
//         addTo(target, amount) -> { skip } | { none, month } | { id, before, sentence, notes }, restore(id, before) }
let deps = null;
// The conversation lives for the whole session, across opening and closing.
const msgs = [];          // { who: "me" | "bot", text, ids?, txIds?, undone?, ask?, ok?, notes?, restore? }
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
      <span class="chat-head-hint">Saved as you press Enter · fix anything in the grid</span>
      ${phone ? "" : `<button type="button" class="chat-x chat-min" aria-label="Minimise chat" title="Minimise">${MINIMISE}</button>`}
      <button type="button" class="chat-x chat-close" aria-label="Close chat" title="Close">✕</button></header>
    <div class="chat-thread" aria-live="polite"></div>
    <div class="chat-suggest" aria-label="Suggestions"></div>
    <form class="chat-bar" autocomplete="off">
      <input class="chat-in" type="text" enterkeyhint="send" aria-label="Type an entry" placeholder="Type an entry… e.g. “450 swiggy, 1200 petrol atlas”">
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
    wrap.querySelector(".chat-min").onclick = () => setMini(!mini);
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
      thread.innerHTML = `<div class="chat-empty"><p>Type what you spent or received, in plain words. It's saved straight away and ${phone ? "I'll confirm what was added" : "highlighted in the grid"}.</p>
        <div class="chat-examples">${EXAMPLES.map((e) => `<button type="button" class="chat-chip" data-ex="${esc(e)}">${esc(e)}</button>`).join("")}</div></div>`;
      thread.querySelectorAll("[data-ex]").forEach((b) => (b.onclick = () => { input.value = b.dataset.ex; keepFocus(); }));
      place();
      return;
    }
    const lastSaved = [...msgs].reverse().find((m) => m.ids && !m.undone);
    thread.innerHTML = msgs.map((m, i) => m.who === "me"
      ? `<div class="msg me">${esc(m.text)}</div>`
      : `<div class="msg bot${m.undone ? " undone" : ""}${m.err ? " err" : ""}">
          ${m.ok ? `<strong class="msg-ok">${m.notes && m.notes.length ? "✓ Confirmed, with a note" : "✓ Confirmed"}</strong> ` : ""}${m.txIds && !m.undone ? `<button type="button" class="msg-link" data-show="${i}" title="Show in the grid">${esc(m.text)}</button>` : esc(m.text)}
          ${(m.notes || []).map((n) => `<div class="msg-warn">⚠ ${esc(n)}</div>`).join("")}
          ${m === lastSaved ? ` <button type="button" class="msg-undo" data-undo="${i}">Undo</button>` : ""}
          ${m.ask && pending && m === msgs[msgs.length - 1] && m.ask.options.length ? `<div class="msg-chips">${m.ask.options.map(([v, l]) => `<button type="button" class="chat-chip" data-ans="${esc(v)}">${esc(l)}</button>`).join("")}</div>` : ""}
        </div>`).join("");
    thread.querySelectorAll("[data-show]").forEach((b) => (b.onclick = () => {
      const ids = msgs[+b.dataset.show].txIds;
      if (phone) close(); // the sheet covers the grid
      deps.reveal(ids); if (!phone) keepFocus();
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
      res.summaries.forEach((s, i) => msgs.push({ who: "bot", ids: i === res.summaries.length - 1 ? res.ids : null, txIds: [res.txIds[i]],
        notes: res.notes[i], ...(phone ? { text: res.sentences[i], ok: true } : { text: "✓ " + s }) }));
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
      const res = await deps.addTo(hit.target, hit.amount);
      if (res.skip) return false;
      if (res.none) { msgs.push({ who: "bot", err: true, text: `Nothing was changed. I couldn't find a row matching “${hit.target}” in ${res.month}. To add it as a new entry, type “${hit.amount} ${hit.target}”.` }); render(); return true; }
      msgs.push({ who: "bot", ids: [], txIds: [res.id], restore: { id: res.id, before: res.before }, notes: res.notes, ...(phone ? { text: res.sentence, ok: true } : { text: "✓ " + res.sentence }) });
      render();
      if (phone) deps.refresh(); else deps.reveal([res.id]);
      keepFocus(); setTimeout(keepFocus, 450);
    } catch (e) { msgs.push({ who: "bot", text: "Couldn't save: " + (e.message || e), err: true }); render(); }
    return true;
  }

  async function undo(m) {
    if (!m || !m.ids) return;
    if (m.restore) await deps.restore(m.restore.id, m.restore.before); else await deps.undo(m.ids);
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
  async function enter(text) {
    const rest = [];
    for (const piece of splitEntries(text)) {
      const hit = parseAddTo(piece);
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
