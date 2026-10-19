'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeftIcon as ArrowLeft } from '@phosphor-icons/react/dist/ssr/ArrowLeft';
import { PrinterIcon as Printer } from '@phosphor-icons/react/dist/ssr/Printer';
import { PresentationIcon as Presentation } from '@phosphor-icons/react/dist/ssr/Presentation';
import { PlayIcon as Play } from '@phosphor-icons/react/dist/ssr/Play';
import { ArrowsClockwiseIcon as ArrowsClockwise } from '@phosphor-icons/react/dist/ssr/ArrowsClockwise';
import { FlaskIcon as Flask } from '@phosphor-icons/react/dist/ssr/Flask';
import { Empty, PageBar, Skeleton } from '@/components/canon/ui';
import { CURRENT_SESSION } from '@/lib/curriculum';
import { engineById, validateScene } from '@/lib/lab/registry';
import { presentHref } from '@/lib/lab/url';
import { PHOTOS, credit } from '@/lib/lab/photos';
import { practicalById, readingsFor, refOf, vivaFor, type Practical } from '@/lib/lab/practicals';
import { LabView } from '../LabStage';
import ReadingsTable from './ReadingsTable';
import { usePracticalClass } from './usePracticals';

type PrintMode = 'pack' | 'record' | null;
const ROMAN: Record<number, string> = { 9: 'IX', 10: 'X', 11: 'XI', 12: 'XII' };

export default function PracticalPage({ id }: { id: string }) {
  const p = practicalById(id);
  if (!p) return <Empty icon={<Flask size={28} weight="duotone" />} title="That practical isn't on the list"><Link href="/teacher/lab/practicals" style={{ textDecoration: 'underline' }}>See all practicals</Link></Empty>;
  return <Detail p={p} />;
}

function Detail({ p }: { p: Practical }) {
  const { target, students, loading } = usePracticalClass();
  const [classSeed, setClassSeed] = useState(1);
  const [showKey, setShowKey] = useState(false);
  const [printing, setPrinting] = useState<PrintMode>(null);
  const [withKey, setWithKey] = useState(true);
  const classReadings = useMemo(() => readingsFor(p, `class|${CURRENT_SESSION}|${classSeed}`), [p, classSeed]);
  const viva = useMemo(() => vivaFor(p), [p]);
  const back = `/teacher/lab/practicals${target ? `?class=${encodeURIComponent(target.key)}` : ''}`;

  // Print the chosen pack once it has rendered, then go back to the page.
  useEffect(() => {
    if (!printing) return;
    const done = () => setPrinting(null);
    window.addEventListener('afterprint', done, { once: true });
    const t = setTimeout(() => window.print(), 120);
    return () => { clearTimeout(t); window.removeEventListener('afterprint', done); };
  }, [printing]);

  const scenes = p.setups.map(s => ({ s, scene: validateScene({ engine: s.engine, params: s.params, title: `${p.title}: ${s.label}`, predictions: [], answer: 'hands' }) }));

  return (
    <>
      <PageBar eyebrow={`CLASS ${p.cls} · ${p.part === 'activity' ? 'ACTIVITY' : 'PRACTICAL'} ${refOf(p).toUpperCase()} · ${p.chapter.toUpperCase()}`} title={p.title} sub={p.aim}
        actions={<>
          <Link className="btn" href={back}><ArrowLeft size={15} weight="bold" /> All practicals</Link>
          <button className="btn" onClick={() => setPrinting('record')}><Printer size={15} weight="bold" /> Print record page</button>
          <button className="btn red" disabled={!students.length} title={students.length ? 'One sheet per student with their own readings' : 'No students in this class yet'} onClick={() => setPrinting('pack')}>
            <Printer size={15} weight="bold" /> Print class pack{students.length ? ` (${students.length})` : ''}
          </button>
        </>} />

      <section className="card prx-official">
        <span className="prx-tag">CBSE 2026-27 list, Class {ROMAN[p.cls]} {p.subject} {refOf(p)}</span>
        <p>{p.official}</p>
      </section>

      <div className="prx-two">
        <section className="card">
          <h2 className="lab-section">Apparatus</h2>
          <ul className="prx-list">{p.apparatus.map(a => <li key={a}>{a}</li>)}</ul>
          <h2 className="lab-section" style={{ marginTop: 18 }}>Precautions</h2>
          <ul className="prx-list">{p.precautions.map(a => <li key={a}>{a}</li>)}</ul>
        </section>
        <section className="card">
          <h2 className="lab-section">Procedure</h2>
          <ol className="prx-list prx-steps">{p.procedure.map(a => <li key={a}>{a}</li>)}</ol>
        </section>
      </div>

      <h2 className="lab-section" style={{ marginTop: 26 }}>On the board</h2>
      <div className="prx-setups">
        {scenes.map(({ s, scene }) => scene && <SetupCard key={s.label} label={s.label} scene={scene} cls={target?.cls ?? null} subject={target?.subject ?? null} />)}
      </div>

      {p.photos && p.photos.length > 0 && (
        <>
          <h2 className="lab-section" style={{ marginTop: 26 }}>What it really looks like</h2>
          <div className="prx-photos">
            {p.photos.map(id => PHOTOS[id]).filter(Boolean).map(ph => (
              <figure key={ph.id}>
                {/* Plain img: the photos are small local files with fixed credits. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={ph.src} alt={ph.caption} loading="lazy" />
                <figcaption>{ph.caption}<br /><a href={ph.page} target="_blank" rel="noreferrer">{credit(ph)}</a></figcaption>
              </figure>
            ))}
          </div>
        </>
      )}

      <section className="card" style={{ marginTop: 26 }}>
        <div className="prx-head">
          <h2 className="lab-section" style={{ margin: 0 }}>Readings for the class</h2>
          <span style={{ flex: 1 }} />
          <button className="btn sm" onClick={() => setClassSeed(n => n + 1)}><ArrowsClockwise size={13} weight="bold" /> New set</button>
          <button className="btn sm" aria-pressed={showKey} onClick={() => setShowKey(v => !v)}>{showKey ? 'Hide answers' : 'Show answers'}</button>
        </div>
        <p className="muted" style={{ fontSize: 13, margin: '6px 0 12px' }}>{p.kind === 'numeric' ? 'A realistic set of readings, with the error a school lab gives. Put it on the board and let the class work out the result; each printed sheet has its own set.' : 'What the class should record. The printed sheets give each student the same table in their own order.'}</p>
        <ReadingsTable readings={classReadings} showKey={showKey} />
      </section>

      <section className="card" style={{ marginTop: 18 }}>
        <h2 className="lab-section">Viva</h2>
        <ol className="prx-viva">
          {viva.map(v => (
            <li key={v.q}>
              <details><summary>{v.q}</summary><p>{v.a}</p>{v.source === 'engine' && <span className="prx-src">Worked out by the simulation</span>}</details>
            </li>
          ))}
        </ol>
      </section>

      <section className="card" style={{ marginTop: 18, marginBottom: 30 }}>
        <h2 className="lab-section">Conclusion</h2>
        <p>{p.conclusion}</p>
        <label className="prx-opt"><input type="checkbox" checked={withKey} onChange={e => setWithKey(e.target.checked)} /> Add the teacher&apos;s key to the class pack</label>
      </section>

      {loading && <Skeleton h={20} />}

      {printing === 'pack' && <ClassPack p={p} students={students} cls={target?.cls ?? ''} withKey={withKey} />}
      {printing === 'record' && <RecordPage p={p} />}
    </>
  );
}

function SetupCard({ label, scene, cls, subject }: { label: string; scene: NonNullable<ReturnType<typeof validateScene>>; cls: string | null; subject: string | null }) {
  const [runKey, setRunKey] = useState(0);
  const engine = engineById(scene.engine)!;
  return (
    <div className="card prx-setup">
      <div className="prx-head"><b>{label}</b><span style={{ flex: 1 }} />
        <button className="btn sm" onClick={() => setRunKey(k => k + 1)}><Play size={13} weight="fill" /> Run</button>
        <Link className="btn sm" href={`/teacher/lab/build?${new URLSearchParams({ e: engine.id })}`}>Open in Live Lab</Link>
        <Link className="btn sm red" href={presentHref(scene, cls && subject ? { class: cls, subject } : undefined)}><Presentation size={13} weight="fill" /> Present</Link>
      </div>
      <LabView engine={engine} params={scene.params} setParam={() => {}} conceal={false} runKey={runKey} locked />
    </div>
  );
}

/** One A4 sheet per student with their own readings, then the teacher's key. Printed only. */
function ClassPack({ p, students, cls, withKey }: { p: Practical; students: { id: string; name: string; rollNo: string }[]; cls: string; withKey: boolean }) {
  const sets = students.map(s => ({ s, r: readingsFor(p, `${s.id}|${CURRENT_SESSION}`) }));
  return (
    <article className="lab-print prx-print">
      {sets.map(({ s, r }) => (
        <section key={s.id} className="prx-sheet">
          <header className="lbp-head">
            <div className="lbp-kicker">{p.part === 'activity' ? 'ACTIVITY' : 'PRACTICAL'} {refOf(p).toUpperCase()} · CLASS {p.cls} {p.subject.toUpperCase()} · {p.chapter.toUpperCase()}</div>
            <h1>{p.title}</h1>
            <div className="lbp-who"><span>{s.name}{s.rollNo ? ` · ${s.rollNo}` : ''}</span><span>{cls}</span><span>Date</span></div>
          </header>
          <p><b>Aim:</b> {p.aim}</p>
          <ReadingsTable readings={r} showKey={false} />
          <div className="lbp-lines tall"><span>Conclusion:</span></div>
        </section>
      ))}
      {withKey && (
        <section className="prx-sheet lbp-key">
          <h1>Teacher&apos;s key: {p.title}</h1>
          {sets.map(({ s, r }) => (
            <div key={s.id} className="prx-keyrow">
              <b>{s.name}</b>
              {r.results.length ? r.results.map(x => <span key={x.label}> · {x.label}: {x.value}{x.unit ? ` ${x.unit}` : ''} (±{Number(x.tolerance.toFixed(2))})</span>) : <ReadingsTable readings={r} showKey />}
            </div>
          ))}
        </section>
      )}
    </article>
  );
}

/** The practical record (file) page: aim, apparatus, diagram, procedure, an observation table, result and precautions. */
function RecordPage({ p }: { p: Practical }) {
  const first = p.setups[0], engine = engineById(first.engine);
  const blank = readingsFor(p, `record|${CURRENT_SESSION}`);
  return (
    <article className="lab-print prx-print">
      <section className="prx-sheet">
        <header className="lbp-head">
          <div className="lbp-kicker">PRACTICAL RECORD · CLASS {p.cls} {p.subject.toUpperCase()} · {p.part === 'activity' ? 'ACTIVITY' : 'PRACTICAL'} {refOf(p).toUpperCase()}</div>
          <h1>{p.title}</h1>
          <div className="lbp-who"><span>Name</span><span>Roll no.</span><span>Date</span></div>
        </header>
        <p><b>Aim:</b> {p.aim}</p>
        <p><b>Apparatus:</b> {p.apparatus.join('; ')}.</p>
        {engine && <div className="lbp-fig"><LabView engine={engine} params={first.params} setParam={() => {}} conceal={false} runKey={0} locked /></div>}
        <p><b>Procedure:</b></p>
        <ol className="prx-list prx-steps">{p.procedure.map(a => <li key={a}>{a}</li>)}</ol>
        <p><b>Observations:</b></p>
        <ReadingsTable readings={{ ...blank, rows: blank.rows.map(row => Object.fromEntries(Object.keys(row).map(k => [k, blank.blanks.includes(k) || p.kind === 'numeric' ? '' : row[k]]))) }} showKey={false} />
        <p><b>Result / conclusion:</b></p>
        <div className="lbp-lines tall" />
        <p><b>Precautions:</b> {p.precautions.join(' ')}</p>
        <div className="lbp-who" style={{ marginTop: '8mm' }}><span>Teacher&apos;s signature</span><span>Remarks</span></div>
      </section>
    </article>
  );
}
