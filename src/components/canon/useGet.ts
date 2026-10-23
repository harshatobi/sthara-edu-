'use client';

/** GET an API route with the session token: the exams hook, which also clears the old page's data when the path changes. */
export { useApi as useGet } from '@/lib/exams/useApi';
