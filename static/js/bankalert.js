// Bank / UPI alert parser: turns pasted SMS or notification text into draft entries.
// Pure, no network. parseBankAlerts(text, { today: "YYYY-MM-DD", accounts: [{ id, name, aliases?, last4? }] })
//   -> [{ direction: "out"|"in", amount, date, merchant, account_id|null, last4|null, ref|null, raw }]
// One alert per paragraph/line group; amounts in Indian formats; dates dd-mm-yy, dd/mm/yyyy, dd-Mon-yy, "on 12Nov".

const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const pad = (n) => String(n).padStart(2, "0");
const AMT = /(?:rs\.?|inr|₹)\s*([\d,]+(?:\.\d{1,2})?)/i;
const DEBIT = /\b(debited|spent|paid|sent|withdrawn|purchase|txn of|transaction of|used for|deducted)\b/i;
const CREDIT = /\b(credited|received|deposited|refund(?:ed)?|reversed|cashback)\b/i;
const LAST4 = /(?:a\/c|ac|acct|account|card)(?:\s*no\.?)?\s*(?:ending(?:\s*with)?|xx+|\*+|x+)?\s*[x*]*\s*(\d{4})\b/i;
const REF = /\b(?:upi\s*(?:ref|txn)?(?:\s*no)?|ref(?:\s*no)?|rrn|txn\s*id)[:.\s#]*([a-z0-9]{6,})/i;

function parseDate(s, today) {
  const ty = +today.slice(0, 4);
  let m = s.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/);
  if (m) { const y = m[3].length === 2 ? 2000 + +m[3] : +m[3]; return `${y}-${pad(+m[2])}-${pad(+m[1])}`; }
  m = s.match(/\b(\d{1,2})[-\s]?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[-\s,]*(\d{2,4})?\b/i);
  if (m) { const y = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : ty; return `${y}-${pad(MON[m[2].toLowerCase()])}-${pad(+m[1])}`; }
  m = s.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (m) return m[0];
  return today;
}

function merchantOf(s) {
  const STOP = String.raw`(?=\s+(?:on|via|ref|upi|avl|avail|bal|from|using|by|not)\b|[.,;]|\s*$)`;
  const NAME = String.raw`([A-Za-z][\w&.'\- ]{1,40}?)`;
  const pats = [
    new RegExp(String.raw`\bat\s+` + NAME + STOP, "i"),
    /\bvpa\s+([\w.\-]+@\w+)/i,
    new RegExp(String.raw`\b(?:to|towards)\s+(?:vpa\s+)?` + NAME + STOP, "i"),
    /\b([\w.\-]+@[a-z]+)\s+credited/i,
    new RegExp(String.raw`\bfrom\s+` + NAME + STOP, "i"),
  ];
  for (const p of pats) {
    const m = s.match(p);
    if (!m) continue;
    let v = m[1].trim();
    if (/^(your|a\/c|ac|acct|account|card|upi|rs|inr|the|hdfc bank|icici bank|sbi|axis bank)\b/i.test(v)) continue;
    if (v.includes("@")) v = v.split("@")[0].replace(/[._\-]?\d+$/, "");
    v = v.replace(/\b(pvt|ltd|limited|india|private)\b\.?/gi, "").replace(/\s+/g, " ").trim();
    if (v) return v.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return "";
}

/** Split pasted text into separate alerts: blank lines, or a new line that starts a new alert. */
export function splitAlerts(text) {
  return String(text || "").split(/\n\s*\n|\n(?=(?:dear|alert|txn|sent|rs\.?|inr|₹|your|a\/c|acct|[A-Z]{2}-[A-Z]+))/i).map((s) => s.replace(/\s+/g, " ").trim()).filter((s) => AMT.test(s));
}

export function isBankAlert(text) {
  const s = String(text || "");
  return AMT.test(s) && (DEBIT.test(s) || CREDIT.test(s)) && (LAST4.test(s) || /\bupi\b|\bvpa\b|a\/c|\bcard\b/i.test(s));
}

export function parseBankAlerts(text, { today, accounts = [] } = {}) {
  return splitAlerts(text).filter(isBankAlert).map((raw) => {
    const amount = +raw.match(AMT)[1].replace(/,/g, "");
    // Which verb comes first decides direction ("debited ... credited to X" is a debit).
    const d = raw.search(DEBIT), c = raw.search(CREDIT);
    const direction = d >= 0 && (c < 0 || d < c) ? "out" : "in";
    const last4 = (raw.match(LAST4) || [])[1] || null;
    const acc = last4 && accounts.find((a) => String(a.last4 || "") === last4 || (a.aliases || []).some((x) => String(x).endsWith(last4)) || (a.name || "").includes(last4));
    return { direction, amount, date: parseDate(raw, today), merchant: merchantOf(raw), account_id: acc ? acc.id : null, last4, ref: (raw.match(REF) || [])[1] || null, raw };
  });
}
