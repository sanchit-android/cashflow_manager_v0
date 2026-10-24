// The user's currency: symbol, digit grouping and short chart labels.
// One active currency at a time, set from settings after unlock (setCurrency).

// code: [name, symbol, locale used for digit grouping]
export const CURRENCIES = {
  INR: ["Indian rupee", "₹", "en-IN"],
  USD: ["US dollar", "$", "en-US"],
  EUR: ["Euro", "€", "en-IE"],
  GBP: ["British pound", "£", "en-GB"],
  AED: ["UAE dirham", "AED ", "en-AE"],
  SGD: ["Singapore dollar", "S$", "en-SG"],
  AUD: ["Australian dollar", "A$", "en-AU"],
  CAD: ["Canadian dollar", "C$", "en-CA"],
  NZD: ["New Zealand dollar", "NZ$", "en-NZ"],
  CHF: ["Swiss franc", "CHF ", "de-CH"],
  JPY: ["Japanese yen", "¥", "ja-JP"],
  SAR: ["Saudi riyal", "SAR ", "en-SA"],
  QAR: ["Qatari riyal", "QAR ", "en-QA"],
  ZAR: ["South African rand", "R", "en-ZA"],
  HKD: ["Hong Kong dollar", "HK$", "en-HK"],
  MYR: ["Malaysian ringgit", "RM", "en-MY"],
  NPR: ["Nepalese rupee", "Rs ", "en-IN"],
  LKR: ["Sri Lankan rupee", "Rs ", "en-LK"],
  BDT: ["Bangladeshi taka", "৳", "en-IN"],
  PKR: ["Pakistani rupee", "Rs ", "en-PK"],
};

let code = "INR";
export const currencyCode = () => code;
export const setCurrency = (c) => { code = CURRENCIES[c] ? c : "INR"; };
export const sym = () => CURRENCIES[code][1];
export const locale = () => CURRENCIES[code][2];

/** Plain grouped number, no symbol: 125000 → "1,25,000" (INR) or "125,000". */
export const num = (n, maxFrac = 0) => n.toLocaleString(locale(), { minimumFractionDigits: 0, maximumFractionDigits: maxFrac });

/** Whole amount with symbol; negatives get a minus sign. null → "—". */
export const money = (n) => (n == null ? "—" : (n < 0 ? "−" : "") + sym() + num(Math.abs(Math.round(n))));

/** Short label for chart axes: ₹12L / ₹1.2Cr for INR, $12K / $1.2M elsewhere. */
export function compact(n) {
  const a = Math.abs(n), sign = n < 0 ? "−" : "", s = sym();
  const steps = code === "INR" || code === "NPR" ? [[1e7, "Cr"], [1e5, "L"], [1e3, "K"]] : [[1e9, "B"], [1e6, "M"], [1e3, "K"]];
  for (const [v, suf] of steps) if (a >= v) return `${sign}${s}${+(a / v).toFixed(a >= v * 10 || suf === "K" ? 0 : 1)}${suf}`;
  return `${sign}${s}${Math.round(a)}`;
}

/** <option>s for a currency picker. */
export const currencyOptions = (sel = code) =>
  Object.entries(CURRENCIES).map(([c, [name, s]]) => `<option value="${c}"${c === sel ? " selected" : ""}>${c} · ${name} (${s.trim()})</option>`).join("");

/** Best guess for a new user, from the browser's locale/time zone. */
export function guessCurrency() {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    const byTz = { "Asia/Kolkata": "INR", "Asia/Calcutta": "INR", "Asia/Dubai": "AED", "Asia/Singapore": "SGD", "Europe/London": "GBP",
      "Asia/Tokyo": "JPY", "Asia/Riyadh": "SAR", "Asia/Qatar": "QAR", "Asia/Hong_Kong": "HKD", "Asia/Kuala_Lumpur": "MYR",
      "Asia/Kathmandu": "NPR", "Asia/Colombo": "LKR", "Asia/Dhaka": "BDT", "Asia/Karachi": "PKR", "Africa/Johannesburg": "ZAR",
      "Pacific/Auckland": "NZD", "Europe/Zurich": "CHF" };
    if (byTz[tz]) return byTz[tz];
    if (tz.startsWith("Australia/")) return "AUD";
    if (/^America\/(Toronto|Vancouver|Edmonton|Winnipeg|Halifax|Montreal)/.test(tz)) return "CAD";
    if (tz.startsWith("America/")) return "USD";
    if (tz.startsWith("Europe/")) return "EUR";
  } catch { /* fall through */ }
  return "INR";
}
