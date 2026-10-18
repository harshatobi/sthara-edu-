import { choices, type LabEngine, type PredictionTemplate } from '../types';

/**
 * Reflex arc (NCERT Class 10 "Control and Coordination", Fig 6.2). A sudden
 * stimulus is detected by a receptor, carried by a sensory neuron to the
 * spinal cord, passed (through a relay neuron) to a motor neuron and on to
 * an effector muscle, before the brain is even told. The path is fixed, so
 * it is quick and needs no thinking.
 */

export type Stimulus = 'hot' | 'pin' | 'knee';
export type ReflexParams = { stimulus: Stimulus };

export const STIMULI: Record<Stimulus, { label: string; receptor: string; effector: string; action: string; relay: boolean }> = {
  hot: { label: 'Touching a hot plate', receptor: 'Heat receptors in the skin of the finger', effector: 'Arm muscles (biceps)', action: 'The hand is pulled away', relay: true },
  pin: { label: 'A pin prick on the foot', receptor: 'Pain receptors in the skin of the foot', effector: 'Leg muscles', action: 'The foot is jerked away', relay: true },
  knee: { label: 'A tap just below the knee', receptor: 'Stretch receptors in the thigh muscle', effector: 'Thigh muscle (quadriceps)', action: 'The lower leg kicks forward', relay: false },
};

export function path(p: ReflexParams): string[] {
  const s = STIMULI[p.stimulus];
  return [s.receptor, 'Sensory neuron', s.relay ? 'Relay neuron in the spinal cord' : 'Spinal cord (sensory neuron joins the motor neuron directly)', 'Motor neuron', s.effector];
}

const SHORT = ['Receptor', 'Sensory neuron', 'Spinal cord', 'Motor neuron', 'Effector muscle'];

const predictions: PredictionTemplate<ReflexParams>[] = [
  {
    id: 'order', label: 'The path of the message', topic: 'Voluntary, involuntary and reflex action',
    build: () => {
      const right = SHORT.join(' → ');
      const c = choices(right, ['Receptor → Motor neuron → Spinal cord → Sensory neuron → Effector muscle', 'Receptor → Sensory neuron → Brain → Motor neuron → Effector muscle', 'Effector muscle → Motor neuron → Spinal cord → Sensory neuron → Receptor'], 361);
      return { prompt: 'In what order does the message travel in this reflex?', ...c, explain: `${right}. The spinal cord sends the response straight back; the brain is told afterwards.` };
    },
  },
  {
    id: 'where', label: 'Where the response is decided', topic: 'Voluntary, involuntary and reflex action',
    build: p => {
      const c = choices('In the spinal cord', ['In the brain (cerebrum)', 'In the muscle itself', 'In the receptor'], 362);
      return { prompt: `${STIMULI[p.stimulus].label}: where is the response worked out?`, ...c, explain: 'In a reflex arc the connection between the sensory and motor neurons is in the spinal cord, so the response does not wait for the brain to think.' };
    },
  },
  {
    id: 'effector', label: 'What responds', topic: 'Nervous system in animals',
    build: p => {
      const s = STIMULI[p.stimulus];
      const c = choices(s.effector, Object.values(STIMULI).map(x => x.effector).concat('The skin'), 363);
      return { prompt: `${s.label}: which effector carries out the response?`, ...c, explain: `${s.action}: the motor neuron makes the ${s.effector.toLowerCase()} contract.` };
    },
  },
  {
    id: 'why-fast', label: 'Why reflexes are quick', topic: 'Voluntary, involuntary and reflex action',
    build: () => {
      const c = choices('The path is short and fixed, with no thinking by the brain', ['The nerves in reflexes are thicker', 'Muscles act on their own without nerves', 'The brain works faster in danger'], 364);
      return { prompt: 'Why is a reflex action so fast?', ...c, explain: 'The message goes only as far as the spinal cord and back along a fixed path, so the response begins before the brain is aware: useful when there is danger.' };
    },
  },
];

export const reflex: LabEngine<ReflexParams> = {
  id: 'reflex',
  title: 'Reflex arc',
  blurb: 'Follow a nerve message from receptor to spinal cord to muscle in a reflex: a hot plate, a pin prick, the knee jerk.',
  subject: 'Science',
  classes: [10],
  chapters: ['Control and Coordination'],
  params: [{ kind: 'choice', key: 'stimulus', label: 'Stimulus', default: 'hot', options: (Object.keys(STIMULI) as Stimulus[]).map(value => ({ value, label: STIMULI[value].label })) }],
  readouts: p => path(p).map((x, i) => ({ label: SHORT[i], value: x })),
  predictions,
};
