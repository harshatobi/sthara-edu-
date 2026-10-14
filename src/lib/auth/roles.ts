// 'operator' is a Sthara staff account that is not a superadmin: it works only in /ops, through /api/ops.
export const ROLES = ['student', 'teacher', 'admin', 'parent', 'superadmin', 'operator'] as const;
/** Sthara's own accounts: they belong to no school and land in the Platform Manager. */
export const isPlatformRole = (role: unknown) => role === 'superadmin' || role === 'operator';
export type Role = typeof ROLES[number];
export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && ROLES.includes(value as Role);
}
export function canAccessRole(actual: unknown, expected: string): boolean {
  return isRole(actual) && actual === expected.toLowerCase().replace(/\s+/g, '');
}

/** Bound auth work so a stalled network/SDK never leaves the UI spinning forever. */
export async function withTimeout<T>(work: PromiseLike<T>, ms = 12000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(work),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Connection timed out. Please try again.')), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
