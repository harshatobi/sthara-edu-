'use client';

import type { LabScene } from '@/lib/lab/registry';
import type { LabEngine, Prediction } from '@/lib/lab/types';
import { LabView } from './LabStage';

const LETTERS = 'ABCD';

/**
 * The scene as an A4 worksheet: the set-up drawn as the class first sees it
 * (answers hidden), each prediction with boxes to tick and room for reasons,
 * then what they observed. The teacher's answer key prints on its own page.
 * Hidden on screen; a print from the builder shows only this (lab.css).
 */
export default function LabPrint({ scene, engine, questions, withKey }: { scene: LabScene; engine: LabEngine<any>; questions: Prediction[]; withKey: boolean }) {
  const noop = () => {};
  return (
    <article className="lab-print" aria-hidden="true">
      <header className="lbp-head">
        <div className="lbp-kicker">LIVE LAB WORKSHEET · CLASS {engine.classes.join('/')} SCIENCE · {engine.chapters[0].toUpperCase()}</div>
        <h1>{scene.title}</h1>
        <div className="lbp-who"><span>Name</span><span>Class</span><span>Date</span></div>
      </header>
      {scene.narration && <p className="lbp-narr">{scene.narration}</p>}
      <div className="lbp-fig">
        <LabView engine={engine} params={scene.params} setParam={noop} conceal runKey={0} locked />
      </div>
      <ol className="lbp-qs">
        {questions.map(q => (
          <li key={q.id}>
            <b>{q.prompt}</b>
            <div className="lbp-opts">{q.options.map((o, k) => <span key={o}><i />{LETTERS[k]}. {o}</span>)}</div>
            <div className="lbp-lines"><span>Why I think so:</span></div>
          </li>
        ))}
      </ol>
      <section className="lbp-obs">
        <h2>What we saw when it ran</h2>
        <div className="lbp-lines tall" />
      </section>

      {withKey && (
        <section className="lbp-key">
          <div className="lbp-kicker">TEACHER&apos;S COPY · ANSWER KEY</div>
          <h1>{scene.title}</h1>
          <ol className="lbp-qs">
            {questions.map(q => (
              <li key={q.id}>
                <b>{q.prompt}</b>
                <p><b>{LETTERS[q.correct]}. {q.options[q.correct]}</b></p>
                <p>{q.explain}</p>
              </li>
            ))}
          </ol>
          <h2>The set-up</h2>
          <p className="lbp-setup">{engine.readouts(scene.params as any).map(r => `${r.label}: ${r.value}`).join(' · ')}</p>
        </section>
      )}
    </article>
  );
}
