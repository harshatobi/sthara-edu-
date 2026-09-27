'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { SirenIcon as Siren } from '@phosphor-icons/react/dist/ssr/Siren';
import { BellSimpleIcon as BellSimple } from '@phosphor-icons/react/dist/ssr/BellSimple';
import { TimerIcon as Timer } from '@phosphor-icons/react/dist/ssr/Timer';
import { WarningIcon as Warning } from '@phosphor-icons/react/dist/ssr/Warning';
import { CalendarCheckIcon as CalendarCheck } from '@phosphor-icons/react/dist/ssr/CalendarCheck';
import { PlusIcon as Plus } from '@phosphor-icons/react/dist/ssr/Plus';
import { Chip, PageBar } from '@/components/canon/ui';
import { useToast } from '@/components/canon/useToast';
import { FeedList, IncidentForm, span, useNow } from '@/components/feed/Feed';
import { createClient } from '@/lib/supabase/client';
import type { AdminDesk } from '@/lib/admin/desk';
import { INCIDENT_RULES, isEscalated, istDay, type IncidentCategory } from '@/lib/feed/rules';
import { useFeed, type FeedItem } from '@/lib/feed/useFeed';
import { displayClass, normClass } from '@/lib/teacher/scope';
import { CardHead, DeskGate, Kpi } from './kit';

export default function AdminFeedPage() {
  return <DeskGate need={['feed.read', 'incidents.manage']}>{desk => <Command desk={desk} />}</DeskGate>;
}

interface Incident {
  id: string; category: IncidentCategory; severity: string; summary: string; details: string | null; location: string | null;
  parent_notice: string; status: string; class_name: string | null; student_id: string | null; occurred_at: string; created_at: string; outcome: string | null;
}

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = xs.slice().sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};
const fmtMin = (m: number | null) => (m === null ? '—' : m < 60 ? `${Math.round(m)} min` : m < 1440 ? `${(m / 60).toFixed(1)} h` : `${Math.round(m / 1440)} d`);

/**
 * The principal's command view of the situational feed: everything open across
 * the school, what has escalated, response times, incidents waiting on a
 * decision (including child protection), and which registers are unmarked.
 */
function Command({ desk }: { desk: AdminDesk }) {
  const { items, error, acknowledge, reload, call } = useFeed(30);
  const [toast, toastEl] = useToast();
  const canDecide = desk.me.access.can('incidents.manage');
  const canAttendance = desk.me.access.can('attendance.read');
  const [incidents, setIncidents] = useState<Incident[] | null>(null);
  const [registers, setRegisters] = useState<Map<string, { marked: number; absent: number }> | null>(null);
  const [logging, setLogging] = useState(false);
  const [closing, setClosing] = useState<string | null>(null);
  const [outcome, setOutcome] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [incNonce, setIncNonce] = useState(0);
  const loadIncidents = useCallback(() => setIncNonce(n => n + 1), []);
  useEffect(() => {
    let alive = true;
    const since = new Date(Date.now() - 60 * 86_400_000).toISOString();
    createClient().from('incidents')
      .select('id, category, severity, summary, details, location, parent_notice, status, class_name, student_id, occurred_at, created_at, outcome')
      .eq('school_id', desk.school.id).or(`status.eq.open,created_at.gte.${since}`).order('created_at', { ascending: false }).limit(200)
      .then(({ data, error: e }) => { if (alive) setIncidents(e ? [] : (data as Incident[]) || []); });
    return () => { alive = false; };
  }, [desk.school.id, incNonce]);

  useEffect(() => {
    if (!canAttendance) return;
    createClient().from('attendance').select('class_name, status').eq('school_id', desk.school.id).eq('day', istDay())
      .then(({ data, error: e }) => {
        if (e) { setRegisters(new Map()); return; }
        const m = new Map<string, { marked: number; absent: number }>();
        for (const r of data || []) {
          const k = normClass(r.class_name);
          const cur = m.get(k) || { marked: 0, absent: 0 };
          cur.marked++; if (r.status === 'absent') cur.absent++;
          m.set(k, cur);
        }
        setRegisters(m);
      });
  }, [canAttendance, desk.school.id]);

  const students = useMemo(() => desk.students.map(s => ({ id: s.id, name: s.name, cls: displayClass(s.cls) })), [desk.students]);
  const studentName = useMemo(() => new Map(desk.students.map(s => [s.id, s.name])), [desk.students]);
  const classSizes = useMemo(() => {
    const m = new Map<string, { label: string; n: number }>();
    for (const s of desk.students) {
      const k = normClass(s.cls);
      if (!k) continue;
      const cur = m.get(k) || { label: displayClass(s.cls), n: 0 };
      cur.n++; m.set(k, cur);
    }
    return [...m.entries()].sort((a, b) => a[1].label.localeCompare(b[1].label, 'en', { numeric: true }));
  }, [desk.students]);
  const teacherName = useMemo(() => new Map(desk.workforce.teachers.map(t => [t.id, t.name])), [desk.workforce.teachers]);

  const now = useNow();
  const all = items || [];
  const open = all.filter(i => !i.acknowledgedAt);
  const escalatedNow = open.filter(i => isEscalated(i, now));
  const critical = open.filter(i => i.severity === 'critical');
  const recentAcked = all.filter(i => i.acknowledgedAt && Date.parse(i.createdAt) > now - 14 * 86_400_000);
  const responseMins = recentAcked.map(i => (Date.parse(i.acknowledgedAt!) - Date.parse(i.createdAt)) / 60_000);
  const med = median(responseMins);
  const waiting = (incidents || []).filter(i => i.parent_notice === 'principal_decides');
  const openCritical = (incidents || []).filter(i => i.status === 'open' && i.severity === 'critical');
  const unmarked = registers ? classSizes.filter(([k]) => !registers.get(k)?.marked) : [];

  const byStaff = (() => {
    const m = new Map<string, number[]>();
    for (const i of recentAcked) {
      const k = i.ackByName || 'Unknown';
      m.set(k, [...(m.get(k) || []), (Date.parse(i.acknowledgedAt!) - Date.parse(i.createdAt)) / 60_000]);
    }
    return [...m.entries()].map(([name, xs]) => ({ name, n: xs.length, med: median(xs) })).sort((a, b) => b.n - a.n);
  })();
  const byClass = (() => {
    const m = new Map<string, { label: string; open: number; escalated: number }>();
    for (const i of open) {
      if (!i.className) continue;
      const k = normClass(i.className);
      const cur = m.get(k) || { label: displayClass(i.className), open: 0, escalated: 0 };
      cur.open++; if (isEscalated(i, now)) cur.escalated++;
      m.set(k, cur);
    }
    return [...m.values()].sort((a, b) => b.escalated - a.escalated || b.open - a.open);
  })();

  const act = async (inc: Incident, action: 'notify' | 'decline' | 'close') => {
    setBusy(inc.id + action); setErr(null);
    try {
      const r = await call('/api/staff/incidents', 'PATCH', { id: inc.id, action, outcome: action === 'close' ? outcome : undefined });
      toast(action === 'notify' ? `Parents told${r.parentsTold ? ` (${r.parentsTold})` : ' (no linked parent yet)'}` : action === 'decline' ? 'Recorded: parents not told' : 'Incident closed');
      setClosing(null); setOutcome('');
      loadIncidents(); reload();
    } catch (e: any) { setErr(e.message); } finally { setBusy(null); }
  };

  const teacherLine = (i: FeedItem) => (i.teacherId ? `For ${teacherName.get(i.teacherId) || 'a teacher'}` : i.className ? `For ${displayClass(i.className)} teachers` : null);

  return (
    <>
      {toastEl}
      <PageBar eyebrow="SITUATIONAL FEED" title="School command view"
        sub={items ? `${open.length} open across the school · ${escalatedNow.length} escalated · median response ${fmtMin(med)} (14 days)` : 'Loading…'}
        actions={<button className="btn pri" onClick={() => setLogging(v => !v)}><Plus size={16} weight="bold" /> Log incident</button>} />
      {error && <div className="note err" role="alert" style={{ marginBottom: 16 }}>
        {/does not exist|schema cache|column/i.test(error) ? 'The situational feed is not switched on for this school yet (database update pending).' : error}
      </div>}
      {err && <div className="err" role="alert" style={{ marginBottom: 12 }}>{err}</div>}

      <div className="kpis">
        <Kpi label="OPEN ITEMS" value={items ? open.length : '…'} note={`${critical.length} critical`} noteColor={critical.length ? 'var(--red)' : undefined} icon={BellSimple} />
        <Kpi label="ESCALATED NOW" value={items ? escalatedNow.length : '…'} note="Past their time, not acknowledged" valueColor={escalatedNow.length ? 'var(--red)' : undefined} icon={Siren} />
        <Kpi label="MEDIAN RESPONSE" value={fmtMin(med)} note={`${recentAcked.length} acknowledged in 14 days`} icon={Timer} />
        {canDecide && <Kpi label="AWAITING YOUR DECISION" value={incidents ? waiting.length : '…'} note="Incidents: telling parents" valueColor={waiting.length ? 'var(--amber)' : undefined} icon={Warning} />}
        {canAttendance && <Kpi label="REGISTERS TODAY" value={registers ? `${classSizes.length - unmarked.length}/${classSizes.length}` : '…'} note={unmarked.length ? `${unmarked.length} not marked` : 'All marked'} noteColor={unmarked.length ? 'var(--amber)' : undefined} icon={CalendarCheck} />}
      </div>

      {logging && (
        <IncidentForm students={students} classes={classSizes.map(([, v]) => v.label)} onCancel={() => setLogging(false)}
          onSubmit={async body => { const r = await call('/api/staff/incidents', 'POST', body); setLogging(false); toast('Incident logged'); loadIncidents(); reload(); return r; }} />
      )}

      {canDecide && (waiting.length > 0 || openCritical.length > 0) && (
        <div className="card" style={{ marginBottom: 18, borderLeft: '4px solid var(--red)' }}>
          <CardHead title="Incidents that need you" sub="Bullying, safety and child protection are your call. Parents only see the category and the one-line summary." />
          {[...new Map([...waiting, ...openCritical].map(i => [i.id, i])).values()].map(inc => {
            const rule = INCIDENT_RULES[inc.category];
            return (
              <div className="row" key={inc.id} style={{ alignItems: 'flex-start' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
                    <Chip tone={inc.severity === 'critical' ? 'r' : 'a'}>{rule.label.toUpperCase()}</Chip>
                    {inc.category === 'child_protection' && <Chip tone="p">PRINCIPAL ONLY</Chip>}
                    <Chip tone="n">{inc.status === 'open' ? 'OPEN' : 'CLOSED'}</Chip>
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 14.5 }}>{inc.summary}</div>
                  <div className="muted" style={{ fontSize: 12.5, marginTop: 3 }}>
                    {[inc.student_id ? studentName.get(inc.student_id) : null, inc.class_name, inc.location, `logged ${span(inc.created_at, new Date(now).toISOString())} ago`].filter(Boolean).join(' · ')}
                  </div>
                  {inc.details && <div style={{ fontSize: 13, marginTop: 6, lineHeight: 1.55 }}>{inc.details}</div>}
                  {inc.category === 'child_protection' && (
                    <div className="note err" style={{ fontSize: 12.5, marginTop: 8 }}>
                      POCSO: suspected sexual abuse of a child must be reported to the police or the Child Welfare Committee, whatever is decided about parents. Record the report in the outcome.
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                    {inc.parent_notice === 'principal_decides' && <>
                      <button className="btn pri sm" disabled={!!busy || !inc.student_id} onClick={() => act(inc, 'notify')}>Tell parents</button>
                      <button className="btn sm" disabled={!!busy} onClick={() => act(inc, 'decline')}>Don&apos;t tell parents</button>
                    </>}
                    {inc.status === 'open' && inc.parent_notice !== 'principal_decides' && inc.parent_notice !== 'awaiting_class_teacher' && (closing === inc.id ? (
                      <>
                        <input className="cmp-in" style={{ flex: '1 1 260px', margin: 0 }} value={outcome} maxLength={2000} autoFocus aria-label="Outcome"
                          placeholder="What was done (and any report made)" onChange={e => setOutcome(e.target.value)} />
                        <button className="btn pri sm" disabled={!!busy || outcome.trim().length < 3} onClick={() => act(inc, 'close')}>Close</button>
                        <button className="btn sm" onClick={() => { setClosing(null); setOutcome(''); }}>Cancel</button>
                      </>
                    ) : <button className="btn sm" onClick={() => setClosing(inc.id)}>Close with outcome</button>)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="g2" style={{ alignItems: 'start', marginBottom: 18 }}>
        <div className="card">
          <CardHead title="Open by class" sub="Where attention is piling up" />
          {byClass.length ? byClass.slice(0, 8).map(c => (
            <div className="row" key={c.label}>
              <b style={{ flex: 1, fontSize: 14 }}>{c.label}</b>
              {c.escalated > 0 && <Chip tone="r">{c.escalated} ESCALATED</Chip>}
              <span className="muted" style={{ fontSize: 13 }}>{c.open} open</span>
            </div>
          )) : <p className="muted" style={{ fontSize: 13 }}>Nothing open is tied to a class.</p>}
        </div>
        <div className="card">
          <CardHead title="Response by staff" sub="Acknowledged in the last 14 days" />
          {byStaff.length ? byStaff.slice(0, 8).map(s => (
            <div className="row" key={s.name}>
              <b style={{ flex: 1, fontSize: 14 }}>{s.name}</b>
              <span className="muted" style={{ fontSize: 13 }}>{s.n} · median {fmtMin(s.med)}</span>
            </div>
          )) : <p className="muted" style={{ fontSize: 13 }}>No acknowledgements yet.</p>}
          {canAttendance && unmarked.length > 0 && (
            <div className="note" style={{ fontSize: 12.5, marginTop: 12 }}>Registers not marked today: {unmarked.map(([, v]) => v.label).join(', ')}.</div>
          )}
        </div>
      </div>

      <FeedList items={items} onAck={acknowledge} teacherLine={teacherLine} initialShow="open"
        emptyText="Signals from across the school appear here as they happen. Items escalate to you when teachers don't acknowledge them in time." />
    </>
  );
}
