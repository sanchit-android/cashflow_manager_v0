import * as C from "./crypto.js";
import * as E from "./engine.js";
import { api, device, store } from "./store.js";
import { readXlsx } from "./xlsx.js";
import * as I from "./importer.js";
import { mountGrid } from "./grid.js";
import { buildSuggest } from "./cells.js";

const root = document.getElementById("root");
const tabsEl = document.getElementById("tabs");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const inr = (n) => (n == null ? "—" : "₹" + Math.round(n).toLocaleString("en-IN"));
const today = () => new Date().toISOString().slice(0, 10);
const html = (s) => { root.innerHTML = s; };
const $ = (sel) => root.querySelector(sel);
const $$ = (sel) => [...root.querySelectorAll(sel)];

const THEMES = {
  excel: ["Excel", "#ffffff", "#217346"], paper: ["Paper", "#f7f6f2", "#2457c5"], sky: ["Sky", "#f3f7fc", "#1f6feb"],
  lavender: ["Lavender", "#f7f5fc", "#6b4fbb"], sand: ["Sand", "#faf6ee", "#a0612a"], rose: ["Rose", "#fdf6f7", "#b4325b"],
  mint: ["Mint", "#eef6f3", "#0f7a5c"], chai: ["Chai", "#f6efe4", "#9a4a12"], ink: ["Ink", "#ffffff", "#000000"], night: ["Night", "#121417", "#7aa7ff"],
};
// Tokens a custom theme can set, with labels for the editor.
const THEME_VARS = [["--bg", "Page background"], ["--surface", "Cards and cells"], ["--surface-2", "Panels"], ["--text", "Text"], ["--muted", "Secondary text"],
  ["--border", "Borders"], ["--accent", "Accent"], ["--good", "Positive numbers"], ["--bad", "Negative numbers"], ["--grid-head", "Sheet headers"],
  ["--grid-line", "Gridlines"], ["--grid-sel", "Selected cells"]];
const FONTS = { system: ["System", 'system-ui, -apple-system, "Segoe UI", sans-serif'], office: ["Office", '"Aptos", "Segoe UI", Calibri, sans-serif'],
  serif: ["Serif", 'Georgia, "Iowan Old Style", serif'], rounded: ["Rounded", 'ui-rounded, "SF Pro Rounded", "Nunito", system-ui, sans-serif'] };

function themeStyle(custom) {
  const vars = { ...(custom.vars || {}) };
  if (custom.font && FONTS[custom.font]) vars["--font"] = vars["--grid-font"] = FONTS[custom.font][1];
  if (custom.radius !== undefined) vars["--radius"] = custom.radius + "px";
  if (vars["--accent"]) vars["--grid-active"] = vars["--accent"];
  return vars;
}
function applyTheme(t, custom) {
  const de = document.documentElement;
  for (const k of [...THEME_VARS.map(([k]) => k), "--font", "--grid-font", "--radius", "--grid-active"]) de.style.removeProperty(k);
  if (t === "custom" && custom) {
    de.dataset.theme = custom.base || "excel";
    const vars = themeStyle(custom);
    for (const [k, v] of Object.entries(vars)) de.style.setProperty(k, v);
    try { localStorage.setItem("theme", "custom"); localStorage.setItem("themeVars", JSON.stringify({ base: custom.base, vars })); } catch (e) { /* ignore */ }
  } else {
    de.dataset.theme = t;
    try { localStorage.setItem("theme", t); localStorage.removeItem("themeVars"); } catch (e) { /* ignore */ }
  }
}
const themePicker = (current, custom) => `<div class="themes">${Object.entries(THEMES).map(([k, [name, bg, ac]]) =>
  `<button type="button" class="theme-swatch ${k === current ? "on" : ""}" data-theme-pick="${k}">
     <span style="background:${bg};border:1px solid #888"></span><span style="background:${ac}"></span> ${name}</button>`).join("")}
  ${custom ? `<button type="button" class="theme-swatch ${current === "custom" ? "on" : ""}" data-theme-pick="custom">
     <span style="background:${esc((custom.vars || {})["--bg"] || "#fff")};border:1px solid #888"></span><span style="background:${esc((custom.vars || {})["--accent"] || "#888")}"></span> My theme</button>` : ""}</div>`;
function wireThemePicker(onPick, custom) {
  $$("[data-theme-pick]").forEach((b) => b.addEventListener("click", () => {
    $$("[data-theme-pick]").forEach((x) => x.classList.toggle("on", x === b));
    applyTheme(b.dataset.themePick, custom); onPick && onPick(b.dataset.themePick);
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
  if (s.data.theme) applyTheme(s.data.theme, s.data.custom_theme);
  S.tab = "month";
  S.period = E.periodOf(today(), s.data);
  renderTabs(); render();
}

function onboarding() {
  let theme = document.documentElement.dataset.theme || "excel";
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

const accountOptions = (filter = () => true) => store.ofType("account").filter((a) => filter(a.data)).map((a) => [a.id, a.data.name]);
const opts = (arr) => arr.map((x) => [x, x]);
const NATURE_LABELS = [["variable", "Day to day"], ["recurring", "Monthly fixed"], ["annual", "Annual"], ["oneoff", "One-off"], ["emergency", "Emergency"], ["investment", "Investment"], ["income", "Regular income"], ["income_oneoff", "One-off income"]];
const rowsOf = (type, filter = () => true) => store.ofType(type).filter((r) => filter(r.data)).map((r) => ({ id: r.id, ...r.data }));
const saveRec = (type) => async (id, data) => (await store.save({ id: id || undefined, type, period: data.period || "", data }))[0];
const removeRec = async (id) => { await store.remove(id); };

// Learn descriptions from every transaction; rebuilt only when data changes.
let suggestCache = null, suggestKey = "";
const suggest = {
  get() {
    const key = store.rows.size + ":" + store.lastSync + ":" + saves;
    if (key !== suggestKey) { suggestCache = buildSuggest(store.ofType("transaction").map((r) => r.data)); suggestKey = key; }
    return suggestCache;
  },
  complete: (p) => suggest.get().complete(p),
  infer: (d) => suggest.get().infer(d),
};
let saves = 0;

const SHORTCUTS = `<p class="xl-help">Type to replace a cell · <kbd>F2</kbd> edit · <kbd>Enter</kbd>/<kbd>Tab</kbd>/arrows move · <kbd>Enter</kbd> on ✕ deletes the row ·
  <kbd>Ctrl</kbd>+<kbd>Z</kbd> undo · <kbd>Ctrl</kbd>+<kbd>C</kbd>/<kbd>V</kbd> copy &amp; paste (from Excel too) · <kbd>Ctrl</kbd>+<kbd>D</kbd> fill down ·
  <kbd>Ctrl</kbd>+<kbd>;</kbd> today · <kbd>Del</kbd> clear · <kbd>Alt</kbd>+<kbd>↓</kbd> open list · amounts accept <kbd>=120+340</kbd></p>`;

// ================= Month =================
function selectedAccount() {
  const accts = store.ofType("account");
  if (!S.account || !store.rows.get(S.account) || store.rows.get(S.account).deleted) {
    let saved = null; try { saved = localStorage.getItem("account"); } catch (e) { /* ignore */ }
    const def = accts.find((a) => a.id === saved) || accts.find((a) => a.data.is_default_spending) || accts[0];
    S.account = def ? def.id : null;
  }
  return S.account;
}

function viewMonth() {
  const settings = settingsRec().data;
  const [y, m] = S.period.split("-").map(Number);
  const label = new Date(y, m - 1, 1).toLocaleString("en-IN", { month: "long", year: "numeric" });
  html(`
    <div class="row"><button id="prev" aria-label="Previous month">←</button><h1 style="margin:0">${esc(label)}${settings.period_mode === "pay_cycle" ? ` <span class="muted" style="font-size:14px">cycle from day ${settings.cycle_day}</span>` : ""}</h1><button id="next" aria-label="Next month">→</button></div>
    <div id="summary" style="margin-top:12px"></div>
    <div class="card"><h2>Transactions</h2><div class="acct-bar" id="acctbar" role="group" aria-label="Account"></div><div id="txgrid"></div>${SHORTCUTS}</div>
    <div id="cats"></div>`);
  $("#prev").onclick = () => { S.period = E.shiftPeriod(S.period, -1); render(); };
  $("#next").onclick = () => { S.period = E.shiftPeriod(S.period, 1); render(); };
  monthSummary();
  mountTxGrid();
}

function accountBar() {
  const sel = selectedAccount(), d = db();
  const txns = d.transaction.filter((t) => t.period === S.period);
  const accts = store.ofType("account").filter((a) => a.data.role !== "long_term" && a.data.role !== "receivable");
  $("#acctbar").innerHTML = accts.map((a) => {
    const n = txns.filter((t) => t.account_id === a.id || t.to_account_id === a.id).length;
    return `<button type="button" data-acct="${a.id}" class="${a.id === sel ? "on" : ""}" aria-pressed="${a.id === sel}">${esc(a.data.name)}<small>${n || ""}</small></button>`;
  }).join("") || '<span class="muted">Add an account on the Accounts tab first.</span>';
  $$("[data-acct]").forEach((b) => (b.onclick = () => {
    S.account = b.dataset.acct; try { localStorage.setItem("account", S.account); } catch (e) { /* ignore */ }
    accountBar(); mountTxGrid();
  }));
}

function mountTxGrid() {
  accountBar();
  const sel = selectedAccount(), host = $("#txgrid");
  if (!sel) { host.innerHTML = ""; return; }
  const settings = settingsRec().data, d = db();
  const incoming = (t) => t.direction === "transfer" && t.to_account_id === sel && t.account_id !== sel;
  const rows = d.transaction.filter((t) => t.period === S.period && (t.account_id === sel || t.to_account_id === sel))
    .sort((a, b) => (a.date || "").localeCompare(b.date || ""))
    .map(({ period, ...t }) => t);
  const name = (id) => (store.rows.get(id)?.data?.name) || "";
  const grid = mountGrid(host, {
    label: `Transactions for ${name(sel)}`,
    rows, blankRows: 10, period: () => S.period, suggest,
    newRow: () => ({ date: today().slice(0, 7) === S.period ? today() : S.period + "-01", account_id: sel, direction: "out", to_account_id: "", category: "Other", nature: "variable" }),
    meaningful: (x) => !!(String(x.description || "").trim() || (x.amount !== null && x.amount !== undefined && x.amount !== "")),
    columns: [
      { key: "date", label: "Date", type: "date", width: 96 },
      { key: "description", label: "Description", type: "text", width: 210, autocomplete: true },
      { key: "direction", label: "Type", type: "select", width: 96, options: () => [["out", "Spent"], ["in", "Received"], ["transfer", "Transfer"]],
        readonlyIf: incoming, display: (x) => (incoming(x) ? "Transfer in" : null) },
      { key: "to_account_id", label: "To / from", type: "select", width: 140, options: () => [["", ""], ...accountOptions().filter(([v]) => v !== sel)],
        readonlyIf: incoming, display: (x) => (incoming(x) ? "from " + name(x.account_id) : x.direction === "transfer" ? null : "") },
      { key: "category", label: "Category", type: "select", width: 116, options: () => opts(E.CATEGORIES) },
      { key: "nature", label: "Kind", type: "select", width: 124, options: () => NATURE_LABELS },
      { key: "amount", label: "Amount", type: "number", width: 112 },
    ],
    async save(id, x) {
      const data = { ...x };
      if (data.direction === "in" && data.nature === "variable") data.nature = "income";
      if (data.direction !== "in" && /^income/.test(data.nature || "")) data.nature = "variable";
      if (data.direction !== "transfer") data.to_account_id = "";
      data.period = E.periodOf(data.date, settings);
      const newId = await saveRec("transaction")(id, data);
      saves++;
      if (data.nature !== x.nature || data.to_account_id !== x.to_account_id) grid.refreshRow(newId, data);
      return newId;
    },
    remove: removeRec,
    onChange: () => { monthSummary(); accountBar(); },
  });
  S.grid = grid;
}

function monthSummary() {
  const d = db(), s = E.summarize(d, S.period), v = s.verdict;
  const r = E.runway(d, S.period);
  const pending = s.commitments.filter((c) => !c.paid);
  const verdict = v.kind === "ahead"
    ? `<span class="big good">${inr(v.amount)} ahead</span>Income covers this month's spending. ${s.commitments_pending ? `After ${inr(s.commitments_pending)} of commitments still due, you can spend up to <strong>${inr(Math.max(0, s.headroom))}</strong> more without touching savings.` : `You can spend up to <strong>${inr(v.amount)}</strong> more without touching savings.`}`
    : `<span class="big bad">${inr(v.amount)} from savings</span>This month spends more than comes in.${s.commitments_pending ? ` Another ${inr(s.commitments_pending)} of commitments is still due.` : ""}`;
  $("#summary").innerHTML = `
    <div class="card verdict">${verdict}
      ${r.months != null && r.savings > 0 ? `<p class="muted">At your 3-month average burn of ${inr(r.burn)}, liquid savings of ${inr(r.savings)} last about ${r.months} months.</p>` : ""}</div>
    <div class="grid">
      ${[["Opening", s.opening], ["Regular income", s.regular_inflow], ["Monthly spending", s.monthly_expense], ["Annual items", s.annual_expense],
        ["Investments", s.investments], ["One-off income", s.oneoff_inflow], ["Closing", s.closing]].map(([l, n]) => `<div class="card metric"><div class="label">${l}</div><div class="value">${inr(n)}</div></div>`).join("")}
    </div>
    ${pending.length ? `<div class="card"><h2>Still to pay this month</h2>${pending.map((c) => `<div class="row" style="padding:4px 0"><span>${esc(c.label)}</span><span class="spacer"></span><span class="num">${inr(c.amount)}</span><button data-pay="${c.id}">Mark paid</button></div>`).join("")}</div>` : ""}`;
  $("#cats").innerHTML = Object.keys(s.by_category).length ? `<div class="card"><h2>Spending by category</h2>${Object.entries(s.by_category).sort((a, b) => b[1] - a[1]).map(([k, n]) => `<div class="row"><span>${esc(k)}</span><span class="spacer"></span><span class="num">${inr(n)}</span></div>`).join("")}</div>` : "";
  $$("[data-pay]").forEach((b) => (b.onclick = async () => {
    const c = store.rows.get(b.dataset.pay).data;
    const acct = c.account_id || (mainAccount() || {}).id;
    await store.save({ type: "transaction", period: S.period, data: { date: S.period + "-" + String(Math.min(c.day || 1, 28)).padStart(2, "0"), period: S.period, description: c.label, account_id: acct, direction: "out", category: c.category || "Other", nature: "recurring", amount: +c.amount, recurring_id: b.dataset.pay } });
    saves++; monthSummary(); mountTxGrid();
  }));
}

// ================= Plan =================
function viewPlan() {
  const year = +S.period.slice(0, 4);
  html(`
    <div class="card"><h2>Monthly commitments</h2><p class="muted">Rent, help, tuition, family transfers. They show as "still to pay" each month until marked paid.</p><div id="g-cm"></div></div>
    <div class="card"><h2>Annual items for ${year}</h2><p class="muted">School fees, insurance, taxes.</p><div id="g-an"></div><div id="annsum"></div></div>
    <div class="card"><h2>Regular income</h2><div id="g-in"></div></div>
    <div class="card"><h2>Coming up (next 3 months)</h2><div id="upcoming"></div></div>`);
  const common = { blankRows: 3, remove: removeRec, period: () => S.period, onChange: planSummary };
  mountGrid($("#g-cm"), { ...common, label: "Monthly commitments", rows: rowsOf("commitment"), save: saveRec("commitment"),
    newRow: () => ({ category: "Household" }), meaningful: (x) => !!String(x.label || "").trim(),
    columns: [{ key: "label", label: "What", type: "text", width: 240 }, { key: "category", label: "Category", type: "select", width: 130, options: () => opts(E.CATEGORIES) },
      { key: "day", label: "Day", type: "number", width: 60 }, { key: "amount", label: "Amount", type: "number", width: 120 }] });
  mountGrid($("#g-an"), { ...common, label: "Annual items", rows: rowsOf("annual", (x) => +x.year === year), save: saveRec("annual"),
    newRow: () => ({ year, mode: "card" }), meaningful: (x) => !!String(x.label || "").trim(),
    columns: [{ key: "label", label: "What", type: "text", width: 220 }, { key: "due_month", label: "Due month", type: "number", width: 84 },
      { key: "mode", label: "Paid by", type: "select", width: 110, options: () => [["card", "Card"], ["cash", "Bank / cash"]] },
      { key: "total", label: "Total", type: "number", width: 110 },
      { key: "_status", label: "Paid / unpaid", type: "readonly", width: 170, render: (row) => {
        const a = E.annualStatus(db(), year).find((x) => x.id === row.id); if (!a) return "";
        return `${inr(a.paid)} / <span class="${a.unpaid ? "bad" : "good"}">${inr(a.unpaid)}</span>`; } }] });
  mountGrid($("#g-in"), { ...common, label: "Regular income", rows: rowsOf("income"), save: saveRec("income"),
    newRow: () => ({ kind: "other" }), meaningful: (x) => !!String(x.label || "").trim(),
    columns: [{ key: "label", label: "Source", type: "text", width: 220 }, { key: "kind", label: "Kind", type: "select", width: 110, options: () => [["salary", "Salary"], ["rent", "Rent"], ["interest", "Interest"], ["other", "Other"]] },
      { key: "day", label: "Usual day", type: "number", width: 84 }, { key: "amount", label: "Amount", type: "number", width: 120 }] });
  planSummary();
}

function planSummary() {
  const d = db(), year = +S.period.slice(0, 4), annual = E.annualStatus(d, year), up = E.upcoming(d, S.period, 3);
  $("#annsum").innerHTML = `
    ${annual.some((a) => a.unpaid) ? `<h3 style="margin-top:16px">Record a payment</h3><div class="row"><select id="ap" style="width:auto">${annual.filter((a) => a.unpaid).map((a) => `<option value="${a.id}">${esc(a.label)} (${inr(a.unpaid)} left)</option>`).join("")}</select>
      <input id="apamt" type="number" placeholder="Amount" style="width:140px"><select id="apacc" style="width:auto">${accountOptions().map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join("")}</select><button id="apgo">Add payment</button></div>` : ""}
    <p class="muted">Set aside each month for the rest of the year: <strong>${inr(annual.reduce((x, a) => x + a.unpaid, 0) / Math.max(1, 13 - (+S.period.slice(5))))}</strong></p>`;
  $("#upcoming").innerHTML = up.length ? up.map((u) => `<div class="row"><span class="muted" style="width:80px">${u.period}</span><span>${esc(u.label)}</span><span class="muted">${u.kind}</span><span class="spacer"></span><span class="num">${inr(u.amount)}</span></div>`).join("") : '<p class="muted">Nothing due.</p>';
  if ($("#apgo")) $("#apgo").onclick = async () => {
    const a = store.rows.get($("#ap").value).data, amt = +$("#apamt").value;
    if (!amt) return alert("Enter an amount.");
    const p = E.periodOf(today(), settingsRec().data);
    await store.save({ type: "transaction", period: p, data: { date: today(), period: p, description: a.label, account_id: $("#apacc").value, direction: "out", category: "Other", nature: "annual", amount: amt, annual_id: $("#ap").value } });
    saves++; render();
  };
}

// ================= Accounts =================
function viewAccounts() {
  html(`<div class="card"><h2>Accounts</h2>
    <p class="muted">Spending accounts make up your monthly opening and closing balance. Cards collect spending until you pay the bill (a transfer from a spending account). Savings and investments count towards runway.</p>
    <div id="g-ac"></div></div>`);
  mountGrid($("#g-ac"), { label: "Accounts", blankRows: 3, rows: rowsOf("account"), save: saveRec("account"), period: () => S.period,
    newRow: () => ({ role: "spending", kind: "bank", opening_period: S.period }), meaningful: (x) => !!String(x.name || "").trim(),
    async remove(id) {
      if (store.ofType("transaction").some((t) => t.data.account_id === id || t.data.to_account_id === id)) throw new Error("This account has transactions. Delete or move them first.");
      await store.remove(id);
    },
    columns: [{ key: "name", label: "Name", type: "text", width: 200 },
      { key: "role", label: "Role", type: "select", width: 170, options: () => [["spending", "Spending"], ["card", "Credit card"], ["savings", "Savings"], ["investment", "Investment"], ["long_term", "Long-term (PPF, property)"], ["receivable", "Money lent"]] },
      { key: "opening_balance", label: "Opening balance", type: "number", width: 130 },
      { key: "opening_period", label: "From (YYYY-MM)", type: "text", width: 120 },
      { key: "balance", label: "Current balance (savings)", type: "number", width: 170 }] });
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
    <div class="card"><h2>Look</h2>${themePicker(s.data.theme || "paper", s.data.custom_theme)}
      <p><button id="customize">${s.data.custom_theme ? "Edit my theme" : "Create my own theme"}</button></p><div id="themeed"></div></div>
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
  wireThemePicker(async (t) => { await store.save({ id: s.id, type: "settings", data: { ...settingsRec().data, theme: t } }); }, s.data.custom_theme);
  $("#customize").onclick = () => themeEditor();
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

// ================= custom theme editor =================
function themeEditor() {
  const s = settingsRec();
  const start = s.data.custom_theme || { base: s.data.theme && s.data.theme !== "custom" ? s.data.theme : "excel", font: "office", radius: 4, vars: {} };
  const draft = JSON.parse(JSON.stringify(start));
  const current = (k) => draft.vars[k] || resolveColor(k);
  $("#themeed").innerHTML = `
    <h3>My theme</h3>
    <div class="theme-editor">
      <label>Start from <select id="te-base">${Object.entries(THEMES).map(([k, [n]]) => `<option value="${k}" ${k === draft.base ? "selected" : ""}>${n}</option>`).join("")}</select></label>
      <label>Font <select id="te-font">${Object.entries(FONTS).map(([k, [n]]) => `<option value="${k}" ${k === draft.font ? "selected" : ""}>${n}</option>`).join("")}</select></label>
      <label>Corner roundness <input id="te-radius" type="range" min="0" max="16" step="1" value="${draft.radius ?? 6}"></label>
      ${THEME_VARS.map(([k, l]) => `<label>${l} <input type="color" data-var="${k}" value="${current(k)}"></label>`).join("")}
    </div>
    <p class="row"><button class="primary" id="te-save">Save my theme</button><button id="te-reset">Reset colours to "${esc(THEMES[draft.base][0])}"</button><button id="te-cancel">Cancel</button></p>`;
  const preview = () => applyTheme("custom", draft);
  preview();
  $("#te-base").onchange = () => { draft.base = $("#te-base").value; draft.vars = {}; applyTheme("custom", draft); themeEditorRefresh(draft); };
  $("#te-font").onchange = () => { draft.font = $("#te-font").value; preview(); };
  $("#te-radius").oninput = () => { draft.radius = +$("#te-radius").value; preview(); };
  $$("[data-var]").forEach((i) => (i.oninput = () => { draft.vars[i.dataset.var] = i.value; preview(); }));
  $("#te-reset").onclick = () => { draft.vars = {}; applyTheme("custom", draft); themeEditorRefresh(draft); };
  $("#te-cancel").onclick = () => { applyTheme(s.data.theme || "excel", s.data.custom_theme); render(); };
  $("#te-save").onclick = async () => {
    await store.save({ id: s.id, type: "settings", data: { ...settingsRec().data, theme: "custom", custom_theme: draft } });
    applyTheme("custom", draft); render();
  };
}
/** The colour a token currently resolves to, as #rrggbb (handles var() and color-mix()). */
function resolveColor(token) {
  const el = document.createElement("span");
  el.style.color = `var(${token})`; document.body.appendChild(el);
  const rgb = getComputedStyle(el).color; el.remove();
  const m = rgb.match(/[\d.]+/g) || [0, 0, 0];
  if (/^color\(srgb/.test(rgb)) return "#" + m.slice(0, 3).map((x) => Math.round(+x * 255).toString(16).padStart(2, "0")).join("");
  return "#" + m.slice(0, 3).map((x) => Math.round(+x).toString(16).padStart(2, "0")).join("");
}
function themeEditorRefresh(draft) {
  $$("[data-var]").forEach((i) => { i.value = draft.vars[i.dataset.var] || resolveColor(i.dataset.var); });
  $("#te-reset").textContent = `Reset colours to "${THEMES[draft.base][0]}"`;
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
