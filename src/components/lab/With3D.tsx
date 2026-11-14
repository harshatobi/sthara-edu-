'use client';

import { useState, type ReactNode } from 'react';
import { use3d } from './use3d';

/**
 * A simulation with a 3D view and its flat diagram. 3D is shown where there is
 * room and the browser can draw it; the diagram is one tap away and is what
 * prints and what small cards get. `solid` is given the function to call if 3D
 * turns out not to work.
 */
export default function With3D({ label, solid, flat, minWidth }: { label: string; solid: (fail: () => void) => ReactNode; flat: ReactNode; minWidth?: number }) {
  const { box, can3d, fail } = use3d(minWidth);
  const [wantFlat, setWantFlat] = useState(false);
  const in3d = can3d && !wantFlat;
  return (
    <div ref={box} className="lab-3d-wrap">
      {can3d && (
        <div className="lab-3d-switch" role="radiogroup" aria-label={label}>
          <button type="button" role="radio" aria-checked={in3d} className={in3d ? 'on' : ''} onClick={() => setWantFlat(false)}>3D</button>
          <button type="button" role="radio" aria-checked={!in3d} className={in3d ? '' : 'on'} onClick={() => setWantFlat(true)}>Diagram</button>
        </div>
      )}
      {in3d ? solid(fail) : flat}
    </div>
  );
}
