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
//   month_close { period, closed, closed_at, cards: { [card_id]: { amount, computed, adj_id, at } } }
//                 Labels only: a closed month or billed card never blocks edits.
//
// Natures: recurring | variable | oneoff | annual | emergency | investment | income | income_oneoff

export const NATURES = ["recurring", "variable", "oneoff", "annual", "emergency", "investment", "income", "income_oneoff"];
export const CATEGORIES = ["Food", "Grocery", "Utilities", "Vehicle", "Health", "Travel", "Holiday", "Entertainment",
  "Shopping", "Transport", "Personal", "Household", "Education", "Insurance", "Rent", "Family", "Gift", "Emergency", "Other"];

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
  const by = { settings: {}, account: [], transaction: [], commitment: [], annual: [], income: [], note: [], snapshot: [], month_close: [] };
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

/**
 * Card roll-up (setting `card_rollup`): a card's spending in a month is counted against the default spending
 * account as if its bill were paid that month — unless a payment to that card was recorded in the month.
 */
export function cardRollups(db, period) {
  if (!db.settings || db.settings.card_rollup !== true) return [];
  const out = [];
  for (const card of db.account.filter((a) => a.role === "card")) {
    let spent = 0, paid = false;
    for (const t of db.transaction) {
      if (t.period !== period) continue;
      if (t.direction === "transfer" && t.to_account_id === card.id) paid = true;
      else if (t.account_id === card.id && t.direction === "out") spent += num(t.amount);
      else if (t.account_id === card.id && t.direction === "in") spent -= num(t.amount);
    }
    if (!paid && Math.round(spent) !== 0) out.push({ card_id: card.id, name: card.name, amount: round(spent) });
  }
  return out;
}
const rollupTotal = (db, period) => cardRollups(db, period).reduce((x, r) => x + r.amount, 0);
const periodsBetween = (db, from, to) => [...new Set(db.transaction.map((t) => t.period))].filter((p) => p >= from && p < to);

function spendingBalanceAtStart(db, period) {
  let total = 0;
  const firstStart = db.account.filter(isSpending).map((a) => a.opening_period || "0000-00").sort()[0];
  if (firstStart && firstStart <= period) for (const p of periodsBetween(db, firstStart, period)) total -= rollupTotal(db, p);
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
  s.card_rollups = cardRollups(db, period);
  for (const r of s.card_rollups) { closing -= r.amount; s.card_payments += r.amount; }
  s.closing = round(closing);

  // Regular expense: monthly spending without one-offs (annual items and investments are already separate).
  s.oneoff_expense = round(s.by_nature.oneoff || 0);
  s.regular_expense = round(s.monthly_expense - s.oneoff_expense);
  s.regular_net = round(s.regular_inflow - s.regular_expense);
  // Whatever moved the spending balance that isn't one of the flows above: card spend not yet paid,
  // card bills for earlier months, income on other accounts. Keeps opening + flows = closing exact.
  s.other_movement = round(s.closing - (s.opening + s.regular_inflow + s.oneoff_inflow + s.drawn_from_savings
    - s.monthly_expense - s.annual_expense - s.investments));

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

/** Is the account shown for this period? Closed accounts show only in months where they have transactions. */
export function accountVisible(db, acc, period) {
  if (!acc.closed_from || period < acc.closed_from) return true;
  return db.transaction.some((t) => t.period === period && (t.account_id === acc.id || t.to_account_id === acc.id));
}

/** One account's month: money in/out, transfers, and a running balance where the app can work one out. */
export function accountMonth(db, accId, period) {
  const acc = db.accountsById[accId] || {};
  const m = { spent: 0, received: 0, transfer_in: 0, transfer_out: 0, rolled: 0 };
  const isMain = isSpending(acc) && (acc.is_default_spending || db.account.filter(isSpending)[0] === acc);
  const flows = (p) => {
    const f = { spent: 0, received: 0, transfer_in: 0, transfer_out: 0, rolled: 0 };
    for (const t of db.transaction) {
      if (t.period !== p) continue;
      const a = num(t.amount);
      if (t.direction === "transfer") { if (t.account_id === accId) f.transfer_out += a; if (t.to_account_id === accId) f.transfer_in += a; }
      else if (t.account_id === accId) { if (t.direction === "in") f.received += a; else f.spent += a; }
    }
    if (isMain) f.rolled = rollupTotal(db, p);
    return f;
  };
  Object.assign(m, flows(period));
  for (const k of Object.keys(m)) m[k] = round(m[k]);
  m.net = round(m.received + m.transfer_in - m.spent - m.transfer_out - m.rolled);
  if (isSpending(acc)) {
    const start = acc.opening_period || "0000-00";
    let bal = start <= period ? num(acc.opening_balance) : 0;
    for (const p of periodsBetween(db, start, period)) { const f = flows(p); bal += f.received + f.transfer_in - f.spent - f.transfer_out - f.rolled; }
    m.opening = round(bal); m.closing = round(bal + m.net);
  } else if (acc.role === "card") {
    // Outstanding = everything spent on the card so far minus payments (and roll-ups) so far.
    let owed = 0;
    for (const p of [...new Set(db.transaction.map((t) => t.period))].filter((p) => p <= period)) {
      const f = flows(p); owed += f.spent - f.received - f.transfer_in;
      const r = cardRollups(db, p).find((x) => x.card_id === accId); if (r) owed -= r.amount;
    }
    m.outstanding = round(owed);
  } else if (acc.balance !== undefined && acc.balance !== null && acc.balance !== "") m.balance = round(num(acc.balance));
  return m;
}

// ================= month close & card billing =================

/** month_close row for a period, or null. */
export function closeOf(db, period) {
  return (db.month_close || []).find((c) => c.period === period) || null;
}

/** Card bill computed from the grid: spending minus refunds on the card in the period. */
export function cardBill(db, cardId, period) {
  let v = 0;
  for (const t of db.transaction) {
    if (t.period !== period || t.account_id !== cardId || t.direction === "transfer") continue;
    v += t.direction === "in" ? -num(t.amount) : num(t.amount);
  }
  return round(v);
}

/** The month the user is working in: today's period, or the month after the latest closed one if that is later. */
export function currentPeriod(db, todayStr) {
  const natural = periodOf(todayStr, db.settings);
  const closed = (db.month_close || []).filter((c) => c.closed).map((c) => c.period).sort().pop();
  const next = closed ? shiftPeriod(closed, 1) : null;
  return next && next > natural ? next : natural;
}

/**
 * Billing and close state of a period. Cards with activity that month must be billed before it can be closed;
 * a billed card is `stale` when its transactions changed after billing.
 */
export function monthStatus(db, period) {
  const c = closeOf(db, period) || {};
  const marks = c.cards || {};
  const cards = db.account.filter((a) => a.role === "card" && accountVisible(db, a, period)).map((a) => {
    const computed = cardBill(db, a.id, period);
    const active = db.transaction.some((t) => t.period === period && t.account_id === a.id && t.direction !== "transfer");
    const m = marks[a.id];
    return { id: a.id, name: a.name, computed, active, billed: !!m, amount: m ? round(num(m.amount)) : null,
      adj_id: m ? m.adj_id || null : null, stale: !!m && round(num(m.amount)) !== computed };
  });
  const needed = cards.filter((x) => x.active || x.billed);
  return { period, closed: !!c.closed, closed_at: c.closed_at || null, id: c.id || null, cards,
    pending: needed.filter((x) => !x.billed), allBilled: needed.every((x) => x.billed) };
}

/** Period a transaction dated `date` belongs to when entered while viewing `viewPeriod`:
 *  after a month is closed early, its last days go into the next month. */
export function periodForDate(db, date, viewPeriod) {
  const p = periodOf(date, db.settings);
  if (viewPeriod && p < viewPeriod && shiftPeriod(p, 1) === viewPeriod && closeOf(db, p)?.closed) return viewPeriod;
  return p;
}

/** For users who had data before closing existed: every month before today's is closed and its cards billed as is. */
export function legacyCloses(db, todayStr, at) {
  const natural = periodOf(todayStr, db.settings);
  const periods = [...new Set(db.transaction.map((t) => t.period))].filter((p) => p < natural).sort();
  return periods.filter((p) => !closeOf(db, p)).map((p) => {
    const cards = {};
    for (const x of monthStatus(db, p).cards) if (x.active) cards[x.id] = { amount: x.computed, computed: x.computed, adj_id: null, at };
    return { period: p, closed: true, closed_at: at, cards, legacy: true };
  });
}
