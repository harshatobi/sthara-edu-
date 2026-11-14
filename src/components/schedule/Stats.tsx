import type { ReactNode } from 'react';

/** The scheduling tabs' headline numbers: one compact row of tiles instead of the dashboard's large KPI cards. */
export function Stats({ children }: { children: ReactNode }) {
  return <div className="sch-kpis">{children}</div>;
}

export function Stat({ label, value, note, valueColor }: { label: string; value: ReactNode; note?: ReactNode; valueColor?: string }) {
  return (
    <div className="sch-kpi">
      <div className="lb">{label}</div>
      <div className="vl" style={{ color: valueColor }}>{value}</div>
      {note !== undefined && <div className="nt">{note}</div>}
    </div>
  );
}
