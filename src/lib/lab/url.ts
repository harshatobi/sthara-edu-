import { validateScene, type LabScene } from './registry';

/**
 * A scene travels in the URL (builder → presenter, Copilot → builder) as
 * base64url JSON. It is re-validated on the way in, so a hand-edited link can
 * only ever produce a setup the engine accepts.
 */
export function encodeScene(scene: LabScene): string {
  const bytes = new TextEncoder().encode(JSON.stringify(scene));
  let bin = '';
  bytes.forEach(b => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeScene(s: string | null | undefined): LabScene | null {
  if (!s || s.length > 8000) return null;
  try {
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
    const json = new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)));
    return validateScene(JSON.parse(json));
  } catch {
    return null;
  }
}

/** The presenter link. A known class (and saved demo) is passed along so the class's answers are saved for it. */
export function presentHref(scene: LabScene, ctx?: { class?: string | null; subject?: string | null; demo?: string | null }): string {
  const q = new URLSearchParams({ scene: encodeScene(scene) });
  if (ctx?.class && ctx.subject) { q.set('class', ctx.class); q.set('subject', ctx.subject); }
  if (ctx?.demo) q.set('demo', ctx.demo);
  return `/teacher/lab/present?${q}`;
}
