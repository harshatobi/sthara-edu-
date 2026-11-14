'use client';

import type { Question } from '@/lib/teacher/questions';
import { LETTERS } from '@/lib/studio/handout';

export interface SheetData { studentId: string; code: string; questions: Question[] }

/**
 * One printed sheet per student for a paper quiz: their own questions, then the answer grid with their code. The
 * code (top right and above the grid) says whose sheet it is when it's photographed; the corner squares frame the
 * grid so it reads straight. Shown only while printing (printStudio('bubbles')). The global footer adds
 * "Powered by Sthara".
 */
export default function BubbleSheets({ sheets, school, title, cls, subject, nameOf }: {
  sheets: SheetData[]; school: string; title: string; cls: string; subject: string; nameOf: (id: string) => string;
}) {
  return (
    <div className="sd-print sd-bubbles" aria-hidden="true">
      {sheets.map(s => (
        <div className="sheet" key={s.code}>
          <div className="lh">
            <div><h1>{school || 'School'}</h1><p>{cls} · {subject} · {title}</p></div>
            <div className="code"><small>SHEET</small>{s.code}</div>
          </div>
          <div className="who"><span>Name: {nameOf(s.studentId)}</span><span>Roll no:</span><span>Date:</span></div>
          {s.questions.map((q, i) => (
            <div className="pq" key={i}>
              <div><b>{i + 1}.</b> {q.questionText}</div>
              {q.options && <div className="op">{q.options.map((o, j) => <span key={j}>({LETTERS[j]}) {o}</span>)}</div>}
            </div>
          ))}
          <div className="grid">
            <i className="c tl" /><i className="c tr" /><i className="c bl" /><i className="c br" />
            <p className="hd"><b>Answers</b> · SHEET <b>{s.code}</b> · Fill one circle fully with a dark pen. To change an answer, cross it out and fill the new one.</p>
            <div className="rows">
              {s.questions.map((q, i) => (
                <div className="row" key={i}>
                  <span className="n">{i + 1}</span>
                  {(q.options ?? ['', '', '', '']).map((_, j) => <span className="b" key={j}>{LETTERS[j]}</span>)}
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
