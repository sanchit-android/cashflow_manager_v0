// Year view, savings projections and checkpoint snapshots. Pure functions over an indexed db (engine.index).
import * as E from "./engine.js";

const num = (x) => (Number.isFinite(+x) ? +x : 0);
const round = Math.round;
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const periodLabel = (p) => `${MON[+p.slice(5) - 1]} ${p.slice(2, 4)}`;

// ---------------- year view (the "Cashflow" sheet) ----------------
/**
 * One column per month. net_burn = monthly spending − regular income (what the month costs before annual items);
 * total_out = net_burn + annual items. Positive means savings were used.
 */
export function yearView(db, year) {
  const months = [];
  for (let m = 1; m <= 12; m++) {
    const period = `${year}-${String(m).padStart(2, "0")}`;
    const s = E.summarize(db, period);
    const hasData = db.transaction.some((t) => t.period === period);
    const note = db.note.find((n) => n.period === period);
    months.push({
      period, label: periodLabel(period), hasData, note: note ? note.text : "", note_id: note ? note.id : null,
      opening: s.opening, closing: s.closing, drop: s.opening - s.closing,
      regular_inflow: s.regular_inflow, oneoff_inflow: s.oneoff_inflow,
      monthly_expense: s.monthly_expense, regular_expense: s.regular_expense, oneoff_expense: s.oneoff_expense, annual_expense: s.annual_expense, investments: s.investments,
      net_burn: s.monthly_expense - s.regular_inflow,
      total_out: s.monthly_expense - s.regular_inflow + s.annual_expense,
    });
  }
  const withData = months.filter((m) => m.hasData);
  const sum = (k) => withData.reduce((x, m) => x + m[k], 0);
  const totals = Object.fromEntries(["regular_inflow", "oneoff_inflow", "monthly_expense", "regular_expense", "oneoff_expense", "annual_expense", "investments", "net_burn", "total_out"].map((k) => [k, sum(k)]));
  return { year, months, totals, avg_regular_expense: withData.length ? round(totals.regular_expense / withData.length) : null, avg_net_burn: withData.length ? round(totals.net_burn / withData.length) : null, months_with_data: withData.length };
}

/** Regular expense (monthly spending without one-offs, annual items or investments) averaged over the last n months with data. */
export function averageRegularExpense(db, period, n = 6) {
  const rows = [];
  for (let i = 0; i <= 24 && rows.length < n; i++) {
    const p = E.shiftPeriod(period, -i);
    if (!db.transaction.some((t) => t.period === p)) continue;
    rows.push({ period: p, amount: E.summarize(db, p).regular_expense });
  }
  rows.reverse();
  return { rows, avg: rows.length ? round(rows.reduce((x, r) => x + r.amount, 0) / rows.length) : null };
}

// ---------------- projection ----------------
/** Net monthly burn (spending − regular income, excluding annual items) averaged over the last n months with data. */
export function averageNetBurn(db, period, n = 6) {
  const vals = [];
  for (let i = 1; i <= 24 && vals.length < n; i++) {
    const p = E.shiftPeriod(period, -i);
    if (!db.transaction.some((t) => t.period === p)) continue;
    const s = E.summarize(db, p);
    vals.push(s.monthly_expense - s.regular_inflow);
  }
  return vals.length ? round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
}

export function defaultProjection(db, period) {
  const year = +period.slice(0, 4);
  const yearsWithAnnual = [...new Set(db.annual.map((a) => +a.year))].sort();
  const baseYear = yearsWithAnnual.includes(year) ? year : yearsWithAnnual.pop();
  return {
    burn: averageNetBurn(db, period, 6),
    burn_growth_pct: 10,
    annual_base: round(db.annual.filter((a) => +a.year === baseYear).reduce((x, a) => x + num(a.total), 0)),
    annual_growth_pct: 5,
    holiday_per_year: 0,
    horizon_year: year + 2,
  };
}

/** Latest snapshot's liquid total, else liquid account balances plus spending accounts' closing balance. */
export function currentLiquid(db, period) {
  const snap = latestSnapshot(db);
  if (snap) return { amount: snapshotTotals(snap).liquid, source: `checkpoint ${snap.date}` };
  const spending = E.summarize(db, period).closing;
  return { amount: round(E.liquidSavings(db) + spending), source: "account balances" };
}

/**
 * Month-by-month projection of liquid savings from `fromPeriod` to December of the horizon year.
 * Annual items: this year's unpaid ones at their due month (spread over the remaining months when no due month);
 * later years: annual_base grown each year, placed in the same months as this year's items.
 */
export function project(db, opts, fromPeriod, startBalance) {
  const y0 = +fromPeriod.slice(0, 4), m0 = +fromPeriod.slice(5);
  const bg = num(opts.burn_growth_pct) / 100, ag = num(opts.annual_growth_pct) / 100;
  const thisYear = E.annualStatus(db, y0);
  const template = thisYear.length ? thisYear : db.annual.map((a) => ({ ...a, unpaid: num(a.total) }));
  const templateTotal = template.reduce((x, a) => x + num(a.total), 0) || 1;
  const remainingMonths = 13 - m0;
  const series = [], byYear = {};
  let bal = num(startBalance), runsOut = null;
  for (let y = y0; y <= num(opts.horizon_year); y++) {
    const n = y - y0;
    const burn = num(opts.burn) * (1 + bg) ** n;
    const annualScale = n === 0 ? 1 : (num(opts.annual_base) * (1 + ag) ** n) / templateTotal;
    const yr = (byYear[y] = { year: y, monthly: 0, annual: 0, holiday: 0 });
    for (let m = y === y0 ? m0 : 1; m <= 12; m++) {
      let annual = 0;
      for (const a of template) {
        const amt = n === 0 ? num(a.unpaid) : num(a.total) * annualScale;
        if (!amt) continue;
        if (a.due_month) { if (+a.due_month === m && (n > 0 || m >= m0)) annual += amt; }
        else annual += amt / (n === 0 ? remainingMonths : 12);
      }
      // overdue unpaid items from earlier this year fall due now
      if (n === 0 && m === m0) for (const a of template) if (a.due_month && +a.due_month < m0) annual += num(a.unpaid);
      const holiday = (num(opts.holiday_per_year) * (1 + ag) ** n) / 12;
      bal -= burn + annual + holiday;
      yr.monthly += burn; yr.annual += annual; yr.holiday += holiday;
      const period = `${y}-${String(m).padStart(2, "0")}`;
      series.push({ period, balance: round(bal), burn: round(burn), annual: round(annual), holiday: round(holiday) });
      if (runsOut === null && bal < 0) runsOut = period;
    }
  }
  const years = Object.values(byYear).map((r) => ({ year: r.year, monthly: round(r.monthly), annual: round(r.annual), holiday: round(r.holiday), total: round(r.monthly + r.annual + r.holiday) }));
  const committed = years.reduce((x, r) => x + r.total, 0);
  return { series, years, committed, start: round(num(startBalance)), end: series.length ? series[series.length - 1].balance : round(num(startBalance)), runs_out: runsOut };
}

// ---------------- checkpoints ----------------
// snapshot: { date, note, items: [{ group: liquid|commitment|illiquid, label, amount }] }
export function snapshotTotals(snap) {
  const t = { liquid: 0, commitment: 0, illiquid: 0 };
  for (const it of snap.items || []) if (t[it.group] !== undefined) t[it.group] += num(it.amount);
  return { liquid: round(t.liquid), committed: round(t.commitment), illiquid: round(t.illiquid), gap: round(t.liquid - t.commitment) };
}
export const latestSnapshot = (db) => [...db.snapshot].sort((a, b) => String(a.date).localeCompare(String(b.date))).pop() || null;

/** A new checkpoint pre-filled from accounts and the projection. */
export function prefillSnapshot(db, period, opts, date) {
  const items = [];
  const prev = latestSnapshot(db);
  if (prev) {
    // Carry holdings forward from the last checkpoint so nothing is dropped; the user updates the amounts.
    for (const it of prev.items || []) if (it.group !== "commitment") items.push({ group: it.group, label: it.label, amount: it.amount });
    for (const c of projectedCommitments(db, period, opts)) items.push(c);
    return { date, note: `Holdings carried forward from ${prev.date}; update the amounts`, items };
  }
  const spending = db.account.filter((a) => a.role === "spending");
  const closing = E.summarize(db, period).closing;
  if (spending.length) items.push({ group: "liquid", label: spending.length === 1 ? spending[0].name : "Spending accounts", amount: closing });
  for (const a of db.account) {
    if (["savings", "investment", "receivable"].includes(a.role) && a.liquid !== false) items.push({ group: "liquid", label: a.name, amount: round(num(a.balance)) });
    else if (a.role === "long_term" || a.liquid === false) items.push({ group: "illiquid", label: a.name, amount: round(num(a.balance)) });
  }
  items.push(...projectedCommitments(db, period, opts));
  return { date, note: "", items };
}

function projectedCommitments(db, period, opts) {
  const out = [];
  for (const y of project(db, opts, period, 0).years) {
    if (y.annual) out.push({ group: "commitment", label: `${y.year} annual items`, amount: y.annual });
    if (y.monthly) out.push({ group: "commitment", label: `${y.year} monthly spending`, amount: y.monthly });
    if (y.holiday) out.push({ group: "commitment", label: `${y.year} holidays`, amount: y.holiday });
  }
  return out;
}
