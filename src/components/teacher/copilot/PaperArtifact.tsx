'use client';

import { useRef, useState, type ReactNode } from 'react';
import { PrinterIcon as Printer } from '@phosphor-icons/react/dist/ssr/Printer';
import { ArrowsClockwiseIcon as ArrowsClockwise } from '@phosphor-icons/react/dist/ssr/ArrowsClockwise';
import { Chip } from '@/components/canon/ui';
import { designByKey, type PaperDesign } from '@/lib/papers/designs';
import { svgDataUrl } from '@/lib/teacher/svg';
import type { Paper, PaperQuestion, Part, QBody } from '@/lib/papers/paper';
import type { Artifact } from '@/lib/teacher/copilot';
import '@/styles/paper.css';

const LETTERS = 'ABCD';
const ROMAN = (n: number) => ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'][n] ?? String(n + 1);

/**
 * A board-pattern paper and its marking scheme, each laid out as an A4
 * document and printable on its own. Labelled as a practice paper in the CBSE
 * pattern: it is the school's paper, not a CBSE paper.
 */
export default function PaperArtifact({ a, onRefine }: { a: Extract<Artifact, { kind: 'paper' }>; onRefine?: (text: string) => void }) {
  const design = designByKey(a.paper.design);
  const [tab, setTab] = useState<'paper' | 'scheme'>('paper');
  const doc = useRef<HTMLDivElement>(null);
  if (!design) return null;
  const count = a.paper.sections.reduce((n, s) => n + s.questions.length, 0);

  const print = () => {
    const el = doc.current;
    if (!el) return;
    el.classList.add('print-me'); document.body.classList.add('print-one');
    const done = () => { el.classList.remove('print-me'); document.body.classList.remove('print-one'); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    window.print();
  };

  return (
    <div className="art">
      <div className="art-hd">
        <div style={{ minWidth: 0 }}>
          <Chip tone="p">BOARD PAPER</Chip>
          <h3 style={{ fontSize: 17, fontWeight: 800, marginTop: 8 }}>{a.title}</h3>
          <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{design.maxMarks} marks · {count} questions · {design.minutes / 60} hours · check every question before you use it</div>
        </div>
        <div className="seg" role="tablist" aria-label="Paper or marking scheme">
          <button role="tab" aria-selected={tab === 'paper'} className={tab === 'paper' ? 'on' : ''} onClick={() => setTab('paper')}>Question paper</button>
          <button role="tab" aria-selected={tab === 'scheme'} className={tab === 'scheme' ? 'on' : ''} onClick={() => setTab('scheme')}>Marking scheme</button>
        </div>
      </div>
      <div className="art-bd">
        <div className="bpp-scroll">
          <div ref={doc} className="bpp-doc">
            {tab === 'paper' ? <PaperDoc paper={a.paper} design={design} /> : <SchemeDoc paper={a.paper} design={design} />}
          </div>
        </div>
      </div>
      <div className="art-ft">
        <button className="btn sm red" onClick={print}><Printer size={13} weight="bold" /> Print {tab === 'paper' ? 'question paper' : 'marking scheme'}</button>
        <span style={{ flex: 1 }} />
        {onRefine && <button className="btn sm" onClick={() => onRefine('Make another paper with different questions')}><ArrowsClockwise size={13} weight="bold" /> Another paper</button>}
      </div>
    </div>
  );
}

function Head({ design, scheme }: { design: PaperDesign; scheme?: boolean }) {
  return (
    <header className="bpp-head">
      <div className="bpp-kicker">PRACTICE PAPER · CBSE 2026-27 PATTERN{scheme ? ' · MARKING SCHEME' : ''}</div>
      <h1>{design.subject.toUpperCase()}{design.variant ? ` (${design.variant.toUpperCase()})` : ''} ({design.code})</h1>
      <div className="bpp-meta"><span>Class {design.cls === 10 ? 'X' : 'XII'}</span><span>Time allowed: {design.minutes / 60} hours</span><span>Maximum marks: {design.maxMarks}</span></div>
    </header>
  );
}

function PaperDoc({ paper, design }: { paper: Paper; design: PaperDesign }) {
  return (
    <>
      <Head design={design} />
      <section className="bpp-gi">
        <h2>General Instructions</h2>
        <ol>{design.instructions.map((x, i) => <li key={i}>{x}</li>)}</ol>
      </section>
      {paper.sections.map(sec => {
        const marks = sec.questions.reduce((n, q) => n + q.marks, 0);
        return (
          <section key={sec.id} className="bpp-sec">
            <h2 className="bpp-sec-h">SECTION {sec.id}{sec.title !== `Section ${sec.id}` ? ` · ${sec.title.toUpperCase()}` : ''} <span>({marks} marks)</span></h2>
            {sec.questions.map(q => <Question key={q.q} q={q} />)}
          </section>
        );
      })}
      <p className="bpp-end">End of question paper</p>
    </>
  );
}

function Row({ n, marks, children }: { n: ReactNode; marks: ReactNode; children: ReactNode }) {
  return <div className="bpp-q"><div className="bpp-n">{n}</div><div className="bpp-body">{children}</div><div className="bpp-m">{marks}</div></div>;
}

function Options({ options }: { options?: string[] }) {
  if (!options?.length) return null;
  return <ol className="bpp-opts">{options.map((o, i) => <li key={i}><b>({LETTERS[i]})</b> {o}</li>)}</ol>;
}

function Body({ b, q }: { b: QBody; q: PaperQuestion }) {
  return (
    <>
      {q.type === 'assertion_reason'
        ? <><p><b>Assertion (A):</b> {b.assertion}</p><p><b>Reason (R):</b> {b.reason}</p><p className="bpp-small">Choose the correct option:</p></>
        : b.text && <p className="bpp-text">{b.text}</p>}
      {b.passage && <p className="bpp-passage">{b.passage}</p>}
      {b.figure && (
        <figure className="bpp-fig">
          {/* eslint-disable-next-line @next/next/no-img-element -- a cleaned SVG as a data URL */}
          <img src={svgDataUrl(b.figure.svg)} alt={b.figure.caption || 'Figure'} />
          {b.figure.caption && <figcaption>{b.figure.caption}</figcaption>}
        </figure>
      )}
      <Options options={b.options} />
      {b.parts && <ol className="bpp-parts">{b.parts.map((p, i) => <PartRow key={i} p={p} />)}</ol>}
      {b.vi && <p className="bpp-vi"><b>For visually impaired candidates:</b> {b.vi}</p>}
    </>
  );
}

function PartRow({ p }: { p: Part }) {
  return (
    <li>
      <span className="bpp-pl">{p.label}</span>
      <div className="bpp-pt">
        <p className="bpp-text">{p.text}</p>
        <Options options={p.options} />
        {p.or && <><p className="bpp-or">OR</p><p className="bpp-text">{p.or.text}</p><Options options={p.or.options} /></>}
      </div>
      <span className="bpp-pm">{p.marks}</span>
    </li>
  );
}

function Question({ q }: { q: PaperQuestion }) {
  return (
    <Row n={`${q.q}.`} marks={q.marks}>
      <Body b={q} q={q} />
      {q.alt && <><p className="bpp-or">OR</p><Body b={q.alt} q={q} /></>}
    </Row>
  );
}

function SchemeDoc({ paper, design }: { paper: Paper; design: PaperDesign }) {
  const answer = (b: QBody) => (b.options && b.answer !== undefined ? <p><b>({LETTERS[b.answer]}) {b.options[b.answer]}</b></p> : null);
  const scheme = (b: QBody) => (
    <>
      {answer(b)}
      {b.scheme && <p className="bpp-text">{b.scheme}</p>}
      {b.parts?.map((p, i) => (
        <div key={i} className="bpp-sp">
          <b>{p.label || ROMAN(i)}</b> {p.options && p.answer !== undefined ? <b>({LETTERS[p.answer]}) {p.options[p.answer]}. </b> : null}{p.scheme} <span className="bpp-small">[{p.marks}]</span>
          {p.or && <div><b>OR:</b> {p.or.options && p.or.answer !== undefined ? <b>({LETTERS[p.or.answer]}) </b> : null}{p.or.scheme}</div>}
        </div>
      ))}
      {b.vi && <p className="bpp-small">Visually impaired version: mark on the same points.</p>}
    </>
  );
  return (
    <>
      <Head design={design} scheme />
      {paper.sections.map(sec => (
        <section key={sec.id} className="bpp-sec">
          <h2 className="bpp-sec-h">SECTION {sec.id}{sec.title !== `Section ${sec.id}` ? ` · ${sec.title.toUpperCase()}` : ''}</h2>
          {sec.questions.map(q => (
            <Row key={q.q} n={`${q.q}.`} marks={q.marks}>
              <p className="bpp-small">{q.chapter}</p>
              {scheme(q)}
              {q.alt && <><p className="bpp-or">OR</p>{scheme(q.alt)}</>}
            </Row>
          ))}
        </section>
      ))}
    </>
  );
}
