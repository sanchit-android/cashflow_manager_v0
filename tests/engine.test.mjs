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
