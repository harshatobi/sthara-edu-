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
