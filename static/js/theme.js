// Loaded in <head> so the saved theme (including a custom one) paints before anything else.
try {
  const de = document.documentElement, t = localStorage.getItem("theme") || "excel";
  const custom = t === "custom" ? JSON.parse(localStorage.getItem("themeVars") || "null") : null;
  de.dataset.theme = custom ? custom.base || "excel" : t;
  if (custom) for (const k in custom.vars) de.style.setProperty(k, custom.vars[k]);
} catch (e) { /* storage blocked */ }
// Screen transition style: fade (default), slide or none. Reduced-motion users get none unless they chose otherwise.
try {
  const m = localStorage.getItem("motion");
  document.documentElement.dataset.motion = m || (matchMedia("(prefers-reduced-motion: reduce)").matches ? "none" : "fade");
} catch (e) { document.documentElement.dataset.motion = "fade"; }
