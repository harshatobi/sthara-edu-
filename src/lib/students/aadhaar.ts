/** Aadhaar numbers: the check digit, cleaning and masking. Pure (the encryption is in ./pii, server only). */

// Verhoeff tables: the last digit of an Aadhaar number is its Verhoeff check digit.
const D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 2, 3, 4, 0, 6, 7, 8, 9, 5], [2, 3, 4, 0, 1, 7, 8, 9, 5, 6], [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8], [5, 9, 8, 7, 6, 0, 4, 3, 2, 1], [6, 5, 9, 8, 7, 1, 0, 4, 3, 2], [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4], [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];
const P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 5, 7, 6, 2, 8, 3, 0, 9, 4], [5, 8, 0, 3, 7, 9, 6, 1, 4, 2], [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0], [4, 2, 8, 6, 5, 7, 3, 9, 0, 1], [2, 7, 9, 3, 8, 0, 6, 4, 1, 5], [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];

/** True when the digits pass the Verhoeff check. */
export function verhoeff(digits: string): boolean {
  let c = 0;
  const rev = digits.split('').reverse().map(Number);
  for (let i = 0; i < rev.length; i++) c = D[c][P[i % 8][rev[i]]];
  return c === 0;
}

/** UDISE+ writes this for a student without Aadhaar. */
export const NO_AADHAAR = '999999999999';

/** A typed Aadhaar number, cleaned: 12 digits, not starting 0 or 1, passing the check digit. */
export function parseAadhaar(raw: string): { ok: true; digits: string } | { ok: false; error: string } {
  const digits = raw.replace(/[\s-]/g, '');
  if (!/^\d{12}$/.test(digits)) return { ok: false, error: 'An Aadhaar number has 12 digits.' };
  if (digits === NO_AADHAAR) return { ok: false, error: 'For a student without Aadhaar, tick "No Aadhaar" instead.' };
  if (/^[01]/.test(digits)) return { ok: false, error: 'An Aadhaar number never starts with 0 or 1.' };
  if (!verhoeff(digits)) return { ok: false, error: 'That isn’t a valid Aadhaar number (the check digit doesn’t match). Check it against the card.' };
  return { ok: true, digits };
}

export const maskAadhaar = (last4: string | null | undefined) => (last4 ? `XXXX XXXX ${last4}` : null);
export const formatAadhaar = (digits: string) => digits.replace(/(\d{4})(?=\d)/g, '$1 ');
