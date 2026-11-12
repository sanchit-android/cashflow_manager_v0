import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCommand, parseMonth, parseMonths } from "../static/js/commands.js";

const ctx = {
  today: "2026-11-07",
  categories: ["Food", "Grocery", "Travel", "Transport", "Shopping", "Other"],
  accounts: [
    { id: "main", name: "HDFC Savings", role: "spending", is_default_spending: true },
    { id: "inf", name: "HDFC Infinia", role: "card" },
    { id: "atl", name: "Axis Atlas", role: "card" },
    { id: "sav", name: "SBI Savings", role: "savings" },
  ],
};
const cmd = (s) => parseCommand(s, ctx);

test("months: named, relative, with year, default none", () => {
  assert.equal(parseMonth("food total in oct", ctx.today).period, "2026-10");
  assert.equal(parseMonth("spend last month", ctx.today).period, "2026-10");
  assert.equal(parseMonth("spend in december", ctx.today).period, "2025-12");
  assert.equal(parseMonth("spend in sep 2025", ctx.today).period, "2025-09");
  assert.equal(parseMonth("how much did i spend", ctx.today).period, null);
  assert.equal(parseMonth("may i see food", ctx.today).period, null);
  assert.deepEqual(parseMonths("compare oct vs sep", ctx.today).periods, ["2026-10", "2026-09"]);
  assert.equal(parseMonth("delete swiggy on 3 nov", ctx.today).period, null);
});

test("entries are not commands", () => {
  for (const s of ["450 swiggy", "paid maid", "spent 450 on swiggy with infinia yesterday", "moved 2L from savings to hdfc",
    "invested 50k in mutual fund", "salary 1.8 lakh on 31 oct", "add 272 to instamart", "rent received 47,250", "1200 petrol atlas"])
    assert.equal(cmd(s), null, s);
});

test("edit rows", () => {
  assert.deepEqual(cmd("change swiggy to 500"), { kind: "edit", target: "swiggy", set: { amount: 500 } });
  assert.deepEqual(cmd("swiggy was 500").set, { amount: 500 });
  assert.deepEqual(cmd("move uber to travel").set, { category: "Travel" });
  assert.deepEqual(cmd("change the category of uber to transport").set, { category: "Transport" });
  assert.deepEqual(cmd("swiggy date 3 nov").set, { date: "2026-11-03" });
  assert.deepEqual(cmd("move swiggy to atlas").set, { account_ids: ["atl"] });
  assert.deepEqual(cmd("rename swigy to swiggy").set, { description: "swiggy" });
  assert.deepEqual(cmd("mark goa trip as annual").set, { nature: "annual" });
  const c = cmd("change swiggy on infinia in oct to 500");
  assert.equal(c.target, "swiggy"); assert.deepEqual(c.account_ids, ["inf"]); assert.equal(c.period, "2026-10");
});

test("remove rows", () => {
  assert.deepEqual(cmd("delete zomato"), { kind: "remove", target: "zomato" });
  const c = cmd("remove the 450 swiggy on 5 nov");
  assert.equal(c.target, "swiggy"); assert.equal(c.amount, 450); assert.equal(c.date, "2026-11-05");
  assert.equal(cmd("delete zomato in oct").period, "2026-10");
});

test("questions", () => {
  assert.deepEqual(cmd("how much did I spend?"), { kind: "query", period: null, what: "spend" });
  assert.deepEqual(cmd("food total in oct"), { kind: "query", period: "2026-10", what: "category", category: "Food" });
  assert.equal(cmd("totals by category").what, "categories");
  assert.equal(cmd("what's left to pay").what, "pending");
  assert.equal(cmd("runway").what, "runway");
  assert.equal(cmd("how long will my savings last?").what, "runway");
  assert.deepEqual(cmd("infinia bill").account_ids, ["inf"]);
  assert.equal(cmd("what is the infinia bill").what, "bill");
  assert.deepEqual(cmd("list swiggy"), { kind: "query", period: null, what: "rows", target: "swiggy" });
  assert.equal(cmd("how much on swiggy last month").target, "swiggy");
  assert.equal(cmd("balance of hdfc savings").what, "balance");
  assert.equal(cmd("income in oct").what, "income");
  assert.equal(cmd("summary").what, "summary");
});

test("accounts", () => {
  assert.deepEqual(cmd("add card hdfc regalia"), { kind: "account", name: "HDFC Regalia", role: "card" });
  assert.deepEqual(cmd("new savings account kotak"), { kind: "account", name: "Kotak Savings", role: "savings" });
  assert.equal(cmd("add account kotak with balance 50k").balance, 50000);
  assert.equal(cmd("add mutual fund account zerodha").role, "investment");
  assert.equal(cmd("add account hdfc savings").error, "exists");
});

test("billing", () => {
  assert.deepEqual(cmd("infinia billed 23,450"), { kind: "bill", unbill: false, card_ids: ["inf"], named: true, amount: 23450, period: null });
  assert.equal(cmd("mark atlas billed at 12k for oct").period, "2026-10");
  assert.equal(cmd("mark atlas billed at 12k for oct").amount, 12000);
  assert.equal(cmd("mark infinia billed").amount, null);
  assert.equal(cmd("unbill infinia").unbill, true);
  assert.equal(cmd("billed 5000").named, false);
});

test("custom metrics", () => {
  assert.deepEqual(cmd("add metric Savings = income - spend"), { kind: "metric", action: "add", label: "Savings", formula: "income - spend", format: null });
  assert.equal(cmd("create number Food share: pct(food, spend) as percent").format, "percent");
  assert.deepEqual(cmd("remove metric savings"), { kind: "metric", action: "remove", label: "savings" });
  assert.equal(cmd("show metrics").what, "metrics");
});

test("charts", () => {
  assert.deepEqual(cmd("spend trend"), { kind: "chart", months: 6, end: null, type: "spend" });
  assert.equal(cmd("food trend 12 months").category, "Food");
  assert.equal(cmd("food trend 12 months").months, 12);
  assert.equal(cmd("category trend").type, "categories");
  assert.equal(cmd("top merchants").type, "merchants");
  assert.equal(cmd("savings rate").type, "savings");
  assert.deepEqual(cmd("compare oct vs sep").periods, ["2026-10", "2026-09"]);
  assert.deepEqual(cmd("compare with last month").periods, ["2026-11", "2026-10"]);
  assert.equal(cmd("help").kind, "help");
});
