/** The board pack as a spreadsheet (the designed document is components/admin/BoardPack). */
import { BANDS, subjectName, type AdminDesk } from './desk';
import { STAGE_LABEL } from './admissions';
import { fmtDate } from './format';

export function boardPackRows(desk: AdminDesk): (string | number | null)[][] {
  const { academics: ac, fees, workforce: wf, wellness: wl, admissions: adm } = desk;
  return [
    [`${desk.school.name} · board pack`, `Session ${desk.session}`, `Generated ${fmtDate(new Date().toISOString())}`],
    [],
    ['HEADLINES'],
    ['Students on roll', desk.students.length],
    ['Teaching staff', wf.teachers.length],
    ['Student-teacher ratio', wf.ratio ? `1:${wf.ratio}` : ''],
    ['School-wide TML (%)', ac.schoolTml],
    ['School-wide TML a fortnight ago (%)', ac.schoolTmlBefore],
    ['Students with graded evidence', ac.evidenced],
    ['Students below 40% TML', ac.atRisk.length],
    [],
    ['TML BY GRADE', 'Students', 'With evidence', 'TML (%)', 'Below 40%'],
    ...ac.grades.map(g => [`Grade ${g.grade}`, g.students, g.evidenced, g.tml, g.atRisk]),
    [],
    ['GRADE x SUBJECT TML', ...ac.subjects.map(subjectName)],
    ...ac.grades.map(g => [`Grade ${g.grade}`, ...ac.subjects.map(s => ac.matrix.find(c => c.grade === g.grade && c.subject === s)?.tml ?? null)]),
    [],
    ['MASTERY BANDS', 'Students'],
    ...BANDS.map(b => [`${b.label} (${b.range})`, ac.bands.find(x => x.key === b.key)?.count ?? 0]),
    ['No graded evidence yet', ac.noEvidence],
    [],
    ['FEES', 'Rupees'],
    ['Billed so far (net of concessions)', fees.totals.billed],
    ['Collected', fees.totals.collected],
    ['Outstanding', fees.totals.outstanding],
    ['Overdue', fees.totals.overdue],
    ['Collection rate (%)', fees.totals.collectionRate],
    ['Full-year billing expected', fees.totals.expectedAnnual],
    [],
    [`ADMISSIONS ${adm.session}`, 'Reached stage', 'Share of enquiries (%)'],
    ...adm.funnel.map(f => [STAGE_LABEL[f.stage], f.reached, f.share]),
    [],
    ['WORKFORCE', 'Classes', 'Students', 'Class TML (%)', 'Change in 14 days', 'Grading backlog', 'Activity (30 days)'],
    ...wf.teachers.map(t => [t.name, t.classes.join(' / '), t.students, t.tml, t.delta, t.backlog, t.activity]),
    [],
    ['WELLNESS (anonymised)', ''],
    ['Students who checked in this session', wl.students],
    ['Average energy (%)', wl.energy],
    [],
    ['DPDP CONSENT', 'Granted', 'Coverage (%)'],
    ...desk.compliance.consents.map(c => [c.label, c.granted, c.coverage]),
  ];
}
