import { test } from "node:test";
import assert from "node:assert/strict";
import { parse, evaluate } from "../static/js/formula.js";

test("formula: arithmetic and precedence", () => {
  assert.equal(evaluate("1 + 2 * 3", {}), 7);
  assert.equal(evaluate("(1 + 2) * 3", {}), 9);
  assert.equal(evaluate("-a + 10 % 4", { a: 3 }), -1);
});
test("formula: variables and functions", () => {
  const v = { income: 200, spend: 50 };
  assert.equal(evaluate("pct(spend, income)", v), 25);
  assert.equal(evaluate("avg(income, spend)", v), 125);
  assert.equal(evaluate("round(spend / 3, 1)", v), 16.7);
  assert.equal(evaluate("max(income - spend, 0)", v), 150);
});
test("formula: missing data and divide by zero give null", () => {
  assert.equal(evaluate("a / 0", { a: 1 }), null);
  assert.equal(evaluate("a + 1", { a: null }), null);
});
test("formula: bad syntax and unknown names throw", () => {
  assert.throws(() => parse("1 +", ["a"]));
  assert.throws(() => parse("b * 2", ["a"]), /Unknown number "b"/);
  assert.throws(() => parse("foo(1)", []), /Unknown function/);
  assert.throws(() => parse("a; alert(1)", ["a"]));
});
