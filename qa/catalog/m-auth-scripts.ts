import type { ScriptDef } from './types';
import { A } from './auto';

export const scripts: ScriptDef[] = [
  { n: '01', title: 'Sign in with a valid school code, role and password', role: 'Any school user', priority: 'Critical', type: 'Positive', req: ['01', '04'], uat: true,
    pre: 'The test school’s code; an active login for each role.', data: 'Test school code; one login per role', auto: [`~${A.setup}sign in:`],
    steps: [
      ['Open www.sthara.in/login.', '"Welcome" and "Enter your school code to continue."; the code box has the cursor.'],
      ['Type the school code; press Continue.', '"Select your role", the school’s name, and four cards: Student (Honest Desk), Teacher (Teaching Copilot), Admin (Command Centre), Parent (Growth Feed).'],
      ['Pick your role.', '"Sign in as <Role>" with "<School> · <desk>"; the password is masked.'],
      ['Enter ID and password; press Sign in.', '"Signing in…", then your portal opens with your name.'],
      ['Refresh the page.', 'Still signed in on the same page.'],
    ] },
  { n: '02', title: 'The code step refuses blank, unknown and mistyped codes', role: 'Anonymous', priority: 'High', type: 'Negative', req: ['01', '02'],
    pre: 'None.', data: 'blank; spaces; ZZQA-NO-SUCH-SCHOOL; the real code in lower case',
    auto: [`${A.login}an empty school code is refused with a message`, `${A.login}an unknown school code is refused and the form stays on the code step`, `${A.login}the code is case-insensitive and trimmed`],
    steps: [
      ['Press Continue with the box empty.', '"Enter your school code."; the form stays put.'],
      ['Type ZZQA-NO-SUCH-SCHOOL; press Continue.', '"School code not found. Check it with your school office."; no role cards.'],
      ['Type the real code in lower case with spaces around it.', 'Accepted; the right school shows.'],
      ['Look up 31 codes within 10 minutes from one connection.', 'After 30: "Too many attempts. Wait a few minutes and try again."'],
    ] },
  { n: '03', title: 'Blank fields, a wrong password, a login used at another school', role: 'Teacher', priority: 'High', type: 'Negative', req: ['03', '09'],
    pre: 'A teacher login; a second school’s code.', data: 'Wrong password; second school’s code',
    auto: [`${A.session}a wrong password is refused with a message and nothing is stored`, `${A.session}an account used with another school’s code is refused`, `${A.login}signing in with no ID or password is refused before anything is sent`],
    steps: [
      ['Press Sign in with both boxes empty.', '"Enter your ID and password."; nothing is sent.'],
      ['Enter the right ID and a wrong password.', 'An error shows; you stay on sign-in.'],
      ['Use the second school’s code with the test school’s teacher login.', '"This account isn’t registered at <school>. Check the school code."; signed out.'],
    ] },
  { n: '04', title: 'The role card does not grant a role', role: 'Student', priority: 'Critical', type: 'Security', req: ['04'], pre: 'A student login.',
    steps: [
      ['Pick Admin at the role step; sign in with the student’s ID and password.', 'The Student portal opens: the role comes from the account.'],
      ['Type /admin in the address bar.', 'Returned to /student.'],
    ] },
  { n: '05', title: 'Portals are closed to signed-out visitors and to other roles', role: 'Anonymous, Teacher, Parent', priority: 'Critical', type: 'Security', req: ['05', '06'],
    pre: 'Signed out; teacher and parent logins.', auto: [`${A.routing}every portal page (not only the home page) is behind sign-in`, `~${A.access}`],
    steps: [
      ['Signed out, open /teacher/homework.', 'Sign-in opens, ending ?redirect=%2Fteacher%2Fhomework.'],
      ['As the teacher, open /admin/fees.', 'Returned to /teacher.'],
      ['As the parent, open /student, then /ops.', '/parent; then "Page not found." (the console is never revealed).'],
    ] },
  { n: '06', title: 'Ended pilot and suspended school', role: 'Sthara operator, Teacher', priority: 'High', type: 'Positive', req: ['07'], uat: true,
    pre: 'Operator access; test school on a pilot.', data: 'Pilot end yesterday; then Suspended',
    steps: [
      ['Operator: Schools › test school › Tier and contract: pilot ends yesterday, with a reason.', 'Saved; the change journal shows it with the reason.'],
      ['Teacher: sign in or refresh.', '"Your pilot has ended" with the annual plans.'],
      ['Teacher: open a page that loads data.', 'Every data request is refused (403, trial_expired).'],
      ['Operator: extend the pilot, then suspend the school.', 'Teacher sees "Account paused … Your data is safe".'],
      ['Operator: reactivate, with a reason.', 'The portal works again; nothing was lost.'],
    ] },
  { n: '07', title: 'Sign-out', role: 'Each role', priority: 'High', type: 'Positive', req: ['08'], uat: true, pre: 'Signed in.', auto: [`~${A.session}`],
    steps: [
      ['Press Sign out (phone: More › Sign out).', 'Sign-in opens.'],
      ['Press Back, or open your portal address.', 'Sign-in again; nothing from the session shows.'],
    ] },
  { n: '08', title: 'A sign-in notice from Sthara', role: 'Sthara operator', priority: 'Medium', type: 'Positive', req: ['12'], pre: 'Operator access.', data: '"Scheduled maintenance Sunday 6–8 am", Warning',
    steps: [
      ['Platform settings › Sign-in notice: text, style Warning, a reason; save.', 'In History with the reason; live within 30 seconds.'],
      ['Open sign-in in a private window.', 'The notice shows in the warning style; it can be dismissed.'],
      ['Clear the notice, with a reason.', 'No notice on sign-in.'],
    ] },
  { n: '09', title: 'The forgotten-password path', role: 'Teacher, Sthara operator', priority: 'Medium', type: 'Regression', req: ['10'],
    pre: 'A teacher who has forgotten their password.', auto: [`${A.login}DEF-002 (fixed): "Forgot password?" says how to get a new password`],
    steps: [
      ['On the credentials step, press "Forgot password?".', 'A note: ask your school office, who ask Sthara for a new temporary password (DEF-002, fixed on login-cleanup).'],
      ['Operator: People › find the teacher › New password.', 'A temporary password shows once ("shown once and not stored").'],
      ['Teacher: sign in with it.', 'Signed in.'],
    ] },
];
