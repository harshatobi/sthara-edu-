/** What an operator's own new password must satisfy. Pure, so it is unit-tested. */
export const PASSWORD_MIN = 12;

/** Why this password cannot be used, or null when it can. */
export function passwordProblem(next: string, current: string, email: string): string | null {
  if (next.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters.`;
  if (next.length > 128) return 'Use at most 128 characters.';
  if (!/\p{L}/u.test(next) || !/\d/.test(next)) return 'Use letters and at least one digit.';
  if (next === current) return 'The new password must differ from the current one.';
  const local = email.split('@')[0].toLowerCase();
  if (local.length >= 3 && next.toLowerCase().includes(local)) return 'Do not use your email name in the password.';
  if (/sthara/i.test(next)) return 'Do not use the company name in the password.';
  return null;
}
