// Screen games: a small cloud on the Month screen opens a menu of games played with
// whatever is on screen. Pong turns every visible box and piece of text into a brick.
//
// The game is a visual layer only. It copies what's on screen into a full-screen canvas,
// hides the originals, and puts them back on Reset. It never reads or writes records,
// sends nothing anywhere, and swallows key presses while running so the grid can't be edited.

const inr = new Intl.NumberFormat("en-IN");
const LIVES = 3;
const BOX_POINTS = 50;
const MAX_BRICKS = 900;

const QUIPS = [
  "Your expenses look very smashable today.",
  "Finally, a guilt-free way to destroy your spending.",
  "The only time breaking the budget is encouraged.",
  "Your accountant will never know.",
  "Rupees go in, points come out.",
  "Tax-free fun. Probably.",
  "Your data stays safe. Only the pixels get hurt.",
  "Swiggy bill too high? Hit it with a ball.",
  "Burn rate, meet paddle.",
  "Every row you smash is one you don't have to look at.",
];

const GAMES = [
  { id: "pong", name: "Pong", line: "Smash every box on screen with a ball. Beat the computer.", ready: true,
    icon: '<path d="M5 5v8M19 11v8"/><circle cx="12" cy="9" r="1.6" fill="currentColor" stroke="none"/>' },
  { id: "burn", name: "Burn", line: "Turn your cursor into a flame thrower. Coming soon, fire extinguisher not included.", ready: false,
    icon: '<path d="M12 3c1 3 4 4.5 4 8.5a4 4 0 0 1-8 0c0-2 1-3 2-4 0 1.5.8 2.5 2 2.5 0-2.5-1.5-4.5 0-7z"/>' },
];

const CLOUD = '<svg viewBox="0 0 40 26" aria-hidden="true"><path class="gc-body" d="M11 23h19a7 7 0 0 0 .8-13.96A9 9 0 0 0 13.2 8.5 7.25 7.25 0 0 0 11 23z"/><circle class="gc-ball" cx="20" cy="15.5" r="2.4"/></svg>';

/** Mount the games cloud into `host` (a span on the Month screen). */
export function mountGamesCloud(host, { track = () => {} } = {}) {
  if (!host) return;
  host.setAttribute("data-game-ui", "");
  host.classList.add("gcloud");
  host.innerHTML = `<button type="button" class="gcloud-btn" aria-haspopup="true" aria-expanded="false" title="Games">${CLOUD}<span class="sr-only">Games</span></button>
    <div class="gcloud-pop" role="menu" hidden>
      <p class="gcloud-quip"></p>
      ${GAMES.map((g) => `<button type="button" role="menuitem" class="gcloud-game" data-game="${g.id}" ${g.ready ? "" : 'aria-disabled="true"'}>
        <svg viewBox="0 0 24 24" aria-hidden="true">${g.icon}</svg>
        <span><strong>${g.name}${g.ready ? "" : ' <em>Soon</em>'}</strong><span>${g.line}</span></span></button>`).join("")}
    </div>`;
  const btn = host.querySelector(".gcloud-btn"), pop = host.querySelector(".gcloud-pop"), quip = host.querySelector(".gcloud-quip");
  let closeT = 0;
  const open = () => {
    clearTimeout(closeT);
    if (!pop.hidden) return;
    quip.textContent = QUIPS[Math.floor(Math.random() * QUIPS.length)];
    pop.hidden = false; btn.setAttribute("aria-expanded", "true");
    document.addEventListener("pointerdown", outside, true);
  };
  const close = () => {
    pop.hidden = true; btn.setAttribute("aria-expanded", "false");
    document.removeEventListener("pointerdown", outside, true);
  };
  const outside = (e) => { if (!host.contains(e.target)) close(); };
  const hoverable = matchMedia("(hover: hover)").matches;
  if (hoverable) {
    host.addEventListener("mouseenter", open);
    host.addEventListener("mouseleave", () => { closeT = setTimeout(close, 250); });
  }
  btn.onclick = () => (pop.hidden ? open() : (hoverable ? null : close()));
  host.addEventListener("keydown", (e) => { if (e.key === "Escape" && !pop.hidden) { close(); btn.focus(); } });
  host.addEventListener("focusout", (e) => { if (!host.contains(e.relatedTarget)) close(); });
  pop.querySelectorAll("[data-game]").forEach((b) => (b.onclick = () => {
    const g = GAMES.find((x) => x.id === b.dataset.game);
    if (!g.ready) { quip.textContent = "Burn is still warming up. Try Pong for now."; return; }
    close(); track("game:" + g.id); Pong.start({ onEnd: () => btn.focus() });
  }));
}

// ---------------- capture: copy what's on screen into bricks ----------------

const isClear = (c) => !c || c === "transparent" || /,\s*0\)$/.test(c) || /\/\s*0\)$/.test(c);
const FORM = "input, select, textarea";

function hasBox(s) {
  if (!isClear(s.backgroundColor) || s.backgroundImage !== "none" || (s.boxShadow && s.boxShadow !== "none")) return true;
  return ["Top", "Right", "Bottom", "Left"].some((k) => parseFloat(s[`border${k}Width`]) > 0 && s[`border${k}Style`] !== "none" && !isClear(s[`border${k}Color`]));
}

function visibleRect(el, W, H) {
  const r = el.getBoundingClientRect();
  if (r.width < 3 || r.height < 3 || r.bottom <= 0 || r.top >= H || r.right <= 0 || r.left >= W) return null;
  // skip things scrolled out of view inside a scrolling box (wide grids)
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    const s = getComputedStyle(p);
    if (s.overflowX !== "visible" || s.overflowY !== "visible") {
      const q = p.getBoundingClientRect();
      if (r.right <= q.left || r.left >= q.right || r.bottom <= q.top || r.top >= q.bottom) return null;
    }
  }
  return r;
}

const shown = (el) => { const s = getComputedStyle(el); return s.visibility !== "hidden" && +s.opacity !== 0; };
const skip = (el) => el.closest("[data-game-ui], script, style, template, noscript");

/** Nearest element that isn't plain inline: the "piece" a text node belongs to. */
function pieceOf(el) {
  while (el && el !== document.body && getComputedStyle(el).display === "inline" && !(el instanceof SVGElement)) el = el.parentElement;
  return el;
}

function collect(W, H) {
  const pieces = new Set();
  // text
  const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.nodeValue.trim() && !n.parentElement.closest("svg") && !skip(n.parentElement) ? 1 : 3),
  });
  let n;
  while ((n = tw.nextNode())) { const p = pieceOf(n.parentElement); if (p && p !== document.body) pieces.add(p); }
  // charts, icons, images, form fields
  document.body.querySelectorAll(`svg, img, canvas, ${FORM}`).forEach((el) => {
    if (skip(el) || el.parentElement.closest("svg")) return;
    pieces.add(el);
  });
  // any box around them (cards, buttons, cells, bars)
  const boxes = new Set();
  for (const p of pieces) {
    for (let a = p.parentElement; a && a !== document.body && a !== document.documentElement; a = a.parentElement) {
      if (boxes.has(a) || pieces.has(a)) continue;
      if (hasBox(getComputedStyle(a))) boxes.add(a);
    }
  }
  // empty boxes with no text (dividers, bars, swatches)
  document.body.querySelectorAll("#root *, header.top *, .demo-bar, .demo-bar *").forEach((el) => {
    if (pieces.has(el) || boxes.has(el) || skip(el) || el.closest("svg") || el.children.length) return;
    if (hasBox(getComputedStyle(el))) boxes.add(el);
  });

  const out = [];
  for (const el of [...pieces, ...boxes]) {
    if (!shown(el)) continue;
    const r = visibleRect(el, W, H);
    if (!r) continue;
    out.push({ el, x: r.left, y: r.top, w: r.width, h: r.height, text: pieces.has(el), alive: true, kids: [], depth: 0 });
    if (out.length >= MAX_BRICKS) break;
  }
  // nest: a brick can only be hit once everything inside it is gone
  const byEl = new Map(out.map((b) => [b.el, b]));
  for (const b of out) {
    for (let a = b.el.parentElement; a; a = a.parentElement) {
      const host = byEl.get(a);
      if (host) { host.kids.push(b); break; }
    }
    let d = 0; for (let a = b.el; a; a = a.parentElement) d++;
    b.depth = d;
  }
  out.sort((a, b) => a.depth - b.depth); // outer boxes draw first
  return out;
}

function rr(g, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

function drawBox(g, s, x, y, w, h) {
  const rad = parseFloat(s.borderTopLeftRadius) || 0;
  if (!isClear(s.backgroundColor)) { g.fillStyle = s.backgroundColor; rr(g, x, y, w, h, rad); g.fill(); }
  const side = (k) => ({ w: parseFloat(s[`border${k}Width`]) || 0, c: s[`border${k}Color`], on: s[`border${k}Style`] !== "none" && !isClear(s[`border${k}Color`]) });
  const t = side("Top"), rgt = side("Right"), b = side("Bottom"), l = side("Left");
  if (t.on && rgt.on && b.on && l.on && t.w === b.w && t.w === l.w && t.w === rgt.w && t.c === b.c) {
    g.strokeStyle = t.c; g.lineWidth = t.w; rr(g, x + t.w / 2, y + t.w / 2, w - t.w, h - t.w, rad); g.stroke();
  } else {
    if (t.on) { g.fillStyle = t.c; g.fillRect(x, y, w, t.w); }
    if (b.on) { g.fillStyle = b.c; g.fillRect(x, y + h - b.w, w, b.w); }
    if (l.on) { g.fillStyle = l.c; g.fillRect(x, y, l.w, h); }
    if (rgt.on) { g.fillStyle = rgt.c; g.fillRect(x + w - rgt.w, y, rgt.w, h); }
  }
}

function setFont(g, s) {
  g.font = `${s.fontStyle} ${s.fontWeight} ${s.fontSize} ${s.fontFamily}`;
  g.fillStyle = s.color; g.textBaseline = "middle"; g.textAlign = "left";
  if ("letterSpacing" in g) g.letterSpacing = s.letterSpacing === "normal" ? "0px" : s.letterSpacing;
}
const cased = (t, s) => (s.textTransform === "uppercase" ? t.toUpperCase() : s.textTransform === "lowercase" ? t.toLowerCase() : t);

/** Draw a piece's own text nodes (and inline chips inside it) at their laid-out positions. */
function drawText(g, el, ox, oy) {
  const tw = document.createTreeWalker(el, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  let n = tw.nextNode();
  while (n) {
    if (n.nodeType === 1) {
      // nested pieces draw themselves
      if (n !== el && (getComputedStyle(n).display !== "inline" || n instanceof SVGElement)) { n = nextOutside(tw, n); continue; }
      const s = getComputedStyle(n);
      if (n !== el && hasBox(s)) for (const b of n.getClientRects()) drawBox(g, s, b.left - ox, b.top - oy, b.width, b.height);
      n = tw.nextNode(); continue;
    }
    const text = n.nodeValue;
    if (text.trim()) {
      const s = getComputedStyle(n.parentElement);
      if (s.visibility !== "hidden") {
        setFont(g, s);
        const range = document.createRange();
        range.selectNodeContents(n);
        const lines = range.getClientRects();
        if (lines.length <= 1) {
          const b = range.getBoundingClientRect();
          if (b.width) {
            const t = cased(text.replace(/\s+/g, " "), s);
            const tw2 = g.measureText(t).width;
            g.save(); g.beginPath(); g.rect(b.left - ox - 2, b.top - oy, b.width + 4, b.height); g.clip();
            // scale slightly so canvas metrics match the browser's (tabular digits etc.)
            const k = tw2 > 0 ? Math.min(1.08, Math.max(0.92, b.width / tw2)) : 1;
            g.translate(b.left - ox, b.top - oy + b.height / 2); g.scale(k, 1); g.fillText(t, 0, 0);
            g.restore();
          }
        } else {
          // wrapped text: place word by word
          const re = /\S+/g; let m;
          while ((m = re.exec(text))) {
            range.setStart(n, m.index); range.setEnd(n, m.index + m[0].length);
            const b = range.getBoundingClientRect();
            if (b.width) g.fillText(cased(m[0], s), b.left - ox, b.top - oy + b.height / 2);
          }
        }
      }
    }
    n = tw.nextNode();
  }
}
function nextOutside(tw, node) {
  tw.currentNode = node;
  let nx = tw.nextSibling();
  for (let p = node; !nx && p; ) { p = tw.parentNode(); if (!p) return null; nx = tw.nextSibling(); }
  return nx;
}

function svgImage(svg, r) {
  return new Promise((resolve) => {
    try {
      const clone = svg.cloneNode(true);
      const src = svg.querySelectorAll("*"), dst = clone.querySelectorAll("*");
      const copy = (a, b) => {
        const s = getComputedStyle(a);
        for (const k of ["fill", "stroke", "stroke-width", "opacity", "fill-opacity", "stroke-opacity", "font-size", "font-family", "font-weight", "color", "visibility"]) b.style.setProperty(k, s.getPropertyValue(k));
      };
      copy(svg, clone); src.forEach((a, i) => copy(a, dst[i]));
      clone.setAttribute("width", r.w); clone.setAttribute("height", r.h);
      clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      const img = new Image();
      img.onload = () => resolve(img); img.onerror = () => resolve(null);
      img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(new XMLSerializer().serializeToString(clone));
    } catch (e) { resolve(null); }
  });
}

async function rasterize(b, dpr, tint) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.ceil(b.w * dpr)); c.height = Math.max(1, Math.ceil(b.h * dpr));
  const g = c.getContext("2d"); g.scale(dpr, dpr);
  const el = b.el, s = getComputedStyle(el);
  if (hasBox(s)) drawBox(g, s, 0, 0, b.w, b.h);
  else if (b.text) { g.fillStyle = tint; rr(g, 0, 0, b.w, b.h, 4); g.fill(); }
  try {
    if (el instanceof SVGSVGElement) {
      const img = await svgImage(el, b);
      if (img) g.drawImage(img, 0, 0, b.w, b.h);
    } else if (el instanceof HTMLImageElement) {
      if (el.complete && el.naturalWidth) g.drawImage(el, 0, 0, b.w, b.h);
    } else if (el instanceof HTMLCanvasElement) {
      g.drawImage(el, 0, 0, b.w, b.h);
    } else if (el.matches(FORM)) {
      const t = el.tagName === "SELECT" ? el.selectedOptions[0]?.text || "" : (el.type === "checkbox" || el.type === "radio") ? (el.checked ? "✓" : "") : (el.value || el.placeholder || "");
      setFont(g, s);
      if (!el.value && el.placeholder) g.globalAlpha = 0.5;
      g.save(); g.beginPath(); g.rect(0, 0, b.w, b.h); g.clip();
      g.fillText(t, parseFloat(s.paddingLeft) || 4, b.h / 2); g.restore();
    } else if (b.text) {
      drawText(g, el, b.x, b.y);
    }
  } catch (e) { /* draw what we can */ }
  return c;
}

// ---------------- the game ----------------

const Pong = (() => {
  let canvas, ctx, ui, W, H, dpr, raf = 0, last = 0, running = false, paused = false;
  let vertical, colors, base, maxSpeed, aiSpeed, onEnd;
  let bricks = [], frags = [], pops = [], trail = [];
  let ball, player, ai, aiErr = 0, state, score, smashed, lives, pointerAlong = null;
  const keys = {};
  const tok = (n, f) => getComputedStyle(document.documentElement).getPropertyValue(n).trim() || f;

  function buildUi() {
    if (canvas) return;
    canvas = document.createElement("canvas");
    canvas.className = "game-stage"; canvas.setAttribute("data-game-ui", ""); canvas.hidden = true;
    canvas.setAttribute("aria-label", "Pong game. Move the pointer or use arrow keys to move your paddle.");
    ctx = canvas.getContext("2d");
    ui = document.createElement("div");
    ui.setAttribute("data-game-ui", ""); ui.hidden = true;
    ui.innerHTML = `<button type="button" class="game-reset">Reset</button>
      <div class="game-msg" hidden></div>
      <div class="game-dialog" role="dialog" aria-live="polite" hidden>
        <h2 class="gd-title"></h2><p>Score</p><div class="gd-score num"></div><p class="gd-detail"></p>
        <div class="gd-actions"><button type="button" class="primary gd-again">Play again</button><button type="button" class="gd-back">Back to month</button></div>
      </div>`;
    document.body.append(canvas, ui);
    ui.querySelector(".game-reset").onclick = stop;
    ui.querySelector(".gd-back").onclick = stop;
    ui.querySelector(".gd-again").onclick = () => { stop(true); start({ onEnd }); };
    canvas.addEventListener("pointermove", setPointer);
    canvas.addEventListener("pointerdown", (e) => { setPointer(e); serve(); });
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("keyup", (e) => { keys[e.key] = false; }, true);
    document.addEventListener("visibilitychange", () => { paused = document.hidden; last = performance.now(); });
    window.addEventListener("resize", () => { if (running) { W = innerWidth; H = innerHeight; size(); place(); } });
  }
  const q = (s) => ui.querySelector(s);

  function onKey(e) {
    if (!running) return;
    if (e.target.closest?.(".game-dialog") && (e.key === "Enter" || e.key === " " || e.key === "Tab")) return; // dialog buttons
    if (e.target.classList?.contains("game-reset") && (e.key === "Enter" || e.key === " ")) return;
    e.stopImmediatePropagation(); // nothing underneath (the grid) sees keys while playing
    if (e.key === "Escape") { e.preventDefault(); stop(); return; }
    if (e.key === " " || e.key === "Enter") { e.preventDefault(); serve(); }
    if (e.key.startsWith("Arrow")) { keys[e.key] = true; e.preventDefault(); }
  }
  function setPointer(e) { pointerAlong = vertical ? e.clientX : e.clientY; }

  async function start(opts = {}) {
    if (running) return;
    buildUi(); onEnd = opts.onEnd;
    document.activeElement?.blur?.();
    try { await document.fonts.ready; } catch (e) { /* ignore */ }
    W = innerWidth; H = innerHeight; dpr = Math.min(2, devicePixelRatio || 1); vertical = H > W;
    colors = {
      surface: tok("--surface", "#fff"), text: tok("--text", "#111"), muted: tok("--muted", "#666"),
      border: tok("--border", "#ccc"), accent: tok("--accent", "#2457c5"), bad: tok("--bad", "#b3261e"),
    };
    const tint = `color-mix(in srgb, ${colors.accent} 9%, transparent)`;
    bricks = collect(W, H);
    if (!bricks.length) return;
    await Promise.all(bricks.map(async (b) => { b.img = await rasterize(b, dpr, tint); }));
    bricks.forEach((b) => { b.prevVis = b.el.style.visibility; b.el.style.visibility = "hidden"; });
    document.documentElement.classList.add("game-on");
    size(); canvas.hidden = false; ui.hidden = false; q(".game-dialog").hidden = true;

    base = Math.max(300, Math.min(520, Math.min(W, H) * 0.75));
    maxSpeed = base * 1.9; aiSpeed = base * 0.72;
    const len = vertical ? Math.min(W * 0.26, 120) : Math.min(H * 0.2, 130);
    player = { len, thick: 10, c: 0, pos: 0 }; ai = { len, thick: 10, c: 0, pos: 0 };
    place(); player.c = ai.c = mid();
    score = 0; smashed = 0; lives = LIVES; frags = []; pops = []; trail = []; pointerAlong = null;
    ready();
    running = true; paused = false; last = performance.now();
    raf = requestAnimationFrame(loop);
  }

  function stop(quiet) {
    cancelAnimationFrame(raf); running = false;
    if (canvas) { canvas.hidden = true; ui.hidden = true; }
    // hidden in reverse so a parent's visibility is restored after its children
    for (let i = bricks.length - 1; i >= 0; i--) bricks[i].el.style.visibility = bricks[i].prevVis || "";
    bricks = []; frags = []; pops = [];
    document.documentElement.classList.remove("game-on");
    if (!quiet) onEnd?.();
  }

  function size() { canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); }
  function place() { if (vertical) { ai.pos = 12; player.pos = H - 28; } else { ai.pos = 14; player.pos = W - 24; } }
  const mid = () => (vertical ? W / 2 : H / 2);
  const span = () => (vertical ? W : H);

  function ready() {
    state = "serve";
    ball = { x: W / 2, y: H / 2, vx: 0, vy: 0, r: 7, speed: base }; trail = [];
    msg(matchMedia("(pointer: coarse)").matches ? "Tap to serve" : "Click or press Space to serve");
  }
  function serve() {
    if (state !== "serve") return;
    state = "play"; q(".game-msg").hidden = true;
    const a = (Math.random() - 0.5) * 0.9;
    if (vertical) { ball.vx = Math.sin(a) * base; ball.vy = -Math.cos(a) * base; } else { ball.vx = -Math.cos(a) * base; ball.vy = Math.sin(a) * base; }
    aiErr = (Math.random() - 0.5) * ai.len * 0.6;
  }
  function msg(t) { const m = q(".game-msg"); m.textContent = t; m.hidden = false; }

  function end(won) {
    state = won ? "won" : "over"; q(".game-msg").hidden = true;
    const left = bricks.filter((b) => b.alive).length;
    q(".gd-title").textContent = won ? "Screen cleared" : "Out of balls";
    q(".gd-score").textContent = inr.format(score);
    q(".gd-detail").textContent = won
      ? `Every box and figure is gone${smashed ? `, ₹${inr.format(smashed)} of it in rupees` : ""}. Reset puts it all back.`
      : `${left} ${left === 1 ? "piece" : "pieces"} still standing. They look smug.`;
    q(".game-dialog").hidden = false; q(".gd-again").focus();
  }

  function loop(t) {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.033, (t - last) / 1000); last = t;
    if (!paused) update(dt);
    draw();
  }

  const clampP = (p) => { p.c = Math.max(p.len / 2, Math.min(span() - p.len / 2, p.c)); };
  function toward(p, goal, step) { const d = goal - p.c; p.c += Math.abs(d) <= step ? d : Math.sign(d) * step; clampP(p); }
  const prect = (p) => (vertical ? { x: p.c - p.len / 2, y: p.pos, w: p.len, h: p.thick } : { x: p.pos, y: p.c - p.len / 2, w: p.thick, h: p.len });

  function update(dt) {
    if (keys.ArrowLeft || keys.ArrowUp) { pointerAlong = null; player.c -= 520 * dt; }
    if (keys.ArrowRight || keys.ArrowDown) { pointerAlong = null; player.c += 520 * dt; }
    if (pointerAlong != null) toward(player, pointerAlong, 2400 * dt); else clampP(player);
    const coming = vertical ? ball.vy < 0 : ball.vx < 0;
    toward(ai, state === "play" && coming ? (vertical ? ball.x : ball.y) + aiErr : mid(), aiSpeed * dt);
    if (state === "serve") { ball.x = W / 2; ball.y = H / 2; }
    if (state === "play") step(dt);
    for (const f of frags) { f.vy += 1100 * dt; f.x += f.vx * dt; f.y += f.vy * dt; f.a += f.va * dt; f.life -= dt; }
    frags = frags.filter((f) => f.life > 0 && f.y < H + 80);
    for (const p of pops) { p.y -= 40 * dt; p.life -= dt; }
    pops = pops.filter((p) => p.life > 0);
  }

  function step(dt) {
    const n = Math.max(1, Math.ceil((ball.speed * dt) / (ball.r * 0.6))), h = dt / n;
    for (let i = 0; i < n && state === "play"; i++) {
      ball.x += ball.vx * h; ball.y += ball.vy * h;
      if (vertical) {
        if (ball.x < ball.r) { ball.x = ball.r; ball.vx = Math.abs(ball.vx); }
        if (ball.x > W - ball.r) { ball.x = W - ball.r; ball.vx = -Math.abs(ball.vx); }
      } else {
        if (ball.y < ball.r) { ball.y = ball.r; ball.vy = Math.abs(ball.vy); }
        if (ball.y > H - ball.r) { ball.y = H - ball.r; ball.vy = -Math.abs(ball.vy); }
      }
      paddle(ai, false); paddle(player, true); hitBricks();
      if (vertical ? ball.y < -ball.r : ball.x < -ball.r) {
        score += 250;
        pops.push({ x: vertical ? ball.x : 100, y: vertical ? 50 : ball.y, text: "+250 · computer missed", life: 1.4 });
        ready();
      } else if (vertical ? ball.y > H + ball.r : ball.x > W + ball.r) {
        lives -= 1; if (lives <= 0) end(false); else ready();
      }
    }
    trail.push({ x: ball.x, y: ball.y }); if (trail.length > 8) trail.shift();
  }

  function circleRect(r) {
    const nx = Math.max(r.x, Math.min(ball.x, r.x + r.w)), ny = Math.max(r.y, Math.min(ball.y, r.y + r.h));
    const dx = ball.x - nx, dy = ball.y - ny;
    return dx * dx + dy * dy <= ball.r * ball.r ? { dx, dy } : null;
  }

  function paddle(p, isPlayer) {
    const r = prect(p);
    if (!circleRect(r)) return;
    const away = isPlayer ? -1 : 1;
    if (Math.sign(vertical ? ball.vy : ball.vx) === away) return;
    const off = Math.max(-1, Math.min(1, ((vertical ? ball.x : ball.y) - p.c) / (p.len / 2)));
    ball.speed = Math.min(maxSpeed, ball.speed * 1.045);
    if (vertical) { ball.vy = away * Math.cos(off) * ball.speed; ball.vx = Math.sin(off) * ball.speed; ball.y = isPlayer ? r.y - ball.r : r.y + r.h + ball.r; }
    else { ball.vx = away * Math.cos(off) * ball.speed; ball.vy = Math.sin(off) * ball.speed; ball.x = isPlayer ? r.x - ball.r : r.x + r.w + ball.r; }
    if (isPlayer) { score += 10; aiErr = (Math.random() - 0.5) * ai.len * 1.1; }
  }

  const hittable = (b) => b.alive && b.kids.every((k) => !k.alive);

  function hitBricks() {
    // innermost first, so the ball meets text before the card around it
    for (let i = bricks.length - 1; i >= 0; i--) {
      const b = bricks[i];
      if (!hittable(b)) continue;
      const hit = circleRect(b);
      if (!hit) continue;
      let { dx, dy } = hit;
      if (!dx && !dy) { dx = -ball.vx; dy = -ball.vy; }
      if (Math.abs(dx) > Math.abs(dy)) ball.vx = Math.sign(dx) * Math.abs(ball.vx); else ball.vy = Math.sign(dy) * Math.abs(ball.vy);
      smash(b); return;
    }
  }

  // rupee amounts in a piece's text become bonus points
  const rupees = (el) => {
    const m = (el.textContent || "").match(/[₹$€£]\s?-?[\d,]+(\.\d+)?/);
    return m ? Math.abs(parseFloat(m[0].replace(/[^\d.-]/g, ""))) || 0 : 0;
  };

  function smash(b) {
    b.alive = false;
    const amt = b.text && b.el.children.length < 4 ? rupees(b.el) : 0;
    const pts = b.text ? Math.max(5, Math.round(amt / 100)) : BOX_POINTS;
    score += pts; smashed += amt;
    pops.push({ x: b.x + b.w / 2, y: Math.max(20, Math.min(H - 20, b.y + b.h / 2)), text: `+${inr.format(pts)}`, life: 1 });
    const calm = matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.dataset.motion === "none";
    const sz = Math.max(14, Math.sqrt((b.w * b.h) / (calm ? 6 : b.text ? 30 : 60)));
    const cols = Math.min(24, Math.ceil(b.w / sz)), rows = Math.min(24, Math.ceil(b.h / sz));
    const cw = b.w / cols, ch = b.h / rows;
    if (frags.length < 1200) for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      const cx = b.x + (i + 0.5) * cw, cy = b.y + (j + 0.5) * ch;
      if (cy - ch / 2 > H || cy + ch / 2 < 0) continue;
      const ax = cx - ball.x, ay = cy - ball.y, d = Math.hypot(ax, ay) || 1, kick = 120 + Math.random() * 160;
      frags.push({ img: b.img, sx: i * cw, sy: j * ch, sw: cw, sh: ch, x: cx, y: cy,
        vx: (ax / d) * kick + ball.vx * 0.12 + (Math.random() - 0.5) * 60, vy: (ay / d) * kick - 160 - Math.random() * 120,
        a: 0, va: (Math.random() - 0.5) * 9, life: 1.1 + Math.random() * 0.5 });
    }
    if (bricks.every((x) => !x.alive)) setTimeout(() => running && state === "play" && end(true), 500);
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.globalAlpha = 0.12; ctx.fillStyle = colors.text; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.font = `700 ${Math.round(Math.min(W, H) * 0.24)}px system-ui, sans-serif`;
    ctx.fillText(inr.format(score), W / 2, H / 2);
    ctx.globalAlpha = 0.3; ctx.strokeStyle = colors.muted; ctx.setLineDash([6, 10]); ctx.lineWidth = 2; ctx.beginPath();
    if (vertical) { ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); } else { ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H); }
    ctx.stroke(); ctx.restore();

    for (const b of bricks) if (b.alive) ctx.drawImage(b.img, b.x, b.y, b.w, b.h);
    for (const f of frags) {
      ctx.save(); ctx.globalAlpha = Math.max(0, Math.min(1, f.life / 0.5));
      ctx.translate(f.x, f.y); ctx.rotate(f.a);
      ctx.drawImage(f.img, f.sx * dpr, f.sy * dpr, f.sw * dpr, f.sh * dpr, -f.sw / 2, -f.sh / 2, f.sw, f.sh);
      ctx.restore();
    }
    const pr = prect(player), ar = prect(ai);
    ctx.fillStyle = colors.accent; rr(ctx, pr.x, pr.y, pr.w, pr.h, 5); ctx.fill();
    ctx.fillStyle = colors.text; rr(ctx, ar.x, ar.y, ar.w, ar.h, 5); ctx.fill();
    trail.forEach((p, i) => {
      ctx.globalAlpha = ((i + 1) / trail.length) * 0.25; ctx.fillStyle = colors.accent;
      ctx.beginPath(); ctx.arc(p.x, p.y, ball.r * (0.5 + i / trail.length / 2), 0, Math.PI * 2); ctx.fill();
    });
    ctx.globalAlpha = 1; ctx.fillStyle = colors.accent;
    ctx.beginPath(); ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = colors.text; ctx.globalAlpha = 0.5; ctx.lineWidth = 1.5; ctx.stroke(); ctx.globalAlpha = 1;
    ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.font = "600 15px ui-monospace, Menlo, monospace";
    for (const p of pops) {
      ctx.globalAlpha = Math.min(1, p.life * 1.6);
      ctx.lineWidth = 4; ctx.strokeStyle = colors.surface; ctx.strokeText(p.text, p.x, p.y);
      ctx.fillStyle = colors.accent; ctx.fillText(p.text, p.x, p.y);
    }
    ctx.globalAlpha = 1;
    status();
  }

  function status() {
    const text = `Score ${inr.format(score)}`;
    ctx.font = "600 12px ui-monospace, Menlo, monospace";
    const tw = ctx.measureText(text).width, dots = LIVES * 14, w = dots + tw + 32, h = 26;
    const x = W / 2 - w / 2, y = vertical ? 32 : 10;
    ctx.globalAlpha = 0.9; ctx.fillStyle = colors.surface; rr(ctx, x, y, w, h, 13); ctx.fill();
    ctx.globalAlpha = 1; ctx.strokeStyle = colors.border; ctx.lineWidth = 1; ctx.stroke();
    for (let i = 0; i < LIVES; i++) {
      ctx.beginPath(); ctx.arc(x + 17 + i * 14, y + h / 2, 4.5, 0, Math.PI * 2);
      if (i < lives) { ctx.fillStyle = colors.accent; ctx.fill(); } else { ctx.strokeStyle = colors.muted; ctx.lineWidth = 1.2; ctx.stroke(); }
    }
    ctx.fillStyle = colors.text; ctx.textAlign = "left"; ctx.textBaseline = "middle";
    ctx.fillText(text, x + 12 + dots + 8, y + h / 2 + 1);
  }

  return { start, stop, get running() { return running; } };
})();

export const stopGames = () => { if (Pong.running) Pong.stop(true); };
