import { test } from "node:test";
import assert from "node:assert/strict";
import { redact } from "../static/js/chatlog.js";

const accounts = [{ name: "HDFC Infinia", aliases: ["inf"] }, { name: "Axis Atlas" }, { name: "Main account" }];

test("amounts, dates and accounts are replaced", () => {
  assert.equal(redact("paid 1.6L school fee from hdfc infinia on 3 nov", accounts), "paid <amt> school fee from <acct> on <date>");
  assert.equal(redact("₹1,20,000 rent 3/11", accounts), "<amt> rent <date>");
  assert.equal(redact("347+273 swiggy with atlas", accounts), "<amt> swiggy with <acct>");
  assert.equal(redact("infinia billed 23,450 for oct", accounts), "<acct> billed <amt> for oct");
  assert.equal(redact("50k sip nov 3rd", accounts), "<amt> sip <date>");
  assert.equal(redact("rs 450 inf", accounts), "<amt> <acct>");
  assert.equal(redact("mail me at a@b.com", accounts), "mail me at <email>");
});

test("phrasing is kept and generic words aren't treated as accounts", () => {
  assert.equal(redact("how much on main stuff", accounts), "how much on main stuff");
  assert.equal(redact("balance of main account", accounts), "balance of <acct>");
  assert.equal(redact("change swiggy to grocery", accounts), "change swiggy to grocery");
  assert.ok(redact("x".repeat(500)).length <= 300);
});
