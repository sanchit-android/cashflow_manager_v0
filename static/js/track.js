// Usage counts and browser errors for the admin dashboard.
// Only fixed labels from our own code are sent ("tab:month", "click:settings:export", "save:transaction").
// Never values, amounts, names or anything the user typed.

const queue = new Map();
let errors = [];
let timer = null;

const clean = (s) => String(s).toLowerCase().replace(/[^a-z0-9:_-]/g, "").slice(0, 48);

export function track(name, n = 1) {
  const k = clean(name);
  if (!k) return;
  queue.set(k, (queue.get(k) || 0) + n);
  if (!timer) timer = setTimeout(flush, 30000);
}

function csrf() {
  const m = document.cookie.match(/(?:^|; )csrftoken=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : "";
}

export function flush() {
  clearTimeout(timer); timer = null;
  if (!queue.size && !errors.length) return;
  const body = JSON.stringify({ events: Object.fromEntries(queue), errors });
  queue.clear(); errors = [];
  fetch("/api/telemetry", { method: "POST", credentials: "same-origin", keepalive: true,
    headers: { "Content-Type": "application/json", "X-CSRFToken": csrf() }, body }).catch(() => {});
}

// Error messages are kept short and file paths reduced to the file name.
function reportError(message, where, stack) {
  if (errors.length >= 5) return;
  errors.push({ message: String(message || "Error").slice(0, 300), where: String(where || "").split("/").pop().slice(0, 200),
    stack: String(stack || "").replace(/https?:\/\/[^/\s)]+/g, "").slice(0, 2000) });
  if (!timer) timer = setTimeout(flush, 5000);
}

export function startTracking(tabOf) {
  window.addEventListener("error", (e) => reportError(e.message, `${e.filename}:${e.lineno}:${e.colno}`, e.error && e.error.stack));
  window.addEventListener("unhandledrejection", (e) => {
    const r = e.reason || {};
    if (r.message === "Signed out") return;
    reportError(r.message || String(r), "promise", r.stack);
  });
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flush(); });
  // Buttons: named by their id or their first data-* attribute; both are fixed in code.
  document.addEventListener("click", (e) => {
    const b = e.target.closest("button, a.button, [data-track]");
    if (!b || b.closest("#bottomnav, #tabs") || tabOf() === "admin") return; // tab switches are counted separately
    const name = b.dataset.track || b.id || Object.keys(b.dataset)[0];
    if (name) track(`click:${tabOf()}:${name}`);
  }, true);
  // Inputs: count that a setting or what-if slider was changed, never its value.
  document.addEventListener("change", (e) => {
    const el = e.target;
    if (!el.id || !el.matches("input, select") || tabOf() === "admin" || el.type === "password" || el.type === "file") return;
    track(el.id.startsWith("wf-") ? `whatif:${el.id.slice(3)}` : `change:${tabOf()}:${el.id}`);
  }, true);
}
