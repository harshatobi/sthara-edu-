/**
 * Ambient (looping) animation per Phosphor icon, keyed the same way as
 * ICON_COLORS in iconColors.ts. Applied only while an icon is in its
 * persistent `active` state (e.g. the selected nav tab) — a fire icon keeps
 * flickering the whole time you're on the Heat Map tab, a heart keeps
 * beating on Wellness, etc. Icons with no thematic match fall back to a
 * gentle universal "breathe" pulse rather than sitting static.
 */
export type IconAnimation = 'flicker' | 'heartbeat' | 'wiggle' | 'bob' | 'twinkle' | 'glow' | 'breathe';

export const ICON_ANIMATIONS: Record<string, IconAnimation> = {
  Fire: 'flicker',
  Lightning: 'flicker',
  Sparkle: 'twinkle',
  Heart: 'heartbeat',
  Bell: 'wiggle',
  Warning: 'wiggle',
  ChartLineUp: 'bob',
  Rocket: 'bob',
  Trophy: 'twinkle',
  Brain: 'glow',
  ShieldCheck: 'glow',
  CheckCircle: 'twinkle',
  Check: 'twinkle',
};

export function animationForIcon(Icon: { displayName?: string }): IconAnimation {
  const name = Icon.displayName?.replace(/Icon$/, '');
  return (name && ICON_ANIMATIONS[name]) || 'breathe';
}
