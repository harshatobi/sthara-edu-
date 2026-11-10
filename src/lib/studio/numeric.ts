/**
 * Numerical answer check. Pure.
 *
 * The AI's arithmetic is never trusted: the checker writes its working as an expression, this evaluates it, and
 * the result must match the question's key. The grammar is deliberately small (no variables, no assignments,
 * nothing that runs code): numbers, + - * / ^, unary minus, brackets, and a short whitelist of functions and
 * constants. Trig takes degrees, as school questions do.
 */

const FUNCS: Record<string, (x: number) => number> = {
  sqrt: Math.sqrt, cbrt: Math.cbrt, abs: Math.abs,
  sin: x => Math.sin((x * Math.PI) / 180), cos: x => Math.cos((x * Math.PI) / 180), tan: x => Math.tan((x * Math.PI) / 180),
  asin: x => (Math.asin(x) * 180) / Math.PI, acos: x => (Math.acos(x) * 180) / Math.PI, atan: x => (Math.atan(x) * 180) / Math.PI,
  log: Math.log10, log10: Math.log10, ln: Math.log, exp: Math.exp,
};
const CONSTS: Record<string, number> = { pi: Math.PI, e: Math.E };

type Tok = { t: 'num'; v: number } | { t: 'op'; v: string } | { t: 'id'; v: string } | { t: '(' } | { t: ')' };

function tokenize(src: string): Tok[] | null {
  const s = src.replace(/×|·/g, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/π/g, 'pi').replace(/√/g, 'sqrt');
  const out: Tok[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    const num = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(s.slice(i));
    if (num) { out.push({ t: 'num', v: Number(num[0]) }); i += num[0].length; continue; }
    const id = /^[a-z][a-z0-9]*/i.exec(s.slice(i));
    if (id) { out.push({ t: 'id', v: id[0].toLowerCase() }); i += id[0].length; continue; }
    if ('+-*/^'.includes(c)) { out.push({ t: 'op', v: c }); i++; continue; }
    if (c === '(' || c === '[') { out.push({ t: '(' }); i++; continue; }
    if (c === ')' || c === ']') { out.push({ t: ')' }); i++; continue; }
    return null;
  }
  return out;
}

/** Evaluates a whitelisted arithmetic expression; null for anything it doesn't understand or a non-finite result. */
export function evaluate(expr: string): number | null {
  if (typeof expr !== 'string' || expr.length > 400) return null;
  const parsed = tokenize(expr);
  if (!parsed || !parsed.length) return null;
  const toks: Tok[] = parsed;
  let p = 0;
  const peek = () => toks[p];
  // expr := term (('+'|'-') term)* ; term := unary (('*'|'/') unary | implicit-multiply)* ; unary := '-' unary | power
  // power := atom ('^' unary)? ; atom := num | const | func '(' expr ')' | '(' expr ')'
  function expr_(): number { let v = term(); while (peek()?.t === 'op' && ((peek() as any).v === '+' || (peek() as any).v === '-')) { const o = (toks[p++] as any).v; const r = term(); v = o === '+' ? v + r : v - r; } return v; }
  function term(): number {
    let v = unary();
    for (;;) {
      const t = peek();
      if (t?.t === 'op' && (t.v === '*' || t.v === '/')) { p++; const r = unary(); v = t.v === '*' ? v * r : v / r; continue; }
      if (t && (t.t === '(' || t.t === 'num' || t.t === 'id')) { v *= unary(); continue; } // 2pi, 3(4)
      return v;
    }
  }
  function unary(): number { const t = peek(); if (t?.t === 'op' && (t.v === '-' || t.v === '+')) { p++; const v = unary(); return t.v === '-' ? -v : v; } return power(); }
  function power(): number { const b = atom(); const t = peek(); if (t?.t === 'op' && t.v === '^') { p++; return b ** unary(); } return b; }
  function atom(): number {
    const t = toks[p++];
    if (!t) throw new Error('end');
    if (t.t === 'num') return t.v;
    if (t.t === '(') { const v = expr_(); if (toks[p++]?.t !== ')') throw new Error(')'); return v; }
    if (t.t === 'id') {
      if (t.v in CONSTS) return CONSTS[t.v];
      const f = FUNCS[t.v];
      if (!f || toks[p++]?.t !== '(') throw new Error('fn');
      const v = expr_(); if (toks[p++]?.t !== ')') throw new Error(')');
      return f(v);
    }
    throw new Error('tok');
  }
  try {
    const v = expr_();
    return p === toks.length && Number.isFinite(v) ? v : null;
  } catch { return null; }
}

/**
 * The number in an answer as students write it: "2 x 10^8 m/s", "2×10⁸", "3.0e8", "1/2", "-0.25 D", "45°".
 * Units after the number are ignored; null when there's no number.
 */
export function parseAnswerNumber(text: string): number | null {
  if (typeof text !== 'string') return null;
  const sup: Record<string, string> = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁻': '-' };
  const s = text.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+/g, m => `^${[...m].map(c => sup[c]).join('')}`).replace(/−/g, '-').replace(/,(?=\d{3}\b)/g, '');
  const m = /(-?\d+(?:\.\d+)?(?:e[+-]?\d+)?)(?:\s*\/\s*(\d+(?:\.\d+)?))?(?:\s*[x×*]\s*10\s*\^\s*\(?\s*(-?\d+)\s*\)?)?/i.exec(s);
  if (!m) return null;
  let v = Number(m[1]);
  if (m[2]) v /= Number(m[2]);
  if (m[3]) v *= 10 ** Number(m[3]);
  return Number.isFinite(v) ? v : null;
}

/** Equal within a relative tolerance (default 1%, generous for rounded school answers), or absolutely near 0. */
export function close(a: number, b: number, rel = 0.01): boolean {
  if (a === b) return true;
  const scale = Math.max(Math.abs(a), Math.abs(b));
  return scale < 1e-9 ? true : Math.abs(a - b) / scale <= rel;
}

/**
 * Checks a numerical key against the checker's own working. For a choice question, `key` is the text of the
 * marked option; it must hold the computed value, and no other option may hold it as well.
 */
export function checkNumeric(input: { expression: string; key: string | number; options?: string[]; answer?: number }):
  { ok: boolean; computed: number | null; note: string } {
  const computed = evaluate(input.expression);
  if (computed === null) return { ok: false, computed, note: 'The working couldn’t be evaluated.' };
  const keyVal = typeof input.key === 'number' ? input.key : parseAnswerNumber(input.key);
  if (keyVal === null) return { ok: false, computed, note: 'The answer key has no number to compare.' };
  if (!close(keyVal, computed)) return { ok: false, computed, note: `The key says ${fmt(keyVal)}, but the working gives ${fmt(computed)}.` };
  if (input.options && typeof input.answer === 'number') {
    const others = input.options.map((o, i) => (i === input.answer ? null : parseAnswerNumber(o))).filter((v): v is number => v !== null && close(v, computed));
    if (others.length) return { ok: false, computed, note: 'Another option also matches the worked answer.' };
  }
  return { ok: true, computed, note: 'Answer worked out separately and matches.' };
}

const fmt = (v: number) => (Math.abs(v) >= 1e5 || (Math.abs(v) > 0 && Math.abs(v) < 1e-3) ? v.toExponential(3) : String(Number(v.toPrecision(6))));
