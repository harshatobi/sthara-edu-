'use client';

import { isChoice, type QuestionSetContent, type StudioItem } from '@/lib/studio/types';
import { LETTERS } from '@/lib/studio/handout';
import { isRtl } from '@/lib/studio/languages';
import type { Material } from './api';

/** Prints the sheets below (hidden on screen). The global footer adds "Powered by Sthara" to every page. */
export function printStudio() {
  document.body.classList.add('sd-printing');
  const done = () => { document.body.classList.remove('sd-printing'); window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  window.print();
}

/**
 * Print-ready sheets: the school's letterhead, name and roll lines, answer lines sized to the marks, and the answer
 * key at the end. Per-student versions print one named sheet each (large print where that need is on record);
 * A/B/C sets print one master per set.
 */
export default function PrintSheet({ material: m, set, school, nameOf }: { material: Material; set: QuestionSetContent; school: string; nameOf: (id: string) => string }) {
  const byId = new Map(set.items.map(i => [i.id, i]));
  const items = (ids: string[]) => ids.map(id => byId.get(id)).filter((x): x is StudioItem => !!x);
  const sheets: { key: string; label: string | null; who: string | null; reason: string | null; large: boolean; list: StudioItem[] }[] =
    set.audience === 'per_student' ? set.versions.map(v => ({ key: v.studentId, label: null, who: nameOf(v.studentId), reason: v.reason || null, large: v.access.includes('large_print'), list: items(v.itemIds) }))
      : set.audience === 'abc' ? set.sets.map(s => ({ key: s.label, label: `Set ${s.label}`, who: null, reason: null, large: false, list: items(s.itemIds) }))
        : [{ key: 'class', label: null, who: null, reason: null, large: false, list: items(set.order) }];
  const marks = (l: StudioItem[]) => l.reduce((n, i) => n + i.marks, 0);
  const dir = isRtl(m.language) ? 'rtl' : undefined;
  return (
    <div className="sd-print" aria-hidden="true" dir={dir} lang={m.language}>
      {sheets.map(s => (
        <div className={`sheet${s.large ? ' large' : ''}`} key={s.key}>
          <div className="lh">
            <div><h1>{school || 'School'}</h1><p>{m.class} · {m.subject} · {m.title}{s.label ? ` · ${s.label}` : ''}</p></div>
            <p>Marks: {marks(s.list)}</p>
          </div>
          <div className="who"><span>Name: {s.who ?? ''}</span><span>Roll no:</span><span>Date:</span></div>
          {s.reason && <p className="why">{s.reason}</p>}
          {s.list.map((it, k) => (
            <div className="pq" key={it.id}>
              <div><b>{k + 1}.</b> {it.text} <i>({it.marks} mark{it.marks === 1 ? '' : 's'})</i></div>
              {it.figure?.alt && <div style={{ marginLeft: 18 }}>Figure: {it.figure.alt}</div>}
              {isChoice(it.qtype) && it.options
                ? <div className="op">{it.options.map((o, j) => <span key={j}>({LETTERS[j]}) {o}</span>)}</div>
                : <div className="lines">{Array.from({ length: Math.min(12, it.marks * 2 + 1) }, (_, j) => <div key={j} />)}</div>}
            </div>
          ))}
        </div>
      ))}
      <div className="sheet key">
        <h2>Answer key: {m.title}</h2>
        {sheets.map(s => (
          <div key={s.key} style={{ marginBottom: 10 }}>
            {(s.label || s.who) && <b>{s.label ?? s.who}</b>}
            {s.list.map((it, k) => (
              <div className="pq" key={it.id}>{k + 1}. {isChoice(it.qtype) && typeof it.answer === 'number' ? `(${LETTERS[it.answer]}) ` : it.qtype === 'numerical' && it.value !== null && it.value !== undefined ? `${it.value}${it.unit ? ` ${it.unit}` : ''}. ` : ''}{it.scheme}</div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
