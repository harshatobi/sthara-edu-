# Pages and layouts

> Generated 2026-10-29 from the code on this branch and the 18 migrations in `supabase/migrations/` (replayed into a scratch Postgres 16 with Supabase stubs). Every `page.tsx` and `layout.tsx` under `src/app`: whether it is a client component, the API routes its component tree can call, and the tables it reads directly from the browser under RLS. Portal pages often have no calls of their own: their data comes from the layout's provider (`StudentDeskProvider`, `TeacherDeskProvider`, `AdminDeskProvider`, `FamilyProvider`). Do not hand-edit; see [../README.md](../README.md#how-this-was-produced).

| Page / layout | Client | API routes | Direct reads (RLS) |
|---|---|---|---|
| `/ (layout)` |  |  | `users`, `schools` |
| `/admin` |  |  |  |
| `/admin (layout)` | yes | `/api/platform/public` | `notifications`, `schools`, `users`, `tml_scores`, `assignments`, `lesson_plans`, `consents`, `guardians`, `audit_log`, `leave_requests`, `fee_structures`, `fee_invoices`, `fee_payments`, `fee_reminders`, `admission_applicants`, `admission_events`, `school_filings`, `proctor_alerts`, `role_grants`, `fee_day_closes`, `fee_concession_requests`, `leave_policies`, `probe_acks`, `staff_members`, `admission_stages`, `admission_seats`, `admission_offers`, `submissions` |
| `/admin/academic` |  |  |  |
| `/admin/access` |  | `/api/admin/access` |  |
| `/admin/admissions` |  | `/api/admin/admissions`, `/api/admin/admissions/enrol`, `/api/admin/admissions/application`, `/api/admin/admissions/documents`, `/api/admin/admissions/offers`, `/api/admin/admissions/setup` | `classes`, `account_requests` |
| `/admin/ai` |  |  |  |
| `/admin/ask` |  | `/api/staff/ask`, `/api/staff/whatsapp`, `/api/whatsapp/simulate`, `/api/staff/messages`, `/api/feed` |  |
| `/admin/attendance` |  |  | `attendance`, `academic_events`, `bell_schedules`, `sched_wings`, `schools` |
| `/admin/board-pack` |  |  |  |
| `/admin/certificates` |  | `/api/admin/certificates` |  |
| `/admin/cocurricular` |  | `/api/admin/cocurricular` |  |
| `/admin/compliance` |  | `/api/admin/probe` |  |
| `/admin/counselling` |  | `/api/admin/counselling`, `/api/timeline` |  |
| `/admin/directory` | yes | `/api/admin/users`, `/api/admin/delete-user`, `/api/admin/users/assignments`, `/api/admin/account-requests` | `classes`, `timetable_versions`, `timetable_slots`, `account_requests` |
| `/admin/discipline` |  | `/api/admin/discipline` |  |
| `/admin/exams` |  | `/api/admin/exams` |  |
| `/admin/feed` |  | `/api/staff/incidents`, `/api/feed` | `incidents`, `attendance`, `situations` |
| `/admin/fees` |  | `/api/admin/fees`, `/api/admin/students/siblings` |  |
| `/admin/health` |  | `/api/admin/health`, `/api/admin/students/[id]/documents`, `/api/admin/students/[id]/health`, `/api/admin/students/requests` |  |
| `/admin/heatmap` | yes | `/api/admin/heatmap-data` |  |
| `/admin/import` |  | `/api/admin/import`, `/api/admin/import/[id]` |  |
| `/admin/messages` |  | `/api/staff/messages` |  |
| `/admin/paper-gen` | yes | `/api/paper-gen` | `assignments` |
| `/admin/payroll` |  | `/api/admin/payroll/run`, `/api/admin/payroll/export`, `/api/admin/payroll` |  |
| `/admin/people` |  | `/api/admin/people`, `/api/admin/people/documents`, `/api/admin/people/import`, `/api/admin/people/structure`, `/api/me/payslips`, `/api/me/employee` |  |
| `/admin/probe` |  | `/api/admin/probe`, `/api/admin/fees` |  |
| `/admin/results` |  |  |  |
| `/admin/safeguarding` |  | `/api/admin/safeguarding` |  |
| `/admin/schedule` |  | `/api/admin/schedule/staff`, `/api/admin/schedule/setup`, `/api/admin/schedule/calendar`, `/api/admin/schedule/solver`, `/api/admin/schedule/timetable`, `/api/admin/attendance`, `/api/attendance/device`, `/api/admin/schedule/duties`, `/api/admin/schedule/compoff`, `/api/admin/schedule/cover`, `/api/admin/schedule/visits`, `/api/me/attendance` | `sched_requirements`, `teacher_load_rules`, `sched_solver_settings`, `attendance_settings`, `shifts`, `staff_shift_plans`, `shift_overrides`, `staff_punches`, `staff_day_marks`, `leave_requests`, `staff_absences`, `academic_events`, `bell_schedules`, `users`, `staff_members`, `attendance_devices`, `attendance_month_reviews`, `schools`, `sched_wings`, `bell_periods`, `rooms`, `timetable_versions`, `cover_assignments`, `duty_posts`, `duty_roster`, `duty_assignments`, `visit_sessions`, `comp_off_grants`, `timetable_slots` |
| `/admin/staff` |  | `/api/admin/leave`, `/api/admin/leave-policy` |  |
| `/admin/students` |  | `/api/admin/students/settings`, `/api/admin/students/year`, `/api/admin/students/requests`, `/api/admin/students/[id]/documents`, `/api/admin/students`, `/api/admin/students/applicants` |  |
| `/admin/students/[id]` |  | `/api/admin/students/[id]`, `/api/admin/discipline`, `/api/admin/counselling`, `/api/timeline`, `/api/admin/cocurricular`, `/api/admin/certificates`, `/api/admin/students/[id]/documents`, `/api/admin/students/[id]/health` |  |
| `/admin/support` |  | `/api/admin/support` |  |
| `/admin/vault` | yes |  | `users` |
| `/admin/wellness` |  | `/api/admin/filings` |  |
| `/login` | yes | `/api/auth/verify-school`, `/api/platform/public` | `users` |
| `/onboard` |  |  |  |
| `/ops` |  | `/api/ops/overview`, `/api/ops/schools/[id]/settings` |  |
| `/ops (layout)` |  | `/api/platform/public` | `notifications`, `users`, `superadmins`, `ops_operators` |
| `/ops/[schoolId]` |  |  | `users`, `superadmins`, `ops_operators` |
| `/ops/account` |  | `/api/ops/me` |  |
| `/ops/audit` |  | `/api/ops/schools`, `/api/ops/audit` | `users`, `superadmins`, `ops_operators` |
| `/ops/delivery` |  | `/api/ops/delivery` | `users`, `superadmins`, `ops_operators` |
| `/ops/desk` |  | `/api/ops/desk` | `users`, `superadmins`, `ops_operators` |
| `/ops/desk/[id]` |  | `/api/ops/desk/[id]` | `users`, `superadmins`, `ops_operators` |
| `/ops/desk/settings` |  | `/api/ops/desk/settings` | `users`, `superadmins`, `ops_operators` |
| `/ops/enquiries` |  | `/api/ops/territories`, `/api/ops/enquiries` | `users`, `superadmins`, `ops_operators` |
| `/ops/errors` |  | `/api/ops/errors` | `users`, `superadmins`, `ops_operators` |
| `/ops/health` |  | `/api/ops/health` | `users`, `superadmins`, `ops_operators` |
| `/ops/marketing` |  | `/api/ops/marketing` | `users`, `superadmins`, `ops_operators` |
| `/ops/operators` |  | `/api/ops/operators`, `/api/ops/territories` | `users`, `superadmins`, `ops_operators` |
| `/ops/partners` |  | `/api/ops/partners` | `users`, `superadmins`, `ops_operators` |
| `/ops/people` |  | `/api/ops/schools`, `/api/ops/people`, `/api/ops/schools/[id]/people/[userId]` | `users`, `superadmins`, `ops_operators` |
| `/ops/pipeline` |  | `/api/ops/pipeline`, `/api/ops/pipeline/[id]` | `users`, `superadmins`, `ops_operators` |
| `/ops/pipeline/[id]` |  | `/api/ops/pipeline/[id]`, `/api/ops/marketing`, `/api/ops/schools/[id]/settings` | `users`, `superadmins`, `ops_operators` |
| `/ops/pipeline/settings` |  | `/api/ops/pipeline/settings` | `users`, `superadmins`, `ops_operators` |
| `/ops/quality` |  | `/api/ops/qa` | `users`, `superadmins`, `ops_operators` |
| `/ops/requests` |  | `/api/ops/requests` | `users`, `superadmins`, `ops_operators` |
| `/ops/schools` |  | `/api/ops/schools`, `/api/platform/public` | `users`, `superadmins`, `ops_operators` |
| `/ops/schools/[schoolId]` |  | `/api/ops/schools/[id]`, `/api/ops/schools/[id]/account`, `/api/ops/schools/[id]/import`, `/api/ops/schools/[id]/import/[jobId]`, `/api/ops/schools/[id]/access`, `/api/ops/schools/[id]/support`, `/api/ops/schools/[id]/subjects`, `/api/ops/schools/[id]/people/[userId]`, `/api/ops/schools/[id]/classes`, `/api/ops/schools/[id]/people`, `/api/ops/schools/[id]/inspect`, `/api/ops/schools/[id]/controls`, `/api/ops/schools/[id]/crm`, `/api/ops/schools/[id]/settings` | `users`, `superadmins`, `ops_operators` |
| `/ops/settings` |  | `/api/ops/settings` | `users`, `superadmins`, `ops_operators` |
| `/ops/tasks` |  | `/api/ops/tasks` | `users`, `superadmins`, `ops_operators` |
| `/ops/territories` |  | `/api/ops/territories` |  |
| `/ops/traffic` |  | `/api/ops/traffic` | `users`, `superadmins`, `ops_operators` |
| `/ops/usage` |  | `/api/ops/usage` | `users`, `superadmins`, `ops_operators` |
| `/parent` |  | `/api/portal/year-end` |  |
| `/parent (layout)` | yes | `/api/parent/desk`, `/api/platform/public` | `notifications` |
| `/parent/ask` |  | `/api/parent/ask`, `/api/parent/messages` |  |
| `/parent/attendance` |  |  |  |
| `/parent/conduct` |  | `/api/parent/conduct` |  |
| `/parent/consent` |  |  |  |
| `/parent/documents` |  | `/api/parent/documents` |  |
| `/parent/family` |  | `/api/parent/family` |  |
| `/parent/fees` |  |  |  |
| `/parent/health` |  | `/api/parent/health` |  |
| `/parent/kirti` |  | `/api/parent/kirti` |  |
| `/parent/mastery` |  |  |  |
| `/parent/messages` |  | `/api/parent/messages` |  |
| `/parent/milestones` |  |  |  |
| `/parent/progress` |  |  |  |
| `/parent/results` |  | `/api/me/report-cards` |  |
| `/parent/schoolwork` |  |  |  |
| `/parent/sensitization` |  |  |  |
| `/parent/settings` |  | `/api/parent/whatsapp`, `/api/whatsapp/simulate` |  |
| `/parent/timeline` |  | `/api/timeline` |  |
| `/parent/wellness` |  |  |  |
| `/student` |  | `/api/portal/year-end` |  |
| `/student (layout)` | yes | `/api/platform/public` | `notifications`, `wellness_logs`, `consents`, `submissions`, `tutor_sessions`, `tml_scores`, `assignments_student` |
| `/student/homework` | yes |  |  |
| `/student/homework (layout)` |  |  |  |
| `/student/homework/[id]` | yes | `/api/student/proctor-alert`, `/api/student/upload-submission`, `/api/student/submit-typed`, `/api/homework/grade`, `/api/grading/pages`, `/api/student/work` | `assignments_student`, `submissions` |
| `/student/kirti` |  | `/api/student/kirti` |  |
| `/student/mastery` | yes | `/api/tml/compute` |  |
| `/student/mastery (layout)` |  |  |  |
| `/student/results` | yes | `/api/me/report-cards` |  |
| `/student/timeline` | yes | `/api/timeline` |  |
| `/student/tutor` | yes | `/api/tutor/session`, `/api/student/subjects`, `/api/student/exam-track` |  |
| `/student/tutor (layout)` |  |  |  |
| `/student/videos` | yes |  | `materials` |
| `/student/wellness` | yes |  |  |
| `/student/wellness (layout)` |  |  |  |
| `/teacher` |  |  |  |
| `/teacher (layout)` | yes | `/api/platform/public`, `/api/errors` | `notifications`, `users`, `assignments`, `submissions`, `tml_scores`, `proctor_alerts`, `submission_items` |
| `/teacher/ai-assistant` |  | `/api/teacher/copilot`, `/api/teacher/lessons`, `/api/teacher/copilot/image` |  |
| `/teacher/ask` |  | `/api/staff/ask`, `/api/staff/whatsapp`, `/api/whatsapp/simulate`, `/api/staff/messages`, `/api/feed` |  |
| `/teacher/assignments` |  |  |  |
| `/teacher/attendance` |  | `/api/teacher/attendance`, `/api/teacher/health-alerts` | `attendance`, `academic_events`, `bell_schedules`, `sched_wings`, `schools` |
| `/teacher/conduct` |  | `/api/teacher/conduct` |  |
| `/teacher/exams` |  | `/api/teacher/exams` |  |
| `/teacher/feed` |  | `/api/staff/incidents`, `/api/feed` | `users`, `incidents`, `situations` |
| `/teacher/grading` |  |  |  |
| `/teacher/heatmap` |  |  |  |
| `/teacher/homework` |  | `/api/teacher/assignments`, `/api/teacher/capture`, `/api/grading/pages`, `/api/teacher/review-submission`, `/api/teacher/submissions`, `/api/teacher/quiz-gen`, `/api/teacher/homework-gen` |  |
| `/teacher/kirti` |  | `/api/teacher/kirti` |  |
| `/teacher/lab` |  | `/api/teacher/lab` | `lab_scenes`, `lab_runs` |
| `/teacher/lab/build` |  | `/api/teacher/lab` | `lesson_plans` |
| `/teacher/lab/practicals` |  | `/api/teacher/practicals`, `/api/teacher/exams` | `practical_assessment`, `practical_progress` |
| `/teacher/lab/practicals/[id]` |  |  |  |
| `/teacher/lab/present` |  | `/api/teacher/lab/runs` |  |
| `/teacher/leave` |  | `/api/teacher/leave` | `leave_policies`, `comp_off_grants`, `leave_requests` |
| `/teacher/mastery` |  |  |  |
| `/teacher/messages` |  | `/api/staff/messages` |  |
| `/teacher/outcomes` |  | `/api/teacher/outcomes` |  |
| `/teacher/quiz` |  | `/api/teacher/assignments`, `/api/teacher/capture`, `/api/grading/pages`, `/api/teacher/review-submission`, `/api/teacher/submissions`, `/api/teacher/quiz-gen`, `/api/teacher/homework-gen` |  |
| `/teacher/record` |  | `/api/me/payslips`, `/api/me/employee` |  |
| `/teacher/schedule` |  | `/api/teacher/cover`, `/api/me/attendance` | `attendance_settings`, `shifts`, `staff_shift_plans`, `shift_overrides`, `staff_punches`, `staff_day_marks`, `leave_requests`, `staff_absences`, `academic_events`, `bell_schedules`, `users`, `staff_members`, `attendance_devices`, `attendance_month_reviews`, `schools`, `sched_wings`, `bell_periods`, `rooms`, `timetable_versions`, `cover_assignments`, `duty_posts`, `duty_roster`, `duty_assignments`, `visit_sessions`, `comp_off_grants`, `timetable_slots` |
| `/teacher/syllabus` |  | `/api/teacher/lessons`, `/api/teacher/lessons/draft`, `/api/teacher/course` | `lab_scenes`, `course_plans`, `syllabus_progress`, `lesson_plans`, `assignments` |
| `/teacher/timeline` |  | `/api/teacher/conduct`, `/api/timeline` |  |
| `/teacher/wellness` | yes | `/api/teacher/acknowledge-situation` | `users` |
| `/terms` |  |  |  |
| `/tml-whitepaper` | yes |  |  |
| `/trial-expired` | yes |  |  |
| `/verify/[token]` |  |  | `certificates`, `schools`, `certificate_types` |
