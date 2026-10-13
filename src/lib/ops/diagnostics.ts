/**
 * How a school's diagnostics read: what each data-integrity check means and where it is fixed,
 * and why one account can or cannot sign in. Pure, so it is unit-tested.
 */

export interface CheckInfo { title: string; means: string; fix: 'support' | 'people' | 'classes' | 'teaching' }

export const CHECKS: Record<string, CheckInfo> = {
  students_no_class: { title: 'Students with no class', means: 'They see no homework, timetable or attendance.', fix: 'support' },
  students_unknown_class: { title: 'Students in a class that does not exist', means: 'Their class name matches none of the school’s classes, so class-wide work never reaches them.', fix: 'support' },
  teachers_teach_nothing: { title: 'Teachers with no class or subject', means: 'They can sign in but have nothing to teach, mark or plan.', fix: 'teaching' },
  parents_no_child: { title: 'Parents linked to no child', means: 'They sign in to an empty portal.', fix: 'support' },
  students_no_verified_parent: { title: 'Students with no verified parent', means: 'No parent can see their progress, fees or messages.', fix: 'support' },
  duplicate_roll_numbers: { title: 'Students sharing a roll number', means: 'Imports, fee receipts and family links that use the roll number can land on the wrong student.', fix: 'support' },
  family_links_across_schools: { title: 'Family links to a parent in another school', means: 'A parent account outside this school is linked to one of its students.', fix: 'support' },
  classes_no_students: { title: 'Classes with no students', means: 'Set up but empty: either not rolled out yet or left over from last year.', fix: 'classes' },
  accounts_no_login: { title: 'Profiles with no login behind them', means: 'The person is listed but cannot sign in at all: their login was removed or never created.', fix: 'people' },
};

export const checkInfo = (key: string): CheckInfo => CHECKS[key] ?? { title: key.replace(/_/g, ' '), means: '', fix: 'support' };

export interface LoginFacts {
  role: string; hasLogin: boolean; confirmed: boolean; bannedUntil: string | null; lastSignIn: string | null;
  left: boolean; tempPassword: boolean; emailMatches: boolean; hasPassword: boolean; twoFactor: boolean;
}
export interface SchoolState { active: boolean; trialExpired: boolean }

/** What stops this account signing in (most decisive first), and things worth knowing that do not stop it. */
export function loginVerdict(a: LoginFacts, school: SchoolState): { canSignIn: boolean; blockers: string[]; notes: string[] } {
  const blockers: string[] = [], notes: string[] = [];
  if (!a.hasLogin) blockers.push('There is no login behind this profile. Recreate the account from the People tab.');
  if (a.left) blockers.push('Marked as having left the school, which blocks sign-in. Undo it from the Support tab.');
  else if (a.bannedUntil) blockers.push(school.active ? 'The login is blocked, although the school is active. Re-sync access from Subscription & access.' : 'The login is blocked because the school is suspended.');
  if (!school.active && !a.bannedUntil && a.hasLogin) blockers.push('The school is suspended: the portal turns them away after sign-in.');
  if (school.active && school.trialExpired) blockers.push('The school’s pilot has ended: the portal turns everyone away after sign-in.');
  if (a.hasLogin && !a.hasPassword) blockers.push('The login has no password set. Reset it from the People tab.');
  if (a.hasLogin && !a.confirmed) blockers.push('The login’s email was never confirmed, so the password is refused.');
  if (a.hasLogin && !a.emailMatches) notes.push('The login’s email differs from the profile’s: they must sign in with the login’s address.');
  if (a.tempPassword) notes.push('Still on a temporary password that has not been changed.');
  if (a.hasLogin && !a.lastSignIn) notes.push('Has never signed in.');
  if (a.twoFactor) notes.push('Two-factor sign-in is on: a lost phone locks them out until it is reset.');
  if (!blockers.length && !notes.length) notes.push('Nothing on Sthara’s side stops this account. If sign-in still fails it is the password, or the wrong school code or role tile on the sign-in page.');
  return { canSignIn: !blockers.length, blockers, notes };
}
