'use client';

import { UsersThreeIcon as UsersThree } from '@phosphor-icons/react/dist/ssr/UsersThree';
import { useGet } from '@/components/canon/useGet';

/** Confirmed siblings at the school, under a student on the concession form. Shows nothing without any. */
export default function SiblingNote({ userId }: { userId: string }) {
  const { data } = useGet<{ siblings: { name: string; admissionNo: string }[] }>(`/api/admin/students/siblings?user=${userId}`);
  if (!data?.siblings.length) return null;
  return (
    <div className="note info" style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, fontSize: 13 }}>
      <UsersThree size={16} weight="duotone" aria-hidden="true" />
      <span>Confirmed sibling{data.siblings.length === 1 ? '' : 's'} at this school: {data.siblings.map(s => `${s.name} (${s.admissionNo})`).join(', ')}.</span>
    </div>
  );
}
