// Loaded in <head> so the saved theme (including a custom one) paints before anything else.
try {
  const de = document.documentElement, t = localStorage.getItem("theme") || "excel";
  const custom = t === "custom" ? JSON.parse(localStorage.getItem("themeVars") || "null") : null;
  de.dataset.theme = custom ? custom.base || "excel" : t;
  if (custom) for (const k in custom.vars) de.style.setProperty(k, custom.vars[k]);
} catch (e) { /* storage blocked */ }
