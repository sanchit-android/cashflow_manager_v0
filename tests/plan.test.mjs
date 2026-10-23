import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readXlsx } from "../static/js/xlsx.js";
import * as I from "../static/js/importer.js";
import * as E from "../static/js/engine.js";
import * as P from "../static/js/plan.js";

const rec = (type, id, data) => ({ id, type, data });
function sample() {
  return E.index([
    rec("account", "main", { name: "Main", role: "spending", opening_balance: 100000, opening_period: "2026-09" }),
    rec("account", "fd", { name: "FD", role: "savings", balance: 500000 }),
    rec("account", "ppf", { name: "PPF", role: "long_term", balance: 150000 }),
    rec("annual", "a1", { year: 2026, label: "Fees", total: 60000, due_month: 11 }),
    rec("annual", "a2", { year: 2026, label: "Insurance", total: 12000, due_month: null }),
    rec("transaction", "t1", { date: "2026-09-01", account_id: "main", amount: 45000, direction: "in", nature: "income" }),
    rec("transaction", "t2", { date: "2026-09-05", account_id: "main", amount: 65000, direction: "out", nature: "variable" }),
    rec("transaction", "t3", { date: "2026-09-06", account_id: "main", amount: 300000, direction: "in", nature: "income_oneoff" }),
    rec("transaction", "t4", { date: "2026-10-01", account_id: "main", amount: 45000, direction: "in", nature: "income" }),
    rec("transaction", "t5", { date: "2026-10-05", account_id: "main", amount: 75000, direction: "out", nature: "variable" }),
    rec("transaction", "t6", { date: "2026-10-09", account_id: "main", amount: 12000, direction: "out", nature: "annual", annual_id: "a2" }),
    rec("note", "n1", { period: "2026-10", text: "Painting" }),
  ]);
}

test("year view: net burn excludes one-off inflows; total out adds annual items", () => {
  const y = P.yearView(sample(), 2026);
  const sep = y.months[8], oct = y.months[9];
  assert.equal(sep.net_burn, 20000);
  assert.equal(sep.oneoff_inflow, 300000);
  assert.equal(oct.net_burn, 30000);
  assert.equal(oct.total_out, 42000);
  assert.equal(oct.note, "Painting");
  assert.equal(y.months_with_data, 2);
  assert.equal(y.avg_net_burn, 25000);
  assert.equal(y.months[0].hasData, false);
});

test("projection: burn, growth, annual items in their months, run-out month", () => {
  const db = sample();
  const opts = { burn: 100000, burn_growth_pct: 10, annual_base: 72000, annual_growth_pct: 0, holiday_per_year: 0, horizon_year: 2027 };
  const pr = P.project(db, opts, "2026-11", 600000);
  assert.deepEqual(pr.years.map((y) => [y.year, y.monthly, y.annual]), [[2026, 200000, 60000], [2027, 1320000, 72000]], "Insurance already paid; 2027 at full base");
  assert.equal(pr.series[0].annual, 60000, "fees fall due in November");
  assert.equal(pr.series[0].balance, 600000 - 100000 - 60000);
  assert.equal(pr.runs_out, "2027-04");
  assert.equal(pr.committed, 200000 + 60000 + 1320000 + 72000);
});

test("defaults come from recent data", () => {
  const d = P.defaultProjection(sample(), "2026-11");
  assert.equal(d.burn, 25000);
  assert.equal(d.annual_base, 72000);
  assert.equal(d.horizon_year, 2028);
});

test("checkpoint totals and pre-fill", () => {
  const db = sample();
  const snap = P.prefillSnapshot(db, "2026-10", { burn: 50000, burn_growth_pct: 0, annual_base: 72000, annual_growth_pct: 0, horizon_year: 2026 }, "2026-10-20");
  const t = P.snapshotTotals(snap);
  assert.equal(t.liquid, 500000 + E.summarize(db, "2026-10").closing);
  assert.equal(t.illiquid, 150000);
  assert.ok(snap.items.some((i) => i.label === "2026 annual items" && i.amount === 60000));
  assert.ok(snap.items.some((i) => i.label === "2026 monthly spending" && i.amount === 150000));
  assert.equal(t.gap, t.liquid - t.committed);
  // with an earlier checkpoint, holdings carry forward and commitments are recalculated
  const db2 = E.index([...["main", "fd", "ppf"].map((id) => ({ id, type: "account", data: db.accountsById[id] })),
    { id: "s1", type: "snapshot", data: { date: "2026-09-30", items: [{ group: "liquid", label: "FDs", amount: 2000000 }, { group: "commitment", label: "old", amount: 5 }, { group: "illiquid", label: "PPF", amount: 9 }] } }]);
  const next = P.prefillSnapshot(db2, "2026-10", { burn: 50000, burn_growth_pct: 0, annual_base: 0, annual_growth_pct: 0, horizon_year: 2026 }, "2026-10-20");
  assert.deepEqual(next.items.filter((i) => i.group !== "commitment").map((i) => i.label), ["FDs", "PPF"]);
  assert.ok(!next.items.some((i) => i.label === "old"));
});

test("workbook import brings in checkpoints, notes, lending and one-off inflows", async () => {
  const book = await readXlsx(readFileSync(new URL("./fixtures/finances-sample.xlsx", import.meta.url)));
  const snaps = await I.checkpointSnapshots(book);
  assert.deepEqual(snaps.map((s) => [s.date, P.snapshotTotals(s)]), [
    ["2026-09-30", { liquid: 520000, committed: 340000, illiquid: 150000, gap: 180000 }],
    ["2026-10-31", { liquid: 450000, committed: 200000, illiquid: 0, gap: 250000 }]]);
  assert.deepEqual(await I.cashflowNotes(book), [{ period: "2026-10", text: "Diwali shopping" }]);
  const r = await I.importFinancesWorkbook(book, { mainAccount: { id: "main", data: { name: "Main" } }, accounts: [], batch: "b" });
  assert.equal(r.report.checkpointCount, 2);
  assert.equal(r.report.noteCount, 1);
  assert.ok(r.report.months.every((m) => m.diff === 0));
});
