'use client';

import type { CSSProperties } from 'react';
import type { Icon as PhosphorIcon } from '@phosphor-icons/react';
import { animationForIcon } from '@/lib/iconAnimations';

interface InteractiveIconProps {
  icon: PhosphorIcon;
  color: string;
  active?: boolean;
  size?: number;
  className?: string;
  style?: CSSProperties;
}

/** Decorative icon; the surrounding button/link owns focus and interaction. */
export default function InteractiveIcon({
  icon: Icon, color, active = false, size = 19, className = '', style,
}: InteractiveIconProps) {
  const name = Icon.displayName?.replace(/Icon$/, '') ?? '';
  return (
    <span
      aria-hidden="true"
      data-active={active}
      data-icon={name}
      className={`icon-interactive ${className}`}
      style={{
        '--icon-color': color,
        '--icon-size': `${size}px`,
        '--icon-glow': `color-mix(in srgb, ${color} 28%, transparent)`,
        ...style,
      } as CSSProperties}
    >
      <span className={`icon-glyph icon-ambient-${animationForIcon(Icon)}`}>
        <Icon size={size} weight="duotone" />
      </span>
      {name === 'Fire' && <span className="icon-embers"><i /><i /><i /></span>}
    </span>
  );
}
