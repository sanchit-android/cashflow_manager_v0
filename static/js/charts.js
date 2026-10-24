// Small SVG charts with hover tooltips. No libraries (the app's CSP only allows our own scripts).
// Colours come from CSS tokens (--series-1..4) so themes and dark mode apply; text uses text tokens.

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
import { money, compact as lakh } from "./currency.js";
export { money };

function ticks(min, max, count = 5) {
  if (min === max) max = min + 1;
  const raw = (max - min) / count, mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw);
  const out = [];
  let v = Math.floor(min / step) * step;
  out.push(Math.round(v));
  while (v < max - step * 1e-9) { v += step; out.push(Math.round(v)); } // the top tick always clears the tallest value
  return out;
}

function frame(host, height) {
  const width = Math.max(320, host.clientWidth || 640);
  host.classList.add("chart");
  host.innerHTML = `<svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" role="img"></svg><div class="chart-tip" hidden></div>`;
  return { width, svg: host.querySelector("svg"), tip: host.querySelector(".chart-tip") };
}
function legend(items) {
  return `<div class="chart-legend">${items.map((i) => `<span><i class="${i.line ? "ln" : ""}${i.dashed ? " dash" : ""}" style="--c:${i.color}"></i>${esc(i.name)}</span>`).join("")}</div>`;
}
function showTip(tip, host, x, y, html) {
  tip.innerHTML = html; tip.hidden = false;
  const w = tip.offsetWidth, hw = host.clientWidth;
  tip.style.left = Math.min(Math.max(0, x + 12), hw - w - 4) + "px";
  tip.style.top = Math.max(0, y - 10) + "px";
}

/**
 * Stacked bars with an optional line, one y-axis (all in the user's currency).
 * { labels, stacks: [{name, color, values}], line: {name, color, values}, title }
 */
export function stackedBars(host, { labels, stacks, line, title, height = 260, fmt = money, axis = lakh }) {
  const H = height, pad = { l: 56, r: 12, t: 12, b: 28 };
  const { width, svg, tip } = frame(host, H);
  const totals = labels.map((_, i) => stacks.reduce((x, s) => x + Math.max(0, s.values[i] || 0), 0));
  const lineVals = line ? line.values : [];
  const maxV = Math.max(1, ...totals, ...lineVals.map((v) => v || 0));
  const minV = Math.min(0, ...stacks.flatMap((s) => s.values.map((v) => v || 0)));
  const tk = ticks(minV, maxV);
  const y0 = tk[0], y1 = tk[tk.length - 1];
  const Y = (v) => pad.t + (H - pad.t - pad.b) * (1 - (v - y0) / (y1 - y0));
  const bw = (width - pad.l - pad.r) / labels.length, barW = Math.min(36, bw * 0.62);
  const X = (i) => pad.l + bw * i + bw / 2;
  let g = `<title>${esc(title || "")}</title>`;
  for (const t of tk) g += `<line x1="${pad.l}" x2="${width - pad.r}" y1="${Y(t)}" y2="${Y(t)}" class="${t === 0 ? "c-base" : "c-grid"}"/><text x="${pad.l - 6}" y="${Y(t) + 4}" class="c-axis" text-anchor="end">${axis(t)}</text>`;
  labels.forEach((l, i) => {
    g += `<text x="${X(i)}" y="${H - 8}" class="c-axis" text-anchor="middle">${esc(l)}</text>`;
    let base = 0;
    const segs = stacks.map((s) => ({ s, v: Math.max(0, s.values[i] || 0) })).filter((x) => x.v > 0);
    segs.forEach(({ s, v }, k) => {
      const top = Y(base + v), bot = Y(base);
      const h = Math.max(0, bot - top - (k > 0 ? 2 : 0)); // 2px surface gap between stacked segments
      const r = k === segs.length - 1 ? Math.min(4, h / 2) : 0;
      g += r ? `<path d="M${X(i) - barW / 2},${bot - (k > 0 ? 2 : 0)} V${top + r} q0,-${r} ${r},-${r} H${X(i) + barW / 2 - r} q${r},0 ${r},${r} V${bot - (k > 0 ? 2 : 0)} Z" style="fill:${s.color}"/>`
        : `<rect x="${X(i) - barW / 2}" y="${top}" width="${barW}" height="${h}" style="fill:${s.color}"/>`;
      base += v;
    });
  });
  if (line) {
    const pts = lineVals.map((v, i) => (v == null ? null : [X(i), Y(v)]));
    g += `<polyline points="${pts.filter(Boolean).map((p) => p.join(",")).join(" ")}" fill="none" style="stroke:${line.color}" stroke-width="2" stroke-linejoin="round"/>`;
    g += pts.filter(Boolean).map(([x, y]) => `<circle cx="${x}" cy="${y}" r="4" style="fill:${line.color};stroke:var(--surface)" stroke-width="2"/>`).join("");
  }
  labels.forEach((l, i) => { g += `<rect class="c-hit" data-i="${i}" x="${pad.l + bw * i}" y="${pad.t}" width="${bw}" height="${H - pad.t - pad.b}"/>`; });
  svg.innerHTML = g;
  host.insertAdjacentHTML("afterbegin", legend([...stacks.map((s) => ({ name: s.name, color: s.color })), ...(line ? [{ name: line.name, color: line.color, line: true }] : [])]));
  svg.addEventListener("mousemove", (e) => {
    const hit = e.target.closest(".c-hit"); if (!hit) { tip.hidden = true; return; }
    const i = +hit.dataset.i, rect = host.getBoundingClientRect();
    svg.querySelectorAll(".c-hit.on").forEach((x) => x.classList.remove("on")); hit.classList.add("on");
    showTip(tip, host, e.clientX - rect.left, e.clientY - rect.top,
      `<strong>${esc(labels[i])}</strong>${stacks.map((s) => `<div><i style="--c:${s.color}"></i>${esc(s.name)} <b>${fmt(s.values[i])}</b></div>`).join("")}${line ? `<div><i class="ln" style="--c:${line.color}"></i>${esc(line.name)} <b>${fmt(lineVals[i])}</b></div>` : ""}`);
  });
  svg.addEventListener("mouseleave", () => { tip.hidden = true; svg.querySelectorAll(".c-hit.on").forEach((x) => x.classList.remove("on")); });
}

/**
 * Lines over a shared x axis. { labels, series: [{name, color, values (null = gap), dashed, dots}], markLabel(i) }
 */
export function lines(host, { labels, series, title, everyNth, fmt = money, axis = lakh }) {
  const H = 260, pad = { l: 60, r: 14, t: 14, b: 28 };
  const { width, svg, tip } = frame(host, H);
  const all = series.flatMap((s) => s.values.filter((v) => v != null));
  const tk = ticks(Math.min(0, ...all), Math.max(1, ...all));
  const y0 = tk[0], y1 = tk[tk.length - 1];
  const Y = (v) => pad.t + (H - pad.t - pad.b) * (1 - (v - y0) / (y1 - y0));
  const step = (width - pad.l - pad.r) / Math.max(1, labels.length - 1);
  const X = (i) => pad.l + step * i;
  const nth = everyNth || Math.ceil(labels.length / Math.max(3, Math.floor((width - pad.l) / 72))); // ~72px per label
  let g = `<title>${esc(title || "")}</title>`;
  for (const t of tk) g += `<line x1="${pad.l}" x2="${width - pad.r}" y1="${Y(t)}" y2="${Y(t)}" class="${t === 0 ? "c-base" : "c-grid"}"/><text x="${pad.l - 6}" y="${Y(t) + 4}" class="c-axis" text-anchor="end">${axis(t)}</text>`;
  labels.forEach((l, i) => { if (i % nth === 0) g += `<text x="${X(i)}" y="${H - 8}" class="c-axis" text-anchor="middle">${esc(l)}</text>`; });
  for (const s of series) {
    const segs = []; let cur = [];
    s.values.forEach((v, i) => { if (v == null) { if (cur.length) segs.push(cur); cur = []; } else cur.push([X(i), Y(v)]); });
    if (cur.length) segs.push(cur);
    if (!s.dotsOnly) for (const seg of segs) g += `<polyline points="${seg.map((p) => p.join(",")).join(" ")}" fill="none" style="stroke:${s.color}" stroke-width="2" stroke-linejoin="round" ${s.dashed ? 'stroke-dasharray="5 4"' : ""}/>`;
    if (s.dots || s.dotsOnly) s.values.forEach((v, i) => { if (v != null) g += `<circle cx="${X(i)}" cy="${Y(v)}" r="5" style="fill:${s.color};stroke:var(--surface)" stroke-width="2"/>`; });
  }
  g += `<line class="c-cross" x1="0" x2="0" y1="${pad.t}" y2="${H - pad.b}" visibility="hidden"/>`;
  svg.innerHTML = g;
  host.insertAdjacentHTML("afterbegin", series.length > 1 ? legend(series.map((s) => ({ name: s.name, color: s.color, line: !s.dotsOnly, dashed: s.dashed }))) : "");
  const cross = svg.querySelector(".c-cross");
  svg.addEventListener("mousemove", (e) => {
    const rect = svg.getBoundingClientRect(), scale = width / rect.width;
    const i = Math.max(0, Math.min(labels.length - 1, Math.round(((e.clientX - rect.left) * scale - pad.l) / step)));
    cross.setAttribute("x1", X(i)); cross.setAttribute("x2", X(i)); cross.setAttribute("visibility", "visible");
    const rows = series.filter((s) => s.values[i] != null).map((s) => `<div><i class="${s.dotsOnly ? "" : "ln"}" style="--c:${s.color}"></i>${esc(s.name)} <b>${fmt(s.values[i])}</b></div>`).join("");
    const hr = host.getBoundingClientRect();
    showTip(tip, host, e.clientX - hr.left, e.clientY - hr.top, `<strong>${esc(labels[i])}</strong>${rows || '<div class="muted">No data</div>'}`);
  });
  svg.addEventListener("mouseleave", () => { tip.hidden = true; cross.setAttribute("visibility", "hidden"); });
}

/**
 * Horizontal bars, largest first, each labelled with its value (one series, so no legend).
 * { items: [{ label, value, icon }], color, total }
 */
export function hbars(host, { items, color = "var(--series-1)", title, fmt = money }) {
  host.classList.add("chart", "hbars");
  const max = Math.max(1, ...items.map((i) => Math.abs(i.value)));
  const total = items.reduce((x, i) => x + i.value, 0);
  host.innerHTML = `<div role="list" aria-label="${esc(title || "")}">${items.map((it, i) => {
    const pct = Math.max(0, (it.value / max) * 100);
    return `<div class="hb-row" role="listitem" data-i="${i}"><span class="hb-label">${it.icon || ""}${esc(it.label)}</span>
      <span class="hb-track"><span class="hb-bar" style="width:${pct}%;background:${color}"></span></span>
      <span class="hb-val">${fmt(it.value)}</span></div>`;
  }).join("")}</div><div class="chart-tip" hidden></div>`;
  const tip = host.querySelector(".chart-tip");
  host.addEventListener("mousemove", (e) => {
    const row = e.target.closest(".hb-row"); if (!row) { tip.hidden = true; return; }
    const it = items[+row.dataset.i], r = host.getBoundingClientRect();
    host.querySelectorAll(".hb-row.on").forEach((x) => x.classList.remove("on")); row.classList.add("on");
    showTip(tip, host, e.clientX - r.left, e.clientY - r.top, `<strong>${esc(it.label)}</strong><div>${fmt === money ? "Amount" : "Count"} <b>${fmt(it.value)}</b></div><div>Share of total <b>${total ? Math.round((it.value / total) * 1000) / 10 : 0}%</b></div>${it.count ? `<div>Transactions <b>${it.count}</b></div>` : ""}`);
  });
  host.addEventListener("mouseleave", () => { tip.hidden = true; host.querySelectorAll(".hb-row.on").forEach((x) => x.classList.remove("on")); });
}
