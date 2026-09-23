/**
 * Each icon's signature gesture, keyed the same way as ICON_COLORS in
 * iconColors.ts: a single, short movement that says what the icon means (the
 * bell rings once, the heart beats once, the flame sways). It plays when the
 * icon's control is hovered or focused, and once when it becomes the active
 * one — never on a loop, so a selected tab sits still instead of flickering.
 *
 * Played with the Web Animations API (see InteractiveIcon), so a gesture
 * always runs to completion and never snaps back when the pointer leaves.
 */
export type IconAnimation = 'sway' | 'beat' | 'ring' | 'rise' | 'turn' | 'swell' | 'lift';

export const ICON_ANIMATIONS: Record<string, IconAnimation> = {
  Fire: 'sway',
  Lightning: 'sway',
  Sparkle: 'turn',
  Heart: 'beat',
  Bell: 'ring',
  Warning: 'ring',
  ChartLineUp: 'rise',
  Rocket: 'rise',
  Trophy: 'turn',
  Brain: 'swell',
  ShieldCheck: 'swell',
  CheckCircle: 'turn',
  Check: 'turn',
};

export function animationForIcon(Icon: { displayName?: string }): IconAnimation {
  const name = Icon.displayName?.replace(/Icon$/, '');
  return (name && ICON_ANIMATIONS[name]) || 'lift';
}

interface Gesture { keyframes: Keyframe[]; duration: number; easing: string; origin: string }

// Gentle amplitudes (a few degrees, a few percent): character, not commotion.
export const GESTURES: Record<IconAnimation, Gesture> = {
  sway: {
    keyframes: [
      { transform: 'rotate(0) scale(1, 1)' },
      { transform: 'rotate(-5deg) scale(.97, 1.06)', offset: 0.35 },
      { transform: 'rotate(3deg) scale(1.02, .98)', offset: 0.7 },
      { transform: 'rotate(0) scale(1, 1)' },
    ],
    duration: 900, easing: 'ease-in-out', origin: '50% 90%',
  },
  beat: {
    keyframes: [
      { transform: 'scale(1)' },
      { transform: 'scale(1.14)', offset: 0.18 },
      { transform: 'scale(1)', offset: 0.36 },
      { transform: 'scale(1.08)', offset: 0.52 },
      { transform: 'scale(1)' },
    ],
    duration: 800, easing: 'ease-out', origin: '50% 55%',
  },
  ring: {
    keyframes: [
      { transform: 'rotate(0)' },
      { transform: 'rotate(-12deg)', offset: 0.15 },
      { transform: 'rotate(9deg)', offset: 0.35 },
      { transform: 'rotate(-5deg)', offset: 0.55 },
      { transform: 'rotate(2deg)', offset: 0.75 },
      { transform: 'rotate(0)' },
    ],
    duration: 850, easing: 'ease-out', origin: '50% 12%',
  },
  rise: {
    keyframes: [{ transform: 'translateY(0)' }, { transform: 'translateY(-3px)', offset: 0.45 }, { transform: 'translateY(0)' }],
    duration: 650, easing: 'cubic-bezier(.34,1.4,.64,1)', origin: '50% 50%',
  },
  turn: {
    keyframes: [{ transform: 'rotate(0) scale(1)' }, { transform: 'rotate(14deg) scale(1.1)', offset: 0.5 }, { transform: 'rotate(0) scale(1)' }],
    duration: 700, easing: 'cubic-bezier(.4,0,.2,1)', origin: '50% 50%',
  },
  swell: {
    keyframes: [{ transform: 'scale(1)' }, { transform: 'scale(1.1)', offset: 0.45 }, { transform: 'scale(1)' }],
    duration: 750, easing: 'cubic-bezier(.4,0,.2,1)', origin: '50% 50%',
  },
  lift: {
    keyframes: [{ transform: 'translateY(0) scale(1)' }, { transform: 'translateY(-2px) scale(1.06)', offset: 0.45 }, { transform: 'translateY(0) scale(1)' }],
    duration: 600, easing: 'cubic-bezier(.34,1.3,.64,1)', origin: '50% 60%',
  },
};
