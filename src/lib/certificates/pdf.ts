import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { PDFDocument, degrees, rgb, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import QRCode from 'qrcode';
import { TC_FIELDS, TC_HEADER, dmy } from './certs';

/**
 * One certificate as an A4 PDF: the same layout for the draft preview, the printed copy and the stored file. Drawn
 * from the certificate's values (frozen at issue), so a reprint is the same page. Plus Jakarta Sans covers Latin
 * text and the rupee sign; a character it can't draw (a name in an Indian script) is left out and the server says so.
 */

export interface CertPdf {
  school: { name: string; address: string | null; affiliation: string | null; logo: string | null; udise: string | null };
  kind: 'tc' | 'bonafide' | 'character' | 'fee_paid' | 'custom';
  title: string;
  number: string | null;
  issuedOn: string | null;
  /** draft: watermarked DRAFT; cancelled: watermarked CANCELLED. */
  state: 'draft' | 'issued' | 'cancelled';
  duplicate: boolean;
  /** The TC's values by field key. */
  tc?: Record<string, string>;
  /** Bonafide, character, custom and the fee certificate's opening: the filled wording. */
  body?: string;
  fee?: { rows: { date: string; receipt: string; label: string; amount: number }[]; total: number };
  signature: string | null;
  stamp: string | null;
  principalName: string | null;
  verifyUrl: string | null;
}

const A4: [number, number] = [595.28, 841.89];
const M = 46;
const INK = rgb(0, 0.13, 0.28), MUTED = rgb(0.4, 0.45, 0.52), LINE = rgb(0.8, 0.84, 0.89);
const FONT_DIR = path.join(process.cwd(), 'public', 'site', 'assets');

let fontCache: Promise<[Uint8Array, Uint8Array]> | null = null;
const fonts = () => (fontCache ??= Promise.all([readFile(path.join(FONT_DIR, 'jakarta-regular.ttf')), readFile(path.join(FONT_DIR, 'jakarta-bold.ttf'))]));

async function image(doc: PDFDocument, dataUrl: string | null): Promise<PDFImage | null> {
  const m = /^data:image\/(png|jpeg|jpg);base64,(.+)$/.exec(dataUrl ?? '');
  if (!m) return null;
  const bytes = Buffer.from(m[2], 'base64');
  try { return m[1] === 'png' ? await doc.embedPng(bytes) : await doc.embedJpg(bytes); } catch { return null; }
}

/** Builds the PDF; `dropped` lists characters the font couldn't draw (left out). */
export async function certificatePdf(c: CertPdf): Promise<{ bytes: Uint8Array; dropped: string[] }> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle(`${c.title}${c.number ? ` ${c.number}` : ''}`);
  doc.setProducer('Sthara');
  const [reg, bold] = await fonts();
  const R = await doc.embedFont(reg, { subset: true }), B = await doc.embedFont(bold, { subset: true });
  const can = new Set(R.getCharacterSet());
  const dropped = new Set<string>();
  const clean = (s: string) => [...s.replace(/\r/g, '')].filter(ch => {
    if (ch === '\n' || can.has(ch.codePointAt(0)!)) return true;
    dropped.add(ch);
    return false;
  }).join('');
  const [logo, sign, stamp] = await Promise.all([image(doc, c.school.logo), image(doc, c.signature), image(doc, c.stamp)]);
  const qr = c.verifyUrl ? await doc.embedPng(await QRCode.toBuffer(c.verifyUrl, { type: 'png', margin: 1, width: 240, errorCorrectionLevel: 'M' })) : null;

  let page: PDFPage = doc.addPage(A4);
  let y = A4[1] - M;
  const W = A4[0] - 2 * M;

  const wrap = (text: string, font: PDFFont, size: number, width: number) => {
    const out: string[] = [];
    for (const para of clean(text).split('\n')) {
      let line = '';
      for (const word of para.split(/\s+/).filter(Boolean)) {
        const next = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(next, size) <= width) { line = next; continue; }
        if (line) out.push(line);
        line = word;
      }
      out.push(line);
    }
    return out;
  };
  const text = (s: string, x: number, yy: number, size: number, font = R, color = INK) => page.drawText(clean(s), { x, y: yy, size, font, color });
  const centre = (s: string, yy: number, size: number, font = R, color = INK) => text(s, (A4[0] - font.widthOfTextAtSize(clean(s), size)) / 2, yy, size, font, color);
  const watermark = (p: PDFPage) => {
    if (c.state === 'issued') return;
    const word = c.state === 'draft' ? 'DRAFT' : 'CANCELLED';
    const size = c.state === 'draft' ? 110 : 84;
    p.drawText(word, { x: 120, y: 260, size, font: B, color: c.state === 'draft' ? rgb(0.85, 0.87, 0.9) : rgb(0.95, 0.75, 0.78), rotate: degrees(35), opacity: 0.6 });
  };
  const foot = (p: PDFPage) => {
    const s = 'Powered by Sthara · The Institutional OS';
    p.drawText(s, { x: (A4[0] - R.widthOfTextAtSize(s, 7.5)) / 2, y: 22, size: 7.5, font: R, color: MUTED });
  };
  const SIGN_SPACE = 118;
  const room = (h: number) => {
    if (y - h > M + SIGN_SPACE) return;
    watermark(page); foot(page);
    page = doc.addPage(A4);
    y = A4[1] - M;
    text(`${c.title}${c.number ? ` ${c.number}` : ''} (continued)`, M, y, 9, B, MUTED);
    y -= 22;
  };

  // The school.
  if (logo) {
    const s = 56 / Math.max(logo.width, logo.height);
    page.drawImage(logo, { x: M, y: y - 56 + (56 - logo.height * s) / 2, width: logo.width * s, height: logo.height * s });
  }
  centre(c.school.name.toUpperCase(), y - 16, 15, B);
  let hy = y - 32;
  for (const l of wrap(c.school.address ?? '', R, 9, W - 140)) { if (l) { centre(l, hy, 9, R, MUTED); hy -= 12; } }
  const ids = [c.school.affiliation ? `Affiliation No. ${c.school.affiliation}` : null, c.school.udise ? `UDISE ${c.school.udise}` : null].filter(Boolean).join('   ·   ');
  if (ids) { centre(ids, hy, 9, R, MUTED); hy -= 12; }
  y = Math.min(hy, y - 60) - 6;
  page.drawLine({ start: { x: M, y }, end: { x: A4[0] - M, y }, thickness: 1.2, color: INK });
  y -= 24;
  centre(c.title.toUpperCase(), y, 15, B);
  if (c.duplicate) { y -= 15; centre('DUPLICATE', y, 10, B, rgb(0.72, 0.1, 0.2)); }
  y -= 22;
  text(c.number ? `No. ${c.number}` : 'No. (given on approval)', M, y, 10, B);
  const dated = c.issuedOn ? `Date: ${dmy(c.issuedOn)}` : 'Date: (on approval)';
  text(dated, A4[0] - M - B.widthOfTextAtSize(dated, 10), y, 10, B);
  y -= 22;

  if (c.kind === 'tc' && c.tc) {
    const v = c.tc;
    // The identifying numbers, three to a row.
    const head = TC_HEADER.filter(f => v[f.key]);
    for (let i = 0; i < head.length; i += 3) {
      head.slice(i, i + 3).forEach((f, k) => {
        const x = M + k * (W / 3);
        text(`${f.label} `, x, y, 8.5, R, MUTED);
        text(v[f.key], x + R.widthOfTextAtSize(clean(`${f.label} `), 8.5), y, 8.5, B);
      });
      y -= 13;
    }
    y -= 4;
    const LW = 262, VX = M + 22 + LW + 10, VW = A4[0] - M - VX;
    for (const f of TC_FIELDS) {
      const labels = wrap(f.label, R, 8.8, LW), values = wrap(v[f.key] || '—', B, 9.2, VW);
      const h = Math.max(labels.length, values.length) * 10.8 + 5.2;
      room(h);
      if (f.n) text(`${f.n}.`, M, y, 8.8, B);
      labels.forEach((l, i) => text(l, M + 22, y - i * 10.8, 8.8));
      values.forEach((l, i) => text(l, VX, y - i * 10.8, 9.2, B));
      y -= h;
      page.drawLine({ start: { x: M + 22, y: y + 3.4 }, end: { x: A4[0] - M, y: y + 3.4 }, thickness: 0.4, color: LINE });
    }
  } else {
    for (const l of wrap(c.body ?? '', R, 11.5, W)) { room(17); text(l, M, y, 11.5); y -= 17; }
    if (c.fee) {
      y -= 8;
      const cols = [M, M + 80, M + 220, A4[0] - M];
      room(20);
      ['Paid on', 'Receipt', 'For'].forEach((h, i) => text(h, cols[i], y, 9, B, MUTED));
      text('Amount (₹)', cols[3] - B.widthOfTextAtSize('Amount (₹)', 9), y, 9, B, MUTED);
      y -= 6; page.drawLine({ start: { x: M, y }, end: { x: A4[0] - M, y }, thickness: 0.6, color: LINE }); y -= 13;
      const amt = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      for (const r of c.fee.rows) {
        room(15);
        text(dmy(r.date), cols[0], y, 9.5); text(r.receipt, cols[1], y, 9.5); text(wrap(r.label, R, 9.5, cols[3] - cols[2] - 90)[0] ?? '', cols[2], y, 9.5);
        text(amt(r.amount), cols[3] - R.widthOfTextAtSize(amt(r.amount), 9.5), y, 9.5);
        y -= 15;
      }
      page.drawLine({ start: { x: M, y: y + 9 }, end: { x: A4[0] - M, y: y + 9 }, thickness: 0.6, color: LINE });
      y -= 4;
      text('Total', cols[2], y, 10, B);
      text(amt(c.fee.total), cols[3] - B.widthOfTextAtSize(amt(c.fee.total), 10), y, 10, B);
      y -= 18;
    }
  }

  // Signatures, the stamp and the QR, at the foot of the last page.
  const by = M + 58;
  // Principal on the right; on a TC the class teacher and "checked by" share the row (three equal slots).
  const SW = c.kind === 'tc' ? 128 : 150, sigX = A4[0] - M - SW;
  if (sign) { const s = Math.min((SW - 20) / sign.width, 46 / sign.height); page.drawImage(sign, { x: sigX + (SW - sign.width * s) / 2, y: by + 6, width: sign.width * s, height: sign.height * s }); }
  // The stamp sits over the right of the signature, as a seal is pressed.
  if (stamp) { const s = Math.min(74 / stamp.width, 74 / stamp.height); page.drawImage(stamp, { x: sigX + SW - stamp.width * s + 8, y: by - 4, width: stamp.width * s, height: stamp.height * s, opacity: 0.85 }); }
  page.drawLine({ start: { x: sigX, y: by }, end: { x: sigX + SW, y: by }, thickness: 0.6, color: INK });
  const pn = c.principalName ? `${c.principalName}, Principal` : 'Principal';
  wrap(pn, R, 9, SW).forEach((t, k) => text(t, sigX + (SW - R.widthOfTextAtSize(t, 9)) / 2, by - 12 - k * 11, 9));
  if (c.kind === 'tc') {
    for (const [i, l] of ['Signature of class teacher', 'Checked by (full name and designation)'].entries()) {
      const x = sigX - (2 - i) * (SW + 10);
      page.drawLine({ start: { x, y: by }, end: { x: x + SW, y: by }, thickness: 0.6, color: INK });
      wrap(l, R, 8, SW).forEach((t, k) => text(t, x, by - 12 - k * 10, 8, R, MUTED));
    }
  }
  if (qr) {
    page.drawImage(qr, { x: M, y: M - 4, width: 68, height: 68 });
    text('Scan to check this certificate', M + (c.kind === 'tc' ? 0 : 76), c.kind === 'tc' ? M - 14 : M + 30, 7.5, R, MUTED);
  }
  watermark(page);
  foot(page);
  return { bytes: await doc.save(), dropped: [...dropped] };
}
