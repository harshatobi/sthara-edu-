/**
 * Prints a timetable from its own window, so no print CSS touches the app's pages
 * (an unscoped print rule once blanked every other page's printout).
 */
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export interface PrintGrid {
  title: string;
  subtitle: string;
  school: string;
  days: string[];
  /** One row per bell row: a label (with times) and either a break caption or one cell per day. */
  rows: { label: string; time: string; brk?: string; cells?: string[][] }[];
}

export function printGrids(grids: PrintGrid[]) {
  const w = window.open('', '_blank', 'noopener=no,width=1100,height=800');
  if (!w) throw new Error('Allow pop-ups for this site to print.');
  const page = (g: PrintGrid) => `
    <section>
      <header><div><h1>${esc(g.title)}</h1><p>${esc(g.subtitle)}</p></div><b>${esc(g.school)}</b></header>
      <table>
        <thead><tr><th class="p"></th>${g.days.map(d => `<th>${esc(d)}</th>`).join('')}</tr></thead>
        <tbody>${g.rows.map(r => r.brk !== undefined
    ? `<tr class="brk"><th class="p">${esc(r.label)}<small>${esc(r.time)}</small></th><td colspan="${g.days.length}">${esc(r.brk)}</td></tr>`
    : `<tr><th class="p">${esc(r.label)}<small>${esc(r.time)}</small></th>${(r.cells || []).map(c => `<td>${c.map((line, i) => (i === 0 ? `<b>${esc(line)}</b>` : `<span>${esc(line)}</span>`)).join('')}</td>`).join('')}</tr>`).join('')}
        </tbody>
      </table>
    </section>`;
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(grids[0]?.title || 'Timetable')}</title>
    <style>
      @page { size: A4 landscape; margin: 12mm; }
      * { box-sizing: border-box; }
      body { font-family: 'Plus Jakarta Sans', system-ui, sans-serif; color: #002147; margin: 0; }
      section { page-break-after: always; }
      section:last-child { page-break-after: auto; }
      header { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 10px; }
      h1 { font-size: 20px; margin: 0; } header p { margin: 2px 0 0; font-size: 12px; color: #7A8699; } header b { font-size: 12px; }
      table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 11px; }
      th, td { border: 1px solid #C9D3E1; padding: 5px 6px; vertical-align: top; }
      thead th { background: #EEF2F7; font-size: 10px; letter-spacing: .06em; text-transform: uppercase; }
      th.p { width: 78px; text-align: left; background: #F7F9FB; }
      th.p small { display: block; font-weight: 500; color: #7A8699; }
      td b { display: block; font-size: 11.5px; } td span { display: block; color: #555F6E; font-size: 10px; }
      tr.brk td { text-align: center; color: #7A8699; font-size: 10px; letter-spacing: .08em; text-transform: uppercase; background: #FAFBFD; }
    </style></head><body>${grids.map(page).join('')}</body></html>`);
  w.document.close();
  w.focus();
  setTimeout(() => { w.print(); }, 250);
}
