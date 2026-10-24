// Free public calculators (/calculators/<slug>/). Everything is computed here in the browser;
// the only thing sent to the server is "this calculator was used" (once per page view, no values).
import { setCurrency, currencyOptions, guessCurrency, money, num } from "./currency.js";

const form = document.querySelector(".calc-form");
const out = document.querySelector(".calc-out");
const slug = form.dataset.calc;

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
// Accepts "1,20,000", "₹ 5000" or "5e4"; blank or junk is 0.
const val = (el) => { const n = parseFloat(String(el?.value ?? "").replace(/[^0-9.\-e]/gi, "")); return Number.isFinite(n) ? n : 0; };
const f = (name) => val(form.elements[name]);
const stat = (label, value, cls = "") => `<div class="calc-stat"><span class="muted small">${label}</span><strong class="${cls}">${value}</strong></div>`;
const bar = (pct, cls = "") => `<div class="calc-bar"><span class="${cls}" style="width:${Math.max(0, Math.min(100, pct)).toFixed(1)}%"></span></div>`;

function duration(months) {
  const y = Math.floor(months / 12), m = Math.floor(months % 12);
  return [y && `${y} year${y > 1 ? "s" : ""}`, (m || !y) && `${m} month${m === 1 ? "" : "s"}`].filter(Boolean).join(" ");
}
function monthLabel(monthsFromNow) {
  const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + Math.floor(monthsFromNow));
  return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

const calcs = {
  "savings-runway"() {
    const savings = f("savings"), spend = f("spend"), income = f("income");
    const infl = Math.pow(1 + f("inflation") / 100, 1 / 12), ret = Math.pow(1 + f("ret") / 100, 1 / 12) - 1;
    if (savings <= 0 || spend <= 0) return `<p class="muted">Enter your savings and monthly spending.</p>`;
    let bal = savings, s = spend, months = null;
    const yearly = [savings];
    for (let m = 0; m < 1200; m++) {
      const before = bal * (1 + ret) + income;
      bal = before - s;
      if (bal < 0) { months = m + Math.max(0, before) / s; break; }
      if ((m + 1) % 12 === 0) yearly.push(bal);
      s *= infl;
    }
    const simple = income >= spend ? null : savings / (spend - income);
    if (months === null) {
      return `<div class="calc-stats">${stat("Your savings last", "100+ years", "good")}</div>
        <p>At these numbers your income and returns keep up with your spending, so your savings don't run out.</p>`;
    }
    const max = Math.max(...yearly);
    const rows = yearly.slice(0, 31).map((b, i) => `<div class="calc-yr"><span class="muted small">${i === 0 ? "Now" : `Year ${i}`}</span>${bar(100 * b / max)}<span class="small">${money(b)}</span></div>`).join("");
    return `<div class="calc-stats">
        ${stat("Your savings last", duration(months), months < 12 ? "bad" : "")}
        ${stat("Money runs out around", monthLabel(months))}
        ${simple ? stat("Without inflation or returns", duration(simple)) : ""}
      </div>
      <h3>Savings at the start of each year</h3><div class="calc-years">${rows}</div>`;
  },

  "emergency-fund"() {
    const essentials = f("essentials"), months = f("months"), saved = f("saved"), monthly = f("monthly");
    if (essentials <= 0 || months <= 0) return `<p class="muted">Enter your essential monthly expenses.</p>`;
    const target = essentials * months, gap = Math.max(0, target - saved), pct = 100 * saved / target;
    const reach = gap === 0 ? "Done" : monthly > 0 ? duration(Math.ceil(gap / monthly)) : "Add a monthly amount";
    return `<div class="calc-stats">
        ${stat("Emergency fund target", money(target))}
        ${stat("Still to save", money(gap), gap ? "" : "good")}
        ${stat("Time to reach it", reach, gap ? "" : "good")}
      </div>
      ${bar(pct, "good")}<p class="small muted">You have ${num(Math.min(pct, 999))}% of your target, about ${num(saved / essentials, 1)} months of essentials.</p>`;
  },

  "sinking-fund"() {
    const rows = [...form.querySelectorAll("tbody tr")].map((tr) => {
      const g = (n) => tr.querySelector(`[name="${n}"]`);
      const left = Math.max(0, val(g("amount")) - val(g("saved"))), due = Math.max(0, Math.floor(val(g("due"))));
      return { name: g("name").value.trim() || "Unnamed", left, due, monthly: due ? left / due : left };
    }).filter((r) => r.left > 0);
    if (!rows.length) return `<p class="muted">Add a bill with an amount to see how much to set aside.</p>`;
    const total = rows.reduce((a, r) => a + r.monthly, 0);
    const body = rows.map((r) => `<tr><td>${esc(r.name)}</td><td>${money(r.left)}</td><td>${r.due ? `${money(r.monthly)} / month for ${r.due} month${r.due > 1 ? "s" : ""}` : `${money(r.left)} now`}</td></tr>`).join("");
    return `<div class="calc-stats">${stat("Set aside each month", money(total))}${stat("Over a year", money(total * 12))}</div>
      <div class="table-scroll"><table class="compare calc-res"><thead><tr><th>Bill</th><th>Still needed</th><th>Save</th></tr></thead><tbody>${body}</tbody></table></div>
      <p class="small muted">Amounts shown are what each bill needs until it is due. After a bill is paid, the next year's amount starts again.</p>`;
  },

  "50-30-20-budget"() {
    const income = f("income");
    if (income <= 0) return `<p class="muted">Enter your monthly take-home pay.</p>`;
    const now = { needs: f("needs"), wants: f("wants"), savings: f("savings") };
    const compare = now.needs + now.wants + now.savings > 0;
    const parts = [["needs", "Needs", 50], ["wants", "Wants", 30], ["savings", "Savings", 20]];
    const cells = parts.map(([k, label, p]) => {
      const goal = income * p / 100;
      let extra = "";
      if (compare) {
        const d = now[k] - goal, good = k === "savings" ? d >= 0 : d <= 0;
        extra = `<span class="small ${good ? "good" : "bad"}">Now ${money(now[k])} (${num(100 * now[k] / income)}%) · ${d === 0 ? "on target" : `${money(Math.abs(d))} ${d > 0 ? "over" : "under"}`}</span>`;
      }
      return `<div class="calc-stat"><span class="muted small">${label} (${p}%)</span><strong>${money(goal)}</strong>${extra}</div>`;
    }).join("");
    const left = income - now.needs - now.wants - now.savings;
    return `<div class="calc-stats">${cells}</div>
      ${compare && Math.abs(left) >= 1 ? `<p class="small ${left < 0 ? "bad" : "muted"}">${left < 0 ? `You are spending ${money(-left)} more than you take home.` : `${money(left)} of your pay isn't assigned to anything yet.`}</p>` : ""}`;
  },
};

function render() { out.innerHTML = calcs[slug](); }

// Count one use per page view, only after the visitor changes something.
let counted = false;
function countUse() {
  if (counted) return;
  counted = true;
  const t = document.cookie.match(/(?:^|; )csrftoken=([^;]+)/);
  fetch("/api/calc-use", { method: "POST", credentials: "same-origin", keepalive: true,
    headers: { "Content-Type": "application/json", "X-CSRFToken": t ? decodeURIComponent(t[1]) : "" },
    body: JSON.stringify({ calc: slug }) }).catch(() => {});
}

const cur = form.querySelector("[data-currency]");
const startCur = guessCurrency();
setCurrency(startCur);
cur.innerHTML = currencyOptions(startCur);

form.addEventListener("submit", (e) => e.preventDefault());
form.addEventListener("input", (e) => {
  if (e.target === cur) setCurrency(cur.value);
  if (e.target.name === "situation") form.elements.months.value = e.target.value;
  render(); countUse();
});
form.addEventListener("click", (e) => {
  const tbody = form.querySelector("tbody");
  if (e.target.closest("[data-add]")) {
    const row = tbody.rows[0]?.cloneNode(true);
    if (!row) return;
    row.querySelectorAll("input").forEach((i) => { i.value = i.name === "name" ? "" : i.name === "due" ? "12" : ""; });
    tbody.append(row); row.querySelector("input").focus();
  } else if (e.target.closest("[data-remove]")) {
    if (tbody.rows.length > 1) e.target.closest("tr").remove();
    else tbody.rows[0].querySelectorAll("input").forEach((i) => { i.value = ""; });
  } else return;
  render(); countUse();
});
render();
