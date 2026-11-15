// Loaded in <head> so the saved theme (including a custom one) paints before anything else.
try {
  // Keep in sync with THEMES / LEGACY_THEME in app.js.
  const keep = ["clean", "paper", "excel", "planned", "glass"];
  const legacy = { night: "planned", "metro-dark": "planned", "glass-dark": "planned", ink: "clean", "metro-light": "clean" };
  const fix = (k) => (keep.includes(k) ? k : legacy[k] || (k ? "paper" : "clean"));
  const de = document.documentElement, t = localStorage.getItem("theme") || "clean";
  const custom = t === "custom" ? JSON.parse(localStorage.getItem("themeVars") || "null") : null;
  de.dataset.theme = custom ? fix(custom.base) : fix(t);
  if (custom) for (const k in custom.vars) de.style.setProperty(k, custom.vars[k]);
} catch (e) { /* storage blocked */ }
// Screen transition style: fade (default), slide or none. Reduced-motion users get none unless they chose otherwise.
try {
  const m = localStorage.getItem("motion");
  document.documentElement.dataset.motion = m || (matchMedia("(prefers-reduced-motion: reduce)").matches ? "none" : "fade");
} catch (e) { document.documentElement.dataset.motion = "fade"; }
