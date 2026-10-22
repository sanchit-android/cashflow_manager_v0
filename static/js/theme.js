// Loaded in <head> so the saved theme paints before anything else (no flash).
try { document.documentElement.dataset.theme = localStorage.getItem("theme") || "paper"; } catch (e) { /* storage blocked */ }
