import type { ReqDef, ScriptDef } from './types';
import { A } from './auto';

export const reqs: ReqDef[] = [
  { n: '01', process: 'P12', priority: 'High', text: 'Academic health: school-wide TML, grade × subject, distribution, sections and students at risk; how sure the numbers are (firm vs provisional); only students with confirmed work are averaged.', perm: 'academics.read', auto: [`${A.admin}admin desk assembles school-wide academics from real rows`, `${A.admin}TML as of a date uses only snapshots that existed then`] },
  { n: '02', process: 'P13', priority: 'High', text: 'CBSE wellness report: participation, school energy, consent, by grade and a 12-week trend, anonymised (cells under 5 students suppressed); manual sections (interventions, referrals, training hours, signatory) saved as a draft; filing needs every manual section and is final.', perm: 'wellness.read / wellness.file', api: 'PUT/POST /api/admin/filings', tables: 'wellness_filings', auto: [`${A.admin}wellness report rescales energy and keeps suppressed cells null`] },
  { n: '03', process: 'P13', priority: 'Critical', text: 'DPDP & compliance: consent coverage by purpose (wellness check-ins, AI tutor, learning data, proctoring), verified guardian links, data residency, the data register (data, lawful basis, retention), who can see what, and the audit trail (downloadable); open flags for consent and guardian gaps.', perm: 'compliance.read / audit.read', auto: [`${A.admin}compliance flags consent and guardian gaps`, `${A.admin}audit summaries: deletions and the staff attendance tables read as words`] },
  { n: '04', process: 'P13', priority: 'High', text: 'TML (True Mastery Level): homework 40%, quizzes 40%, tutor depth 20% (14-day half-life, renormalised over what exists); confidence = evidence/5 (firm at 5); a proctoring violation cuts confidence 15%; the final blend weights academics 70% and engagement 30%.', tables: 'tml_snapshots', auto: ['~app:src/lib/tml/engine.test.ts::'] },
];

export const scripts: ScriptDef[] = [
  { n: '01', title: 'Academic health reads true', role: 'Academic coordinator', perm: 'academics.read', priority: 'High', type: 'Positive', req: ['01', '04'], uat: true,
    pre: 'A class with confirmed grades for some students only.',
    steps: [
      ['Academic Health.', 'Grade × subject TML; students with no confirmed work are not averaged in.'],
      ['How sure are these numbers?', 'Firm vs provisional counts; "Most scores are still provisional…" when evidence is thin.'],
      ['Compare one student’s TML with their Mastery page.', 'The same number (same engine).'],
      ['Export; Print board report.', 'Downloads and prints.'],
    ] },
  { n: '02', title: 'File the CBSE wellness report', role: 'Principal', perm: 'wellness.file', priority: 'High', type: 'Positive', req: ['02'], uat: true,
    pre: 'Check-ins from several grades; a grade with fewer than 5 students checking in.',
    steps: [
      ['CBSE Wellness Report.', 'SECTIONS COMPLETE, participation, energy, consent; the small grade shows no figure (suppressed).'],
      ['File the report with the manual sections empty.', '"Fill in every manual section, including the signatory, before filing."'],
      ['Enter "2.5" training hours.', '"Enter whole numbers for the counts and hours."'],
      ['Complete them; Save (draft), then File report › confirm.', '"Draft saved", then "Report filed"; filing again: "Already filed."'],
    ] },
  { n: '03', title: 'Consent coverage and the audit trail', role: 'Data protection officer', perm: 'compliance.read', priority: 'Critical', type: 'Positive', req: ['03'], uat: true,
    pre: 'Some families without wellness consent.',
    steps: [
      ['DPDP & Compliance.', 'LOWEST CONSENT COVERAGE, VERIFIED PARENT LINKED, DATA RESIDENCY, OPEN FLAGS; consent by purpose.'],
      ['Data protection register.', 'Each data set with its lawful basis and retention.'],
      ['Audit trail: filter by record type; Download audit trail.', 'Grades, roles, consent and fee changes listed in words; the file downloads.'],
      ['Probe › ask parents for missing wellness consent.', 'Sent only to families missing it; coverage rises as parents consent.'],
    ] },
];
