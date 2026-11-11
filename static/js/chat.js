// Chat entry UI: a text box that turns plain sentences into draft cards, then saves them as ordinary records.
// Phone: full-height sheet opened from ＋ in the bottom nav. Desktop: inline box in the Transactions card,
// and the same sheet as a centred dialog on other tabs (press / or Ctrl/⌘+K).
import { parseEntry, answer, ready } from "./parser.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const NATURES = [["variable", "Day to day"], ["recurring", "Monthly fixed"], ["annual", "Annual"], ["oneoff", "One-off"], ["emergency", "Emergency"], ["investment", "Investment"], ["income", "Regular income"], ["income_oneoff", "One-off income"]];
const DIRS = [["out", "Spent"], ["in", "Received"], ["transfer", "Transfer"]];
const EXAMPLES = ["450 swiggy", "spent 1200 on petrol with atlas yesterday", "paid maid", "salary 1.8 lakh on 31 oct", "invested 50k in mutual fund"];

let deps = null;          // { ctx(), save(drafts, raw) -> { ids, summary }, undo(batch), money(n), categories, accounts(), suggestions(prefix) }
const history = [];       // this session: { raw, summary, batch }
let lastBatch = null;

export function initChat(d) { deps = d; }

// ---------------- shared composer ----------------
/**
 * Mount a composer into `host`. opts: { mode: "inline" | "sheet", accountId, onClose }.
 * Returns { focus() }.
 */
export function mountComposer(host, opts = {}) {
  let drafts = [];
  const sheet = opts.mode === "sheet";
  host.classList.add("chat", sheet ? "chat-sheet" : "chat-inline");
  host.innerHTML = `
    ${sheet ? `<div class="chat-thread" aria-live="polite"></div>` : ""}
    <div class="chat-drafts" aria-live="polite"></div>
    <div class="chat-suggest" role="listbox" aria-label="Suggestions"></div>
    ${opts.accountId && sheet ? `<div class="chat-ctx"><span class="chip">on ${esc(acctName(opts.accountId))} <button type="button" class="chip-x" aria-label="Don't default to this account">✕</button></span></div>` : ""}
    <form class="chat-bar" autocomplete="off">
      <span class="chat-ico" aria-hidden="true">✎</span>
      <input class="chat-in" type="text" enterkeyhint="send" aria-label="Type an entry" placeholder="Type an entry… e.g. “450 swiggy, 1200 petrol atlas”">
      ${sheet ? `<button type="submit" class="chat-send primary" aria-label="Preview">➤</button>` : `<kbd class="chat-kbd" title="Press / to type an entry">/</kbd>`}
      ${sheet ? "" : `<button type="button" class="link-btn chat-hist-btn" aria-expanded="false">History</button>`}
    </form>
    ${sheet ? "" : `<div class="chat-hist" hidden></div>`}`;
  const input = host.querySelector(".chat-in"), draftsEl = host.querySelector(".chat-drafts"), sugEl = host.querySelector(".chat-suggest");
  const thread = host.querySelector(".chat-thread"), histEl = host.querySelector(".chat-hist"), histBtn = host.querySelector(".chat-hist-btn");
  let accountId = opts.accountId || null;
  const ctxX = host.querySelector(".chat-ctx .chip-x");
  if (ctxX) ctxX.onclick = () => { accountId = null; host.querySelector(".chat-ctx").remove(); input.focus(); };

  const ctx = () => ({ ...deps.ctx(), ...(accountId ? { defaultAccountId: accountId } : {}) });

  function renderThread() {
    if (!thread) return;
    if (!history.length) {
      thread.innerHTML = `<div class="chat-empty"><p class="muted">Type what you spent or received, in plain words. Nothing leaves your browser unencrypted.</p>
        <div class="chat-examples">${EXAMPLES.map((e) => `<button type="button" class="chip" data-ex="${esc(e)}">${esc(e)}</button>`).join("")}</div></div>`;
      thread.querySelectorAll("[data-ex]").forEach((b) => (b.onclick = () => { input.value = b.dataset.ex; preview(); }));
      return;
    }
    thread.innerHTML = history.map((h, i) => `<div class="msg me">${esc(h.raw)}</div>
      <div class="msg bot${h.undone ? " undone" : ""}">${h.undone ? "Undone" : "✓ " + esc(h.summary)}${!h.undone && h === history[history.length - 1] ? ` <button type="button" class="link-btn" data-undo="${i}">Undo</button>` : ""}</div>`).join("");
    thread.querySelectorAll("[data-undo]").forEach((b) => (b.onclick = () => doUndo()));
    thread.scrollTop = thread.scrollHeight;
  }

  function renderHist() {
    if (!histEl) return;
    const rows = deps.recent(20);
    histEl.innerHTML = `<div class="chat-hist-h"><strong>Typed entries</strong><button type="button" class="link-btn" data-close aria-label="Close history">✕</button></div>
      ${rows.length ? rows.map((r) => `<div class="chat-hist-row"><div class="msg me">${esc(r.raw)}</div><div class="muted">${esc(r.summary)}</div></div>`).join("") : '<p class="muted">Entries you type here will be listed with what they saved.</p>'}
      ${lastBatch ? '<p><button type="button" data-undo>Undo last save</button></p>' : ""}`;
    histEl.querySelector("[data-close]").onclick = () => toggleHist(false);
    const u = histEl.querySelector("[data-undo]"); if (u) u.onclick = () => doUndo();
  }
  function toggleHist(on) {
    if (!histEl) return;
    histEl.hidden = !on; histBtn.setAttribute("aria-expanded", String(on));
    if (on) renderHist();
  }
  if (histBtn) histBtn.onclick = () => toggleHist(histEl.hidden);

  function chipSelect(i, slot, value, options, cls = "") {
    return `<select class="chip ${cls}" data-i="${i}" data-slot="${slot}" aria-label="${slot}">${options.map(([v, l]) => `<option value="${esc(v)}"${String(v) === String(value) ? " selected" : ""}>${esc(l)}</option>`).join("")}</select>`;
  }
  const state = (d, slot) => (d.slots[slot] === "missing" ? "missing" : d.slots[slot] === "inferred" ? "inferred" : "");

  function renderDrafts() {
    if (!drafts.length) { draftsEl.innerHTML = ""; host.classList.remove("has-drafts"); return; }
    host.classList.add("has-drafts");
    const accts = deps.accounts().map((a) => [a.id, a.name]);
    const cats = deps.categories.map((c) => [c, c]);
    const allReady = drafts.every(ready);
    draftsEl.innerHTML = `<div class="chat-card">
      <div class="chat-card-h"><span>${drafts.length === 1 ? "Preview" : `${drafts.length} entries`}</span><span class="spacer"></span>
        <button type="button" class="primary chat-save"${allReady ? "" : " disabled"}>${drafts.length > 1 ? "Save all" : "Save"} <kbd>⏎</kbd></button></div>
      ${drafts.map((d, i) => {
        const amt = d.amount == null ? "" : String(d.amount);
        return `<div class="chat-draft${ready(d) ? "" : " incomplete"}" data-i="${i}">
          <div class="cd-main">
            <span class="cd-sign ${d.direction === "in" ? "good" : ""}">${d.direction === "in" ? "+" : d.direction === "transfer" ? "⇄" : "−"}</span>
            <input class="cd-amt ${state(d, "amount")}" data-i="${i}" data-slot="amount" inputmode="decimal" value="${esc(amt)}" placeholder="Amount" aria-label="Amount" size="8">
            <input class="cd-desc" data-i="${i}" data-slot="description" value="${esc(d.description)}" placeholder="Description" aria-label="Description">
            <button type="button" class="chip-x" data-drop="${i}" aria-label="Remove this entry">✕</button>
          </div>
          <div class="cd-chips">
            ${chipSelect(i, "direction", d.direction, DIRS)}
            ${chipSelect(i, "account_id", d.account_id, [["", "Account?"], ...accts], state(d, "account"))}
            ${d.direction === "transfer" ? `<span class="muted">→</span>${d.new_account ? `<span class="chip">${esc(d.new_account.name)} (new)</span>` : chipSelect(i, "to_account_id", d.to_account_id, [["", "To?"], ...accts.filter(([v]) => v !== d.account_id)], state(d, "to_account"))}` : ""}
            <input type="date" class="chip ${state(d, "date")}" data-i="${i}" data-slot="date" value="${esc(d.date)}" aria-label="Date">
            ${d.direction === "transfer" ? "" : chipSelect(i, "category", d.category, [["", "Category?"], ...cats], state(d, "category"))}
            ${chipSelect(i, "nature", d.nature, NATURES)}
            ${d.recurring_id || d.annual_id || d.income_id ? `<span class="chip linked" title="Linked to your plan">🔗 ${esc(d.recurring_id ? "Monthly" : d.annual_id ? "Annual" : "Income")}</span>` : ""}
            ${d.warn ? `<span class="chip warn">⚠ ${esc(d.warn)}</span>` : ""}
            ${d.future ?'<span class="chip inferred" title="Dated in the future">Upcoming</span>' : ""}
            ${d.approx_date ? '<span class="chip inferred" title="No exact day given">Month total</span>' : ""}
          </div>
          ${d.ask ? `<div class="cd-ask"><span>${esc(d.ask.text)}</span>${d.ask.slot === "amount" ? "" : d.ask.options.map(([v, l]) => `<button type="button" class="chip" data-ans="${esc(v)}" data-i="${i}">${esc(l)}</button>`).join("")}</div>` : ""}
        </div>`;
      }).join("")}
    </div>`;
    draftsEl.querySelectorAll("[data-slot]").forEach((el) => (el.onchange = () => edit(+el.dataset.i, el.dataset.slot, el.value)));
    draftsEl.querySelectorAll("[data-drop]").forEach((b) => (b.onclick = () => { drafts.splice(+b.dataset.drop, 1); renderDrafts(); input.focus(); }));
    draftsEl.querySelectorAll("[data-ans]").forEach((b) => (b.onclick = () => {
      const i = +b.dataset.i;
      drafts[i] = answer(drafts[i], drafts[i].ask.slot, b.dataset.ans, ctx());
      renderDrafts(); focusNext();
    }));
    draftsEl.querySelector(".chat-save").onclick = () => saveAll();
  }

  function edit(i, slot, value) {
    const d = { ...drafts[i], slots: { ...drafts[i].slots } };
    if (slot === "amount") { const n = parseFloat(String(value).replace(/[,\s₹]/g, "")); d.amount = Number.isFinite(n) ? n : null; d.slots.amount = d.amount == null ? "missing" : "explicit"; }
    else if (slot === "account_id") { d.account_id = value; d.slots.account = value ? "explicit" : "missing"; }
    else if (slot === "to_account_id") { d.to_account_id = value; d.slots.to_account = value ? "explicit" : "missing"; }
    else if (slot === "category") { d.category = value; d.slots.category = value ? "explicit" : "missing"; }
    else if (slot === "date") { d.date = value; d.slots.date = "explicit"; d.approx_date = false; d.period = null; d.future = value > deps.ctx().today; }
    else if (slot === "direction") {
      d.direction = value;
      if (value === "in" && !/^income/.test(d.nature)) d.nature = "income_oneoff";
      if (value !== "in" && /^income/.test(d.nature)) d.nature = "variable";
      if (value === "transfer") { d.slots.to_account = d.to_account_id ? d.slots.to_account : "missing"; d.category = d.category || "Other"; }
      if (value !== "transfer") { d.to_account_id = ""; d.new_account = null; }
      if (value === "in" && !d.category) { d.category = "Other"; d.slots.category = "inferred"; }
    }
    else d[slot] = value;
    // An answer through a chip closes the matching question.
    const closes = { amount: "amount", account_id: "account", to_account_id: "to_account", category: "category", direction: "direction" }[slot];
    if (d.ask && d.ask.slot === closes) d.ask = null;
    // Still-open questions stay; otherwise re-check what's missing.
    drafts[i] = d.ask ? d : answer(d, "_", null, ctx());
    renderDrafts();
  }

  function focusNext() {
    const bad = draftsEl.querySelector(".chat-draft.incomplete");
    if (!bad) { input.focus(); return false; }
    const target = bad.querySelector(".cd-ask .chip, .missing");
    (target || bad.querySelector("input,select")).focus();
    return true;
  }

  function preview() {
    const text = input.value.trim();
    if (!text) return;
    if (/^undo$/i.test(text)) { input.value = ""; doUndo(); return; }
    drafts = [...drafts, ...parseEntry(text, ctx())];
    input.value = ""; sugEl.innerHTML = "";
    renderDrafts();
    if (!drafts.every(ready)) focusNext(); else input.focus();
  }

  async function saveAll() {
    if (!drafts.length) return;
    if (!drafts.every(ready)) { focusNext(); return; }
    const btn = draftsEl.querySelector(".chat-save"); if (btn) btn.disabled = true;
    try {
      const raw = [...new Set(drafts.map((d) => d.raw))].join(", ");
      const res = await deps.save(drafts, raw);
      lastBatch = res.batch;
      history.push({ raw, summary: res.summary, batch: res.batch });
      drafts = []; renderDrafts(); renderThread();
      if (histEl && !histEl.hidden) renderHist();
      // In the sheet the thread already shows "✓ … Undo"; a toast would cover the drafts.
      if (!sheet) toast(`Saved ${res.summary}`, "Undo", doUndo);
      input.focus();
    } catch (e) {
      if (btn) btn.disabled = false;
      toast(e.message || String(e));
    }
  }

  async function doUndo() {
    if (!lastBatch) { toast("Nothing to undo"); return; }
    const b = lastBatch; lastBatch = null;
    await deps.undo(b);
    const h = history.find((x) => x.batch === b); if (h) h.undone = true;
    renderThread(); if (histEl && !histEl.hidden) renderHist();
    if (!sheet) toast("Undone");
  }

  // Suggestions for the word being typed: accounts, planned items, past descriptions.
  function suggest() {
    const v = input.value, m = /(\S+)$/.exec(v);
    const word = m ? m[1].toLowerCase() : "";
    if (word.length < 2 || /^\d/.test(word)) { sugEl.innerHTML = ""; return; }
    const list = deps.suggestions(word).slice(0, 6);
    sugEl.innerHTML = list.map((s) => `<button type="button" class="chip" role="option" data-sug="${esc(s)}">${esc(s)}</button>`).join("");
    sugEl.querySelectorAll("[data-sug]").forEach((b) => (b.onmousedown = (e) => e.preventDefault()));
    sugEl.querySelectorAll("[data-sug]").forEach((b) => (b.onclick = () => {
      input.value = v.slice(0, v.length - word.length) + b.dataset.sug.toLowerCase() + " ";
      sugEl.innerHTML = ""; input.focus();
    }));
  }

  host.querySelector("form").onsubmit = (e) => { e.preventDefault(); if (input.value.trim()) preview(); else saveAll(); };
  input.addEventListener("input", suggest);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (input.value) input.value = "";
      else if (drafts.length) { drafts = []; renderDrafts(); }
      else if (opts.onClose) opts.onClose();
      else input.blur();
      sugEl.innerHTML = ""; e.preventDefault(); e.stopPropagation();
    }
  });
  // Enter inside a chip saves when everything is filled in.
  draftsEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.tagName !== "BUTTON") { e.preventDefault(); e.target.dispatchEvent(new Event("change")); setTimeout(() => (drafts.every(ready) ? saveAll() : focusNext()), 0); }
    if (e.key === "Escape") { e.preventDefault(); input.focus(); }
  });
  renderThread();
  return { focus: () => input.focus(), host };
}

// ---------------- sheet / dialog ----------------
let openSheet = null;
export function openChatSheet({ accountId } = {}) {
  if (openSheet) { openSheet.focus(); return; }
  const back = document.createElement("div");
  back.className = "ml-back chat-back";
  back.innerHTML = `<div class="ml-sheet chat-panel" role="dialog" aria-modal="true" aria-label="Add entries">
    <div class="ml-grab" aria-hidden="true"></div>
    <div class="chat-panel-h"><strong>Add entries</strong><span class="spacer"></span><button type="button" class="link-btn chat-close" aria-label="Close">✕</button></div>
    <div class="chat-host"></div></div>`;
  document.body.appendChild(back); document.body.classList.add("ml-open");
  const prevFocus = document.activeElement;
  const close = () => {
    back.remove(); document.body.classList.remove("ml-open"); openSheet = null;
    window.visualViewport && window.visualViewport.removeEventListener("resize", fit);
    deps.onClose && deps.onClose();
    if (prevFocus && prevFocus.focus) prevFocus.focus();
  };
  back.addEventListener("click", (e) => { if (e.target === back) close(); });
  back.querySelector(".chat-close").onclick = close;
  // Swipe down on the grab handle / header to close.
  let y0 = null;
  const head = back.querySelector(".ml-grab");
  head.addEventListener("touchstart", (e) => { y0 = e.touches[0].clientY; }, { passive: true });
  head.addEventListener("touchend", (e) => { if (y0 != null && e.changedTouches[0].clientY - y0 > 60) close(); y0 = null; });
  // Keep the text box above the on-screen keyboard.
  const panel = back.querySelector(".chat-panel");
  const fit = () => { const vv = window.visualViewport; if (vv) panel.style.height = Math.round(vv.height - 8) + "px"; };
  if (window.visualViewport && window.matchMedia("(max-width: 640px)").matches) { window.visualViewport.addEventListener("resize", fit); fit(); }
  const c = mountComposer(back.querySelector(".chat-host"), { mode: "sheet", accountId, onClose: close });
  openSheet = c;
  setTimeout(() => c.focus(), 50);
  return c;
}

// ---------------- toast ----------------
let toastEl = null, toastTimer = null;
export function toast(msg, action, fn) {
  if (!toastEl) { toastEl = document.createElement("div"); toastEl.className = "ml-toast chat-toast"; toastEl.setAttribute("role", "status"); document.body.appendChild(toastEl); }
  toastEl.innerHTML = `<span>${esc(msg)}</span>${action ? `<button type="button" class="link">${esc(action)}</button>` : ""}`;
  toastEl.hidden = false;
  if (action) toastEl.querySelector("button").onclick = () => { toastEl.hidden = true; fn(); };
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { toastEl.hidden = true; }, action ? 6000 : 2000);
}

function acctName(id) { const a = deps.accounts().find((x) => x.id === id); return a ? a.name : ""; }
