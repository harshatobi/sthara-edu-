'use client';

import { useState } from 'react';
import { MagnifyingGlassIcon as MagnifyingGlass } from '@phosphor-icons/react/dist/ssr/MagnifyingGlass';
import { TrendDownIcon as TrendDown } from '@phosphor-icons/react/dist/ssr/TrendDown';
import { TrendUpIcon as TrendUp } from '@phosphor-icons/react/dist/ssr/TrendUp';
import { Skeleton, hmColor } from '@/components/canon/ui';
import { Sparkline } from '@/components/canon/TrendLine';
import { chapterStats, chaptersFor, scoreFor, studentOverall } from '@/lib/teacher/mastery';
import { change, meanSeries, movers } from '@/lib/teacher/masteryTrend';
import type { TStudent } from '@/lib/teacher/desk';
import { Delta, Score, initials, pts } from './parts';
import type { TrendResp } from './StudentView';

type Sort = 'low' | 'drop' | 'rise' | 'name';

export default function ClassView({ roster, cls, subject, trends, go }: {
  roster: TStudent[]; cls: string; subject: string; trends: TrendResp | null; go: (n: Record<string, string | null>) => void;
}) {
  const [sort, setSort] = useState<Sort>('low');
  const [q, setQ] = useState('');
  const chapters = chaptersFor(cls, subject, roster);
  const stats = chapterStats(chapters, roster, subject);
  const rows = roster.map(s => {
    const now = studentOverall(s, subject);
    const series = trends?.students[s.id]?.subject ?? null;
    const scoredCh = chapters.map(c => ({ c, t: scoreFor(s, subject, c.key) })).filter(x => x.t);
    const weakest = scoredCh.length ? scoredCh.reduce((m, x) => (x.t!.score < m.t!.score ? x : m)) : null;
    return {
      s, now, series, change: series ? change(series) : null, weakest,
      items: scoredCh.reduce((a, x) => a + x.t!.items, 0), firm: scoredCh.filter(x => x.t!.band === 'firm').length, scored: scoredCh.length,
    };
  });
  const withScore = rows.filter(r => r.now !== null);
  const classNow = withScore.length ? Math.round(withScore.reduce((a, r) => a + r.now!, 0) / withScore.length) : null;
  const classSeries = trends ? meanSeries(rows.map(r => r.series ?? []), trends.weeks.length) : null;
  const m = movers(rows);
  const shown = rows
    .filter(r => !q || r.s.name.toLowerCase().includes(q.toLowerCase()) || r.s.rollNo?.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => sort === 'name' ? a.s.name.localeCompare(b.s.name)
      : sort === 'low' ? (a.now ?? 999) - (b.now ?? 999)
        : sort === 'drop' ? (a.change ?? 999) - (b.change ?? 999)
          : (b.change ?? -999) - (a.change ?? -999));
  const chapterMoves = stats.filter(c => c.scored).map(c => {
    const s = trends ? meanSeries(Object.values(trends.students).map(t => t.chapters[c.key] ?? []), trends.weeks.length) : null;
    return { c, s, change: s ? change(s) : null };
  });

  if (!withScore.length) {
    return (
      <div className="card ms-empty">
        <h3 className="ms-h3">Nothing graded in {subject} for {cls} yet</h3>
        <p className="muted ms-sub">Mastery builds from confirmed homework and quiz marks and finished tutor sessions. Grade work for this class and each student&apos;s chapters fill in here, with trends from the second week.</p>
      </div>
    );
  }

  return (
    <>
      <div className="kpis">
        <div className="kpi">
          <div className="lb">CLASS MASTERY</div>
          <div className="vl" style={{ color: classNow === null ? 'var(--mut2)' : hmColor(classNow) }}>{classNow === null ? 'Not yet' : `${classNow}%`}</div>
          <div className="nt">{classSeries ? <><Delta v={change(classSeries)} /> <span className="muted">over 4 weeks</span></> : <Skeleton h={14} w={120} />}</div>
        </div>
        <div className="kpi">
          <div className="lb">NEED SUPPORT</div>
          <div className="vl" style={{ color: 'var(--red)' }}>{withScore.filter(r => r.now! < 40).length}</div>
          <div className="nt muted">below 40% in {subject}</div>
        </div>
        <div className="kpi">
          <div className="lb">RISING</div>
          <div className="vl" style={{ color: 'var(--green)' }}>{trends ? rows.filter(r => (r.change ?? 0) >= 5).length : '…'}</div>
          <div className="nt muted">up 5 points or more in 4 weeks</div>
        </div>
        <div className="kpi">
          <div className="lb">SLIPPING</div>
          <div className="vl" style={{ color: 'var(--amber)' }}>{trends ? rows.filter(r => (r.change ?? 0) <= -5).length : '…'}</div>
          <div className="nt muted">down 5 points or more in 4 weeks</div>
        </div>
      </div>

      <div className="ms-movers">
        {([['up', 'Biggest rises', TrendUp, m.up], ['down', 'Biggest drops', TrendDown, m.down]] as const).map(([k, title, Icon, list]) => (
          <div className="card" key={k}>
            <h3 className="ms-h3"><Icon size={18} weight="bold" color={k === 'up' ? 'var(--green)' : 'var(--red)'} /> {title}</h3>
            <p className="muted ms-sub">Last 4 weeks, at least 5 points.</p>
            {!trends ? <Skeleton h={120} /> : !list.length ? <p className="muted">{k === 'up' ? 'No one has risen 5 points or more yet.' : 'No one has dropped 5 points or more.'}</p> : (
              <ul className="ms-mv">
                {list.map(r => (
                  <li key={r.s.id}>
                    <button onClick={() => go({ student: r.s.id, chapter: null })}>
                      <span className="av ms-av-sm">{initials(r.s.name)}</span>
                      <b className="ms-mv-name">{r.s.name}</b>
                      <Sparkline points={pts(r.series!, trends.weeks)} label={`${r.s.name} by week`} w={80} />
                      <Delta v={r.change} />
                      <Score v={r.now} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>

      <div className="card">
        <div className="ms-card-h">
          <div>
            <h3 className="ms-h3">Every student</h3>
            <p className="muted ms-sub">Open a student for their chapter-by-chapter drill-down.</p>
          </div>
          <div className="ms-tools">
            <label className="ms-search"><MagnifyingGlass size={15} aria-hidden /><input type="search" placeholder="Find a student" value={q} onChange={e => setQ(e.target.value)} aria-label="Find a student" /></label>
            <select className="cmp-sel" aria-label="Sort students" value={sort} onChange={e => setSort(e.target.value as Sort)}>
              <option value="low">Lowest mastery first</option>
              <option value="drop">Biggest drop first</option>
              <option value="rise">Biggest rise first</option>
              <option value="name">Name</option>
            </select>
          </div>
        </div>
        <div className="tbl-wrap">
          <table className="tbl ms-roster">
            <thead><tr>
              <th scope="col">Student</th><th scope="col">Mastery</th><th scope="col">4 weeks</th><th scope="col">Trend</th>
              <th scope="col">Lowest chapter</th><th scope="col">Evidence</th>
            </tr></thead>
            <tbody>
              {shown.map(r => (
                <tr key={r.s.id} className="ms-click" onClick={() => go({ student: r.s.id, chapter: null })}>
                  <td><button className="ms-link" onClick={e => { e.stopPropagation(); go({ student: r.s.id, chapter: null }); }}>
                    <span className="av ms-av-sm">{initials(r.s.name)}</span><span className="ms-who"><b>{r.s.name}</b>{r.s.rollNo && <span className="muted ms-tiny">Roll {r.s.rollNo}</span>}</span>
                  </button></td>
                  <td><Score v={r.now} /></td>
                  <td>{trends ? <Delta v={r.change} /> : <Skeleton h={12} w={30} />}</td>
                  <td>{trends ? (r.series ? <Sparkline points={pts(r.series, trends.weeks)} label={`${r.s.name} by week`} /> : <span className="muted ms-tiny">No history</span>) : <Skeleton h={20} w={90} />}</td>
                  <td>{r.weakest ? <span className="ms-weak"><Score v={Math.round(r.weakest.t!.score)} size={13} /> {r.weakest.c.name}</span> : <span className="muted ms-tiny">Nothing graded</span>}</td>
                  <td className="muted ms-tiny">{r.items} piece{r.items === 1 ? '' : 's'}{r.scored > 0 && <><br />{r.firm} of {r.scored} chapters firm</>}</td>
                </tr>
              ))}
              {!shown.length && <tr><td colSpan={6} className="muted">No student matches “{q}”.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {chapterMoves.length > 0 && (
        <div className="card" style={{ marginTop: 18 }}>
          <h3 className="ms-h3">Chapters</h3>
          <p className="muted ms-sub">The class average on each chapter and how it moved in the last 4 weeks.</p>
          <ul className="ms-chlist">
            {chapterMoves.map(({ c, s, change: ch }) => (
              <li key={c.key}>
                <span className="ms-chlist-n">{c.seq}</span>
                <span className="ms-who"><b className="ms-chlist-name">{c.name}</b><span className="muted ms-tiny">{c.scored} scored{c.r > 0 && <>, {c.r} below 40%</>}</span></span>
                {s && trends ? <Sparkline points={pts(s, trends.weeks)} label={`${c.name} class average by week`} w={80} /> : <span />}
                <Delta v={ch} />
                <Score v={c.avg} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
