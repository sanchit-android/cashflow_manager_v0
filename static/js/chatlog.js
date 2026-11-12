// Chat messages that failed or were undone, sent to the server so the parser can be improved.
// The text is redacted here, before it leaves the browser: amounts, dates, numbers and the user's account names are replaced.
// No user is attached on the server. Demo mode sends nothing.
import { MONTH_RE } from "./parser.js";

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const GENERIC = new Set(["bank", "card", "credit", "debit", "account", "main", "new", "old", "pay", "savings", "the", "my", "of", "and"]);

/** "paid 1.6L to ravi from HDFC Infinia on 3 nov" -> "paid <amt> to ravi from <acct> on <date>". */
export function redact(text, accounts = []) {
  let s = String(text || "").replace(/\s+/g, " ").trim();
  // Account names and aliases, longest first; plus their distinctive single words ("infinia").
  const phrases = new Set();
  for (const a of accounts) for (const n of [a.name, ...(a.aliases || [])]) {
    const w = String(n || "").toLowerCase().trim(); if (!w) continue;
    phrases.add(w);
    for (const part of w.split(/[\s\-–_/()]+/)) if (part.length >= 3 && !GENERIC.has(part)) phrases.add(part);
  }
  for (const p of [...phrases].sort((a, b) => b.length - a.length)) s = s.replace(new RegExp(`(?<![\\w<])${esc(p)}(?![\\w>])`, "gi"), "<acct>");
  s = s.replace(/<acct>(\s+<acct>)+/g, "<acct>");
  // Dates: 3 nov, nov 3, 3rd of november, 3/11, 3-11-2026
  s = s.replace(new RegExp(`\\b\\d{1,2}(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH_RE}\\b(?:,?\\s+\\d{4})?`, "gi"), "<date>")
    .replace(new RegExp(`\\b${MONTH_RE}\\s+\\d{1,2}(?:st|nd|rd|th)?\\b(?:,?\\s+\\d{4})?`, "gi"), "<date>")
    .replace(/(?<![\d,.])\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?(?![\d/])/g, "<date>");
  // Amounts: ₹1,20,000 · rs 450 · 1.2L · 50k · 2 cr · 347+273 (and any other number)
  s = s.replace(/(?:₹|\brs\.?\s*|\binr\s*)?\d[\d,]*(?:\.\d+)?(?:\s*\+\s*\d[\d,]*(?:\.\d+)?)*(?:\s*(?:k|thousand|l|lakhs?|lacs?|cr|crores?)\b)?/gi, "<amt>");
  // Anything that looks like an email or a long code
  s = s.replace(/\S+@\S+/g, "<email>");
  return s.slice(0, 300);
}

const sent = new Set(); // don't send the same message twice in one session

/** reason: failed | unknown | no_match | skipped | guessed | error | undone. kind: what the message was read as. */
export function logMiss(reason, text, { kind = "", accounts = [] } = {}) {
  try {
    const q = new URLSearchParams(location.search);
    if (q.get("demo") === "1") return;
    const red = redact(text, accounts), k = reason + "|" + red;
    if (!red || sent.has(k)) return;
    sent.add(k);
    const m = document.cookie.match(/(?:^|; )csrftoken=([^;]+)/);
    const headers = { "Content-Type": "application/json", "X-CSRFToken": m ? decodeURIComponent(m[1]) : "" };
    if (q.get("local") === "1") headers["X-PlannedOut-Local"] = "1";
    fetch("/api/chat-miss", { method: "POST", credentials: "same-origin", keepalive: true, headers,
      body: JSON.stringify({ reason, text: red, kind: String(kind).replace(/[^a-z_]/g, "").slice(0, 24) }) }).catch(() => {});
  } catch (e) { /* never break the chat */ }
}
