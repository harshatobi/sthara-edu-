import { NextResponse, type NextRequest } from 'next/server';
import { bad, deny, isUuid, requireAdmin, str } from '@/lib/admin/serverAuth';
import { isSession as isSessionOk, isoDay, sessionOf } from '@/lib/admin/format';
import { notifyGuardians } from '@/lib/parent/notify';
import {
  CODE_RE, gradingProblem, presetScheme, PRESETS, termProblem, toGrading, toRules, type Component, type PresetKey, type SubjectOverride,
} from '@/lib/exams/engine';
import {
  auditExam, buildCards, examError, loadCardSettings, loadClassTerm, loadRoster, loadSchemes, openSheets, publishClassTerm,
  reviewBackToOpen, summarizeClassTerm, toAssessment, toClassTerm, toScheme,
} from '@/lib/exams/server';

export const dynamic = 'force-dynamic';

const READ = ['exams.read', 'exams.manage', 'exams.publish'] as const;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The exam cell (exams.manage: academic coordinator, principal, school admin) and publishing (exams.publish:
 * principal, school admin). exams.read sees everything without changing it.
 *
 *   GET ?session=                         schemes, terms, assessments, classes and the progress board
 *   GET ?session=&term=&class=            one class's term: sheets, readiness, every student's standing
 *   GET ?session=&term=&class=&preview=   a student's card as it would publish now (or "all" for the class)
 *   GET ?session=&term=&class=&cards=1    the published cards (latest versions), for printing
 *   POST { action } :
 *     preset { preset, session, grades? }                                    exams.manage
 *     scheme { id, name, grades, grading, rules, status }                     exams.manage
 *     scheme_delete { id }                                                    exams.manage (only with no marks)
 *     term { id?, schemeId, name, seq, startsOn, endsOn, weight, components, subjectWeights }   exams.manage
 *     term_delete { id }                                                      exams.manage (only with no marks)
 *     assessment { id?, schemeId, termId, code, name, kind, maxMarks, subjects, heldFrom, heldTo }   exams.manage
 *     assessment_delete { id }                                                exams.manage (only with no marks)
 *     open { assessmentIds }                                                   exams.manage: create the marks sheets
 *     return_sheet { sheetId, note }                                          exams.manage: send a submitted sheet back
 *     review { termId, classId }                                              exams.publish (a class with no class teacher)
 *     publish { termId, classIds }                                            exams.publish
 *     reopen { termId, classId, reason, classSubjectIds }                     exams.publish
 *     hold { cardId, reason } | release { cardId }                            exams.publish or fees.collect
 *     settings { accent, affiliation, address, signatures, logo?, holdOnDues, holdMinAmount }   exams.manage
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, [...READ]);
  if ('res' in auth) return auth.res;
  const { db, admin } = auth;
  const q = req.nextUrl.searchParams;
  const session = isSessionOk(q.get('session')) ? q.get('session')! : sessionOf();
  try {
    const [bundle, roster] = await Promise.all([loadSchemes(db, admin.schoolId, session), loadRoster(db, admin.schoolId)]);
    const termId = q.get('term'), classId = q.get('class');
    if (termId && classId) {
      if (!isUuid(termId) || !isUuid(classId)) return bad('Unknown class or term.', 404);
      const d = await loadClassTerm(db, admin.schoolId, bundle, roster, classId, termId);
      if ('error' in d) return bad(d.error, d.status);
      const school = await schoolInfo(db, admin.schoolId);
      if (q.get('cards')) {
        const { data, error } = await db.from('report_cards').select('id, student_id, version, snapshot, held, hold_reason, revised, published_at')
          .eq('term_id', termId).eq('class_id', classId).is('superseded_at', null).order('student_id').limit(1000);
        if (error) return examError(error, 'Could not load the report cards.');
        return NextResponse.json({ cards: (data || []).map(c => ({ id: c.id, studentId: c.student_id, version: c.version, held: c.held, holdReason: c.hold_reason, revised: c.revised, publishedAt: c.published_at, snapshot: c.snapshot })) });
      }
      const preview = q.get('preview');
      if (preview) {
        const ids = preview === 'all' ? d.students.map(s => s.id) : d.students.some(s => s.id === preview) ? [preview] : [];
        if (!ids.length) return bad('That student isn\'t in this class.', 404);
        const cards = await buildCards(db, admin.schoolId, school.name, school.board, session, d, ids, d.classTerm.version + 1, d.classTerm.version > 0);
        return NextResponse.json({ cards: ids.map(id => ({ studentId: id, snapshot: cards.get(id) })) });
      }
      return NextResponse.json(summarizeClassTerm(d));
    }

    // The board: every sheet's status, class terms, and what each grade's classes take.
    const schemeIds = bundle.schemes.map(s => s.id);
    const [sheets, cts, settings] = await Promise.all([
      schemeIds.length ? db.from('exam_sheets').select('id, assessment_id, class_id, class_subject_id, status').eq('school_id', admin.schoolId).in('assessment_id', bundle.assessments.map(a => a.id)).limit(20000) : Promise.resolve({ data: [], error: null }),
      schemeIds.length ? db.from('exam_class_terms').select('*').eq('school_id', admin.schoolId).in('term_id', bundle.terms.map(t => t.id)) : Promise.resolve({ data: [], error: null }),
      loadCardSettings(db, admin.schoolId),
    ]);
    if (sheets.error) return examError(sheets.error, 'Could not load the marks sheets.');
    const subjectsByGrade: Record<string, { key: string; name: string }[]> = {};
    for (const c of roster.classes) {
      if (c.grade === null) continue;
      const list = subjectsByGrade[c.grade] ?? (subjectsByGrade[c.grade] = []);
      for (const cs of roster.classSubjects.filter(x => x.classId === c.id)) if (!list.some(x => x.key === cs.key)) list.push({ key: cs.key, name: cs.name });
    }
    const { data: sessions } = await db.from('exam_schemes').select('session').eq('school_id', admin.schoolId);
    return NextResponse.json({
      session, today: isoDay(), current: sessionOf(), schoolName: admin.schoolName,
      sessions: [...new Set([sessionOf(), ...(sessions || []).map(s => s.session)])].sort().reverse(),
      can: { manage: admin.access.can('exams.manage'), publish: admin.access.can('exams.publish'), hold: admin.access.any('exams.publish', 'fees.collect') },
      presets: Object.entries(PRESETS).map(([key, p]) => ({ key, ...p })),
      schemes: bundle.schemes, terms: bundle.terms, assessments: bundle.assessments,
      classes: roster.classes.map(c => ({ ...c, students: roster.students.filter(s => normCls(s.cls) === normCls(c.name)).length })),
      subjectsByGrade,
      sheets: (sheets.data || []).map((s: any) => ({ id: s.id, assessmentId: s.assessment_id, classId: s.class_id, classSubjectId: s.class_subject_id, status: s.status })),
      classTerms: (cts.data || []).map((r: any) => ({ termId: r.term_id, classId: r.class_id, ...toClassTerm(r) })),
      settings: { ...settings, logo: settings.logo },
    });
  } catch (e: any) {
    return examError(e, 'Could not load exams.');
  }
}

/** JSON with sorted keys: the database returns objects in its own key order. */
const canon = (v: unknown): string => JSON.stringify(v, (_k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b))) : x));

const normCls = (c: string | null | undefined) => (c || '').toLowerCase().replace(/class|[^a-z0-9]/g, '');

async function schoolInfo(db: any, schoolId: string) {
  const { data } = await db.from('schools').select('name, settings').eq('id', schoolId).maybeSingle();
  return { name: data?.name || 'School', board: String(data?.settings?.board || data?.settings?.curriculum || 'CBSE') };
}

/** Marks entered on any sheet of these assessments (structure that carries marks can't be removed or reshaped). */
async function marksExist(db: any, assessmentIds: string[]): Promise<boolean> {
  if (!assessmentIds.length) return false;
  const { data: sh } = await db.from('exam_sheets').select('id').in('assessment_id', assessmentIds).limit(5000);
  const ids = (sh || []).map((x: any) => x.id);
  for (let i = 0; i < ids.length; i += 150) {
    const { data } = await db.from('exam_marks').select('id').in('sheet_id', ids.slice(i, i + 150)).limit(1);
    if (data?.length) return true;
  }
  return false;
}

function components(raw: unknown): Component[] | null {
  if (!Array.isArray(raw) || raw.length > 20) return null;
  const out: Component[] = [];
  for (const c of raw) {
    const key = str(c?.key, 20).toLowerCase().replace(/[^a-z0-9_]/g, '');
    const name = str(c?.name, 60);
    const codes = (Array.isArray(c?.codes) ? c.codes : []).map((x: unknown) => str(x, 12).toUpperCase()).filter(Boolean).slice(0, 12);
    const rule = c?.rule === 'avg' || c?.rule === 'best' ? c.rule : 'sum';
    if (!key) return null;
    out.push({ key, name, weight: Number(c?.weight), codes, rule, ...(rule === 'best' ? { best: Number(c?.best) } : {}) });
  }
  return out;
}

function weightsMap(raw: unknown): Record<string, Record<string, number>> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, Record<string, number>> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>).slice(0, 80)) {
    if (!/^[a-z0-9-]{1,80}$/.test(k) || !v || typeof v !== 'object') return null;
    const inner: Record<string, number> = {};
    for (const [ck, w] of Object.entries(v as Record<string, unknown>)) {
      const n = Number(w);
      if (!/^[a-z0-9_]{1,20}$/.test(ck) || !Number.isFinite(n) || n < 0 || n > 1000) return null;
      inner[ck] = n;
    }
    out[k] = inner;
  }
  return out;
}

function overrides(raw: unknown): Record<string, SubjectOverride> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, SubjectOverride> = {};
  for (const [k, v] of Object.entries(raw as Record<string, any>).slice(0, 80)) {
    if (!(k === '*' || /^[a-z0-9-]{1,80}$/.test(k)) || !v || typeof v !== 'object') return null;
    const o: SubjectOverride = {};
    if (v.skip) o.skip = true;
    if (v.max !== undefined && v.max !== null && v.max !== '') {
      const n = Number(v.max);
      if (!(n > 0 && n <= 1000)) return null;
      o.max = n;
    }
    out[k] = o;
  }
  return out;
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, [...READ, 'fees.collect']);
  if ('res' in auth) return auth.res;
  const { db, admin } = auth;
  const b = await req.json().catch(() => null);
  if (!b || typeof b.action !== 'string') return bad('Invalid request.');
  const school = admin.schoolId;
  const audit = (action: string, table: string, id: string, values: Record<string, unknown>) => auditExam(db, school, admin.id, 'admin', action, table, id, values);

  try {
    // ── Holds (fees office or principal) ──
    if (b.action === 'hold' || b.action === 'release') {
      if (!admin.access.any('exams.publish', 'fees.collect')) return bad('Your role doesn\'t allow holding report cards.', 403);
      if (!isUuid(b.cardId)) return bad('Unknown report card.');
      const { data: card } = await db.from('report_cards').select('id, held, superseded_at, student_id').eq('id', b.cardId).eq('school_id', school).maybeSingle();
      if (!card || card.superseded_at) return bad('That report card has been replaced by a newer one.', 404);
      const now = new Date().toISOString();
      if (b.action === 'hold') {
        const reason = str(b.reason, 300);
        if (!reason) return bad('Give a reason for holding it.');
        const { error } = await db.from('report_cards').update({ held: true, hold_reason: reason, held_at: now, released_at: null, released_by: null }).eq('id', card.id);
        if (error) return examError(error, 'Could not hold it.');
        await audit('HOLD', 'report_cards', card.id, { student_id: card.student_id, reason });
      } else {
        const { error } = await db.from('report_cards').update({ held: false, released_at: now, released_by: admin.id }).eq('id', card.id);
        if (error) return examError(error, 'Could not release it.');
        await audit('RELEASE', 'report_cards', card.id, { student_id: card.student_id });
        const { data: c2 } = await db.from('report_cards').select('snapshot').eq('id', card.id).maybeSingle();
        const snap: any = c2?.snapshot;
        if (snap) {
          await notifyGuardians(db, { schoolId: school, studentId: card.student_id, type: 'report_card', title: `${snap.term.name} report card`, body: `${snap.student.name}'s ${String(snap.term.name).toLowerCase()} report card is now available in Results.`, pref: 'grades' });
        }
      }
      return NextResponse.json({ ok: true });
    }

    // ── Publishing ──
    if (b.action === 'publish' || b.action === 'reopen' || b.action === 'review') {
      const denied = deny(admin, 'exams.publish');
      if (denied) return denied;
      if (!isUuid(b.termId)) return bad('Pick the term.');
      const { data: t } = await db.from('exam_terms').select('id, scheme_id, exam_schemes!inner(session, school_id)').eq('id', b.termId).maybeSingle();
      if (!t || (t as any).exam_schemes.school_id !== school) return bad('Unknown term.', 404);
      const session = (t as any).exam_schemes.session as string;
      const [bundle, roster, info] = await Promise.all([loadSchemes(db, school, session), loadRoster(db, school), schoolInfo(db, school)]);

      if (b.action === 'review') {
        if (!isUuid(b.classId)) return bad('Pick the class.');
        const d = await loadClassTerm(db, school, bundle, roster, b.classId, b.termId);
        if ('error' in d) return bad(d.error, d.status);
        const s = summarizeClassTerm(d);
        if (d.classTerm.status !== 'open') return bad('This term is already reviewed or published for the class.', 409);
        if (!s.ready.canReview) return bad(s.ready.sheetsOpen ? 'Some marks sheets aren\'t submitted yet.' : s.ready.unopened ? 'Some marks sheets were never opened.' : 'Some students are missing marks.', 409);
        const row = { school_id: school, term_id: b.termId, class_id: b.classId, status: 'reviewed', reviewed_by: admin.id, reviewed_at: new Date().toISOString() };
        const { error } = d.classTerm.id ? await db.from('exam_class_terms').update(row).eq('id', d.classTerm.id) : await db.from('exam_class_terms').insert(row);
        return error ? examError(error, 'Could not mark it reviewed.') : NextResponse.json({ ok: true });
      }

      if (b.action === 'reopen') {
        if (!isUuid(b.classId)) return bad('Pick the class.');
        const reason = str(b.reason, 1000);
        if (!reason) return bad('Give the reason. Parents see it with the revised report card.');
        const { data: ct } = await db.from('exam_class_terms').select('*').eq('term_id', b.termId).eq('class_id', b.classId).maybeSingle();
        if (!ct || ct.status !== 'published') return bad('Only a published term can be reopened.', 409);
        const csIds = (Array.isArray(b.classSubjectIds) ? b.classSubjectIds : []).filter(isUuid);
        const now = new Date().toISOString();
        const { error } = await db.from('exam_class_terms').update({ status: 'open', reopen_reason: reason, reopened_by: admin.id, reopened_at: now, reviewed_at: null, reviewed_by: null }).eq('id', ct.id);
        if (error) return examError(error, 'Could not reopen it.');
        let sheets = 0;
        if (csIds.length) {
          const termAs = bundle.assessments.filter(a => a.termId === b.termId).map(a => a.id);
          const { data } = await db.from('exam_sheets').update({ status: 'open', reopened_reason: reason, reopened_by: admin.id, reopened_at: now })
            .eq('class_id', b.classId).in('class_subject_id', csIds).in('assessment_id', termAs).select('id');
          sheets = (data || []).length;
        }
        await audit('REOPEN', 'exam_class_terms', ct.id, { term_id: b.termId, class_id: b.classId, reason, sheets });
        return NextResponse.json({ ok: true, sheets });
      }

      // publish
      const classIds: string[] = (Array.isArray(b.classIds) ? b.classIds : []).filter(isUuid).slice(0, 60);
      if (!classIds.length) return bad('Pick the classes to publish.');
      const done: { classId: string; cls: string; published: number; held: number }[] = [];
      const failed: { classId: string; cls: string; error: string }[] = [];
      for (const classId of classIds) {
        const d = await loadClassTerm(db, school, bundle, roster, classId, b.termId);
        if ('error' in d) { failed.push({ classId, cls: roster.classes.find(c => c.id === classId)?.name ?? '', error: d.error }); continue; }
        const r = await publishClassTerm(db, school, info.name, info.board, d, admin.id, session);
        if ('error' in r) failed.push({ classId, cls: d.cls.name, error: r.error });
        else {
          done.push({ classId, cls: d.cls.name, published: r.published, held: r.held });
          await audit('PUBLISH', 'exam_class_terms', `${b.termId}:${classId}`, { term_id: b.termId, class_id: classId, version: r.version, cards: r.published, held: r.held });
        }
      }
      return NextResponse.json({ ok: failed.length === 0, done, failed });
    }

    // ── The exam cell ──
    const denied = deny(admin, 'exams.manage');
    if (denied) return denied;

    if (b.action === 'settings') {
      const accent = /^#[0-9a-fA-F]{6}$/.test(b.accent) ? b.accent : '#002147';
      const signatures = (Array.isArray(b.signatures) ? b.signatures : []).map((x: unknown) => str(x, 40)).filter(Boolean).slice(0, 4);
      const minAmount = Number(b.holdMinAmount ?? 1);
      if (!(minAmount >= 0 && minAmount <= 1e7)) return bad('The smallest amount overdue to hold a card is 0 to 1,00,00,000.');
      const row: Record<string, unknown> = {
        school_id: school, accent, affiliation: str(b.affiliation, 120) || null, address: str(b.address, 300) || null, signatures,
        hold_on_dues: !!b.holdOnDues, hold_min_amount: minAmount, updated_by: admin.id,
      };
      if (b.logo === null) row.logo = null;
      else if (typeof b.logo === 'string' && b.logo) {
        if (!/^data:image\/(png|jpeg|webp);base64,/.test(b.logo) || b.logo.length > 400000) return bad('The logo must be a PNG, JPEG or WebP under 300 KB.');
        row.logo = b.logo;
      }
      const { error } = await db.from('report_card_settings').upsert(row, { onConflict: 'school_id' });
      if (error) return examError(error, 'Could not save the report card settings.');
      await audit('UPDATE', 'report_card_settings', school, { accent, signatures, hold_on_dues: row.hold_on_dues, hold_min_amount: minAmount, logo: b.logo === undefined ? 'unchanged' : b.logo ? 'replaced' : 'removed' });
      return NextResponse.json({ ok: true });
    }

    if (b.action === 'preset') {
      if (!(b.preset in PRESETS)) return bad('Pick a preset.');
      const session = isSessionOk(b.session) ? b.session : sessionOf();
      const key = b.preset as PresetKey;
      const grades = (Array.isArray(b.grades) ? b.grades : PRESETS[key].grades).map(Number).filter((g: number) => Number.isInteger(g) && g >= 1 && g <= 12);
      if (!grades.length) return bad('Pick the classes it covers.');
      const roster = await loadRoster(db, school);
      const keys = [...new Set(roster.classSubjects.filter(cs => { const c = roster.classes.find(x => x.id === cs.classId); return c?.grade !== null && grades.includes(c!.grade!); }).map(cs => cs.key))];
      const p = presetScheme(key, session, keys, grades);
      const { data: s, error } = await db.from('exam_schemes').insert({
        school_id: school, session, name: p.name, grades: p.grades, preset: key, grading: p.grading, rules: p.rules, created_by: admin.id, updated_by: admin.id,
      }).select('id').single();
      if (error) return examError(error, 'Could not create the scheme.');
      const { data: terms, error: te } = await db.from('exam_terms').insert(p.terms.map(t => ({
        school_id: school, scheme_id: s.id, name: t.name, seq: t.seq, starts_on: t.startsOn, ends_on: t.endsOn, weight: t.weight, components: t.components, subject_weights: t.subjectWeights,
      }))).select('id, seq');
      if (te) { await db.from('exam_schemes').delete().eq('id', s.id); return examError(te, 'Could not create the terms.'); }
      const termBySeq = new Map((terms || []).map(t => [t.seq, t.id]));
      const { error: ae } = await db.from('exam_assessments').insert(p.assessments.map((a, i) => ({
        school_id: school, scheme_id: s.id, term_id: termBySeq.get(a.termSeq), code: a.code, name: a.name, kind: a.kind, max_marks: a.maxMarks, seq: i + 1, subjects: a.subjects,
      })));
      if (ae) { await db.from('exam_schemes').delete().eq('id', s.id); return examError(ae, 'Could not create the assessments.'); }
      return NextResponse.json({ ok: true, id: s.id });
    }

    if (b.action === 'scheme') {
      if (!isUuid(b.id)) return bad('Unknown scheme.');
      const name = str(b.name, 80);
      if (!name) return bad('Name the scheme.');
      const grades = [...new Set<number>((Array.isArray(b.grades) ? b.grades : []).map(Number))].filter(g => Number.isInteger(g) && g >= 1 && g <= 12).sort((x, y) => x - y);
      if (!grades.length) return bad('Pick the classes it covers.');
      const grading = toGrading(b.grading);
      const gp = gradingProblem(grading);
      if (gp) return bad(gp);
      const rules = toRules(b.rules);
      const status = b.status === 'archived' ? 'archived' : 'active';
      const { error } = await db.from('exam_schemes').update({ name, grades, grading, rules, status, updated_by: admin.id }).eq('id', b.id).eq('school_id', school);
      return error ? examError(error, 'Could not save the scheme.') : NextResponse.json({ ok: true });
    }

    if (b.action === 'scheme_delete') {
      if (!isUuid(b.id)) return bad('Unknown scheme.');
      const { data: as } = await db.from('exam_assessments').select('id').eq('scheme_id', b.id).eq('school_id', school);
      if (await marksExist(db, (as || []).map(a => a.id))) return bad('Marks have been entered under this scheme. Archive it instead.', 409);
      const { count } = await db.from('report_cards').select('id', { count: 'exact', head: true }).in('term_id', (await db.from('exam_terms').select('id').eq('scheme_id', b.id)).data?.map(t => t.id) ?? []);
      if (count) return bad('Report cards were published under this scheme. Archive it instead.', 409);
      const { error } = await db.from('exam_schemes').delete().eq('id', b.id).eq('school_id', school);
      return error ? examError(error, 'Could not delete the scheme.') : NextResponse.json({ ok: true });
    }

    if (b.action === 'term') {
      if (!isUuid(b.schemeId)) return bad('Unknown scheme.');
      const { data: sc } = await db.from('exam_schemes').select('id').eq('id', b.schemeId).eq('school_id', school).maybeSingle();
      if (!sc) return bad('Unknown scheme.', 404);
      const name = str(b.name, 60);
      const seq = Number(b.seq), weight = Number(b.weight);
      if (!name) return bad('Name the term.');
      if (!(Number.isInteger(seq) && seq >= 1 && seq <= 12)) return bad('The term\'s order is 1 to 12.');
      if (!(weight >= 0 && weight <= 100)) return bad('A term\'s share of the year is 0 to 100.');
      if (!DAY.test(b.startsOn) || !DAY.test(b.endsOn) || b.endsOn < b.startsOn) return bad('Give the term\'s dates.');
      const comps = components(b.components);
      if (!comps) return bad('Those components aren\'t valid.');
      const sw = weightsMap(b.subjectWeights);
      if (!sw) return bad('Those subject weights aren\'t valid.');
      const { data: as } = await db.from('exam_assessments').select('code').eq('scheme_id', b.schemeId);
      const problem = termProblem({ name, weight, components: comps }, new Set((as || []).map(a => a.code)));
      // A new term has no assessments yet: allow it to start empty.
      if (problem && (isUuid(b.id) || comps.length)) return bad(problem);
      if (isUuid(b.id)) {
        const { data: pub } = await db.from('exam_class_terms').select('id').eq('term_id', b.id).neq('version', 0).limit(1);
        if (pub?.length) {
          const { data: cur } = await db.from('exam_terms').select('components, subject_weights, weight').eq('id', b.id).maybeSingle();
          if (canon(cur?.components) !== canon(comps) || canon(cur?.subject_weights) !== canon(sw) || Number(cur?.weight) !== weight) {
            return bad('Report cards were published for this term, so its make-up is fixed. You can still rename it or change its dates.', 409);
          }
        }
      }
      const row = { school_id: school, scheme_id: b.schemeId, name, seq, starts_on: b.startsOn, ends_on: b.endsOn, weight, components: comps, subject_weights: sw };
      const { error } = isUuid(b.id) ? await db.from('exam_terms').update(row).eq('id', b.id).eq('school_id', school) : await db.from('exam_terms').insert(row);
      return error ? examError(error, 'Could not save the term.') : NextResponse.json({ ok: true });
    }

    if (b.action === 'term_delete') {
      if (!isUuid(b.id)) return bad('Unknown term.');
      const { data: as } = await db.from('exam_assessments').select('id').eq('term_id', b.id).eq('school_id', school);
      if (await marksExist(db, (as || []).map(a => a.id))) return bad('Marks have been entered in this term, so it can\'t be removed.', 409);
      const { count } = await db.from('report_cards').select('id', { count: 'exact', head: true }).eq('term_id', b.id);
      if (count) return bad('Report cards were published for this term.', 409);
      const { error } = await db.from('exam_terms').delete().eq('id', b.id).eq('school_id', school);
      return error ? examError(error, 'Could not remove the term.') : NextResponse.json({ ok: true });
    }

    if (b.action === 'assessment') {
      if (!isUuid(b.schemeId) || !isUuid(b.termId)) return bad('Pick the term.');
      const { data: t } = await db.from('exam_terms').select('id').eq('id', b.termId).eq('scheme_id', b.schemeId).eq('school_id', school).maybeSingle();
      if (!t) return bad('Unknown term.', 404);
      const code = str(b.code, 12).toUpperCase();
      const name = str(b.name, 80);
      const max = Number(b.maxMarks);
      if (!CODE_RE.test(code)) return bad('A code is a capital letter then up to 11 capitals or digits, like PT1 or HY.');
      if (!name) return bad('Name the assessment.');
      if (!(max > 0 && max <= 1000)) return bad('Maximum marks are 1 to 1000.');
      const kind = ['written', 'internal', 'practical', 'project', 'oral'].includes(b.kind) ? b.kind : 'written';
      const subjects = overrides(b.subjects);
      if (!subjects) return bad('Those per-subject settings aren\'t valid.');
      const heldFrom = DAY.test(b.heldFrom) ? b.heldFrom : null, heldTo = DAY.test(b.heldTo) ? b.heldTo : heldFrom;
      if (heldFrom && heldTo && heldTo < heldFrom) return bad('The exam ends before it starts.');
      if (isUuid(b.id)) {
        const { data: cur } = await db.from('exam_assessments').select('code, max_marks, subjects, term_id').eq('id', b.id).eq('school_id', school).maybeSingle();
        if (!cur) return bad('Unknown assessment.', 404);
        const reshaped = cur.code !== code || Number(cur.max_marks) !== max || canon(cur.subjects) !== canon(subjects) || cur.term_id !== b.termId;
        if (reshaped && await marksExist(db, [b.id])) return bad('Marks have been entered for this assessment, so its code, term, maximum and subjects are fixed. You can rename it or change its dates.', 409);
        const { error } = await db.from('exam_assessments').update({ term_id: b.termId, code, name, kind, max_marks: max, subjects, held_from: heldFrom, held_to: heldTo }).eq('id', b.id);
        if (error) return examError(error, 'Could not save the assessment.');
        // Sheets opened before a reshape follow it (there are no marks on them).
        if (reshaped) await db.from('exam_sheets').delete().eq('assessment_id', b.id).eq('status', 'open');
        return NextResponse.json({ ok: true, reshaped });
      }
      const { data: last } = await db.from('exam_assessments').select('seq').eq('scheme_id', b.schemeId).order('seq', { ascending: false }).limit(1);
      const { error } = await db.from('exam_assessments').insert({ school_id: school, scheme_id: b.schemeId, term_id: b.termId, code, name, kind, max_marks: max, seq: (last?.[0]?.seq ?? 0) + 1, subjects, held_from: heldFrom, held_to: heldTo });
      return error ? examError(error, 'Could not add the assessment.') : NextResponse.json({ ok: true });
    }

    if (b.action === 'assessment_delete') {
      if (!isUuid(b.id)) return bad('Unknown assessment.');
      const { data: a } = await db.from('exam_assessments').select('id, code, scheme_id').eq('id', b.id).eq('school_id', school).maybeSingle();
      if (!a) return bad('Unknown assessment.', 404);
      if (await marksExist(db, [a.id])) return bad('Marks have been entered for this assessment, so it can\'t be removed.', 409);
      const { data: terms } = await db.from('exam_terms').select('name, components').eq('scheme_id', a.scheme_id);
      const usedIn = (terms || []).filter(t => (t.components || []).some((c: any) => (c.codes || []).includes(a.code))).map(t => t.name);
      if (usedIn.length) return bad(`${a.code} is used in ${usedIn.join(' and ')}. Take it out of the term's components first.`, 409);
      const { error } = await db.from('exam_assessments').delete().eq('id', a.id);
      return error ? examError(error, 'Could not remove it.') : NextResponse.json({ ok: true });
    }

    if (b.action === 'open') {
      const ids = (Array.isArray(b.assessmentIds) ? b.assessmentIds : []).filter(isUuid).slice(0, 40);
      if (!ids.length) return bad('Pick what to open for marks entry.');
      const { data: as } = await db.from('exam_assessments').select('*, exam_schemes!inner(*)').in('id', ids).eq('school_id', school);
      if (!as?.length) return bad('Unknown assessment.', 404);
      const roster = await loadRoster(db, school);
      let created = 0;
      for (const a of as) {
        const r = await openSheets(db, school, toScheme((a as any).exam_schemes), toAssessment(a), roster);
        if (r.error) return examError({ message: r.error }, 'Could not open the marks sheets.');
        created += r.created;
      }
      return NextResponse.json({ ok: true, created });
    }

    if (b.action === 'return_sheet') {
      if (!isUuid(b.sheetId)) return bad('Unknown sheet.');
      const note = str(b.note, 1000);
      if (!note) return bad('Say what needs changing.');
      const { data: sh } = await db.from('exam_sheets').select('id, status, class_id, assessment_id').eq('id', b.sheetId).eq('school_id', school).maybeSingle();
      if (!sh) return bad('Unknown sheet.', 404);
      if (sh.status !== 'submitted') return bad(sh.status === 'locked' ? 'That sheet is published. Reopen the term to change it.' : 'That sheet is already open.', 409);
      const { error } = await db.from('exam_sheets').update({ status: 'open', returned_note: note, returned_by: admin.id, returned_at: new Date().toISOString() }).eq('id', sh.id);
      if (error) return examError(error, 'Could not return it.');
      await reviewBackToOpen(db, sh.class_id, sh.assessment_id);
      return NextResponse.json({ ok: true });
    }

    return bad('Unknown action.');
  } catch (e: any) {
    return examError(e, 'Something went wrong. Try again.');
  }
}
