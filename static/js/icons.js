// Category icons: simple 24×24 line drawings, bundled with the app (no external scripts can load under our CSP).
const P = {
  Food: '<path d="M7 3v8a2 2 0 0 0 2 2v8M5 3v5a2 2 0 0 0 4 0V3M17 21V3c-2 1-3 4-3 7a2 2 0 0 0 2 2h1"/>',
  Grocery: '<circle cx="9" cy="20" r="1.4"/><circle cx="17" cy="20" r="1.4"/><path d="M3 4h2l2.4 11h11l2-8H6.2"/>',
  Utilities: '<path d="M13 3 5 14h6l-1 7 8-11h-6l1-7Z"/>',
  Vehicle: '<path d="M5 16h14v-4l-2-5H7l-2 5v4Zm0 0v2m14-2v2M5 12h14"/><circle cx="8" cy="14" r=".8"/><circle cx="16" cy="14" r=".8"/>',
  Health: '<path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10Z"/><path d="M8.5 11h2l1-2 1.5 4 1-2h1.5"/>',
  Travel: '<path d="M3 13 21 6l-5 14-3.5-5.5L3 13Zm9.5 1.5L21 6"/>',
  Holiday: '<path d="M3 12a9 9 0 0 1 18 0H3Zm9 0v6a2 2 0 0 0 4 0"/>',
  Entertainment: '<path d="M4 7h16v3a2 2 0 0 0 0 4v3H4v-3a2 2 0 0 0 0-4V7Z"/><path d="M14 7v10" stroke-dasharray="2 2"/>',
  Shopping: '<path d="M6 8h12l-1 12H7L6 8Zm3 0V6a3 3 0 0 1 6 0v2"/>',
  Transport: '<rect x="5" y="4" width="14" height="13" rx="2"/><path d="M5 11h14M8 17v2m8-2v2"/><circle cx="8.5" cy="14" r=".7"/><circle cx="15.5" cy="14" r=".7"/>',
  Personal: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/>',
  Household: '<path d="M4 11 12 4l8 7v9H4v-9Zm6 9v-5h4v5"/>',
  Education: '<path d="M2 9l10-5 10 5-10 5L2 9Zm4 2v5c3 2 9 2 12 0v-5"/>',
  Insurance: '<path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6l7-3Z"/><path d="m9 12 2 2 4-4"/>',
  Rent: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9m-4 4 2 2m-5 1 2 2"/>',
  Family: '<circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 12 0"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14a5 5 0 0 1 5 5"/>',
  Gift: '<rect x="4" y="9" width="16" height="11" rx="1"/><path d="M3 9h18M12 9v11M12 9c-2-4-6-4-6-1.5S12 9 12 9Zm0 0c2-4 6-4 6-1.5S12 9 12 9Z"/>',
  Emergency: '<path d="M12 3 2 20h20L12 3Zm0 6v5m0 3v.5"/>',
  Annual: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4m6-4v4"/>',
  Other: '<circle cx="6" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="18" cy="12" r="1.2"/>',
};

/** Inline SVG for a category (falls back to "Other"). Decorative: the category name is always shown beside it. */
export function catIcon(category) {
  const path = P[category] || P.Other;
  return `<span class="cat-ico" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${path}</svg></span>`;
}
