// Run: node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import * as E from "../static/js/engine.js";
import * as C from "../static/js/crypto.js";

const rec = (type, id, data) => ({ id, type, data });

function sample() {
  return E.index([
    rec("settings", "s", { funding_mode: "savings", period_mode: "calendar" }),
    rec("account", "main", { name: "Main", role: "spending", is_default_spending: true, opening_balance: 1483611, opening_period: "2026-10" }),
    rec("account", "card", { name: "Infinia", role: "card" }),
    rec("account", "fd", { name: "FD", role: "savings", balance: 2000000 }),
    rec("account", "mf", { name: "MF", role: "investment", balance: 163375 }),
    rec("commitment", "c-help", { label: "House help", amount: 14000, category: "Household" }),
    rec("commitment", "c-tuition", { label: "Tuitions", amount: 7100, category: "Education" }),
    rec("annual", "a-fees", { year: 2026, label: "School fees", total: 160000, due_month: 10 }),
    rec("annual", "a-g1", { year: 2026, label: "Google One", total: 1300, due_month: 11 }),
    rec("transaction", "t1", { date: "2026-10-01", account_id: "main", amount: 47250, direction: "in", nature: "income", category: "Rent" }),
    rec("transaction", "t2", { date: "2026-10-03", account_id: "card", amount: 25970, direction: "out", nature: "variable", category: "Grocery" }),
    rec("transaction", "t3", { date: "2026-10-05", account_id: "main", amount: 14000, direction: "out", nature: "recurring", category: "Household", recurring_id: "c-help" }),
    rec("transaction", "t4", { date: "2026-10-10", account_id: "card", amount: 160000, direction: "out", nature: "annual", category: "Education", annual_id: "a-fees" }),
    rec("transaction", "t5", { date: "2026-10-20", account_id: "main", to_account_id: "mf", amount: 44837, direction: "transfer", nature: "investment" }),
    rec("transaction", "t6", { date: "2026-10-24", account_id: "main", to_account_id: "card", amount: 185970, direction: "transfer" }),
    rec("transaction", "t7", { date: "2026-11-02", account_id: "card", amount: 2540, direction: "out", nature: "variable", category: "Grocery" }),
  ]);
}

test("period keys", () => {
  assert.equal(E.periodOf("2026-10-25"), "2026-10");
  assert.equal(E.periodOf("2026-10-25", { period_mode: "pay_cycle", cycle_day: 26 }), "2026-09");
  assert.equal(E.periodOf("2026-01-05", { period_mode: "pay_cycle", cycle_day: 26 }), "2025-12");
  assert.equal(E.shiftPeriod("2026-12", 1), "2027-01");
  assert.equal(E.shiftPeriod("2026-01", -1), "2025-12");
});

test("month summary separates monthly, annual and investments", () => {
  const s = E.summarize(sample(), "2026-10");
  assert.equal(s.opening, 1483611);
  assert.equal(s.regular_inflow, 47250);
  assert.equal(s.monthly_expense, 25970 + 14000);
  assert.equal(s.annual_expense, 160000);
  assert.equal(s.investments, 44837, "investment is cash out but not an expense");
  assert.equal(s.card_payments, 185970);
  assert.equal(s.net_position, 47250 - 39970);
  assert.equal(s.verdict.kind, "drawing");
  assert.equal(s.verdict.amount, 160000 - 7280);
  assert.equal(s.closing, 1483611 + 47250 - 14000 - 44837 - 185970);
  assert.equal(s.commitments_pending, 7100, "tuition not yet paid");
});

test("next month opens at last month's close", () => {
  const db = sample();
  assert.equal(E.summarize(db, "2026-11").opening, E.summarize(db, "2026-10").closing);
});

test("annual status, upcoming and runway", () => {
  const db = sample();
  const a = E.annualStatus(db, 2026);
  assert.deepEqual(a.map((x) => [x.label, x.paid, x.unpaid]), [["School fees", 160000, 0], ["Google One", 0, 1300]]);
  const up = E.upcoming(db, "2026-11", 1);
  assert.ok(up.some((u) => u.label === "Google One" && u.kind === "Annual"));
  assert.ok(up.some((u) => u.label === "House help"));
  const r = E.runway(db, "2026-11");
  assert.equal(r.savings, 2163375);
  assert.equal(r.burn, 25970 + 14000 + 160000 - 47250);
  assert.equal(r.months, Math.floor(2163375 / r.burn));
});

test("salaried user ahead of plan", () => {
  const db = E.index([
    rec("account", "m", { role: "spending", opening_balance: 10000, opening_period: "2026-10" }),
    rec("transaction", "s", { date: "2026-10-26", account_id: "m", amount: 100000, direction: "in", nature: "income" }),
    rec("transaction", "e", { date: "2026-10-27", account_id: "m", amount: 30000, direction: "out", nature: "variable" }),
  ]);
  const s = E.summarize(db, "2026-10");
  assert.deepEqual(s.verdict, { kind: "ahead", amount: 70000 });
  assert.equal(s.closing, 80000);
});

test("vault: passphrase, every recovery key, wrong secrets, re-wrap", async () => {
  C.DEFAULT_KDF.iterations = 1000; // keep tests fast
  const { payload, dataKey, recoveryKeys } = await C.createVault("correct horse battery", 3);
  assert.equal(recoveryKeys.length, 3);
  const vault = { ...payload, keys: payload.recovery_keys };
  const row = { id: "r1", type: "transaction", ...(await C.encryptRecord(dataKey, "u1", { id: "r1", type: "transaction", data: { amount: 42 } })) };

  const k1 = await C.unlockWithPassphrase(vault, "correct horse battery");
  assert.deepEqual(await C.decryptRecord(k1, "u1", row), { amount: 42 });
  for (const rk of recoveryKeys) {
    const { dataKey: k } = await C.unlockWithRecoveryKey(vault, rk.toLowerCase().replace(/-/g, " "));
    assert.deepEqual(await C.decryptRecord(k, "u1", row), { amount: 42 });
  }
  await assert.rejects(C.unlockWithPassphrase(vault, "wrong"));
  await assert.rejects(C.unlockWithRecoveryKey(vault, C.newRecoveryKey()));
  await assert.rejects(C.decryptRecord(k1, "u2", row), "record bound to its owner");
  await assert.rejects(C.decryptRecord(k1, "u1", { ...row, type: "account" }), "record bound to its type");

  const raw = await C.rawFromPassphrase(vault, "correct horse battery");
  const v2 = { ...vault, ...(await C.rewrapPassphrase(vault, raw, "new passphrase here")) };
  const k2 = await C.unlockWithPassphrase(v2, "new passphrase here");
  assert.deepEqual(await C.decryptRecord(k2, "u1", row), { amount: 42 });
  await C.unlockWithRecoveryKey(v2, recoveryKeys[0]); // old recovery keys still work
});

test("card roll-up counts card spending against main unless the bill was paid that month", () => {
  const base = [
    rec("account", "main", { name: "Main", role: "spending", is_default_spending: true, opening_balance: 100000, opening_period: "2026-09" }),
    rec("account", "c1", { name: "HDFC", role: "card" }),
    rec("account", "c2", { name: "ICICI", role: "card" }),
    rec("transaction", "a", { date: "2026-09-03", account_id: "c1", amount: 5000, direction: "out", nature: "variable" }),
    rec("transaction", "b", { date: "2026-09-04", account_id: "c2", amount: 3000, direction: "out", nature: "variable" }),
    rec("transaction", "c", { date: "2026-09-20", account_id: "main", to_account_id: "c2", amount: 3000, direction: "transfer" }),
    rec("transaction", "d", { date: "2026-10-03", account_id: "c1", amount: 2000, direction: "out", nature: "variable" }),
  ];
  const off = E.index([rec("settings", "s", {}), ...base]);
  assert.deepEqual(E.cardRollups(off, "2026-09"), [], "off unless the user turns it on");
  assert.equal(E.summarize(off, "2026-09").closing, 97000);
  const on = E.index([rec("settings", "s", { card_rollup: true }), ...base]);
  assert.deepEqual(E.cardRollups(on, "2026-09"), [{ card_id: "c1", name: "HDFC", amount: 5000 }], "ICICI was paid by transfer");
  const sep = E.summarize(on, "2026-09");
  assert.equal(sep.closing, 100000 - 3000 - 5000);
  assert.equal(sep.monthly_expense, 8000, "spending counted once");
  assert.equal(E.summarize(on, "2026-10").opening, sep.closing, "roll-ups carry into next month's opening");
  assert.equal(E.summarize(on, "2026-10").closing, sep.closing - 2000);
  const mainOct = E.accountMonth(on, "main", "2026-10");
  assert.deepEqual([mainOct.opening, mainOct.rolled, mainOct.closing], [92000, 2000, 90000]);
  assert.equal(E.accountMonth(on, "c1", "2026-10").outstanding, 0, "rolled up, so nothing outstanding");
  assert.equal(E.accountMonth(off, "c1", "2026-10").outstanding, 7000);
  assert.equal(E.accountMonth(off, "c2", "2026-09").outstanding, 0);
});

test("closed accounts only show in months with activity", () => {
  const db = E.index([rec("account", "old", { name: "Old card", role: "card", closed_from: "2026-08" }),
    rec("transaction", "t", { date: "2026-08-05", account_id: "old", amount: 10, direction: "out" })]);
  const acc = db.accountsById.old;
  assert.equal(E.accountVisible(db, acc, "2026-07"), true);
  assert.equal(E.accountVisible(db, acc, "2026-08"), true, "has a transaction");
  assert.equal(E.accountVisible(db, acc, "2026-09"), false);
});

test("card billing and month close", () => {
  const base = sample();
  assert.equal(E.cardBill(base, "card", "2026-10"), 185970);
  let st = E.monthStatus(base, "2026-10");
  assert.equal(st.allBilled, false);
  assert.equal(st.pending.length, 1);
  assert.equal(E.currentPeriod(base, "2026-10-28"), "2026-10");

  const withClose = (cards, closed) => E.index([...[
    rec("settings", "s", { period_mode: "calendar" }),
    rec("account", "card", { name: "Infinia", role: "card" }),
    rec("transaction", "t2", { date: "2026-10-03", account_id: "card", amount: 25970, direction: "out" }),
    rec("transaction", "t3", { date: "2026-10-04", account_id: "card", amount: 970, direction: "in" }),
  ], rec("month_close", "mc", { period: "2026-10", closed, cards })]);
  let d = withClose({ card: { amount: 25000 } }, false);
  st = E.monthStatus(d, "2026-10");
  assert.equal(st.allBilled, true);
  assert.equal(st.cards[0].stale, false);
  d = withClose({ card: { amount: 26000 } }, true);
  assert.equal(E.monthStatus(d, "2026-10").cards[0].stale, true);
  // closing October early makes November current, and late-October entries made in November stay there
  assert.equal(E.currentPeriod(d, "2026-10-28"), "2026-11");
  assert.equal(E.periodForDate(d, "2026-10-29", "2026-11"), "2026-11");
  assert.equal(E.periodForDate(d, "2026-10-29", "2026-10"), "2026-10");
  assert.equal(E.periodForDate(d, "2026-09-29", "2026-11"), "2026-09");
});

test("legacy closes cover months before today", () => {
  const d = sample();
  const closes = E.legacyCloses(d, "2026-11-05", "x");
  assert.deepEqual(closes.map((c) => c.period), ["2026-10"]);
  assert.equal(closes[0].cards.card.amount, 185970);
  assert.equal(E.legacyCloses(d, "2026-10-05", "x").length, 0);
});
