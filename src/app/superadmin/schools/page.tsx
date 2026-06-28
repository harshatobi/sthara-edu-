'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
export default function SuperadminSchools() {
  const router = useRouter();
  useEffect(() => { router.replace('/superadmin/schools/manage'); }, [router]);
  return null;
}
