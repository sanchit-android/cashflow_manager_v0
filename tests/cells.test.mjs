import { test } from "node:test";
import assert from "node:assert/strict";
import * as X from "../static/js/cells.js";

test("formulas", () => {
  assert.equal(X.evalFormula("=121+347+103+273"), 844);
  assert.equal(X.evalFormula("=(115000+50000)*1.01475"), 167433.75);
  assert.equal(X.evalFormula("=45000*5%"), 2250);
  assert.equal(X.evalFormula("=-2000+400+2"), -1598);
  assert.equal(X.evalFormula("=1,000/4"), 250);
  assert.throws(() => X.evalFormula("=1+"));
  assert.throws(() => X.evalFormula("=alert(1)"));
  assert.throws(() => X.evalFormula("=5/0"));
  assert.deepEqual(X.parseAmountInput("₹1,234.5"), { value: 1234.5, formula: null });
  assert.deepEqual(X.parseAmountInput("(200)"), { value: -200, formula: null });
  assert.deepEqual(X.parseAmountInput("=10+5"), { value: 15, formula: "=10+5" });
  assert.equal(X.parseAmountInput("  "), null);
  assert.throws(() => X.parseAmountInput("abc"));
});

test("date entry fills month and year from the period", () => {
  assert.equal(X.parseDateInput("5", "2026-10"), "2026-10-05");
  assert.equal(X.parseDateInput("5/9", "2026-10"), "2026-09-05");
  assert.equal(X.parseDateInput("05/09/25", "2026-10"), "2025-09-05");
  assert.equal(X.parseDateInput("2026-01-31", "2026-10"), "2026-01-31");
  assert.equal(X.parseDateInput("12 Nov", "2026-10"), "2026-11-12");
  assert.equal(X.parseDateInput("31/2", "2026-10"), null);
  assert.equal(X.parseDateInput("t"), X.todayISO());
  assert.equal(X.formatDate("2026-10-05"), "05-Oct-26");
  assert.equal(X.formatAmount(123456.5), "1,23,456.5");
  assert.equal(X.formatAmount(-500), "(500)");
});

test("suggestions learn from past descriptions", () => {
  const s = X.buildSuggest([
    { date: "2026-09-01", description: "Swiggy", direction: "out", category: "Food", nature: "variable" },
    { date: "2026-10-01", description: "Swiggy", direction: "out", category: "Grocery", nature: "variable" },
    { date: "2026-10-02", description: "Salary", direction: "in", category: "Other", nature: "income" },
    { date: "2026-10-03", description: "HDFC card bill", direction: "transfer", to_account_id: "card1", category: "Other", nature: "variable" },
  ]);
  assert.equal(s.complete("sw"), "Swiggy");
  assert.equal(s.complete("swiggy"), null, "nothing left to complete");
  assert.deepEqual(s.list("card"), ["HDFC card bill"], "contains matches too");
  assert.deepEqual(s.infer("swiggy"), { direction: "out", category: "Grocery", nature: "variable" }, "latest use wins");
  assert.deepEqual(s.infer("SALARY "), { direction: "in", category: "Other", nature: "income" });
  assert.equal(s.infer("HDFC card bill").to_account_id, "card1");
  assert.equal(s.infer("Swiggy instamart").category, "Grocery", "falls back to first word");
  assert.equal(s.infer("unknown thing"), null);
});
