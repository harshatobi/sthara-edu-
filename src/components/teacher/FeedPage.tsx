'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { PlusIcon as Plus } from '@phosphor-icons/react/dist/ssr/Plus';
import { ArrowsClockwiseIcon as ArrowsClockwise } from '@phosphor-icons/react/dist/ssr/ArrowsClockwise';
import { PageBar } from '@/components/canon/ui';
import { useToast } from '@/components/canon/useToast';
import { FeedList, IncidentForm, type StudentOption } from '@/components/feed/Feed';
import { useAuth } from '@/contexts/AuthContext';
import { createClient } from '@/lib/supabase/client';
import { isEscalated } from '@/lib/feed/rules';
import { useFeed, type FeedItem } from '@/lib/feed/useFeed';
import { displayClass, normClass } from '@/lib/teacher/scope';

interface IncidentRow { id: string; category: string; severity: string; parent_notice: string; status: string; class_name: string | null; logged_by: string | null }

/**
 * The teacher's situational feed (mockup teacher:feed): what needs attention in
 * their classes, live. Acknowledge with a note, log incidents, and confirm
 * parent notice for discipline incidents in the class they are class teacher of.
 */
export default function TeacherFeedPage() {
  const { profile } = useAuth();
  const { items, error, scanning, acknowledge, reload, call } = useFeed();
  const [toast, toastEl] = useToast();
  const [logging, setLogging] = useState(false);
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [incidents, setIncidents] = useState<Map<string, IncidentRow>>(new Map());
  const [outcomeFor, setOutcomeFor] = useState<string | null>(null);
  const [outcome, setOutcome] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [actErr, setActErr] = useState<string | null>(null);
  const myClass = normClass(profile?.teacherClass);

  useEffect(() => {
    if (!profile?.schoolId) return;
    createClient().from('users').select('id, name, student_class').eq('school_id', profile.schoolId).eq('role', 'student').order('name')
      .then(({ data }) => setStudents((data || []).map(s => ({ id: s.id, name: s.name || 'Student', cls: displayClass(s.student_class) }))));
  }, [profile?.schoolId]);

  // The incidents behind incident items (parent-notice state, who logged them). Reloaded after acting.
  const incidentKey = useMemo(() => (items || []).filter(i => i.sourceTable === 'incidents' && i.sourceId).map(i => i.sourceId!).sort().join(','), [items]);
  const [incNonce, setIncNonce] = useState(0);
  const loadIncidents = useCallback(() => setIncNonce(n => n + 1), []);
  useEffect(() => {
    if (!incidentKey) return;
    let alive = true;
    createClient().from('incidents').select('id, category, severity, parent_notice, status, class_name, logged_by').in('id', incidentKey.split(','))
      .then(({ data }) => { if (alive) setIncidents(new Map((data || []).map(r => [r.id, r]))); });
    return () => { alive = false; };
  }, [incidentKey, incNonce]);

  const classes = useMemo(() => [...new Set(students.map(s => s.cls))].sort((a, b) => a.localeCompare(b, 'en', { numeric: true })), [students]);
  const open = (items || []).filter(i => !i.acknowledgedAt);
  const urgent = open.filter(i => i.severity === 'critical').length;
  const escalated = open.filter(i => isEscalated(i)).length;

  const act = async (inc: IncidentRow, action: 'notify' | 'decline' | 'close') => {
    setBusy(inc.id + action); setActErr(null);
    try {
      const r = await call('/api/staff/incidents', 'PATCH', { id: inc.id, action, outcome: action === 'close' ? outcome : undefined });
      toast(action === 'notify' ? `Parents told${r.parentsTold ? ` (${r.parentsTold})` : ' (no linked parent yet)'}` : action === 'decline' ? 'Recorded: parents not told' : 'Incident closed');
      setOutcomeFor(null); setOutcome('');
      loadIncidents(); reload();
    } catch (e: any) { setActErr(e.message); } finally { setBusy(null); }
  };

  const actionsFor = (item: FeedItem) => {
    if (item.sourceTable !== 'incidents' || !item.sourceId) return null;
    const inc = incidents.get(item.sourceId);
    if (!inc) return null;
    const canNotice = inc.parent_notice === 'awaiting_class_teacher' && !!myClass && myClass === normClass(inc.class_name);
    const canClose = inc.status === 'open' && inc.logged_by === profile?.uid && inc.severity !== 'critical'
      && !['awaiting_class_teacher', 'principal_decides'].includes(inc.parent_notice);
    if (!canNotice && !canClose && inc.status !== 'closed') return null;
    return (
      <div style={{ marginTop: 10 }}>
        {inc.status === 'closed' && <div className="muted" style={{ fontSize: 12.5 }}>Incident closed.</div>}
        {canNotice && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 12.5, fontWeight: 700 }}>You are the class teacher. Tell the parents?</span>
            <button className="btn pri sm" disabled={!!busy} onClick={() => act(inc, 'notify')}>Tell parents</button>
            <button className="btn sm" disabled={!!busy} onClick={() => act(inc, 'decline')}>Don&apos;t tell</button>
          </div>
        )}
        {canClose && (outcomeFor === inc.id ? (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
            <input className="cmp-in" style={{ flex: '1 1 240px', margin: 0 }} value={outcome} maxLength={2000} autoFocus
              aria-label="What was done" placeholder="What was done (required to close)" onChange={e => setOutcome(e.target.value)} />
            <button className="btn pri sm" disabled={!!busy || outcome.trim().length < 3} onClick={() => act(inc, 'close')}>Close incident</button>
            <button className="btn sm" onClick={() => { setOutcomeFor(null); setOutcome(''); }}>Cancel</button>
          </div>
        ) : <button className="btn sm" style={{ marginTop: 6 }} onClick={() => setOutcomeFor(inc.id)}>Close incident</button>)}
      </div>
    );
  };

  return (
    <>
      {toastEl}
      <PageBar eyebrow="SITUATIONAL FEED" title="What needs you now"
        sub={items ? `${open.length} open${urgent ? ` · ${urgent} critical` : ''}${escalated ? ` · ${escalated} escalated to the principal` : ''}${scanning ? ' · checking for new signals…' : ''}` : 'Loading…'}
        actions={<>
          <button className="btn" onClick={reload} aria-label="Refresh the feed"><ArrowsClockwise size={16} /> Refresh</button>
          <button className="btn pri" onClick={() => setLogging(v => !v)}><Plus size={16} weight="bold" /> Log incident</button>
        </>} />
      {error && <div className="note err" role="alert" style={{ marginBottom: 16 }}>
        {/does not exist|schema cache|column/i.test(error) ? 'The situational feed is not switched on for this school yet (database update pending).' : error}
      </div>}
      {actErr && <div className="err" role="alert" style={{ marginBottom: 12 }}>{actErr}</div>}
      {logging && (
        <IncidentForm students={students} classes={classes} onCancel={() => setLogging(false)}
          onSubmit={async body => {
            const r = await call('/api/staff/incidents', 'POST', body);
            setLogging(false);
            toast(r.parentNotice === 'sent' ? `Incident logged. Parents told${r.parentsTold ? '' : ' (no linked parent yet)'}.` : 'Incident logged');
            reload();
            return r;
          }} />
      )}
      <FeedList items={items} onAck={acknowledge} actionsFor={actionsFor}
        emptyText="Signals from your classes appear here: missed homework, falling mastery, low wellness check-ins, absence streaks, proctoring flags and incidents." />
    </>
  );
}
