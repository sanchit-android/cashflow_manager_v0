// Pre-loaded sample household data for Demo Mode (/app?demo=1).
// Runs entirely in browser memory so visitors can explore every screen, edit cells,
// test what-if sliders, import spreadsheets, and switch themes or currencies without signing in.
import * as E from "./engine.js";

export function buildDemoRecords(todayStr = new Date().toISOString().slice(0, 10)) {
  const cur = E.periodOf(todayStr);
  const year = +cur.slice(0, 4);
  const p = (offset) => E.shiftPeriod(cur, offset);
  let seq = 1;
  const id = (prefix) => `demo-${prefix}-${seq++}`;
  const out = [];
  const add = (recId, type, period, data) => {
    out.push({ id: recId, type, period: period || "", version: 1, deleted: false, data });
    return recId;
  };

  let savedTheme = "excel";
  try { savedTheme = globalThis.window?.localStorage?.getItem("theme") || "excel"; } catch (e) { /* ignore */ }

  // 1. Settings
  add("demo-settings", "settings", "", {
    funding_mode: "both",
    period_mode: "calendar",
    cycle_day: 1,
    theme: savedTheme,
    currency: "INR",
    card_rollup: true,
    closing_migrated: true,
    custom_metrics: [
      { id: "savrate", label: "Savings rate", formula: "pct(regular_net, regular_income)", format: "percent", better: 1 },
    ],
    month_metrics: ["regular_expense", "regular_net", "pending", "card_payments", "c:savrate"],
    projection: {
      burn: 68000,
      burn_growth_pct: 8,
      annual_base: 210000,
      annual_growth_pct: 6,
      holiday_per_year: 60000,
      horizon_year: year + 4,
    },
  });

  // 2. Accounts
  const accMain = add("acct-main", "account", "", {
    name: "Main account", kind: "bank", role: "spending", is_default_spending: true,
    opening_balance: 195000, opening_period: p(-8),
  });
  const accHdfc = add("acct-hdfc", "account", "", { name: "HDFC Regalia Card", kind: "credit_card", role: "card" });
  const accIcici = add("acct-icici", "account", "", { name: "ICICI Amazon Pay Card", kind: "credit_card", role: "card" });
  const accSbi = add("acct-sbi", "account", "", { name: "SBI Cashback Card", kind: "credit_card", role: "card" });
  const accEmerg = add("acct-emerg", "account", "", {
    name: "Emergency Liquid Fund", kind: "bank", role: "savings", balance: 650000, liquid: true,
  });
  const accMf = add("acct-mf", "account", "", {
    name: "Nifty 50 & Flexicap MF", kind: "mutual_fund", role: "investment", balance: 1420000, liquid: true,
  });
  add("acct-ppf", "account", "", {
    name: "PPF & EPF Retirement", kind: "ppf", role: "long_term", balance: 940000, liquid: false,
  });

  // 3. Regular income
  add(id("inc"), "income", "", { label: "Monthly Salary (In-Hand)", kind: "salary", amount: 165000, day: 1 });
  add(id("inc"), "income", "", { label: "Savings & FD Interest", kind: "interest", amount: 4500, day: 28 });

  // 4. Monthly fixed commitments
  const commitments = [
    ["cm-rent", "Flat Rent", "Rent", 5, 34000],
    ["cm-help", "Cook & Househelp", "Household", 3, 8500],
    ["cm-maint", "Society Maintenance", "Household", 7, 4500],
    ["cm-school", "School Tuition & Bus", "Education", 10, 12000],
    ["cm-parents", "Parents Health & Support", "Family", 5, 10000],
    ["cm-net", "Fiber Broadband & Mobile", "Utilities", 12, 2200],
  ];
  for (const [cid, label, category, day, amount] of commitments) {
    add(cid, "commitment", "", { label, category, day, amount, account_id: accMain, active_from: p(-8) });
  }

  // 5. Annual items for current year (some paid in earlier months, some upcoming)
  const curMonth = +cur.slice(5);
  const dueSoon1 = ((curMonth) % 12) + 1;
  const dueSoon2 = ((curMonth + 1) % 12) + 1;
  const annualDefs = [
    ["an-school", "School Annual & Books Fee", 4, "cash", 48000, true, -5],
    ["an-health", "Family Floater Health Insurance", 6, "card", 36000, true, -3],
    ["an-term", "Term Life Insurance Premium", 8, "card", 24000, true, -2],
    ["an-tax", "Property & Municipal Tax", 9, "cash", 14000, true, -1],
    ["an-fest", "Diwali Gifts, Travel & Bonus", dueSoon1, "card", 60000, false, null],
    ["an-car", "Car Insurance & Annual Service", dueSoon2, "card", 28000, false, null],
  ];
  for (const [aid, label, due_month, mode, total] of annualDefs) {
    add(aid, "annual", "", { year, label, due_month, mode, total });
  }

  // 6. Transactions across 9 months: p(-8) to p(0)
  for (let off = -8; off <= 0; off++) {
    const per = p(off);
    const isCurrent = off === 0;
    const isRecent = off >= -2; // last 3 months have higher Food and lower Shopping so category trends light up
    const idx = off + 8; // 0..8

    // Inflows
    add(id("tx"), "transaction", per, {
      date: `${per}-01`, period: per, account_id: accMain, direction: "in", amount: 165000,
      description: "Monthly Salary (In-Hand)", category: "Other", nature: "income",
    });
    add(id("tx"), "transaction", per, {
      date: `${per}-25`, period: per, account_id: accMain, direction: "in", amount: 4500,
      description: "Savings & FD Interest", category: "Other", nature: "income",
    });
    if (off === -4) {
      add(id("tx"), "transaction", per, {
        date: `${per}-15`, period: per, account_id: accMain, direction: "in", amount: 75000,
        description: "Performance Bonus (After Tax)", category: "Other", nature: "income_oneoff",
      });
    }

    // Fixed commitments (in current month, leave 2 unpaid so "Still to pay this month" shows)
    for (const [cid, label, category, day, amount] of commitments) {
      if (isCurrent && (cid === "cm-school" || cid === "cm-net")) continue;
      add(id("tx"), "transaction", per, {
        date: `${per}-${String(day).padStart(2, "0")}`, period: per, account_id: accMain,
        direction: "out", amount, description: label, category, nature: "recurring", recurring_id: cid,
      });
    }

    // Investments (SIP + Emergency fund)
    add(id("tx"), "transaction", per, {
      date: `${per}-08`, period: per, account_id: accMain, to_account_id: accMf,
      direction: "transfer", amount: 35000, description: "Nifty 50 & Flexicap SIP", category: "Other", nature: "investment",
    });
    if (off % 2 === 0) {
      add(id("tx"), "transaction", per, {
        date: `${per}-10`, period: per, account_id: accMain, to_account_id: accEmerg,
        direction: "transfer", amount: 10000, description: "Emergency Fund Top-up", category: "Other", nature: "investment",
      });
    }

    // Annual items paid in their respective past months
    for (const [aid, label, , mode, total, paid, paidOff] of annualDefs) {
      if (paid && paidOff === off) {
        add(id("tx"), "transaction", per, {
          date: `${per}-18`, period: per, account_id: mode === "card" ? accHdfc : accMain,
          direction: "out", amount: total, description: label, category: "Insurance", nature: "annual", annual_id: aid,
        });
      }
    }

    // Day-to-day credit card spending
    const grocery1 = 6400 + (idx % 3) * 350;
    const grocery2 = 3800 + (idx % 2) * 250;
    const utilities = 2900 + (idx % 4) * 200;
    const fuel = 4200 + (idx % 3) * 300;
    const food1 = isRecent ? 4600 : 2800;
    const food2 = isRecent ? 3400 : 2100;
    const shopping = isRecent ? 2600 : 5400;
    const health = 1400 + (idx % 3) * 250;
    const cinema = 1200 + (idx % 2) * 300;
    const uber = 1500 + (idx % 3) * 180;

    const cardTxns = [
      [accHdfc, "04", "BigBasket monthly groceries", "Grocery", grocery1],
      [accHdfc, "11", "BESCOM electricity & gas", "Utilities", utilities],
      [accHdfc, "14", "IndianOil fuel & Fastag", "Vehicle", fuel],
      [accHdfc, "19", "Swiggy family dinner", "Food", food1],
      [accHdfc, "23", "Apollo Pharmacy & lab tests", "Health", health],
      [accIcici, "06", "Amazon household & electronics", "Shopping", shopping],
      [accIcici, "13", "Fresh vegetables & dairy", "Grocery", grocery2],
      [accIcici, "21", "Uber & metro commute", "Transport", uber],
      [accSbi, "09", "Zomato weekend dining", "Food", food2],
      [accSbi, "17", "BookMyShow cinema & outing", "Entertainment", cinema],
    ];
    if (off === -2) {
      cardTxns.push([accHdfc, "24", "Weekend road trip to Coorg", "Holiday", 14500, "oneoff"]);
    }
    for (const [cardId, dayStr, desc, cat, amt, nat] of cardTxns) {
      add(id("tx"), "transaction", per, {
        date: `${per}-${dayStr}`, period: per, account_id: cardId,
        direction: "out", amount: amt, description: desc, category: cat, nature: nat || "variable",
      });
    }

    // Close past months & mark cards billed; in current month, mark HDFC billed so user sees both states
    const hdfcTotal = cardTxns.filter((r) => r[0] === accHdfc).reduce((s, r) => s + r[4], 0)
      + annualDefs.filter((a) => a[3] === "card" && a[5] && a[6] === off).reduce((s, a) => s + a[4], 0);
    const iciciTotal = cardTxns.filter((r) => r[0] === accIcici).reduce((s, r) => s + r[4], 0);
    const sbiTotal = cardTxns.filter((r) => r[0] === accSbi).reduce((s, r) => s + r[4], 0);

    if (!isCurrent) {
      // Record bill payments for closed months
      for (const [cardId, cardName, billAmt] of [
        [accHdfc, "HDFC Regalia Card", hdfcTotal],
        [accIcici, "ICICI Amazon Pay Card", iciciTotal],
        [accSbi, "SBI Cashback Card", sbiTotal],
      ]) {
        add(id("tx"), "transaction", per, {
          date: `${per}-27`, period: per, account_id: accMain, to_account_id: cardId,
          direction: "transfer", amount: billAmt, description: `${cardName} bill payment`, category: "Other", nature: "variable",
        });
      }
      add(id("mc"), "month_close", per, {
        period: per, closed: true, closed_at: `${per}-28T18:00:00Z`,
        cards: {
          [accHdfc]: { amount: hdfcTotal, computed: hdfcTotal, adj_id: null, at: `${per}-27T10:00:00Z` },
          [accIcici]: { amount: iciciTotal, computed: iciciTotal, adj_id: null, at: `${per}-27T10:00:00Z` },
          [accSbi]: { amount: sbiTotal, computed: sbiTotal, adj_id: null, at: `${per}-27T10:00:00Z` },
        },
      });
    } else {
      add(id("mc"), "month_close", per, {
        period: per, closed: false,
        cards: {
          [accHdfc]: { amount: hdfcTotal, computed: hdfcTotal, adj_id: null, at: `${per}-25T10:00:00Z` },
        },
      });
    }
  }

  // 7. Month notes for Year view
  const notes = [
    [p(-5), "School annual fee & books paid"],
    [p(-4), "Performance bonus credited (+₹75k)"],
    [p(-3), "Family health insurance renewed"],
    [p(-2), "Coorg weekend road trip"],
  ];
  for (const [per, text] of notes) {
    add(id("note"), "note", per, { period: per, text });
  }

  // 8. Checkpoints for Savings & Runway view
  const snaps = [
    {
      date: `${p(-6)}-15`,
      note: "Start of financial year checkpoint",
      liquid: [210000, 580000, 1180000],
      committed: [780000, 860000],
      illiquid: 860000,
    },
    {
      date: `${p(-3)}-15`,
      note: "Mid-year review after bonus",
      liquid: [265000, 620000, 1310000],
      committed: [760000, 860000],
      illiquid: 900000,
    },
    {
      date: todayStr,
      note: "Current household checkpoint",
      liquid: [295000, 650000, 1420000],
      committed: [740000, 860000],
      illiquid: 940000,
    },
  ];
  for (const sn of snaps) {
    add(id("snap"), "snapshot", "", {
      date: sn.date,
      note: sn.note,
      items: [
        { _id: id("si"), group: "liquid", label: "Main account", amount: sn.liquid[0] },
        { _id: id("si"), group: "liquid", label: "Emergency Liquid Fund", amount: sn.liquid[1] },
        { _id: id("si"), group: "liquid", label: "Nifty 50 & Flexicap MF", amount: sn.liquid[2] },
        { _id: id("si"), group: "commitment", label: `${year} remaining spending & annual bills`, amount: sn.committed[0] },
        { _id: id("si"), group: "commitment", label: `${year + 1} planned spending & annual bills`, amount: sn.committed[1] },
        { _id: id("si"), group: "illiquid", label: "PPF & EPF Retirement", amount: sn.illiquid },
      ],
    });
  }

  return out;
}
