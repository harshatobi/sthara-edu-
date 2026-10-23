'use client';

import { TrophyIcon as Trophy } from '@phosphor-icons/react/dist/ssr/Trophy';
import { Chip, Empty, type Tone } from '@/components/canon/ui';
import { fmtDate } from '@/lib/admin/format';
import { CATEGORY_LABEL, GROUP_KIND_LABEL, LEVEL_LABEL, placeOf, type Category, type GroupKind, type Level, type Position } from '@/lib/cocurricular/kirti';

export interface KirtiRecord {
  houses: { id: string; from: string; to: string | null; reason: string | null; name: string; colour: string | null }[];
  memberships: { id: string; session: string; role: string | null; leftOn: string | null; kind: GroupKind; name: string }[];
  kirti: { id: string; session: string; on_date: string; title: string; category: Category; level: Level; position: Position; position_note: string | null;
    house_points: number | null; status: 'pending' | 'approved' | 'rejected'; reject_note: string | null }[];
}

const MEDAL: Partial<Record<Position, Tone>> = { first: 'a', second: 'n', third: 'r' };

export function HouseBadge({ name, colour }: { name: string; colour: string | null }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 700 }}>
      <span aria-hidden style={{ width: 12, height: 12, borderRadius: 999, background: colour ?? 'var(--mut)', display: 'inline-block' }} />{name}
    </span>
  );
}

/**
 * Kirti: one student's achievements and participation, with their house and clubs. The portals pass approved entries
 * only; the office sees every status.
 */
export default function KirtiView({ r, firstName, office = false }: { r: KirtiRecord; firstName: string; office?: boolean }) {
  const house = r.houses.find(h => !h.to);
  const now = r.memberships.filter(m => !m.leftOn);
  const sessions = [...new Set(r.kirti.map(k => k.session))].sort().reverse();
  return (
    <>
      <div className="g2" style={{ marginBottom: 18 }}>
        <div className="card">
          <h3 style={{ fontSize: 15, fontWeight: 800, marginBottom: 8 }}>House</h3>
          {house ? <HouseBadge name={house.name} colour={house.colour} /> : <p className="muted">Not in a house yet.</p>}
          {r.houses.length > 1 && <p className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>Before: {r.houses.filter(h => h.to).map(h => `${h.name} (to ${fmtDate(h.to!)})`).join(', ')}</p>}
        </div>
        <div className="card">
          <h3 style={{ fontSize: 15, fontWeight: 800, marginBottom: 8 }}>Clubs and teams</h3>
          {!r.memberships.length ? <p className="muted">None yet.</p> : (
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {(office ? r.memberships : now.length ? now : r.memberships).slice(0, 12).map(m => (
                <li key={m.id}><b>{m.name}</b> <span className="muted">{GROUP_KIND_LABEL[m.kind]}{m.role ? `, ${m.role}` : ''} · {m.session}{m.leftOn ? ` (left ${fmtDate(m.leftOn)})` : ''}</span></li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <div className="card">
        <h3 style={{ fontSize: 15, fontWeight: 800, marginBottom: 4 }}>Kirti</h3>
        <p className="muted" style={{ fontSize: 13, marginBottom: 12 }}>{firstName}&apos;s achievements and everything {firstName} took part in.</p>
        {!r.kirti.length ? <Empty icon={<Trophy size={26} weight="duotone" />} title="Nothing yet">Teachers add achievements and events here; the school approves each one.</Empty> : sessions.map(s => (
          <div key={s} style={{ marginBottom: 14 }}>
            <h4 style={{ fontSize: 12, letterSpacing: '.1em', color: 'var(--mut)', margin: '6px 0' }}>SESSION {s.replace('-', '–')}</h4>
            <div style={{ overflowX: 'auto' }}><table className="tbl">
              <tbody>{r.kirti.filter(k => k.session === s).map(k => (
                <tr key={k.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(k.on_date)}</td>
                  <td><b>{k.title}</b><div className="muted" style={{ fontSize: 12 }}>{CATEGORY_LABEL[k.category]} · {LEVEL_LABEL[k.level]} level{k.house_points ? ` · ${k.house_points > 0 ? '+' : ''}${k.house_points} house points` : ''}</div></td>
                  <td><Chip tone={MEDAL[k.position] ?? 'b'}>{placeOf(k.position, k.position_note).toUpperCase()}</Chip>
                    {office && k.status !== 'approved' && <> <Chip tone={k.status === 'pending' ? 'n' : 'r'}>{k.status === 'pending' ? 'TO APPROVE' : 'REJECTED'}</Chip></>}
                    {office && k.status === 'rejected' && k.reject_note && <div className="muted" style={{ fontSize: 12 }}>{k.reject_note}</div>}</td>
                </tr>
              ))}</tbody>
            </table></div>
          </div>
        ))}
      </div>
    </>
  );
}
