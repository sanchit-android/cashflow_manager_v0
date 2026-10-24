// Admin dashboard: business insights, technical/SRE view, and admin management.
// Shown as an extra tab only to admins; the server checks admin rights on every call.
import { api } from "./store.js";
import { lines, stackedBars, hbars } from "./charts.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const num = (n) => (n == null ? "—" : Math.round(n).toLocaleString("en-IN"));
const pct = (a, b) => (b ? Math.round((100 * a) / b) + "%" : "—");
const bytes = (b) => (b == null ? "—" : b >= 1 << 30 ? (b / (1 << 30)).toFixed(2) + " GB" : b >= 1 << 20 ? (b / (1 << 20)).toFixed(1) + " MB" : Math.round(b / 1024) + " KB");
const short = (iso) => new Date(iso + (iso.length === 10 ? "T00:00" : "")).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
const when = (iso) => new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const C = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)"];

const A = { view: "business", days: 30 };
let host;

const metric = (label, value, sub = "") => `<div class="metric"><div class="label">${esc(label)}</div><div class="value">${value}</div>${sub ? `<div class="sub">${sub}</div>` : ""}</div>`;
const card = (title, body, note = "") => `<div class="card"><h2>${esc(title)}</h2>${note ? `<p class="muted">${note}</p>` : ""}${body}</div>`;
const table = (heads, rows, empty = "Nothing yet.") => rows.length
  ? `<div class="yt-wrap"><table class="yt adm-t"><thead><tr>${heads.map((h, i) => `<th class="${i ? "" : "rowh"}">${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c, i) => (i ? `<td>${c}</td>` : `<th class="rowh">${c}</th>`)).join("")}</tr>`).join("")}</tbody></table></div>`
  : `<p class="muted">${empty}</p>`;
const bars = (id) => `<div id="${id}"></div>`;
const drawBars = (id, items, color) => { const el = host.querySelector("#" + id); if (el) { if (items.length) hbars(el, { items, color, fmt: num }); else el.innerHTML = '<p class="muted">Nothing yet.</p>'; } };

export async function viewAdmin(root) {
  host = root;
  host.innerHTML = `<div class="row"><h1 style="margin:0">Admin</h1><span class="spacer"></span>
    <div class="seg" role="group" aria-label="Dashboard">${[["business", "Business"], ["tech", "Technical"], ["admins", "Admins"]].map(([k, l]) => `<button type="button" data-av="${k}" class="${A.view === k ? "on" : ""}" aria-pressed="${A.view === k}">${l}</button>`).join("")}</div>
    ${A.view !== "admins" ? `<div class="seg" role="group" aria-label="Period">${[7, 30, 90].map((n) => `<button type="button" data-ad="${n}" class="${A.days === n ? "on" : ""}" aria-pressed="${A.days === n}">${n} days</button>`).join("")}</div>` : ""}
    <button type="button" id="adm-refresh">Refresh</button></div>
    <div id="adm"><p class="muted">Loading…</p></div>`;
  host.querySelectorAll("[data-av]").forEach((b) => (b.onclick = () => { A.view = b.dataset.av; viewAdmin(root); }));
  host.querySelectorAll("[data-ad]").forEach((b) => (b.onclick = () => { A.days = +b.dataset.ad; viewAdmin(root); }));
  host.querySelector("#adm-refresh").onclick = () => viewAdmin(root);
  const box = host.querySelector("#adm");
  try {
    if (A.view === "admins") return admins(box);
    const d = await api(`/api/admin/${A.view}?days=${A.days}`);
    if (!host.querySelector("#adm")) return; // user left the tab
    (A.view === "business" ? business : tech)(box, d);
  } catch (e) { box.innerHTML = `<p class="error">${esc(e.message)}</p>`; }
}

// ================= business =================
function business(box, d) {
  const k = d.kpis, labels = d.labels.map(short);
  const f = d.funnel;
  const tabTotal = d.tabs.reduce((x, t) => x + t.count, 0);
  const savingsAssumptions = d.changes.filter((r) => r.event.startsWith("savings:"));
  const life = Object.fromEntries(d.lifecycle.map((r) => [r.event, r]));
  const lc = (e) => (life[e] ? `${num(life[e].count)} <span class="muted">(${num(life[e].users)} users)</span>` : "0");
  box.innerHTML = `
    <div class="kpis">
      ${metric("Total users", num(k.users), `${num(k.new_users)} new in ${d.days} days`)}
      ${metric("Active users", num(k.active_window), `in the last ${d.days} days`)}
      ${metric("Daily / weekly / monthly", `${num(k.dau)} / ${num(k.wau)} / ${num(k.mau)}`, `stickiness (daily ÷ monthly) ${k.stickiness}%`)}
      ${metric("Using it for real", num(k.with_transactions), `${pct(k.with_transactions, k.users)} of users have transactions`)}
      ${metric("Stuck at sign-up", num(k.stalled_signups), "signed up, never created a vault")}
      ${metric("Gone quiet", num(k.dormant_users), "had data, not seen in 30+ days")}
      ${metric("Records stored", num(k.records), `${num(k.google_users)} users sign in with Google`)}
      ${metric("Accounts deleted", num(k.deleted_accounts), `in the last ${d.days} days`)}
    </div>
    ${card("New and returning users", bars("b-users"), "Bars: people who used the app each day, split into new (signed up that day) and returning. Line: sign-ups.")}
    <div class="adm-2">
      ${card("Activation funnel", table(["Step", "Users", "Of sign-ups", "Of previous step"],
        f.map((r, i) => [esc(r.label), num(r.value), pct(r.value, f[0].value), i ? pct(r.value, f[i - 1].value) : ""])),
        "All time. The biggest drop between two steps is where to focus.")}
      ${card("Weekly retention", table(["Signed up week of", "Users", "Week 1", "Week 2", "Week 3", "Week 4"],
        d.cohorts.map((c) => [short(c.week), num(c.size), ...[0, 1, 2, 3].map((i) => (c.weeks[i] == null ? "" : `<span class="heat" style="--h:${c.weeks[i] / 100}">${c.weeks[i]}%</span>`))])),
        "Share of each week's new users who came back in each following week.")}
    </div>
    ${card("Screens used", table(["Screen", "Opened", "Users", "Share of opens", "Reach (of active users)"],
      d.tabs.map((t) => [esc(t.event), num(t.count), num(t.users), pct(t.count, tabTotal), pct(t.users, k.active_window)])),
      `In the last ${d.days} days. Screens nobody opens are candidates to simplify or promote.`)}
    <div class="adm-2">
      ${card("What-ifs and planning", table(["Control", "Changed", "Users"],
        [...d.whatif.map((r) => [`Runway what-if: ${esc({ flex: "cut day-to-day %", fixed: "cut fixed", inc: "add income" }[r.event] || r.event)}`, num(r.count), num(r.users)]),
         ...savingsAssumptions.map((r) => [`Savings plan: ${esc(r.event.slice(8).replace(/^pf-/, "").replace(/_/g, " "))}`, num(r.count), num(r.users)])]),
        "Times each slider or projection assumption was changed. Values are never sent.")}
      ${card("Sign-in, unlock and import", table(["Event", "Count"], [
        ["Sign-ups by email / Google", `${lc("signup:email")} / ${lc("signup:google")}`],
        ["Sign-ins by email / Google", `${lc("login:email")} / ${lc("login:google")}`],
        ["Vaults created", lc("vault:created")],
        ["Unlock: remembered device", lc("unlock:remembered")], ["Unlock: passphrase", lc("unlock:passphrase")],
        ["Unlock: recovery key (forgot passphrase)", lc("unlock:recovery")],
        ["Setup: salary / savings / both", `${lc("onboard:salary")} / ${lc("onboard:savings")} / ${lc("onboard:both")}`],
        ["Imports: workbook / xlsx / csv", `${lc("import:workbook")} / ${lc("import:xlsx")} / ${lc("import:csv")}`],
        ["App opened", lc("app:open")]]))}
    </div>
    ${card("Data being added", bars("b-saves") + table(["Record type", "Created", "Edited", "Deleted", "Users adding"],
      [...new Set([...d.saves, ...d.edits, ...d.deletes].map((r) => r.event))].map((t) => {
        const f = (list) => list.find((r) => r.event === t) || { count: 0, users: 0 };
        return [esc(t), num(f(d.saves).count), num(f(d.edits).count), num(f(d.deletes).count), num(f(d.saves).users)];
      })), `Records saved per day from the app in the last ${d.days} days.`)}
    <div class="adm-2">
      ${card("Stored records by type", bars("b-types"))}
      ${card("Depth of use", `<h3>Transactions per user</h3>${bars("b-tx")}<h3>Months of data per user</h3>${bars("b-months")}
        <p class="muted">Average accounts per user: <strong>${d.depth.avg_accounts}</strong></p>`, "Users with a vault only.")}
    </div>
    ${card("Other numbers (Month screen)", table(["Action", "Count", "Users"], (d.metrics || []).map((r) => [esc({ reorder: "Dragged a box (one row)", rows: "Dragged a box (several rows)", custom_create: "Created a custom number", custom_edit: "Edited a custom number" }[r.event] || r.event), num(r.count), num(r.users)])),
      "Showing, hiding and deleting numbers are under Buttons used (month : mxShow, mxHide, mxDel).")}
    ${card("Buttons used", table(["Screen : button", "Clicks", "Users"], d.clicks.map((r) => [esc(r.event), num(r.count), num(r.users)])),
      "Named by button id. Useful to see whether features like export, checkpoints or custom themes get used.")}
    ${card("Settings changed", table(["Screen : field", "Changes", "Users"], d.changes.filter((r) => !r.event.startsWith("savings:")).map((r) => [esc(r.event), num(r.count), num(r.users)])))}
    ${card("Most active users", table(["Email", "Joined", "Last seen", `Days active (${d.days}d)`, "Transactions", "Months", "Vault"],
      d.top_users.map((u) => [esc(u.email), short(u.joined), short(u.last_seen), num(u.days_active), num(u.transactions), num(u.months), u.vault ? "Yes" : '<span class="bad">No</span>'])),
      "Good people to ask for feedback.")}`;

  stackedBars(box.querySelector("#b-users"), { labels, fmt: num, axis: num,
    stacks: [{ name: "Returning", color: C[0], values: d.daily.returning_active }, { name: "New", color: C[1], values: d.daily.new_active }],
    line: { name: "Sign-ups", color: C[2], values: d.daily.signups } });
  lines(box.querySelector("#b-saves"), { labels, fmt: num, axis: num, series: [{ name: "Records saved", color: C[0], values: d.daily.saves }] });
  drawBars("b-types", d.records_by_type, C[0]);
  drawBars("b-tx", d.depth.transactions, C[1]);
  drawBars("b-months", d.depth.months, C[2]);
}

// ================= technical =================
function tech(box, d) {
  const t = d.traffic, r = d.requests, db = d.db, h = d.health, labels = d.labels.map(short);
  const srcLabel = { direct: "Direct / unknown", search: "Search engines", ai: "AI assistants", social: "Social", referral: "Other websites", email: "Email", campaign: "Campaign links", internal: "Internal" };
  const named = (key, title) => (t.source_names[key] || []).length ? `<h3>${title}</h3>${table(["Source", "Visits"], t.source_names[key].map((x) => [esc(x.label), num(x.value)]))}` : "";
  const used = db.used_pct ?? null;
  const lcodes = d.login_codes;
  box.innerHTML = `
    <div class="card"><h2>Health</h2>
      <div class="adm-checks">${h.checks.map((c) => `<span class="${c.ok ? "good" : "bad"}">${c.ok ? "✓" : "✗"} ${esc(c.name)}${c.detail ? ` (${esc(c.detail)})` : ""}</span>`).join("")}</div>
      <p class="muted">Python ${esc(h.python)} · Django ${esc(h.django)} · ${esc(db.version || db.vendor)} · this process up ${num(h.pid_uptime_min)} min (since ${when(h.process_started)})</p></div>
    <div class="kpis">
      ${metric("Visits", num(t.total_visits), `${num(t.unique_visitors)} unique visitors · ${num(t.total_views)} page views`)}
      ${metric("Requests", num(r.total), `average ${num(r.avg_ms)} ms · ${num(r.slow)} over 1 s`)}
      ${metric("Server errors (5xx)", `<span class="${r.err5 ? "bad" : "good"}">${num(r.err5)}</span>`, `${pct(r.err5, r.total)} of requests`)}
      ${metric("Client errors (4xx)", num(r.err4), `${pct(r.err4, r.total)} of requests`)}
      ${metric("Database", used == null ? bytes(db.size_bytes) : `${used}%`, `${bytes(db.size_bytes)} of ${num(db.limit_mb)} MB free tier`)}
      ${metric("Email sign-in codes", num(lcodes.sent), `${pct(lcodes.used, lcodes.sent)} used · ${num(lcodes.locked)} locked out`)}
    </div>
    ${card("Visitors", bars("t-traffic"), "People (bots excluded). A visit is one visitor's first page on a day. Visitors are counted with a hash that changes daily; no IP addresses are stored.")}
    <div class="adm-2">
      ${card("How people arrive", bars("t-src") + named("search", "Search engines") + named("ai", "AI assistants") + named("social", "Social") + named("campaign", "Campaign links (utm_source)") + named("email", "Email"),
        "Search engines don't pass the search words. For keywords, connect Google Search Console and Bing Webmaster Tools to plannedout.in.")}
      <div>
        ${card("Visitor funnel", table(["Step", "Count", "Of visits"], [
          ["Visits", num(t.funnel.visits), "100%"], ["Opened sign-in page", num(t.funnel.login_page), pct(t.funnel.login_page, t.funnel.visits)],
          ["Reached the app", num(t.funnel.reached_app), pct(t.funnel.reached_app, t.funnel.visits)], ["New accounts", num(t.funnel.signups), pct(t.funnel.signups, t.funnel.visits)]]))}
        ${card("Other websites linking here", table(["Website", "Visits"], t.referrers.map((x) => [esc(x.label), num(x.value)])))}
        ${card("Devices", table(["Device", "Visits"], t.devices.map((x) => [esc(x.label), num(x.value)])))}
      </div>
    </div>
    <div class="adm-2">
      ${card("Landing pages", table(["Page", "Visits started here"], t.landing_pages.map((x) => [esc(x.label), num(x.value)])), "Where visits start: which guide pages bring people in.")}
      ${card("Most viewed pages", table(["Page", "Views"], t.top_pages.map((x) => [esc(x.label), num(x.value)])))}
    </div>
    <div class="adm-2">
      ${card("Crawlers and AI bots", table(["Bot", "Pages fetched"], t.bots.map((x) => [esc(x.label), num(x.value)])),
        "Shows whether Google, Bing and AI assistants (ChatGPT, Claude, Perplexity) are reading the site.")}
      ${card("Pages AI bots read", table(["Page", "Fetches"], t.ai_bot_pages.map((x) => [esc(x.label), num(x.value)])), "Includes /llms.txt.")}
    </div>
    <div class="adm-2">
      ${card("Broken links (404)", table(["Path", "Hits"], t.not_found.map((x) => [esc(x.label), num(x.value)]), "No missing pages."))}
      ${card("Slowest pages", table(["Page", "Average ms"], t.slow_pages.map((x) => [esc(x.label), num(x.value)])), "Server time only, pages with 3+ views.")}
    </div>
    ${card("Requests and server errors", bars("t-req"))}
    ${card("Endpoints", table(["Route", "Requests", "4xx", "5xx", "Avg ms", "Max ms", "Over 1 s"],
      r.routes.map((x) => [esc(x.route), num(x.count), x.err4 ? num(x.err4) : "", x.err5 ? `<span class="bad">${num(x.err5)}</span>` : "", num(x.avg_ms), num(x.max_ms), x.slow ? num(x.slow) : ""])))}
    ${card("Errors users hit", table(["Where", "Message", "Times", "Users", "Last"],
      d.errors.grouped.map((e) => [`${esc(e.kind)}<br><span class="muted">${esc(e.path)}</span>`, esc(e.message), num(e.n), num(e.users), when(e.last)]), "No errors. 🎉"),
      "server = crash on our side · api = a request the app rejected (wrong code, conflict…) · client = a JavaScript error in someone's browser.")}
    ${d.errors.recent.length ? card("Latest errors", d.errors.recent.map((e) => `<details class="adm-err"><summary><span class="muted">${when(e.at)}</span> · ${esc(e.kind)} · ${esc(e.path)} · ${esc(e.message)}</summary>${e.detail ? `<pre>${esc(e.detail)}</pre>` : ""}</details>`).join("")) : ""}
    <div class="card"><h2>Database</h2>
      ${used != null ? `<div class="adm-gauge" role="img" aria-label="${used}% of storage used"><span style="width:${Math.min(100, used)}%" class="${used > 80 ? "hot" : used > 60 ? "warm" : ""}"></span></div>
        <p>${bytes(db.size_bytes)} of ${num(db.limit_mb)} MB used${db.room_for_records != null ? ` · room for about <strong>${num(db.room_for_records)}</strong> more records at the current average size` : ""}.</p>` : ""}
      ${db.error ? `<p class="error">${esc(db.error)}</p>` : ""}
      ${(db.notes || []).map((n) => `<p class="notice">${esc(n)}</p>`).join("")}
      <div class="kpis">
        ${metric("Live records", num(db.records), `${num(db.tombstones)} deleted markers kept for sync`)}
        ${db.connections != null ? metric("Connections", `${num(db.connections)} / ${num(db.max_connections)}`, `${num(db.active_connections)} active now`) : ""}
        ${db.cache_hit_pct != null ? metric("Cache hit rate", db.cache_hit_pct + "%", "aim for 99%+") : ""}
        ${metric("Round trip", (db.ping_ms ?? "—") + " ms", "app → database")}
        ${db.deadlocks != null ? metric("Deadlocks / rollbacks", `${num(db.deadlocks)} / ${db.rollback_pct}%`, "since stats reset") : ""}
      </div>
      ${table(["Table", "Size", "Rows", "Dead rows"], (db.tables || []).map((x) => [esc(x.name), bytes(x.bytes), num(x.rows), x.dead_rows == null ? "" : num(x.dead_rows)]))}
      <p class="muted">Free-tier limits to watch: Neon free gives 0.5 GB storage and suspends compute when idle (first query after a pause is slower). Render free sleeps the app after 15 minutes without traffic; each wake-up is a cold start below. Monitoring data is trimmed automatically (page views and errors after 90 days, hourly stats after 35).</p>
    </div>
    ${card("App starts (cold starts)", bars("t-boots"), "Each bar counts app process starts that day (2 workers per start). Many starts means the free host is sleeping often and first visitors wait.")}`;

  lines(box.querySelector("#t-traffic"), { labels, fmt: num, axis: num, series: [
    { name: "Page views", color: C[0], values: t.views }, { name: "Unique visitors", color: C[1], values: t.visitors }, { name: "Bot fetches", color: C[3], values: t.bot_views, dashed: true }] });
  drawBars("t-src", t.sources.map((x) => ({ label: srcLabel[x.label] || x.label, value: x.value })), C[0]);
  stackedBars(box.querySelector("#t-req"), { labels, fmt: num, axis: num, height: 220,
    stacks: [{ name: "Requests", color: C[0], values: r.daily }], line: { name: "Server errors", color: "var(--bad)", values: r.err5_daily } });
  stackedBars(box.querySelector("#t-boots"), { labels, fmt: num, axis: num, height: 180, stacks: [{ name: "Process starts", color: C[2], values: d.boots }] });
}

// ================= admins =================
async function admins(box) {
  const draw = (d, err = "") => {
    box.innerHTML = card("Admins", `${table(["Email", "Added by", "Added", ""], d.admins.map((a) => [esc(a.email),
      a.owner ? "Owner" : esc(a.added_by), a.added ? short(a.added.slice(0, 10)) : "",
      a.owner ? '<span class="muted">Can\'t be removed</span>' : `<button type="button" data-rm="${esc(a.email)}">Remove</button>`]))}
      <label for="adm-email">Add an admin by email</label>
      <div class="row"><input id="adm-email" type="email" placeholder="name@example.com" style="max-width:320px"><button type="button" class="primary" id="adm-add">Add admin</button></div>
      <p class="error" role="alert">${esc(err)}</p>`,
      "Admins see this tab after signing in with that email. They can't see anyone's financial data; nobody can.");
    box.querySelector("#adm-add").onclick = () => act("POST", box.querySelector("#adm-email").value);
    box.querySelectorAll("[data-rm]").forEach((b) => (b.onclick = () => { if (confirm(`Remove ${b.dataset.rm} as admin?`)) act("DELETE", b.dataset.rm); }));
  };
  let current = await api("/api/admin/admins");
  const act = async (method, email) => {
    try { current = await api("/api/admin/admins", { method, body: { email } }); draw(current); }
    catch (e) { draw(current, e.message); }
  };
  draw(current);
}
