// Pure helpers for the grid: formulas, date entry, formatting, and description suggestions.

// ---------- formulas: =121+347+103, =(115000+50000)*1.01475, =45000*5% ----------
/** Evaluate an arithmetic formula safely (no eval). Returns a number or throws. */
export function evalFormula(text) {
  const src = String(text).trim().replace(/^=/, "").replace(/,/g, "");
  const toks = src.match(/\d+(?:\.\d+)?%?|\.\d+%?|[-+*/()]|\S/g) || [];
  let i = 0;
  const peek = () => toks[i], next = () => toks[i++];
  const num = (t) => (t.endsWith("%") ? parseFloat(t) / 100 : parseFloat(t));
  function factor() {
    const t = next();
    if (t === "-") return -factor();
    if (t === "+") return factor();
    if (t === "(") { const v = expr(); if (next() !== ")") throw new Error("Missing )"); return v; }
    if (t !== undefined && /^[\d.]/.test(t)) return num(t);
    throw new Error("Check the formula");
  }
  function term() {
    let v = factor();
    while (peek() === "*" || peek() === "/") {
      const op = next(), r = factor();
      if (op === "/" && r === 0) throw new Error("Can't divide by zero");
      v = op === "*" ? v * r : v / r;
    }
    return v;
  }
  function expr() {
    let v = term();
    while (peek() === "+" || peek() === "-") v = next() === "+" ? v + term() : v - term();
    return v;
  }
  if (!toks.length) throw new Error("Empty formula");
  const v = expr();
  if (i !== toks.length || !Number.isFinite(v)) throw new Error("Check the formula");
  return Math.round(v * 100) / 100;
}

/** Parse what a user typed into an amount cell. Returns { value, formula } or null for empty. */
export function parseAmountInput(text) {
  const s = String(text ?? "").trim();
  if (!s) return null;
  if (s.startsWith("=")) return { value: evalFormula(s), formula: s };
  const clean = s.replace(/[₹$,\s]/g, "");
  const neg = /^\(.*\)$/.test(clean);
  const n = parseFloat(clean.replace(/[()]/g, ""));
  if (!Number.isFinite(n)) throw new Error("Enter a number, or a formula starting with =");
  return { value: neg ? -n : n, formula: null };
}

// ---------- dates ----------
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n) => String(n).padStart(2, "0");
export const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

/**
 * Parse a typed date. `period` (YYYY-MM) fills in a missing month/year, like Excel fills the current year.
 * Accepts: 5 | 5/10 | 5-10-26 | 05/10/2026 | 2026-10-05 | 5 oct | t / today | y / yesterday
 */
export function parseDateInput(text, period) {
  const s = String(text ?? "").trim().toLowerCase();
  if (!s) return null;
  if (s === "t" || s === "today") return todayISO();
  if (s === "y" || s === "yesterday") { const d = new Date(Date.now() - 864e5); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
  const [py, pm] = (period || todayISO().slice(0, 7)).split("-").map(Number);
  let y, m, d, mm;
  if ((mm = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) [y, m, d] = [+mm[1], +mm[2], +mm[3]];
  else if ((mm = s.match(/^(\d{1,2})(?:[/.-](\d{1,2})(?:[/.-](\d{2,4}))?)?$/))) {
    d = +mm[1]; m = mm[2] ? +mm[2] : pm; y = mm[3] ? (+mm[3] < 100 ? 2000 + +mm[3] : +mm[3]) : py;
  } else if ((mm = s.match(/^(\d{1,2})\s*([a-z]{3})[a-z]*\s*(\d{2,4})?$/))) {
    const i = MON.findIndex((x) => x.toLowerCase() === mm[2]);
    if (i < 0) return null;
    d = +mm[1]; m = i + 1; y = mm[3] ? (+mm[3] < 100 ? 2000 + +mm[3] : +mm[3]) : py;
  } else return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

export function formatDate(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}-${MON[+m - 1]}-${y.slice(2)}`;
}

export function formatAmount(n) {
  if (n === null || n === undefined || n === "") return "";
  const v = Number(n);
  if (!Number.isFinite(v)) return "";
  const s = Math.abs(v).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  return v < 0 ? `(${s})` : s;
}

// ---------- description suggestions ----------
export const normDesc = (s) => String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Learn from past transactions. Latest use of a description wins.
 * Returns { complete(prefix) -> string|null, list(prefix, n) -> [string], infer(desc) -> {fields}|null }
 */
export function buildSuggest(transactions, fields = ["direction", "to_account_id", "category", "nature"]) {
  const byDesc = new Map(); // norm -> { text, fields, count, date }
  for (const t of [...transactions].sort((a, b) => String(a.date).localeCompare(String(b.date)))) {
    const k = normDesc(t.description);
    if (!k) continue;
    const prev = byDesc.get(k);
    const f = Object.fromEntries(fields.filter((x) => t[x] !== undefined && t[x] !== null && t[x] !== "").map((x) => [x, t[x]]));
    byDesc.set(k, { text: String(t.description).trim(), fields: f, count: (prev ? prev.count : 0) + 1, date: t.date });
  }
  const entries = [...byDesc.values()].sort((a, b) => b.count - a.count || String(b.date).localeCompare(String(a.date)));
  const firstWord = (s) => normDesc(s).split(" ")[0];
  return {
    complete(prefix) {
      const p = normDesc(prefix);
      if (!p) return null;
      const hit = entries.find((e) => normDesc(e.text).startsWith(p) && normDesc(e.text) !== p);
      return hit ? hit.text : null;
    },
    list(prefix, n = 6) {
      const p = normDesc(prefix);
      if (!p) return [];
      const starts = entries.filter((e) => normDesc(e.text).startsWith(p));
      const contains = entries.filter((e) => !normDesc(e.text).startsWith(p) && normDesc(e.text).includes(p));
      return [...starts, ...contains].slice(0, n).map((e) => e.text);
    },
    infer(desc) {
      const k = normDesc(desc);
      if (!k) return null;
      if (byDesc.has(k)) return { ...byDesc.get(k).fields };
      // "swiggy food" -> learn from the most-used entry with the same first word
      const w = firstWord(k);
      const hit = w.length >= 3 && entries.find((e) => firstWord(e.text) === w);
      return hit ? { ...hit.fields } : null;
    },
  };
}
