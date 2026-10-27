import * as C from "./crypto.js";
import * as E from "./engine.js";
import { api, device, store } from "./store.js";
import { readXlsx } from "./xlsx.js";
import * as I from "./importer.js";
import { mountGrid, isPhone } from "./grid.js";
import { buildSuggest } from "./cells.js";
import * as P from "./plan.js";
import * as N from "./insights.js";
import { stackedBars, lines, hbars, money } from "./charts.js";
import { catIcon } from "./icons.js";
import { setCurrency, currencyOptions, guessCurrency } from "./currency.js";
import { track, startTracking } from "./track.js";
import { viewAdmin } from "./admin.js";
import * as F from "./formula.js";

const root = document.getElementById("root");
const tabsEl = document.getElementById("tabs");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const inr = money;
const today = () => new Date().toISOString().slice(0, 10);
const html = (s) => { root.innerHTML = s; };
const $ = (sel) => root.querySelector(sel);
const $$ = (sel) => [...root.querySelectorAll(sel)];

const THEMES = {
  planned: ["PlannedOut", "#1c1e24", "#34d399"],
  excel: ["Excel", "#ffffff", "#217346"], paper: ["Paper", "#f7f6f2", "#2457c5"], sky: ["Sky", "#f3f7fc", "#1f6feb"],
  lavender: ["Lavender", "#f7f5fc", "#6b4fbb"], sand: ["Sand", "#faf6ee", "#a0612a"], rose: ["Rose", "#fdf6f7", "#b4325b"],
  mint: ["Mint", "#eef6f3", "#0f7a5c"], chai: ["Chai", "#f6efe4", "#9a4a12"], ink: ["Ink", "#ffffff", "#000000"], night: ["Night", "#121417", "#7aa7ff"],
  "metro-dark": ["Metro Dark", "#000000", "conic-gradient(#1ba1e2 0 90deg,#d80073 90deg 180deg,#fa6800 180deg 270deg,#60a917 270deg)"],
  "metro-light": ["Metro Light", "#ffffff", "conic-gradient(#1ba1e2 0 90deg,#d80073 90deg 180deg,#fa6800 180deg 270deg,#60a917 270deg)"],
  glass: ["Liquid Glass", "linear-gradient(135deg,#93c5fd,#e9d5ff,#fbcfe8)", "linear-gradient(135deg,rgba(255,255,255,.95),#007aff)"],
  "glass-dark": ["Glass Dark", "linear-gradient(135deg,#0f172a,#3b0764,#042f2e)", "linear-gradient(135deg,#e0f2fe,#38bdf8)"],
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
  startTracking(() => S.tab);
  track("app:open");
  try {
    await store.load();
    if (!store.vault) return setupVault();
    const remembered = await device.load(store.email);
    if (remembered) {
      try { await store.unlock(remembered); track("unlock:remembered"); return afterUnlock(); } catch { await device.forget(store.email); }
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
  const text = `PlannedOut recovery keys for ${store.email}\nCreated ${today()}\n\n` + keys.map((k, i) => `${i + 1}. ${k}`).join("\n") +
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
      track(recovery ? "unlock:recovery" : "unlock:passphrase");
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
  if (s.data.motion) applyMotion(s.data.motion);
  setCurrency(s.data.currency);
  S.tab = "month";
  S.period = E.periodOf(today(), s.data);
  renderTabs(); render();
  migrateCloses().catch(() => {});
}

// Existing users: months before this one count as closed with their cards billed as entered. Runs once.
async function migrateCloses() {
  const s = settingsRec();
  if (!s.data.closing_migrated) {
    const at = new Date().toISOString();
    const items = E.legacyCloses(db(), today(), at).map((data) => ({ type: "month_close", period: data.period, data }));
    await store.save([...items, { id: s.id, type: "settings", data: { ...s.data, closing_migrated: true } }]);
  }
  const cur = E.currentPeriod(db(), today());
  if (cur !== S.period) { S.period = cur; if (S.tab === "month") render(); }
}

// First-run setup: a short wizard. Theme, motion, cards etc. use defaults and live in Settings.
function onboarding() {
  const w = { step: 0, currency: guessCurrency(), fm: "salary", samt: "", sday: "", cycle: false, other: "", ob: "", sv: "" };
  const STEPS = ["Basics", "Income", "Money today"];
  const FUND = [["salary", "Salary", "A regular paycheque"], ["savings", "Savings", "Living off savings, no regular salary"], ["both", "Both", "Salary plus drawing on savings"]];
  const val = (id) => { const el = $("#" + id); return el ? el.value : ""; };
  const grab = () => {
    for (const k of ["samt", "sday", "other", "ob", "sv"]) if ($("#" + k)) w[k] = val(k);
    if ($("#cur")) w.currency = val("cur");
    if ($("#cycle")) w.cycle = $("#cycle").checked;
  };
  const body = () => {
    if (w.step === 0) return `<h1>Welcome! Let's set up your month</h1>
      <p class="muted">Three quick steps. Leave anything blank you're unsure of.</p>
      <label for="cur">Currency</label><select id="cur">${currencyOptions(w.currency)}</select>
      <label>How is your household funded?</label>
      <div class="ob-choices">${FUND.map(([k, t, d]) => `<button type="button" class="ob-choice ${w.fm === k ? "on" : ""}" data-fm="${k}" aria-pressed="${w.fm === k}"><strong>${t}</strong><span class="muted">${d}</span></button>`).join("")}</div>`;
    if (w.step === 1) return `<h1>Your income</h1>
      ${w.fm !== "savings" ? `<label for="samt">Monthly take-home salary</label><input id="samt" type="number" min="0" inputmode="decimal" placeholder="e.g. 85000" value="${esc(w.samt)}">
      <label for="sday">Salary usually arrives on day</label><input id="sday" type="number" min="1" max="31" inputmode="numeric" placeholder="e.g. 26" value="${esc(w.sday)}">
      <label><input type="checkbox" id="cycle" style="width:auto" ${w.cycle ? "checked" : ""}> Run my months from salary day to salary day</label>` : ""}
      <label for="other">Other regular monthly income (rent, interest), if any</label><input id="other" type="number" min="0" inputmode="decimal" placeholder="0" value="${esc(w.other)}">`;
    return `<h1>Your money today</h1>
      <label for="ob">Current balance of your main spending account</label><input id="ob" type="number" inputmode="decimal" placeholder="e.g. 150000" value="${esc(w.ob)}">
      <label for="sv">Liquid savings outside it (FDs, savings accounts, mutual funds), roughly</label><input id="sv" type="number" min="0" inputmode="decimal" placeholder="0" value="${esc(w.sv)}">
      <p class="muted">You can add more accounts and cards later.</p>`;
  };
  const draw = () => {
    html(`<div class="narrow card ob">
      <ol class="ob-steps" aria-label="Setup progress">${STEPS.map((s, i) => `<li class="${i < w.step ? "done" : i === w.step ? "on" : ""}" ${i === w.step ? 'aria-current="step"' : ""}>${s}</li>`).join("")}</ol>
      ${body()}
      <p class="ob-nav">${w.step ? `<button type="button" id="back">Back</button>` : "<span></span>"}
        <button class="primary" id="next">${w.step === STEPS.length - 1 ? "Finish" : "Next"}</button></p>
      <p class="error" id="err" role="alert"></p></div>`);
    $$("[data-fm]").forEach((b) => (b.onclick = () => { grab(); w.fm = b.dataset.fm; draw(); }));
    if ($("#back")) $("#back").onclick = () => { grab(); w.step--; draw(); };
    $("#next").onclick = next;
    root.querySelectorAll("input").forEach((i) => i.addEventListener("keydown", (e) => { if (e.key === "Enter") next(); }));
    (root.querySelector(".ob input, .ob select"))?.focus();
  };
  const next = async () => {
    grab();
    const sday = +w.sday;
    if (w.sday && (sday < 1 || sday > 31)) return showError(new Error("Salary day should be between 1 and 31."));
    if (w.step < STEPS.length - 1) { w.step++; track("onboard:step" + (w.step + 1)); return draw(); }
    try {
      $("#next").disabled = true;
      const fm = w.fm, salaried = fm !== "savings", day = salaried && sday ? sday : null;
      const settings = { funding_mode: fm, theme: document.documentElement.dataset.theme || "excel", closing_migrated: true, currency: w.currency,
        period_mode: salaried && w.cycle && day ? "pay_cycle" : "calendar", cycle_day: day };
      const period = E.periodOf(today(), settings);
      const items = [{ type: "settings", data: settings },
        { type: "account", data: { name: "Main account", kind: "bank", role: "spending", is_default_spending: true, opening_balance: +w.ob || 0, opening_period: period } }];
      if (+w.sv) items.push({ type: "account", data: { name: "Savings", kind: "bank", role: "savings", balance: +w.sv, liquid: true } });
      if (salaried && +w.samt) items.push({ type: "income", data: { label: "Salary", kind: "salary", amount: +w.samt, day } });
      if (+w.other) items.push({ type: "income", data: { label: "Other income", kind: "other", amount: +w.other } });
      await store.save(items);
      track("onboard:" + fm);
      done();
    } catch (e) { $("#next").disabled = false; showError(e); }
  };
  const done = () => {
    html(`<div class="narrow card ob">
      <h1>You're all set</h1>
      <p>Your month is ready. Start by adding a few expenses on the Month screen.</p>
      <p class="muted">Want to make it yours? In <strong>Settings</strong> you can pick a theme, screen motion and month style, and under <strong>Accounts</strong> add cards, loans and more accounts.</p>
      <p class="ob-nav"><button type="button" id="toset">Open Settings</button><button class="primary" id="tomonth">Go to my month</button></p></div>`);
    $("#tomonth").onclick = () => afterUnlock();
    $("#toset").onclick = () => { track("onboard:to-settings"); afterUnlock(); goTab("settings"); };
    $("#tomonth").focus();
  };
  draw();
}

// ================= tabs =================
const BASE_TABS = [["month", "Month"], ["year", "Year"], ["insights", "Insights"], ["plan", "Plan"], ["accounts", "Accounts"], ["savings", "Savings"], ["import", "Import"], ["settings", "Settings"]];
const tabList = () => (store.isAdmin ? [...BASE_TABS, ["admin", "Admin"]] : BASE_TABS);
// Phones: a bottom tab bar with the four main screens and "More" for the rest.
const PHONE_TABS = [["month", "Month", '<path d="M4 6h16v14H4zM4 10h16M9 3v4m6-4v4"/>'], ["year", "Year", '<path d="M5 20V10m5 10V4m5 16v-7m5 7V8"/>'],
  ["insights", "Insights", '<path d="M12 3a6 6 0 0 0-3.5 10.9V16h7v-2.1A6 6 0 0 0 12 3ZM9.5 19h5M10.5 21.5h3"/>'], ["savings", "Savings", '<path d="M4 19h16M6 15l4-4 3 3 5-6"/>'],
  ["more", "More", '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>']];
function renderBottomNav() {
  let nav = document.getElementById("bottomnav");
  if (!isPhone()) { if (nav) nav.remove(); return; }
  if (!nav) { nav = document.createElement("nav"); nav.id = "bottomnav"; nav.setAttribute("aria-label", "Main"); document.body.appendChild(nav); }
  const inMore = !["month", "year", "insights", "savings"].includes(S.tab);
  nav.innerHTML = PHONE_TABS.map(([k, l, d]) => `<button type="button" data-ptab="${k}" class="${(k === S.tab || (k === "more" && inMore)) ? "on" : ""}" aria-current="${k === S.tab ? "page" : "false"}">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg><span>${l}</span></button>`).join("");
  nav.querySelectorAll("[data-ptab]").forEach((b) => (b.onclick = () => {
    if (b.dataset.ptab === "more") return moreSheet();
    goTab(b.dataset.ptab);
  }));
}
function moreSheet() {
  const back = document.createElement("div");
  back.className = "ml-back";
  back.innerHTML = `<div class="ml-sheet" role="dialog" aria-modal="true" aria-label="More"><div class="ml-grab" aria-hidden="true"></div>
    ${[["plan", "Plan"], ["accounts", "Accounts"], ["import", "Import"], ["settings", "Settings"], ...(store.isAdmin ? [["admin", "Admin"]] : [])].map(([k, l]) => `<button type="button" class="more-item" data-go="${k}">${l}</button>`).join("")}
    <button type="button" class="more-item" data-go="signout">Sign out</button></div>`;
  document.body.appendChild(back); document.body.classList.add("ml-open");
  const close = () => { back.remove(); document.body.classList.remove("ml-open"); };
  back.addEventListener("click", (e) => { if (e.target === back) close(); });
  back.querySelectorAll("[data-go]").forEach((b) => (b.onclick = () => {
    close();
    if (b.dataset.go === "signout") return document.querySelector("header form").requestSubmit();
    goTab(b.dataset.go);
  }));
}
// Re-lay out when crossing the phone breakpoint (e.g. rotating a tablet).
window.matchMedia("(max-width: 640px)").addEventListener("change", () => { if (store.key && settingsRec()) { renderTabs(); render(); } });

function renderTabs() {
  renderBottomNav();
  tabsEl.hidden = false;
  tabsEl.innerHTML = tabList().map(([k, l]) => `<button data-tab="${k}" class="${S.tab === k ? "on" : ""}">${l}</button>`).join("");
  tabsEl.querySelectorAll("button").forEach((b) => (b.onclick = () => goTab(b.dataset.tab, false)));
}
// ================= motion =================
// Screen transitions (fade / slide / none), saved per device and in settings.
const MOTIONS = [["fade", "Fade"], ["slide", "Slide"], ["zoom", "Zoom"], ["blur", "Blur"], ["cascade", "Cascade"], ["none", "None"]];
const motion = () => document.documentElement.dataset.motion || "fade";
function applyMotion(m) {
  if (!MOTIONS.some(([k]) => k === m)) return;
  document.documentElement.dataset.motion = m;
  try { localStorage.setItem("motion", m); } catch (e) { /* ignore */ }
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let switching = 0;
async function goTab(k, scroll = true) {
  if (k === S.tab) return;
  const order = tabList().map(([t]) => t), dir = order.indexOf(k) >= order.indexOf(S.tab) ? "m-fwd" : "m-back";
  const n = ++switching, animate = motion() !== "none";
  S.tab = k; renderTabs();
  if (animate) { root.classList.remove("m-in", "m-fwd", "m-back", "m-fresh"); root.classList.add("m-out", dir); await wait(120); }
  if (n !== switching) return; // a newer click won
  root.classList.remove("m-out");
  render();
  if (scroll) window.scrollTo({ top: 0 });
  if (!animate) return;
  void root.offsetWidth; // restart the animation
  root.classList.add("m-in", "m-fresh");
  stagger(root.querySelectorAll(".card"));
  root.querySelectorAll("[data-count]").forEach((el) => countUp(el, +el.dataset.count, inr));
  setTimeout(() => { if (n === switching) root.classList.remove("m-in", "m-fwd", "m-back"); }, 260);
  setTimeout(() => { if (n === switching) root.classList.remove("m-fresh"); }, 1500);
}
// Give cards an index so Cascade can stagger them.
function stagger(cards) { [...cards].slice(0, 12).forEach((c, i) => c.style.setProperty("--i", i)); }
// Month or year changed: the picker stays put, the cards around it animate in from the direction of travel.
function periodEnter(dir) {
  if (motion() === "none") return;
  const cards = [...root.querySelectorAll(".card")].filter((c) => !c.querySelector("#mpick, #prev, #py"));
  stagger(cards);
  cards.forEach((c) => { c.classList.remove("m-p-in", "m-fwd", "m-back"); void c.offsetWidth; c.classList.add("m-p-in", dir); });
  root.classList.add("m-fresh"); setTimeout(() => root.classList.remove("m-fresh"), 1500);
  setTimeout(() => cards.forEach((c) => c.classList.remove("m-p-in", "m-fwd", "m-back")), 900);
  root.querySelectorAll("[data-count]").forEach((el) => countUp(el, +el.dataset.count, inr, 450));
}
// Numbers count up from zero to their value (Month summary headline).
function countUp(el, value, fmt, ms = 600) {
  if (motion() === "none" || !el || !isFinite(value)) return;
  const t0 = performance.now(), suffix = el.dataset.suffix || "";
  const step = (t) => {
    const p = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - p, 3);
    el.textContent = fmt(value * e) + suffix;
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

let lastTracked = null;
function render() {
  if (S.tab !== lastTracked) { lastTracked = S.tab; if (S.tab !== "admin") track("tab:" + S.tab); }
  try { ({ month: viewMonth, year: viewYear, insights: viewInsights, plan: viewPlan, accounts: viewAccounts, savings: viewSavings, import: viewImport, settings: viewSettings, admin: () => viewAdmin(root) })[S.tab](); }
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
  list: (p, n) => suggest.get().list(p, n),
  infer: (d) => suggest.get().infer(d),
};
let saves = 0;

const SHORTCUTS = `<p class="xl-help">Type to replace a cell · <kbd>F2</kbd> edit · <kbd>Enter</kbd>/<kbd>Tab</kbd>/arrows move · <kbd>Enter</kbd> on ✕ deletes the row ·
  <kbd>Ctrl</kbd>+<kbd>Z</kbd> undo · <kbd>Ctrl</kbd>+<kbd>C</kbd>/<kbd>V</kbd> copy &amp; paste (from Excel too) · <kbd>Ctrl</kbd>+<kbd>D</kbd> fill down ·
  <kbd>Ctrl</kbd>+<kbd>;</kbd> today · <kbd>Del</kbd> clear · <kbd>Alt</kbd>+<kbd>↓</kbd> open list · amounts accept <kbd>=120+340</kbd></p>`;

// ================= account icons =================
// Generic line icons per account type (drawn here, no external images).
const ICONS = {
  bank: '<path d="M3 10h18L12 4 3 10Zm2 0v7m4-7v7m6-7v7m4-7v7M3 20h18"/>',
  card: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M3 10h18M7 15h4"/>',
  cash: '<rect x="3" y="7" width="18" height="10" rx="1.5"/><circle cx="12" cy="12" r="2.5"/><path d="M6 10v4m12-4v4"/>',
  savings: '<path d="M5 11a7 6 0 0 1 13-2h2v4l-2 1-1 3h-3v-2H9v2H6l-1-3a5 5 0 0 1 0-3Z"/><circle cx="15" cy="10.5" r=".6"/><path d="M10 6.5h3"/>',
  investment: '<path d="M4 19h16M6 15l4-4 3 3 5-6m0 0h-4m4 0v4"/>',
  long_term: '<rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 4v2"/>',
  receivable: '<path d="M4 12h12m0 0-4-4m4 4-4 4M20 5v14"/>',
};
// Banks recognised from the account name. Shown as a neutral text badge — we don't copy banks' logos or colours;
// people can upload their own image for any account.
const BANKS = [["HDFC", /hdfc/i], ["ICICI", /icici/i], ["AXIS", /axis/i], ["SBI", /\bsbi\b|state bank/i], ["KOTAK", /kotak/i],
  ["AMEX", /amex|american express/i], ["IDFC", /idfc/i], ["YES", /\byes\b/i], ["INDUS", /indusind/i], ["RBL", /\brbl\b/i], ["AU", /\bau\b/i],
  ["HSBC", /hsbc/i], ["CITI", /citi/i], ["SC", /standard chartered|\bsc\b/i], ["BOB", /baroda|\bbob\b/i], ["PNB", /\bpnb\b|punjab national/i],
  ["FED", /federal/i], ["CANARA", /canara/i], ["UNION", /union bank/i], ["ONE", /onecard/i]];
const bankCode = (name) => (BANKS.find(([, re]) => re.test(name || "")) || [null])[0];
function acctIcon(a) {
  const d = a.data || a;
  if (d.logo) return `<span class="acct-ico"><img src="${esc(d.logo)}" alt=""></span>`;
  const kind = d.role === "card" ? "card" : d.role === "spending" ? (d.kind === "cash" ? "cash" : "bank") : d.role || "bank";
  const svg = `<span class="acct-ico" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${ICONS[kind] || ICONS.bank}</svg></span>`;
  const code = (d.role === "card" || d.role === "spending" || d.role === "savings") && bankCode(d.name);
  return svg + (code ? `<span class="bank-badge" aria-hidden="true">${code}</span>` : "");
}

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

// Change month without the page jumping: keep the clicked control at the same spot on screen.
function goPeriod(p, anchor) {
  const id = anchor && anchor.id, top = anchor ? anchor.getBoundingClientRect().top : 0;
  root.style.minHeight = root.offsetHeight + "px"; // stop the page shrinking mid-render
  const dir = p >= S.period ? "m-fwd" : "m-back";
  S.period = p; render(); periodEnter(dir);
  const fix = () => { const el = (id && document.getElementById(id)) || document.getElementById("mpick"); if (el) window.scrollBy(0, el.getBoundingClientRect().top - top); };
  fix(); requestAnimationFrame(() => { fix(); root.style.minHeight = ""; fix(); });
}

function viewMonth() {
  const settings = settingsRec().data;
  const dd = db();
  const curPeriod = E.currentPeriod(dd, today());
  const [y, m] = S.period.split("-").map(Number);
  const label = new Date(y, m - 1, 1).toLocaleString("en-IN", { month: "long", year: "numeric" });
  html(`
    <div class="row month-nav"><button id="prev" aria-label="Previous month">←</button><div class="month-pick"><button id="mpick" class="month-title" aria-haspopup="true" aria-expanded="false"><h1 style="margin:0">${esc(label)}<sup id="mlock" class="mlock"></sup> <span class="caret" aria-hidden="true">▾</span></h1></button><div id="mmenu" class="month-menu" hidden>${Array.from({ length: 12 }, (_, i) => { const p = `${y}-${String(i + 1).padStart(2, "0")}`; const cl = E.closeOf(dd, p)?.closed; return `<button data-p="${p}" class="${p === S.period ? "on" : ""}${cl ? " closed" : ""}"${cl ? ' title="Closed"' : ""}>${new Date(y, i, 1).toLocaleString("en-IN", { month: "short" })}${cl ? LOCK : ""}</button>`; }).join("")}</div></div><span id="mclose" class="mclose"></span>${settings.period_mode === "pay_cycle" ? ` <span class="muted" style="font-size:14px">cycle from day ${settings.cycle_day}</span>` : ""}<button id="next" aria-label="Next month">→</button>${S.period !== curPeriod ? '<button id="today" class="link-btn">This month</button>' : ""}</div>
    <div id="summary" style="margin-top:12px"></div>
    <div class="card"><h2>Transactions</h2><div class="acct-bar" id="acctbar" role="group" aria-label="Account"></div><div id="acctsum" class="acct-sum" aria-live="polite"></div><div id="billbox"></div><div id="rollask"></div><div id="txgrid"></div>${SHORTCUTS}</div>
    <div id="cats"></div>`);
  $("#prev").onclick = (e) => goPeriod(E.shiftPeriod(S.period, -1), e.currentTarget);
  $("#next").onclick = (e) => goPeriod(E.shiftPeriod(S.period, 1), e.currentTarget);
  if ($("#today")) $("#today").onclick = (e) => goPeriod(curPeriod, e.currentTarget);
  const menu = $("#mmenu"), pick = $("#mpick");
  const closeMenu = () => { menu.hidden = true; pick.setAttribute("aria-expanded", "false"); document.removeEventListener("click", outside); document.removeEventListener("keydown", onKey); };
  const onKey = (e) => { if (e.key === "Escape") { closeMenu(); pick.focus(); } };
  const outside = (e) => { if (!e.target.closest(".month-pick")) closeMenu(); };
  pick.onclick = () => {
    if (!menu.hidden) return closeMenu();
    menu.hidden = false; pick.setAttribute("aria-expanded", "true"); document.addEventListener("click", outside); document.addEventListener("keydown", onKey);
  };
  menu.querySelectorAll("[data-p]").forEach((b) => (b.onclick = () => { closeMenu(); goPeriod(b.dataset.p, pick); }));
  monthCloseBar();
  monthSummary();
  mountTxGrid();
}

const barAccounts = (d) => store.ofType("account").filter((a) => a.data.role !== "long_term" && a.data.role !== "receivable" && E.accountVisible(d, { id: a.id, ...a.data }, S.period));

function accountBar() {
  const d = db();
  const accts = barAccounts(d);
  if (S.account && !accts.some((a) => a.id === S.account)) S.account = (accts.find((a) => a.data.is_default_spending) || accts[0] || {}).id || null;
  const sel = selectedAccount();
  const info = (a) => {
    const m = E.accountMonth(d, a.id, S.period);
    const n = m.spent + m.received + m.transfer_in + m.transfer_out;
    return { n, hint: a.data.role === "card" ? m.spent : a.data.role === "spending" ? m.closing : m.transfer_in };
  };
  // Group by kind so the bar reads as Bank accounts / Cards / Savings & investments.
  const status = E.monthStatus(d, S.period);
  const billOf = (a) => status.cards.find((c) => c.id === a.id && c.billed);
  const groups = [
    ["Bank accounts", accts.filter((a) => a.data.role === "spending")],
    ["Cards", accts.filter((a) => a.data.role === "card")],
    ["Savings & investments", accts.filter((a) => a.data.role !== "spending" && a.data.role !== "card")],
  ].filter(([, list]) => list.length);
  const chip = (a) => {
    const { n, hint } = info(a);
    const b = billOf(a);
    const mark = b ? `<span class="bill-mark${b.stale ? " stale" : ""}" title="${b.stale ? "Billed, but transactions changed since" : "Billed"}">${CHECK}</span>` : "";
    return `<button type="button" data-acct="${a.id}" class="${a.id === sel ? "on" : ""}${b ? " billed" : ""}" aria-pressed="${a.id === sel}" aria-label="${esc(a.data.name)}${b ? " (billed)" : ""}">${acctIcon(a)}${esc(a.data.name)}${n ? `<small>${money(hint)}</small>` : ""}${mark}</button>`;
  };
  const opt = (a) => {
    const { n, hint } = info(a);
    return `<option value="${a.id}"${a.id === sel ? " selected" : ""}>${esc(a.data.name)}${n ? ` · ${money(hint)}` : ""}</option>`;
  };
  $("#acctbar").innerHTML = groups.length
    ? groups.map(([label, list]) => `<div class="acct-group"><span class="acct-group-label">${label}</span><div class="acct-chips">${list.map(chip).join("")}</div></div>`).join("")
      + `<select class="acct-select" id="acctselect" aria-label="Account">${groups.map(([label, list]) => `<optgroup label="${label}">${list.map(opt).join("")}</optgroup>`).join("")}</select>`
    : '<span class="muted">Add an account on the Accounts tab first.</span>';
  const pick = (id) => {
    S.account = id; try { localStorage.setItem("account", S.account); } catch (e) { /* ignore */ }
    mountTxGrid();
  };
  $$("[data-acct]").forEach((b) => (b.onclick = () => pick(b.dataset.acct)));
  const selEl = $("#acctselect"); if (selEl) selEl.onchange = () => pick(selEl.value);
  accountSummary(d, sel);
  billBox(d, sel);
}

/** Totals for the selected account, shown above its grid. */
function accountSummary(d, sel) {
  const a = store.rows.get(sel); if (!a || !$("#acctsum")) return;
  const m = E.accountMonth(d, sel, S.period), role = a.data.role;
  const item = (k, v, cls = "") => `<span><span class="k">${k}</span><strong class="${cls}">${money(v)}</strong></span>`;
  let parts;
  if (role === "spending") parts = [item("Opening", m.opening), item("Money in", m.received + m.transfer_in, "good"), item("Spent", m.spent),
    item("Transfers out", m.transfer_out), ...(m.rolled ? [item("Card totals", m.rolled)] : []), item("Closing", m.closing, m.closing < 0 ? "bad" : "")];
  else if (role === "card") parts = [item("Spent this month", m.spent), ...(m.received ? [item("Refunds", m.received, "good")] : []), item("Paid", m.transfer_in, "good"), item("Outstanding", m.outstanding, m.outstanding > 0 ? "bad" : "")];
  else parts = [item("Added this month", m.transfer_in, "good"), item("Taken out", m.transfer_out + m.spent), ...(m.balance !== undefined ? [item("Balance", m.balance)] : [])];
  $("#acctsum").innerHTML = `<strong>${esc(a.data.name)}</strong>${parts.join("")}`;

  // Offer the card roll-up once, on the main account, when cards have unpaid spending this month.
  const ask = $("#rollask"); if (!ask) return;
  const settings = settingsRec().data, isMain = a.data.is_default_spending;
  const unpaid = isMain && settings.card_rollup === undefined
    ? E.cardRollups(E.index([...store.records().filter((r) => r.type !== "settings"), { id: "x", type: "settings", data: { ...settings, card_rollup: true } }]), S.period) : [];
  ask.innerHTML = unpaid.length ? `<div class="notice rollup-ask" style="margin-bottom:10px"><span>Your cards spent <strong>${money(unpaid.reduce((x, r) => x + r.amount, 0))}</strong> this month with no bill payment recorded. Count each card's monthly total against ${esc(a.data.name)}? It shows as a read-only row and reduces this account's balance. Months where you record the bill payment aren't counted twice.</span>
    <button class="primary" id="roll-yes">Yes, count card totals</button><button id="roll-no">No</button></div>` : "";
  const setRoll = async (v) => { await store.save({ id: settingsRec().id, type: "settings", data: { ...settingsRec().data, card_rollup: v } }); saves++; monthSummary(); mountTxGrid(); };
  if ($("#roll-yes")) { $("#roll-yes").onclick = () => setRoll(true); $("#roll-no").onclick = () => setRoll(false); }
}

// ================= card billing & month close =================
// Labels only: closing a month or billing a card never blocks edits.
const LOCK = '<svg class="ico-lock" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M7.5 11V7.5a4.5 4.5 0 0 1 9 0V11" fill="none" stroke="#475a66" stroke-width="2.8"/><rect x="4" y="10" width="16" height="12" rx="3" fill="#ffc107"/><circle cx="12" cy="15" r="2" fill="#475a66"/><path d="M11 16h2l.5 3.5h-3z" fill="#475a66"/></svg>';
const CHECK = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5 10 17 19 7"/></svg>';
const monthName = (p) => { const [y, m] = p.split("-").map(Number); return new Date(y, m - 1, 1).toLocaleString("en-IN", { month: "long", year: "numeric" }); };

/** Last date of a period (the day before the next period starts). */
function periodEnd(p) {
  const st = settingsRec().data;
  const [ny, nm] = E.shiftPeriod(p, 1).split("-").map(Number);
  const day = st.period_mode === "pay_cycle" && st.cycle_day ? +st.cycle_day : 1;
  return new Date(Date.UTC(ny, nm - 1, day) - 864e5).toISOString().slice(0, 10);
}

/** Change the month_close record of a period. */
async function saveClose(period, fn) {
  const r = store.ofType("month_close").find((x) => x.data.period === period);
  const data = { period, closed: false, ...(r ? r.data : {}) };
  data.cards = { ...(data.cards || {}) };
  fn(data);
  await store.save({ id: r ? r.id : undefined, type: "month_close", period, data });
  saves++;
}

const liveRow = (id) => { const r = id && store.rows.get(id); return r && !r.deleted ? r : null; };

/** Mark a card billed at the statement amount; any difference from the grid becomes an adjustment row under Other. */
async function markBilled(cardId, amount) {
  const period = S.period, c = E.monthStatus(db(), period).cards.find((x) => x.id === cardId);
  const adj = liveRow(c.adj_id);
  const adjEffect = adj && adj.data.period === period ? (adj.data.direction === "in" ? -1 : 1) * (+adj.data.amount || 0) : 0;
  const base = Math.round(c.computed - adjEffect), diff = Math.round(amount - base);
  let adjId = null;
  if (diff) {
    adjId = (await store.save({ id: adj ? adj.id : undefined, type: "transaction", period, data: {
      date: periodEnd(period), period, account_id: cardId, direction: diff > 0 ? "out" : "in", amount: Math.abs(diff), to_account_id: "",
      description: "Statement adjustment", category: "Other", nature: diff > 0 ? "variable" : "income_oneoff", statement_adj: true } }))[0];
  } else if (adj) await store.remove(adj.id);
  await saveClose(period, (d) => { d.cards[cardId] = { amount: Math.round(amount), computed: base, adj_id: adjId, at: new Date().toISOString() }; });
  track("bill:card");
}

async function unmarkBilled(cardId) {
  const c = E.monthStatus(db(), S.period).cards.find((x) => x.id === cardId);
  if (liveRow(c.adj_id)) await store.remove(c.adj_id);
  await saveClose(S.period, (d) => { delete d.cards[cardId]; d.closed = false; });
}

const refreshMonth = () => { monthSummary(); mountTxGrid(); monthCloseBar(); };

/** Billing strip above a card's grid. */
function billBox(d, sel) {
  const host = $("#billbox"); if (!host) return;
  const a = store.rows.get(sel);
  const c = a && a.data.role === "card" ? E.monthStatus(d, S.period).cards.find((x) => x.id === sel) : null;
  if (!c) { host.innerHTML = ""; return; }
  if (c.billed) {
    host.innerHTML = `<div class="bill-box billed"><span class="bill-tag">${CHECK} Billed</span>
      <span>Statement <strong class="num">${money(c.amount)}</strong>${liveRow(c.adj_id) ? ' <span class="muted">· includes a statement adjustment</span>' : ""}</span>
      ${c.stale ? `<span class="bad">Transactions now total ${money(c.computed)}</span><button type="button" id="bill-redo">Bill again</button>` : ""}
      <span class="spacer"></span><button type="button" class="link-btn" id="bill-undo">Unmark</button></div>`;
    if ($("#bill-redo")) $("#bill-redo").onclick = () => openBillForm(c);
    $("#bill-undo").onclick = async () => {
      if (liveRow(c.adj_id) && !confirm("Unmark this bill? Its statement adjustment row will be removed.")) return;
      try { await unmarkBilled(sel); refreshMonth(); } catch (err) { showError(err); }
    };
  } else {
    host.innerHTML = `<div class="bill-box"><span>This month's bill from your transactions: <strong class="num">${money(c.computed)}</strong></span><span class="spacer"></span>
      <button type="button" class="primary" id="bill-open">Mark billed</button></div>`;
    $("#bill-open").onclick = () => openBillForm(c);
  }
}

function openBillForm(c) {
  const host = $("#billbox");
  const adj = liveRow(c.adj_id);
  const base = c.computed - (adj && adj.data.period === S.period ? (adj.data.direction === "in" ? -1 : 1) * (+adj.data.amount || 0) : 0);
  host.innerHTML = `<form class="bill-box bill-form" id="bill-form">
    <span>Transactions total <strong class="num">${money(base)}</strong>${adj ? " (before adjustment)" : ""}.</span>
    <label for="bill-amt">Amount on your statement</label>
    <input id="bill-amt" type="text" inputmode="decimal" autocomplete="off" value="${c.billed ? c.amount : base}">
    <span id="bill-diff" class="muted"></span><span class="spacer"></span>
    <button class="primary" type="submit">Confirm</button><button type="button" id="bill-cancel">Cancel</button></form>`;
  const inp = $("#bill-amt"), diffEl = $("#bill-diff");
  const upd = () => { const v = Math.round(+inp.value.replace(/[,\s]/g, "") || 0) - base; diffEl.textContent = v ? `${v > 0 ? "+" : "−"}${money(Math.abs(v))} will be added as an adjustment under Other` : "Matches your transactions"; };
  inp.oninput = upd; upd(); inp.focus(); inp.select();
  $("#bill-cancel").onclick = () => billBox(db(), S.account);
  $("#bill-form").onsubmit = async (e) => {
    e.preventDefault();
    inp.value = inp.value.replace(/[,\s]/g, "");
    if (inp.value === "" || !Number.isFinite(+inp.value)) { inp.focus(); return; }
    try { await markBilled(c.id, +inp.value); refreshMonth(); } catch (err) { showError(err); }
  };
}

/** Close state next to the month title. */
function monthCloseBar() {
  const host = $("#mclose"), lock = $("#mlock"); if (!host) return;
  if (lock) lock.innerHTML = "";
  const st = E.monthStatus(db(), S.period);
  if (st.closed) {
    const tip = `Month closed${st.closed_at ? " on " + st.closed_at.slice(0, 10) : ""}. This is only a marker so you know what's in the past. You can still make changes.`;
    host.innerHTML = "";
    if (lock) lock.innerHTML = `<span class="close-tag" role="img" aria-label="${tip}" title="${tip}">${LOCK}</span>`;
  } else if (S.period > E.currentPeriod(db(), today())) {
    host.innerHTML = "";
  } else if (st.allBilled) {
    host.innerHTML = `<button type="button" id="mclose-btn" class="close-btn" title="Marks this month done. The next month becomes your current month.">${LOCK} Close month</button>`;
    $("#mclose-btn").onclick = async (e) => {
      const next = E.shiftPeriod(S.period, 1);
      if (!confirm(`Close ${monthName(S.period)} and move to ${monthName(next)}?\n\nYou can still edit or reopen it later.`)) return;
      try {
        await saveClose(S.period, (d) => { d.closed = true; d.closed_at = new Date().toISOString(); });
        track("close:month");
        goPeriod(next, e.currentTarget);
      } catch (err) { showError(err); }
    };
  } else {
    const billed = st.cards.filter((c) => c.billed).length, total = billed + st.pending.length;
    host.innerHTML = `<span class="close-hint" title="Mark every card billed to close this month">${billed} of ${total} cards billed</span>`;
  }
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
  const isMain = store.rows.get(sel)?.data?.is_default_spending;
  const rolled = isMain ? E.cardRollups(d, S.period).map((r) => ({ date: today().slice(0, 7) === S.period ? today() : `${S.period}-${String(new Date(+S.period.slice(0, 4), +S.period.slice(5), 0).getDate()).padStart(2, "0")}`, description: `${r.name} — card total for the month`, _card: true, to_account_id: r.card_id, amount: r.amount })) : [];
  const openAccts = () => accountOptions().filter(([v]) => { const a = store.rows.get(v)?.data || {}; return v !== sel && (!a.closed_from || S.period < a.closed_from); });
  const grid = mountGrid(host, {
    id: "tx", label: `Transactions for ${name(sel)}`, readonlyRows: rolled,
    rows, blankRows: 10, period: () => S.period, suggest,
    newRow: () => ({ date: E.periodForDate(db(), today(), S.period) === S.period ? today() : S.period + "-01", account_id: sel, direction: "out", to_account_id: "", category: "Other", nature: "variable" }),
    meaningful: (x) => !!(String(x.description || "").trim() || (x.amount !== null && x.amount !== undefined && x.amount !== "")),
    columns: [
      { key: "date", label: "Date", type: "date", width: 96 },
      { key: "description", label: "Description", type: "text", width: 210, autocomplete: true },
      { key: "direction", label: "Type", type: "select", width: 96, options: () => [["out", "Spent"], ["in", "Received"], ["transfer", "Transfer"]],
        readonlyIf: incoming, display: (x) => (x._card ? "Card total" : incoming(x) ? "Transfer in" : null) },
      { key: "to_account_id", label: "To / from", type: "select", width: 140, options: () => [["", ""], ...openAccts()],
        readonlyIf: incoming, display: (x) => (x._card ? name(x.to_account_id) : incoming(x) ? "from " + name(x.account_id) : x.direction === "transfer" ? (name(x.to_account_id) || "") : "") },
      { key: "category", label: "Category", type: "select", width: 130, options: () => opts(E.CATEGORIES), icon: catIcon, display: (x) => (x._card ? "" : null) },
      { key: "nature", label: "Kind", type: "select", width: 124, options: () => NATURE_LABELS, display: (x) => (x._card ? "" : null) },
      { key: "amount", label: "Amount", type: "number", width: 112 },
    ],
    async save(id, x) {
      const data = { ...x };
      if (data.direction === "in" && data.nature === "variable") data.nature = "income";
      if (data.direction !== "in" && /^income/.test(data.nature || "")) data.nature = "variable";
      if (data.direction !== "transfer") data.to_account_id = "";
      data.period = E.periodForDate(db(), data.date, S.period);
      if (data.period !== E.periodOf(data.date, settings)) data.early_close = true; else delete data.early_close;
      const newId = await saveRec("transaction")(id, data);
      saves++;
      if (data.nature !== x.nature || data.to_account_id !== x.to_account_id) grid.refreshRow(newId, data);
      return newId;
    },
    remove: removeRec,
    onChange: () => { monthSummary(); accountBar(); monthCloseBar(); },
  });
  S.grid = grid;
}

function monthSummary() {
  const d = db(), s = E.summarize(d, S.period), v = s.verdict;
  const r = E.runway(d, S.period);
  const pending = s.commitments.filter((c) => !c.paid);
  const verdict = v.kind === "ahead"
    ? `<span class="big good" data-count="${v.amount}" data-suffix=" ahead">${inr(v.amount)} ahead</span>Income covers this month's spending. ${s.commitments_pending ? `After ${inr(s.commitments_pending)} of commitments still due, you can spend up to <strong>${inr(Math.max(0, s.headroom))}</strong> more without touching savings.` : `You can spend up to <strong>${inr(v.amount)}</strong> more without touching savings.`}`
    : `<span class="big bad" data-count="${v.amount}" data-suffix=" from savings">${inr(v.amount)} from savings</span>This month spends more than comes in.${s.commitments_pending ? ` Another ${inr(s.commitments_pending)} of commitments is still due.` : ""}`;
  $("#summary").innerHTML = `
    <div class="card verdict">${verdict}
      ${r.months != null && r.savings > 0 ? `<p class="muted">At your 3-month average burn of ${inr(r.burn)}, your ${inr(r.savings)} in bank and savings lasts about ${r.months} months.</p>` : ""}</div>
    ${balanceFlow(s)}
    ${extraMetrics(s, r)}
    ${pending.length ? `<div class="card"><h2>Still to pay this month</h2>${pending.map((c) => `<div class="row" style="padding:4px 0"><span>${esc(c.label)}</span><span class="spacer"></span><span class="num">${inr(c.amount)}</span><button data-pay="${c.id}">Mark paid</button></div>`).join("")}</div>` : ""}`;
  cardCategoryChart(d);
  const saveMx = async (on) => { await saveMxLayout({ month_metrics: on }); monthSummary(); };
  const curMx = () => $$("[data-mx-hide]").map((b) => b.dataset.mxHide);
  $$("[data-mx-hide]").forEach((b) => (b.onclick = () => saveMx(curMx().filter((k) => k !== b.dataset.mxHide))));
  mxDrag($(".mx-grid"), (rows) => {
    track(`metric:${rows.length > 1 ? "rows" : "reorder"}`);
    saveMxLayout({ month_metric_rows: rows, month_metrics: rows.flat() }).catch((e) => alert(e.message));
  });
  $$("[data-mx-show]").forEach((b) => (b.onclick = () => saveMx([...curMx(), b.dataset.mxShow])));
  $$("[data-mx-edit]").forEach((b) => (b.onclick = () => customMetricSheet(customMetrics().find((m) => m.id === b.dataset.mxEdit), s, r)));
  $$("[data-mx-del]").forEach((b) => (b.onclick = async () => {
    const m = customMetrics().find((x) => x.id === b.dataset.mxDel);
    if (!m || !confirm(`Delete "${m.label}"? It will be removed from your list for good.`)) return;
    const on = curMx().filter((k) => k !== "c:" + m.id);
    try { await saveCustomMetrics(customMetrics().filter((x) => x.id !== m.id)); } catch (e) { showError(e); return; }
    saveMx(on);
  }));
  const mxNew = $("#mx-new");
  if (mxNew) mxNew.onclick = () => customMetricSheet(null, s, r);
  const mxAdd = $("#mx-add");
  if (mxAdd) mxAdd.onclick = (e) => {
    e.stopPropagation();
    const pop = $("#mx-pop"); pop.hidden = !pop.hidden; mxAdd.setAttribute("aria-expanded", String(!pop.hidden));
    if (!pop.hidden) document.addEventListener("click", function close(ev) {
      if (!pop.contains(ev.target) || ev.target.closest("[data-mx-edit], [data-mx-del], #mx-new")) { pop.hidden = true; mxAdd.setAttribute("aria-expanded", "false"); document.removeEventListener("click", close); }
    });
  };
  $$("[data-pay]").forEach((b) => (b.onclick = async () => {
    const c = store.rows.get(b.dataset.pay).data;
    const acct = c.account_id || (mainAccount() || {}).id;
    await store.save({ type: "transaction", period: S.period, data: { date: S.period + "-" + String(Math.min(c.day || 1, 28)).padStart(2, "0"), period: S.period, description: c.label, account_id: acct, direction: "out", category: c.category || "Other", nature: "recurring", amount: +c.amount, recurring_id: b.dataset.pay } });
    saves++; monthSummary(); mountTxGrid();
  }));
}

/** Opening balance → what came in and went out → closing balance. Always adds up exactly. */
function balanceFlow(s) {
  const steps = [
    ["Regular income", s.regular_inflow, "Salary, rent and other regular money in"],
    ["One-off income", s.oneoff_inflow, "Bonuses, refunds, gifts"],
    ["From savings", s.drawn_from_savings, "Moved in from savings or investment accounts"],
    ["Regular expense", -s.regular_expense, "Day-to-day and monthly fixed spending"],
    ["One-off expense", -s.oneoff_expense, "Spending that won't repeat"],
    ["Annual items", -s.annual_expense, "Insurance, school fees, taxes"],
    ["Investments", -s.investments, "Moved to savings or investments — not spending"],
    ["Card timing & other", s.other_movement, "Card spending not yet paid, card bills for earlier months, and money on other accounts"],
  ].filter(([, n]) => n);
  const sign = (n) => (n > 0 ? "+" : "−");
  const net = s.closing - s.opening;
  return `<div class="card flow"><h2>How your balance moved</h2>
    <div class="flow-row">
      <div class="flow-end"><div class="label">Opening</div><div class="value">${inr(s.opening)}</div></div>
      <div class="flow-steps">${steps.map(([l, n, hint]) => `<div class="flow-step ${n > 0 ? "in" : "out"}" title="${esc(hint)}"><span class="label">${l}</span><span class="value">${sign(n)} ${inr(Math.abs(n))}</span></div>`).join("") || '<p class="muted">No money moved this month.</p>'}</div>
      <div class="flow-end"><div class="label">Closing</div><div class="value ${s.closing < 0 ? "bad" : ""}">${inr(s.closing)}</div><div class="sub ${net < 0 ? "bad" : "good"}">${sign(net || 1)} ${inr(Math.abs(net))} this month</div></div>
    </div></div>`;
}

/** Numbers that sit outside the balance math. The user picks which ones show. */
// [key, label, value(s, r) → number|null, hint, better: 1 = higher is better, -1 = lower is better, 0 = no trend, fmt?]
const months = (n) => `${n} months`;
const MONTH_METRICS = [
  ["regular_expense", "Regular expense", (s) => s.regular_expense, "Spending without one-offs, annual items or investments", -1],
  ["regular_net", "Regular income − regular expense", (s) => s.regular_net, "What a normal month leaves over (or takes from savings)", 1],
  ["total_spend", "All spending", (s) => s.monthly_expense + s.annual_expense, "Regular + one-off + annual items", -1],
  ["oneoff_net", "One-off income − one-off expense", (s) => s.oneoff_inflow - s.oneoff_expense, "", 1],
  ["pending", "Commitments still due", (s) => s.commitments_pending, "Monthly commitments not yet marked paid", 0],
  ["card_payments", "Card bills paid", (s) => s.card_payments, "Payments from the bank to credit cards", 0],
  ["burn", "3-month average burn", (s, r) => r.burn, "Spending incl. annual items minus regular income", -1],
  ["runway", "Runway", (s, r) => r.months, "How long bank balance + liquid savings last at the 3-month average burn", 1, months],
];
// Values a custom formula can use: [variable, label, value(s, r)].
const FORMULA_VARS = [
  ["regular_income", "Regular income", (s) => s.regular_inflow],
  ["oneoff_income", "One-off income", (s) => s.oneoff_inflow],
  ["from_savings", "From savings", (s) => s.drawn_from_savings],
  ["regular_expense", "Regular expense", (s) => s.regular_expense],
  ["oneoff_expense", "One-off expense", (s) => s.oneoff_expense],
  ["annual_items", "Annual items", (s) => s.annual_expense],
  ["investments", "Investments", (s) => s.investments],
  ["all_spending", "All spending", (s) => s.monthly_expense + s.annual_expense],
  ["regular_net", "Regular income − regular expense", (s) => s.regular_net],
  ["commitments_due", "Commitments still due", (s) => s.commitments_pending],
  ["card_bills_paid", "Card bills paid", (s) => s.card_payments],
  ["opening", "Opening balance", (s) => s.opening],
  ["closing", "Closing balance", (s) => s.closing],
  ["burn", "3-month average burn", (s, r) => r.burn],
  ["savings", "Bank + liquid savings", (s, r) => r.savings],
  ["runway", "Runway (months)", (s, r) => r.months],
];
const FORMULA_VAR_NAMES = FORMULA_VARS.map(([k]) => k);
const formulaVars = (s, r) => Object.fromEntries(FORMULA_VARS.map(([k, , f]) => [k, f(s, r)]));
const METRIC_FORMATS = {
  money: ["Amount", inr],
  percent: ["Percent", (n) => `${n}%`],
  number: ["Plain number", (n) => n.toLocaleString("en-IN")],
  months: ["Months", months],
};

/** The user's own formulas, kept in their (encrypted) settings record so they follow the account. */
const customMetrics = () => (settingsRec()?.data.custom_metrics || []);
async function saveCustomMetrics(list) {
  const rec = settingsRec();
  await store.save({ id: rec.id, type: "settings", data: { ...rec.data, custom_metrics: list } });
  saves++;
}
/** Built-in and custom metrics in one shape: [key, label, value, hint, better, fmt, custom?]. */
function allMetrics() {
  return [...MONTH_METRICS, ...customMetrics().map((m) => [
    "c:" + m.id, m.label, (s, r) => F.evaluate(m.formula, formulaVars(s, r)), m.formula, +m.better || 0, (METRIC_FORMATS[m.format] || METRIC_FORMATS.money)[1], m,
  ])];
}
const fmtValue = (fmt, n) => (n == null ? "–" : fmt(fmt === inr ? Math.round(n) : Math.round(n * 10) / 10));

/** Add or edit a custom number. */
function customMetricSheet(m, s, r) {
  const isNew = !m;
  m = m || { label: "", formula: "", format: "money", better: 0 };
  const vars = formulaVars(s, r);
  const FUNCS = [["pct(a, b)", "pct(", "a as a percent of b"], ["avg(a, b, …)", "avg(", "Average"], ["min(a, b)", "min(", "Smaller of"], ["max(a, b)", "max(", "Larger of"], ["abs(a)", "abs(", "Ignore the sign"], ["round(a, 1)", "round(", "Round to decimals"]];
  const back = document.createElement("div");
  back.className = "ml-back mx-sheet-back";
  back.innerHTML = `<form class="ml-sheet mx-sheet" role="dialog" aria-modal="true" aria-label="${isNew ? "Create" : "Edit"} custom number">
    <div class="ml-grab" aria-hidden="true"></div><h3>${isNew ? "Create a custom number" : "Edit custom number"}</h3>
    <div class="ml-field"><label class="ml-lbl" for="cm-label">Name</label><input id="cm-label" value="${esc(m.label)}" placeholder="e.g. Savings rate" autocomplete="off"></div>
    <div class="ml-field"><label class="ml-lbl" for="cm-formula">Formula</label><textarea id="cm-formula" rows="2" spellcheck="false" placeholder="e.g. pct(regular_net, regular_income)">${esc(m.formula)}</textarea>
      <div class="mx-preview" id="cm-preview" aria-live="polite"></div></div>
    <div class="mx-chips"><span class="ml-lbl">Numbers (tap to insert)</span>${FORMULA_VARS.map(([k, l]) => `<button type="button" class="mx-chip" data-ins="${k}" title="${k} · this month ${vars[k] == null ? "–" : esc(inr(Math.round(vars[k])))}">${esc(l)}</button>`).join("")}</div>
    <div class="mx-chips"><span class="ml-lbl">Maths</span>${[["+", "+"], ["−", "-"], ["×", "*"], ["÷", "/"], ["(", "("], [")", ")"]].map(([l, ins]) => `<button type="button" class="mx-chip op" data-ins="${ins}">${l}</button>`).join("")}${FUNCS.map(([l, ins, t]) => `<button type="button" class="mx-chip op" data-ins="${ins}" title="${t}">${l}</button>`).join("")}</div>
    <div class="row mx-opts">
      <div class="ml-field"><label class="ml-lbl" for="cm-format">Show as</label><select id="cm-format">${Object.entries(METRIC_FORMATS).map(([k, [l]]) => `<option value="${k}" ${m.format === k ? "selected" : ""}>${l}</option>`).join("")}</select></div>
      <div class="ml-field"><label class="ml-lbl" for="cm-better">Compared with year average</label><select id="cm-better">${[[1, "Higher is better"], [-1, "Lower is better"], [0, "No trend arrow"]].map(([v, l]) => `<option value="${v}" ${(+m.better || 0) === v ? "selected" : ""}>${l}</option>`).join("")}</select></div>
    </div>
    <p class="error ml-err" role="alert"></p>
    <div class="ml-actions"><span class="spacer"></span><button type="button" class="ml-cancel">Cancel</button><button type="submit" class="primary">${isNew ? "Create and show" : "Save"}</button></div></form>`;
  document.body.appendChild(back);
  document.body.classList.add("ml-open");
  const form = back.querySelector("form"), $f = (sel) => form.querySelector(sel), fx = $f("#cm-formula"), err = $f(".ml-err");
  const close = () => { back.remove(); document.body.classList.remove("ml-open"); };
  back.addEventListener("click", (e) => { if (e.target === back) close(); });
  form.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
  $f(".ml-cancel").onclick = close;
  const preview = () => {
    const out = $f("#cm-preview");
    if (!fx.value.trim()) { out.textContent = ""; return; }
    try {
      F.parse(fx.value, FORMULA_VAR_NAMES);
      const v = F.evaluate(fx.value, vars);
      out.className = "mx-preview"; out.textContent = `This month: ${v == null ? "– (no data yet)" : fmtValue(METRIC_FORMATS[$f("#cm-format").value][1], v)}`;
    } catch (e) { out.className = "mx-preview bad"; out.textContent = e.message; }
  };
  fx.addEventListener("input", preview);
  $f("#cm-format").addEventListener("change", preview);
  form.querySelectorAll("[data-ins]").forEach((b) => (b.onclick = () => {
    const ins = b.dataset.ins, a = fx.selectionStart ?? fx.value.length, z = fx.selectionEnd ?? a;
    const before = fx.value.slice(0, a), pad = before && !/[\s(]$/.test(before) ? " " : "";
    const text = pad + ins + (/^[a-z_]+$/.test(ins) || "+-*/".includes(ins) ? " " : "");
    fx.value = before + text + fx.value.slice(z);
    fx.focus(); fx.selectionStart = fx.selectionEnd = a + text.length; preview();
  }));
  preview();
  form.onsubmit = async (e) => {
    e.preventDefault();
    const label = $f("#cm-label").value.trim();
    if (!label) { err.textContent = "Give it a name."; return; }
    try { F.parse(fx.value, FORMULA_VAR_NAMES); } catch (e2) { err.textContent = e2.message; return; }
    const next = { id: m.id || crypto.randomUUID().slice(0, 8), label, formula: fx.value.trim(), format: $f("#cm-format").value, better: +$f("#cm-better").value };
    const on = $$("[data-mx-hide]").map((b) => b.dataset.mxHide);
    try {
      const list = customMetrics();
      await saveCustomMetrics(isNew ? [...list, next] : list.map((x) => (x.id === next.id ? next : x)));
    } catch (e2) { err.textContent = e2.message; return; }
    close();
    track(isNew ? "metric:custom_create" : "metric:custom_edit");
    if (isNew) await saveMxLayout({ month_metrics: [...on, "c:" + next.id] }).catch(() => {});
    monthSummary();
  };
  $f("#cm-label").focus();
}

/** Average of each shown metric over the other months of this year (up to the current month) that have data. */
function yearAverages(metrics) {
  const d = db(), year = S.period.slice(0, 4);
  const ps = [...new Set(d.transaction.map((t) => t.period))].filter((p) => p.startsWith(year) && p < S.period);
  const out = {};
  if (!ps.length || !metrics.length) return out;
  const rows = ps.map((p) => [E.summarize(d, p), E.runway(d, p)]);
  for (const [k, , f] of metrics) {
    const vals = rows.map(([s, r]) => f(s, r)).filter((v) => v != null && isFinite(v));
    if (vals.length) out[k] = vals.reduce((a, b) => a + b, 0) / vals.length;
  }
  return out;
}
const PENCIL = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
const BIN = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>';
const MX_PER_ROW = 5;
/** Which "Other numbers" are shown and how they're arranged live in the settings record; older layouts saved in this browser are still read. */
function mxSetting(key, legacyKey) {
  const v = settingsRec().data[key];
  if (Array.isArray(v)) return v;
  try { const old = JSON.parse(localStorage.getItem(legacyKey)); if (Array.isArray(old)) return old; } catch (e) { /* ignore */ }
  return null;
}
async function saveMxLayout(patch) {
  const rec = settingsRec();
  await store.save({ id: rec.id, type: "settings", data: { ...rec.data, ...patch } });
  saves++;
}
/** Split the shown metric keys into the rows the user arranged; new keys fill the last row. */
function mxRows(keys) {
  let saved = [];
  const v = mxSetting("month_metric_rows", "monthMetricRows"); if (v) saved = v;
  const left = new Set(keys), rows = [];
  for (const r of saved) {
    const row = (Array.isArray(r) ? r : []).filter((k) => left.has(k) && left.delete(k)).slice(0, MX_PER_ROW);
    if (row.length) rows.push(row);
  }
  for (const k of keys) {
    if (!left.has(k)) continue;
    if (!rows.length || rows[rows.length - 1].length >= MX_PER_ROW) rows.push([]);
    rows[rows.length - 1].push(k);
  }
  return rows;
}
function extraMetrics(s, r) {
  let on = ["regular_expense", "regular_net", "pending"];
  const v = mxSetting("month_metrics", "monthMetrics"); if (v) on = v;
  const all = allMetrics();
  const shown = on.map((k) => all.find(([x]) => x === k)).filter(Boolean);
  const hidden = all.filter(([k, , , , , , c]) => !c && !on.includes(k));
  const customs = all.filter(([, , , , , , c]) => c);
  const avg = yearAverages(shown);
  const tileHtml = shown.map(([k, l, f, hint, better, fmt = inr]) => {
    // An average already smooths months out, so comparing it to the year average adds noise.
    const isAvg = /\b(average|avg)\b/i.test(l) || /\bavg\s*\(/i.test(hint || "");
    const v = f(s, r), a = isAvg ? null : avg[k];
    let arrow = "";
    if (better && v != null && a != null && Math.round(v) !== Math.round(a)) {
      const good = (v > a) === (better > 0);
      arrow = `<span class="mx-trend ${good ? "good" : "bad"}" title="${good ? "Better" : "Worse"} than this year's average">${v > a ? "▲" : "▼"}</span>`;
    }
    const avgHtml = a != null ? `<div class="mx-avg"><span>${S.period.slice(0, 4)} avg</span>${fmtValue(fmt, a)}</div>` : "";
    return `<div class="card metric mx-tile" data-mx-key="${esc(k)}" ${hint ? `title="${esc(hint)}"` : ""}><button class="mx-x" data-mx-hide="${esc(k)}" type="button" aria-label="Hide ${esc(l)}">×</button><div class="label">${esc(l)}</div><div class="value">${fmtValue(fmt, v)}${arrow}</div>${avgHtml}</div>`;
  });
  const customRows = customs.map(([k, l, , hint, , , c]) => {
    const isOn = on.includes(k);
    return `<div class="mx-crow"><button type="button" class="mx-opt" ${isOn ? "disabled" : `data-mx-show="${esc(k)}"`}><span>${esc(l)}${isOn ? ' <em class="mx-on">shown</em>' : ""}</span><small class="mx-code">${esc(hint)}</small></button>`
      + `<button type="button" class="mx-ico" data-mx-edit="${esc(c.id)}" aria-label="Edit ${esc(l)}" title="Edit">${PENCIL}</button>`
      + `<button type="button" class="mx-ico del" data-mx-del="${esc(c.id)}" aria-label="Delete ${esc(l)}" title="Delete">${BIN}</button></div>`;
  }).join("");
  const add = `<div class="mx-add-wrap"><button class="mx-add" id="mx-add" type="button" aria-expanded="false">+ Add a number</button>
    <div class="mx-pop" id="mx-pop" hidden>${hidden.map(([k, l, , hint]) => `<button type="button" class="mx-opt" data-mx-show="${k}"><span>${l}</span>${hint ? `<small>${esc(hint)}</small>` : ""}</button>`).join("")}
      ${customs.length ? `<div class="mx-sec">Your numbers</div>${customRows}` : ""}
      <button type="button" class="mx-opt mx-new" id="mx-new"><span>+ Create a custom number</span><small>Your own formula on these numbers: a percent, average, difference…</small></button></div></div>`;
  const rows = mxRows(shown.map(([k]) => k)), byKey = Object.fromEntries(shown.map(([k], i) => [k, tileHtml[i]]));
  if (rows.length && rows[rows.length - 1].length < MX_PER_ROW) rows[rows.length - 1].push(null); else rows.push([null]);
  return `<h2 class="mx-head">Other numbers</h2><div class="mx-grid">${rows.map((r) => `<div class="mx-row">${r.map((k) => (k ? byKey[k] : add)).join("")}</div>`).join("")}<div class="mx-row mx-newrow">Drop here for a new row</div></div>`;
}

/** Drag tiles to reorder them or move them between rows (mouse and touch). "Add a number" stays last.
 *  The tile floats under the pointer (kept inside the grid), a placeholder marks where it will land,
 *  and the other tiles slide and resize into place (FLIP animation). */
function mxDrag(grid, onSave) {
  if (!grid) return;
  const newRow = grid.querySelector(".mx-newrow"), addBox = grid.querySelector(".mx-add-wrap");
  const ANIM = "transform 180ms cubic-bezier(.2,.8,.2,1)";
  const realRows = () => [...grid.querySelectorAll(".mx-row:not(.mx-newrow)")];
  const items = () => [...grid.querySelectorAll(".mx-row > *")];
  // Drop empty rows and keep "Add a number" at the end of the last row (or alone on a new row if that one is full).
  const tidy = () => {
    realRows().forEach((r) => { if (!r.querySelector(".mx-tile, .mx-add-wrap, .mx-ph") || (r.children.length === 1 && r.contains(addBox))) r.remove(); });
    const rows = realRows(), last = rows[rows.length - 1];
    if (last && last.querySelectorAll(".mx-tile, .mx-ph").length < MX_PER_ROW) last.appendChild(addBox);
    else { const r = document.createElement("div"); r.className = "mx-row"; r.appendChild(addBox); grid.insertBefore(r, newRow); }
  };
  // Run a DOM change and animate every tile from where it was to where it ends up.
  const flip = (change) => {
    const first = new Map(items().map((el) => [el, el.getBoundingClientRect()]));
    change();
    const moved = [];
    for (const el of items()) {
      const a = first.get(el); if (!a) continue;
      el.style.transition = "none"; el.style.transform = "";
      const b = el.getBoundingClientRect();
      if (!b.width || !b.height) continue;
      const dx = a.left - b.left, dy = a.top - b.top, sx = a.width / b.width, sy = a.height / b.height;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && Math.abs(sx - 1) < 0.01 && Math.abs(sy - 1) < 0.01) continue;
      el.style.transformOrigin = "0 0";
      el.style.transform = `translate(${dx}px,${dy}px) scale(${sx},${sy})`;
      moved.push(el);
    }
    if (!moved.length) return;
    void grid.offsetWidth; // commit the starting positions before animating to the new ones
    for (const el of moved) { el.style.transition = ANIM; el.style.transform = ""; }
  };
  grid.querySelectorAll(".mx-tile").forEach((tile) => tile.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || e.target.closest("button")) return;
    const x0 = e.clientX, y0 = e.clientY;
    let dragging = false, ph = null, offX = 0, offY = 0, px = x0, py = y0, raf = 0, w = 0, h = 0;
    const start = () => {
      dragging = true;
      const r = tile.getBoundingClientRect();
      offX = x0 - r.left; offY = y0 - r.top; w = r.width; h = r.height;
      ph = document.createElement("div"); ph.className = "mx-ph"; ph.style.minHeight = h + "px";
      flip(() => { tile.replaceWith(ph); grid.classList.add("mx-sorting"); });
      tile.classList.add("dragging");
      Object.assign(tile.style, { position: "fixed", left: "0", top: "0", width: w + "px", height: h + "px", margin: "0", zIndex: "50",
        pointerEvents: "none", transition: "none", transformOrigin: "50% 50%", transform: `translate3d(${r.left}px,${r.top}px,0)` });
      grid.appendChild(tile);
      try { tile.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    };
    // Where the floating tile sits, clamped so it never leaves the grid.
    const pos = () => {
      const g = grid.getBoundingClientRect();
      return {
        x: Math.min(Math.max(px - offX, g.left), Math.max(g.left, g.right - w)),
        y: Math.min(Math.max(py - offY, g.top), Math.max(g.top, g.bottom - h)),
      };
    };
    const place = (cx, cy) => {
      let row = null, best = Infinity;
      for (const r of grid.querySelectorAll(".mx-row")) {
        const b = r.getBoundingClientRect();
        const d = cy < b.top - 11 ? b.top - 11 - cy : cy > b.bottom + 11 ? cy - b.bottom - 11 : 0;
        if (d < best) { best = d; row = r; }
      }
      if (!row) return;
      if (row === newRow) {
        const cur = ph.parentNode;
        if (!cur.querySelector(".mx-tile") && cur.nextElementSibling === newRow) return; // already alone in the last row
        flip(() => { const r = document.createElement("div"); r.className = "mx-row"; grid.insertBefore(r, newRow); r.appendChild(ph); tidy(); });
        return;
      }
      const others = [...row.querySelectorAll(".mx-tile")];
      if (ph.parentNode !== row && others.length >= MX_PER_ROW) return; // row is full
      // Equal slots across the row keep the target stable while tiles resize, so nothing jitters.
      const slots = others.length + 1 + (row.contains(addBox) ? 1 : 0);
      const b = row.getBoundingClientRect();
      const idx = Math.max(0, Math.min(others.length, Math.floor(((cx - b.left) / b.width) * slots)));
      const before = others[idx] || (row.contains(addBox) ? addBox : null);
      if (ph.parentNode === row && ph.nextElementSibling === before) return;
      flip(() => { row.insertBefore(ph, before); tidy(); });
    };
    const frame = () => {
      raf = 0;
      const { x, y } = pos();
      tile.style.transform = `translate3d(${x}px,${y}px,0) scale(1.03)`;
      place(x + w / 2, y + h / 2);
    };
    const move = (ev) => {
      px = ev.clientX; py = ev.clientY;
      if (!dragging) { if (Math.hypot(px - x0, py - y0) < 6) return; start(); }
      ev.preventDefault();
      if (!raf) raf = requestAnimationFrame(frame);
    };
    const up = () => {
      tile.removeEventListener("pointermove", move); tile.removeEventListener("pointerup", up); tile.removeEventListener("pointercancel", up);
      if (!dragging) return;
      if (raf) cancelAnimationFrame(raf);
      const t = ph.getBoundingClientRect();
      tile.style.transition = "transform 160ms ease-out";
      tile.style.transform = `translate3d(${t.left}px,${t.top}px,0)`;
      let done = false;
      const finish = () => {
        if (done) return; done = true;
        tile.removeAttribute("style"); tile.classList.remove("dragging");
        flip(() => { ph.replaceWith(tile); grid.classList.remove("mx-sorting"); tidy(); });
        onSave([...grid.querySelectorAll(".mx-row")].map((r) => [...r.querySelectorAll(".mx-tile")].map((x) => x.dataset.mxKey)).filter((r) => r.length));
      };
      tile.addEventListener("transitionend", finish, { once: true });
      setTimeout(finish, 220);
    };
    tile.addEventListener("pointermove", move); tile.addEventListener("pointerup", up); tile.addEventListener("pointercancel", up);
  }));
}

/** Card spending this month by category — only transactions on credit-card accounts. */
function cardCategoryChart(d) {
  const host = $("#cats"); if (!host) return;
  const cards = new Set(d.account.filter((a) => a.role === "card").map((a) => a.id));
  const by = {}, count = {};
  for (const t of d.transaction) {
    if (t.period !== S.period || !cards.has(t.account_id) || t.direction === "transfer") continue;
    const c = t.nature === "annual" ? "Annual" : t.category || "Other";
    by[c] = (by[c] || 0) + (t.direction === "in" ? -1 : 1) * (+t.amount || 0); // refunds reduce their category
    count[c] = (count[c] || 0) + 1;
  }
  const items = Object.entries(by).filter(([, v]) => Math.round(v) !== 0).sort((a, b) => b[1] - a[1])
    .map(([label, value]) => ({ label: label === "Annual" ? "Annual items" : label, value: Math.round(value), icon: catIcon(label), count: count[label] }));
  const total = items.reduce((x, i) => x + i.value, 0);
  const [y, m] = S.period.split("-").map(Number);
  const month = new Date(y, m - 1, 1).toLocaleString("en-IN", { month: "long" });
  if (!cards.size) { host.innerHTML = ""; return; }
  host.innerHTML = `<div class="card"><h2>Card spending by category · ${month}</h2>
    <p class="muted">Breakdown of <strong>credit card spending only</strong> (${cards.size} card${cards.size > 1 ? "s" : ""}): ${money(total)} this month. Cash and bank payments such as rent, family transfers and household help aren't included. Refunds reduce their category.</p>
    <div id="catchart"></div></div>`;
  if (items.length) hbars($("#catchart"), { items, title: `Card spending by category, ${month}` });
  else $("#catchart").innerHTML = '<p class="muted">No card spending recorded this month.</p>';
}

// ================= Plan =================
function viewPlan() {
  const year = +S.period.slice(0, 4);
  const reg = P.averageRegularExpense(db(), S.period, 6);
  const fixedTotal = store.ofType("commitment").reduce((x, c) => x + (+c.data.amount || 0), 0);
  html(`
    ${reg.avg != null ? `<div class="kpis">
      <div class="metric"><div class="label">Regular expense</div><div class="value">${money(reg.avg)}</div><div class="sub">average of last ${reg.rows.length} months</div></div>
      <div class="metric"><div class="label">Fixed commitments</div><div class="value">${money(fixedTotal)}</div><div class="sub">planned below</div></div>
      <div class="metric"><div class="label">Day to day</div><div class="value">${money(Math.max(0, reg.avg - fixedTotal))}</div><div class="sub">regular expense − commitments</div></div>
    </div>` : ""}
    <div class="card"><h2>Monthly commitments</h2><p class="muted">Rent, help, tuition, family transfers. They show as "still to pay" each month until marked paid.</p><div id="g-cm"></div></div>
    <div class="card"><h2>Annual items for ${year}</h2><p class="muted">School fees, insurance, taxes.</p><div id="g-an"></div><div id="annsum"></div></div>
    <div class="card"><h2>Regular income</h2><div id="g-in"></div></div>
    <div class="card"><h2>Coming up (next 3 months)</h2><div id="upcoming"></div></div>`);
  const common = { blankRows: 3, remove: removeRec, period: () => S.period, onChange: planSummary };
  mountGrid($("#g-cm"), { ...common, id: "cm", label: "Monthly commitments", rows: rowsOf("commitment"), save: saveRec("commitment"),
    newRow: () => ({ category: "Household" }), meaningful: (x) => !!String(x.label || "").trim(),
    columns: [{ key: "label", label: "What", type: "text", width: 240 }, { key: "category", label: "Category", type: "select", width: 140, options: () => opts(E.CATEGORIES), icon: catIcon },
      { key: "day", label: "Day", type: "number", width: 60 }, { key: "amount", label: "Amount", type: "number", width: 120 }] });
  mountGrid($("#g-an"), { ...common, id: "an", label: "Annual items", rows: rowsOf("annual", (x) => +x.year === year), save: saveRec("annual"),
    newRow: () => ({ year, mode: "card" }), meaningful: (x) => !!String(x.label || "").trim(),
    columns: [{ key: "label", label: "What", type: "text", width: 220 }, { key: "due_month", label: "Due month", type: "number", width: 84 },
      { key: "mode", label: "Paid by", type: "select", width: 110, options: () => [["card", "Card"], ["cash", "Bank / cash"]] },
      { key: "total", label: "Total", type: "number", width: 110 },
      { key: "_status", label: "Paid / unpaid", type: "readonly", width: 170, render: (row) => {
        const a = E.annualStatus(db(), year).find((x) => x.id === row.id); if (!a) return "";
        return `${inr(a.paid)} / <span class="${a.unpaid ? "bad" : "good"}">${inr(a.unpaid)}</span>`; } }] });
  mountGrid($("#g-in"), { ...common, id: "in", label: "Regular income", rows: rowsOf("income"), save: saveRec("income"),
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
    <p class="muted">To retire an account, enter the month it closed in "Closed from". It then only appears in months where it has transactions.</p>
    <div id="g-ac"></div></div>
    <div class="card"><h2>Account icons</h2><p class="muted">Each account gets an icon for its type, and a name badge when we recognise the bank. You can upload your own image instead, such as your card's logo. It's encrypted with the rest of your data.</p>
    <div id="logos" class="logo-list"></div></div>`);
  mountGrid($("#g-ac"), { id: "ac", label: "Accounts", onChange: logoList, blankRows: 3, rows: rowsOf("account"), save: saveRec("account"), period: () => S.period,
    newRow: () => ({ role: "spending", kind: "bank", opening_period: S.period }), meaningful: (x) => !!String(x.name || "").trim(),
    async remove(id) {
      if (store.ofType("transaction").some((t) => t.data.account_id === id || t.data.to_account_id === id)) throw new Error("This account has transactions. Delete or move them first.");
      await store.remove(id);
    },
    columns: [{ key: "name", label: "Name", type: "text", width: 200 },
      { key: "role", label: "Role", type: "select", width: 170, options: () => [["spending", "Spending"], ["card", "Credit card"], ["savings", "Savings"], ["investment", "Investment"], ["long_term", "Long-term (PPF, property)"], ["receivable", "Money lent"]] },
      { key: "opening_balance", label: "Opening balance", type: "number", width: 130 },
      { key: "opening_period", label: "From (YYYY-MM)", type: "text", width: 120 },
      { key: "balance", label: "Current balance (savings)", type: "number", width: 170 },
      { key: "closed_from", label: "Closed from (YYYY-MM)", type: "text", width: 150 }] });
  logoList();
}

// ================= Year =================
function viewYear() {
  const year = S.year || +S.period.slice(0, 4);
  const d = db(), yv = P.yearView(d, year), ms = yv.months, t = yv.totals;
  const v = (m, k) => (m.hasData ? m[k] : null);
  const ROWS = [
    ["Opening balance", "opening"], ["Regular income", "regular_inflow"], ["Additional inflow", "oneoff_inflow"],
    ["Monthly spending", "monthly_expense"], ["Regular expense", "regular_expense", "sub", "Monthly spending without one-offs"], ["One-off expense", "oneoff_expense", "sub"],
    ["Annual items", "annual_expense"],
    ["Net monthly burn", "net_burn", "em", "Monthly spending − regular income"],
    ["Total out (burn + annual)", "total_out", "em", "What the month took from savings before investments and extra inflows"],
    ["Invested", "investments"], ["Closing balance", "closing"],
  ];
  const totalCol = (k) => (["opening", "closing"].includes(k) ? "" : money(t[k]));
  html(`
    <div class="row"><button id="py" aria-label="Previous year">←</button><h1 style="margin:0">${year}</h1><button id="ny" aria-label="Next year">→</button>
      <span class="muted">${yv.months_with_data} month${yv.months_with_data === 1 ? "" : "s"} with data</span></div>
    <div class="kpis" style="margin-top:12px">
      <div class="metric"><div class="label">Average regular expense</div><div class="value">${money(yv.avg_regular_expense)}</div><div class="sub">per month, no one-offs or annual items</div></div>
      <div class="metric"><div class="label">Average net burn</div><div class="value">${money(yv.avg_net_burn)}</div><div class="sub">per month, before annual items</div></div>
      <div class="metric"><div class="label">Annual items</div><div class="value">${money(t.annual_expense)}</div><div class="sub">paid this year</div></div>
      <div class="metric"><div class="label">Total out</div><div class="value">${money(t.total_out)}</div><div class="sub">burn + annual items</div></div>
      <div class="metric"><div class="label">Additional inflow</div><div class="value">${money(t.oneoff_inflow)}</div><div class="sub">one-off money in</div></div>
      <div class="metric"><div class="label">Invested</div><div class="value">${money(t.investments)}</div><div class="sub">not counted as spending</div></div>
    </div>
    <div class="card"><h2>Spending and money in, by month</h2>
      <p class="muted">Two charts, each with its own scale so neither is flattened by the other. Months line up vertically.</p>
      <h3 class="chart-h">Spending</h3><div id="ychart"></div>
      <h3 class="chart-h">Money in</h3><div id="ichart"></div>
      <h3 class="chart-h">Net monthly burn</h3><div id="bchart"></div></div>
    <div class="card"><h2>Year at a glance</h2><p class="muted">Click a month to open it. Notes save as you type.</p>
      <div class="yt-wrap"><table class="yt"><thead><tr><th class="rowh"></th>${ms.map((m) => `<th><a href="#" data-goto="${m.period}">${m.label}</a></th>`).join("")}<th>${year}</th></tr></thead><tbody>
      ${ROWS.map(([label, k, cls, hint]) => `<tr class="${cls || ""}"><th class="rowh" ${hint ? `title="${esc(hint)}"` : ""}>${label}</th>${ms.map((m) => {
        const x = v(m, k); return `<td class="${x == null ? "nodata" : x < 0 && (k === "net_burn" || k === "total_out") ? "neg" : ""}">${x == null ? "–" : money(x)}</td>`; }).join("")}<td>${totalCol(k)}</td></tr>`).join("")}
      <tr><th class="rowh">Notes</th>${ms.map((m) => `<td class="note"><textarea data-note="${m.period}" aria-label="Note for ${m.label}">${esc(m.note)}</textarea></td>`).join("")}<td></td></tr>
      </tbody></table></div></div>`);
  $("#py").onclick = () => { S.year = year - 1; render(); periodEnter("m-back"); };
  $("#ny").onclick = () => { S.year = year + 1; render(); periodEnter("m-fwd"); };
  $$("[data-goto]").forEach((a) => (a.onclick = (e) => { e.preventDefault(); S.period = a.dataset.goto; S.tab = "month"; renderTabs(); render(); }));
  const timers = {};
  $$("[data-note]").forEach((ta) => (ta.oninput = () => {
    clearTimeout(timers[ta.dataset.note]);
    timers[ta.dataset.note] = setTimeout(async () => {
      const period = ta.dataset.note, existing = store.ofType("note").find((n) => n.data.period === period);
      const text = ta.value.trim();
      if (!text && existing) await store.remove(existing.id);
      else if (text) await store.save({ id: existing ? existing.id : undefined, type: "note", period, data: { period, text } });
    }, 600);
  }));
  stackedBars($("#ychart"), {
    title: `Regular expense, one-offs and annual items, ${year}`,
    labels: ms.map((m) => m.label.slice(0, 3)),
    stacks: [{ name: "Regular expense", color: "var(--series-1)", values: ms.map((m) => v(m, "regular_expense")) },
             { name: "One-off expense", color: "var(--series-4)", values: ms.map((m) => v(m, "oneoff_expense")) },
             { name: "Annual items", color: "var(--series-2)", values: ms.map((m) => v(m, "annual_expense")) }],
  });
  stackedBars($("#ichart"), {
    title: `Regular income and additional inflow, ${year}`, height: 190,
    labels: ms.map((m) => m.label.slice(0, 3)),
    stacks: [{ name: "Regular income", color: "var(--series-3)", values: ms.map((m) => v(m, "regular_inflow")) },
             { name: "Additional inflow", color: "var(--series-4)", values: ms.map((m) => v(m, "oneoff_inflow")) }],
  });
  // Net burn bars + running average. Months after the last one with data are projected:
  // a straight-line trend of the actual burns fills them in, and the average carries on (dashed).
  const burn = ms.map((m) => v(m, "net_burn"));
  const last = burn.reduce((a, x, i) => (x != null ? i : a), -1);
  const pts = burn.map((x, i) => [i, x]).filter(([, x]) => x != null);
  const n = pts.length, mx = pts.reduce((a, [i]) => a + i, 0) / (n || 1), my = pts.reduce((a, [, y]) => a + y, 0) / (n || 1);
  const den = pts.reduce((a, [i]) => a + (i - mx) ** 2, 0);
  const slope = den ? pts.reduce((a, [i, y]) => a + (i - mx) * (y - my), 0) / den : 0;
  let sum = 0, cnt = 0;
  const avg = burn.map((x, i) => {
    if (last < 0) return null;
    const val = i <= last ? x : my + slope * (i - mx);
    if (val == null) return cnt ? sum / cnt : null;
    sum += val; cnt++; return sum / cnt;
  });
  stackedBars($("#bchart"), {
    title: `Net monthly burn and running average, ${year}`, height: 220,
    labels: ms.map((m) => m.label.slice(0, 3)),
    stacks: [{ name: "Net monthly burn", color: "var(--series-2)", negColor: "var(--series-3)", values: burn }],
    line: { name: "Running average", color: "var(--series-1)", values: avg, projectFrom: last + 1 },
  });
}

function logoList() {
  const host = $("#logos"); if (!host) return;
  host.innerHTML = store.ofType("account").map((a) => `<div class="row"><span class="row" style="gap:6px;color:var(--text)">${acctIcon(a)} ${esc(a.data.name)}</span><span class="spacer"></span>
    <label class="link" style="margin:0;cursor:pointer;color:var(--accent)">Upload image<input type="file" accept="image/*" data-logo="${a.id}" hidden></label>
    ${a.data.logo ? `<button class="link" data-nologo="${a.id}">Remove</button>` : ""}</div>`).join("") || '<p class="muted">No accounts yet.</p>';
  host.querySelectorAll("[data-logo]").forEach((inp) => (inp.onchange = async () => {
    const file = inp.files[0]; if (!file) return;
    try {
      const img = await createImageBitmap(file);
      const c = document.createElement("canvas"); c.width = c.height = 64;
      const k = Math.min(64 / img.width, 64 / img.height), w = img.width * k, h = img.height * k;
      c.getContext("2d").drawImage(img, (64 - w) / 2, (64 - h) / 2, w, h);
      const a = store.rows.get(inp.dataset.logo);
      await store.save({ id: a.id, type: "account", data: { ...a.data, logo: c.toDataURL("image/png") } });
      logoList();
    } catch (e) { alert("That image couldn't be read. Try a PNG or JPG."); }
  }));
  host.querySelectorAll("[data-nologo]").forEach((b) => (b.onclick = async () => {
    const a = store.rows.get(b.dataset.nologo); const { logo, ...rest } = a.data;
    await store.save({ id: a.id, type: "account", data: rest }); logoList();
  }));
}

// ================= Insights =================
function viewInsights() {
  const d = db();
  const last = N.latestPeriod(d);
  if (!last) { html('<div class="card"><h1>Insights</h1><p class="muted">Add or import a few months of transactions and insights will appear here.</p></div>'); return; }
  const now = E.periodOf(today(), settingsRec().data);
  const end = last < now ? last : now;
  const win = S.insWin || 12;
  const ps = N.windowPeriods(d, end, win);
  const split = N.natureSplit(d, ps), trends = N.categoryTrends(d, end), merchants = N.topMerchants(d, ps, 8);
  const year = +end.slice(0, 4), annual = N.annualCalendar(d, year, end), commits = N.commitmentsYearly(d, end);
  const heads = N.headlines({ split, trends, merchants, annual });
  const COLORS = { fixed: "var(--series-1)", flexible: "var(--series-3)", annual: "var(--series-2)", oneoff: "var(--series-4)" };
  const fromLabel = P.periodLabel(ps[0]), toLabel = P.periodLabel(end);
  const arrow = (t) => (t.change === null ? "–" : `${t.diff > 0 ? "▲" : t.diff < 0 ? "▼" : ""} ${money(Math.abs(t.diff))}${t.before >= 2000 ? ` (${t.change > 0 ? "+" : ""}${t.change}%)` : ""}`);
  html(`
    <div class="row"><h1 style="margin:0">Insights</h1><span class="spacer"></span>
      <div class="seg" role="group" aria-label="Period">${[3, 6, 12].map((n) => `<button type="button" data-win="${n}" class="${n === win ? "on" : ""}" aria-pressed="${n === win}">${n} months</button>`).join("")}</div></div>
    <p class="muted">${fromLabel} to ${toLabel} · ${ps.length} month${ps.length > 1 ? "s" : ""}. Calculated on this device from your own data — nothing is sent anywhere.</p>
    ${heads.length ? `<div class="ins-heads">${heads.map((h) => `<div class="ins-head ${h.tone}"><strong>${esc(h.title)}</strong><span>${esc(h.body)}</span></div>`).join("")}</div>` : ""}
    <div id="ins-regular"></div><div id="ins-runway"></div><div id="ins-rate"></div>

    <div class="card"><h2>Where your money goes</h2>
      <p class="muted">${money(split.total)} spent over ${ps.length} months, about ${money(Math.round(split.total / Math.max(1, ps.length)))} a month. Investments and transfers aren't counted.</p>
      <div class="segbar" role="img" aria-label="${split.groups.map((g) => `${g.label} ${g.pct}%`).join(", ")}">${split.groups.filter((g) => g.amount > 0).map((g) => `<span style="flex:${g.amount};background:${COLORS[g.key]}" title="${esc(g.label)} ${g.pct}%"></span>`).join("")}</div>
      <div class="yt-wrap"><table class="yt ins-t"><thead><tr><th class="rowh">Type</th><th>Per month</th><th>Share</th><th>Total</th></tr></thead><tbody>
      ${split.groups.map((g) => `<tr><th class="rowh"><i class="swatch" style="--c:${COLORS[g.key]}"></i>${g.label}</th><td>${money(g.monthly)}</td><td>${g.pct}%</td><td>${money(g.amount)}</td></tr>`).join("")}
      </tbody></table></div>
      ${commits.length ? `<h3 style="margin-top:18px">Fixed commitments, per year</h3><p class="muted">The same payments seen as a yearly cost.</p>
      <div class="yt-wrap"><table class="yt ins-t"><thead><tr><th class="rowh">Commitment</th><th>Per month</th><th>Per year</th></tr></thead><tbody>
      ${commits.map((c) => `<tr><th class="rowh">${catIcon(c.category)}${esc(c.label)}</th><td>${money(c.monthly)}</td><td><strong>${money(c.yearly)}</strong></td></tr>`).join("")}
      <tr class="em"><th class="rowh">Total</th><td>${money(commits.reduce((x, c) => x + c.monthly, 0))}</td><td>${money(commits.reduce((x, c) => x + c.yearly, 0))}</td></tr></tbody></table></div>` : ""}</div>

    <div class="card"><h2>Category trends</h2>
      <p class="muted">Day-to-day and one-off spending: the last 3 months against the 6 months before. Highlighted rows moved by at least 20% and ${money(1000)} a month.</p>
      <div class="yt-wrap"><table class="yt ins-t"><thead><tr><th class="rowh">Category</th><th>Last 3 months</th><th>6 months before</th><th>Change per month</th></tr></thead><tbody>
      ${trends.map((t) => `<tr class="${t.flag ? "flag-" + t.flag : ""}"><th class="rowh">${catIcon(t.category)}${esc(t.category)}</th><td>${money(t.recent)}</td><td>${t.before === null ? "–" : money(t.before)}</td><td class="${t.flag === "up" ? "bad" : t.flag === "down" ? "good" : ""}">${arrow(t)}</td></tr>`).join("")}
      </tbody></table></div></div>

    <div class="card"><h2>Top day-to-day merchants</h2>
      <p class="muted">Grouped by the first word of the description (so "Swiggy food" and "Swiggy instamart" count together). Hover a bar for the number of payments.</p>
      <div id="merch"></div></div>

    <div class="card"><h2>Annual items in ${year}</h2>
      <p class="muted">${money(annual.total)} this year. Setting aside <strong>${money(annual.setAside)}</strong> a month would cover it evenly${annual.peak.amount ? ` — instead of ${money(annual.peak.amount)} landing in ${P.periodLabel(`${year}-${String(annual.peak.month).padStart(2, "0")}`).slice(0, 3)}` : ""}.
      ${annual.due ? ` Still to pay: ${money(annual.due)}, or ${money(annual.setAsideRemaining)} a month for the rest of the year.` : " Nothing left to pay this year."}</p>
      <div id="annchart"></div></div>`);
  $$("[data-win]").forEach((b) => (b.onclick = () => { S.insWin = +b.dataset.win; render(); }));
  regularSection(d, ps);
  runwaySection(d, now, ps);
  savingsRateSection(d, ps);
  if (merchants.length) hbars($("#merch"), { title: "Top day-to-day merchants", items: merchants.map((m) => ({ label: `${m.label}`, value: m.amount, count: m.count, icon: catIcon(m.category) })) });
  else $("#merch").innerHTML = '<p class="muted">No day-to-day spending in this period.</p>';
  stackedBars($("#annchart"), { title: `Annual items by month, ${year}`, height: 200,
    labels: annual.months.map((m) => P.periodLabel(`${year}-${String(m.month).padStart(2, "0")}`).slice(0, 3)),
    stacks: [{ name: "Paid", color: "var(--series-2)", values: annual.months.map((m) => m.paid) }, { name: "Still due", color: "var(--series-4)", values: annual.months.map((m) => m.due) }] });
}

const monthsText = (m) => (m === Infinity ? "doesn't run out" : `${m >= 10 ? Math.round(m) : Math.round(m * 10) / 10} months`);
const untilText = (now, m) => (m === Infinity ? "income covers spending" : `until about ${P.periodLabel(E.shiftPeriod(now, Math.floor(m)))}`);
/** A runway gain in plain words: "+2.4 months", or "+17 days" when under a month. */
const gainText = (g) => (g >= 1 ? `+${Math.round(g * 10) / 10} months` : g > 0 ? `+${Math.max(1, Math.round(g * 30.4))} days` : "no change");

/** Runway what-ifs, biggest levers, drawdown and actual-vs-plan. For people drawing on savings. */
function runwaySection(d, now, ps) {
  const host = $("#ins-runway"), settings = settingsRec().data;
  const opts = { ...P.defaultProjection(d, now), ...(settings.projection || {}) };
  if (!(opts.burn > 0)) { host.innerHTML = ""; return; }
  const info = P.currentLiquid(d, now), start = opts.start_override != null ? opts.start_override : info.amount;
  const flex = N.categoryMonthly(d, ps.slice(-6)).reduce((x, c) => x + c.monthly, 0);
  const fixed = N.commitmentsYearly(d, now).reduce((x, c) => x + c.monthly, 0);
  const base = N.runwayMonths(d, opts, now, start), dd = N.drawdown(opts, start);
  const levers = N.biggestLevers(d, opts, now, start, ps.slice(-6), 20).slice(0, 10);
  const plan = N.burnVsPlan(d, ps.slice(-6), opts.burn), avgActual = Math.round(plan.reduce((x, r) => x + r.actual, 0) / Math.max(1, plan.length));
  host.innerHTML = `<div class="card"><h2>Runway: what if…</h2>
    <p class="muted">From ${money(start)} of liquid savings (${esc(opts.start_override != null ? "as entered" : info.source)}), at your planned burn of ${money(opts.burn)} a month plus ${money(opts.annual_base)} of annual items a year. Change the plan on the Savings tab.</p>
    <div class="kpis">
      <div class="metric"><div class="label">Runway now</div><div class="value">${monthsText(base)}</div><div class="sub">${untilText(now, base)}</div></div>
      <div class="metric"><div class="label">Yearly drawdown</div><div class="value">${money(dd.yearly)}</div><div class="sub">${dd.pct === null ? "" : `${dd.pct}% of liquid savings a year`}</div></div>
      <div class="metric"><div class="label">Break-even</div><div class="value">${money(dd.breakEvenExtra)}</div><div class="sub">more income a month would stop the drawdown</div></div>
    </div>
    <div class="whatif">
      <label for="wf-flex">Cut day-to-day spending by <strong id="wf-flex-o">0%</strong> <span class="muted">(you average ${money(flex)} a month)</span></label>
      <input id="wf-flex" type="range" min="0" max="50" step="5" value="0">
      <label for="wf-fixed">Cut fixed commitments by <strong id="wf-fixed-o">${money(0)}</strong> a month <span class="muted">(currently ${money(fixed)})</span></label>
      <input id="wf-fixed" type="range" min="0" max="${Math.max(1000, Math.ceil(fixed / 1000) * 1000)}" step="1000" value="0">
      <label for="wf-inc">Add income of <strong id="wf-inc-o">${money(0)}</strong> a month</label>
      <input id="wf-inc" type="range" min="0" max="${Math.max(50000, Math.ceil((dd.breakEvenExtra * 1.2) / 5000) * 5000)}" step="5000" value="0">
      <p class="whatif-out" id="wf-out" aria-live="polite"></p>
    </div>
    <h3 style="margin-top:18px">Biggest levers</h3>
    <p class="muted">What a 20% cut in each would save, and the runway it buys on its own. Day-to-day amounts are your 6-month averages.</p>
    <div class="yt-wrap"><table class="yt ins-t"><thead><tr><th class="rowh">Spending</th><th>Type</th><th>Per month</th><th>20% cut saves</th><th>Per year</th><th>Runway gained</th></tr></thead><tbody>
    ${levers.map((l) => `<tr><th class="rowh">${catIcon(l.category)}${esc(l.label)}</th><td>${l.kind}</td><td>${money(l.monthly)}</td><td>${money(l.saving)}</td><td>${money(l.yearly)}</td><td>${l.gained === null ? "–" : `<strong class="${l.gained > 0 ? "good" : ""}">${gainText(l.gained)}</strong>`}</td></tr>`).join("")}
    </tbody></table></div>
    <h3 style="margin-top:18px">Actual burn against your plan</h3>
    <p class="muted">Spending minus regular income each month (before annual items), against the ${money(opts.burn)} you planned. Last 6 months average: <strong>${money(avgActual)}</strong>.</p>
    <div class="yt-wrap"><table class="yt ins-t"><thead><tr><th class="rowh">Month</th>${plan.map((r) => `<th>${P.periodLabel(r.period)}</th>`).join("")}</tr></thead><tbody>
      <tr><th class="rowh">Actual</th>${plan.map((r) => `<td>${money(r.actual)}</td>`).join("")}</tr>
      <tr><th class="rowh">Against plan</th>${plan.map((r) => `<td class="${r.diff > 0 ? "bad" : "good"}">${r.diff > 0 ? "+" : r.diff < 0 ? "−" : ""}${money(Math.abs(r.diff))}</td>`).join("")}</tr>
    </tbody></table></div></div>`;
  const upd = () => {
    const pct = +$("#wf-flex").value, cut = +$("#wf-fixed").value, inc = +$("#wf-inc").value;
    $("#wf-flex-o").textContent = pct + "%"; $("#wf-fixed-o").textContent = money(cut); $("#wf-inc-o").textContent = money(inc);
    if (!pct && !cut && !inc) { $("#wf-out").innerHTML = `Move a slider to see the effect. Right now savings last <strong>${monthsText(base)}</strong>, ${untilText(now, base)}.`; return; }
    const w = N.whatIf(d, opts, now, start, { flexCutPct: pct, flexMonthly: flex, fixedCut: cut, extraIncome: inc });
    $("#wf-out").innerHTML = `Saves <strong>${money(w.saving)}</strong> a month (${money(w.saving * 12)} a year). ` + (w.after === Infinity
      ? `<strong class="good">Savings would stop going down</strong> — income would cover spending.`
      : `Runway goes from ${monthsText(w.base)} to <strong>${monthsText(w.after)}</strong>${w.gained > 0 ? ` — <strong class="good">${gainText(w.gained)}</strong>, ${untilText(now, w.after)}` : ""}.`);
  };
  ["#wf-flex", "#wf-fixed", "#wf-inc"].forEach((id) => ($(id).oninput = upd));
  upd();
}

/** Regular expense per month: what a normal month costs, without one-offs, annual items or investments. */
function regularSection(d, ps) {
  const rows = ps.map((p) => { const s = E.summarize(d, p); return { period: p, exp: s.regular_expense, inc: s.regular_inflow, net: s.regular_net }; });
  const avg = Math.round(rows.reduce((x, r) => x + r.exp, 0) / Math.max(1, rows.length));
  const hi = rows.reduce((a, b) => (b.exp > a.exp ? b : a), rows[0]), lo = rows.reduce((a, b) => (b.exp < a.exp ? b : a), rows[0]);
  $("#ins-regular").innerHTML = `<div class="card"><h2>Regular expense</h2>
    <p class="muted">What a normal month costs: day-to-day and fixed monthly spending. One-offs, annual items and investments are left out.</p>
    <div class="kpis">
      <div class="metric"><div class="label">Average</div><div class="value">${money(avg)}</div><div class="sub">per month over ${rows.length} months</div></div>
      <div class="metric"><div class="label">Highest</div><div class="value">${money(hi.exp)}</div><div class="sub">${P.periodLabel(hi.period)}</div></div>
      <div class="metric"><div class="label">Lowest</div><div class="value">${money(lo.exp)}</div><div class="sub">${P.periodLabel(lo.period)}</div></div>
      <div class="metric"><div class="label">Per year at this rate</div><div class="value">${money(avg * 12)}</div><div class="sub">before annual items</div></div>
    </div>
    <div id="regchart"></div></div>`;
  stackedBars($("#regchart"), { title: "Regular expense by month", height: 190, labels: rows.map((r) => P.periodLabel(r.period).slice(0, 3)),
    stacks: [{ name: "Regular expense", color: "var(--series-1)", values: rows.map((r) => r.exp) }] });
}

/** Savings rate for people with a regular income. */
function savingsRateSection(d, ps) {
  const host = $("#ins-rate"), settings = settingsRec().data;
  const sr = N.savingsRate(d, ps);
  if (settings.funding_mode === "savings" || !sr.income) { host.innerHTML = ""; return; }
  host.innerHTML = `<div class="card"><h2>Savings rate</h2>
    <p class="muted">Regular income minus spending (annual items included), as a share of regular income. One-off inflows and investments aren't counted.</p>
    <div class="kpis">
      <div class="metric"><div class="label">Savings rate</div><div class="value ${sr.rate < 0 ? "bad" : "good"}">${sr.rate}%</div><div class="sub">over ${ps.length} months</div></div>
      <div class="metric"><div class="label">Saved</div><div class="value">${money(sr.saved)}</div><div class="sub">of ${money(sr.income)} income</div></div>
      <div class="metric"><div class="label">Best month</div><div class="value">${sr.best ? sr.best.rate + "%" : "–"}</div><div class="sub">${sr.best ? P.periodLabel(sr.best.period) : ""}</div></div>
      <div class="metric"><div class="label">Months spending more than income</div><div class="value ${sr.overspent ? "bad" : ""}">${sr.overspent}</div><div class="sub">of ${ps.length}</div></div>
    </div>
    <div class="yt-wrap"><table class="yt ins-t"><thead><tr><th class="rowh">Month</th>${sr.rows.map((r) => `<th>${P.periodLabel(r.period)}</th>`).join("")}</tr></thead><tbody>
      <tr><th class="rowh">Income</th>${sr.rows.map((r) => `<td>${money(r.income)}</td>`).join("")}</tr>
      <tr><th class="rowh">Spending</th>${sr.rows.map((r) => `<td>${money(r.spend)}</td>`).join("")}</tr>
      <tr class="em"><th class="rowh">Saved</th>${sr.rows.map((r) => `<td class="${r.saved < 0 ? "bad" : "good"}">${money(r.saved)}</td>`).join("")}</tr>
      <tr><th class="rowh">Rate</th>${sr.rows.map((r) => `<td>${r.rate === null ? "–" : r.rate < -100 ? "< −100%" : r.rate + "%"}</td>`).join("")}</tr>
    </tbody></table></div></div>`;
}

// ================= Savings, projections and checkpoints =================
const PROJ_FIELDS = [["burn", "Monthly burn (spending − regular income)", "amt"], ["burn_growth_pct", "Burn grows each year", "%"],
  ["annual_base", "Annual items per year", "amt"], ["annual_growth_pct", "Annual items grow each year", "%"],
  ["holiday_per_year", "Holiday budget per year", "amt"], ["horizon_year", "Plan until (year)", ""], ["start_override", "Starting savings (blank = latest checkpoint)", "amt"]];

function viewSavings() {
  const s = settingsRec(), period = E.periodOf(today(), s.data), d = db();
  const defaults = P.defaultProjection(d, period);
  const opts = { ...defaults, ...(s.data.projection || {}) };
  html(`
    <h1>Savings and runway</h1>
    <div class="kpis" id="pk"></div>
    <div class="card"><h2>Where your savings are heading</h2><div id="pchart"></div>
      <p class="muted" id="pnote"></p></div>
    <div class="card"><h2>Assumptions</h2>
      <div class="proj-form">${PROJ_FIELDS.map(([k, l, u]) => `<div><label for="pf-${k}">${l}${u === "%" ? " (%)" : ""}</label><input id="pf-${k}" type="number" step="any" value="${opts[k] ?? ""}" placeholder="${k === "start_override" ? "" : defaults[k] ?? ""}"></div>`).join("")}</div>
      <p class="row" style="margin-top:12px"><button class="primary" id="psave">Save assumptions</button><button id="pdef">Use my recent averages</button><span class="muted" id="pmsg"></span></p>
      <p class="muted">Recent averages: burn ${money(defaults.burn)} a month (last 6 months with data), annual items ${money(defaults.annual_base)} a year.</p></div>
    <div class="card"><h2>Committed spending by year</h2><div id="pyears"></div></div>
    <div class="card"><h2>Checkpoints</h2><p class="muted">A checkpoint records what you hold and what you've committed on a date. Compare them to see whether the gap is closing.</p>
      <div id="snaps"></div><p><button class="primary" id="newsnap">New checkpoint</button></p><div id="snaped"></div></div>`);
  const read = () => Object.fromEntries(PROJ_FIELDS.map(([k]) => [k, $("#pf-" + k).value === "" ? (k === "start_override" ? null : defaults[k]) : +$("#pf-" + k).value]));
  const draw = () => drawProjection(db(), period, read());
  $$(".proj-form input").forEach((i) => (i.oninput = draw));
  $("#psave").onclick = async () => { await store.save({ id: s.id, type: "settings", data: { ...settingsRec().data, projection: read() } }); $("#pmsg").textContent = "Saved"; };
  $("#pdef").onclick = () => { PROJ_FIELDS.forEach(([k]) => { $("#pf-" + k).value = k === "start_override" ? "" : defaults[k]; }); draw(); };
  $("#newsnap").onclick = async () => {
    const snap = P.prefillSnapshot(db(), period, read(), today());
    const [id] = await store.save({ type: "snapshot", data: snap });
    snapList(); snapEditor(id); draw();
  };
  draw(); snapList();
}

function drawProjection(d, period, opts) {
  const startInfo = P.currentLiquid(d, period);
  const start = opts.start_override != null ? opts.start_override : startInfo.amount;
  const pr = P.project(d, opts, period, start);
  const snaps = [...d.snapshot].sort((a, b) => a.date.localeCompare(b.date));
  const gapAtHorizon = start - pr.committed;
  const runsOut = pr.runs_out ? P.periodLabel(pr.runs_out) : null;
  $("#pk").innerHTML = `
    <div class="metric"><div class="label">Liquid savings now</div><div class="value">${money(start)}</div><div class="sub">${opts.start_override != null ? "as entered" : "from " + esc(startInfo.source)}</div></div>
    <div class="metric"><div class="label">Monthly burn assumed</div><div class="value">${money(opts.burn)}</div><div class="sub">grows ${opts.burn_growth_pct}% a year</div></div>
    <div class="metric"><div class="label">Committed to Dec ${opts.horizon_year}</div><div class="value">${money(pr.committed)}</div><div class="sub">burn + annual items + holidays</div></div>
    <div class="metric"><div class="label">Gap at Dec ${opts.horizon_year}</div><div class="value ${gapAtHorizon < 0 ? "bad" : "good"}">${money(gapAtHorizon)}</div><div class="sub">${gapAtHorizon < 0 ? "short" : "spare"}</div></div>
    <div class="metric"><div class="label">Money lasts until</div><div class="value ${runsOut ? "bad" : "good"}">${runsOut || "Beyond " + opts.horizon_year}</div><div class="sub">at these assumptions</div></div>`;
  // x axis: from the earliest checkpoint (or now) to the horizon
  const first = snaps.length ? E.periodOf(snaps[0].date) : period;
  const from = first < period ? first : period;
  const labels = [], periods = [];
  for (let p = from; p <= `${opts.horizon_year}-12`; p = E.shiftPeriod(p, 1)) { periods.push(p); labels.push(P.periodLabel(p)); }
  const proj = periods.map((p) => (p === E.shiftPeriod(period, -1) ? start : (pr.series.find((x) => x.period === p) || {}).balance ?? null));
  const snapVals = periods.map((p) => { const sn = snaps.filter((x) => E.periodOf(x.date) === p).pop(); return sn ? P.snapshotTotals(sn).liquid : null; });
  lines($("#pchart"), {
    title: "Projected liquid savings by month, with checkpoints",
    labels, series: [
      { name: "Projected savings", color: "var(--series-1)", values: proj },
      ...(snaps.length ? [{ name: "Checkpoint (actual)", color: "var(--series-2)", values: snapVals, dotsOnly: true }] : []),
    ],
  });
  $("#pnote").textContent = runsOut
    ? `At ${money(opts.burn)} a month plus annual items, liquid savings run out in ${runsOut}. Long-term savings (PPF, property and similar) aren't counted.`
    : `At these assumptions, liquid savings last beyond December ${opts.horizon_year}, ending around ${money(pr.end)}.`;
  $("#pyears").innerHTML = `<div class="yt-wrap"><table class="yt"><thead><tr><th class="rowh">Year</th><th>Monthly spending</th><th>Annual items</th><th>Holidays</th><th>Total</th><th>Savings at year end</th></tr></thead><tbody>
    ${pr.years.map((y) => { const end = pr.series.filter((x) => x.period.startsWith(y.year)).pop(); return `<tr><th class="rowh">${y.year}${y.year === +period.slice(0, 4) ? " (rest of year)" : ""}</th><td>${money(y.monthly)}</td><td>${money(y.annual)}</td><td>${money(y.holiday)}</td><td><strong>${money(y.total)}</strong></td><td class="${end && end.balance < 0 ? "bad" : ""}">${end ? money(end.balance) : "–"}</td></tr>`; }).join("")}
    </tbody></table></div>`;
}

function snapList() {
  const snaps = store.ofType("snapshot").map((r) => ({ id: r.id, ...r.data })).sort((a, b) => b.date.localeCompare(a.date));
  if (!snaps.length) { $("#snaps").innerHTML = '<p class="muted">No checkpoints yet. Create one to record where you stand today.</p>'; return; }
  const tot = snaps.map((s) => P.snapshotTotals(s));
  $("#snaps").innerHTML = `<div class="yt-wrap"><table class="yt"><thead><tr><th class="rowh">Date</th><th>Liquid savings</th><th>Committed</th><th>Gap</th><th>Change in gap</th><th>Long-term</th><th></th></tr></thead><tbody>
    ${snaps.map((s, i) => { const t = tot[i], prev = tot[i + 1]; const ch = prev ? t.gap - prev.gap : null;
      return `<tr><th class="rowh">${esc(s.date)}</th><td>${money(t.liquid)}</td><td>${money(t.committed)}</td><td class="${t.gap < 0 ? "bad" : "good"}">${money(t.gap)}</td>
      <td class="${ch == null ? "nodata" : ch < 0 ? "bad" : "good"}">${ch == null ? "–" : (ch > 0 ? "+" : "") + money(ch)}</td><td>${money(t.illiquid)}</td>
      <td style="text-align:left"><button class="link" data-open="${s.id}">Open</button> · <button class="link" data-delsnap="${s.id}">Delete</button></td></tr>`; }).join("")}
    </tbody></table></div>`;
  $$("[data-open]").forEach((b) => (b.onclick = () => snapEditor(b.dataset.open)));
  $$("[data-delsnap]").forEach((b) => (b.onclick = async () => { if (!confirm("Delete this checkpoint?")) return; await store.remove(b.dataset.delsnap); $("#snaped").innerHTML = ""; snapList(); drawProjection(db(), E.periodOf(today(), settingsRec().data), { ...P.defaultProjection(db(), E.periodOf(today(), settingsRec().data)), ...(settingsRec().data.projection || {}) }); }));
}

function snapEditor(id) {
  const rec = store.rows.get(id); if (!rec) return;
  const snap = JSON.parse(JSON.stringify(rec.data));
  snap.items = (snap.items || []).map((it, i) => ({ _id: it._id || `i${i}-${Math.random().toString(36).slice(2, 8)}`, ...it }));
  const persist = async () => { await store.save({ id, type: "snapshot", data: snap }); snapList(); totals(); };
  $("#snaped").innerHTML = `<h3 style="margin-top:16px">Checkpoint</h3>
    <div class="row"><label for="sn-date" style="margin:0">Date</label><input id="sn-date" type="date" value="${esc(snap.date)}" style="width:auto">
      <input id="sn-note" placeholder="Note (optional)" value="${esc(snap.note || "")}" style="max-width:360px"></div>
    <div id="sn-grid" style="margin-top:8px"></div><p id="sn-tot" class="muted"></p>`;
  const totals = () => { const t = P.snapshotTotals(snap); $("#sn-tot").innerHTML = `Liquid ${money(t.liquid)} − committed ${money(t.committed)} = <strong class="${t.gap < 0 ? "bad" : "good"}">gap ${money(t.gap)}</strong> · long-term ${money(t.illiquid)} (not counted)`; };
  $("#sn-date").onchange = () => { snap.date = $("#sn-date").value || snap.date; persist(); };
  $("#sn-note").onchange = () => { snap.note = $("#sn-note").value; persist(); };
  mountGrid($("#sn-grid"), { id: "sn",
    label: "Checkpoint items", blankRows: 4, rows: snap.items.map(({ _id, ...it }) => ({ id: _id, ...it })),
    newRow: () => ({ group: "liquid" }), meaningful: (x) => !!String(x.label || "").trim(),
    columns: [{ key: "group", label: "Group", type: "select", width: 150, options: () => [["liquid", "Liquid savings"], ["commitment", "Committed spending"], ["illiquid", "Long-term (not counted)"]] },
      { key: "label", label: "Item", type: "text", width: 260 }, { key: "amount", label: "Amount", type: "number", width: 140 }],
    async save(itemId, data) {
      const { group, label, amount } = data;
      if (itemId) Object.assign(snap.items.find((x) => x._id === itemId), { group, label, amount });
      else { itemId = `i${Date.now()}-${Math.random().toString(36).slice(2, 8)}`; snap.items.push({ _id: itemId, group, label, amount }); }
      await persist(); return itemId;
    },
    async remove(itemId) { snap.items = snap.items.filter((x) => x._id !== itemId); await persist(); },
    onChange: () => drawProjection(db(), E.periodOf(today(), settingsRec().data), { ...P.defaultProjection(db(), E.periodOf(today(), settingsRec().data)), ...(settingsRec().data.projection || {}) }),
  });
  totals();
  $("#snaped").scrollIntoView({ block: "nearest" });
}

// ================= Settings =================
function viewSettings() {
  const s = settingsRec();
  const keys = store.vault.keys;
  html(`
    <div class="card"><h2>Look</h2>${themePicker(s.data.theme || "paper", s.data.custom_theme)}
      <p><button id="customize">${s.data.custom_theme ? "Edit my theme" : "Create my own theme"}</button></p><div id="themeed"></div>
      <label>Screen transitions</label><div class="motion-pick">${MOTIONS.map(([k, l]) => `<button type="button" data-motion-pick="${k}" class="${motion() === k ? "on" : ""}">${l}</button>`).join("")}</div>
      <p class="muted" style="margin:4px 0 0">How screens change when you switch tabs. Saved on this device and with your settings.</p></div>
    <div class="card"><h2>Months</h2>
      <label for="pm">Months run</label><select id="pm" style="max-width:320px"><option value="calendar">Calendar month (1st to end)</option><option value="pay_cycle">Salary day to salary day</option></select>
      <label for="fm2">Household is funded by</label><select id="fm2" style="max-width:320px"><option value="salary">Salary / regular income</option><option value="savings">Savings (no regular income)</option><option value="both">Both</option></select>
      <label for="cur2">Currency</label><select id="cur2" style="max-width:320px">${currencyOptions(s.data.currency || "INR")}</select>
      <p class="muted" style="margin:4px 0 0">Changes the symbol and number format only. Amounts are not converted.</p>
      <label for="cd">Salary day</label><input id="cd" type="number" min="1" max="31" style="max-width:120px" value="${esc(s.data.cycle_day || "")}">
      <label style="display:flex;gap:8px;align-items:flex-start;color:var(--text);font-size:14px;margin-top:14px"><input type="checkbox" id="rollup" style="width:auto;margin-top:3px" ${s.data.card_rollup ? "checked" : ""}>
        <span>Count each card's monthly spending against my main account, as a read-only row. Months where I record the card bill payment aren't counted twice.</span></label>
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
  $("#fm2").value = s.data.funding_mode || "both";
  wireThemePicker(async (t) => { await store.save({ id: s.id, type: "settings", data: { ...settingsRec().data, theme: t } }); }, s.data.custom_theme);
  $("#customize").onclick = () => themeEditor();
  $$("[data-motion-pick]").forEach((b) => (b.onclick = async () => {
    const m = b.dataset.motionPick;
    if (m === motion()) return;
    applyMotion(m); track("motion:" + m);
    $$("[data-motion-pick]").forEach((x) => x.classList.toggle("on", x === b));
    await store.save({ id: s.id, type: "settings", data: { ...settingsRec().data, motion: m } });
  }));
  $("#savepm").onclick = async () => {
    const day = +$("#cd").value || null;
    if ($("#pm").value === "pay_cycle" && !day) return showError(new Error("Enter your salary day."));
    const data = { ...settingsRec().data, period_mode: $("#pm").value, funding_mode: $("#fm2").value, currency: $("#cur2").value, cycle_day: day, card_rollup: $("#rollup").checked };
    // Re-file transactions into periods under the new rule.
    const tx = store.ofType("transaction").map((r) => ({ id: r.id, type: "transaction", data: { ...r.data, period: r.data.early_close ? r.data.period : E.periodOf(r.data.date, data) } }));
    await store.save([{ id: s.id, type: "settings", data }, ...tx]);
    setCurrency(data.currency);
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
    if (await I.looksLikeFinancesWorkbook(IMP.book)) { track("import:workbook"); return financesForm(); }
    track("import:xlsx");
    return sheetPicker();
  }
  track("import:csv");
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
      <p>${r.report.counts.transaction || 0} transactions, ${r.report.counts.account || 0} new accounts, ${r.report.counts.commitment || 0} monthly commitments, ${r.report.annualCount} annual items${r.report.checkpointCount ? `, ${r.report.checkpointCount} checkpoints` : ""}${r.report.noteCount ? `, ${r.report.noteCount} month notes` : ""}.</p>
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
