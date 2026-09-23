/** Radar chart — React port of the mockup's radar(vals, labels). Values 0–100. */
export default function Radar({ values, labels, title }: { values: number[]; labels: string[]; title: string }) {
  const cx = 160, cy = 148, rr = 76, n = values.length;
  const pt = (i: number, f: number) => [cx + rr * f * Math.cos(-Math.PI / 2 + (i * 2 * Math.PI) / n), cy + rr * f * Math.sin(-Math.PI / 2 + (i * 2 * Math.PI) / n)];
  const poly = (f: (i: number) => number) => values.map((_, i) => pt(i, f(i)).join(',')).join(' ');
  const cols = ['#2F6BFF', '#7C5CFC', '#F59E0B'];
  const fsz = n > 4 ? 9.5 : 11;
  return (
    <svg viewBox={`0 0 ${cx * 2} ${cy * 2}`} style={{ width: '100%', maxWidth: 300 }} role="img" aria-label={title}>
      <title>{title}</title>
      {[0.25, 0.5, 0.75, 1].map(f => <polygon key={f} points={poly(() => f)} fill="none" stroke="#E2E8F0" strokeDasharray="3 3" />)}
      {values.map((_, i) => { const [x, y] = pt(i, 1); return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="#E2E8F0" />; })}
      <polygon points={poly(i => values[i] / 100)} fill="rgba(47,107,255,.22)" stroke="#2F6BFF" strokeWidth={2} />
      {values.map((v, i) => { const [x, y] = pt(i, v / 100); return <circle key={i} cx={x} cy={y} r={5} fill="#fff" stroke={cols[i % 3]} strokeWidth={3} />; })}
      {labels.map((l, i) => {
        const [x, y] = pt(i, 1.28);
        const dx = x - cx;
        return <text key={i} x={x} y={y} textAnchor={dx > 6 ? 'start' : dx < -6 ? 'end' : 'middle'} fontSize={fsz} fontWeight={700} fill="#7A8699">{l}</text>;
      })}
    </svg>
  );
}
