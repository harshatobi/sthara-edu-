/** The whole catalog: modules (requirements + TE.040 scripts), TE.050 scenarios, defects, document control. */
import { mod, type ModuleDef, type Scenario } from './types';
import * as authR from './m-auth-reqs';
import * as authS from './m-auth-scripts';
import * as opsR from './m-ops-reqs';
import * as opsS from './m-ops-scripts';
import * as off from './m-off';
import * as sup from './m-sup';
import * as accR from './m-acc-reqs';
import * as accS from './m-acc-scripts';
import * as stf from './m-stf';
import * as msg from './m-msg';
import * as feeR from './m-fee-reqs';
import * as feeS from './m-fee-scripts';
import * as adm from './m-adm';
import * as sch from './m-sch';
import * as ttR from './m-tt-reqs';
import * as ttS from './m-tt-scripts';
import * as covR from './m-cov-reqs';
import * as covS from './m-cov-scripts';
import * as attR from './m-att-reqs';
import * as attS from './m-att-scripts';
import * as load from './m-load';
import * as feed from './m-feed';
import * as aca from './m-aca';
import * as tch from './m-tch';
import * as hw from './m-hw';
import * as grd from './m-grd';
import * as syl from './m-syl';
import * as cop from './m-cop';
import * as stu from './m-stu';
import * as par from './m-par';
import * as wa from './m-wa';
import * as nfr from './m-nfr';
import { extra as extraA } from './m-extra-a';
import { extra as extraB } from './m-extra-b';
import { scenarios as sitA } from './sit-a';
import { scenarios as sitB } from './sit-b';
import { scenarios as sitC } from './sit-c';
export { defects } from './defects';
export { PROCESSES } from './types';

const pair = (r: { reqs: ModuleDef['reqs'] }, s: { scripts: ModuleDef['scripts'] }) => ({ reqs: r.reqs, scripts: s.scripts });

const BASE: ModuleDef[] = [
  mod('AUTH', 'Sign-in, sessions and portal access', 'Sign-in', 'www.sthara.in/login', pair(authR, authS)),
  mod('OPS', 'Platform Manager (Sthara operators)', 'Platform Manager', 'Platform Manager (/ops)', pair(opsR, opsS)),
  mod('SUP', 'School Manager support (operators)', 'Platform Manager', 'Platform Manager › Schools › a school › Support', pair(sup, sup)),
  mod('OFF', 'Command Centre, Probe, Ask the School OS', 'Admin', 'Admin › Dashboard / Probe / Ask the School OS', pair(off, off)),
  mod('ACC', 'Roles & Access, User Directory', 'Admin', 'Admin › Roles & Access / User Directory', pair(accR, accS)),
  mod('STF', 'Staff & Leave', 'Admin', 'Admin › Staff & Leave; Teacher › Apply Leave', pair(stf, stf)),
  mod('MSG', 'Parent messages', 'Cross-cutting', 'Parent › School Messages; Admin/Teacher › Parent Messages', pair(msg, msg)),
  mod('FEE', 'Fees: billing to collection', 'Admin', 'Admin › Admissions & Fees', pair(feeR, feeS)),
  mod('ADM', 'Admissions to enrolment', 'Admin', 'Admin › Admissions & Fees › Admissions', pair(adm, adm)),
  mod('SCH', 'Bells, wings, rooms and calendar', 'Admin', 'Admin › Schedule › Bells & rooms / Calendar', pair(sch, sch)),
  mod('TT', 'Timetable and auto-build', 'Admin', 'Admin › Schedule › Timetable / Auto-build', pair(ttR, ttS)),
  mod('COV', 'Cover, duties and comp-off', 'Admin', 'Admin › Schedule › Cover / Duties', pair(covR, covS)),
  mod('ATT', 'Staff register, attendance and shifts', 'Admin', 'Admin › Schedule › Staff register / Attendance / Shifts', pair(attR, attS)),
  mod('LOAD', 'Load and My Schedule', 'Cross-cutting', 'Admin › Schedule › Load; My Schedule', pair(load, load)),
  mod('FEED', 'Situational feed and incidents', 'Cross-cutting', 'Admin/Teacher › Situational Feed', pair(feed, feed)),
  mod('ACA', 'Academic health, CBSE wellness, DPDP', 'Admin', 'Admin › Academic Health / CBSE Wellness Report / DPDP & Compliance', pair(aca, aca)),
  mod('TCH', 'Teacher dashboard and class register', 'Teacher', 'Teacher › Dashboard / Attendance', pair(tch, tch)),
  mod('HW', 'Homework and quizzes', 'Teacher', 'Teacher › Homework / Quiz Creator', pair(hw, hw)),
  mod('GRD', 'Grading and capture', 'Teacher', 'Teacher › Homework › an assignment', pair(grd, grd)),
  mod('SYL', 'Syllabus, pacing and lessons', 'Teacher', 'Teacher › Syllabus', pair(syl, syl)),
  mod('COP', 'Copilot, heat map, mastery, wellness', 'Teacher', 'Teacher › AI Assistant / Class Heat Map / Mastery Tracker / Student Wellness', pair(cop, cop)),
  mod('STU', 'Student desk and AI tutor', 'Student', 'Student portal', pair(stu, stu)),
  mod('PAR', 'Parent portal', 'Parent', 'Parent portal', pair(par, par)),
  mod('WA', 'WhatsApp channel', 'WhatsApp', 'WhatsApp; WhatsApp & Privacy; Ask the School OS', pair(wa, wa)),
  mod('NFR', 'Security, performance and usability', 'Cross-cutting', 'Whole platform', pair(nfr, nfr)),
];

/** Every module with the gap-closing scripts (m-extra-*) appended. */
export const MODULES: ModuleDef[] = BASE.map(m => ({ ...m, scripts: [...m.scripts, ...(extraA[m.code] ?? []), ...(extraB[m.code] ?? []), ...(m.code === 'FEE' ? sup.feeExtra : [])] }));

export const SCENARIOS: Scenario[] = [...sitA, ...sitB, ...sitC];

export const reqId = (m: string, n: string) => `REQ-${m}-${n}`;
export const scriptId = (m: string, n: string) => `TE040-${m}-${n}`;
/** A script's requirement reference ("01" within its module, or a full "REQ-X-nn"). */
export const resolveReq = (m: string, r: string) => (r.startsWith('REQ-') ? r : reqId(m, r));

export const DOC = {
  client: 'Sthara School OS',
  project: 'Sthara School OS — whole-platform test cycle',
  release: 'main @ 03879fd (= 99e7dfe: scheduling phase 4, ops error log, review fixes) + ops-school-manager @ e00f683 (School Manager support tab)',
  version: '1.0',
  author: 'Sthara QA (generated from the sthara-qa catalog)',
  owner: 'COO, Sthara (coo@sthara.in)',
};
