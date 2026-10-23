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
export function mountGrid(host, cfg) {
  const cols = [...cfg.columns, { key: "__del", label: "", type: "delete", width: 34 }];
  const blankN = cfg.blankRows ?? 10;
  const rows = cfg.rows.map(({ id, ...data }) => ({ id, data, touched: new Set() }));
  const undo = [];
  let active = { r: 0, c: 0 }, anchor = { r: 0, c: 0 }, editing = null, dragging = false;
  let queue = Promise.resolve(), changeTimer = null;

  const blank = () => ({ id: null, data: {}, touched: new Set() });
  const isBlank = (row) => !row.id && !Object.keys(row.data).length;
  function ensureBlanks() {
    let trailing = 0;
    for (let i = rows.length - 1; i >= 0 && isBlank(rows[i]); i--) trailing++;
    for (; trailing < blankN; trailing++) rows.push(blank());
  }
  ensureBlanks();

  host.innerHTML = `<div class="xl" tabindex="0" role="grid" aria-label="${esc(cfg.label || "Spreadsheet")}">
    <div class="xl-fbar"><span class="xl-name" aria-label="Active cell"></span><span class="xl-fx">fx</span>
      <input class="xl-formula" aria-label="Cell contents" spellcheck="false"></div>
    <div class="xl-scroll"><table class="xl-table"><colgroup><col style="width:44px">${cols.map((c) => `<col style="width:${c.width || 120}px">`).join("")}</colgroup>
      <thead><tr class="xl-letters"><th class="xl-corner"></th>${cols.map((c, i) => `<th>${c.type === "delete" ? "" : letter(i)}</th>`).join("")}</tr>
      <tr class="xl-labels"><th class="xl-corner"></th>${cols.map((c) => `<th>${esc(c.label)}</th>`).join("")}</tr></thead><tbody></tbody></table></div>
    <div class="xl-status"><span class="xl-msg">Ready</span><span class="xl-agg"></span></div></div>`;
  const root = host.querySelector(".xl"), tbody = host.querySelector("tbody"), fbar = host.querySelector(".xl-formula");
  const nameBox = host.querySelector(".xl-name"), msgEl = host.querySelector(".xl-msg"), aggEl = host.querySelector(".xl-agg");

  // ---------- display ----------
  const optionLabel = (col, v) => { const o = col.options().find(([x]) => String(x) === String(v ?? "")); return o ? o[1] : ""; };
  const valueFor = (row, col) => row.data[col.key];
  const readOnly = (row, col) => col.type === "readonly" || (col.readonlyIf && col.readonlyIf(row.data));
  function cellHTML(row, col, r) {
    if (col.type === "delete") return `<span class="xl-x" title="Delete row (Enter)">✕</span>`;
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
    if (col.type === "select") return esc(optionLabel(col, v ?? (row.id || Object.keys(row.data).length ? (cfg.newRow ? cfg.newRow()[col.key] : "") : "")));
    return esc(v);
  }
  function rowHTML(row, r) {
    return `<tr data-r="${r}" class="${row.id ? "" : "xl-blank"}"><th class="xl-rn">${r + 1}</th>${cols.map((col, c) =>
      `<td data-c="${c}" class="xl-${col.type}${readOnly(row, col) ? " xl-ro" : ""}">${cellHTML(row, col, r)}</td>`).join("")}</tr>`;
  }
  function renderBody() { tbody.innerHTML = rows.map(rowHTML).join(""); paint(); }
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
    if (a) { a.classList.add("xl-active"); a.scrollIntoView({ block: "nearest", inline: "nearest" }); }
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
          const r = rows.indexOf(row);
          ensureBlanks(); renderBody(); if (r >= 0) paint();
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
    if (!row || isBlank(row)) return;
    if (!row.id) { row.data = {}; row.touched.clear(); renderRow(r); return; }
    const data = { ...row.data }, id = row.id;
    rows.splice(r, 1); ensureBlanks(); renderBody(); moveTo(r, 0);
    queue = queue.then(async () => {
      try { await cfg.remove(id); undo.push({ t: "delete", data, index: r }); say("Row deleted. Ctrl+Z brings it back."); scheduleChange(); }
      catch (e) { rows.splice(r, 0, { id, data, touched: new Set() }); renderBody(); moveTo(r, active.c); say("Couldn't delete: " + e.message, true); }
    });
  }

  async function doUndo() {
    const u = undo.pop();
    if (!u) return say("Nothing to undo");
    const items = u.t === "batch" ? [...u.items].reverse() : [u];
    for (const it of items) {
      if (it.t === "edit") { const r = rows.indexOf(it.row); if (r >= 0) { it.row.data = { ...it.before }; renderRow(r); await persist(it.row, null, false); } }
      if (it.t === "create") { const r = rows.indexOf(it.row); await cfg.remove(it.row.id); if (r >= 0) rows.splice(r, 1); ensureBlanks(); renderBody(); }
      if (it.t === "delete") { const row = { id: null, data: { ...it.data }, touched: new Set() }; rows.splice(Math.min(it.index, rows.length), 0, row); renderBody(); await persist(row, null, false); }
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
    box.innerHTML = `<input class="xl-editor xl-listinput" spellcheck="false" aria-label="Filter ${esc(col.label)}"><div class="xl-opts" role="listbox"></div>`;
    cell.appendChild(box);
    const input = box.querySelector("input"), opts = box.querySelector(".xl-opts");
    const current = String(rows[editing.r].data[col.key] ?? (cfg.newRow ? cfg.newRow()[col.key] ?? "" : ""));
    let hi = 0, shown = [];
    const draw = () => {
      const t = input.value.trim().toLowerCase();
      shown = col.options().filter(([, l]) => !t || String(l).toLowerCase().includes(t));
      shown.sort((a, b) => (String(b[1]).toLowerCase().startsWith(t) ? 1 : 0) - (String(a[1]).toLowerCase().startsWith(t) ? 1 : 0));
      hi = Math.max(0, Math.min(hi, shown.length - 1));
      opts.innerHTML = shown.map(([v, l], i) => `<div class="xl-opt${i === hi ? " on" : ""}" role="option" data-i="${i}">${esc(l) || "&nbsp;"}</div>`).join("") || '<div class="xl-opt xl-ghost">No match</div>';
      opts.querySelector(".on")?.scrollIntoView({ block: "nearest" });
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
      if (isBlank(rows[r])) continue;
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
    else if (e.altKey && k === "ArrowDown" && col.type === "select") { e.preventDefault(); startEdit("edit"); }
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
    const text = e.clipboardData.getData("text/plain").replace(/\r/g, "").replace(/\n$/, "");
    if (!text) return;
    const grid = text.split("\n").map((l) => l.split("\t"));
    const cells = [], errors = [];
    grid.forEach((vals, i) => {
      const r = active.r + i;
      while (rows.length <= r + 1) rows.push(blank());
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

  renderBody();
  return {
    focus: () => root.focus({ preventScroll: true }),
    /** Re-read rows from outside (e.g. after another tab changed data). Keeps the active cell. */
    refreshRow(id, data) { const r = rows.findIndex((x) => x.id === id); if (r >= 0) { rows[r].data = { ...data }; renderRow(r); } },
    idle: () => queue,
  };
}
