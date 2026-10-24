// Safe evaluator for custom "Other numbers" formulas. No eval: a tiny recursive-descent parser.
// Supports numbers, variables, + - * / %, parentheses, unary minus and the functions below.

const FUNCS = {
  min: (...a) => Math.min(...a),
  max: (...a) => Math.max(...a),
  abs: (x) => Math.abs(x),
  round: (x, d = 0) => { const f = 10 ** d; return Math.round(x * f) / f; },
  avg: (...a) => a.reduce((x, y) => x + y, 0) / a.length,
  sum: (...a) => a.reduce((x, y) => x + y, 0),
  // pct(a, b) = a as a percent of b
  pct: (a, b) => (b ? (a / b) * 100 : null),
};
export const FUNCTION_NAMES = Object.keys(FUNCS);

function tokenize(src) {
  const out = [], re = /\s*(?:(\d+(?:\.\d+)?|\.\d+)|([A-Za-z_][A-Za-z0-9_]*)|(.))/gy;
  let m;
  while (re.lastIndex < src.length && (m = re.exec(src))) {
    if (m[1]) out.push({ t: "num", v: parseFloat(m[1]) });
    else if (m[2]) out.push({ t: "id", v: m[2] });
    else if (m[3] && m[3].trim()) {
      if (!"+-*/%(),".includes(m[3])) throw new Error(`Unexpected "${m[3]}"`);
      out.push({ t: m[3] });
    }
  }
  return out;
}

/** Parse into a tree. Throws a readable Error on bad syntax or unknown names. */
export function parse(src, varNames) {
  const toks = tokenize(String(src || ""));
  if (!toks.length) throw new Error("Enter a formula");
  let i = 0;
  const peek = () => toks[i], next = () => toks[i++];
  const expect = (t) => { if (!peek() || peek().t !== t) throw new Error(`Expected "${t}"`); i++; };
  function expr() {
    let n = term();
    while (peek() && (peek().t === "+" || peek().t === "-")) n = { op: next().t, a: n, b: term() };
    return n;
  }
  function term() {
    let n = unary();
    while (peek() && "*/%".includes(peek().t) && peek().t.length === 1) n = { op: next().t, a: n, b: unary() };
    return n;
  }
  function unary() {
    if (peek() && peek().t === "-") { next(); return { op: "neg", a: unary() }; }
    if (peek() && peek().t === "+") { next(); return unary(); }
    return atom();
  }
  function atom() {
    const tk = next();
    if (!tk) throw new Error("Formula ends too early");
    if (tk.t === "num") return { num: tk.v };
    if (tk.t === "(") { const n = expr(); expect(")"); return n; }
    if (tk.t === "id") {
      if (peek() && peek().t === "(") {
        if (!FUNCS[tk.v]) throw new Error(`Unknown function "${tk.v}"`);
        next();
        const args = [];
        if (peek() && peek().t !== ")") { args.push(expr()); while (peek() && peek().t === ",") { next(); args.push(expr()); } }
        expect(")");
        if (!args.length) throw new Error(`${tk.v}() needs a value`);
        return { fn: tk.v, args };
      }
      if (varNames && !varNames.includes(tk.v)) throw new Error(`Unknown number "${tk.v}"`);
      return { v: tk.v };
    }
    throw new Error(`Unexpected "${tk.t}"`);
  }
  const tree = expr();
  if (i < toks.length) throw new Error(`Unexpected "${toks[i].v ?? toks[i].t}"`);
  return tree;
}

/** Evaluate a tree. Missing values or division by zero give null (shown as "–"). */
function run(n, vars) {
  if ("num" in n) return n.num;
  if ("v" in n) { const x = vars[n.v]; return x == null || !isFinite(x) ? null : +x; }
  if (n.fn) {
    const args = n.args.map((a) => run(a, vars));
    if (args.some((x) => x == null)) return null;
    const r = FUNCS[n.fn](...args);
    return r == null || !isFinite(r) ? null : r;
  }
  const a = run(n.a, vars);
  if (n.op === "neg") return a == null ? null : -a;
  const b = run(n.b, vars);
  if (a == null || b == null) return null;
  if (n.op === "+") return a + b;
  if (n.op === "-") return a - b;
  if (n.op === "*") return a * b;
  if (b === 0) return null;
  return n.op === "/" ? a / b : a % b;
}

export function evaluate(src, vars) {
  try { return run(parse(src), vars); } catch (e) { return null; }
}
