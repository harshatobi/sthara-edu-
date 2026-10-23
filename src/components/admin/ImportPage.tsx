'use client';

import { useMemo } from 'react';
import { PageBar } from '@/components/canon/ui';
import ImportCenter, { type ImportApi } from '@/components/import/ImportCenter';
import { useAuth } from '@/contexts/AuthContext';
import { useAdminDesk } from '@/lib/admin/useAdminDesk';
import { DeskGate } from './kit';

/** Data import: the school loads its own history and records from Sthara's published file formats. */
export default function ImportPage() {
  return <DeskGate need="data.import">{() => <Import />}</DeskGate>;
}

function Import() {
  const { call } = useAdminDesk();
  const { getAuthToken } = useAuth();
  const api = useMemo<ImportApi>(() => {
    const get = async (path: string) => {
      const token = await getAuthToken();
      const res = await fetch(path, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Something went wrong. Try again.');
      return data;
    };
    return {
      list: () => get('/api/admin/import'),
      get: id => get(`/api/admin/import/${id}`),
      create: body => call('/api/admin/import', 'POST', body),
      act: (id, action) => call(`/api/admin/import/${id}`, 'POST', { action }),
      fileUrls: (id, names) => call(`/api/admin/import/${id}`, 'POST', { action: 'file-urls', names }),
    };
  }, [call, getAuthToken]);
  return (
    <>
      <PageBar eyebrow="DATA IMPORT" title="Bring your records into Sthara"
        sub="The register, family, health, documents, attendance, marks, past results, fees and admissions, from Sthara's published file formats. Checked in full before anything is saved, and undoable for 30 days." />
      <ImportCenter api={api} who="school" />
    </>
  );
}
