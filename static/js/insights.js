import { money } from "./currency.js";
// Spending insights. Pure functions over an indexed db (engine.index); everything runs in the browser.
import * as E from "./engine.js";
import * as P from "./plan.js";

const num = (x) => (Number.isFinite(+x) ? +x : 0);
const round = Math.round;
const isSpend = (t) => t.direction === "out" && t.nature !== "investment";

/** The last n calendar months ending at `end`, trimmed to start at the first month that has any data. */
export function windowPeriods(db, end, n) {
  const first = db.transaction.map((t) => t.period).sort()[0];
  const out = [];
  for (let i = n - 1; i >= 0; i--) { const p = E.shiftPeriod(end, -i); if (!first || p >= first) out.push(p); }
  return out;
}
export const latestPeriod = (db) => db.transaction.map((t) => t.period).sort().pop() || null;

export const GROUPS = [
  ["fixed", "Fixed monthly", ["recurring"]],
  ["flexible", "Day to day", ["variable", "emergency"]],
  ["annual", "Annual items", ["annual"]],
  ["oneoff", "One-off", ["oneoff"]],
];

/** Spending split into fixed / day-to-day / annual / one-off over the given months. */
export function natureSplit(db, periods) {
  const set = new Set(periods), sums = Object.fromEntries(GROUPS.map(([k]) => [k, 0]));
  for (const t of db.transaction) {
    if (!set.has(t.period) || !isSpend(t)) continue;
    const g = GROUPS.find(([, , ns]) => ns.includes(t.nature || "variable"));
    sums[g ? g[0] : "flexible"] += num(t.amount);
  }
  const total = Object.values(sums).reduce((a, b) => a + b, 0);
  return { total: round(total), months: periods.length, groups: GROUPS.map(([key, label]) => ({
    key, label, amount: round(sums[key]), monthly: round(sums[key] / Math.max(1, periods.length)), pct: total ? round((sums[key] / total) * 100) : 0 })) };
}

/** Current monthly commitments (not ended by `period`), with what each costs per year. */
export function commitmentsYearly(db, period) {
  return db.commitment
    .filter((c) => (!c.active_to || c.active_to >= period) && num(c.amount))
    .map((c) => ({ id: c.id, label: c.label, category: c.category, monthly: round(num(c.amount)), yearly: round(num(c.amount) * 12) }))
    .sort((a, b) => b.monthly - a.monthly);
}

/**
 * Each category's average over the last `recent` months against its average over the `base` months before that.
 * Day-to-day and one-off spending only (fixed commitments and annual items have their own sections).
 * Flags changes of at least 20% and 1,000 a month (in the user's currency).
 */
export function categoryTrends(db, end, recent = 3, base = 6) {
  const rec = windowPeriods(db, end, recent), basePs = windowPeriods(db, E.shiftPeriod(end, -recent), base);
  const sumBy = (ps) => {
    const set = new Set(ps), s = {};
    for (const t of db.transaction) if (set.has(t.period) && isSpend(t) && !["recurring", "annual"].includes(t.nature)) s[t.category || "Other"] = (s[t.category || "Other"] || 0) + num(t.amount);
    return s;
  };
  const a = sumBy(rec), b = sumBy(basePs);
  const cats = [...new Set([...Object.keys(a), ...Object.keys(b)])];
  return cats.map((c) => {
    const now = (a[c] || 0) / Math.max(1, rec.length), before = basePs.length ? (b[c] || 0) / basePs.length : null;
    const change = before ? (now - before) / before : null;
    const flag = before !== null && Math.abs(now - before) >= 1000 && (change === null || Math.abs(change) >= 0.2) ? (now > before ? "up" : "down") : null;
    return { category: c, recent: round(now), before: before === null ? null : round(before), change: change === null ? null : round(change * 100), diff: before === null ? null : round(now - before), flag };
  }).filter((x) => x.recent || x.before).sort((x, y) => y.recent - x.recent);
}

/** Group descriptions by their first word ("swiggy food", "Swiggy instamart" → swiggy). */
export const merchantKey = (d) => String(d || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").trim().split(/\s+/)[0] || "";

export function topMerchants(db, periods, n = 8) {
  const set = new Set(periods), m = {};
  for (const t of db.transaction) {
    // day-to-day spending only: fixed commitments, annual items and one-offs have their own sections
    if (!set.has(t.period) || !isSpend(t) || !["variable", "emergency", undefined, ""].includes(t.nature)) continue;
    if (t.unitemised || /^difference between bill/i.test(t.description || "")) continue; // balancing lines, not a merchant
    const k = merchantKey(t.description); if (!k || k.length < 3) continue;
    const e = (m[k] ||= { key: k, label: String(t.description).trim(), amount: 0, count: 0, months: new Set(), category: t.category });
    e.amount += num(t.amount); e.count++; e.months.add(t.period);
    if (String(t.description).trim().length < e.label.length) e.label = String(t.description).trim();
  }
  return Object.values(m).filter((e) => e.amount > 0).sort((a, b) => b.amount - a.amount).slice(0, n)
    .map((e) => ({ key: e.key, label: e.label.charAt(0).toUpperCase() + e.label.slice(1), amount: round(e.amount), count: e.count, months: e.months.size,
      monthly: round(e.amount / Math.max(1, periods.length)), yearly: round((e.amount / Math.max(1, periods.length)) * 12), category: e.category }));
}

/**
 * Annual items across a year: what was paid each month, what's still due (at its due month, or unscheduled),
 * and the even monthly set-aside that would cover them.
 */
export function annualCalendar(db, year, period) {
  const months = [...Array(12)].map((_, i) => ({ month: i + 1, paid: 0, due: 0 }));
  for (const t of db.transaction) if (t.period.startsWith(String(year)) && t.direction === "out" && t.nature === "annual") months[+t.period.slice(5) - 1].paid += num(t.amount);
  const items = E.annualStatus(db, year);
  let unscheduled = 0;
  for (const a of items) { if (!a.unpaid) continue; if (a.due_month) months[+a.due_month - 1].due += a.unpaid; else unscheduled += a.unpaid; }
  const paid = months.reduce((x, m) => x + m.paid, 0), due = months.reduce((x, m) => x + m.due, 0) + unscheduled;
  const total = Math.max(paid + due, items.reduce((x, a) => x + num(a.total), 0));
  const left = period && period.startsWith(String(year)) ? 13 - +period.slice(5) : 12;
  const peak = months.reduce((b, m) => (m.paid + m.due > b.paid + b.due ? m : b), months[0]);
  return { months: months.map((m) => ({ ...m, paid: round(m.paid), due: round(m.due) })), paid: round(paid), due: round(due), unscheduled: round(unscheduled),
    total: round(total), setAside: round(total / 12), setAsideRemaining: round(due / Math.max(1, left)), peak: { month: peak.month, amount: round(peak.paid + peak.due) },
    emptyMonths: months.filter((m) => !m.paid && !m.due).length };
}

/** Up to three short, factual headlines for the top of the page. tone: good | bad | neutral */
export function headlines({ split, trends, merchants, annual }) {
  const out = [];
  const fixed = split.groups.find((g) => g.key === "fixed");
  if (fixed && fixed.pct >= 35) out.push({ tone: "neutral", title: `${fixed.pct}% of spending is fixed`, body: `${money(fixed.monthly)} a month goes on commitments before the month starts — ${money(fixed.monthly * 12)} a year.` });
  const ups = trends.filter((t) => t.flag === "up").sort((a, b) => b.diff - a.diff), downs = trends.filter((t) => t.flag === "down").sort((a, b) => a.diff - b.diff);
  // Lead with amounts; a percentage only when the earlier figure is big enough for it to mean something.
  const pct = (t) => (t.before >= 2000 ? ` (${t.change > 0 ? "+" : ""}${t.change}%)` : "");
  const inr = (n) => money(Math.abs(n));
  if (ups[0]) out.push({ tone: "bad", title: `${ups[0].category} up ${inr(ups[0].diff)} a month${pct(ups[0])}`, body: `${inr(ups[0].recent)} a month over the last 3 months, against ${inr(ups[0].before)} in the 6 months before — ${inr(ups[0].diff * 12)} a year if it continues.` });
  if (downs[0]) out.push({ tone: "good", title: `${downs[0].category} down ${inr(downs[0].diff)} a month${pct(downs[0])}`, body: `${inr(downs[0].recent)} a month over the last 3 months, against ${inr(downs[0].before)} before — about ${inr(downs[0].diff * 12)} a year less.` });
  if (out.length < 3 && merchants[0]) out.push({ tone: "neutral", title: `${merchants[0].label}: ${money(merchants[0].yearly)} a year`, body: `${merchants[0].count} payments in ${split.months} months, about ${money(merchants[0].monthly)} a month.` });
  if (out.length < 3 && annual && annual.total && annual.peak.amount > annual.setAside * 3) out.push({ tone: "neutral", title: `Annual items peak in one month`, body: `${money(annual.peak.amount)} falls in a single month. Setting aside ${money(annual.setAside)} a month would spread it evenly.` });
  return out.slice(0, 3);
}

// ---------------- group 2: runway what-ifs, drawdown, savings rate ----------------

/**
 * Months the liquid savings last at these assumptions, to a fraction of a month
 * (Infinity if they never run out within 40 years). E.g. ₹10L at ₹75K a month → 13.33.
 */
export function runwayMonths(db, opts, period, start) {
  const pr = P.project(db, { ...opts, horizon_year: +period.slice(0, 4) + 40 }, period, start);
  if (!pr.runs_out) return Infinity;
  const i = pr.series.findIndex((x) => x.period === pr.runs_out);
  const before = i === 0 ? num(start) : pr.series[i - 1].balance, after = pr.series[i].balance;
  return Math.round((i + (before > 0 ? before / (before - after) : 0)) * 100) / 100;
}

/** Average monthly spend per day-to-day category over the given months. */
export function categoryMonthly(db, periods) {
  const set = new Set(periods), s = {};
  for (const t of db.transaction) if (set.has(t.period) && isSpend(t) && ["variable", "emergency", undefined, ""].includes(t.nature)) s[t.category || "Other"] = (s[t.category || "Other"] || 0) + num(t.amount);
  return Object.entries(s).map(([category, v]) => ({ category, monthly: round(v / Math.max(1, periods.length)) })).filter((x) => x.monthly > 0).sort((a, b) => b.monthly - a.monthly);
}

/**
 * What-if on the projection: cut day-to-day spending by a %, cut fixed commitments by an amount a month, add income a month.
 * Returns runway before/after and the burn used.
 */
export function whatIf(db, opts, period, start, { flexCutPct = 0, fixedCut = 0, extraIncome = 0, flexMonthly = 0 } = {}) {
  const saving = (flexMonthly * flexCutPct) / 100 + fixedCut + extraIncome;
  const base = runwayMonths(db, opts, period, start);
  const after = runwayMonths(db, { ...opts, burn: num(opts.burn) - saving }, period, start);
  return { saving: round(saving), burn: round(num(opts.burn) - saving), base, after, gained: after === Infinity || base === Infinity ? Infinity : Math.round((after - base) * 100) / 100 };
}

/** For each lever (a category or a commitment), what cutting it by `pct` does to monthly burn, runway and yearly spend. */
export function biggestLevers(db, opts, period, start, periods, pct = 20) {
  const base = runwayMonths(db, opts, period, start);
  const levers = [
    ...categoryMonthly(db, periods).map((c) => ({ kind: "Day to day", label: c.category, category: c.category, monthly: c.monthly })),
    ...commitmentsYearly(db, period).map((c) => ({ kind: "Fixed", label: c.label, category: c.category, monthly: c.monthly })),
  ];
  return levers.map((l) => {
    const saving = round((l.monthly * pct) / 100);
    const after = runwayMonths(db, { ...opts, burn: num(opts.burn) - saving }, period, start);
    return { ...l, saving, yearly: saving * 12, gained: base === Infinity || after === Infinity ? null : Math.round((after - base) * 100) / 100 };
  }).sort((a, b) => b.saving - a.saving);
}

/** Yearly drawdown: what a year of spending takes out of liquid savings, and the income that would stop it. */
export function drawdown(opts, liquid) {
  const yearly = num(opts.burn) * 12 + num(opts.annual_base) + num(opts.holiday_per_year);
  return { yearly: round(yearly), pct: liquid > 0 ? round((yearly / liquid) * 1000) / 10 : null,
    breakEvenExtra: round(yearly / 12) }; // extra monthly income needed on top of today's regular income
}

/** Actual net burn per month against the planned burn. */
export function burnVsPlan(db, periods, planned) {
  return periods.map((p) => {
    const s = E.summarize(db, p);
    const actual = round(s.monthly_expense - s.regular_inflow);
    return { period: p, actual, planned: round(num(planned)), diff: round(actual - num(planned)) };
  });
}

/** Savings rate per month: (regular income − spending incl. annual items) ÷ regular income. */
export function savingsRate(db, periods) {
  const rows = periods.map((p) => {
    const s = E.summarize(db, p);
    const spend = s.monthly_expense + s.annual_expense, saved = s.regular_inflow - spend;
    return { period: p, income: s.regular_inflow, spend: round(spend), saved: round(saved), rate: s.regular_inflow ? round((saved / s.regular_inflow) * 100) : null };
  });
  const inc = rows.reduce((x, r) => x + r.income, 0), saved = rows.reduce((x, r) => x + r.saved, 0);
  const withRate = rows.filter((r) => r.rate !== null);
  return { rows, income: round(inc), saved: round(saved), rate: inc ? round((saved / inc) * 100) : null,
    best: withRate.length ? withRate.reduce((a, b) => (b.rate > a.rate ? b : a)) : null, overspent: rows.filter((r) => r.income && r.saved < 0).length };
}
