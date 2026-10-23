// Importers. Pure functions: take parsed files and return records to save, plus a report.
// Nothing here touches the network; files never leave the browser.
import * as E from "./engine.js";
import { numToCol, colToNum, splitRef, excelDate } from "./xlsx.js";

const uuid = () => globalThis.crypto.randomUUID();
const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const clean = (s) => String(s ?? "").trim();
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

// ---------------- CSV ----------------
export function parseCSV(text) {
  text = text.replace(/^﻿/, "");
  const first = text.split(/\r?\n/, 1)[0] || "";
  const delim = [",", ";", "\t"].sort((a, b) => first.split(b).length - first.split(a).length)[0];
  const rows = [];
  let row = [], field = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') q = false;
      else field += ch;
    } else if (ch === '"') q = true;
    else if (ch === delim) { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += ch;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => clean(c) !== ""));
}

// ---------------- generic table import ----------------
export function parseAmount(v) {
  if (isNum(v)) return v;
  let s = clean(v);
  if (!s) return null;
  const neg = /^\(.*\)$/.test(s) || /-/.test(s.replace(/^[^\d-]*/, "").slice(0, 1)) || /\bdr\b/i.test(s);
  s = s.replace(/[^\d.]/g, "");
  if (!s) return null;
  const n = parseFloat(s);
  return Number.isFinite(n) ? (neg ? -n : n) : null;
}

export function parseDate(v, order = "dmy") {
  if (isNum(v)) return v > 20000 && v < 80000 ? excelDate(v) : null;
  const s = clean(v);
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return ymd(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (m) {
    const y = +m[3] < 100 ? 2000 + +m[3] : +m[3];
    return order === "mdy" ? ymd(y, +m[1], +m[2]) : ymd(y, +m[2], +m[1]);
  }
  m = s.match(/^(\d{1,2})[\s-]([A-Za-z]{3})[A-Za-z]*[\s-,]*(\d{2,4})/);
  if (m && MONTHS.includes(m[2].toLowerCase())) {
    const y = +m[3] < 100 ? 2000 + +m[3] : +m[3];
    return ymd(y, MONTHS.indexOf(m[2].toLowerCase()) + 1, +m[1]);
  }
  return null;
}
function ymd(y, m, d) {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Guess which column is which from header names. */
export function guessMapping(headers) {
  const find = (re) => headers.findIndex((h) => re.test(clean(h).toLowerCase()));
  return {
    date: find(/date|txn|posted|value/),
    description: find(/desc|narration|particular|merchant|details|remark|name/),
    amount: find(/^amount|amt|inr|value|sum/),
    debit: find(/debit|withdraw|paid out|\bdr\b/),
    credit: find(/credit|deposit|paid in|\bcr\b/),
    category: find(/categ/),
  };
}

/**
 * rows: 2-D array incl. header row. mapping: column indexes (-1 = none).
 * opts: { account_id, sign: "spent_positive"|"received_positive", dateOrder: "dmy"|"mdy", settings, batch }
 */
export function importTable(rows, mapping, opts) {
  const items = [], skipped = [];
  const cat = (s) => E.CATEGORIES.find((c) => c.toLowerCase() === clean(s).toLowerCase()) || "Other";
  rows.slice(1).forEach((r, i) => {
    const date = parseDate(r[mapping.date], opts.dateOrder);
    let amt = null, direction = "out";
    if (mapping.debit >= 0 || mapping.credit >= 0) {
      const dr = parseAmount(r[mapping.debit]), cr = parseAmount(r[mapping.credit]);
      if (dr) { amt = Math.abs(dr); direction = "out"; } else if (cr) { amt = Math.abs(cr); direction = "in"; }
    } else {
      const a = parseAmount(r[mapping.amount]);
      if (a !== null && a !== 0) {
        const spent = opts.sign === "received_positive" ? a < 0 : a > 0;
        direction = spent ? "out" : "in"; amt = Math.abs(a);
      }
    }
    if (!date || amt === null) { skipped.push(i + 2); return; }
    items.push({ id: uuid(), type: "transaction", data: {
      date, period: E.periodOf(date, opts.settings), account_id: opts.account_id, amount: amt, direction,
      description: clean(r[mapping.description]).slice(0, 200),
      category: mapping.category >= 0 ? cat(r[mapping.category]) : direction === "in" ? "Other" : "Other",
      nature: direction === "in" ? "income" : "variable", import_batch: opts.batch,
    } });
  });
  return { items, report: { added: items.length, skippedRows: skipped } };
}

// ---------------- "Finances" workbook layout ----------------
// Month sheets named like "Oct 26", each with labelled blocks: Inflows, Cash - Planned, Cash - Unplanned,
// one block per credit card ("<name> Card"), Annual Expenses Summary, and Opening/Closing Balance.

export const monthSheetPeriod = (name) => {
  const m = clean(name).match(/^([A-Za-z]{3})[a-z]*\s+'?(\d{2}|\d{4})$/);
  if (!m || !MONTHS.includes(m[1].toLowerCase())) return null;
  const y = m[2].length === 2 ? 2000 + +m[2] : +m[2];
  return `${y}-${String(MONTHS.indexOf(m[1].toLowerCase()) + 1).padStart(2, "0")}`;
};

async function findLabels(sheet) {
  const at = {};
  for (let r = 1; r <= sheet.maxRow; r++) for (let c = 1; c <= sheet.maxCol; c++) {
    const ref = numToCol(c) + r, v = sheet.get(ref);
    if (typeof v === "string") (at[clean(v).toLowerCase()] ||= []).push(ref);
  }
  return at;
}

export async function looksLikeFinancesWorkbook(book) {
  const months = book.sheetNames.filter(monthSheetPeriod);
  if (!months.length) return false;
  const at = await findLabels(await book.sheet(months[0]));
  return !!(at["opening balance"] && at["cash - planned"] && at["inflows"]);
}

const CASH_CATEGORY = [[/rent/i, "Rent"], [/house ?help|maid|cook|driver/i, "Household"], [/maint/i, "Household"],
  [/tution|tuition|school|class/i, "Education"], [/badminton|skating|gym|sport/i, "Personal"], [/self/i, "Personal"],
  [/loan|emi/i, "Other"]];
const cashCategory = (label) => (CASH_CATEGORY.find(([re]) => re.test(label)) || [null, "Family"])[1];
function cardLine(category) {
  const c = clean(category);
  if (/^annual$/i.test(c)) return { category: "Other", nature: "annual" };
  if (/^one ?timer$/i.test(c)) return { category: "Other", nature: "oneoff" };
  if (/^emergency$/i.test(c)) return { category: "Emergency", nature: "emergency" };
  const known = E.CATEGORIES.find((x) => x.toLowerCase() === c.toLowerCase());
  return { category: known || "Other", nature: "variable" };
}

/** Rows below a label in one column, until the next label in that column (or a gap of `gap` empty rows). */
function blockRows(sheet, col, fromRow, stopLabels, gap = 6) {
  const out = [];
  let empty = 0;
  for (let r = fromRow; r <= sheet.maxRow; r++) {
    const v = sheet.get(col + r);
    if (typeof v === "string" && stopLabels.has(clean(v).toLowerCase())) break;
    if (v === null) { if (++empty >= gap) break; continue; }
    empty = 0; out.push(r);
  }
  return out;
}

/**
 * ctx: { mainAccount: {id,...}, accounts: [{id,data}], batch, months?: [sheet names] }
 * Returns { items, report: { months: [{sheet, period, sheetOpening, sheetClosing, closing, diff}], ... } }
 */
export async function importFinancesWorkbook(book, ctx) {
  const items = [], warnings = [];
  const add = (type, data) => { const id = uuid(); items.push({ id, type, data: { ...data, import_batch: ctx.batch } }); return id; };
  const months = (ctx.months || book.sheetNames.filter(monthSheetPeriod))
    .map((name) => ({ name, period: monthSheetPeriod(name) })).sort((a, b) => a.period.localeCompare(b.period));
  if (!months.length) throw new Error("No month sheets found (expected names like \"Oct 26\").");

  const byName = new Map(ctx.accounts.map((a) => [clean(a.data.name).toLowerCase(), a.id]));
  const account = (name, data) => {
    const key = clean(name).toLowerCase();
    if (!byName.has(key)) byName.set(key, add("account", { name: clean(name), ...data }));
    return byName.get(key);
  };
  const main = ctx.mainAccount.id;
  const investments = () => account("Investments", { kind: "mutual_fund", role: "investment", balance: 0, liquid: true });

  // People listed as "Credit - X" in the Checkpoint sheet: cash paid to them is money lent, not spending.
  const lent = [];
  for (const snap of await checkpointSnapshots(book)) for (const it of snap.items) {
    const m = it.label.match(/^credit\s*-?\s*(.+)$/i);
    if (m && !lent.some((x) => x.key === m[1].trim().toLowerCase())) lent.push({ key: m[1].trim().toLowerCase(), label: it.label });
  }
  const lentTo = (label) => lent.find((x) => label.toLowerCase().split(/\s+/).includes(x.key) || label.toLowerCase() === x.key);

  const perMonth = [];
  const commitmentIds = {};
  let latest = null;

  for (const { name, period } of months) {
    const s = await book.sheet(name);
    const at = await findLabels(s);
    const first = (label) => (at[label] || [])[0];
    const date = period + "-01";
    const tx = (data) => add("transaction", { date, period, grouped: true, ...data });
    const sheetOpening = s.get("B" + splitRef(first("opening balance"))[1]);
    const sheetClosing = s.get("B" + splitRef(first("closing balance"))[1]);

    // Inflows: label in A, amount in B, under "Inflows" until "Outflows"
    const [ic, ir] = splitRef(first("inflows"));
    const amountCol = numToCol(colToNum(ic) + 1);
    // The sheet treats the first line (rent) as planned income and the rest as "additional inflow".
    let firstInflow = true;
    for (const r of blockRows(s, ic, ir + 1, new Set(["outflows"]))) {
      const label = clean(s.get(ic + r)), v = s.get(amountCol + r);
      if (!label || !isNum(v) || !v) continue;
      const regular = firstInflow || /\b(rent|salary|interest|pension|dividend)\b/i.test(label);
      firstInflow = false;
      tx({ account_id: main, direction: "in", amount: v, description: label, category: /rent/i.test(label) ? "Rent" : "Other", nature: regular ? "income" : "income_oneoff" });
    }

    // Cash planned / unplanned: label in C, amount in D
    const plannedRows = [];
    for (const [label, kind] of [["cash - planned", "planned"], ["cash - unplanned", "unplanned"]]) {
      const ref = first(label); if (!ref) continue;
      const [cc, cr] = splitRef(ref);
      const vc = numToCol(colToNum(cc) + 1);
      for (const r of blockRows(s, cc, cr + 1, new Set(["cash - unplanned", "key datapoints"]), 4)) {
        const l = clean(s.get(cc + r)), v = s.get(vc + r);
        if (!l || !isNum(v) || !v) continue;
        if (kind === "unplanned" && lentTo(l)) {
          const who = lentTo(l);
          tx({ account_id: main, to_account_id: account(who.label, { kind: "other", role: "receivable", balance: 0, liquid: true }), direction: "transfer", amount: v, description: l, category: "Other", nature: "oneoff" });
        } else if (kind === "unplanned" && /invest/i.test(l)) {
          tx({ account_id: main, to_account_id: investments(), direction: "transfer", amount: v, description: l, category: "Other", nature: "investment" });
        } else if (kind === "planned" && /annual/i.test(l)) {
          tx({ account_id: main, direction: "out", amount: v, description: l + " (cash)", category: "Other", nature: "annual" });
        } else if (kind === "planned") {
          plannedRows.push({ label: l, amount: v });
          tx({ account_id: main, direction: "out", amount: v, description: l, category: cashCategory(l), nature: "recurring", _commitment: l });
        } else {
          tx({ account_id: main, direction: "out", amount: v, description: l, category: "Other", nature: "oneoff" });
        }
      }
    }

    // Projected unknown outflow ("Projected" in A, value in B)
    const pr = first("projected");
    if (pr) {
      const v = s.get("B" + splitRef(pr)[1]);
      if (isNum(v) && v) tx({ account_id: main, direction: "out", amount: v, description: "Projected outflow (from sheet)", category: "Other", nature: "oneoff" });
    }

    // Credit cards: any label ending in "card"; description / category / amount in 3 adjacent columns
    const cardLabels = Object.keys(at).filter((l) => /^.+\bcard( \d+)?$/.test(l) && !/^credit cards?$/.test(l));
    const cardCols = new Set(cardLabels.flatMap((l) => at[l]).map((ref) => splitRef(ref)[0]));
    for (const label of cardLabels) for (const ref of at[label]) {
      const [c, r] = splitRef(ref);
      if (!cardCols.has(c)) continue;
      const catCol = numToCol(colToNum(c) + 1), amtCol = numToCol(colToNum(c) + 2);
      const cardId = account(s.get(ref), { kind: "credit_card", role: "card" });
      const stop = new Set(cardLabels.concat(["annual expenses summary", "annual expenses this month"]));
      let sum = 0;
      for (const rr of blockRows(s, c, r + 2, stop, 30)) {
        const desc = clean(s.get(c + rr)), category = s.get(catCol + rr), v = s.get(amtCol + rr);
        if (!isNum(v) || !v || typeof category !== "string") continue;
        sum += v;
        tx({ account_id: cardId, direction: "out", amount: v, description: desc || "Card spend", ...cardLine(category) });
      }
      // Same rule as the sheet: statement amount on the header row if typed, else the total cell below it.
      const override = s.get(amtCol + r), totalCell = s.get(amtCol + (r + 1));
      const bill = isNum(override) ? override : isNum(totalCell) ? totalCell : sum;
      if (Math.round(bill) !== Math.round(sum)) warnings.push(`${name}: ${s.get(ref)} bill ${Math.round(bill)} vs line items ${Math.round(sum)}`);
      if (Math.round(bill) !== Math.round(sum)) tx({ account_id: cardId, direction: "out", amount: bill - sum, description: "Difference between bill and itemised lines (from sheet)", category: "Other", nature: "variable" });
      if (bill) tx({ account_id: main, to_account_id: cardId, direction: "transfer", amount: bill, description: `${s.get(ref)} bill`, category: "Other", nature: "variable" });
    }

    perMonth.push({ sheet: name, period, sheetOpening, sheetClosing });
    latest = { name, period, s, at, plannedRows };
  }

  // Monthly commitments from the latest month's planned cash; link every month's matching payments.
  for (const p of latest.plannedRows) commitmentIds[p.label] = add("commitment", { label: p.label, amount: p.amount, category: cashCategory(p.label), account_id: main, active_from: latest.period });
  for (const it of items) if (it.data._commitment) { it.data.recurring_id = commitmentIds[it.data._commitment] || null; delete it.data._commitment; }

  // Annual items from the latest month's "Annual Expenses Summary": label | total | paid | unpaid
  const ann = (latest.at["annual expenses summary"] || [])[0];
  let annualCount = 0;
  if (ann) {
    const [c, r] = splitRef(ann);
    const tc = numToCol(colToNum(c) + 1), pc = numToCol(colToNum(c) + 2);
    for (const rr of blockRows(latest.s, c, r + 1, new Set(["annual expenses this month"]), 3)) {
      const label = clean(latest.s.get(c + rr)), total = latest.s.get(tc + rr), paid = latest.s.get(pc + rr);
      if (!label || !isNum(total)) continue;
      add("annual", { year: +latest.period.slice(0, 4), label, total: Math.round(total), due_month: null, mode: "card", paid_external: isNum(paid) ? Math.round(paid) : 0 });
      annualCount++;
    }
  }

  // Month notes from the "Cashflow" sheet and dated snapshots from the "Checkpoint" sheet, when present.
  const chosen = new Set(perMonth.map((m) => m.period));
  let noteCount = 0, checkpointCount = 0;
  for (const n of await cashflowNotes(book)) if (chosen.has(n.period)) { add("note", n); noteCount++; }
  if (ctx.checkpoints !== false) for (const snap of await checkpointSnapshots(book)) { add("snapshot", snap); checkpointCount++; }

  // Opening balance of the main account = first month's sheet opening.
  const opening = { opening_balance: perMonth[0].sheetOpening || 0, opening_period: perMonth[0].period };

  // Reconcile: recompute each month from the imported records alone and compare with the sheet.
  const db = E.index([{ id: main, type: "account", data: { ...ctx.mainAccount.data, ...opening, role: "spending" } }, ...items]);
  for (const m of perMonth) {
    const s = E.summarize(db, m.period);
    m.closing = s.closing;
    m.diff = isNum(m.sheetClosing) ? Math.round(s.closing - m.sheetClosing) : null;
  }
  const counts = items.reduce((o, it) => ((o[it.type] = (o[it.type] || 0) + 1), o), {});
  return { items, opening, report: { months: perMonth, counts, annualCount, warnings, noteCount, checkpointCount } };
}

/** Notes row of a "Cashflow" year sheet: a row of text under the month header row (e.g. "Gujarat Trip bookings"). */
export async function cashflowNotes(book) {
  if (!book.sheetNames.includes("Cashflow")) return [];
  const s = await book.sheet("Cashflow");
  let headerRow = 0, cols = [];
  for (let r = 1; r <= Math.min(10, s.maxRow) && !headerRow; r++) {
    const found = [];
    for (let c = 1; c <= s.maxCol; c++) { const p = monthSheetPeriod(s.get(numToCol(c) + r)); if (p) found.push([numToCol(c), p]); }
    if (found.length >= 2) { headerRow = r; cols = found; }
  }
  if (!headerRow) return [];
  const out = [];
  for (let r = headerRow + 1; r <= s.maxRow; r++) {
    if (typeof s.get("A" + r) === "string" && s.get("A" + r).trim()) continue; // labelled metric rows
    for (const [c, period] of cols) {
      const v = s.get(c + r);
      if (typeof v === "string" && v.trim()) out.push({ period, text: v.trim().slice(0, 500) });
    }
  }
  return out;
}

/**
 * "Checkpoint" sheet: blocks that start with a date in column A, then a header row with
 * Savings (A/C), Expenses (E/G) and an unlabelled long-term block (Q/S), items listed below.
 */
export async function checkpointSnapshots(book) {
  if (!book.sheetNames.includes("Checkpoint")) return [];
  const s = await book.sheet("Checkpoint");
  const starts = [];
  for (let r = 1; r <= s.maxRow; r++) { const v = s.get("A" + r); if (isNum(v) && v > 30000 && v < 80000) starts.push(r); }
  return starts.map((r0, i) => {
    const r1 = (starts[i + 1] || s.maxRow + 1) - 1;
    const items = [];
    const take = (labelCol, valueCol, group, skipHeader) => {
      for (let r = r0 + 1; r <= r1; r++) {
        const label = clean(s.get(labelCol + r)), v = s.get(valueCol + r);
        if (!label || !isNum(v) || skipHeader.test(label)) continue;
        items.push({ group, label, amount: Math.round(v) });
      }
    };
    take("A", "C", "liquid", /^savings$/i);
    take("E", "G", "commitment", /^expenses$/i);
    take("Q", "S", "illiquid", /^$/);
    return { date: excelDate(s.get("A" + r0)), note: "Imported from Checkpoint sheet", items };
  }).filter((x) => x.items.length);
}
