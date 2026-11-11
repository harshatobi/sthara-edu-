import { figureUrl, figureWidth, type BankFigure } from '@/lib/studio/figures';

/**
 * A bank question's pictures at the size the paper printed them (share of the text column), never stretched.
 * `scale` enlarges them for large print and the projector. Alt text says what the picture is for; the full
 * description for students who can't use it is CBSE's text-only version, which replaces the question instead.
 */
export default function BankFigures({ figs, label = 'Figure for this question', scale = 1, className, eager = false }: {
  figs: BankFigure[] | undefined | null; label?: string; scale?: number; className?: string;
  /** Load at once: a hidden print sheet's pictures never come into view, so lazy ones would print blank. */
  eager?: boolean;
}) {
  if (!figs?.length) return null;
  return (
    <div className={className} style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: '10px 0' }}>
      {figs.map((f, i) => (
        // Plain img: these are fixed public files from the bank bucket, already cropped and sized.
        // eslint-disable-next-line @next/next/no-img-element
        <img key={f.path} src={figureUrl(f.path)} alt={figs.length > 1 ? `${label} (${i + 1} of ${figs.length})` : label}
          loading={eager ? 'eager' : 'lazy'} style={{ width: `${Math.min(100, figureWidth(f) * scale)}%`, maxWidth: '100%', height: 'auto', display: 'block', background: '#fff' }} />
      ))}
    </div>
  );
}
