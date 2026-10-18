'use client';

import type { Readings } from '@/lib/lab/practicals';

/**
 * An observation table. Columns the student fills in are blank (a writing
 * line) unless `showKey`, when they show the answer in red. Results follow
 * as "label = ____ unit", or with the key, the value and its working.
 */
export default function ReadingsTable({ readings: r, showKey }: { readings: Readings; showKey: boolean }) {
  return (
    <div className="prx-readings">
      {r.given.length > 0 && <ul className="prx-given">{r.given.map(g => <li key={g}>{g}</li>)}</ul>}
      <table className="prx-table">
        <thead><tr>{r.columns.map(c => <th key={c.key}>{c.label}{c.unit ? ` (${c.unit})` : ''}</th>)}</tr></thead>
        <tbody>
          {r.rows.map((row, i) => (
            <tr key={i}>
              {r.columns.map(c => {
                const blank = r.blanks.includes(c.key);
                return <td key={c.key} className={blank ? (showKey ? 'prx-key' : 'prx-blank') : undefined}>{blank && !showKey ? '' : String(row[c.key] ?? '')}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {r.results.length > 0 && (
        <div className="prx-results">
          {r.results.map(res => (
            <div key={res.label} className="prx-result">
              <b>{res.label}</b> = {showKey ? <span className="prx-key">{res.value}{res.unit ? ` ${res.unit}` : ''}</span> : <span className="prx-line" />}{!showKey && res.unit ? ` ${res.unit}` : ''}
              {showKey && <div className="prx-working">{res.working}{res.accepted ? ` Accepted: ${res.accepted}. Counts as right within ±${Number(res.tolerance.toFixed(2))}${res.unit ? ` ${res.unit}` : ''}.` : ''}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
