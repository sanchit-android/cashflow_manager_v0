// Excel-like grid. One component used by every editable table in the app.
//
// Ready mode: arrows/Tab/Enter move the active cell; typing starts editing; F2 or double-click edits in place.
// Edit mode: Enter/Tab/Up/Down commit and move; Esc cancels; Left/Right move the caret (after F2) or commit
// and move (after typing over a cell) — the same two modes Excel has.
// Shortcuts: Ctrl+C/X/V (works with Excel ranges), Ctrl+D fill down, Ctrl+Z undo, Delete clears,
// Ctrl+; today, Ctrl+- delete row, Ctrl+arrows/Home/End/PageUp/PageDown, Alt+Down opens a list.
import { formatAmount, formatDate, parseAmountInput, parseDateInput, normDesc } from "./cells.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const letter = (i) => String.fromCharCode(65 + i);

/**
 * cfg: {
 *   columns: [{ key, label, type: text|date|number|select|readonly, width, options: () => [[value,label]],
 *               render(row) (readonly), readonlyIf(data), autocomplete: true }],
 *   rows: [{ id, ...data }], blankRows = 10, newRow: () => defaults, meaningful: (data) => bool,
 *   save: async (id|null, data) => id, remove: async (id) => void, period: () => "YYYY-MM",
 *   suggest: { complete(prefix), infer(desc) } (optional), autofillKeys: [...], onChange: () => void
 * }
 */
/** Phones get a touch list with an edit sheet; wider screens get the spreadsheet. */
export const isPhone = () => window.matchMedia("(max-width: 640px)").matches;
export function mountGrid(host, cfg) { return isPhone() ? mountList(host, cfg) : mountSheet(host, cfg); }

function mountSheet(host, cfg) {
  const cols = [...cfg.columns, { key: "__del", label: "", type: "delete", width: 34 }];
  const blankN = cfg.blankRows ?? 10;
  // `all` holds every row (records, half-typed rows, blanks); `rows` is what's on screen after filters and sort.
  const all = cfg.rows.map(({ id, ...data }) => ({ id, data, touched: new Set() }));
  const roRows = (cfg.readonlyRows || []).map((data) => ({ id: null, data, touched: new Set(), ro: true }));
  let rows = [], filters = {}, sort = null;
  const undo = [];
  let active = { r: 0, c: 0 }, anchor = { r: 0, c: 0 }, editing = null, dragging = false;
  let queue = Promise.resolve(), changeTimer = null;

  const blank = () => ({ id: null, data: {}, touched: new Set() });
  const isBlank = (row) => !row.id && !row.ro && !Object.keys(row.data).length;
  function ensureBlanks() {
    for (let n = all.filter(isBlank).length; n < blankN; n++) all.push(blank());
  }
  /** Add any new blank rows to the end of the view without reordering what's on screen. */
  function syncBlanks() { const added = []; for (const b of all.filter(isBlank)) if (!rows.includes(b)) { rows.push(b); added.push(b); } return added; }
  function computeView() {
    const filled = all.filter((r) => !isBlank(r));
    let vis = filled.filter((r) => !r.id || passes(r));
    if (sort) {
      const col = cols.find((c) => c.key === sort.key);
      const keyOf = (r) => { const v = r.data[sort.key]; return col.type === "number" ? (v === null || v === undefined || v === "" ? -Infinity : +v) : col.type === "select" ? optionLabel(col, v).toLowerCase() : String(v ?? "").toLowerCase(); };
      const saved = vis.filter((r) => r.id), pending = vis.filter((r) => !r.id);
      saved.sort((a, b) => { const x = keyOf(a), y = keyOf(b); return (x < y ? -1 : x > y ? 1 : 0) * sort.dir; });
      vis = [...saved, ...pending];
    }
    rows = [...roRows, ...vis, ...all.filter(isBlank)];
  }
  ensureBlanks();

  host.innerHTML = `<div class="xl" tabindex="0" role="grid" aria-label="${esc(cfg.label || "Spreadsheet")}">
    <div class="xl-fbar"><span class="xl-name" aria-label="Active cell"></span><span class="xl-fx">fx</span>
      <input class="xl-formula" aria-label="Cell contents" spellcheck="false"></div>
    <div class="xl-scroll"><table class="xl-table"><colgroup><col style="width:44px">${cols.map((c) => `<col style="width:${c.width || 120}px">`).join("")}</colgroup>
      <thead><tr class="xl-letters"><th class="xl-corner"></th>${cols.map((c, i) => `<th>${c.type === "delete" ? "" : letter(i)}</th>`).join("")}</tr>
      <tr class="xl-labels"><th class="xl-corner"></th>${cols.map((c, i) => c.type === "delete" ? "<th></th>" : `<th><span class="xl-lbl">${esc(c.label)}</span>${c.type !== "readonly" ? `<button type="button" class="xl-fbtn" data-fc="${i}" aria-label="Filter and sort ${esc(c.label)}" title="Filter and sort">▾</button>` : ""}<span class="xl-rs" data-rc="${i}" title="Drag to resize"></span></th>`).join("")}</tr></thead><tbody></tbody></table></div>
    <div class="xl-status"><span class="xl-msg">Ready</span><span class="xl-agg"></span></div></div>`;
  const root = host.querySelector(".xl"), tbody = host.querySelector("tbody"), fbar = host.querySelector(".xl-formula");
  const nameBox = host.querySelector(".xl-name"), msgEl = host.querySelector(".xl-msg"), aggEl = host.querySelector(".xl-agg");

  // ---------- display ----------
  const optionLabel = (col, v) => { const o = col.options().find(([x]) => String(x) === String(v ?? "")); return o ? o[1] : ""; };
  const valueFor = (row, col) => row.data[col.key];
  const readOnly = (row, col) => row.ro || col.type === "readonly" || (col.readonlyIf && col.readonlyIf(row.data));
  function cellHTML(row, col, r) {
    if (col.type === "delete") return row.ro ? "" : `<span class="xl-x" title="Delete row (Enter)">✕</span>`;
    if (col.type === "readonly") return row.id ? col.render(row) : "";
    if (col.display) { const d = col.display(row.data); if (d !== null && d !== undefined) return esc(d); }
    const v = valueFor(row, col);
    if (col.type === "date") {
      if (v) return esc(formatDate(v));
      return !row.id && cfg.newRow ? `<span class="xl-ghost">${esc(formatDate(cfg.newRow().date || ""))}</span>` : "";
    }
    if (col.type === "number") {
      if (v === null || v === undefined || v === "") return "";
      return `<span class="${v < 0 ? "xl-neg" : ""}">${esc(formatAmount(v))}</span>${row.data[col.key + "_formula"] ? '<span class="xl-fmark" title="Formula"></span>' : ""}`;
    }
    if (col.type === "select") {
      const val = v ?? (row.id || Object.keys(row.data).length ? (cfg.newRow ? cfg.newRow()[col.key] : "") : "");
      const lbl = optionLabel(col, val);
      return (col.icon && lbl ? col.icon(val) : "") + esc(lbl);
    }
    return esc(v);
  }
  function rowHTML(row, r) {
    return `<tr data-r="${r}" class="${row.ro ? "xl-rorow" : row.id ? "" : "xl-blank"}" ${row.ro ? 'title="Calculated — read only"' : ""}><th class="xl-rn">${r + 1}</th>${cols.map((col, c) =>
      `<td data-c="${c}" class="xl-${col.type}${readOnly(row, col) ? " xl-ro" : ""}">${cellHTML(row, col, r)}</td>`).join("")}</tr>`;
  }
  function renderBody(recompute = false) { if (recompute) computeView(); tbody.innerHTML = rows.map(rowHTML).join(""); paint(); filterStatus(); }
  function renderRow(r) { const tr = tbody.children[r]; if (tr) tr.outerHTML = rowHTML(rows[r], r); paint(); }
  const td = (r, c) => tbody.children[r]?.children[c + 1];

  function rawText(row, col) {
    const v = valueFor(row, col);
    if (col.type === "number") return row.data[col.key + "_formula"] || (v ?? "");
    if (col.type === "date") return v ? formatDate(v) : "";
    if (col.type === "select") return optionLabel(col, v);
    if (col.type === "readonly" || col.type === "delete") return "";
    return v ?? "";
  }

  const range = () => ({ r1: Math.min(active.r, anchor.r), r2: Math.max(active.r, anchor.r), c1: Math.min(active.c, anchor.c), c2: Math.max(active.c, anchor.c) });
  function paint() {
    tbody.querySelectorAll(".xl-active,.xl-insel").forEach((e) => e.classList.remove("xl-active", "xl-insel"));
    host.querySelectorAll("thead .xl-hl, .xl-rn.xl-hl").forEach((e) => e.classList.remove("xl-hl"));
    const { r1, r2, c1, c2 } = range();
    for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) td(r, c)?.classList.add("xl-insel");
    const a = td(active.r, active.c);
    if (a) { a.classList.add("xl-active"); if (host.contains(document.activeElement)) a.scrollIntoView({ block: "nearest", inline: "nearest" }); }
    for (let c = c1; c <= c2; c++) host.querySelectorAll(`thead tr th:nth-child(${c + 2})`).forEach((e) => e.classList.add("xl-hl"));
    for (let r = r1; r <= r2; r++) tbody.children[r]?.firstElementChild.classList.add("xl-hl");
    const col = cols[active.c];
    nameBox.textContent = col.type === "delete" ? `Row ${active.r + 1}` : `${letter(active.c)}${active.r + 1}`;
    if (document.activeElement !== fbar) fbar.value = col.type === "delete" ? "Press Enter to delete this row" : rawText(rows[active.r], col);
    fbar.readOnly = readOnly(rows[active.r], col) || col.type === "delete";
    // Excel-style aggregate of the selected numbers
    let sum = 0, count = 0, nums = 0;
    for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) {
      const cc = cols[c], v = valueFor(rows[r], cc);
      if (cc.type === "delete" || cc.type === "readonly") continue;
      if (v !== undefined && v !== null && v !== "") count++;
      if (cc.type === "number" && Number.isFinite(+v) && v !== null && v !== "") { sum += +v; nums++; }
    }
    aggEl.textContent = (r2 > r1 || c2 > c1) && count ? (nums ? `Average: ${formatAmount(Math.round((sum / nums) * 100) / 100)}   Count: ${count}   Sum: ${formatAmount(Math.round(sum * 100) / 100)}` : `Count: ${count}`) : "";
  }
  const say = (m, bad) => { msgEl.textContent = m; msgEl.classList.toggle("xl-bad", !!bad); };

  // ---------- movement ----------
  const lastC = cols.length - 1;
  const lastDataRow = () => { for (let i = rows.length - 1; i >= 0; i--) if (!isBlank(rows[i])) return i; return 0; };
  function moveTo(r, c, extend = false) {
    active = { r: Math.max(0, Math.min(rows.length - 1, r)), c: Math.max(0, Math.min(lastC, c)) };
    if (!extend) anchor = { ...active };
    paint();
  }
  function step(dr, dc, extend = false) {
    let { r, c } = active;
    if (dc === 1 && c === lastC && !extend) { if (r < rows.length - 1) return moveTo(r + 1, 0); return; }
    if (dc === -1 && c === 0 && !extend) { if (r > 0) return moveTo(r - 1, lastC); return; }
    moveTo(r + dr, c + dc, extend);
  }

  // ---------- saving ----------
  const defaults = () => (cfg.newRow ? cfg.newRow() : {});
  const scheduleChange = () => { clearTimeout(changeTimer); changeTimer = setTimeout(() => cfg.onChange && cfg.onChange(), 250); };
  function persist(row, before, record = true) {
    const snapshot = { ...row.data };
    queue = queue.then(async () => {
      try {
        say("Saving…");
        if (row.id) {
          await cfg.save(row.id, snapshot);
          if (record) undo.push({ t: "edit", row, before });
        } else if (!cfg.meaningful || cfg.meaningful(snapshot)) {
          row.id = await cfg.save(null, snapshot);
          if (record) undo.push({ t: "create", row });
          // Don't redraw the grid here: the user may already be typing in the next cell.
          ensureBlanks();
          const added = syncBlanks(), r = rows.indexOf(row);
          if (r >= 0 && tbody.children[r]) tbody.children[r].classList.remove("xl-blank");
          if (added.length) tbody.insertAdjacentHTML("beforeend", added.map((b) => rowHTML(b, rows.indexOf(b))).join(""));
          paint();
        } else { say("Ready"); return; }
        say("Saved");
        scheduleChange();
      } catch (e) { say("Couldn't save: " + e.message, true); }
    });
    return queue;
  }

  /** Apply a patch to row r (and autofill from the description), update the display, save. */
  function apply(r, patch, { record = true, autofill = true } = {}) {
    const row = rows[r];
    const before = { ...row.data };
    if (!row.id && !Object.keys(row.data).length) row.data = { ...defaults() };
    Object.assign(row.data, patch);
    for (const k of Object.keys(patch)) row.touched.add(k);
    let filled = [];
    const ak = cfg.columns.find((c) => c.autocomplete)?.key;
    if (autofill && cfg.suggest && ak && ak in patch && patch[ak]) {
      const inferred = cfg.suggest.infer(patch[ak]);
      if (inferred) for (const [k, v] of Object.entries(inferred)) {
        const userSet = row.touched.has(k) && !(k in patch);
        const isDefault = row.data[k] === undefined || row.data[k] === "" || row.data[k] === null || row.data[k] === defaults()[k];
        if (!userSet && (!row.id || isDefault || normDesc(before[ak]) === "") && row.data[k] !== v) { row.data[k] = v; filled.push(k); }
      }
    }
    renderRow(r);
    if (filled.length) say(`Filled ${filled.map((k) => (cfg.columns.find((c) => c.key === k) || { label: k }).label.toLowerCase()).join(", ")} from earlier "${patch[ak]}"`);
    return persist(row, before, record);
  }

  /** Turn typed text into a value for a column. Throws a friendly error on bad input. */
  function parseFor(col, text) {
    const s = String(text ?? "");
    if (col.type === "number") { const p = parseAmountInput(s); return { [col.key]: p ? p.value : null, [col.key + "_formula"]: p ? p.formula : null }; }
    if (col.type === "date") {
      const d = parseDateInput(s, cfg.period && cfg.period());
      if (!d) throw new Error("Enter a date like 5, 5/10, 05-10-2026 or t for today");
      return { [col.key]: d };
    }
    if (col.type === "select") {
      const t = s.trim().toLowerCase();
      const o = col.options().find(([v, l]) => String(l).toLowerCase() === t || String(v).toLowerCase() === t)
        || col.options().find(([, l]) => t && String(l).toLowerCase().startsWith(t));
      if (!o) throw new Error(`Pick one of: ${col.options().map(([, l]) => l).filter(Boolean).slice(0, 6).join(", ")}…`);
      return { [col.key]: o[0] };
    }
    return { [col.key]: s.trim() };
  }

  async function deleteRow(r) {
    const row = rows[r];
    if (!row || isBlank(row) || row.ro) return;
    if (!row.id) { row.data = {}; row.touched.clear(); renderRow(r); return; }
    const data = { ...row.data }, id = row.id;
    const ai = all.indexOf(row);
    rows.splice(r, 1); all.splice(ai, 1); ensureBlanks(); syncBlanks(); renderBody(); moveTo(r, 0);
    queue = queue.then(async () => {
      try { await cfg.remove(id); undo.push({ t: "delete", data, index: r }); say("Row deleted. Ctrl+Z brings it back."); scheduleChange(); }
      catch (e) { const back = { id, data, touched: new Set() }; rows.splice(r, 0, back); all.splice(Math.max(0, ai), 0, back); renderBody(); moveTo(r, active.c); say("Couldn't delete: " + e.message, true); }
    });
  }

  async function doUndo() {
    const u = undo.pop();
    if (!u) return say("Nothing to undo");
    const items = u.t === "batch" ? [...u.items].reverse() : [u];
    for (const it of items) {
      if (it.t === "edit") { const r = rows.indexOf(it.row); if (r >= 0) { it.row.data = { ...it.before }; renderRow(r); await persist(it.row, null, false); } }
      if (it.t === "create") { await cfg.remove(it.row.id); all.splice(all.indexOf(it.row), 1); ensureBlanks(); renderBody(true); }
      if (it.t === "delete") { const row = { id: null, data: { ...it.data }, touched: new Set() }; all.splice(Math.min(it.index, all.length), 0, row); renderBody(true); await persist(row, null, false); }
    }
    scheduleChange(); say("Undone");
  }

  /** Several cell writes as one undo step. cells: [[r, c, patch]] */
  async function applyMany(cells, label) {
    const batch = { t: "batch", items: [] };
    for (const [r, c, patch] of cells) {
      const before = undo.length;
      await apply(r, patch, { autofill: cols[c].autocomplete });
      while (undo.length > before) batch.items.push(undo.pop());
    }
    if (batch.items.length) undo.push(batch);
    say(label);
  }

  // ---------- editing ----------
  function startEdit(mode, initial) {
    const row = rows[active.r], col = cols[active.c];
    if (col.type === "delete" || readOnly(row, col)) return;
    const cell = td(active.r, active.c);
    const original = rawText(row, col);
    editing = { r: active.r, c: active.c, mode, col };
    if (col.type === "select") return openList(cell, col, initial ?? "");
    const input = document.createElement("input");
    input.className = "xl-editor"; input.spellcheck = false;
    input.value = initial !== undefined ? initial : col.type === "date" && !row.data[col.key] ? "" : original;
    cell.appendChild(input); input.focus();
    if (initial === undefined) input.setSelectionRange(input.value.length, input.value.length);
    editing.el = input;
    if (col.autocomplete && cfg.suggest) input.addEventListener("input", (e) => {
      if (!e.inputType || !e.inputType.startsWith("insert")) return;
      const typed = input.value, full = cfg.suggest.complete(typed);
      // Take the saved entry's casing, like Excel.
      if (full && full.toLowerCase().startsWith(typed.toLowerCase())) { input.value = full; input.setSelectionRange(typed.length, full.length); }
    });
    input.addEventListener("keydown", (e) => editorKey(e, input));
    input.addEventListener("blur", () => { if (editing && editing.el === input) commit(input.value, 0, 0); });
    fbar.value = input.value;
    input.addEventListener("input", () => { fbar.value = input.value; });
  }

  function openList(cell, col, filter) {
    const box = document.createElement("div");
    box.className = "xl-list";
    box.innerHTML = `<input class="xl-editor xl-listinput" spellcheck="false" aria-label="Filter ${esc(col.label)}">`;
    cell.appendChild(box);
    const input = box.querySelector("input");
    // The list floats above the page (cells clip their content), below the cell or above it if there's no room.
    const opts = document.createElement("div");
    opts.className = "xl-opts"; opts.setAttribute("role", "listbox");
    document.body.appendChild(opts);
    const place = () => {
      const r = cell.getBoundingClientRect(), h = Math.min(220, opts.scrollHeight || 220);
      const below = window.innerHeight - r.bottom >= h + 8 || r.top < h + 8;
      opts.style.left = Math.max(4, Math.min(r.left - 1, window.innerWidth - opts.offsetWidth - 4)) + "px";
      opts.style.minWidth = r.width + 2 + "px";
      opts.style.top = (below ? r.bottom : r.top - h) + "px";
    };
    const reposition = () => { if (opts.isConnected) place(); };
    window.addEventListener("scroll", reposition, true); window.addEventListener("resize", reposition);
    editing.cleanup = () => { opts.remove(); window.removeEventListener("scroll", reposition, true); window.removeEventListener("resize", reposition); };
    const current = String(rows[editing.r].data[col.key] ?? (cfg.newRow ? cfg.newRow()[col.key] ?? "" : ""));
    let hi = 0, shown = [];
    const draw = () => {
      const t = input.value.trim().toLowerCase();
      shown = col.options().filter(([, l]) => !t || String(l).toLowerCase().includes(t));
      shown.sort((a, b) => (String(b[1]).toLowerCase().startsWith(t) ? 1 : 0) - (String(a[1]).toLowerCase().startsWith(t) ? 1 : 0));
      hi = Math.max(0, Math.min(hi, shown.length - 1));
      opts.innerHTML = shown.map(([v, l], i) => `<div class="xl-opt${i === hi ? " on" : ""}" role="option" data-i="${i}">${col.icon && l ? col.icon(v) : ""}${esc(l) || "&nbsp;"}</div>`).join("") || '<div class="xl-opt xl-ghost">No match</div>';
      place();
      const on = opts.querySelector(".on"); if (on) { if (on.offsetTop < opts.scrollTop) opts.scrollTop = on.offsetTop; else if (on.offsetTop + on.offsetHeight > opts.scrollTop + opts.clientHeight) opts.scrollTop = on.offsetTop + on.offsetHeight - opts.clientHeight; }
    };
    input.value = filter;
    hi = filter ? 0 : Math.max(0, col.options().findIndex(([v]) => String(v) === current));
    draw();
    input.focus();
    editing.el = input;
    input.addEventListener("input", () => { hi = 0; draw(); });
    opts.addEventListener("mousedown", (e) => { const o = e.target.closest("[data-i]"); if (!o) return; e.preventDefault(); pick(+o.dataset.i, 0, 0); });
    const pick = (i, dr, dc) => { const o = shown[i]; if (!o) return cancel(); commitValue({ [col.key]: o[0] }, dr, dc); };
    input.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "ArrowDown") { e.preventDefault(); hi = Math.min(shown.length - 1, hi + 1); draw(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); hi = Math.max(0, hi - 1); draw(); }
      else if (e.key === "Enter") { e.preventDefault(); pick(hi, e.shiftKey ? -1 : 1, 0); }
      else if (e.key === "Tab") { e.preventDefault(); pick(hi, 0, e.shiftKey ? -1 : 1); }
      else if (e.key === "Escape") { e.preventDefault(); cancel(); }
    });
    input.addEventListener("blur", () => setTimeout(() => { if (editing && editing.el === input) cancel(); }, 0));
  }

  function endEdit() {
    if (!editing) return;
    const cell = td(editing.r, editing.c);
    if (editing.cleanup) editing.cleanup();
    editing = null;
    cell?.querySelectorAll(".xl-editor,.xl-list").forEach((e) => e.remove());
    root.focus({ preventScroll: true });
  }
  function cancel() { endEdit(); paint(); say("Ready"); }
  function commitValue(patch, dr, dc) {
    const { r } = editing;
    endEdit();
    apply(r, patch);
    if (dr || dc) step(dr, dc); else paint();
  }
  function commit(text, dr, dc) {
    if (!editing) return;
    const { r, col } = editing;
    if (text === rawText(rows[r], col) && !(col.type === "date" && !rows[r].data[col.key] && text)) { endEdit(); if (dr || dc) step(dr, dc); else paint(); return; }
    let patch;
    try { patch = parseFor(col, text); }
    catch (e) { say(e.message, true); editing.el.focus(); editing.el.select(); return; }
    commitValue(patch, dr, dc);
  }
  function editorKey(e, input) {
    e.stopPropagation(); // the grid's ready-mode handler must not see keys meant for the editor
    const k = e.key;
    if (k === "Enter") { e.preventDefault(); commit(input.value, e.shiftKey ? -1 : 1, 0); }
    else if (k === "Tab") { e.preventDefault(); commit(input.value, 0, e.shiftKey ? -1 : 1); }
    else if (k === "Escape") { e.preventDefault(); cancel(); }
    else if (k === "ArrowUp" || k === "ArrowDown") { e.preventDefault(); commit(input.value, k === "ArrowUp" ? -1 : 1, 0); }
    else if ((k === "ArrowLeft" || k === "ArrowRight") && editing.mode === "enter") {
      // typed straight over the cell: arrows leave the cell, as in Excel's Enter mode (an autocomplete selection is accepted first)
      if (input.selectionStart !== input.selectionEnd && k === "ArrowRight") return;
      e.preventDefault(); commit(input.value, 0, k === "ArrowLeft" ? -1 : 1);
    } else if (k === "F2") { e.preventDefault(); editing.mode = editing.mode === "enter" ? "edit" : "enter"; say(editing.mode === "edit" ? "Edit" : "Enter"); }
  }

  // ---------- ready-mode keys ----------
  function clearRange() {
    const { r1, r2, c1, c2 } = range(), cells = [];
    for (let r = r1; r <= r2; r++) {
      if (isBlank(rows[r]) || rows[r].ro) continue;
      for (let c = c1; c <= c2; c++) {
        const col = cols[c];
        if (readOnly(rows[r], col) || col.type === "delete" || col.type === "date") continue;
        cells.push([r, c, col.type === "number" ? { [col.key]: null, [col.key + "_formula"]: null } : col.type === "select" ? { [col.key]: defaults()[col.key] ?? col.options()[0][0] } : { [col.key]: "" }]);
      }
    }
    if (cells.length) applyMany(cells, "Cleared");
  }
  function fillDown() {
    const { r1, r2, c1, c2 } = range(), src = r1 === r2 ? r1 - 1 : r1, from = r1 === r2 ? r1 : r1 + 1;
    if (src < 0) return;
    const cells = [];
    for (let r = from; r <= r2; r++) for (let c = c1; c <= c2; c++) {
      const col = cols[c];
      if (col.type === "delete" || readOnly(rows[r], col)) continue;
      const patch = { [col.key]: rows[src].data[col.key] ?? null };
      if (col.type === "number") patch[col.key + "_formula"] = rows[src].data[col.key + "_formula"] || null;
      cells.push([r, c, patch]);
    }
    applyMany(cells, "Filled down");
  }

  root.addEventListener("keydown", (e) => {
    if (editing || e.target === fbar) return;
    const k = e.key, ctrl = e.ctrlKey || e.metaKey, col = cols[active.c];
    const nav = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    if (e.altKey && k === "ArrowDown") { // Alt+↓ opens the list (checked before plain arrows)
      e.preventDefault();
      if (col.type === "select" && !readOnly(rows[active.r], col)) startEdit("edit");
      else if (col.type !== "delete") { const b = host.querySelector(`.xl-fbtn[data-fc="${active.c}"]`); if (b) openFilter(active.c, b); }
      return;
    }
    if (nav[k]) {
      e.preventDefault();
      if (ctrl) {
        const [dr, dc] = nav[k];
        moveTo(dr < 0 ? 0 : dr > 0 ? lastDataRow() : active.r, dc < 0 ? 0 : dc > 0 ? lastC - 1 : active.c, e.shiftKey);
      } else step(...nav[k], e.shiftKey);
    } else if (k === "Tab") { e.preventDefault(); step(0, e.shiftKey ? -1 : 1); }
    else if (k === "Enter") {
      e.preventDefault();
      if (col.type === "delete") deleteRow(active.r);
      else if (ctrl) startEdit("edit");
      else step(e.shiftKey ? -1 : 1, 0);
    }
    else if (k === "F2") { e.preventDefault(); startEdit("edit"); }
    else if (k === "Home") { e.preventDefault(); ctrl ? moveTo(0, 0, e.shiftKey) : moveTo(active.r, 0, e.shiftKey); }
    else if (k === "End") { e.preventDefault(); ctrl ? moveTo(lastDataRow(), lastC - 1, e.shiftKey) : moveTo(active.r, lastC - 1, e.shiftKey); }
    else if (k === "PageDown" || k === "PageUp") { e.preventDefault(); moveTo(active.r + (k === "PageDown" ? 10 : -10), active.c, e.shiftKey); }
    else if (k === "Delete" || k === "Backspace") { e.preventDefault(); if (col.type === "delete") deleteRow(active.r); else clearRange(); }
    else if (k === "Escape") { anchor = { ...active }; paint(); say("Ready"); }
    else if (ctrl && k.toLowerCase() === "z") { e.preventDefault(); doUndo(); }
    else if (ctrl && k.toLowerCase() === "d") { e.preventDefault(); fillDown(); }
    else if (ctrl && k.toLowerCase() === "a") { e.preventDefault(); anchor = { r: 0, c: 0 }; active = { r: lastDataRow(), c: lastC - 1 }; paint(); }
    else if (ctrl && k === ";") { e.preventDefault(); const dc = cols.findIndex((c) => c.type === "date"); if (dc >= 0) apply(active.r, { [cols[dc].key]: parseDateInput("t") }); }
    else if (ctrl && (k === "-" || k === "_")) { e.preventDefault(); deleteRow(active.r); }
    else if (!ctrl && !e.altKey && k.length === 1) {
      if (col.type === "delete" || readOnly(rows[active.r], col)) return;
      e.preventDefault(); startEdit("enter", k);
    }
  });

  // ---------- mouse ----------
  tbody.addEventListener("mousedown", (e) => {
    const cell = e.target.closest("td"); if (!cell || e.target.closest(".xl-editor,.xl-list")) return;
    if (editing) { if (editing.col.type === "select") cancel(); else commit(editing.el.value, 0, 0); }
    const r = +cell.parentElement.dataset.r, c = +cell.dataset.c;
    if (e.target.classList.contains("xl-x")) { e.preventDefault(); moveTo(r, c); deleteRow(r); return; }
    e.preventDefault(); root.focus({ preventScroll: true });
    moveTo(r, c, e.shiftKey); dragging = true;
  });
  tbody.addEventListener("mouseover", (e) => {
    if (!dragging) return; const cell = e.target.closest("td"); if (!cell) return;
    active = { r: +cell.parentElement.dataset.r, c: +cell.dataset.c }; paint();
  });
  document.addEventListener("mouseup", () => { dragging = false; });
  tbody.addEventListener("dblclick", (e) => { if (e.target.closest("td") && !editing) startEdit("edit"); });

  // ---------- clipboard (works with ranges copied from Excel / Google Sheets) ----------
  function copyText() {
    const { r1, r2, c1, c2 } = range(), lines = [];
    for (let r = r1; r <= r2; r++) {
      const vals = [];
      for (let c = c1; c <= c2; c++) {
        const col = cols[c]; if (col.type === "delete") continue;
        const v = rows[r].data[col.key];
        vals.push(col.type === "number" ? (v ?? "") : col.type === "readonly" ? "" : rawText(rows[r], col));
      }
      lines.push(vals.join("\t"));
    }
    return lines.join("\n");
  }
  root.addEventListener("copy", (e) => { if (editing || e.target === fbar) return; e.preventDefault(); e.clipboardData.setData("text/plain", copyText()); say("Copied"); });
  root.addEventListener("cut", (e) => { if (editing || e.target === fbar) return; e.preventDefault(); e.clipboardData.setData("text/plain", copyText()); clearRange(); });
  root.addEventListener("paste", async (e) => {
    if (editing || e.target === fbar) return;
    e.preventDefault();
    if (rows[active.r] && rows[active.r].ro) return say("This row is calculated and can't be changed", true);
    const text = e.clipboardData.getData("text/plain").replace(/\r/g, "").replace(/\n$/, "");
    if (!text) return;
    const grid = text.split("\n").map((l) => l.split("\t"));
    const cells = [], errors = [];
    grid.forEach((vals, i) => {
      const r = active.r + i;
      while (rows.length <= r + 1) { const b = blank(); all.push(b); rows.push(b); }
      vals.forEach((v, j) => {
        const c = active.c + j, col = cols[c];
        if (!col || col.type === "delete" || readOnly(rows[r], col)) return;
        if (!String(v).trim() && col.type !== "text") return;
        try { cells.push([r, c, parseFor(col, v)]); } catch (x) { errors.push(`${letter(c)}${r + 1}`); }
      });
    });
    renderBody();
    await applyMany(cells, `Pasted ${grid.length} row${grid.length > 1 ? "s" : ""}${errors.length ? ` — couldn't read ${errors.slice(0, 5).join(", ")}` : ""}`);
    anchor = { ...active }; active = { r: Math.min(rows.length - 1, active.r + grid.length - 1), c: Math.min(lastC - 1, active.c + grid[0].length - 1) }; paint();
  });

  // ---------- formula bar ----------
  fbar.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const col = cols[active.c];
      if (col.type === "delete" || readOnly(rows[active.r], col)) return;
      try { apply(active.r, parseFor(col, fbar.value)); root.focus(); step(1, 0); } catch (x) { say(x.message, true); }
    } else if (e.key === "Escape") { e.preventDefault(); root.focus(); paint(); }
  });

  // ---------- filters (Excel-style, per column type) ----------
  function distinct(col) {
    const seen = new Map();
    for (const r of all) {
      if (!r.id) continue;
      const v = r.data[col.key];
      const key = col.type === "select" ? String(v ?? "") : String(v ?? "").trim();
      const label = col.type === "select" ? optionLabel(col, v) || "(blank)" : key || "(blank)";
      if (!seen.has(key)) seen.set(key, label);
    }
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }
  function passes(row) {
    for (const [key, f] of Object.entries(filters)) {
      const col = cols.find((c) => c.key === key), v = row.data[key];
      if (f.values && !f.values.has(col.type === "select" ? String(v ?? "") : String(v ?? "").trim())) return false;
      if (f.contains && !String(col.type === "select" ? optionLabel(col, v) : v ?? "").toLowerCase().includes(f.contains.toLowerCase())) return false;
      if (f.op) {
        const n = v === null || v === undefined || v === "" ? null : +v;
        if (n === null) return false;
        const a = +f.a, b = +f.b;
        if ((f.op === "eq" && n !== a) || (f.op === "ne" && n === a) || (f.op === "gt" && !(n > a)) || (f.op === "ge" && !(n >= a)) ||
            (f.op === "lt" && !(n < a)) || (f.op === "le" && !(n <= a)) || (f.op === "between" && !(n >= Math.min(a, b) && n <= Math.max(a, b)))) return false;
      }
      if (f.from && !(v && v >= f.from)) return false;
      if (f.to && !(v && v <= f.to)) return false;
    }
    return true;
  }
  function filterStatus() {
    host.querySelectorAll(".xl-fbtn").forEach((b) => {
      const key = cols[+b.dataset.fc].key;
      b.classList.toggle("on", !!filters[key] || (sort && sort.key === key));
      b.textContent = filters[key] ? "⏷" : sort && sort.key === key ? (sort.dir > 0 ? "↑" : "↓") : "▾";
    });
    const total = all.filter((r) => r.id).length, shown = rows.filter((r) => r.id).length;
    if (Object.keys(filters).length) say(`Filter on: showing ${shown} of ${total} rows`);
  }
  function closePanel() { host.querySelector(".xl-fpanel")?.remove(); }
  function openFilter(c, btn) {
    closePanel();
    const col = cols[c], f = filters[col.key] || {};
    const panel = document.createElement("div");
    panel.className = "xl-fpanel"; panel.setAttribute("role", "dialog"); panel.setAttribute("aria-label", `Filter ${col.label}`);
    const sortLabels = col.type === "number" ? ["Smallest to largest", "Largest to smallest"] : col.type === "date" ? ["Oldest to newest", "Newest to oldest"] : ["Sort A to Z", "Sort Z to A"];
    let body = "";
    if (col.type === "number") {
      body = `<label>Show rows where the amount is</label><select class="fp-op">${[["", "any value"], ["eq", "equal to"], ["ne", "not equal to"], ["gt", "greater than"], ["ge", "at least"], ["lt", "less than"], ["le", "at most"], ["between", "between"]].map(([v, l]) => `<option value="${v}" ${f.op === v ? "selected" : ""}>${l}</option>`).join("")}</select>
        <div class="row"><input class="fp-a" type="number" step="any" value="${esc(f.a ?? "")}" placeholder="Value"><input class="fp-b" type="number" step="any" value="${esc(f.b ?? "")}" placeholder="and" ${f.op === "between" ? "" : "hidden"}></div>`;
    } else if (col.type === "date") {
      body = `<label>From</label><input class="fp-from" type="date" value="${esc(f.from || "")}"><label>To</label><input class="fp-to" type="date" value="${esc(f.to || "")}">`;
    } else {
      const vals = distinct(col);
      body = `${col.type === "text" ? `<input class="fp-contains" placeholder="Contains…" value="${esc(f.contains || "")}">` : ""}
        <input class="fp-search" placeholder="Search values">
        <div class="fp-list"><label><input type="checkbox" class="fp-all" ${!f.values ? "checked" : ""}> (Select all)</label>
        ${vals.map(([k, l]) => `<label><input type="checkbox" class="fp-v" value="${esc(k)}" ${!f.values || f.values.has(k) ? "checked" : ""}> ${esc(l)}</label>`).join("")}</div>`;
    }
    panel.innerHTML = `<button type="button" class="fp-sort" data-dir="1">${sortLabels[0]}</button><button type="button" class="fp-sort" data-dir="-1">${sortLabels[1]}</button><hr>
      ${body}<div class="row fp-actions"><button type="button" class="fp-clear">Clear filter</button><span class="spacer"></span><button type="button" class="primary fp-ok">OK</button></div>`;
    root.appendChild(panel);
    const th = btn.closest("th"), rb = root.getBoundingClientRect(), tb = th.getBoundingClientRect();
    panel.style.left = Math.max(0, Math.min(tb.left - rb.left, rb.width - panel.offsetWidth - 4)) + "px";
    panel.style.top = tb.bottom - rb.top + "px";
    const $p = (sel) => panel.querySelector(sel);
    const op = $p(".fp-op"); if (op) op.onchange = () => { $p(".fp-b").hidden = op.value !== "between"; };
    const all_ = $p(".fp-all"); if (all_) all_.onchange = () => panel.querySelectorAll(".fp-v").forEach((x) => { if (!x.closest("label").hidden) x.checked = all_.checked; });
    const search = $p(".fp-search"); if (search) search.oninput = () => panel.querySelectorAll(".fp-v").forEach((x) => { x.closest("label").hidden = !x.closest("label").textContent.toLowerCase().includes(search.value.toLowerCase()); });
    const apply = () => {
      const nf = {};
      if (op && op.value) Object.assign(nf, { op: op.value, a: $p(".fp-a").value, b: $p(".fp-b").value });
      if ($p(".fp-from")?.value) nf.from = $p(".fp-from").value;
      if ($p(".fp-to")?.value) nf.to = $p(".fp-to").value;
      if ($p(".fp-contains")?.value.trim()) nf.contains = $p(".fp-contains").value.trim();
      const boxes = [...panel.querySelectorAll(".fp-v")];
      if (boxes.length && boxes.some((x) => !x.checked)) nf.values = new Set(boxes.filter((x) => x.checked).map((x) => x.value));
      if (Object.keys(nf).length) filters[col.key] = nf; else delete filters[col.key];
      closePanel(); renderBody(true); moveTo(Math.min(active.r, rows.length - 1), c); root.focus({ preventScroll: true });
      if (!Object.keys(filters).length) say("Ready");
    };
    panel.querySelectorAll(".fp-sort").forEach((b) => (b.onclick = () => { sort = { key: col.key, dir: +b.dataset.dir }; apply(); }));
    $p(".fp-ok").onclick = apply;
    $p(".fp-clear").onclick = () => { delete filters[col.key]; if (sort && sort.key === col.key) sort = null; closePanel(); renderBody(true); say("Ready"); root.focus({ preventScroll: true }); };
    panel.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Escape") { closePanel(); root.focus({ preventScroll: true }); } if (e.key === "Enter" && e.target.tagName === "INPUT" && e.target.type !== "checkbox") apply(); });
    (panel.querySelector(".fp-contains,.fp-search,.fp-op,.fp-from") || $p(".fp-ok")).focus();
  }
  host.querySelector("thead").addEventListener("click", (e) => { const b = e.target.closest(".xl-fbtn"); if (b) { e.stopPropagation(); openFilter(+b.dataset.fc, b); } });
  document.addEventListener("mousedown", (e) => { const p = host.querySelector(".xl-fpanel"); if (p && !p.contains(e.target) && !e.target.closest(".xl-fbtn")) closePanel(); });

  // ---------- column widths: always fit the grid's width (no sideways scroll); drag edges to resize ----------
  const scroller = host.querySelector(".xl-scroll"), table = host.querySelector(".xl-table");
  const colEls = [...host.querySelectorAll("colgroup col")].slice(1);
  const wKey = cfg.id ? "xlw:" + cfg.id : null;
  let widths = cols.map((c) => c.width || 120);
  try { const saved = wKey && JSON.parse(localStorage.getItem(wKey) || "null"); if (saved && saved.length === widths.length) widths = saved; } catch (e) { /* ignore */ }
  const DEL = cols.length - 1, MIN = 44;
  function fit() {
    const avail = scroller.clientWidth - 44 - 2;
    if (avail <= 0) return;
    const data = widths.slice(0, DEL), target = avail - 34;
    const scale = target / data.reduce((a, b) => a + b, 0);
    const fitted = data.map((w) => Math.max(MIN, Math.floor(w * scale)));
    fitted[fitted.length - 1] += target - fitted.reduce((a, b) => a + b, 0);
    widths = [...fitted, 34];
    widths.forEach((w, i) => { colEls[i].style.width = w + "px"; });
    table.style.width = avail + 44 + "px";
  }
  new ResizeObserver(() => fit()).observe(scroller);
  host.querySelector("thead").addEventListener("mousedown", (e) => {
    const h = e.target.closest(".xl-rs"); if (!h) return;
    e.preventDefault(); e.stopPropagation();
    const i = +h.dataset.rc, j = i + 1 < DEL ? i + 1 : i - 1; // the neighbour gives or takes the space
    if (j < 0) return;
    const x0 = e.clientX, wi = widths[i], wj = widths[j];
    document.body.classList.add("xl-resizing");
    const move = (ev) => {
      const d = Math.max(MIN - wi, Math.min(wj - MIN, ev.clientX - x0)); // total width never changes
      widths[i] = wi + d; widths[j] = wj - d;
      colEls[i].style.width = widths[i] + "px"; colEls[j].style.width = widths[j] + "px";
    };
    const up = () => {
      document.removeEventListener("mousemove", move); document.removeEventListener("mouseup", up);
      document.body.classList.remove("xl-resizing");
      try { if (wKey) localStorage.setItem(wKey, JSON.stringify(widths)); } catch (e2) { /* ignore */ }
    };
    document.addEventListener("mousemove", move); document.addEventListener("mouseup", up);
  });
  host.querySelector("thead").addEventListener("dblclick", (e) => {
    if (!e.target.closest(".xl-rs")) return;
    widths = cols.map((c) => c.width || 120); fit();
    try { if (wKey) localStorage.removeItem(wKey); } catch (e2) { /* ignore */ }
  });

  computeView();
  renderBody();
  fit();
  return {
    focus: () => root.focus({ preventScroll: true }),
    /** Re-read rows from outside (e.g. after another tab changed data). Keeps the active cell. */
    refreshRow(id, data) { const r = rows.findIndex((x) => x.id === id); if (r >= 0) { rows[r].data = { ...data }; renderRow(r); } },
    clearFilters() { filters = {}; sort = null; renderBody(true); say("Ready"); },
    idle: () => queue,
  };
}

// ======================= phone: list + edit sheet =======================
function mountList(host, cfg) {
  const cols = cfg.columns;
  const items = cfg.rows.map(({ id, ...data }) => ({ id, data }));
  const ro = (cfg.readonlyRows || []).map((data) => ({ id: null, data, ro: true }));
  const textCol = cols.find((c) => c.autocomplete) || cols.find((c) => c.type === "text");
  const numCol = cols.find((c) => c.type === "number" && /amount|total|balance/i.test(c.key)) || cols.find((c) => c.type === "number");
  const dateCol = cols.find((c) => c.type === "date");
  let query = "", sortKey = "", lastDeleted = null;
  const optionLabel = (col, v) => { const o = col.options().find(([x]) => String(x) === String(v ?? "")); return o ? o[1] : ""; };
  const shown = (col, data) => {
    if (col.display) { const d = col.display(data); if (d !== null && d !== undefined) return d; }
    const v = data[col.key];
    if (col.type === "select") return optionLabel(col, v);
    if (col.type === "date") return v ? formatDate(v) : "";
    if (col.type === "number") return v === null || v === undefined || v === "" ? "" : formatAmount(v);
    return v ?? "";
  };

  host.innerHTML = `<div class="ml">
    <div class="ml-bar"><input type="search" class="ml-q" placeholder="Search" aria-label="Search ${esc(cfg.label || "rows")}">
      <select class="ml-sort" aria-label="Sort"><option value="">Default order</option>${cols.filter((c) => c.type !== "readonly").flatMap((c) => [`<option value="${c.key}:1">${esc(c.label)} ↑</option>`, `<option value="${c.key}:-1">${esc(c.label)} ↓</option>`]).join("")}</select></div>
    <ul class="ml-list" role="list"></ul>
    <div class="ml-foot"><span class="ml-sum"></span><button type="button" class="primary ml-add">+ Add</button></div>
    <div class="ml-toast" hidden></div></div>`;
  const list = host.querySelector(".ml-list"), toast = host.querySelector(".ml-toast");

  function view() {
    let v = items.filter((it) => !query || cols.some((c) => String(shown(c, it.data)).toLowerCase().includes(query)));
    if (sortKey) {
      const [k, dir] = sortKey.split(":"), col = cols.find((c) => c.key === k);
      const key = (it) => (col.type === "number" ? +(it.data[k] ?? -Infinity) : String(shown(col, it.data)).toLowerCase());
      v = [...v].sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0) * +dir);
    }
    return [...ro, ...v];
  }
  function render() {
    const rows = view();
    list.innerHTML = rows.map((it, i) => {
      const d = it.data, title = textCol ? shown(textCol, d) : "";
      const sub = cols.filter((c) => c !== textCol && c !== numCol && c.type !== "readonly" && shown(c, d)).map((c) => `${c.icon && d[c.key] ? c.icon(d[c.key]) : ""}${esc(shown(c, d))}`).join(" · ");
      const extra = cols.filter((c) => c.type === "readonly").map((c) => (it.id ? c.render({ id: it.id, data: d }) : "")).join(" ");
      const n = numCol ? d[numCol.key] : null;
      return `<li><button type="button" class="ml-row${it.ro ? " ml-ro" : ""}" data-i="${i}" ${it.ro ? 'aria-disabled="true"' : ""}>
        <span class="ml-main"><span class="ml-title">${esc(title) || '<span class="muted">(no description)</span>'}</span><span class="ml-sub">${sub}${extra ? " · " + extra : ""}</span></span>
        <span class="ml-amt ${n < 0 ? "xl-neg" : ""}">${numCol && n !== null && n !== undefined && n !== "" ? esc(formatAmount(n)) : ""}</span></button></li>`;
    }).join("") || `<li class="ml-empty muted">${query ? "Nothing matches your search." : "Nothing here yet. Tap + Add."}</li>`;
    const nums = items.filter((it) => !query || view().includes(it)).map((it) => +it.data[numCol?.key] || 0);
    host.querySelector(".ml-sum").textContent = `${items.length} row${items.length === 1 ? "" : "s"}${numCol ? " · total " + formatAmount(Math.round(nums.reduce((a, b) => a + b, 0))) : ""}`;
    list.querySelectorAll(".ml-row").forEach((b) => (b.onclick = () => { const it = view()[+b.dataset.i]; if (!it.ro) openSheet(it); }));
  }

  function openSheet(item) {
    const isNew = !item, base = isNew ? { ...(cfg.newRow ? cfg.newRow() : {}) } : { ...item.data };
    const touched = new Set();
    const back = document.createElement("div");
    back.className = "ml-back";
    back.innerHTML = `<form class="ml-sheet" role="dialog" aria-modal="true" aria-label="${isNew ? "Add" : "Edit"} ${esc(cfg.label || "row")}">
      <div class="ml-grab" aria-hidden="true"></div><h3>${isNew ? "Add" : "Edit"}</h3>
      ${cols.map((c) => {
        const id = "mf-" + c.key, v = base[c.key];
        if (c.type === "readonly") return item ? `<div class="ml-field"><span class="ml-lbl">${esc(c.label)}</span><div>${c.render({ id: item.id, data: base })}</div></div>` : "";
        const roF = c.readonlyIf && c.readonlyIf(base);
        if (roF) return `<div class="ml-field"><span class="ml-lbl">${esc(c.label)}</span><div>${esc(shown(c, base))}</div></div>`;
        let input;
        if (c.type === "select") input = `<select id="${id}" data-k="${c.key}">${c.options().map(([o, l]) => `<option value="${esc(o)}" ${String(o) === String(v ?? "") ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>`;
        else if (c.type === "date") input = `<input id="${id}" data-k="${c.key}" type="date" value="${esc(v || "")}">`;
        else if (c.type === "number") input = `<input id="${id}" data-k="${c.key}" inputmode="decimal" value="${esc(base[c.key + "_formula"] || (v ?? ""))}" placeholder="0 or =120+340">`;
        else input = `<input id="${id}" data-k="${c.key}" value="${esc(v ?? "")}" autocomplete="off" ${c.autocomplete && cfg.suggest && cfg.suggest.list ? `list="${id}-dl"` : ""}>${c.autocomplete ? `<datalist id="${id}-dl"></datalist>` : ""}`;
        return `<div class="ml-field"><label for="${id}" class="ml-lbl">${esc(c.label)}</label>${input}</div>`;
      }).join("")}
      <p class="error ml-err" role="alert"></p>
      <div class="ml-actions">${isNew ? "" : '<button type="button" class="ml-del">Delete</button>'}<span class="spacer"></span><button type="button" class="ml-cancel">Cancel</button><button type="submit" class="primary">Save</button></div></form>`;
    document.body.appendChild(back);
    document.body.classList.add("ml-open");
    const form = back.querySelector("form"), $f = (sel) => form.querySelector(sel);
    const close = () => { back.remove(); document.body.classList.remove("ml-open"); };
    back.addEventListener("click", (e) => { if (e.target === back) close(); });
    form.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
    $f(".ml-cancel").onclick = close;
    form.querySelectorAll("[data-k]").forEach((el) => el.addEventListener("change", () => touched.add(el.dataset.k)));
    // suggestions + filling the other fields from earlier entries with the same description
    if (textCol && textCol.autocomplete && cfg.suggest) {
      const inp = $f(`[data-k="${textCol.key}"]`), dl = form.querySelector("datalist");
      if (inp && dl && cfg.suggest.list) inp.addEventListener("input", () => { dl.innerHTML = cfg.suggest.list(inp.value, 6).map((x) => `<option value="${esc(x)}">`).join(""); });
      if (inp) inp.addEventListener("change", () => {
        const inf = cfg.suggest.infer(inp.value); if (!inf) return;
        for (const [k, v] of Object.entries(inf)) { const el = $f(`[data-k="${k}"]`); if (el && !touched.has(k) && (isNew || !base[k] || base[k] === (cfg.newRow ? cfg.newRow()[k] : ""))) el.value = v; }
      });
    }
    if (!isNew) $f(".ml-del").onclick = async () => {
      close();
      const idx = items.indexOf(item);
      items.splice(idx, 1); render();
      try { await cfg.remove(item.id); lastDeleted = { data: item.data, idx }; showToast("Deleted", "Undo", undoDelete); cfg.onChange && cfg.onChange(); }
      catch (e) { items.splice(idx, 0, item); render(); showToast("Couldn't delete: " + e.message); }
    };
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const data = { ...base };
      try {
        form.querySelectorAll("[data-k]").forEach((el) => {
          const c = cols.find((x) => x.key === el.dataset.k);
          if (c.type === "number") { const p = parseAmountInput(el.value); data[c.key] = p ? p.value : null; data[c.key + "_formula"] = p ? p.formula : null; }
          else if (c.type === "date") { if (!el.value) throw new Error("Pick a date"); data[c.key] = el.value; }
          else data[c.key] = c.type === "text" ? el.value.trim() : el.value;
        });
      } catch (x) { $f(".ml-err").textContent = x.message; return; }
      if (cfg.meaningful && !cfg.meaningful(data)) { $f(".ml-err").textContent = `Fill in ${textCol ? textCol.label.toLowerCase() : "a value"}${numCol ? " or " + numCol.label.toLowerCase() : ""}.`; return; }
      try {
        const id = await cfg.save(isNew ? null : item.id, data);
        if (isNew) items.push({ id, data }); else item.data = data;
        close(); render(); showToast("Saved"); cfg.onChange && cfg.onChange();
      } catch (x) { $f(".ml-err").textContent = "Couldn't save: " + x.message; }
    });
    setTimeout(() => (form.querySelector(isNew && textCol ? `[data-k="${textCol.key}"]` : "select,input") || form).focus(), 50);
  }
  async function undoDelete() {
    if (!lastDeleted) return;
    const { data, idx } = lastDeleted; lastDeleted = null;
    const id = await cfg.save(null, data);
    items.splice(idx, 0, { id, data }); render(); showToast("Restored"); cfg.onChange && cfg.onChange();
  }
  let toastTimer;
  function showToast(msg, action, fn) {
    toast.innerHTML = `<span>${esc(msg)}</span>${action ? `<button type="button" class="link">${esc(action)}</button>` : ""}`;
    toast.hidden = false;
    if (action) toast.querySelector("button").onclick = () => { toast.hidden = true; fn(); };
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { toast.hidden = true; }, action ? 6000 : 1800);
  }
  host.querySelector(".ml-q").addEventListener("input", (e) => { query = e.target.value.trim().toLowerCase(); render(); });
  host.querySelector(".ml-sort").addEventListener("change", (e) => { sortKey = e.target.value; render(); });
  host.querySelector(".ml-add").onclick = () => openSheet(null);
  render();
  return { focus() {}, refreshRow(id, data) { const it = items.find((x) => x.id === id); if (it) { it.data = { ...data }; render(); } }, clearFilters() { query = ""; sortKey = ""; render(); }, idle: () => Promise.resolve() };
}
