'use client';

import { useEffect, useState } from 'react';
import { ShieldCheckIcon as ShieldCheck } from '@phosphor-icons/react/dist/ssr/ShieldCheck';
import { Chip, Empty, PageBar, Skeleton } from '@/components/canon/ui';
import { Section, Table, errText, fmtDate, fmtDateTime } from '../_ui';
import { useOpsApi } from '../useOpsApi';

interface Operator {
  id: string; name: string | null; email: string | null; grantedBy: string[]; lastSignIn: string | null;
  createdAt: string | null; mfa: boolean; banned: boolean; you: boolean;
}

/** Platform Manager > Operators: who can open this console. */
export default function OperatorsConsole() {
  const api = useOpsApi();
  const [rows, setRows] = useState<Operator[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    api<{ operators: Operator[] }>('/operators').then(d => setRows(d.operators)).catch(e => { setErr(errText(e)); setRows([]); });
  }, [api]);
  const noMfa = (rows ?? []).filter(o => !o.mfa).length;

  return (
    <>
      <PageBar eyebrow="PLATFORM MANAGER" title="Operators"
        sub="Accounts that can open the Platform Manager. Operators can see and change every school, so keep this list short." />
      {err && <div className="note err" style={{ marginBottom: 18 }} role="alert">{err}</div>}
      <Section title="Access list">
        {!rows ? <Skeleton h={120} /> : (
          <Table head={<tr><th>Operator</th><th>Granted by</th><th>Last sign-in</th><th>Two-factor</th><th>Since</th></tr>}
            empty={!rows.length && <Empty icon={<ShieldCheck size={28} weight="duotone" />} title="No operators" />}>
            {rows.map(o => (
              <tr key={o.id}>
                <td><div className="nm">{o.name || o.email || o.id}{o.you && <> <Chip tone="b">YOU</Chip></>}{o.banned && <> <Chip tone="r">BANNED</Chip></>}</div><div className="sub" style={{ overflowWrap: 'anywhere' }}>{o.email}</div></td>
                <td style={{ fontSize: 12.5 }}>{o.grantedBy.join(', ')}</td>
                <td style={{ whiteSpace: 'nowrap' }}>{o.lastSignIn ? fmtDateTime(o.lastSignIn) : 'Never'}</td>
                <td>{o.mfa ? <Chip tone="g">ON</Chip> : <Chip tone="a">OFF</Chip>}</td>
                <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(o.createdAt)}</td>
              </tr>
            ))}
          </Table>
        )}
      </Section>
      {rows && noMfa > 0 && (
        <div className="note" style={{ marginBottom: 18 }}>
          {noMfa === 1 ? 'One operator signs in' : `${noMfa} operators sign in`} with a password only. Operator accounts can suspend any school and reset any password: two-factor sign-in is strongly advised.
        </div>
      )}
      <Section title="Granting or removing access" sub="Deliberately not a button here, so that one compromised operator session can't create more operators.">
        <p style={{ fontSize: 13.5, lineHeight: 1.6 }}>
          To grant access, add the person&apos;s user id to <span className="mono">public.superadmins</span> in Supabase (SQL editor, as the project owner). To remove it, delete that row and, if set, change their <span className="mono">users.role</span> away from <span className="mono">superadmin</span>. Changes apply on their next request.
        </p>
      </Section>
    </>
  );
}
