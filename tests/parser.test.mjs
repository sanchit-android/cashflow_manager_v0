import { test } from "node:test";
import assert from "node:assert/strict";
import { parseAddTo, parseEntry, parseAmount, parseDate, splitEntries, answer, ready } from "../static/js/parser.js";

const ctx = {
  today: "2026-11-07",
  settings: { period_mode: "calendar" },
  accounts: [
    { id: "main", name: "HDFC Savings", role: "spending", is_default_spending: true },
    { id: "inf", name: "HDFC Infinia", role: "card" },
    { id: "hsw", name: "HDFC Swiggy", role: "card" },
    { id: "atl", name: "Axis Atlas", role: "card" },
    { id: "amz", name: "ICICI Amazon Pay", role: "card" },
    { id: "sav", name: "SBI Savings", role: "savings" },
    { id: "mf", name: "Mutual fund", role: "investment" },
    { id: "cash", name: "Cash", role: "spending", kind: "cash" },
  ],
  commitments: [{ id: "maid", label: "Household help – maid", amount: 12000, category: "Household" }, { id: "rentout", label: "Flat rent", amount: 30000, category: "Rent" }],
  annual: [{ id: "school", label: "School fee – child 1", total: 160000, year: 2026 }],
  income: [{ id: "rent", label: "Rent", kind: "rent", amount: 47250 }, { id: "sal", label: "Salary", kind: "salary", amount: 180000 }],
  defaultAccountId: "main",
  infer: (desc) => (desc.toLowerCase() === "dmart run" ? { category: "Grocery", nature: "variable" } : null),
};
const one = (s, c = ctx) => { const r = parseEntry(s, c); assert.equal(r.length, 1, `one draft for "${s}"`); return r[0]; };

test("amounts in Indian formats", () => {
  assert.equal(parseAmount("450").value, 450);
  assert.equal(parseAmount("1,20,000").value, 120000);
  assert.equal(parseAmount("1.2l").value, 120000);
  assert.equal(parseAmount("1.2 lakh").value, 120000);
  assert.equal(parseAmount("50k").value, 50000);
  assert.equal(parseAmount("2 cr").value, 2e7);
  assert.equal(parseAmount("1.5 crore").value, 1.5e7);
  const s = parseAmount("347+273+103");
  assert.equal(s.value, 723); assert.equal(s.grouped, true);
});

test("dates", () => {
  const t = ctx.today;
  assert.equal(parseDate("yesterday", t).date, "2026-11-06");
  assert.equal(parseDate("3 nov", t).date, "2026-11-03");
  assert.equal(parseDate("3/11", t).date, "2026-11-03");
  assert.equal(parseDate("on 31 oct", t).date, "2026-10-31");
  assert.equal(parseDate("last friday", t).date, "2026-11-06"); // 7 Nov 2026 is a Saturday
  assert.equal(parseDate("on 3rd", t).date, "2026-11-03");
  assert.equal(parseDate("on 20th", t).date, "2026-10-20");
  const a = parseDate("swiggy for october", t);
  assert.equal(a.approx, true); assert.equal(a.period, "2026-10"); assert.equal(a.date, "2026-10-31");
  assert.equal(parseDate("450 swiggy", t).date, t);
  assert.equal(parseDate("25 dec", t).date, "2026-12-25", "within two months ahead stays this year (an upcoming entry)");
  assert.equal(parseDate("25 mar", "2026-01-10").date, "2025-03-25", "more than two months ahead without a year means last year");
});

test("splitting", () => {
  assert.deepEqual(splitEntries("450 swiggy, 1200 petrol atlas, 300 auto"), ["450 swiggy", "1200 petrol atlas", "300 auto"]);
  assert.deepEqual(splitEntries("rent received 47,250"), ["rent received 47,250"]);
  assert.deepEqual(splitEntries("450 swiggy and 200 zomato"), ["450 swiggy", "200 zomato"]);
  assert.deepEqual(splitEntries("450 swiggy, paid maid"), ["450 swiggy", "paid maid"]);
  assert.deepEqual(splitEntries("450 swiggy, paid with infinia"), ["450 swiggy paid with infinia"]);
});

test("spent 450 on swiggy with infinia yesterday", () => {
  const d = one("spent 450 on swiggy with infinia yesterday");
  assert.equal(d.direction, "out"); assert.equal(d.amount, 450); assert.equal(d.account_id, "inf");
  assert.equal(d.date, "2026-11-06"); assert.equal(d.description, "Swiggy"); assert.equal(d.category, "Food");
  assert.equal(d.nature, "variable"); assert.ok(ready(d));
});

test("450 swiggy uses the account in view, not the Swiggy card", () => {
  const d = one("450 swiggy");
  assert.equal(d.account_id, "main"); assert.equal(d.category, "Food"); assert.equal(d.slots.account, "inferred"); assert.ok(ready(d));
});

test("swiggy card is matched when clearly the payment method", () => {
  assert.equal(one("450 zomato on swiggy card").account_id, "hsw");
  assert.equal(one("450 zomato hdfc swiggy").account_id, "hsw");
});

test("paid 1.6L school fee from hdfc links the annual item and asks which HDFC", () => {
  const d = one("paid 1.6L school fee from hdfc");
  assert.equal(d.amount, 160000); assert.equal(d.annual_id, "school"); assert.equal(d.nature, "annual");
  assert.equal(d.ask.slot, "account"); assert.equal(d.ask.options.length, 3);
  const a = answer(d, "account", "main", ctx);
  assert.ok(ready(a));
});

test("paid maid pre-fills the commitment amount", () => {
  const d = one("paid maid");
  assert.equal(d.recurring_id, "maid"); assert.equal(d.amount, 12000); assert.equal(d.slots.amount, "inferred");
  assert.equal(d.nature, "recurring"); assert.equal(d.category, "Household"); assert.ok(ready(d));
});

test("rent received 47,250 is income", () => {
  const d = one("rent received 47,250");
  assert.equal(d.direction, "in"); assert.equal(d.amount, 47250); assert.equal(d.income_id, "rent"); assert.equal(d.account_id, "main");
  assert.equal(d.nature, "income"); assert.ok(ready(d));
});

test("paid rent is the commitment, not income", () => {
  const d = one("paid rent 30000");
  assert.equal(d.direction, "out"); assert.equal(d.recurring_id, "rentout");
});

test("salary 1.8 lakh on 31 oct", () => {
  const d = one("salary 1.8 lakh on 31 oct");
  assert.equal(d.direction, "in"); assert.equal(d.amount, 180000); assert.equal(d.date, "2026-10-31"); assert.equal(d.income_id, "sal");
});

test("invested 50k in mutual fund", () => {
  const d = one("invested 50k in mutual fund");
  assert.equal(d.direction, "transfer"); assert.equal(d.account_id, "main"); assert.equal(d.to_account_id, "mf");
  assert.equal(d.nature, "investment"); assert.ok(ready(d));
});

test("moved 2L from savings to hdfc asks which HDFC", () => {
  const d = one("moved 2L from sbi savings to hdfc");
  assert.equal(d.direction, "transfer"); assert.equal(d.account_id, "sav"); assert.equal(d.amount, 200000);
  assert.equal(d.ask.slot, "to_account");
  assert.ok(ready(answer(d, "to_account", "main", ctx)));
});

test("refund 300 amazon on amazon pay card", () => {
  const d = one("refund 300 amazon on amazon pay card");
  assert.equal(d.amount, -300); assert.equal(d.account_id, "amz"); assert.equal(d.direction, "out"); assert.equal(d.description, "Amazon");
});

test("cashback 120 atlas", () => {
  const d = one("cashback 120 atlas");
  assert.equal(d.amount, -120); assert.equal(d.account_id, "atl"); assert.equal(d.description, "Cashback"); assert.ok(ready(d));
});

test("swiggy 6352 infinia for october is grouped and approximate", () => {
  const d = one("swiggy 6352 infinia for october");
  assert.equal(d.amount, 6352); assert.equal(d.account_id, "inf"); assert.equal(d.approx_date, true); assert.equal(d.period, "2026-10"); assert.equal(d.grouped, true);
});

test("lent 25k to ravi offers a new receivable account", () => {
  const d = one("lent 25k to ravi");
  assert.equal(d.direction, "transfer"); assert.equal(d.new_account.name, "Ravi"); assert.equal(d.new_account.role, "receivable");
  assert.equal(d.ask.slot, "new_account"); assert.equal(d.description, "Lent to Ravi");
});

test("three entries in one line", () => {
  const r = parseEntry("450 swiggy, 1200 petrol atlas, 300 auto", ctx);
  assert.equal(r.length, 3);
  assert.deepEqual(r.map((d) => [d.amount, d.account_id, d.category]), [[450, "main", "Food"], [1200, "atl", "Vehicle"], [300, "main", "Transport"]]);
});

test("typos in account names", () => {
  assert.equal(one("1200 petrol infinea").account_id, "inf");
});

test("unknown merchant asks for a category; learned history answers it", () => {
  const d = one("900 xyz traders");
  assert.equal(d.ask.slot, "category"); assert.equal(ready(d), false);
  assert.equal(one("640 dmart run").category, "Grocery");
});

test("explicit category word wins", () => {
  const d = one("450 swiggy grocery");
  assert.equal(d.category, "Grocery"); assert.equal(d.slots.category, "explicit"); assert.equal(d.description, "Swiggy");
});

test("no amount asks how much", () => {
  const d = one("swiggy with infinia");
  assert.equal(d.ask.slot, "amount");
  assert.equal(answer(d, "amount", "450", ctx).amount, 450);
});

test("for is not an intent word and arithmetic is grouped", () => {
  const d = one("347+273+103 for swiggy");
  assert.equal(d.amount, 723); assert.equal(d.grouped, true); assert.equal(d.direction, "out"); assert.equal(d.description, "Swiggy");
});

test("future date is flagged", () => {
  assert.equal(one("2000 electricity on 20 nov").future, true);
});

test("withdrew cash", () => {
  const d = one("withdrew 5000");
  assert.equal(d.direction, "transfer"); assert.equal(d.account_id, "main"); assert.equal(d.to_account_id, "cash");
});

test("add to an existing row", () => {
  assert.deepEqual(parseAddTo("add 272 to instamart"), { amount: 272, target: "instamart" });
  assert.deepEqual(parseAddTo("Add 272 to existing Instamart row"), { amount: 272, target: "instamart" });
  assert.deepEqual(parseAddTo("add 1.5k more to the swiggy entry"), { amount: 1500, target: "swiggy" });
  assert.equal(parseAddTo("450 swiggy"), null);
  assert.equal(parseAddTo("added milk 60"), null);
});
