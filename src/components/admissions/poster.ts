import QRCode from 'qrcode';
import { POWERED_BY_FALLBACK_HEAD, POWERED_BY_PAGE_CSS } from '@/components/schedule/print';

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

/** The apply page's QR code as SVG markup; the link carries src=qr so enquiries from it are counted as the poster's. */
export async function applyQrSvg(url: string) {
  return QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
}

/** An A4 poster for the notice board, gate and prospectus: the school, the QR code and the link. Own window. */
export async function printPoster(o: { school: string; url: string; session: string; note: string | null }) {
  const w = window.open('', '_blank', 'noopener=no,width=900,height=1100');
  if (!w) throw new Error('Allow pop-ups for this site to print.');
  const svg = await applyQrSvg(o.url);
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Admissions ${esc(o.session)} · ${esc(o.school)}</title>
    <style>
      @page { size: A4 portrait; margin: 16mm; ${POWERED_BY_PAGE_CSS} }
      body { font-family: 'Plus Jakarta Sans', system-ui, sans-serif; color: #002147; margin: 0; text-align: center; }
      .eyebrow { font-size: 13px; font-weight: 800; letter-spacing: .18em; color: #7A8699; margin: 18mm 0 4mm; }
      h1 { font-size: 34px; margin: 0 0 3mm; } h2 { font-size: 22px; margin: 0 0 10mm; font-weight: 600; }
      .qr { width: 95mm; height: 95mm; margin: 0 auto 8mm; } .qr svg { width: 100%; height: 100%; }
      p { font-size: 15px; line-height: 1.5; margin: 0 auto 4mm; max-width: 150mm; } .url { font-weight: 700; word-break: break-all; }
    </style>${POWERED_BY_FALLBACK_HEAD}</head><body>
    <div class="eyebrow">ADMISSIONS OPEN · AY ${esc(o.session.replace('-', '–'))}</div>
    <h1>${esc(o.school)}</h1>
    <h2>Scan to ask about admission or apply</h2>
    <div class="qr">${svg}</div>
    <p>Point your phone’s camera at the code. No app or account needed.</p>
    <p class="url">${esc(o.url)}</p>
    ${o.note ? `<p>${esc(o.note)}</p>` : ''}
  </body></html>`);
  w.document.close();
  w.focus();
  setTimeout(() => { w.print(); }, 300);
}
