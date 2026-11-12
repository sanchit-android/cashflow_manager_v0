// Plain-English entry parser for the chat box. Rule-based, no network, no AI.
// parseEntry(text, ctx) -> [Draft]. It never saves anything; the caller turns drafts into records.
//
// ctx = {
//   today: "YYYY-MM-DD",
//   settings: { period_mode, cycle_day },
//   accounts:    [{ id, name, role, kind, aliases, is_default_spending, closed_from }],
//   commitments: [{ id, label, amount, category, account_id, aliases, paid }],   // paid: already paid this period
//   annual:      [{ id, label, total, year, aliases }],
//   income:      [{ id, label, kind, amount, account_id, aliases }],
//   defaultAccountId,            // account in view, used for spends
//   infer(description) -> { category, nature, ... } | null   // learned from past transactions
//   categories: [..]
// }
//
// Draft = { raw, direction, amount, date, approx_date, period, account_id, to_account_id, description, category, nature,
//           recurring_id, annual_id, income_id, new_account, future, slots: { amount, date, account, to_account, category }, ask }
// slot values: "explicit" | "inferred" | "missing". `ask` is one follow-up question: { slot, text, options: [[value, label]] }.

export const CATEGORIES_DEFAULT = ["Food", "Grocery", "Utilities", "Vehicle", "Health", "Travel", "Holiday", "Entertainment",
  "Shopping", "Transport", "Personal", "Household", "Education", "Insurance", "Rent", "Family", "Gift", "Emergency", "Other"];

// Intent words. Checked in this order: refund, transfer, in, out. No intent word -> out.
export const INTENTS = {
  refund: ["refund", "refunded", "cashback", "reversed", "reversal", "returned"],
  transfer: ["moved", "move", "transferred", "transfer", "invested", "invest", "sip", "withdrew", "withdraw", "withdrawn",
    "deposited", "deposit", "lent", "lend", "loaned", "got back"],
  in: ["received", "receive", "got", "credited", "salary", "income", "interest", "came", "earned"],
  out: ["spent", "spend", "paid", "pay", "bought", "buy", "gave", "give", "bill"],
};

// Merchant -> category seed list. Learned history and explicit words win over this.
export const MERCHANTS = {
  Food: ["swiggy", "zomato", "dominos", "domino's", "pizza", "restaurant", "cafe", "coffee", "starbucks", "lunch", "dinner", "breakfast", "chai", "eatfit", "mcdonalds", "kfc"],
  Grocery: ["blinkit", "zepto", "bigbasket", "instamart", "dmart", "grocery", "groceries", "vegetables", "veggies", "fruits", "milk", "kirana", "jiomart"],
  Vehicle: ["petrol", "diesel", "fuel", "car wash", "service", "fastag", "parking", "tyre"],
  Transport: ["uber", "ola", "rapido", "auto", "metro", "taxi", "cab", "bus"],
  Travel: ["flight", "indigo", "irctc", "train", "makemytrip", "goibibo", "hotel", "airbnb"],
  Utilities: ["electricity", "power bill", "water bill", "gas", "broadband", "wifi", "airtel", "jio", "vi", "recharge", "dth", "tata play", "bescom"],
  Health: ["pharmacy", "medicine", "medicines", "apollo", "doctor", "hospital", "lab", "pharmeasy", "1mg", "netmeds", "dentist"],
  Shopping: ["amazon", "flipkart", "myntra", "ajio", "nykaa", "meesho", "croma", "decathlon", "ikea"],
  Entertainment: ["netflix", "prime", "hotstar", "spotify", "movie", "movies", "bookmyshow", "pvr", "inox"],
  Education: ["school", "tuition", "books", "course", "udemy", "coaching"],
  Household: ["maid", "cook", "driver", "laundry", "urban company", "plumber", "electrician", "cleaning"],
  Insurance: ["insurance", "premium", "lic"],
  Personal: ["salon", "haircut", "gym", "spa"],
  Rent: ["rent"],
  Gift: ["gift", "gifts"],
  Family: ["parents", "family"],
};

// Category words a person might type explicitly ("450 swiggy grocery").
const CATEGORY_WORDS = {
  food: "Food", grocery: "Grocery", groceries: "Grocery", utilities: "Utilities", utility: "Utilities", vehicle: "Vehicle", car: "Vehicle",
  health: "Health", medical: "Health", travel: "Travel", holiday: "Holiday", vacation: "Holiday", entertainment: "Entertainment",
  shopping: "Shopping", transport: "Transport", personal: "Personal", household: "Household", education: "Education",
  insurance: "Insurance", family: "Family", gift: "Gift", emergency: "Emergency",
};

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MONTH_RE = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const FILLER = new Set(["on", "at", "for", "the", "to", "with", "via", "using", "from", "in", "into", "a", "an", "of", "my", "by", "and", "was", "is", "me", "rs", "inr", "amount", "worth"]);
const PAY_PREPS = new Set(["with", "on", "via", "using", "by", "from"]);
const GENERIC = new Set(["bank", "card", "credit", "debit", "account", "acct", "ac", "a/c", "the", "of", "my", "and", "main", "new", "old", "pay", "co", "ltd", "india", "limited"]);
const MERCHANT_WORDS = new Set(Object.values(MERCHANTS).flat());
const INTENT_WORDS = new Set(Object.values(INTENTS).flat().filter((w) => !w.includes(" ")));
// Words in planned-item labels that are too common to identify one on their own.
const WEAK_LINK = new Set(["fee", "fees", "bill", "payment", "monthly", "annual", "child", "kid", "help", "for", "the", "and", "of", "to", "emi", "1", "2", "3"]);

const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const fromIso = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const addDays = (s, n) => { const d = fromIso(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
const daysIn = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const titleCase = (s) => s.replace(/\b([a-z])/g, (c) => c.toUpperCase());
const words = (s) => String(s || "").toLowerCase().replace(/[–—\-_/()]+/g, " ").split(/\s+/).filter(Boolean);

export function levenshtein(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m || !n) return m || n;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}

// ---------------- normalize & split ----------------
export function normalize(text) {
  return String(text || "").toLowerCase()
    .replace(/₹/g, " ")
    .replace(/\b(?:rs\.?|inr)\s*(?=\d)/g, " ")
    .replace(/(\d)\s*\/-/g, "$1")
    .replace(/[“”"]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const AMOUNT_TOKEN = /(?<![\w.])(\d[\d,]*(?:\.\d+)?)(?:\s*(k|thousand|l|lakhs?|lacs?|cr|crores?))?(?![\w])/;

/** Split "450 swiggy, 1200 petrol atlas and 300 auto" into one piece per entry. Pieces without an amount stay with the one before. */
export function splitEntries(text) {
  const out = [];
  for (const line of String(text || "").split(/[\n;]+/)) {
    const parts = line.split(/(?<!\d),|,(?!\d)|\s+and\s+|\s+&\s+/i).map((s) => s.trim()).filter(Boolean);
    const pieces = [];
    for (const p of parts) {
      const n = normalize(p);
      // "paid maid" has no amount but is its own entry (the commitment fills it in); "paid with infinia" is not.
      const verbStart = INTENT_WORDS.has(n.split(" ")[0]) && !/^\S+\s+(with|by|using|via|on|from)\b/.test(n);
      const hasAmt = AMOUNT_TOKEN.test(stripDates(n)) || verbStart;
      if (pieces.length && (!hasAmt || !pieces[pieces.length - 1].hasAmt)) {
        const last = pieces[pieces.length - 1];
        const joiner = hasAmt ? " and " : ", ";
        // "lent 25k to ravi and priya" -> keep together; "450 swiggy, upi" -> keep together
        if (!hasAmt) { last.text += " " + p; continue; }
        last.text += joiner + p; last.hasAmt = true; continue;
      }
      pieces.push({ text: p, hasAmt });
    }
    out.push(...pieces.map((p) => p.text));
  }
  return out.filter((s) => s.trim());
}

// ---------------- amount ----------------
const MULT = { k: 1e3, thousand: 1e3, l: 1e5, lakh: 1e5, lakhs: 1e5, lac: 1e5, lacs: 1e5, cr: 1e7, crore: 1e7, crores: 1e7 };

/** First amount in the text. Supports 1,20,000 · 1.2L · 1.2 lakh · 50k · 2 cr · 347+273+103. Returns { value, match, grouped } or null. */
export function parseAmount(text) {
  const sum = /(?<![\w.])(\d[\d,]*(?:\.\d+)?(?:\s*\+\s*\d[\d,]*(?:\.\d+)?)+)(?![\w])/.exec(text);
  if (sum) {
    const value = sum[1].split("+").reduce((s, x) => s + parseFloat(x.replace(/[,\s]/g, "")), 0);
    return { value: Math.round(value * 100) / 100, match: sum[0], index: sum.index, grouped: true };
  }
  const m = AMOUNT_TOKEN.exec(text);
  if (!m) return null;
  const base = parseFloat(m[1].replace(/,/g, ""));
  if (!Number.isFinite(base)) return null;
  const mult = m[2] ? MULT[m[2]] || 1 : 1;
  return { value: Math.round(base * mult * 100) / 100, match: m[0], index: m.index, grouped: false };
}

// ---------------- date ----------------
const monthIndex = (s) => MONTHS.indexOf(s.slice(0, 3));

/** Remove date phrases so their numbers aren't read as amounts. */
function stripDates(text) { return parseDate(text, "2000-01-01").rest; }

/**
 * Dates: today, yesterday, day before yesterday, last friday, on monday, 3 nov, nov 3, 3rd nov, 3/11 (= 3 Nov), on 3rd,
 * "for october" / "in october" (no day -> approximate). Returns { date, approx, period, rest, explicit }.
 */
export function parseDate(text, todayStr, settings = {}) {
  const [ty, tm, td] = todayStr.split("-").map(Number);
  let rest = text, date = null, approx = false, period = null;
  const take = (re, fn) => {
    if (date) return;
    const m = re.exec(rest);
    if (!m) return;
    const r = fn(m);
    if (!r) return;
    date = r; rest = (rest.slice(0, m.index) + " " + rest.slice(m.index + m[0].length)).replace(/\s+/g, " ").trim();
  };
  // A date in the past if no year is given and the day would otherwise be far in the future.
  const ymd = (y, m, d) => {
    if (m < 1 || m > 12 || d < 1 || d > daysIn(y, m)) return null;
    return `${y}-${pad(m)}-${pad(d)}`;
  };
  const guessYear = (m, d) => {
    const s = ymd(ty, m, d);
    if (!s) return null;
    // More than ~2 months ahead with no year typed: they mean last year.
    return s > addDays(todayStr, 60) ? ymd(ty - 1, m, d) : s;
  };
  take(/\b(?:on\s+)?day before yesterday\b/, () => addDays(todayStr, -2));
  take(/\b(?:on\s+)?yesterday\b|\byday\b/, () => addDays(todayStr, -1));
  take(/\b(?:on\s+)?today\b/, () => todayStr);
  take(/\b(?:on\s+)?tomorrow\b/, () => addDays(todayStr, 1));
  take(new RegExp(`\\b(?:on\\s+)?(?:the\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH_RE}\\b(?:,?\\s+(\\d{4}))?`), (m) =>
    m[3] ? ymd(+m[3], monthIndex(m[2]) + 1, +m[1]) : guessYear(monthIndex(m[2]) + 1, +m[1]));
  take(new RegExp(`\\b(?:on\\s+)?${MONTH_RE}\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?:,?\\s+(\\d{4}))?`), (m) =>
    m[3] ? ymd(+m[3], monthIndex(m[1]) + 1, +m[2]) : guessYear(monthIndex(m[1]) + 1, +m[2]));
  // Indian order: 3/11 = 3 Nov
  take(/(?<![\d,.])(?:on\s+)?(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?(?![\d/])/, (m) => {
    const y = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : null;
    return y ? ymd(y, +m[2], +m[1]) : guessYear(+m[2], +m[1]);
  });
  take(/\b(?:last|on|this past)\s+(sun|mon|tues?|wed(?:nes)?|thu(?:rs)?|fri|sat(?:ur)?)(?:day)?\b/, (m) => {
    const want = DAYS.findIndex((d) => d.startsWith(m[1].slice(0, 3)));
    const now = fromIso(todayStr).getUTCDay();
    let back = (now - want + 7) % 7;
    if (back === 0) back = 7;
    return addDays(todayStr, -back);
  });
  // "on 3rd" / "on the 3rd": this month, or last month if that day hasn't come yet.
  take(/\bon\s+(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)\b/, (m) => {
    const d = +m[1];
    if (d <= td) return ymd(ty, tm, d);
    const pm = tm === 1 ? 12 : tm - 1, py = tm === 1 ? ty - 1 : ty;
    return ymd(py, pm, d);
  });
  const explicit = !!date;
  if (!date) {
    // "for october", "in oct", "oct" at the end -> approximate date in that month's period
    const m = new RegExp(`\\b(?:for|in|during)\\s+(?:the\\s+month\\s+of\\s+)?${MONTH_RE}\\b(?:\\s+(\\d{4}))?`).exec(rest);
    if (m) {
      const mi = monthIndex(m[1]) + 1;
      let y = m[2] ? +m[2] : ty;
      if (!m[2] && mi > tm + 2) y -= 1;
      period = `${y}-${pad(mi)}`;
      approx = true;
      if (settings.period_mode === "pay_cycle" && settings.cycle_day) date = ymd(y, mi, Math.min(settings.cycle_day, daysIn(y, mi)));
      else if (period === `${ty}-${pad(tm)}`) date = todayStr;
      else date = ymd(y, mi, daysIn(y, mi));
      rest = (rest.slice(0, m.index) + " " + rest.slice(m.index + m[0].length)).replace(/\s+/g, " ").trim();
    }
  }
  return { date: date || todayStr, approx, period, rest, explicit: explicit || approx };
}

// ---------------- intent ----------------
export function detectIntent(text) {
  const has = (w) => (w.includes(" ") ? text.includes(w) : new RegExp(`\\b${w}\\b`).test(text));
  if (has("got back")) return { intent: "transfer", word: "got back", sub: "got_back" };
  for (const k of ["refund", "transfer", "in", "out"]) {
    const w = INTENTS[k].find(has);
    if (!w) continue;
    // "returned" is a refund only with a merchant/card; "returned 10k to ravi" isn't a refund — treat as transfer back.
    const sub = k === "transfer" ? ({ invested: "invest", invest: "invest", sip: "invest", withdrew: "withdraw", withdraw: "withdraw", withdrawn: "withdraw",
      deposited: "deposit", deposit: "deposit", lent: "lend", lend: "lend", loaned: "lend" })[w] || "move" : k === "refund" ? (w === "cashback" ? "cashback" : "refund") : null;
    return { intent: k, word: w, sub };
  }
  return { intent: "out", word: null, sub: null, implicit: true };
}

// ---------------- accounts ----------------
function accountPhrases(a) {
  const nameWords = words(a.name).filter((w) => w.length > 1);
  const phrases = new Map(); // phrase -> strength (number of words; full name +1)
  const add = (p, s) => { if (p && (!phrases.has(p) || phrases.get(p) < s)) phrases.set(p, s); };
  add(nameWords.join(" "), nameWords.length + 1);
  for (const al of a.aliases || []) { const w = words(al); if (w.length) add(w.join(" "), w.length + 1); }
  for (let i = 0; i < nameWords.length; i++)
    for (let j = i + 1; j <= nameWords.length; j++) {
      const slice = nameWords.slice(i, j);
      if (slice.length === 1 && (GENERIC.has(slice[0]) || INTENT_WORDS.has(slice[0]) || FILLER.has(slice[0]))) continue;
      add(slice.join(" "), slice.length);
    }
  // "Main account", "New card": when every word is generic, the first one still names it ("main").
  if (nameWords.length && nameWords.every((w) => GENERIC.has(w) || FILLER.has(w)) && !INTENT_WORDS.has(nameWords[0])) add(nameWords[0], 1);
  if (a.kind === "cash" || /cash/i.test(a.name)) add("cash", 2);
  return phrases;
}

/** Every account mention in the token list: { start, end, ids, strength, prep }. */
export function findAccounts(tokens, accounts) {
  const table = accounts.map((a) => ({ a, phrases: accountPhrases(a) }));
  const used = new Array(tokens.length).fill(false);
  const mentions = [];
  for (let len = 4; len >= 1; len--) {
    for (let i = 0; i + len <= tokens.length; i++) {
      if (used.slice(i, i + len).some(Boolean)) continue;
      const phrase = tokens.slice(i, i + len).join(" ");
      let best = 0, ids = [];
      for (const { a, phrases } of table) {
        let s = phrases.get(phrase) || 0;
        // Typos: one word, 5+ letters, close to a distinctive single word of the name.
        if (!s && len === 1 && phrase.length >= 5 && !MERCHANT_WORDS.has(phrase) && !INTENT_WORDS.has(phrase)) {
          for (const [p, st] of phrases) if (!p.includes(" ") && p.length >= 5 && levenshtein(p, phrase) <= (p.length >= 8 ? 2 : 1)) { s = Math.max(s, st - 0.5); }
        }
        if (!s) continue;
        if (s > best) { best = s; ids = [a.id]; } else if (s === best) ids.push(a.id);
      }
      if (!ids.length) continue;
      // A merchant word ("swiggy", "amazon") only names an account when it's clearly a payment method.
      let end = i + len;
      const cardAfter = tokens[end] === "card" || tokens[end] === "account" || tokens[end] === "a/c";
      if (cardAfter) end++;
      const prep = tokens[i - 1] || "";
      const merchantish = len === 1 && MERCHANT_WORDS.has(phrase);
      if (merchantish && !cardAfter && !["with", "via", "using"].includes(prep)) continue;
      for (let k = i; k < end; k++) used[k] = true;
      mentions.push({ start: i, end, ids, strength: best + (cardAfter ? 1 : 0), prep, phrase, merchantish });
    }
  }
  return mentions.sort((x, y) => x.start - y.start);
}

// ---------------- planned items ----------------
function linkScore(tokens, item) {
  const text = " " + tokens.join(" ") + " ";
  for (const al of [item.label, ...(item.aliases || [])]) {
    const w = words(al).join(" ");
    if (w && text.includes(" " + w + " ")) return 10 + w.split(" ").length;
  }
  const lw = words(item.label).filter((w) => w.length >= 3 && !WEAK_LINK.has(w) && !FILLER.has(w));
  let s = 0;
  for (const w of lw) if (tokens.includes(w)) s += 2;
  if (!s) return 0;
  // Weak words add a little once a strong word matched ("school fee" beats "school trip").
  for (const w of words(item.label)) if (WEAK_LINK.has(w) && w.length >= 3 && tokens.includes(w)) s += 1;
  return s;
}
function bestLink(tokens, items) {
  let best = null, score = 0, tie = false;
  for (const it of items) {
    const s = linkScore(tokens, it);
    if (s > score) { best = it; score = s; tie = false; } else if (s && s === score) tie = true;
  }
  return best && !tie ? { item: best, score } : null;
}

// ---------------- category ----------------
function seedCategory(tokens) {
  const text = " " + tokens.join(" ") + " ";
  for (const [cat, list] of Object.entries(MERCHANTS)) if (list.some((m) => text.includes(" " + m + " "))) return cat;
  return null;
}

// ---------------- main ----------------
/**
 * Top up a row that's already there → { amount, target }, otherwise null (a normal new entry).
 * Word order doesn't matter; what counts is a clear "add to the old one" cue:
 *   strong, enough alone: existing, more, extra, additional, top up, increase / bump / raise, update, "+181"
 *     "181 existing instamart", "instamart +181", "181 more instamart", "top up instamart 181", "increase instamart by 181"
 *   weak, needs to / in / into / on: add, plus
 *     "add 181 to instamart", "181 add to instamart", "add to instamart 181", "instamart add 181"
 * Exactly one amount and a name left over are required, so "450 swiggy", "100 to mummy", "added milk 60" stay new entries.
 */
const ADD_STRONG = new Set(["existing", "more", "extra", "additional", "additionally", "increase", "increment", "bump", "raise", "update", "topup", "top-up"]);
const ADD_WEAK = new Set(["add", "plus"]);
const ADD_PREP = new Set(["to", "in", "into", "on"]);
const ADD_FILLER = new Set(["the", "my", "same", "earlier", "previous", "last", "old", "row", "entry", "line", "item", "it", "by", "amount", "of", "please", "pls", "also", "up", "top", "another", "again", "one"]);
const ADD_ACCT_FILLER = new Set(["with", "via", "using", "from", "account", "card", "a/c", "acct", "ac"]);
/** Pass the accounts to also pick out "… on infinia" / "main account …": the result then carries account_ids (the row must be on one of them). */
export function parseAddTo(piece, accounts) {
  let text = normalize(piece).replace(/\btop\s+up\b/g, "topup");
  const amts = [...text.matchAll(new RegExp(AMOUNT_TOKEN.source, "g"))];
  if (amts.length !== 1) return null;
  const [tok] = amts, plus = /\+\s*$/.test(text.slice(0, tok.index));
  const a = parseAmount(tok[0]);
  if (!a || !(a.value > 0)) return null;
  const words = (text.slice(0, tok.index) + " " + text.slice(tok.index + tok[0].length)).replace(/[+,.!?:;]/g, " ").split(/\s+/).filter(Boolean);
  const strong = plus || words.some((w) => ADD_STRONG.has(w));
  // "add" also counts after the name ("instamart add 181"); "add 181 instamart" alone stays a new entry.
  const weak = words.some((w) => ADD_WEAK.has(w)) && (words.some((w) => ADD_PREP.has(w)) || !ADD_WEAK.has(words[0]));
  if (!strong && !weak) return null;
  let rest = words.filter((w) => !ADD_STRONG.has(w) && !ADD_WEAK.has(w) && !ADD_PREP.has(w) && !ADD_FILLER.has(w));
  let account_ids = null;
  if (accounts && accounts.length && rest.length > 1) {
    const m = findAccounts(rest, accounts).sort((x, y) => y.strength - x.strength)[0];
    if (m) {
      const left = rest.filter((w, i) => (i < m.start || i >= m.end) && !ADD_ACCT_FILLER.has(w));
      if (left.length) { rest = left; account_ids = m.ids; }
    }
  }
  const target = rest.join(" ");
  if (!target || /\d/.test(target)) return null;
  return account_ids ? { amount: a.value, target, account_ids } : { amount: a.value, target };
}

export function parseEntry(text, ctx) {
  return splitEntries(text).map((piece) => parseOne(piece, ctx));
}

export function parseOne(raw, ctx) {
  const settings = ctx.settings || {};
  const categories = ctx.categories || CATEGORIES_DEFAULT;
  const accounts = (ctx.accounts || []).filter((a) => !a.closed_from || a.closed_from > (ctx.today || "").slice(0, 7));
  const byId = Object.fromEntries(accounts.map((a) => [a.id, a]));
  const mainAcct = accounts.find((a) => a.is_default_spending) || accounts.find((a) => a.role === "spending") || accounts[0];
  const viewAcct = byId[ctx.defaultAccountId] || mainAcct;

  let text = normalize(raw);
  const slots = { amount: "missing", date: "inferred", account: "inferred", to_account: null, category: "missing" };
  const d = { raw: String(raw).trim(), direction: "out", amount: null, date: ctx.today, approx_date: false, period: null, account_id: viewAcct ? viewAcct.id : "",
    to_account_id: "", description: "", category: "", nature: "variable", recurring_id: null, annual_id: null, income_id: null, new_account: null, future: false, grouped: false, slots, ask: null };

  // 1. date (first, so "31 oct" isn't an amount)
  const dt = parseDate(text, ctx.today, settings);
  text = dt.rest;
  d.date = dt.date; d.approx_date = dt.approx; d.period = dt.period;
  if (dt.explicit) slots.date = "explicit";
  if (dt.approx) d.grouped = true;
  d.future = d.date > ctx.today;

  // 2. amount
  const amt = parseAmount(text);
  if (amt) {
    d.amount = amt.value; d.grouped = d.grouped || amt.grouped; slots.amount = "explicit";
    text = (text.slice(0, amt.index) + " " + text.slice(amt.index + amt.match.length)).replace(/\s+/g, " ").trim();
  }

  // 3. intent
  const it = detectIntent(text);
  let tokens = text.split(" ").filter(Boolean);
  const intentWords = new Set(it.word ? it.word.split(" ") : []);

  // 4. accounts
  const mentions = findAccounts(tokens, accounts);
  const consumed = new Set();
  const consume = (m) => { for (let k = m.start; k < m.end; k++) consumed.add(k); };
  const pick = (m) => (m.ids.length === 1 ? m.ids[0] : null);
  const tieAsk = (m, slot) => ({ slot, text: `Which ${titleCase(m.phrase)}?`, options: m.ids.map((id) => [id, byId[id].name]) });

  // "lent 25k to ravi" / "to <name>" that doesn't exist -> offer a new receivable account
  const toIdx = tokens.indexOf("to");
  const fromIdx = tokens.indexOf("from");
  const mentionAfter = (idx) => mentions.find((m) => m.start === idx + 1 || (tokens[idx + 1] === "the" && m.start === idx + 2));
  const fromM = fromIdx >= 0 ? mentionAfter(fromIdx) : null;
  const toM = toIdx >= 0 ? mentionAfter(toIdx) : null;
  const payM = mentions.filter((m) => m !== fromM && m !== toM)
    .sort((a, b) => (PAY_PREPS.has(b.prep) ? 3 : 0) + b.strength - ((PAY_PREPS.has(a.prep) ? 3 : 0) + a.strength))[0] || null;

  let direction = it.intent === "refund" ? "out" : it.intent;
  if (it.intent === "transfer") {
    d.direction = "transfer";
    let src = fromM, dst = toM;
    if (!dst && it.sub === "invest") dst = mentions.find((m) => m !== src && m.ids.some((id) => ["investment", "long_term"].includes(byId[id].role))) || payM;
    if (!src && !dst && payM) { if (["lend", "invest"].includes(it.sub)) dst = payM; else src = payM; }
    else if (!src && payM && payM !== dst) src = payM;
    else if (!dst && payM && payM !== src) dst = payM;
    const role = (r) => accounts.filter((a) => a.role === r);
    const cash = accounts.find((a) => a.kind === "cash" || /cash/i.test(a.name));
    // from
    if (src) { consume(src); const id = pick(src); if (id) { d.account_id = id; slots.account = "explicit"; } else { d.account_id = ""; slots.account = "missing"; d.ask = tieAsk(src, "account"); } }
    else if (it.sub === "deposit" && cash) d.account_id = cash.id;
    else d.account_id = mainAcct ? mainAcct.id : "";
    // to
    slots.to_account = "missing";
    if (dst) { consume(dst); const id = pick(dst); if (id) { d.to_account_id = id; slots.to_account = "explicit"; } else if (!d.ask) d.ask = tieAsk(dst, "to_account"); }
    else if (it.sub === "withdraw" && cash) { d.to_account_id = cash.id; slots.to_account = "inferred"; }
    else if (it.sub === "deposit" && mainAcct && d.account_id !== mainAcct.id) { d.to_account_id = mainAcct.id; slots.to_account = "inferred"; }
    else if (it.sub === "got_back") {
      // money back from a person: from receivable -> main
      const rec = role("receivable");
      if (src) { d.to_account_id = mainAcct ? mainAcct.id : ""; slots.to_account = "inferred"; }
      else if (rec.length === 1) { d.account_id = rec[0].id; d.to_account_id = mainAcct ? mainAcct.id : ""; slots.account = "inferred"; slots.to_account = "inferred"; }
    } else if (it.sub === "invest") {
      const inv = role("investment");
      if (inv.length === 1) { d.to_account_id = inv[0].id; slots.to_account = "inferred"; }
      else if (inv.length > 1 && !d.ask) d.ask = { slot: "to_account", text: "Invested into which account?", options: inv.map((a) => [a.id, a.name]) };
    }
    if (it.sub === "got_back" && d.account_id && !d.to_account_id) { d.to_account_id = mainAcct ? mainAcct.id : ""; slots.to_account = "inferred"; }
    // New person: "lent 25k to ravi"
    if (!d.to_account_id && !d.ask && toIdx >= 0 && !toM) {
      const nameTok = tokens.slice(toIdx + 1).filter((w) => !FILLER.has(w) && !intentWords.has(w) && !/\d/.test(w));
      if (nameTok.length && nameTok.length <= 3) {
        const name = titleCase(nameTok.join(" "));
        d.new_account = { name, role: it.sub === "lend" ? "receivable" : "savings" };
        for (let k = toIdx + 1; k < tokens.length; k++) consumed.add(k);
        d.ask = { slot: "new_account", text: `Create account “${name}” (${d.new_account.role === "receivable" ? "money owed to you" : "savings"})?`, options: [["create", `Create ${name}`]] };
      }
    }
    // Swapped when user typed "from" for the destination of money coming in ("got back 10k from ravi" handled above).
    const dstAcc = byId[d.to_account_id];
    d.nature = it.sub === "invest" || (dstAcc && ["investment", "long_term"].includes(dstAcc.role)) ? "investment" : "variable";
    if (!d.ask && d.account_id && d.account_id === d.to_account_id) { slots.to_account = "missing"; d.to_account_id = ""; }
  } else {
    // spend / income / refund: one paying account
    const m = payM || fromM || toM;
    if (m) {
      consume(m);
      const id = pick(m);
      if (id) { d.account_id = id; slots.account = "explicit"; } else { d.account_id = ""; slots.account = "missing"; d.ask = tieAsk(m, "account"); }
    }
  }

  // Remaining tokens for links, merchant and category.
  const restTokens = tokens.filter((w, i) => !consumed.has(i));

  // 5. links to planned items (direction decides which list; no verb -> look at both)
  if (d.direction !== "transfer") {
    const year = +String(d.date).slice(0, 4);
    const linkTokens = restTokens.filter((w) => !intentWords.has(w) || w === "salary" || w === "interest");
    const outLink = it.intent === "in" ? null : bestLink(linkTokens, [...(ctx.commitments || []).map((c) => ({ ...c, _t: "commitment" })),
      ...(ctx.annual || []).filter((a) => !a.year || +a.year === year).map((a) => ({ ...a, _t: "annual" }))]);
    const inLink = it.intent === "out" && !it.implicit ? null : it.intent === "refund" ? null : bestLink(linkTokens, (ctx.income || []).map((x) => ({ ...x, _t: "income" })));
    let link = null;
    if (it.intent === "in") link = inLink;
    else if (!it.implicit) link = outLink;
    else if (inLink && outLink) {
      // "rent 47250": both a rent commitment and rent income exist. Ask.
      if (inLink.score === outLink.score) d.ask = d.ask || { slot: "direction", text: `Is “${titleCase(restTokens.join(" "))}” money in or out?`, options: [["in", `Received · ${inLink.item.label}`], ["out", `Paid · ${outLink.item.label}`]], links: { in: inLink.item, out: outLink.item } };
      else link = inLink.score > outLink.score ? inLink : outLink;
    } else link = inLink || outLink;
    if (link) applyLink(d, link.item, slots, byId);
    else direction === "in" && (d.direction = "in", d.nature = "income");
    if (!link && it.intent !== "in") d.direction = "out";
    if (link && link.item._t === "income") direction = "in";
  }

  // 6. description: what's left after removing intent words and filler
  const descTokens = restTokens.filter((w) => !intentWords.has(w) && !FILLER.has(w) && !(it.intent === "in" && ["came", "got"].includes(w)));
  const catHit = descTokens.map((w) => CATEGORY_WORDS[w]).find(Boolean);
  const merchant = descTokens.filter((w) => !(CATEGORY_WORDS[w] && descTokens.length > 1)).join(" ");
  if (!d.description) {
    if (merchant) d.description = titleCase(merchant);
    else if (catHit) d.description = catHit;
    else if (it.sub === "cashback") d.description = "Cashback";
    else if (it.intent === "refund") d.description = "Refund";
    else if (d.direction === "transfer") {
      const dst = byId[d.to_account_id];
      d.description = it.sub === "invest" ? "Investment" + (dst ? ` — ${dst.name}` : "") : it.sub === "lend" ? `Lent to ${d.new_account ? d.new_account.name : dst ? dst.name : "…"}`
        : it.sub === "withdraw" ? "Cash withdrawal" : it.sub === "got_back" ? "Money back" : "Transfer" + (dst ? ` to ${dst.name}` : "");
    }
    else if (it.intent === "in") d.description = "Income";
  }
  if (it.intent === "refund") d.amount = d.amount != null ? -Math.abs(d.amount) : null;

  // 7. category
  if (d.direction === "transfer") { d.category = "Other"; slots.category = "inferred"; }
  else if (catHit) { d.category = catHit; slots.category = "explicit"; }
  else if (!d.category) {
    const learned = ctx.infer && d.description ? ctx.infer(d.description) : null;
    const seed = seedCategory(descTokens);
    if (learned && learned.category) { d.category = learned.category; slots.category = "inferred"; if (!d.recurring_id && !d.annual_id && learned.nature && d.direction === "out" && !/^income/.test(learned.nature)) d.nature = learned.nature; }
    else if (seed) { d.category = seed; slots.category = "inferred"; }
    else if (it.sub === "cashback" || it.intent === "refund") { d.category = "Other"; slots.category = "inferred"; }
    else if (d.direction === "in") { d.category = "Other"; slots.category = "inferred"; }
    else { d.category = ""; slots.category = "missing"; }
  } else if (slots.category === "missing") slots.category = "inferred";
  if (!categories.includes(d.category) && d.category) d.category = "Other";

  // 8. nature words
  if (/\bemergency\b/.test(text) && d.direction === "out") d.nature = "emergency";
  else if (/\bone[- ]?off\b/.test(text) && d.direction === "out") d.nature = "oneoff";
  if (d.direction === "in" && !/^income/.test(d.nature)) d.nature = d.income_id ? "income" : "income_oneoff";
  if (d.direction === "in" && d.income_id) d.nature = "income";

  // 9. follow-up questions, most important first
  if (!d.ask) {
    if (d.amount == null) d.ask = { slot: "amount", text: "How much?", options: [] };
    else if (!d.account_id) d.ask = { slot: "account", text: "Which account?", options: accounts.filter((a) => a.role !== "long_term").map((a) => [a.id, a.name]) };
    else if (d.direction === "transfer" && !d.to_account_id) d.ask = { slot: "to_account", text: "Moved to which account?", options: accounts.filter((a) => a.id !== d.account_id).map((a) => [a.id, a.name]) };
    else if (slots.category === "missing") d.ask = { slot: "category", text: `What kind of spend is “${d.description || "this"}”?`, options: ["Food", "Grocery", "Shopping", "Household", "Transport", "Other"].map((c) => [c, c]) };
  }
  if (slots.account === "inferred" && !d.account_id) slots.account = "missing";
  return d;
}

function applyLink(d, item, slots, byId) {
  if (item._t === "commitment") {
    d.direction = "out"; d.nature = "recurring"; d.recurring_id = item.id;
    if (item.paid) d.warn = "Already paid this month";
    if (item.category) { d.category = item.category; slots.category = "inferred"; }
    if (item.account_id && byId[item.account_id] && slots.account !== "explicit") d.account_id = item.account_id;
    if (d.amount == null && +item.amount) { d.amount = +item.amount; slots.amount = "inferred"; }
  } else if (item._t === "annual") {
    d.direction = "out"; d.nature = "annual"; d.annual_id = item.id;
    if (d.amount == null && +item.total) { d.amount = +item.total; slots.amount = "inferred"; }
    d.category = d.category || "Other"; slots.category = "inferred";
  } else {
    d.direction = "in"; d.nature = "income"; d.income_id = item.id;
    if (item.account_id && byId[item.account_id] && slots.account !== "explicit") d.account_id = item.account_id;
    else if (slots.account !== "explicit") { const main = Object.values(byId).find((a) => a.is_default_spending); if (main) d.account_id = main.id; }
    if (d.amount == null && +item.amount) { d.amount = +item.amount; slots.amount = "inferred"; }
    d.category = "Other"; slots.category = "inferred";
  }
  d.description = item.label;
}

/** Fill in a follow-up answer (a chip tap) and re-check what's still missing. */
export function answer(draft, slot, value, ctx) {
  const d = { ...draft, slots: { ...draft.slots }, ask: null };
  if (slot === "account") { d.account_id = value; d.slots.account = "explicit"; }
  else if (slot === "to_account") { d.to_account_id = value; d.slots.to_account = "explicit"; }
  else if (slot === "category") { d.category = value; d.slots.category = "explicit"; }
  else if (slot === "amount") { const a = parseAmount(normalize(String(value))); if (a) { d.amount = a.value; d.slots.amount = "explicit"; } }
  else if (slot === "direction") {
    const item = draft.ask && draft.ask.links ? draft.ask.links[value] : null;
    if (item) applyLink(d, item, d.slots, Object.fromEntries((ctx.accounts || []).map((a) => [a.id, a])));
    d.direction = value; if (value === "in") d.nature = d.income_id ? "income" : "income_oneoff";
  }
  else if (slot === "new_account") { d.slots.to_account = "explicit"; }
  // Re-ask anything still missing
  const accounts = ctx.accounts || [];
  if (d.amount == null) d.ask = { slot: "amount", text: "How much?", options: [] };
  else if (!d.account_id) d.ask = { slot: "account", text: "Which account?", options: accounts.map((a) => [a.id, a.name]) };
  else if (d.direction === "transfer" && !d.to_account_id && !(d.new_account && d.slots.to_account === "explicit"))
    d.ask = { slot: "to_account", text: "Moved to which account?", options: accounts.filter((a) => a.id !== d.account_id).map((a) => [a.id, a.name]) };
  else if (d.slots.category === "missing") d.ask = { slot: "category", text: `What kind of spend is “${d.description || "this"}”?`, options: ["Food", "Grocery", "Shopping", "Household", "Transport", "Other"].map((c) => [c, c]) };
  return d;
}

/** Ready to save: nothing missing and no open question. */
export const ready = (d) => !d.ask && d.amount != null && !!d.account_id && (d.direction !== "transfer" || !!d.to_account_id || !!d.new_account) && !!d.category;
