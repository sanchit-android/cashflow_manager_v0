// Chat commands beyond adding entries: edit / remove rows, questions about a month, accounts, card billing,
// custom numbers, trends and charts. Rule-based and pure (no network); app.js carries the commands out.
// parseCommand(text, ctx) -> command | null (null = treat it as a normal entry).
//
// ctx = { today: "YYYY-MM-DD", accounts: [{ id, name, role, aliases }], categories: [..] }
import { normalize, parseAmount, parseDate, findAccounts, MONTHS, MONTH_RE, CATEGORY_WORDS } from "./parser.js";

const pad = (n) => String(n).padStart(2, "0");
const shift = (p, n) => { const [y, m] = p.split("-").map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`; };
const squash = (s) => s.replace(/\s+/g, " ").trim();
const cut = (s, m) => squash(s.slice(0, m.index) + " " + s.slice(m.index + m[0].length));
const titleCase = (s) => s.replace(/\b([a-z])/g, (c) => c.toUpperCase());
const ACRONYMS = new Set(["hdfc", "icici", "sbi", "idfc", "rbl", "hsbc", "au", "pnb", "bob", "ppf", "nps", "epf", "fd", "rd", "mf", "amex", "upi"]);
const prettyName = (s) => s.split(" ").map((w) => (ACRONYMS.has(w) ? w.toUpperCase() : titleCase(w))).join(" ");

export const HELP = [
  ["Add", ["450 swiggy", "1200 petrol with atlas yesterday", "add 200 to instamart"]],
  ["Change or remove", ["change swiggy to 500", "move uber to travel", "swiggy date 3 nov", "delete zomato in oct"]],
  ["Ask", ["how much did I spend?", "food total in oct", "totals by category", "what's left to pay", "infinia bill", "runway", "list swiggy"]],
  ["Accounts and cards", ["add card hdfc regalia", "new savings account sbi", "infinia billed 23,450", "unbill infinia"]],
  ["Custom numbers", ["add metric savings = income - spend", "show metrics", "remove metric savings"]],
  ["Trends and charts", ["spend trend", "food trend 12 months", "category trend", "top merchants", "savings rate", "compare oct vs sep"]],
];

// ---------------- months ----------------
const monthRe = new RegExp(`(?<![\\d/])(?<!\\d\\s)\\b(?:(in|for|of|during|from|vs|versus|and|with)\\s+)?(?:the\\s+month\\s+of\\s+)?${MONTH_RE}\\b(?:\\s+(20\\d{2})|\\s*'(\\d{2}))?`, "g");
const RELATIVE = /\b(?:(?:in|for|of|during|from|vs|with)\s+)?(this|current|last|previous|prev|next)\s+month\b|\b(\d{1,2})\s+months?\s+ago\b/g;

/** Every month named in the text, in order, as periods "YYYY-MM"; `rest` is the text without them. */
export function parseMonths(text, today) {
  const [ty, tm] = today.split("-").map(Number), cur = `${ty}-${pad(tm)}`;
  const found = [];
  for (const m of text.matchAll(RELATIVE)) {
    const n = m[2] ? -+m[2] : { this: 0, current: 0, last: -1, previous: -1, prev: -1, next: 1 }[m[1]];
    found.push({ index: m.index, len: m[0].length, period: shift(cur, n) });
  }
  for (const m of text.matchAll(monthRe)) {
    const word = m[2], year = m[3] ? +m[3] : m[4] ? 2000 + +m[4] : null;
    if (word === "may" && !m[1] && !year) continue; // "may" is usually the verb
    if (/^\s*\d/.test(text.slice(m.index + m[0].length)) && !year) continue; // "nov 3" is a date
    const mi = MONTHS.indexOf(word.slice(0, 3)) + 1;
    const y = year || (mi > tm ? ty - 1 : ty); // reviewing: a later month with no year means last year's
    found.push({ index: m.index, len: m[0].length, period: `${y}-${pad(mi)}` });
  }
  found.sort((a, b) => a.index - b.index);
  let rest = text;
  for (const f of [...found].reverse()) rest = rest.slice(0, f.index) + " " + rest.slice(f.index + f.len);
  return { periods: found.map((f) => f.period), rest: squash(rest) };
}
/** The one month a sentence is about, or null (the caller then uses the current month). */
export function parseMonth(text, today) {
  const { periods, rest } = parseMonths(text, today);
  return { period: periods[0] || null, rest };
}

// ---------------- shared bits ----------------
const NATURE_WORDS = { recurring: "recurring", fixed: "recurring", commitment: "recurring", variable: "variable", "day to day": "variable",
  "one off": "oneoff", "one-off": "oneoff", oneoff: "oneoff", annual: "annual", yearly: "annual", emergency: "emergency", investment: "investment" };
function categoryOf(s, ctx) {
  s = squash(s.replace(/\b(the|category|under|as)\b/g, ""));
  const list = ctx.categories || [];
  const hit = list.find((c) => c.toLowerCase() === s);
  return hit || CATEGORY_WORDS[s] || null;
}
const natureOf = (s) => NATURE_WORDS[squash(s.replace(/\b(the|kind|as|an?|item|expense|spend)\b/g, ""))] || null;
/** An account named in the words, or null: { ids, words left over }. */
function accountIn(text, ctx, { preps = null, roles = null } = {}) {
  const tokens = text.split(" ").filter(Boolean);
  const accts = (ctx.accounts || []).filter((a) => !roles || roles.includes(a.role));
  const ms = findAccounts(tokens, accts).filter((m) => !preps || preps.includes(m.prep)).sort((a, b) => b.strength - a.strength);
  if (!ms.length) return null;
  const m = ms[0], from = preps && preps.includes(m.prep) ? m.start - 1 : m.start;
  return { ids: m.ids, rest: squash(tokens.filter((_, i) => i < from || i >= m.end).join(" ").replace(/\b(account|card|a\/c)\b/g, "")) };
}
/** Which rows a phrase means: "the 450 swiggy on 5 nov on infinia in oct" -> { target, period, date, amount, account_ids }. */
function rowFilter(text, ctx) {
  const f = {};
  const mo = parseMonth(text, ctx.today); if (mo.period) { f.period = mo.period; text = mo.rest; }
  const dt = parseDate(text, ctx.today); if (dt.explicit && !dt.approx) { f.date = dt.date; text = dt.rest; }
  const ac = accountIn(text, ctx, { preps: ["on", "with", "from", "via", "using", "in"] }); if (ac && ac.rest) { f.account_ids = ac.ids; text = ac.rest; }
  const am = parseAmount(text); if (am) { f.amount = am.value; text = cut(text, { index: am.index, 0: am.match }); }
  f.target = squash(text.replace(/\b(the|my|entry|row|transaction|item|one|for|of|that|this|on|from|it|please|pls)\b/g, ""));
  return f;
}

// ---------------- parsers ----------------
function parseMetric(t, raw) {
  let m = /^(?:remove|delete|drop|hide)\s+(?:the\s+)?(?:custom\s+)?(?:metric|number|kpi)\s+(.+)$/.exec(t);
  if (m) return { kind: "metric", action: "remove", label: m[1] };
  if (/^(?:show|list|what are)?\s*(?:my\s+)?(?:the\s+)?(?:custom\s+)?(?:metrics|numbers|kpis)\b/.test(t)) return { kind: "query", what: "metrics" };
  m = /^(?:add|create|new|make|define)\s+(?:a\s+)?(?:new\s+)?(?:custom\s+)?(?:metric|number|kpi|formula)\s+(?:called\s+|named\s+)?(.+?)\s*(?:=|:|\bas\b)\s*(.+)$/i.exec(raw.trim());
  if (!m) return null;
  let formula = m[2].trim(), format = null;
  const pm = /\s+(?:in|as)\s+(percent|percentage|%|months|amount|money|number)\s*$/i.exec(formula);
  if (pm) { format = { percent: "percent", percentage: "percent", "%": "percent", months: "months", number: "number" }[pm[1].toLowerCase()] || "money"; formula = formula.slice(0, pm.index); }
  return { kind: "metric", action: "add", label: m[1].trim().replace(/^["“]|["”]$/g, ""), formula: formula.trim(), format };
}

function parseAccount(t, ctx) {
  const m = /^(?:add|create|new|open|set up|setup)\s+(?:a\s+|an\s+)?(?:new\s+)?(.+)$/.exec(t);
  if (!m || !/\b(account|card|a\/c|wallet|fd|fixed deposit|mutual fund|demat|ppf|nps)\b/.test(t)) return null;
  let body = m[1], balance = null;
  const bm = /\b(?:with\s+)?(?:an?\s+)?(?:opening\s+)?(?:balance|bal)\s+(?:of\s+)?(\S+(?:\s*(?:k|l|lakh|lakhs|cr))?)/.exec(body);
  if (bm) { const a = parseAmount(bm[1]); if (a) balance = a.value; body = cut(body, bm); }
  if (parseAmount(body)) return null; // "add 500 to infinia card" is an entry
  const role = /\bcredit card\b|\bcard\b/.test(body) ? "card"
    : /\b(mutual fund|mf|stocks?|shares|demat|ppf|nps|epf|investment|invest)\b/.test(body) ? "investment"
    : /\b(savings?|fd|fixed deposit|rd)\b/.test(body) ? "savings" : "spending";
  const kind = /\b(cash|wallet)\b/.test(body) ? "cash" : null;
  const named = /\b(?:called|named)\s+(.+)$/.exec(body);
  let name = named ? named[1] : body.replace(/\b(account|a\/c|credit|card|bank|a|an|new|my|for|savings|saving)\b/g, " ");
  name = squash(name);
  if (!named && role === "savings" && /\bsavings?\b/.test(body)) name = squash(name + " savings");
  if (!name) return { kind: "account", error: "name" };
  if ((ctx.accounts || []).some((a) => a.name.toLowerCase() === name)) return { kind: "account", error: "exists", name: prettyName(name) };
  return { kind: "account", name: prettyName(name), role, ...(kind ? { account_kind: kind } : {}), ...(balance != null ? { balance } : {}) };
}

function parseBill(t, ctx) {
  const unbill = /\b(unbill|unmark|not billed|undo bill|remove bill)/.test(t);
  if (!unbill && !/\bbilled\b|\bstatement\b/.test(t)) return null;
  const mo = parseMonth(t, ctx.today);
  let rest = mo.rest.replace(/\b(mark|marked|unmark|unbill|as|is|was|the|my|billed|bill|statement|amount|at|for|with|of|came|not|undo|remove)\b/g, " ");
  const am = parseAmount(rest);
  if (am) rest = cut(rest, { index: am.index, 0: am.match });
  const cards = (ctx.accounts || []).filter((a) => a.role === "card");
  const ac = accountIn(squash(rest), { ...ctx, accounts: cards });
  return { kind: "bill", unbill, card_ids: ac ? ac.ids : cards.map((c) => c.id), named: !!ac, amount: am ? am.value : null, period: mo.period };
}

function parseRemove(t, ctx) {
  const m = /^(?:delete|remove|drop|erase|scrap|get rid of)\s+(.+)$/.exec(t);
  if (!m) return null;
  const f = rowFilter(m[1], ctx);
  if (!f.target && f.amount == null && !f.date) return null;
  return { kind: "remove", ...f };
}

function editValue(v, field, ctx) {
  v = squash(v);
  if (field === "description") return v ? { description: v } : null;
  if (!field || field === "date") { const d = parseDate(v, ctx.today); if (d.explicit && !d.approx && !d.rest.replace(/\b(on|the)\b/g, "").trim()) return { date: d.date }; }
  if (!field || field === "amount") { const a = parseAmount(v); if (a && !v.replace(a.match, "").replace(/\b(rs|inr)\b/g, "").trim()) return { amount: a.value }; }
  if (!field || field === "category") { const c = categoryOf(v, ctx); if (c) return { category: c }; }
  if (!field || field === "nature") { const n = natureOf(v); if (n) return { nature: n }; }
  if (!field || field === "account") { const a = accountIn(v, ctx); if (a && !a.rest) return { account_ids: a.ids }; }
  return null;
}
const FIELDS = { amount: "amount", price: "amount", date: "date", day: "date", category: "category", cat: "category", kind: "nature", type: "nature",
  account: "account", card: "account", description: "description", name: "description" };
function parseEdit(t, ctx) {
  let m, target, value, field = null;
  if ((m = /^rename\s+(.+?)\s+(?:to|as)\s+(.+)$/.exec(t))) { target = m[1]; value = m[2]; field = "description"; }
  else if ((m = /^(?:change|edit|set|make|fix|correct|update)\s+(.+?)\s+(?:to|as|=|into)\s+(.+)$/.exec(t))) { target = m[1]; value = m[2]; }
  else if ((m = /^(?:move|put|shift|re-?categori[sz]e|categori[sz]e|mark|tag)\s+(.+?)\s+(?:to|under|in|into|as)\s+(.+)$/.exec(t)) && !parseAmount(t)) { target = m[1]; value = m[2]; }
  else if ((m = /^(.+?)\s+(?:was|should be|should have been|is actually|was actually|actually)\s+(.+)$/.exec(t))) { target = m[1]; value = m[2]; }
  else if ((m = /^(.+?)\s+(date|day|category|kind)\s+(?:is\s+)?(.+)$/.exec(t))) { target = m[1]; field = FIELDS[m[2]]; value = m[3]; }
  else return null;
  // "change swiggy amount to 500", "change the category of swiggy to food"
  const fm = /^(?:the\s+)?(amount|price|date|day|category|cat|kind|type|account|card|description|name)\s+(?:of|for|on)\s+(.+)$/.exec(target) || /^(.+?)\s+(amount|price|date|day|category|cat|kind|type|account|description|name)$/.exec(target);
  if (fm) { const [a, b] = FIELDS[fm[1]] ? [fm[1], fm[2]] : [fm[2], fm[1]]; field = FIELDS[a]; target = b; }
  const set = editValue(value, field, ctx);
  if (!set) return null;
  const f = rowFilter(target, ctx);
  if (!f.target && f.amount == null) return null;
  return { kind: "edit", ...f, set };
}

function parseChart(t, ctx) {
  if (!/\b(trends?|chart|graph|plot|over time|history|compare|comparison|vs|versus|merchants?|savings rate|month on month|mom)\b/.test(t)) return null;
  const { periods, rest } = parseMonths(t, ctx.today);
  const nm = /\b(?:last|past)?\s*(\d{1,2})\s*months?\b/.exec(rest);
  const months = nm ? Math.max(2, Math.min(24, +nm[1])) : /\b(year|12 months|annual)\b/.test(rest) ? 12 : /\bquarter\b/.test(rest) ? 3 : 6;
  const base = { kind: "chart", months, end: null };
  if (/\b(compare|comparison|vs|versus)\b/.test(t)) {
    const [a, b] = periods;
    const cur = ctx.period || ctx.today.slice(0, 7);
    // "compare with last month" = this month against that one; "compare oct" = oct against the month before.
    return { ...base, type: "compare", periods: a && b ? [a, b] : a ? (/\b(with|vs|versus|to|against)\b/.test(t) ? [cur, a] : [a, shift(a, -1)]) : [cur, shift(cur, -1)] };
  }
  if (periods.length) base.end = periods[0];
  if (/\bmerchants?\b|\bwhere\b/.test(rest)) return { ...base, type: "merchants" };
  if (/\bsavings? rate\b|\bsaving\b/.test(rest)) return { ...base, type: "savings" };
  if (/\bincome\b/.test(rest)) return { ...base, type: "income" };
  const cat = rest.split(" ").map((w) => categoryOf(w, ctx)).find(Boolean);
  if (cat) return { ...base, type: "category", category: cat };
  if (/\bcategor/.test(rest)) return { ...base, type: "categories" };
  return { ...base, type: "spend" };
}

const Q_START = /^(how|what|whats|what's|which|show|list|tell|give|total|totals|did|do|am|is|are|where|when|any|sum|check|review|see)\b/;
const Q_ALONE = /^(runway|summary|overview|totals?|categories|category totals|by category|breakdown|income|spend|spending|expenses?|net|balance|balances|due|pending|(?:card |credit card )?bills?|cards|status)$/;
const Q_STOP = new Set(["how", "much", "many", "did", "do", "does", "i", "we", "me", "my", "spend", "spent", "spending", "on", "at", "for", "in", "the", "what", "whats", "what's",
  "is", "was", "are", "were", "total", "totals", "show", "list", "all", "give", "tell", "of", "a", "an", "so", "far", "expense", "expenses", "transactions", "entries",
  "rows", "money", "there", "any", "have", "has", "been", "to", "with", "from", "pay", "paid", "cost", "costs", "sum", "check", "review", "see", "where", "when",
  "it", "this", "that", "please", "pls", "us", "our", "went", "go", "goes", "about", "amount", "be", "can", "you", "up", "than", "category", "and"]);
const stripMonthYear = (t) => t.replace(/\b20\d{2}\b/g, " ");
function parseQuery(t, ctx) {
  const ask = /\?$/.test(t) || Q_START.test(t) || (!parseAmount(stripMonthYear(t)) && (Q_ALONE.test(parseMonth(t, ctx.today).rest) || /\b(total|totals|so far|this month|last month)\b|^(balance|outstanding)\b|\b(bill|balance|outstanding)$/.test(t)));
  if (!ask) return null;
  const { period, rest: r0 } = parseMonth(t.replace(/\?+$/, ""), ctx.today);
  const rest = squash(r0.replace(/\?/g, ""));
  const q = { kind: "query", period };
  if (/\b(runway|how long|last me|run out)\b/.test(rest)) return { ...q, what: "runway" };
  if (/\b(left to pay|still to pay|still due|pending|unpaid|due|commitments?)\b/.test(rest)) return { ...q, what: "pending" };
  if (/\bcategor|\bbreakdown\b|\bsplit\b/.test(rest)) return { ...q, what: "categories" };
  if (/\b(summary|overview|how am i doing|how('s| is| did) (the |this |my )?month|status)\b/.test(rest)) return { ...q, what: "summary" };
  const ac = accountIn(rest, ctx);
  if (ac && /\b(bill|statement|owe|outstanding|due)\b/.test(rest)) return { ...q, what: "bill", account_ids: ac.ids };
  if (/\bbalances?\b/.test(rest)) return ac ? { ...q, what: "balance", account_ids: ac.ids } : { ...q, what: "balances" };
  if (/\b(bills|cards)\b/.test(rest) && !ac) return { ...q, what: "bills" };
  if (/\b(income|earn|earned|received|salary)\b/.test(rest)) return { ...q, what: "income" };
  if (/\b(net|ahead|behind|saved|surplus|deficit|left over|leftover)\b/.test(rest)) return { ...q, what: "net" };
  const cat = rest.split(" ").map((w) => categoryOf(w, ctx)).find(Boolean);
  const nat = /\b(annual|one off|one-off|oneoff|fixed|recurring|investments?)\b/.exec(rest);
  if (cat && !ac) return { ...q, what: "category", category: cat };
  if (nat && !ac) return { ...q, what: "nature", nature: natureOf(nat[1]) || (nat[1].startsWith("invest") ? "investment" : null) };
  const words = rest.split(" ").filter((w) => w && !Q_STOP.has(w) && !(cat && categoryOf(w, ctx)));
  const target = ac ? ac.rest.split(" ").filter((w) => w && !Q_STOP.has(w)).join(" ") : words.join(" ");
  if (target || ac) return { ...q, what: "rows", target, ...(ac ? { account_ids: ac.ids } : {}) };
  if (/\b(spen|expense|cost)/.test(rest)) return { ...q, what: "spend" };
  return { ...q, what: "summary" };
}

/** A chat message as a command, or null when it should be read as an entry. */
export function parseCommand(text, ctx) {
  const raw = String(text || "").trim();
  const t = normalize(raw).replace(/[.!]+$/, "").trim();
  if (!t) return null;
  if (/^(help|\?|commands|what can (you|i) do|what can i (say|type|ask)|how does this work)\??$/.test(t)) return { kind: "help" };
  return parseMetric(t, raw) || parseAccount(t, ctx) || parseBill(t, ctx) || parseRemove(t, ctx) || parseEdit(t, ctx) || parseChart(t, ctx) || parseQuery(t, ctx);
}
