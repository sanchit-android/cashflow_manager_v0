import { test } from "node:test";
import assert from "node:assert/strict";
import { setCurrency, money, compact } from "../static/js/currency.js";
import { parseAmountInput } from "../static/js/cells.js";

test("money and chart labels follow the chosen currency", () => {
  setCurrency("INR");
  assert.equal(money(125000), "₹1,25,000");
  assert.equal(compact(1250000), "₹13L");
  setCurrency("USD");
  assert.equal(money(-125000), "−$125,000");
  assert.equal(compact(1250000), "$1.3M");
  setCurrency("XXX"); // unknown falls back to INR
  assert.equal(money(0), "₹0");
});

test("amount entry accepts common currency symbols", () => {
  for (const [t, v] of [["$1,200", 1200], ["£50", 50], ["AED 300", 300], ["S$20", 20], ["€(40)", -40]]) assert.equal(parseAmountInput(t).value, v);
});
