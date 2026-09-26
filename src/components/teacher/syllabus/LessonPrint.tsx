import { fmtDay, type Lesson } from '@/lib/teacher/course';

type Plan = Omit<Lesson, 'id' | 'teacherId' | 'taughtOn'> & { taughtOn?: string | null };

/**
 * The lesson plan as a printable A4 document. Hidden on screen; when the lesson
 * editor is open, printing shows only this (canon.css, "LESSON PLAN PRINT").
 * The editor's form fields don't print well, so the plan is re-set as text.
 */
export default function LessonPrint({ d, cls, subject, teacher, homework }: {
  d: Plan; cls: string; subject: string; teacher: string; homework: string | null;
}) {
  const list = (xs: string[]) => xs.map(s => s.trim()).filter(Boolean);
  const objectives = list(d.objectives), criteria = list(d.successCriteria);
  const stages = d.stages.filter(s => s.name || s.teacher || s.students);
  const total = stages.reduce((n, s) => n + (Number(s.minutes) || 0), 0);
  const materials = d.materials.filter(m => m.label.trim());
  return (
    <article className="lp-print" aria-hidden="true">
      <header className="lpp-head">
        <div>
          <div className="lpp-kicker">LESSON PLAN · {cls} · {subject}</div>
          <h1>{d.title || 'Untitled lesson'}</h1>
          <div className="lpp-meta">
            {d.chapterName && <span>Chapter: {d.chapterName}</span>}
            {d.date && <span>{fmtDay(d.date)}{d.period ? `, period ${d.period}` : ''}</span>}
            <span>{d.durationMin} minutes</span>
            <span>{teacher}</span>
            <span className="lpp-status">{d.status === 'taught' ? 'Taught' : d.status === 'ready' ? 'Ready' : 'Draft'}</span>
          </div>
        </div>
      </header>

      {d.topics.length > 0 && <section><h2>Content points</h2><ul>{d.topics.map(t => <li key={t}>{t}</li>)}</ul></section>}
      <div className="lpp-cols">
        <section><h2>Learning objectives</h2>{objectives.length ? <ul>{objectives.map((o, i) => <li key={i}>{o}</li>)}</ul> : <p className="lpp-none">None written.</p>}</section>
        <section><h2>Success criteria</h2>{criteria.length ? <ul>{criteria.map((o, i) => <li key={i}>{o}</li>)}</ul> : <p className="lpp-none">None written.</p>}</section>
      </div>
      {d.priorKnowledge.trim() && <section><h2>Prior knowledge</h2><p>{d.priorKnowledge}</p></section>}

      <section>
        <h2>Lesson flow <span className="lpp-sub">{total} of {d.durationMin} minutes</span></h2>
        <table className="lpp-tbl">
          <thead><tr><th style={{ width: '16%' }}>Stage</th><th style={{ width: '8%' }}>Min</th><th>Teacher</th><th>Students</th></tr></thead>
          <tbody>
            {stages.map((s, i) => (
              <tr key={i}><td><b>{s.name || `Stage ${i + 1}`}</b></td><td>{s.minutes}</td><td>{s.teacher}</td><td>{s.students}</td></tr>
            ))}
          </tbody>
        </table>
      </section>

      {(d.differentiation.support || d.differentiation.stretch) && (
        <div className="lpp-cols">
          <section><h2>Support</h2><p>{d.differentiation.support || '—'}</p></section>
          <section><h2>Stretch</h2><p>{d.differentiation.stretch || '—'}</p></section>
        </div>
      )}
      {d.checkForUnderstanding.trim() && <section><h2>Exit check</h2><p>{d.checkForUnderstanding}</p></section>}
      {(materials.length > 0 || homework) && (
        <div className="lpp-cols">
          {materials.length > 0 && <section><h2>Materials</h2><ul>{materials.map((m, i) => <li key={i}>{m.label}{m.url ? ` (${m.url})` : ''}</li>)}</ul></section>}
          {homework && <section><h2>Homework</h2><p>{homework}</p></section>}
        </div>
      )}
      {d.reflection.trim() && <section><h2>Reflection</h2><p>{d.reflection}</p></section>}
      <footer className="lpp-foot"><span>Powered by Sthara · The Institutional OS</span></footer>
    </article>
  );
}
