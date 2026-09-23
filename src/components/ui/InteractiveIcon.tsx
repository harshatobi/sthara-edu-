'use client';

import { useCallback, useEffect, useRef, type CSSProperties } from 'react';
import type { Icon as PhosphorIcon } from '@phosphor-icons/react';
import { GESTURES, animationForIcon } from '@/lib/iconAnimations';

interface InteractiveIconProps {
  icon: PhosphorIcon;
  color: string;
  active?: boolean;
  size?: number;
  className?: string;
  style?: CSSProperties;
}

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Decorative icon on its own tinted tile; the surrounding button/link owns
 * focus and interaction. Idle it's a two-tone glyph; active it turns solid on
 * a deeper tile with a soft, steady glow. Hovering or focusing the control
 * (or the icon becoming active) plays its one signature gesture, start to
 * finish — no loops.
 */
export default function InteractiveIcon({
  icon: Icon, color, active = false, size = 19, className = '', style,
}: InteractiveIconProps) {
  const name = Icon.displayName?.replace(/Icon$/, '') ?? '';
  const root = useRef<HTMLSpanElement>(null);
  const glyph = useRef<HTMLSpanElement>(null);
  const running = useRef<Animation | null>(null);
  const gesture = GESTURES[animationForIcon(Icon)];

  const play = useCallback(() => {
    const el = glyph.current;
    if (!el || reducedMotion() || typeof el.animate !== 'function') return;
    if (running.current && running.current.playState === 'running') return; // let the current one finish
    el.style.transformOrigin = gesture.origin;
    running.current = el.animate(gesture.keyframes, { duration: gesture.duration, easing: gesture.easing });
  }, [gesture]);

  // The gesture belongs to the whole control, not just the glyph's few pixels.
  useEffect(() => {
    const host = root.current?.closest('a, button, [role="button"]') ?? root.current;
    if (!host) return;
    host.addEventListener('pointerenter', play);
    host.addEventListener('focusin', play);
    return () => { host.removeEventListener('pointerenter', play); host.removeEventListener('focusin', play); };
  }, [play]);

  // Becoming the active one (e.g. navigating to its tab) plays it once.
  const wasActive = useRef(active);
  useEffect(() => {
    if (active && !wasActive.current) play();
    wasActive.current = active;
  }, [active, play]);

  return (
    <span
      ref={root}
      aria-hidden="true"
      data-active={active}
      data-icon={name}
      className={`icon-interactive ${className}`}
      style={{ '--icon-color': color, '--icon-size': `${size}px`, ...style } as CSSProperties}
    >
      <span ref={glyph} className="icon-glyph">
        <Icon size={size} weight={active ? 'fill' : 'duotone'} />
      </span>
    </span>
  );
}
