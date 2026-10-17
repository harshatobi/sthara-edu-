/**
 * Diagrams the Copilot draws arrive as SVG text from a model. They are never
 * trusted: this re-builds the drawing from a whitelist of shapes and
 * attributes, so scripts, event handlers, links, embedded HTML, external
 * images and CSS cannot survive. The result is also shown through an <img>,
 * where browsers never run code, as a second wall.
 */

const ELEMENTS = new Set(['svg', 'g', 'path', 'line', 'polyline', 'polygon', 'rect', 'circle', 'ellipse', 'text', 'tspan', 'defs', 'marker', 'title', 'desc']);

const ATTRS = new Set([
  'viewBox', 'width', 'height', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'd', 'points', 'dx', 'dy',
  'fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-linecap', 'stroke-linejoin', 'fill-opacity', 'stroke-opacity', 'opacity',
  'font-size', 'font-weight', 'font-style', 'font-family', 'text-anchor', 'dominant-baseline', 'transform', 'id',
  'marker-start', 'marker-mid', 'marker-end', 'markerWidth', 'markerHeight', 'refX', 'refY', 'orient', 'markerUnits', 'preserveAspectRatio',
]);

/** Values may only be numbers, colours, path data, ids, and url(#local-id) for markers. */
const SAFE_VALUE = /^[\w\s#.,%()+\-:/]*$/;
const MAX_LENGTH = 40_000;
const MAX_ELEMENTS = 600;

const escapeText = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeAttr = (s: string) => escapeText(s).replace(/"/g, '&quot;');

/** Basic XML entities in text and attribute values, decoded so they are escaped once on the way out. */
const decode = (s: string) => s.replace(/&(lt|gt|amp|quot|apos|#\d+|#x[0-9a-f]+);/gi, (m, e: string) => {
  const k = e.toLowerCase();
  if (k === 'lt') return '<'; if (k === 'gt') return '>'; if (k === 'amp') return '&'; if (k === 'quot') return '"'; if (k === 'apos') return "'";
  const code = k.startsWith('#x') ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10);
  return Number.isFinite(code) && code > 31 && code < 0x10ffff ? String.fromCodePoint(code) : '';
});

function cleanValue(name: string, raw: string): string | null {
  const v = decode(raw).trim();
  if (v.length > 4000 || !SAFE_VALUE.test(v)) return null;
  if (/url\s*\(/i.test(v) && !/^url\(#[\w-]+\)$/.test(v)) return null; // only local marker references
  if (/(script|javascript|data:|expression)/i.test(v)) return null;
  if (name === 'id' && !/^[\w-]{1,40}$/.test(v)) return null;
  return v;
}

/**
 * Returns a clean, self-contained SVG string, or null when the input isn't a
 * usable drawing (no <svg> root, too big, or nothing drawable left).
 */
export function sanitizeSvg(input: unknown): string | null {
  if (typeof input !== 'string' || input.length > MAX_LENGTH) return null;
  const src = input.replace(/<!--[\s\S]*?-->/g, '').replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '').replace(/<\?[\s\S]*?\?>/g, '').replace(/<!DOCTYPE[^>]*>/gi, '');
  const out: string[] = [];
  const stack: string[] = [];
  // Inside an element we refuse, everything is dropped until that element closes. Only opens and closes of
  // the same name are counted, so stray unclosed HTML (<img>, <br>) inside it can't swallow the rest.
  let skipName: string | null = null, skipDepth = 0;
  let count = 0, sawRoot = false, drawables = 0;
  const tag = /<\s*(\/)?\s*([a-zA-Z][\w:-]*)([^>]*?)(\/)?\s*>|([^<]+)/g;
  let m: RegExpExecArray | null;
  while ((m = tag.exec(src))) {
    const [, closing, name, rawAttrs, selfClosing, text] = m;
    if (skipName) {
      if (name === skipName && !selfClosing) skipDepth += closing ? -1 : 1;
      if (skipDepth === 0) skipName = null;
      continue;
    }
    if (text !== undefined) {
      if (!stack.length) continue;
      const top = stack[stack.length - 1];
      if ((top === 'text' || top === 'tspan' || top === 'title' || top === 'desc') && text.trim()) out.push(escapeText(decode(text)));
      continue;
    }
    const allowed = ELEMENTS.has(name) && (name === 'svg' ? !sawRoot : sawRoot);
    if (closing) {
      if (stack[stack.length - 1] === name) { stack.pop(); out.push(`</${name}>`); }
      continue;
    }
    if (!allowed) {
      if (!selfClosing) { skipName = name; skipDepth = 1; }
      continue;
    }
    if (name === 'svg') sawRoot = true;
    if (++count > MAX_ELEMENTS) return null;
    if (!['svg', 'g', 'defs', 'marker', 'title', 'desc', 'tspan'].includes(name)) drawables++;
    const attrs: string[] = name === 'svg' ? ['xmlns="http://www.w3.org/2000/svg"'] : [];
    const attrRe = /([a-zA-Z][\w:-]*)\s*=\s*("([^"]*)"|'([^']*)')/g;
    let a: RegExpExecArray | null;
    while ((a = attrRe.exec(rawAttrs))) {
      const an = a[1];
      if (!ATTRS.has(an)) continue;
      const v = cleanValue(an, a[3] ?? a[4] ?? '');
      if (v !== null) attrs.push(`${an}="${escapeAttr(v)}"`);
    }
    out.push(`<${name}${attrs.length ? ` ${attrs.join(' ')}` : ''}${selfClosing ? '/>' : '>'}`);
    if (!selfClosing) stack.push(name);
  }
  if (!sawRoot || !drawables) return null;
  while (stack.length) out.push(`</${stack.pop()}>`);
  const svg = out.join('');
  // The root must say how big the drawing is, or <img> renders it at 0×0 in some browsers; and a drawing shown
  // as an image can't load the app's fonts, so labels default to a plain sans-serif rather than the browser's serif.
  let root = svg;
  if (!/^<svg[^>]*viewBox=/.test(root)) root = root.replace('<svg ', '<svg viewBox="0 0 800 500" ');
  if (!/^<svg[^>]*font-family=/.test(root)) root = root.replace('<svg ', '<svg font-family="Arial, Helvetica, sans-serif" ');
  return root;
}

/** For <img src>: a data URL of the cleaned drawing. */
export const svgDataUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
