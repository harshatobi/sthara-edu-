'use client';

import type { ComponentType } from 'react';
import { PlayIcon as Play } from '@phosphor-icons/react/dist/ssr/Play';
import { ArrowCounterClockwiseIcon as ArrowCounterClockwise } from '@phosphor-icons/react/dist/ssr/ArrowCounterClockwise';
import type { LabEngine, Params } from '@/lib/lab/types';
import OpticsView from './OpticsView';
import CircuitView from './CircuitView';
import TitrationView from './TitrationView';
import MotionView from './MotionView';
import ForcesView from './ForcesView';
import EnergyView from './EnergyView';
import SoundView from './SoundView';
import EyePrismView from './EyePrismView';
import MagnetismView from './MagnetismView';
import ReactionsView from './ReactionsView';
import OhmView from './OhmView';
import PendulumView from './PendulumView';
import PulseView from './PulseView';
import TrolleyView from './TrolleyView';
import InclineView from './InclineView';
import SlabView from './SlabView';
import AcidPropsView from './AcidPropsView';
import ReactivityView from './ReactivityView';
import SoapView from './SoapView';
import MixturesView from './MixturesView';
import MicroscopeView from './MicroscopeView';
import SpecimensView from './SpecimensView';
import OsmosisView from './OsmosisView';
import PhotosynthesisView from './PhotosynthesisView';
import RespirationView from './RespirationView';
import TropismView from './TropismView';
import ReflexView from './ReflexView';
import HeredityView from './HeredityView';
import FoodChainView from './FoodChainView';
import InstrumentsView from './InstrumentsView';
import BalanceView from './BalanceView';
import VectorsView from './VectorsView';
import ShmView from './ShmView';
import FrictionView from './FrictionView';
import ProjectileView from './ProjectileView';
import ElasticView from './ElasticView';
import BoyleView from './BoyleView';
import FluidsView from './FluidsView';
import ThermalView from './ThermalView';
import SonometerView from './SonometerView';
import ResonanceView from './ResonanceView';
import WireView from './WireView';
import BridgeView from './BridgeView';
import GalvanometerView from './GalvanometerView';
import ComponentsView from './ComponentsView';
import LensBenchView from './LensBenchView';
import PrismDevView from './PrismDevView';
import RefractiveView from './RefractiveView';
import DiodeView from './DiodeView';
import WaveOpticsView from './WaveOpticsView';
import EfieldView from './EfieldView';
import CapacitorView from './CapacitorView';
import LorentzView from './LorentzView';
import EmiView from './EmiView';
import LcrView from './LcrView';
import PhotoelectricView from './PhotoelectricView';
import BohrView from './BohrView';
import NucleusView from './NucleusView';
import type { ViewProps } from './types';
import '@/styles/lab.css';

const VIEWS: Record<string, ComponentType<ViewProps<any>>> = {
  optics: OpticsView,
  circuits: CircuitView,
  'acid-base': TitrationView,
  motion: MotionView,
  forces: ForcesView,
  energy: EnergyView,
  sound: SoundView,
  'eye-prism': EyePrismView,
  magnetism: MagnetismView,
  reactions: ReactionsView,
  ohm: OhmView,
  pendulum: PendulumView,
  pulse: PulseView,
  trolley: TrolleyView,
  incline: InclineView,
  slab: SlabView,
  'acid-props': AcidPropsView,
  reactivity: ReactivityView,
  soap: SoapView,
  mixtures: MixturesView,
  microscope: MicroscopeView,
  specimens: SpecimensView,
  osmosis: OsmosisView,
  photosynthesis: PhotosynthesisView,
  respiration: RespirationView,
  tropism: TropismView,
  reflex: ReflexView,
  heredity: HeredityView,
  'food-chain': FoodChainView,
  instruments: InstrumentsView,
  balance: BalanceView,
  vectors: VectorsView,
  shm: ShmView,
  friction: FrictionView,
  projectile: ProjectileView,
  elastic: ElasticView,
  boyle: BoyleView,
  fluids: FluidsView,
  thermal: ThermalView,
  sonometer: SonometerView,
  resonance: ResonanceView,
  wire: WireView,
  bridge: BridgeView,
  galvanometer: GalvanometerView,
  components: ComponentsView,
  'lens-bench': LensBenchView,
  'prism-dev': PrismDevView,
  refractive: RefractiveView,
  diode: DiodeView,
  'wave-optics': WaveOpticsView,
  efield: EfieldView,
  capacitor: CapacitorView,
  lorentz: LorentzView,
  emi: EmiView,
  lcr: LcrView,
  photoelectric: PhotoelectricView,
  bohr: BohrView,
  nucleus: NucleusView,
};

export function LabView({ engine, ...props }: ViewProps & { engine: LabEngine<any> }) {
  const View = VIEWS[engine.id];
  return <div className="lab-view">{View ? <View {...props} /> : null}</div>;
}

/** A value's control, built from the engine's own range so it can't go out of bounds. */
export function LabControls({ engine, params, setParam, locked }: { engine: LabEngine<any>; params: Params; setParam: ViewProps['setParam']; locked: boolean }) {
  return (
    <>
      {engine.params.filter(s => !s.show || s.show(params)).map(s => {
        // A choice the engine would refuse in this combination is shown but disabled.
        const refused = (value: string) => s.kind === 'choice' && !!engine.check?.({ ...params, [s.key]: value } as any);
        return (
          <div className="lab-ctl" key={s.key}>
            {s.kind === 'number' ? (
              <>
                <label htmlFor={`lab-${s.key}`}>{s.label}<output>{params[s.key]} {s.unit}</output></label>
                <input id={`lab-${s.key}`} type="range" min={s.min} max={s.max} step={s.step} value={Number(params[s.key])} disabled={locked}
                  onChange={e => setParam(s.key, Number(e.target.value))} />
              </>
            ) : (
              <>
                <label htmlFor={`lab-${s.key}`}>{s.label}</label>
                <select id={`lab-${s.key}`} value={String(params[s.key])} disabled={locked} onChange={e => setParam(s.key, e.target.value)}>
                  {s.options.map(o => <option key={o.value} value={o.value} disabled={refused(o.value)}>{o.label}</option>)}
                </select>
              </>
            )}
          </div>
        );
      })}
    </>
  );
}

export function LabReadouts({ engine, params, conceal }: { engine: LabEngine<any>; params: Params; conceal: boolean }) {
  if (conceal) return <p className="lab-hidden">Readings stay hidden until you reveal.</p>;
  return <div className="lab-reads">{engine.readouts(params).map(r => <div className="lab-read" key={r.label}><span>{r.label}</span><b>{r.value}</b></div>)}</div>;
}

/** The simulation with its controls, readings and run button: the builder's working area. */
export default function LabStage({ engine, params, setParam, runKey, onRun, onReset }: {
  engine: LabEngine<any>; params: Params; setParam: ViewProps['setParam']; runKey: number; onRun: () => void; onReset: () => void;
}) {
  return (
    <div className="lab-stage">
      <LabView engine={engine} params={params} setParam={setParam} conceal={false} runKey={runKey} locked={false} />
      <div className="lab-side">
        <div className="lab-panel">
          <div className="lab-transport">
            <button className="btn pri sm" onClick={onRun}><Play size={13} weight="fill" /> Run</button>
            <button className="btn sm" onClick={onReset}><ArrowCounterClockwise size={13} weight="bold" /> Defaults</button>
          </div>
          <LabControls engine={engine} params={params} setParam={setParam} locked={false} />
        </div>
        <div className="lab-panel">
          <h4>Readings</h4>
          <LabReadouts engine={engine} params={params} conceal={false} />
        </div>
      </div>
    </div>
  );
}
