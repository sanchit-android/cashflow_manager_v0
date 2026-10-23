import { test } from "node:test";
import assert from "node:assert/strict";
import * as E from "../static/js/engine.js";
import * as N from "../static/js/insights.js";

const rec = (type, id, data) => ({ id, type, data });
const tx = (id, date, amount, nature, category, description) => rec("transaction", id, { date, account_id: "m", amount, direction: "out", nature, category, description });
function db() {
  const rows = [rec("account", "m", { role: "spending", opening_balance: 0, opening_period: "2026-01" }),
    rec("commitment", "c1", { label: "Rent", amount: 30000, category: "Rent" }), rec("commitment", "c2", { label: "Gym", amount: 2000, category: "Personal" }),
    rec("annual", "a1", { year: 2026, label: "Fees", total: 120000, due_month: 6 }), rec("annual", "a2", { year: 2026, label: "Insurance", total: 24000 })];
  let i = 0;
  for (let m = 1; m <= 9; m++) {
    const p = `2026-${String(m).padStart(2, "0")}`;
    rows.push(tx(`r${m}`, `${p}-01`, 30000, "recurring", "Rent", "Rent"));
    rows.push(tx(`f${m}`, `${p}-05`, m <= 6 ? 10000 : 5000, "variable", "Food", m % 2 ? "Swiggy food" : "swiggy instamart"));
    rows.push(tx(`s${m}`, `${p}-07`, m <= 6 ? 2000 : 6000, "variable", "Shopping", "Amazon"));
    i++;
  }
  rows.push({ ...tx("ann", "2026-03-10", 24000, "annual", "Insurance", "Insurance"), data: { ...tx("ann", "2026-03-10", 24000, "annual", "Insurance", "Insurance").data, annual_id: "a2" } });
  rows.push(tx("one", "2026-04-10", 15000, "oneoff", "Other", "Laptop repair"));
  return E.index(rows);
}

test("window starts at first month with data", () => {
  assert.deepEqual(N.windowPeriods(db(), "2026-03", 6), ["2026-01", "2026-02", "2026-03"]);
  assert.equal(N.latestPeriod(db()), "2026-09");
});

test("fixed vs flexible split", () => {
  const s = N.natureSplit(db(), N.windowPeriods(db(), "2026-09", 12));
  const g = Object.fromEntries(s.groups.map((x) => [x.key, x.amount]));
  assert.deepEqual(g, { fixed: 270000, flexible: 6 * 12000 + 3 * 11000, annual: 24000, oneoff: 15000 });
  assert.equal(s.groups.reduce((x, y) => x + y.pct, 0) >= 99, true);
  assert.equal(s.months, 9);
});

test("commitments with yearly cost", () => {
  assert.deepEqual(N.commitmentsYearly(db(), "2026-09").map((c) => [c.label, c.monthly, c.yearly]), [["Rent", 30000, 360000], ["Gym", 2000, 24000]]);
});

test("category trends flag big moves only", () => {
  const t = Object.fromEntries(N.categoryTrends(db(), "2026-09").map((x) => [x.category, x]));
  assert.deepEqual([t.Food.recent, t.Food.before, t.Food.change, t.Food.flag], [5000, 10000, -50, "down"]);
  assert.deepEqual([t.Shopping.recent, t.Shopping.before, t.Shopping.flag], [6000, 2000, "up"]);
  assert.equal(t.Rent, undefined, "fixed commitments are excluded");
});

test("merchants group by first word", () => {
  const m = N.topMerchants(db(), N.windowPeriods(db(), "2026-09", 12));
  assert.equal(m[0].key, "swiggy");
  assert.equal(m[0].amount, 6 * 10000 + 3 * 5000);
  assert.equal(m[0].count, 9);
  assert.ok(!m.some((x) => x.key === "rent"), "commitments aren't merchants");
});

test("annual calendar and set-aside", () => {
  const a = N.annualCalendar(db(), 2026, "2026-09");
  assert.equal(a.months[2].paid, 24000);
  assert.equal(a.months[5].due, 120000, "unpaid fees at their due month");
  assert.equal(a.total, 144000);
  assert.equal(a.setAside, 12000);
  assert.equal(a.setAsideRemaining, 30000, "120000 over the 4 months left");
  assert.equal(a.peak.month, 6);
});

test("headlines", () => {
  const d = db(), ps = N.windowPeriods(d, "2026-09", 12);
  const h = N.headlines({ split: N.natureSplit(d, ps), trends: N.categoryTrends(d, "2026-09"), merchants: N.topMerchants(d, ps), annual: N.annualCalendar(d, 2026, "2026-09") });
  assert.equal(h.length, 3);
  assert.match(h[0].title, /% of spending is fixed/);
  assert.equal(h[1].title, "Shopping up ₹4,000 a month (+200%)");
  assert.equal(h[2].title, "Food down ₹5,000 a month (-50%)");
});

test("runway what-ifs and levers", () => {
  const d = E.index([rec("account", "m", { role: "spending", opening_balance: 0, opening_period: "2026-01" }),
    rec("commitment", "c1", { label: "Rent", amount: 30000, category: "Rent" }),
    ...[1, 2, 3].map((m) => tx(`f${m}`, `2026-0${m}-05`, 20000, "variable", "Food", "Swiggy"))]);
  const opts = { burn: 100000, burn_growth_pct: 0, annual_base: 0, annual_growth_pct: 0, holiday_per_year: 0 };
  assert.equal(N.runwayMonths(d, opts, "2026-04", 1000000), 10, "10 lakh at 1 lakh a month: 10 full months");
  const w = N.whatIf(d, opts, "2026-04", 1000000, { flexCutPct: 50, flexMonthly: 20000, fixedCut: 0, extraIncome: 15000 });
  assert.deepEqual([w.saving, w.burn, w.base, w.after, w.gained], [25000, 75000, 10, 13.33, 3.33]);
  const lv = N.biggestLevers(d, opts, "2026-04", 1000000, ["2026-01", "2026-02", "2026-03"], 20);
  assert.deepEqual(lv.map((l) => [l.label, l.saving, l.gained]), [["Rent", 6000, 0.64], ["Food", 4000, 0.42]]);
  const big = N.biggestLevers(d, opts, "2026-04", 5000000, ["2026-01", "2026-02", "2026-03"], 20);
  assert.equal(big[0].gained, 3.19, "50 lakh: 50 → 53.19 months when rent drops by 6k");
  assert.equal(N.whatIf(d, { ...opts, burn: 10000 }, "2026-04", 1000000, { extraIncome: 20000 }).after, Infinity, "income covers spending: never runs out");
});

test("drawdown, burn vs plan, savings rate", () => {
  const dd = N.drawdown({ burn: 200000, annual_base: 600000, holiday_per_year: 0 }, 6000000);
  assert.deepEqual(dd, { yearly: 3000000, pct: 50, breakEvenExtra: 250000 });
  const d = E.index([rec("account", "m", { role: "spending", opening_balance: 0, opening_period: "2026-01" }),
    rec("transaction", "i1", { date: "2026-01-01", account_id: "m", amount: 100000, direction: "in", nature: "income" }),
    tx("e1", "2026-01-05", 70000, "variable", "Food", "x"), tx("a1", "2026-01-06", 10000, "annual", "Other", "y"),
    rec("transaction", "i2", { date: "2026-02-01", account_id: "m", amount: 100000, direction: "in", nature: "income" }),
    tx("e2", "2026-02-05", 120000, "variable", "Food", "x")]);
  const sr = N.savingsRate(d, ["2026-01", "2026-02"]);
  assert.deepEqual(sr.rows.map((r) => [r.saved, r.rate]), [[20000, 20], [-20000, -20]]);
  assert.deepEqual([sr.rate, sr.overspent, sr.best.period], [0, 1, "2026-01"]);
  assert.deepEqual(N.burnVsPlan(d, ["2026-02"], 15000)[0], { period: "2026-02", actual: 20000, planned: 15000, diff: 5000 });
});
