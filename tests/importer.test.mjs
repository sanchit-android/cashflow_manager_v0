import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readXlsx } from "../static/js/xlsx.js";
import * as I from "../static/js/importer.js";
import * as E from "../static/js/engine.js";

const fixture = () => readFileSync(new URL("./fixtures/finances-sample.xlsx", import.meta.url));

test("csv parsing handles quotes, commas, semicolons", () => {
  assert.deepEqual(I.parseCSV('Date,Desc,Amount\n01/10/2026,"Swiggy, dinner",450\n'), [["Date", "Desc", "Amount"], ["01/10/2026", "Swiggy, dinner", "450"]]);
  assert.deepEqual(I.parseCSV("a;b\n1;\"x\"\"y\"\n"), [["a", "b"], ["1", 'x"y']]);
});

test("dates and amounts", () => {
  assert.equal(I.parseDate("05/10/2026"), "2026-10-05");
  assert.equal(I.parseDate("05/10/2026", "mdy"), "2026-05-10");
  assert.equal(I.parseDate("2026-10-05"), "2026-10-05");
  assert.equal(I.parseDate("5 Oct 2026"), "2026-10-05");
  assert.equal(I.parseDate(46300), "2026-10-05");
  assert.equal(I.parseDate("nope"), null);
  assert.equal(I.parseAmount("₹1,234.50"), 1234.5);
  assert.equal(I.parseAmount("(200)"), -200);
  assert.equal(I.parseAmount("-75"), -75);
  assert.equal(I.parseAmount(""), null);
});

test("generic table import: single amount column and debit/credit columns", () => {
  const rows = [["Date", "Narration", "Amount", "Category"], ["01/10/2026", "Swiggy", "450", "food"], ["02/10/2026", "Refund", "-100", ""], ["bad", "x", "1", ""]];
  const m = I.guessMapping(rows[0]);
  const r = I.importTable(rows, m, { account_id: "a", sign: "spent_positive", settings: {}, batch: "b" });
  assert.equal(r.items.length, 2);
  assert.deepEqual(r.report.skippedRows, [4]);
  assert.equal(r.items[0].data.category, "Food");
  assert.equal(r.items[1].data.direction, "in");
  const bank = [["Txn Date", "Description", "Debit", "Credit"], ["03/10/2026", "Rent", "", "47,250"], ["04/10/2026", "Bescom", "3,035", ""]];
  const r2 = I.importTable(bank, I.guessMapping(bank[0]), { account_id: "a", settings: {}, batch: "b" });
  assert.deepEqual(r2.items.map((x) => [x.data.direction, x.data.amount]), [["in", 47250], ["out", 3035]]);
});

test("Finances workbook: reads every block and reconciles closing balances", async () => {
  const book = await readXlsx(fixture());
  assert.equal(await I.looksLikeFinancesWorkbook(book), true);
  const r = await I.importFinancesWorkbook(book, { mainAccount: { id: "main", data: { name: "Main account" } }, accounts: [], batch: "b" });
  assert.deepEqual(r.report.months.map((m) => [m.period, m.diff]), [["2026-09", 0], ["2026-10", 0]]);
  assert.deepEqual(r.opening, { opening_balance: 100000, opening_period: "2026-09" });
  assert.equal(r.report.annualCount, 2);
  assert.equal(r.items.filter((i) => i.type === "commitment").length, 2, "rent and help; annual cash line is not a commitment");

  const db = E.index([{ id: "main", type: "account", data: { role: "spending", ...r.opening } }, ...r.items]);
  const sep = E.summarize(db, "2026-09");
  assert.equal(sep.regular_inflow, 47250);
  assert.equal(sep.investments, 10000, "investment is a transfer, not spending");
  assert.equal(sep.annual_expense, 1000 + 3000, "cash annual + card line tagged Annual");
  assert.equal(sep.monthly_expense, 20000 + 5000 + 2000 + 1500 - 500 + 800);
  assert.equal(sep.commitments_pending, 0, "imported payments are linked to commitments");
  const annual = E.annualStatus(db, 2026);
  assert.deepEqual(annual.map((a) => [a.label, a.paid, a.unpaid]), [["Health Insurance", 3000, 27000], ["Property tax", 0, 4000]]);
  assert.equal(r.items.filter((i) => i.data.import_batch === "b").length, r.items.length, "every record tagged for undo");
});

test("existing accounts are reused by name", async () => {
  const book = await readXlsx(fixture());
  const r = await I.importFinancesWorkbook(book, { mainAccount: { id: "main", data: {} }, accounts: [{ id: "x", data: { name: "Test Bank Card" } }], batch: "b" });
  assert.equal(r.items.filter((i) => i.type === "account" && i.data.name === "Test Bank Card").length, 0);
  assert.ok(r.items.some((i) => i.type === "transaction" && i.data.account_id === "x"));
});
