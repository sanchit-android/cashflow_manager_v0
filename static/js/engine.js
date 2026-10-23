// Calculation engine. Pure functions over decrypted records; no DOM, no network.
//
// Records: { id, type, data }. Types and data fields:
//   settings    { funding_mode: salary|savings|both, period_mode: calendar|pay_cycle, cycle_day, theme, currency }
//   account     { name, kind: bank|credit_card|cash|fd|mutual_fund|trading|gold|ppf|ssy|property|receivable|other,
//                 role: spending|savings|investment|long_term|receivable|card,
//                 is_default_spending, opening_balance, opening_period, balance (for savings/investments), liquid }
//   transaction { date, period?, account_id, amount, direction: in|out|transfer, description, category,
//                 nature, to_account_id, recurring_id, annual_id, grouped }
//   commitment  { label, amount, category, day, account_id, active_from, active_to }
//   annual      { year, label, total, due_month (1-12), mode: card|cash }
//   income      { label, kind: salary|rent|interest|other, amount, day }
//
// Natures: recurring | variable | oneoff | annual | emergency | investment | income | income_oneoff

export const NATURES = ["recurring", "variable", "oneoff", "annual", "emergency", "investment", "income", "income_oneoff"];
export const CATEGORIES = ["Food", "Grocery", "Utilities", "Vehicle", "Health", "Travel", "Holiday", "Entertainment",
  "Shopping", "Personal", "Household", "Education", "Insurance", "Rent", "Family", "Gift", "Emergency", "Other"];

const num = (x) => (Number.isFinite(+x) ? +x : 0);
const round = (x) => Math.round(x);

/** Period key for a date. Calendar: YYYY-MM. Pay cycle: the month in which the cycle started. */
export function periodOf(dateStr, settings = {}) {
  const [y, m, d] = String(dateStr).slice(0, 10).split("-").map(Number);
  if (settings.period_mode === "pay_cycle" && settings.cycle_day && d < settings.cycle_day) {
    const pm = m === 1 ? 12 : m - 1;
    const py = m === 1 ? y - 1 : y;
    return `${py}-${String(pm).padStart(2, "0")}`;
  }
  return `${y}-${String(m).padStart(2, "0")}`;
}

export function shiftPeriod(p, n) {
  const [y, m] = p.split("-").map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
}

export function index(records) {
  const by = { settings: {}, account: [], transaction: [], commitment: [], annual: [], income: [] };
  for (const r of records) {
    if (r.deleted || !r.data) continue;
    const row = { id: r.id, ...r.data };
    if (r.type === "settings") by.settings = row;
    else if (by[r.type]) by[r.type].push(row);
  }
  for (const t of by.transaction) t.period = t.period || periodOf(t.date, by.settings);
  by.accountsById = Object.fromEntries(by.account.map((a) => [a.id, a]));
  return by;
}

const isSpending = (acc) => acc && acc.role === "spending";

/** Signed effect of one transaction on a given account. */
function effectOn(t, accountId) {
  const a = num(t.amount);
  if (t.direction === "transfer") {
    if (t.account_id === accountId) return -a;
    if (t.to_account_id === accountId) return a;
    return 0;
  }
  if (t.account_id !== accountId) return 0;
  return t.direction === "in" ? a : -a;
}

function spendingBalanceAtStart(db, period) {
  let total = 0;
  for (const acc of db.account.filter(isSpending)) {
    const start = acc.opening_period || "0000-00";
    if (start > period) continue;
    total += num(acc.opening_balance);
    for (const t of db.transaction) {
      if (t.period >= start && t.period < period) total += effectOn(t, acc.id);
    }
  }
  return total;
}

/** Everything the dashboard needs for one period. */
export function summarize(db, period) {
  const txns = db.transaction.filter((t) => t.period === period);
  const acc = (id) => db.accountsById[id];
  const s = {
    period, opening: round(spendingBalanceAtStart(db, period)),
    regular_inflow: 0, oneoff_inflow: 0, monthly_expense: 0, annual_expense: 0,
    investments: 0, drawn_from_savings: 0, card_payments: 0, by_category: {}, by_nature: {},
  };

  for (const t of txns) {
    const a = num(t.amount);
    if (t.direction === "in") {
      if (t.nature === "income_oneoff") s.oneoff_inflow += a; else s.regular_inflow += a;
      continue;
    }
    if (t.direction === "transfer") {
      const from = acc(t.account_id), to = acc(t.to_account_id);
      if (isSpending(from) && to && ["savings", "investment", "long_term"].includes(to.role)) s.investments += a;
      else if (isSpending(to) && from && ["savings", "investment", "long_term"].includes(from.role)) s.drawn_from_savings += a;
      else if (isSpending(from) && to && to.role === "card") s.card_payments += a;
      continue;
    }
    // direction === "out": a real expense, on any account (bank, cash or card)
    if (t.nature === "investment") { s.investments += a; continue; }
    if (t.nature === "annual") s.annual_expense += a; else s.monthly_expense += a;
    s.by_nature[t.nature || "variable"] = (s.by_nature[t.nature || "variable"] || 0) + a;
    s.by_category[t.category || "Other"] = (s.by_category[t.category || "Other"] || 0) + a;
  }

  let closing = s.opening;
  for (const a of db.account.filter(isSpending)) {
    if ((a.opening_period || "0000-00") > period) continue;
    for (const t of txns) closing += effectOn(t, a.id);
  }
  s.closing = round(closing);

  s.net_position = round(s.regular_inflow - s.monthly_expense);
  s.net_with_annual = round(s.net_position - s.annual_expense);
  s.verdict = s.net_with_annual >= 0
    ? { kind: "ahead", amount: s.net_with_annual }
    : { kind: "drawing", amount: -s.net_with_annual };

  s.commitments = commitmentStatus(db, period, txns);
  s.commitments_pending = round(s.commitments.filter((c) => !c.paid).reduce((x, c) => x + num(c.amount), 0));
  // Spend still expected this period reduces the headroom.
  s.headroom = round(s.net_with_annual - s.commitments_pending);
  for (const k of ["regular_inflow", "oneoff_inflow", "monthly_expense", "annual_expense", "investments",
    "drawn_from_savings", "card_payments"]) s[k] = round(s[k]);
  return s;
}

export function commitmentStatus(db, period, txns) {
  txns = txns || db.transaction.filter((t) => t.period === period);
  return db.commitment
    .filter((c) => (!c.active_from || c.active_from <= period) && (!c.active_to || c.active_to >= period))
    .map((c) => {
      const paid = txns.filter((t) => t.recurring_id === c.id).reduce((x, t) => x + num(t.amount), 0);
      return { ...c, paid_amount: round(paid), paid: paid > 0 };
    });
}

export function annualStatus(db, year) {
  return db.annual.filter((a) => +a.year === +year).map((a) => {
    const paid = num(a.paid_external) + db.transaction.filter((t) => t.annual_id === a.id).reduce((x, t) => x + num(t.amount), 0);
    return { ...a, paid: round(paid), unpaid: round(Math.max(0, num(a.total) - paid)) };
  }).sort((a, b) => num(a.due_month) - num(b.due_month));
}

/** Monthly burn = expense (incl. annual) minus regular inflow, averaged over the last n periods with data. */
export function averageBurn(db, period, n = 3) {
  const vals = [];
  for (let i = 1; i <= 12 && vals.length < n; i++) {
    const p = shiftPeriod(period, -i);
    if (!db.transaction.some((t) => t.period === p)) continue;
    const s = summarize(db, p);
    vals.push(s.monthly_expense + s.annual_expense - s.regular_inflow);
  }
  if (!vals.length) return null;
  return round(vals.reduce((a, b) => a + b, 0) / vals.length);
}

export function liquidSavings(db) {
  return round(db.account
    .filter((a) => ["savings", "investment"].includes(a.role) && a.liquid !== false)
    .reduce((x, a) => x + num(a.balance), 0));
}

/** Months the liquid savings last at the average burn. null when not burning. */
export function runway(db, period) {
  const burn = averageBurn(db, period);
  const savings = liquidSavings(db);
  if (burn === null || burn <= 0) return { burn, savings, months: null };
  return { burn, savings, months: Math.floor(savings / burn), runs_out: shiftPeriod(period, Math.floor(savings / burn)) };
}

/** Things due in the next `months` periods. */
export function upcoming(db, period, months = 2) {
  const out = [];
  for (let i = 0; i < months; i++) {
    const p = shiftPeriod(period, i);
    for (const c of commitmentStatus(db, p)) if (!c.paid) out.push({ period: p, label: c.label, amount: num(c.amount), kind: "Monthly" });
    const [y, m] = p.split("-").map(Number);
    for (const a of annualStatus(db, y)) if (+a.due_month === m && a.unpaid > 0) out.push({ period: p, label: a.label, amount: a.unpaid, kind: "Annual" });
  }
  return out;
}
