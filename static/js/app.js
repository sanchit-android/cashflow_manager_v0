import * as C from "./crypto.js";
import * as E from "./engine.js";
import { api, device, store } from "./store.js";
import { readXlsx } from "./xlsx.js";
import * as I from "./importer.js";

const root = document.getElementById("root");
const tabsEl = document.getElementById("tabs");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const inr = (n) => (n == null ? "—" : "₹" + Math.round(n).toLocaleString("en-IN"));
const today = () => new Date().toISOString().slice(0, 10);
const html = (s) => { root.innerHTML = s; };
const $ = (sel) => root.querySelector(sel);
const $$ = (sel) => [...root.querySelectorAll(sel)];

const THEMES = {
  paper: ["Paper", "#f7f6f2", "#2457c5"], night: ["Night", "#121417", "#7aa7ff"],
  chai: ["Chai", "#f6efe4", "#9a4a12"], mint: ["Mint", "#eef6f3", "#0f7a5c"], ink: ["Ink", "#ffffff", "#000000"],
};
function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem("theme", t); } catch (e) { /* ignore */ }
}
const themePicker = (current) => `<div class="themes">${Object.entries(THEMES).map(([k, [name, bg, ac]]) =>
  `<button type="button" class="theme-swatch ${k === current ? "on" : ""}" data-theme-pick="${k}">
     <span style="background:${bg};border:1px solid #888"></span><span style="background:${ac}"></span> ${name}</button>`).join("")}</div>`;
function wireThemePicker(onPick) {
  $$("[data-theme-pick]").forEach((b) => b.addEventListener("click", () => {
    $$("[data-theme-pick]").forEach((x) => x.classList.toggle("on", x === b));
    applyTheme(b.dataset.themePick); onPick && onPick(b.dataset.themePick);
  }));
}
function showError(e) { const el = $("#err"); if (el) el.textContent = e.message || String(e); else alert(e.message || e); }

// ================= start =================
async function start() {
  try {
    await store.load();
    if (!store.vault) return setupVault();
    const remembered = await device.load(store.email);
    if (remembered) {
      try { await store.unlock(remembered); return afterUnlock(); } catch { await device.forget(store.email); }
    }
    unlockScreen();
  } catch (e) { html(`<p class="error">${esc(e.message)}</p>`); }
}

// ================= vault setup =================
function setupVault() {
  html(`<div class="narrow card">
    <h1>Lock your data with a passphrase</h1>
    <p>Everything you enter is encrypted on this device before it's saved. The passphrase is the key. We never see it.</p>
    <label for="p1">Vault passphrase (at least 10 characters; a short sentence works well)</label>
    <input id="p1" type="password" autocomplete="new-password">
    <label for="p2">Type it again</label>
    <input id="p2" type="password" autocomplete="new-password">
    <p><button class="primary" id="go">Create vault</button></p>
    <p class="error" id="err" role="alert"></p></div>`);
  $("#go").onclick = async () => {
    const p1 = $("#p1").value, p2 = $("#p2").value;
    if (p1.length < 10) return showError(new Error("Use at least 10 characters."));
    if (p1 !== p2) return showError(new Error("The two passphrases don't match."));
    $("#go").disabled = true; $("#go").textContent = "Creating…";
    try { showRecoveryKeys(await C.createVault(p1, 3)); }
    catch (e) { showError(e); $("#go").disabled = false; $("#go").textContent = "Create vault"; }
  };
}

function showRecoveryKeys(created) {
  const keys = created.recoveryKeys;
  html(`<div class="narrow card">
    <h1>Save your recovery keys</h1>
    <p class="notice"><strong>If you forget your passphrase and lose every recovery key, your data is gone for good. We can't recover it.</strong></p>
    <p>Each key below unlocks your data on its own. Keep them in different places: one printed at home, one in a password manager, one with someone you trust.</p>
    <div class="keys">${keys.map((k, i) => `<div>${i + 1}. ${k}</div>`).join("")}</div>
    <p class="row"><button id="dl">Download as text file</button><button id="pr">Print</button></p>
    <label><input type="checkbox" id="ack" style="width:auto"> I've saved my recovery keys and understand they can't be recovered</label>
    <label for="check">To confirm, type recovery key 1</label>
    <input id="check" autocomplete="off" spellcheck="false">
    <p><button class="primary" id="done">Finish setup</button></p>
    <p class="error" id="err" role="alert"></p></div>`);
  const text = `Cashflow recovery keys for ${store.email}\nCreated ${today()}\n\n` + keys.map((k, i) => `${i + 1}. ${k}`).join("\n") +
    "\n\nAny one of these unlocks your data. If you lose your passphrase and all of these, your data cannot be recovered.\n";
  $("#dl").onclick = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    a.download = "cashflow-recovery-keys.txt"; a.click();
  };
  $("#pr").onclick = () => window.print();
  $("#done").onclick = async () => {
    if (!$("#ack").checked) return showError(new Error("Tick the box to confirm you've saved the keys."));
    if (C.normalizeRecoveryKey($("#check").value) !== C.normalizeRecoveryKey(keys[0])) return showError(new Error("That doesn't match recovery key 1."));
    try {
      const r = await api("/api/vault", { method: "POST", body: created.payload });
      store.vault = r.vault;
      await device.save(store.email, created.dataKey);
      await store.unlock(created.dataKey);
      afterUnlock();
    } catch (e) { showError(e); }
  };
}

// ================= unlock =================
function unlockScreen(mode = "pass") {
  const recovery = mode === "recovery";
  html(`<div class="narrow card">
    <h1>Unlock your data</h1>
    <label for="secret">${recovery ? "Recovery key" : "Vault passphrase"}</label>
    <input id="secret" type="${recovery ? "text" : "password"}" autocomplete="${recovery ? "off" : "current-password"}" spellcheck="false">
    ${recovery ? `<label for="np">New passphrase (at least 10 characters)</label><input id="np" type="password" autocomplete="new-password">` : ""}
    <label><input type="checkbox" id="remember" style="width:auto" checked> Keep unlocked on this device</label>
    <p class="row"><button class="primary" id="go">Unlock</button>
      <button class="link" id="switch">${recovery ? "Use passphrase instead" : "Forgot passphrase? Use a recovery key"}</button></p>
    <p class="error" id="err" role="alert"></p></div>`);
  $("#switch").onclick = () => unlockScreen(recovery ? "pass" : "recovery");
  $("#secret").focus();
  const go = async () => {
    $("#go").disabled = true; $("#go").textContent = "Unlocking…";
    try {
      let key;
      if (recovery) {
        const np = $("#np").value;
        if (np.length < 10) throw new Error("Choose a new passphrase of at least 10 characters.");
        const r = await C.unlockWithRecoveryKey(store.vault, $("#secret").value);
        const v = await api("/api/vault", { method: "PUT", body: await C.rewrapPassphrase(store.vault, r.raw, np) });
        store.vault = v.vault; key = r.dataKey;
      } else {
        try { key = await C.unlockWithPassphrase(store.vault, $("#secret").value); }
        catch { throw new Error("That passphrase isn't right."); }
      }
      if ($("#remember").checked) await device.save(store.email, key);
      await store.unlock(key);
      afterUnlock();
    } catch (e) { showError(e); $("#go").disabled = false; $("#go").textContent = "Unlock"; }
  };
  $("#go").onclick = go;
  $("#secret").addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
}

// ================= after unlock =================
const S = { tab: "month", period: E.periodOf(today()) };
const db = () => E.index(store.records());
const settingsRec = () => store.ofType("settings")[0];

function afterUnlock() {
  const s = settingsRec();
  if (!s) return onboarding();
  if (s.data.theme) applyTheme(s.data.theme);
  S.tab = "month";
  S.period = E.periodOf(today(), s.data);
  renderTabs(); render();
}

function onboarding() {
  let theme = document.documentElement.dataset.theme || "paper";
  html(`<div class="narrow card">
    <h1>Set up your month</h1>
    <label>Pick a look</label>${themePicker(theme)}
    <label for="fm">How is your household funded?</label>
    <select id="fm"><option value="salary">Salary</option><option value="savings">Savings (no regular salary)</option><option value="both">Salary plus savings</option></select>
    <div id="sal"><label for="samt">Monthly take-home salary</label><input id="samt" type="number" min="0" placeholder="85000">
      <label for="sday">Salary usually arrives on day</label><input id="sday" type="number" min="1" max="31" placeholder="26">
      <label><input type="checkbox" id="cycle" style="width:auto"> Run my months from salary day to salary day</label></div>
    <label for="other">Other regular monthly income (rent, interest), if any</label><input id="other" type="number" min="0" placeholder="0">
    <label for="ob">Current balance of your main spending account</label><input id="ob" type="number" placeholder="150000">
    <label for="sv">Liquid savings outside it (FDs, savings accounts, mutual funds), roughly</label><input id="sv" type="number" min="0" placeholder="0">
    <p><button class="primary" id="go">Start</button></p><p class="muted">You can change any of this later.</p>
    <p class="error" id="err" role="alert"></p></div>`);
  wireThemePicker((t) => { theme = t; });
  const sync = () => { $("#sal").hidden = $("#fm").value === "savings"; };
  $("#fm").onchange = sync; sync();
  $("#go").onclick = async () => {
    try {
      const fm = $("#fm").value, sday = +$("#sday").value || null;
      const settings = { funding_mode: fm, theme, currency: "INR",
        period_mode: fm !== "savings" && $("#cycle").checked && sday ? "pay_cycle" : "calendar", cycle_day: sday };
      const period = E.periodOf(today(), settings);
      const items = [{ type: "settings", data: settings },
        { type: "account", data: { name: "Main account", kind: "bank", role: "spending", is_default_spending: true, opening_balance: +$("#ob").value || 0, opening_period: period } }];
      if (+$("#sv").value) items.push({ type: "account", data: { name: "Savings", kind: "bank", role: "savings", balance: +$("#sv").value, liquid: true } });
      if (fm !== "savings" && +$("#samt").value) items.push({ type: "income", data: { label: "Salary", kind: "salary", amount: +$("#samt").value, day: sday } });
      if (+$("#other").value) items.push({ type: "income", data: { label: "Other income", kind: "other", amount: +$("#other").value } });
      await store.save(items);
      afterUnlock();
    } catch (e) { showError(e); }
  };
}

// ================= tabs =================
const TABS = [["month", "Month"], ["plan", "Plan"], ["accounts", "Accounts"], ["savings", "Savings"], ["import", "Import"], ["settings", "Settings"]];
function renderTabs() {
  tabsEl.hidden = false;
  tabsEl.innerHTML = TABS.map(([k, l]) => `<button data-tab="${k}" class="${S.tab === k ? "on" : ""}">${l}</button>`).join("");
  tabsEl.querySelectorAll("button").forEach((b) => (b.onclick = () => { S.tab = b.dataset.tab; renderTabs(); render(); }));
}
function render() {
  try { ({ month: viewMonth, plan: viewPlan, accounts: viewAccounts, savings: viewSavings, import: viewImport, settings: viewSettings })[S.tab](); }
  catch (e) { html(`<p class="error">${esc(e.message)}</p>`); console.error(e); }
}

// ================= editable sheet helper =================
// cols: [{ key, label, type: text|number|date|select, options: [[value,label]], num }]
function sheet({ id, rows, cols, type, defaults = {}, totalKey, extra }) {
  const cell = (c, v) => {
    if (c.type === "select") return `<select data-k="${c.key}">${c.options.map(([o, l]) => `<option value="${esc(o)}" ${String(o) === String(v ?? "") ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>`;
    return `<input data-k="${c.key}" type="${c.type || "text"}" value="${esc(v ?? "")}" ${c.type === "number" ? 'step="any"' : ""}>`;
  };
  const total = totalKey ? rows.reduce((x, r) => x + (+r[totalKey] || 0), 0) : null;
  return `<div class="sheet-wrap"><table class="sheet" id="${id}" data-type="${type}" data-defaults='${esc(JSON.stringify(defaults))}'>
    <thead><tr>${cols.map((c) => `<th>${esc(c.label)}</th>`).join("")}${extra ? `<th>${esc(extra.label)}</th>` : ""}<th></th></tr></thead>
    <tbody>${rows.map((r) => `<tr data-id="${r.id}">${cols.map((c) => `<td class="${c.num ? "num" : ""}">${cell(c, r[c.key])}</td>`).join("")}
      ${extra ? `<td class="static ${extra.num ? "num" : ""}">${extra.render(r)}</td>` : ""}<td><button class="link" data-del title="Delete row" aria-label="Delete row">✕</button></td></tr>`).join("")}
      <tr data-id="" class="new">${cols.map((c) => `<td class="${c.num ? "num" : ""}">${cell(c, defaults[c.key])}</td>`).join("")}${extra ? "<td></td>" : ""}<td></td></tr></tbody>
    ${totalKey ? `<tfoot><tr><td colspan="${cols.findIndex((c) => c.key === totalKey)}">Total</td><td class="num">${inr(total)}</td></tr></tfoot>` : ""}
  </table></div>`;
}
// Spreadsheet behaviour: existing rows save on every change without redrawing (so Tab keeps working);
// the new row saves once focus leaves it; totals redraw when focus leaves the table.
function wireSheets(mapRow = (d) => d) {
  $$("table.sheet").forEach((t) => {
    const type = t.dataset.type, defaults = JSON.parse(t.dataset.defaults || "{}");
    let dirty = false, saving = Promise.resolve();
    const readRow = (tr) => {
      const data = { ...defaults };
      if (tr.dataset.id) Object.assign(data, store.rows.get(tr.dataset.id).data);
      tr.querySelectorAll("[data-k]").forEach((el) => { data[el.dataset.k] = el.type === "number" ? (el.value === "" ? null : +el.value) : el.value; });
      return mapRow(data, type);
    };
    const touched = (tr) => [...tr.querySelectorAll("[data-k]")].some((el) =>
      el.tagName === "INPUT" && el.type !== "date" && el.value !== "" && String(defaults[el.dataset.k] ?? "") !== el.value);
    t.addEventListener("change", (e) => {
      const tr = e.target.closest("tr"); if (!tr || !tr.dataset.id) return;
      const data = readRow(tr);
      saving = saving.then(() => store.save({ id: tr.dataset.id, type, data })).then(() => { dirty = true; }, (x) => { alert(x.message); render(); });
    });
    t.addEventListener("focusout", async (e) => {
      const tr = e.target.closest("tr");
      const leavingRow = !tr || !tr.contains(e.relatedTarget);
      const leavingTable = !t.contains(e.relatedTarget);
      if (tr && tr.classList.contains("new") && leavingRow && touched(tr)) {
        const data = readRow(tr);
        await saving;
        try { await store.save({ type, data }); } catch (x) { alert(x.message); }
        render();
        if (!leavingTable) { const n = document.querySelector(`#${t.id} tr.new [data-k]`); if (n) n.focus(); }
        return;
      }
      if (leavingTable && dirty) { await saving; dirty = false; render(); }
    });
    t.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" || !e.target.closest("tr.new")) return;
      e.preventDefault();
      // Moving focus out of the row triggers the save; the redraw then refocuses the new row.
      const other = t.querySelector("tbody tr:not(.new) [data-k]");
      if (other) other.focus(); else e.target.blur();
    });
    t.addEventListener("click", async (e) => {
      if (!e.target.matches("[data-del]")) return;
      const id = e.target.closest("tr").dataset.id;
      if (id && confirm("Delete this row?")) { await store.remove(id); render(); }
    });
  });
}

const accountOptions = (filter = () => true) => store.ofType("account").filter((a) => filter(a.data)).map((a) => [a.id, a.data.name]);
const opts = (arr) => arr.map((x) => [x, x]);
const NATURE_LABELS = [["variable", "Day to day"], ["recurring", "Monthly fixed"], ["annual", "Annual"], ["oneoff", "One-off"], ["emergency", "Emergency"], ["investment", "Investment"], ["income", "Regular income"], ["income_oneoff", "One-off income"]];

// ================= Month =================
function viewMonth() {
  const d = db(), s = E.summarize(d, S.period), settings = settingsRec().data;
  const v = s.verdict;
  const [y, m] = S.period.split("-").map(Number);
  const label = new Date(y, m - 1, 1).toLocaleString("en-IN", { month: "long", year: "numeric" });
  const verdict = v.kind === "ahead"
    ? `<span class="big good">${inr(v.amount)} ahead</span>Income covers this month's spending. ${s.commitments_pending ? `After ${inr(s.commitments_pending)} of commitments still due, you can spend up to <strong>${inr(Math.max(0, s.headroom))}</strong> more without touching savings.` : `You can spend up to <strong>${inr(v.amount)}</strong> more without touching savings.`}`
    : `<span class="big bad">${inr(v.amount)} from savings</span>This month spends more than comes in.${s.commitments_pending ? ` Another ${inr(s.commitments_pending)} of commitments is still due.` : ""}`;
  const r = E.runway(d, S.period);
  const pending = s.commitments.filter((c) => !c.paid);
  const defaultAcc = (store.ofType("account").find((a) => a.data.is_default_spending) || {}).id || "";

  const txRows = d.transaction.filter((t) => t.period === S.period).sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  html(`
    <div class="row"><button id="prev" aria-label="Previous month">←</button><h1 style="margin:0">${esc(label)}${settings.period_mode === "pay_cycle" ? ` <span class="muted" style="font-size:14px">cycle from day ${settings.cycle_day}</span>` : ""}</h1><button id="next" aria-label="Next month">→</button></div>
    <div class="card verdict" style="margin-top:12px">${verdict}
      ${r.months != null && r.savings > 0 ? `<p class="muted">At your 3-month average burn of ${inr(r.burn)}, liquid savings of ${inr(r.savings)} last about ${r.months} months.</p>` : ""}</div>
    <div class="grid">
      ${[["Opening", s.opening], ["Regular income", s.regular_inflow], ["Monthly spending", s.monthly_expense], ["Annual items", s.annual_expense],
        ["Investments", s.investments], ["One-off income", s.oneoff_inflow], ["Closing", s.closing]].map(([l, n]) => `<div class="card metric"><div class="label">${l}</div><div class="value">${inr(n)}</div></div>`).join("")}
    </div>
    ${pending.length ? `<div class="card"><h2>Still to pay this month</h2>${pending.map((c) => `<div class="row" style="padding:4px 0"><span>${esc(c.label)}</span><span class="spacer"></span><span class="num">${inr(c.amount)}</span><button data-pay="${c.id}">Mark paid</button></div>`).join("")}</div>` : ""}
    <div class="card"><h2>Transactions</h2>
      <p class="muted">Type in the last row and press Enter to add. Use one row per transaction, or one row per merchant for the month.</p>
      ${sheet({ id: "tx", type: "transaction", rows: txRows, totalKey: null,
        defaults: { date: today().slice(0, 7) === S.period ? today() : S.period + "-01", account_id: defaultAcc, direction: "out", nature: "variable", category: "Other" },
        cols: [
          { key: "date", label: "Date", type: "date" },
          { key: "description", label: "Description" },
          { key: "account_id", label: "Account", type: "select", options: accountOptions() },
          { key: "direction", label: "Type", type: "select", options: [["out", "Spent"], ["in", "Received"], ["transfer", "Transfer"]] },
          { key: "to_account_id", label: "To (transfers)", type: "select", options: [["", ""], ...accountOptions()] },
          { key: "category", label: "Category", type: "select", options: opts(E.CATEGORIES) },
          { key: "nature", label: "Kind", type: "select", options: NATURE_LABELS },
          { key: "amount", label: "Amount", type: "number", num: true },
        ] })}
    </div>
    ${Object.keys(s.by_category).length ? `<div class="card"><h2>Spending by category</h2>${Object.entries(s.by_category).sort((a, b) => b[1] - a[1]).map(([k, n]) => `<div class="row"><span>${esc(k)}</span><span class="spacer"></span><span class="num">${inr(n)}</span></div>`).join("")}</div>` : ""}`);
  $("#prev").onclick = () => { S.period = E.shiftPeriod(S.period, -1); render(); };
  $("#next").onclick = () => { S.period = E.shiftPeriod(S.period, 1); render(); };
  $$("[data-pay]").forEach((b) => (b.onclick = async () => {
    const c = store.rows.get(b.dataset.pay).data;
    await store.save({ type: "transaction", data: { date: S.period + "-" + String(Math.min(c.day || 1, 28)).padStart(2, "0"), description: c.label, account_id: c.account_id || defaultAcc, direction: "out", category: c.category || "Other", nature: "recurring", amount: +c.amount, recurring_id: b.dataset.pay } });
    render();
  }));
  wireSheets((data) => ({ ...data, period: E.periodOf(data.date, settingsRec().data) }));
}

// ================= Plan =================
function viewPlan() {
  const d = db(), year = +S.period.slice(0, 4);
  const annual = E.annualStatus(d, year);
  const up = E.upcoming(d, S.period, 3);
  html(`
    <div class="card"><h2>Monthly commitments</h2><p class="muted">Rent, help, tuition, family transfers. These show up every month as "still to pay" until marked paid.</p>
      ${sheet({ id: "cm", type: "commitment", rows: store.ofType("commitment").map((r) => ({ id: r.id, ...r.data })), totalKey: "amount",
        defaults: { category: "Household" },
        cols: [{ key: "label", label: "What" }, { key: "category", label: "Category", type: "select", options: opts(E.CATEGORIES) },
          { key: "day", label: "Day", type: "number" }, { key: "amount", label: "Amount", type: "number", num: true }] })}</div>
    <div class="card"><h2>Annual items for ${year}</h2><p class="muted">School fees, insurance, taxes. Record payments below so paid and unpaid stay accurate.</p>
      ${sheet({ id: "an", type: "annual", rows: annual, totalKey: "total", defaults: { year, mode: "card" },
        extra: { label: "Paid / unpaid", num: true, render: (r) => `${inr(r.paid)} / <span class="${r.unpaid ? "bad" : "good"}">${inr(r.unpaid)}</span>` },
        cols: [{ key: "label", label: "What" }, { key: "due_month", label: "Due month (1-12)", type: "number" },
          { key: "mode", label: "Paid by", type: "select", options: [["card", "Card"], ["cash", "Bank / cash"]] },
          { key: "total", label: "Total", type: "number", num: true }] })}
      ${annual.some((a) => a.unpaid) ? `<h3 style="margin-top:16px">Record a payment</h3><div class="row"><select id="ap" style="width:auto">${annual.filter((a) => a.unpaid).map((a) => `<option value="${a.id}">${esc(a.label)} (${inr(a.unpaid)} left)</option>`).join("")}</select>
        <input id="apamt" type="number" placeholder="Amount" style="width:140px"><select id="apacc" style="width:auto">${accountOptions().map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join("")}</select><button id="apgo">Add payment</button></div>` : ""}
      <p class="muted">Set aside each month for the rest of the year: <strong>${inr(annual.reduce((x, a) => x + a.unpaid, 0) / Math.max(1, 13 - (+S.period.slice(5))))}</strong></p></div>
    <div class="card"><h2>Regular income</h2>
      ${sheet({ id: "in", type: "income", rows: store.ofType("income").map((r) => ({ id: r.id, ...r.data })), totalKey: "amount", defaults: { kind: "other" },
        cols: [{ key: "label", label: "Source" }, { key: "kind", label: "Kind", type: "select", options: [["salary", "Salary"], ["rent", "Rent"], ["interest", "Interest"], ["other", "Other"]] },
          { key: "day", label: "Usual day", type: "number" }, { key: "amount", label: "Amount", type: "number", num: true }] })}</div>
    <div class="card"><h2>Coming up (next 3 months)</h2>${up.length ? up.map((u) => `<div class="row"><span class="muted" style="width:80px">${u.period}</span><span>${esc(u.label)}</span><span class="muted">${u.kind}</span><span class="spacer"></span><span class="num">${inr(u.amount)}</span></div>`).join("") : '<p class="muted">Nothing due.</p>'}</div>`);
  wireSheets();
  if ($("#apgo")) $("#apgo").onclick = async () => {
    const a = store.rows.get($("#ap").value).data, amt = +$("#apamt").value;
    if (!amt) return alert("Enter an amount.");
    await store.save({ type: "transaction", data: { date: today(), period: E.periodOf(today(), settingsRec().data), description: a.label, account_id: $("#apacc").value, direction: "out", category: "Other", nature: "annual", amount: amt, annual_id: $("#ap").value } });
    render();
  };
}

// ================= Accounts =================
function viewAccounts() {
  const rows = store.ofType("account").map((r) => ({ id: r.id, ...r.data }));
  html(`<div class="card"><h2>Accounts</h2>
    <p class="muted">Spending accounts make up your monthly opening and closing balance. Cards collect spending until you pay the bill (a transfer from a spending account). Savings and investments count towards runway.</p>
    ${sheet({ id: "ac", type: "account", rows, defaults: { role: "spending", kind: "bank", opening_period: S.period },
      cols: [{ key: "name", label: "Name" },
        { key: "role", label: "Role", type: "select", options: [["spending", "Spending"], ["card", "Credit card"], ["savings", "Savings"], ["investment", "Investment"], ["long_term", "Long-term (PPF, property)"], ["receivable", "Money lent"]] },
        { key: "opening_balance", label: "Opening balance (spending)", type: "number", num: true },
        { key: "opening_period", label: "From month (YYYY-MM)" },
        { key: "balance", label: "Current balance (savings)", type: "number", num: true }] })}</div>`);
  wireSheets();
}

// ================= Savings =================
function viewSavings() {
  const d = db(), r = E.runway(d, S.period);
  const byRole = (role) => d.account.filter((a) => a.role === role).reduce((x, a) => x + (+a.balance || 0), 0);
  html(`<div class="card"><h2>Savings and runway</h2>
    <div class="grid">
      <div class="metric"><div class="label">Liquid savings</div><div class="value">${inr(r.savings)}</div></div>
      <div class="metric"><div class="label">Long-term (not counted)</div><div class="value">${inr(byRole("long_term"))}</div></div>
      <div class="metric"><div class="label">Money lent</div><div class="value">${inr(byRole("receivable"))}</div></div>
      <div class="metric"><div class="label">Average monthly burn</div><div class="value">${r.burn == null ? "—" : inr(r.burn)}</div></div>
    </div>
    <p class="verdict">${r.months == null ? (r.burn == null ? "Add a few months of transactions to see runway." : "Your income covers your spending, so savings aren't being drawn down.") : `At this rate, savings last about <strong>${r.months} months</strong>, until around <strong>${r.runs_out}</strong>.`}</p>
    <p class="muted">Update balances on the Accounts tab. Snapshots and multi-year projections come next.</p></div>`);
}

// ================= Settings =================
function viewSettings() {
  const s = settingsRec();
  const keys = store.vault.keys;
  html(`
    <div class="card"><h2>Look</h2>${themePicker(s.data.theme || "paper")}</div>
    <div class="card"><h2>Months</h2>
      <label for="pm">Months run</label><select id="pm" style="max-width:320px"><option value="calendar">Calendar month (1st to end)</option><option value="pay_cycle">Salary day to salary day</option></select>
      <label for="cd">Salary day</label><input id="cd" type="number" min="1" max="31" style="max-width:120px" value="${esc(s.data.cycle_day || "")}">
      <p><button id="savepm">Save</button></p></div>
    <div class="card"><h2>Recovery keys</h2><p class="muted">Any one of these unlocks your data. Keep at least one.</p>
      ${keys.map((k) => `<div class="row" style="padding:4px 0"><span>${esc(k.label)}</span><span class="muted">created ${k.created_at.slice(0, 10)}</span><span class="spacer"></span>${keys.length > 1 ? `<button data-revoke="${k.id}">Revoke</button>` : ""}</div>`).join("")}
      ${keys.length < 5 ? `<label for="kp">Your passphrase (to add a key)</label><input id="kp" type="password" style="max-width:320px"><p><button id="addkey">Add a recovery key</button></p>` : ""}
      <div id="newkey"></div></div>
    <div class="card"><h2>Passphrase</h2>
      <label for="op">Current passphrase</label><input id="op" type="password" style="max-width:320px">
      <label for="np">New passphrase</label><input id="np" type="password" style="max-width:320px">
      <p><button id="chpass">Change passphrase</button></p></div>
    <div class="card"><h2>Your data</h2>
      <p class="row"><button id="export">Export everything (JSON)</button><button id="lock">Lock now</button><button id="forget">Forget this device</button></p>
      <p><button id="delacct" style="color:var(--bad)">Delete account and all data</button></p></div>
    <p class="error" id="err" role="alert"></p>`);
  $("#pm").value = s.data.period_mode || "calendar";
  wireThemePicker(async (t) => { await store.save({ id: s.id, type: "settings", data: { ...s.data, theme: t } }); });
  $("#savepm").onclick = async () => {
    const day = +$("#cd").value || null;
    if ($("#pm").value === "pay_cycle" && !day) return showError(new Error("Enter your salary day."));
    const data = { ...settingsRec().data, period_mode: $("#pm").value, cycle_day: day };
    // Re-file transactions into periods under the new rule.
    const tx = store.ofType("transaction").map((r) => ({ id: r.id, type: "transaction", data: { ...r.data, period: E.periodOf(r.data.date, data) } }));
    await store.save([{ id: s.id, type: "settings", data }, ...tx]);
    S.period = E.periodOf(today(), data); alert("Saved.");
  };
  $$("[data-revoke]").forEach((b) => (b.onclick = async () => {
    if (!confirm("Revoke this recovery key? It will stop working.")) return;
    try { store.vault = (await api(`/api/vault/keys/${b.dataset.revoke}`, { method: "DELETE" })).vault; render(); } catch (e) { showError(e); }
  }));
  if ($("#addkey")) $("#addkey").onclick = async () => {
    try {
      const raw = await C.rawFromPassphrase(store.vault, $("#kp").value).catch(() => { throw new Error("That passphrase isn't right."); });
      const slot = await C.newRecoverySlot(store.vault, raw);
      store.vault = (await api("/api/vault/keys", { method: "POST", body: { label: `Recovery key ${store.vault.keys.length + 1}`, wrapped_key: slot.wrapped_key } })).vault;
      render();
      $("#newkey").innerHTML = `<p class="notice">New key (shown once, save it now):</p><div class="keys">${slot.recoveryKey}</div>`;
    } catch (e) { showError(e); }
  };
  $("#chpass").onclick = async () => {
    try {
      if ($("#np").value.length < 10) throw new Error("Use at least 10 characters.");
      const raw = await C.rawFromPassphrase(store.vault, $("#op").value).catch(() => { throw new Error("Current passphrase isn't right."); });
      store.vault = (await api("/api/vault", { method: "PUT", body: await C.rewrapPassphrase(store.vault, raw, $("#np").value) })).vault;
      $("#op").value = $("#np").value = ""; alert("Passphrase changed.");
    } catch (e) { showError(e); }
  };
  $("#export").onclick = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(store.records().filter((r) => !r.deleted).map(({ id, type, data }) => ({ id, type, data })), null, 2)], { type: "application/json" }));
    a.download = `cashflow-export-${today()}.json`; a.click();
  };
  $("#lock").onclick = () => { store.lock(); tabsEl.hidden = true; unlockScreen(); };
  $("#forget").onclick = async () => { await device.forget(store.email); store.lock(); tabsEl.hidden = true; unlockScreen(); };
  $("#delacct").onclick = async () => {
    if (prompt('This deletes your account and every record for good. Type "delete" to confirm.') !== "delete") return;
    await device.forget(store.email);
    await api("/api/account/delete", { method: "POST" });
    location.href = "/";
  };
}

// ================= Import =================
const IMP = { file: null, book: null, rows: null, result: null };
const mainAccount = () => store.ofType("account").find((a) => a.data.is_default_spending) || store.ofType("account").find((a) => a.data.role === "spending");

function importBatches() {
  const by = {};
  for (const r of store.records()) if (!r.deleted && r.data && r.data.import_batch) (by[r.data.import_batch] ||= []).push(r.id);
  return Object.entries(by).map(([batch, ids]) => ({ batch, ids, label: batch.replace(/^\d+-/, ""), when: new Date(+batch.split("-")[0]).toLocaleString("en-IN") }));
}

function viewImport() {
  const batches = importBatches();
  html(`
    <div class="card"><h2>Import</h2>
      <p class="muted">Your file is read on this device and never uploaded. Only the encrypted results are saved.</p>
      <input type="file" id="file" accept=".csv,.xlsx,text/csv">
      <div id="imp"></div><p class="error" id="err" role="alert"></p></div>
    ${batches.length ? `<div class="card"><h2>Past imports</h2>${batches.map((b) => `<div class="row" style="padding:4px 0"><span>${esc(b.label)}</span><span class="muted">${esc(b.when)} · ${b.ids.length} records</span><span class="spacer"></span><button data-undo="${esc(b.batch)}">Undo import</button></div>`).join("")}</div>` : ""}`);
  $("#file").onchange = (e) => loadFile(e.target.files[0]).catch(showError);
  $$("[data-undo]").forEach((b) => (b.onclick = async () => {
    const batch = importBatches().find((x) => x.batch === b.dataset.undo);
    if (!confirm(`Remove all ${batch.ids.length} records from this import?`)) return;
    b.disabled = true; b.textContent = "Removing…";
    try { await store.save(batch.ids.map((id) => ({ id, type: store.rows.get(id).type, deleted: true }))); render(); } catch (x) { showError(x); }
  }));
}

async function loadFile(file) {
  if (!file) return;
  IMP.file = file; IMP.book = null; IMP.rows = null;
  const box = $("#imp");
  box.innerHTML = '<p class="muted">Reading…</p>';
  if (/\.xlsx$/i.test(file.name)) {
    IMP.book = await readXlsx(await file.arrayBuffer());
    if (await I.looksLikeFinancesWorkbook(IMP.book)) return financesForm();
    return sheetPicker();
  }
  IMP.rows = I.parseCSV(await file.text());
  mappingForm();
}

function sheetPicker() {
  $("#imp").innerHTML = `<label for="sheet">Sheet</label><select id="sheet" style="max-width:320px">${IMP.book.sheetNames.map((n) => `<option>${esc(n)}</option>`).join("")}</select>
    <p><button id="usesheet">Use this sheet</button></p>`;
  $("#usesheet").onclick = async () => { IMP.rows = (await IMP.book.sheet($("#sheet").value)).rows().filter((r) => r.some((c) => c !== null)); mappingForm(); };
}

function mappingForm() {
  const rows = IMP.rows;
  if (!rows || rows.length < 2) return showError(new Error("That file has no rows to import."));
  const headers = rows[0].map((h, i) => clean(h) || `Column ${i + 1}`);
  const g = I.guessMapping(headers);
  const sel = (key, label, optional) => `<label for="m-${key}">${label}</label><select id="m-${key}" style="max-width:320px">
    ${optional ? '<option value="-1">— none —</option>' : ""}${headers.map((h, i) => `<option value="${i}" ${g[key] === i ? "selected" : ""}>${esc(h)}</option>`).join("")}</select>`;
  $("#imp").innerHTML = `
    <p class="muted">${rows.length - 1} rows. Match your columns:</p>
    ${sel("date", "Date")}${sel("description", "Description", true)}${sel("amount", "Amount (one column)", true)}
    ${sel("debit", "…or Debit / withdrawal column", true)}${sel("credit", "…and Credit / deposit column", true)}${sel("category", "Category", true)}
    <label for="sign">In the amount column</label><select id="sign" style="max-width:320px"><option value="spent_positive">Positive = money spent</option><option value="received_positive">Positive = money received</option></select>
    <label for="dord">Dates look like</label><select id="dord" style="max-width:320px"><option value="dmy">Day/Month/Year</option><option value="mdy">Month/Day/Year</option></select>
    <label for="acct">Add to account</label><select id="acct" style="max-width:320px">${accountOptions().map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join("")}</select>
    <p><button id="prev">Preview</button></p><div id="preview"></div>`;
  if (g.debit >= 0 || g.credit >= 0) $("#m-amount").value = "-1";
  $("#prev").onclick = () => {
    const mapping = Object.fromEntries(["date", "description", "amount", "debit", "credit", "category"].map((k) => [k, +$("#m-" + k).value]));
    const res = I.importTable(rows, mapping, { account_id: $("#acct").value, sign: $("#sign").value, dateOrder: $("#dord").value,
      settings: settingsRec().data, batch: `${Date.now()}-${IMP.file.name}` });
    IMP.result = res;
    $("#preview").innerHTML = `<p>${res.items.length} transactions ready${res.report.skippedRows.length ? `, ${res.report.skippedRows.length} rows skipped (no date or amount: rows ${res.report.skippedRows.slice(0, 10).join(", ")}${res.report.skippedRows.length > 10 ? "…" : ""})` : ""}.</p>
      <div class="sheet-wrap"><table class="sheet"><thead><tr><th>Date</th><th>Description</th><th>Type</th><th>Category</th><th>Amount</th></tr></thead><tbody>
      ${res.items.slice(0, 8).map((i) => `<tr><td class="static">${i.data.date}</td><td class="static">${esc(i.data.description)}</td><td class="static">${i.data.direction === "in" ? "Received" : "Spent"}</td><td class="static">${i.data.category}</td><td class="static num">${inr(i.data.amount)}</td></tr>`).join("")}
      </tbody></table></div>${res.items.length ? '<p><button class="primary" id="doimp">Import</button></p>' : ""}`;
    if ($("#doimp")) $("#doimp").onclick = () => commitImport(res.items);
  };
}

async function financesForm() {
  const months = IMP.book.sheetNames.filter(I.monthSheetPeriod);
  $("#imp").innerHTML = `<p>This looks like a monthly finances workbook with <strong>${months.length} month sheets</strong>. Choose the months to import:</p>
    <div class="row">${months.map((m) => `<label style="margin:0"><input type="checkbox" class="mchk" value="${esc(m)}" checked style="width:auto"> ${esc(m)}</label>`).join("")}</div>
    <p><button id="prev">Check the import</button></p><div id="preview"></div>`;
  $("#prev").onclick = async () => {
    const chosen = $$(".mchk").filter((c) => c.checked).map((c) => c.value);
    if (!chosen.length) return showError(new Error("Choose at least one month."));
    const main = mainAccount();
    $("#preview").innerHTML = '<p class="muted">Checking…</p>';
    const r = await I.importFinancesWorkbook(IMP.book, { mainAccount: main, accounts: store.ofType("account"), months: chosen, batch: `${Date.now()}-${IMP.file.name}` });
    IMP.result = r;
    const ok = r.report.months.every((m) => m.diff === 0);
    $("#preview").innerHTML = `
      <p>${r.report.counts.transaction || 0} transactions, ${r.report.counts.account || 0} new accounts, ${r.report.counts.commitment || 0} monthly commitments, ${r.report.annualCount} annual items.</p>
      <p class="${ok ? "good" : "bad"}"><strong>${ok ? "Every month's closing balance matches your sheet." : "Some months don't match your sheet — check below before importing."}</strong></p>
      <div class="sheet-wrap"><table class="sheet" style="min-width:0"><thead><tr><th>Month</th><th>Sheet closing</th><th>After import</th><th>Difference</th></tr></thead><tbody>
      ${r.report.months.map((m) => `<tr><td class="static">${esc(m.sheet)}</td><td class="static num">${inr(m.sheetClosing)}</td><td class="static num">${inr(m.closing)}</td><td class="static num ${m.diff ? "bad" : "good"}">${m.diff ? inr(m.diff) : "✓"}</td></tr>`).join("")}
      </tbody></table></div>
      ${r.report.warnings.length ? `<div class="notice" style="margin-top:12px"><strong>In your sheet, these card bills differ from their line items.</strong> The difference is imported as an "unitemised" line so totals still match:<ul>${r.report.warnings.map((w) => `<li>${esc(w)}</li>`).join("")}</ul></div>` : ""}
      <label><input type="checkbox" id="setopen" style="width:auto" checked> Set ${esc(main.data.name)}'s opening balance to ${inr(r.opening.opening_balance)} from ${r.opening.opening_period}</label>
      <p><button class="primary" id="doimp">Import</button></p>`;
    $("#doimp").onclick = () => commitImport(r.items, $("#setopen").checked ? { id: main.id, data: { ...main.data, ...r.opening } } : null);
  };
}

async function commitImport(items, mainUpdate) {
  const btn = $("#doimp"); btn.disabled = true; btn.textContent = `Encrypting and saving ${items.length} records…`;
  try {
    const all = items.map((i) => ({ id: i.id, type: i.type, period: i.data.period || "", data: i.data }));
    if (mainUpdate) all.push({ id: mainUpdate.id, type: "account", data: mainUpdate.data });
    await store.save(all);
    IMP.result = null;
    const latest = items.filter((i) => i.data.period).map((i) => i.data.period).sort().pop();
    if (latest) S.period = latest;
    S.tab = "month"; renderTabs(); render();
  } catch (e) { showError(e); btn.disabled = false; btn.textContent = "Import"; }
}
const clean = (s) => String(s ?? "").trim();

start();
