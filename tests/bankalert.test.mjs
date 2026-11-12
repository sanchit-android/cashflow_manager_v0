import { test } from "node:test";
import assert from "node:assert/strict";
import { parseBankAlerts, isBankAlert } from "../static/js/bankalert.js";
const ctx = { today: "2026-11-12", accounts: [{ id: "hdfc", name: "HDFC Regalia", last4: "4417" }, { id: "main", name: "Main account", last4: "1234" }] };

test("HDFC UPI debit", () => {
  const [a] = parseBankAlerts("Sent Rs.450.00 From HDFC Bank A/C *1234 To SWIGGY On 11/11/26 Ref 432198765432 Not You? Call 18002586161", ctx);
  assert.deepEqual([a.direction, a.amount, a.date, a.merchant, a.account_id, a.ref], ["out", 450, "2026-11-11", "Swiggy", "main", "432198765432"]);
});
test("card spend with Indian commas and dd-Mon-yy", () => {
  const [a] = parseBankAlerts("Rs 9,667.00 spent on HDFC Bank Card x4417 at AMAZON PAY INDIA on 11-Nov-26. Avl bal Rs 1,23,000", ctx);
  assert.deepEqual([a.direction, a.amount, a.date, a.merchant, a.account_id], ["out", 9667, "2026-11-11", "Amazon Pay", "hdfc"]);
});
test("ICICI style debit with VPA", () => {
  const [a] = parseBankAlerts("ICICI Bank Acct XX999 debited for Rs 230.00 on 12-Nov-26; uber.india@axisbank credited. UPI:654321987654", ctx);
  assert.equal(a.direction, "out"); assert.equal(a.amount, 230); assert.equal(a.account_id, null);
});
test("salary credit", () => {
  const [a] = parseBankAlerts("INR 1,00,500.00 credited to A/c XX1234 on 05-11-2026 by NEFT from ACME TECHNOLOGIES PVT LTD. Avl Bal INR 9,80,583", ctx);
  assert.deepEqual([a.direction, a.amount, a.date, a.account_id], ["in", 100500, "2026-11-05", "main"]);
  assert.match(a.merchant, /Acme Technologies/);
});
test("several alerts pasted together", () => {
  const t = "Sent Rs.120 From HDFC Bank A/C *1234 To CHAIPOINT On 12/11/26\n\nRs 340 spent on HDFC Bank Card x4417 at ZEPTO on 12-Nov-26";
  assert.deepEqual(parseBankAlerts(t, ctx).map((a) => [a.amount, a.merchant]), [[120, "Chaipoint"], [340, "Zepto"]]);
});
test("plain chat sentences are not alerts", () => {
  for (const s of ["450 swiggy", "spent 450 on swiggy with infinia yesterday", "salary 1.8 lakh on 31 oct"]) assert.equal(isBankAlert(s), false, s);
});
