'use client';

import Link from 'next/link';
import type { ComponentType } from 'react';
import { LightbulbFilamentIcon as LightbulbFilament } from '@phosphor-icons/react/dist/ssr/LightbulbFilament';
import { CircuitryIcon as Circuitry } from '@phosphor-icons/react/dist/ssr/Circuitry';
import { FlaskIcon as Flask } from '@phosphor-icons/react/dist/ssr/Flask';
import { CarIcon as Car } from '@phosphor-icons/react/dist/ssr/Car';
import { ArrowsLeftRightIcon as ArrowsLeftRight } from '@phosphor-icons/react/dist/ssr/ArrowsLeftRight';
import { ScalesIcon as Scales } from '@phosphor-icons/react/dist/ssr/Scales';
import { WaveformIcon as Waveform } from '@phosphor-icons/react/dist/ssr/Waveform';
import { EyeIcon as Eye } from '@phosphor-icons/react/dist/ssr/Eye';
import { MagnetIcon as Magnet } from '@phosphor-icons/react/dist/ssr/Magnet';
import { AtomIcon as Atom } from '@phosphor-icons/react/dist/ssr/Atom';
import { LightningIcon as Lightning } from '@phosphor-icons/react/dist/ssr/Lightning';
import { MetronomeIcon as Metronome } from '@phosphor-icons/react/dist/ssr/Metronome';
import { WaveSineIcon as WaveSine } from '@phosphor-icons/react/dist/ssr/WaveSine';
import { TruckIcon as Truck } from '@phosphor-icons/react/dist/ssr/Truck';
import { TrendUpIcon as TrendUp } from '@phosphor-icons/react/dist/ssr/TrendUp';
import { SquareIcon as Square } from '@phosphor-icons/react/dist/ssr/Square';
import { TestTubeIcon as TestTube } from '@phosphor-icons/react/dist/ssr/TestTube';
import { DropIcon as Drop } from '@phosphor-icons/react/dist/ssr/Drop';
import { BathtubIcon as Bathtub } from '@phosphor-icons/react/dist/ssr/Bathtub';
import { MicroscopeIcon as Microscope } from '@phosphor-icons/react/dist/ssr/Microscope';
import { BugIcon as Bug } from '@phosphor-icons/react/dist/ssr/Bug';
import { LeafIcon as Leaf } from '@phosphor-icons/react/dist/ssr/Leaf';
import { PlantIcon as Plant } from '@phosphor-icons/react/dist/ssr/Plant';
import { HandPalmIcon as HandPalm } from '@phosphor-icons/react/dist/ssr/HandPalm';
import { DnaIcon as Dna } from '@phosphor-icons/react/dist/ssr/Dna';
import { TreeEvergreenIcon as TreeEvergreen } from '@phosphor-icons/react/dist/ssr/TreeEvergreen';
import { FunnelIcon as Funnel } from '@phosphor-icons/react/dist/ssr/Funnel';
import { ArrowsDownUpIcon as ArrowsDownUp } from '@phosphor-icons/react/dist/ssr/ArrowsDownUp';
import { RulerIcon as Ruler } from '@phosphor-icons/react/dist/ssr/Ruler';
import { ThermometerIcon as Thermometer } from '@phosphor-icons/react/dist/ssr/Thermometer';
import { GaugeIcon as Gauge } from '@phosphor-icons/react/dist/ssr/Gauge';
import { TargetIcon as Target } from '@phosphor-icons/react/dist/ssr/Target';
import { SpiralIcon as Spiral } from '@phosphor-icons/react/dist/ssr/Spiral';
import { SunIcon as Sun } from '@phosphor-icons/react/dist/ssr/Sun';
import { CpuIcon as Cpu } from '@phosphor-icons/react/dist/ssr/Cpu';
import { RainbowIcon as Rainbow } from '@phosphor-icons/react/dist/ssr/Rainbow';
import { WavesIcon as Waves } from '@phosphor-icons/react/dist/ssr/Waves';
import { PlugIcon as Plug } from '@phosphor-icons/react/dist/ssr/Plug';
import { RadioactiveIcon as Radioactive } from '@phosphor-icons/react/dist/ssr/Radioactive';
import { CubeIcon as Cube } from '@phosphor-icons/react/dist/ssr/Cube';
import { PageBar } from '@/components/canon/ui';
import { ClipboardTextIcon as ClipboardText } from '@phosphor-icons/react/dist/ssr/ClipboardText';
import { ENGINES } from '@/lib/lab/registry';
import SavedDemos from './SavedDemos';
import PredictionMisses from './PredictionMisses';
import '@/styles/lab.css';

const LOOK: Record<string, { icon: ComponentType<{ size?: number; weight?: 'duotone' | 'fill' }>; colour: string }> = {
  optics: { icon: LightbulbFilament, colour: 'var(--amber)' },
  circuits: { icon: Circuitry, colour: 'var(--blue)' },
  'acid-base': { icon: Flask, colour: 'var(--purple)' },
  motion: { icon: Car, colour: 'var(--sky)' },
  forces: { icon: ArrowsLeftRight, colour: 'var(--coral)' },
  energy: { icon: Scales, colour: 'var(--green)' },
  sound: { icon: Waveform, colour: 'var(--amber)' },
  'eye-prism': { icon: Eye, colour: 'var(--role-deep)' },
  magnetism: { icon: Magnet, colour: 'var(--ink)' },
  reactions: { icon: Atom, colour: 'var(--green)' },
  ohm: { icon: Lightning, colour: 'var(--blue)' },
  pendulum: { icon: Metronome, colour: 'var(--purple)' },
  pulse: { icon: WaveSine, colour: 'var(--sky)' },
  trolley: { icon: Truck, colour: 'var(--coral)' },
  incline: { icon: TrendUp, colour: 'var(--sky)' },
  slab: { icon: Square, colour: 'var(--amber)' },
  'acid-props': { icon: TestTube, colour: 'var(--purple)' },
  reactivity: { icon: ArrowsDownUp, colour: 'var(--coral)' },
  soap: { icon: Bathtub, colour: 'var(--sky)' },
  mixtures: { icon: Funnel, colour: 'var(--amber)' },
  microscope: { icon: Microscope, colour: 'var(--ink)' },
  specimens: { icon: Bug, colour: 'var(--green)' },
  osmosis: { icon: Drop, colour: 'var(--blue)' },
  photosynthesis: { icon: Leaf, colour: 'var(--green)' },
  respiration: { icon: Plant, colour: 'var(--amber)' },
  tropism: { icon: Plant, colour: 'var(--green)' },
  reflex: { icon: HandPalm, colour: 'var(--role-deep)' },
  heredity: { icon: Dna, colour: 'var(--purple)' },
  'food-chain': { icon: TreeEvergreen, colour: 'var(--green)' },
  instruments: { icon: Ruler, colour: 'var(--ink)' },
  balance: { icon: Scales, colour: 'var(--amber)' },
  vectors: { icon: ArrowsLeftRight, colour: 'var(--blue)' },
  shm: { icon: Metronome, colour: 'var(--purple)' },
  friction: { icon: Square, colour: 'var(--amber)' },
  projectile: { icon: Target, colour: 'var(--role-deep)' },
  elastic: { icon: Spiral, colour: 'var(--ink)' },
  boyle: { icon: Gauge, colour: 'var(--blue)' },
  fluids: { icon: Drop, colour: 'var(--blue)' },
  thermal: { icon: Thermometer, colour: 'var(--role-deep)' },
  sonometer: { icon: WaveSine, colour: 'var(--purple)' },
  resonance: { icon: Waveform, colour: 'var(--purple)' },
  wire: { icon: Lightning, colour: 'var(--amber)' },
  bridge: { icon: Circuitry, colour: 'var(--blue)' },
  galvanometer: { icon: Gauge, colour: 'var(--ink)' },
  components: { icon: Plug, colour: 'var(--green)' },
  'lens-bench': { icon: Eye, colour: 'var(--blue)' },
  'prism-dev': { icon: Rainbow, colour: 'var(--purple)' },
  refractive: { icon: Drop, colour: 'var(--ink)' },
  diode: { icon: Cpu, colour: 'var(--green)' },
  'wave-optics': { icon: Waves, colour: 'var(--blue)' },
  efield: { icon: Lightning, colour: 'var(--role-deep)' },
  capacitor: { icon: Cube, colour: 'var(--blue)' },
  lorentz: { icon: Magnet, colour: 'var(--role-deep)' },
  emi: { icon: Magnet, colour: 'var(--purple)' },
  lcr: { icon: WaveSine, colour: 'var(--green)' },
  photoelectric: { icon: Sun, colour: 'var(--amber)' },
  bohr: { icon: Atom, colour: 'var(--purple)' },
  nucleus: { icon: Radioactive, colour: 'var(--role-deep)' },
};

const CLASSES = [9, 10, 11, 12];

export default function Gallery() {
  return (
    <>
      <PageBar eyebrow="LIVE LAB" title="Simulations for the class"
        sub="Set one up, choose what the class should predict, then present it on the board. Every number comes from the textbook formulas, worked out exactly."
        actions={<Link className="btn pri" href="/teacher/lab/practicals"><ClipboardText size={16} weight="fill" /> CBSE practicals</Link>} />
      <PredictionMisses />
      <SavedDemos />
      {CLASSES.map(cls => (
        <section key={cls} style={{ marginBottom: 26 }}>
          <h2 className="lab-section">Class {cls} {cls >= 11 ? 'Physics' : 'Science'}</h2>
          <div className="lab-grid">
            {ENGINES.filter(e => e.classes[0] === cls).map(e => {
              const look = LOOK[e.id] ?? { icon: Flask, colour: 'var(--ink)' };
              const Icon = look.icon;
              return (
                <Link key={e.id} href={`/teacher/lab/build?e=${e.id}`} className="lab-card">
                  <span className="lab-tile" style={{ background: look.colour }}><Icon size={24} weight="fill" /></span>
                  <h3>{e.title}</h3>
                  <p>{e.blurb}</p>
                  <div className="lab-chips">
                    {e.chapters.map(c => <span key={c} className="lab-chip">{c}</span>)}
                    <span className="lab-chip">{e.predictions.length} predictions</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </>
  );
}
