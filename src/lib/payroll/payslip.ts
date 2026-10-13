/**
 * Payslips and settlement statements, printed from their own window (so no print rule touches the app's pages)
 * with the app-wide "Powered by Sthara" page foot.
 */
import { POWERED_BY_PAGE_CSS } from '@/components/schedule/print';
import { monthName } from './engine';
import type { RunLine } from './outputs';

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const rs = (n: number) => n.toLocaleString('en-IN');

const ONES = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const below100 = (n: number) => (n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? `-${ONES[n % 10]}` : ''}`);
const below1000 = (n: number) => [n >= 100 ? `${ONES[Math.floor(n / 100)]} hundred` : '', n % 100 ? below100(n % 100) : ''].filter(Boolean).join(' and ');
/** Whole rupees in words, the Indian way: "one lakh twenty-three thousand four hundred and fifty-six". */
export function rupeesInWords(n: number): string {
  const v = Math.abs(Math.round(n));
  if (!v) return 'zero';
  const parts: string[] = [];
  const crore = Math.floor(v / 1e7), lakh = Math.floor((v % 1e7) / 1e5), thousand = Math.floor((v % 1e5) / 1e3), rest = v % 1e3;
  if (crore) parts.push(`${crore >= 1000 ? rupeesInWords(crore) : below1000(crore)} crore`);
  if (lakh) parts.push(`${below100(lakh)} lakh`);
  if (thousand) parts.push(`${below100(thousand)} thousand`);
  if (rest) parts.push(below1000(rest));
  return parts.join(' ');
}

export function printPayslips(school: string, lines: RunLine[], kind: 'regular' | 'settlement') {
  const w = window.open('', '_blank', 'noopener=no,width=900,height=1000');
  if (!w) throw new Error('Allow pop-ups for this site to print.');
  const slip = (l: RunLine) => {
    const n = Math.max(l.earnings.length, l.deductions.length);
    const rows = Array.from({ length: n }, (_, i) => {
      const e = l.earnings[i], d = l.deductions[i];
      const sub = (x?: { note?: string; count?: number; rate?: number }) => (x?.rate !== undefined ? `<small>${esc(x.count)} x ${esc(rs(x.rate))}</small>` : x?.note ? `<small>${esc(x.note)}</small>` : '');
      return `<tr><td>${e ? `${esc(e.name)}${sub(e)}` : ''}</td><td class="n">${e ? rs(e.amount) : ''}</td><td>${d ? `${esc(d.name)}${sub(d)}` : ''}</td><td class="n">${d ? rs(d.amount) : ''}</td></tr>`;
    }).join('');
    const facts = [['Employee code', l.person.code || 'Not set'], ['Designation', l.person.designation || 'Not set'], ['Department', l.person.department || 'Not set'], ['Grade', l.person.grade || 'Not set'],
      ['Days in the month', String(l.days.basis)], ['Days paid', String(l.days.payable)], ['Loss of pay days', String(l.days.lop)], ['Payment', l.payMode === 'bank' ? 'Bank transfer' : l.payMode === 'cash' ? 'Cash' : 'Cheque']];
    return `<section>
      <header><div><div class="k">${kind === 'settlement' ? 'FULL AND FINAL SETTLEMENT' : 'PAYSLIP'}</div><h1>${esc(kind === 'settlement' ? `Settlement to ${l.days.to}` : monthName(l.month))}</h1></div><b>${esc(school)}</b></header>
      <h2>${esc(l.person.name)}</h2>
      <dl>${facts.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
      <table><thead><tr><th>Earnings</th><th class="n">Rs</th><th>Deductions</th><th class="n">Rs</th></tr></thead><tbody>${rows}</tbody>
        <tfoot><tr><th>Gross earnings</th><th class="n">${rs(l.gross)}</th><th>Total deductions</th><th class="n">${rs(l.totalDeductions)}</th></tr></tfoot></table>
      <div class="net"><span>Net pay</span><b>Rs ${rs(l.net)}</b><i>Rupees ${esc(rupeesInWords(l.net))} only</i></div>
      ${l.employer.length ? `<p class="er">Paid by the school on your behalf, over and above this: ${l.employer.map(e => `${esc(e.name)} Rs ${rs(e.amount)}`).join('; ')}.</p>` : ''}
      ${l.tax ? `<p class="er">Income tax: ${l.tax.regime === 'old' ? 'old' : 'new'} regime. Taxable income projected for ${esc(l.tax.fy)} Rs ${rs(l.tax.taxableIncome)}; tax for the year Rs ${rs(l.tax.annualTax)}; deducted before this month Rs ${rs(l.tax.deductedToDate)}.</p>` : ''}
      <p class="sys">This is a computer-generated statement and needs no signature.</p>
    </section>`;
  };
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(lines.length === 1 ? `${lines[0].person.name} ${monthName(lines[0].month)}` : `Payslips ${monthName(lines[0]?.month ?? '2000-01-01')}`)}</title>
    <style>
      @page { size: A4; margin: 16mm 14mm 18mm; ${POWERED_BY_PAGE_CSS} }
      * { box-sizing: border-box; }
      body { font-family: 'Plus Jakarta Sans', system-ui, sans-serif; color: #002147; margin: 0; font-size: 11.5px; }
      section { page-break-after: always; } section:last-child { page-break-after: auto; }
      header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #002147; padding-bottom: 8px; margin-bottom: 14px; }
      .k { font-size: 9px; font-weight: 800; letter-spacing: .16em; color: #E11D48; } h1 { font-size: 22px; margin: 2px 0 0; } header b { font-size: 13px; }
      h2 { font-size: 16px; margin: 0 0 10px; }
      dl { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px 14px; margin: 0 0 16px; }
      dt { font-size: 8.5px; font-weight: 800; letter-spacing: .1em; color: #7A8699; text-transform: uppercase; } dd { margin: 2px 0 0; font-weight: 600; }
      table { width: 100%; border-collapse: collapse; }
      th, td { border: 1px solid #C9D3E1; padding: 6px 8px; text-align: left; vertical-align: top; width: 32%; }
      th.n, td.n { text-align: right; width: 18%; font-variant-numeric: tabular-nums; }
      thead th { background: #EEF2F7; font-size: 10px; letter-spacing: .06em; text-transform: uppercase; } tfoot th { background: #F7F9FB; }
      td small { display: block; color: #7A8699; font-size: 9.5px; }
      .net { margin-top: 14px; border: 2px solid #002147; border-radius: 6px; padding: 10px 14px; display: flex; align-items: baseline; gap: 14px; }
      .net span { font-size: 10px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; } .net b { font-size: 20px; } .net i { color: #555F6E; font-style: normal; text-transform: capitalize; }
      .er { color: #555F6E; margin: 12px 0 0; line-height: 1.5; } .sys { color: #7A8699; font-size: 9.5px; margin-top: 18px; }
    </style></head><body>${lines.map(slip).join('')}</body></html>`);
  w.document.close();
  w.focus();
  setTimeout(() => { w.print(); }, 250);
}
