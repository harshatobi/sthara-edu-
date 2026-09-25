/** Labels shared by the admin desk, the admin/teacher API routes and the pages. */

export const LEAVE_TYPES: Record<string, string> = {
  casual: 'Casual leave', sick: 'Sick leave', earned: 'Earned leave', duty: 'On duty', maternity: 'Maternity leave',
  paternity: 'Paternity leave', unpaid: 'Leave without pay',
};

export const CONSENT_TYPES: Record<string, { label: string; purpose: string }> = {
  wellness_checkin: { label: 'Wellness check-ins', purpose: 'Energy check-ins and journal entries' },
  ai_tutor: { label: 'AI tutor', purpose: 'Socratic tutor sessions and their depth scores' },
  data_processing: { label: 'Learning data', purpose: 'TML diagnostics from homework, quizzes and tutor use' },
  proctoring: { label: 'Proctoring', purpose: 'Tab-switch monitoring during proctored work' },
};
