import type { Params } from '@/lib/lab/types';

export interface ViewProps<P extends Params = Params> {
  params: P;
  setParam: (key: string, value: number | string) => void;
  /** Hide whatever gives the answer away (the image, the meters, the end of the curve) while the class predicts. */
  conceal: boolean;
  /** Changes each time the teacher runs it; views replay their motion from the start. 0 = still. */
  runKey: number;
  /** Values can't be changed (a question is on screen). */
  locked: boolean;
}
