'use client';

import Link from 'next/link';
import type { ComponentType } from 'react';
import { LightbulbFilamentIcon as LightbulbFilament } from '@phosphor-icons/react/dist/ssr/LightbulbFilament';
import { CircuitryIcon as Circuitry } from '@phosphor-icons/react/dist/ssr/Circuitry';
import { FlaskIcon as Flask } from '@phosphor-icons/react/dist/ssr/Flask';
import { PageBar } from '@/components/canon/ui';
import { ENGINES } from '@/lib/lab/registry';
import '@/styles/lab.css';

const LOOK: Record<string, { icon: ComponentType<{ size?: number; weight?: 'duotone' | 'fill' }>; colour: string }> = {
  optics: { icon: LightbulbFilament, colour: 'var(--amber)' },
  circuits: { icon: Circuitry, colour: 'var(--blue)' },
  'acid-base': { icon: Flask, colour: 'var(--purple)' },
};

export default function Gallery() {
  return (
    <>
      <PageBar eyebrow="LIVE LAB" title="Simulations for the class"
        sub="Set one up, choose what the class should predict, then present it on the board. Every number comes from the textbook formulas, worked out exactly." />
      <div className="lab-grid">
        {ENGINES.map(e => {
          const look = LOOK[e.id] ?? { icon: Flask, colour: 'var(--ink)' };
          const Icon = look.icon;
          return (
            <Link key={e.id} href={`/teacher/lab/build?e=${e.id}`} className="lab-card">
              <span className="lab-tile" style={{ background: look.colour }}><Icon size={24} weight="fill" /></span>
              <h3>{e.title}</h3>
              <p>{e.blurb}</p>
              <div className="lab-chips">
                <span className="lab-chip">Class {e.classes.join(', ')}</span>
                {e.chapters.map(c => <span key={c} className="lab-chip">{c}</span>)}
                <span className="lab-chip">{e.predictions.length} predictions</span>
              </div>
            </Link>
          );
        })}
      </div>
    </>
  );
}
