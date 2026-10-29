# Data model

> Generated 2026-10-29 from the code on this branch and the 18 migrations in `supabase/migrations/` (replayed into a scratch Postgres 16 with Supabase stubs). Every table and view by domain: columns, keys, row-level security, grants to the API roles, triggers, and who reads or writes it (API routes through the service role, pages directly through RLS, SQL functions). Do not hand-edit; see [../README.md](../README.md#how-this-was-produced).

## Contents

- [Tenancy, identity & access](#tenancy-identity-access) (11)
- [Living Record: student spine](#living-record-student-spine) (8)
- [Living Record: health & documents](#living-record-health-documents) (7)
- [Co-curricular (Kirti)](#co-curricular-kirti) (6)
- [Conduct, wellbeing & safeguarding](#conduct-wellbeing-safeguarding) (10)
- [Curriculum & teaching plan](#curriculum-teaching-plan) (11)
- [Assignments, grading & TML](#assignments-grading-tml) (6)
- [AI tutor](#ai-tutor) (5)
- [Live Lab & practicals](#live-lab-practicals) (4)
- [Exams & report cards](#exams-report-cards) (9)
- [Student attendance](#student-attendance) (1)
- [Admissions](#admissions) (6)
- [Fees](#fees) (6)
- [Scheduling & timetable](#scheduling-timetable) (15)
- [HR & staff attendance](#hr-staff-attendance) (25)
- [Payroll](#payroll) (13)
- [Messaging, notifications & WhatsApp](#messaging-notifications-whatsapp) (5)
- [Compliance](#compliance) (1)
- [Bulk import](#bulk-import) (2)
- [Platform Manager (Sthara ops)](#platform-manager-sthara-ops) (31)
- [Observability & metering](#observability-metering) (4)
- [Sandbox seed schema](#sandbox-seed-schema) (2)

## Summary

| Domain | Table | RLS | Policies | Triggers | Written by routes | Read directly by pages |
|---|---|---|---|---|---|---|
| Tenancy, identity & access | [`schools`](#table-schools) | on | 2 | 3 | 8 | 7 |
| Tenancy, identity & access | [`users`](#table-users) | on | 2 | 8 | 15 | 34 |
| Tenancy, identity & access | [`superadmins`](#table-superadmins) | on | 1 | 1 | 0 | 25 |
| Tenancy, identity & access | [`role_grants`](#table-role-grants) | on | 1 | 2 | 1 | 1 |
| Tenancy, identity & access | [`role_permissions`](#table-role-permissions) | on | 1 | 0 | 0 | 0 |
| Tenancy, identity & access | [`guardians`](#table-guardians) | on | 2 | 2 | 3 | 1 |
| Tenancy, identity & access | [`consents`](#table-consents) | on | 1 | 3 | 0 | 2 |
| Tenancy, identity & access | [`account_requests`](#table-account-requests) | on | 1 | 0 | 3 | 2 |
| Tenancy, identity & access | [`platform_config`](#table-platform-config) | on | 0 | 0 | 1 | 0 |
| Tenancy, identity & access | [`settings_changes`](#table-settings-changes) | on | 0 | 1 | 5 | 0 |
| Tenancy, identity & access | [`audit_log`](#table-audit-log) | on | 1 | 0 | 51 | 1 |
| Living Record: student spine | [`students`](#table-students) | on | 1 | 4 | 6 | 0 |
| Living Record: student spine | [`student_changes`](#table-student-changes) | on | 1 | 0 | 4 | 0 |
| Living Record: student spine | [`enrolments`](#table-enrolments) | on | 1 | 3 | 5 | 0 |
| Living Record: student spine | [`family_members`](#table-family-members) | on | 1 | 3 | 9 | 0 |
| Living Record: student spine | [`emergency_contacts`](#table-emergency-contacts) | on | 1 | 2 | 3 | 0 |
| Living Record: student spine | [`sibling_links`](#table-sibling-links) | on | 1 | 2 | 1 | 0 |
| Living Record: student spine | [`student_change_requests`](#table-student-change-requests) | on | 1 | 2 | 5 | 0 |
| Living Record: student spine | [`legacy_results`](#table-legacy-results) | on | 1 | 2 | 0 | 0 |
| Living Record: health & documents | [`student_health`](#table-student-health) | on | 1 | 3 | 3 | 0 |
| Living Record: health & documents | [`health_events`](#table-health-events) | on | 1 | 3 | 1 | 0 |
| Living Record: health & documents | [`student_documents`](#table-student-documents) | on | 0 | 2 | 7 | 0 |
| Living Record: health & documents | [`certificates`](#table-certificates) | on | 0 | 3 | 1 | 1 |
| Living Record: health & documents | [`certificate_settings`](#table-certificate-settings) | on | 0 | 2 | 1 | 0 |
| Living Record: health & documents | [`certificate_types`](#table-certificate-types) | on | 0 | 2 | 6 | 1 |
| Living Record: health & documents | [`doc_counters`](#table-doc-counters) | on | 0 | 0 | 12 | 0 |
| Co-curricular (Kirti) | [`houses`](#table-houses) | on | 0 | 2 | 1 | 0 |
| Co-curricular (Kirti) | [`house_members`](#table-house-members) | on | 0 | 2 | 6 | 0 |
| Co-curricular (Kirti) | [`house_points`](#table-house-points) | on | 0 | 2 | 2 | 0 |
| Co-curricular (Kirti) | [`cc_groups`](#table-cc-groups) | on | 0 | 2 | 1 | 0 |
| Co-curricular (Kirti) | [`cc_memberships`](#table-cc-memberships) | on | 0 | 2 | 2 | 0 |
| Co-curricular (Kirti) | [`kirti_entries`](#table-kirti-entries) | on | 0 | 2 | 2 | 0 |
| Conduct, wellbeing & safeguarding | [`discipline_actions`](#table-discipline-actions) | on | 0 | 2 | 2 | 0 |
| Conduct, wellbeing & safeguarding | [`counselling_cases`](#table-counselling-cases) | on | 0 | 2 | 1 | 0 |
| Conduct, wellbeing & safeguarding | [`counselling_sessions`](#table-counselling-sessions) | on | 0 | 2 | 1 | 0 |
| Conduct, wellbeing & safeguarding | [`counselling_referrals`](#table-counselling-referrals) | on | 0 | 2 | 3 | 0 |
| Conduct, wellbeing & safeguarding | [`safeguarding_log`](#table-safeguarding-log) | on | 0 | 1 | 1 | 0 |
| Conduct, wellbeing & safeguarding | [`incidents`](#table-incidents) | on | 1 | 2 | 2 | 2 |
| Conduct, wellbeing & safeguarding | [`wellness_logs`](#table-wellness-logs) | on | 4 | 2 | 1 | 1 |
| Conduct, wellbeing & safeguarding | [`situations`](#table-situations) | on | 1 | 1 | 14 | 2 |
| Conduct, wellbeing & safeguarding | [`proctor_alerts`](#table-proctor-alerts) | on | 1 | 0 | 1 | 2 |
| Conduct, wellbeing & safeguarding | [`probe_acks`](#table-probe-acks) | on | 1 | 1 | 1 | 1 |
| Curriculum & teaching plan | [`classes`](#table-classes) | on | 2 | 1 | 2 | 2 |
| Curriculum & teaching plan | [`class_subjects`](#table-class-subjects) | on | 1 | 3 | 2 | 0 |
| Curriculum & teaching plan | [`student_subjects`](#table-student-subjects) | on | 1 | 2 | 2 | 0 |
| Curriculum & teaching plan | [`teacher_subjects`](#table-teacher-subjects) | on | 1 | 3 | 5 | 0 |
| Curriculum & teaching plan | [`subject_leads`](#table-subject-leads) | on | 1 | 2 | 2 | 0 |
| Curriculum & teaching plan | [`syllabus`](#table-syllabus) | on | 2 | 0 | 6 | 0 |
| Curriculum & teaching plan | [`syllabus_progress`](#table-syllabus-progress) | on | 1 | 1 | 8 | 1 |
| Curriculum & teaching plan | [`course_plans`](#table-course-plans) | on | 1 | 1 | 8 | 1 |
| Curriculum & teaching plan | [`lesson_plans`](#table-lesson-plans) | on | 1 | 1 | 7 | 3 |
| Curriculum & teaching plan | [`learning_outcomes`](#table-learning-outcomes) | on | 2 | 0 | 0 | 0 |
| Curriculum & teaching plan | [`materials`](#table-materials) | on | 2 | 0 | 6 | 1 |
| Assignments, grading & TML | [`assignments`](#table-assignments) | on | 4 | 1 | 7 | 4 |
| Assignments, grading & TML | [`assignments_student`](#table-assignments-student) | view | 0 | 0 | 0 | 2 |
| Assignments, grading & TML | [`submissions`](#table-submissions) | on | 1 | 2 | 5 | 4 |
| Assignments, grading & TML | [`submission_items`](#table-submission-items) | on | 1 | 0 | 5 | 1 |
| Assignments, grading & TML | [`tml_scores`](#table-tml-scores) | on | 1 | 0 | 11 | 3 |
| Assignments, grading & TML | [`engagement_scores`](#table-engagement-scores) | on | 1 | 0 | 0 | 0 |
| AI tutor | [`tutor_sessions`](#table-tutor-sessions) | on | 1 | 0 | 7 | 1 |
| AI tutor | [`tutor_session_turns`](#table-tutor-session-turns) | on | 0 | 0 | 1 | 0 |
| AI tutor | [`tutor_guard_events`](#table-tutor-guard-events) | on | 1 | 0 | 1 | 0 |
| AI tutor | [`student_chats`](#table-student-chats) | on | 1 | 0 | 0 | 0 |
| AI tutor | [`student_memory`](#table-student-memory) | on | 1 | 0 | 0 | 0 |
| Live Lab & practicals | [`lab_scenes`](#table-lab-scenes) | on | 1 | 0 | 1 | 2 |
| Live Lab & practicals | [`lab_runs`](#table-lab-runs) | on | 1 | 0 | 1 | 1 |
| Live Lab & practicals | [`practical_assessment`](#table-practical-assessment) | on | 1 | 0 | 1 | 1 |
| Live Lab & practicals | [`practical_progress`](#table-practical-progress) | on | 1 | 0 | 1 | 1 |
| Exams & report cards | [`exam_schemes`](#table-exam-schemes) | on | 0 | 3 | 1 | 0 |
| Exams & report cards | [`exam_terms`](#table-exam-terms) | on | 0 | 2 | 1 | 0 |
| Exams & report cards | [`exam_assessments`](#table-exam-assessments) | on | 0 | 2 | 1 | 0 |
| Exams & report cards | [`exam_sheets`](#table-exam-sheets) | on | 0 | 2 | 2 | 0 |
| Exams & report cards | [`exam_marks`](#table-exam-marks) | on | 0 | 2 | 2 | 0 |
| Exams & report cards | [`exam_class_terms`](#table-exam-class-terms) | on | 0 | 2 | 2 | 0 |
| Exams & report cards | [`exam_student_terms`](#table-exam-student-terms) | on | 0 | 2 | 1 | 0 |
| Exams & report cards | [`report_cards`](#table-report-cards) | on | 0 | 1 | 1 | 0 |
| Exams & report cards | [`report_card_settings`](#table-report-card-settings) | on | 0 | 1 | 1 | 0 |
| Student attendance | [`attendance`](#table-attendance) | on | 1 | 2 | 3 | 3 |
| Admissions | [`admission_applicants`](#table-admission-applicants) | on | 1 | 3 | 4 | 1 |
| Admissions | [`admission_events`](#table-admission-events) | on | 1 | 0 | 4 | 1 |
| Admissions | [`admission_stages`](#table-admission-stages) | on | 1 | 2 | 2 | 1 |
| Admissions | [`admission_seats`](#table-admission-seats) | on | 1 | 2 | 1 | 1 |
| Admissions | [`admission_offers`](#table-admission-offers) | on | 1 | 2 | 4 | 1 |
| Admissions | [`admission_documents`](#table-admission-documents) | on | 0 | 2 | 2 | 0 |
| Fees | [`fee_structures`](#table-fee-structures) | on | 1 | 2 | 1 | 1 |
| Fees | [`fee_invoices`](#table-fee-invoices) | on | 1 | 2 | 2 | 1 |
| Fees | [`fee_payments`](#table-fee-payments) | on | 1 | 2 | 6 | 1 |
| Fees | [`fee_reminders`](#table-fee-reminders) | on | 1 | 1 | 1 | 1 |
| Fees | [`fee_concession_requests`](#table-fee-concession-requests) | on | 1 | 1 | 1 | 1 |
| Fees | [`fee_day_closes`](#table-fee-day-closes) | on | 1 | 1 | 1 | 1 |
| Scheduling & timetable | [`sched_wings`](#table-sched-wings) | on | 1 | 0 | 2 | 4 |
| Scheduling & timetable | [`bell_schedules`](#table-bell-schedules) | on | 1 | 0 | 1 | 4 |
| Scheduling & timetable | [`bell_periods`](#table-bell-periods) | on | 1 | 0 | 1 | 2 |
| Scheduling & timetable | [`rooms`](#table-rooms) | on | 1 | 0 | 2 | 2 |
| Scheduling & timetable | [`academic_events`](#table-academic-events) | on | 1 | 1 | 2 | 4 |
| Scheduling & timetable | [`timetable_versions`](#table-timetable-versions) | on | 1 | 1 | 2 | 3 |
| Scheduling & timetable | [`timetable_slots`](#table-timetable-slots) | on | 1 | 2 | 10 | 3 |
| Scheduling & timetable | [`sched_requirements`](#table-sched-requirements) | on | 1 | 0 | 8 | 1 |
| Scheduling & timetable | [`sched_solver_settings`](#table-sched-solver-settings) | on | 1 | 0 | 1 | 1 |
| Scheduling & timetable | [`teacher_load_rules`](#table-teacher-load-rules) | on | 1 | 0 | 1 | 1 |
| Scheduling & timetable | [`cover_assignments`](#table-cover-assignments) | on | 1 | 1 | 9 | 2 |
| Scheduling & timetable | [`duty_posts`](#table-duty-posts) | on | 1 | 0 | 1 | 2 |
| Scheduling & timetable | [`duty_roster`](#table-duty-roster) | on | 1 | 0 | 1 | 2 |
| Scheduling & timetable | [`duty_assignments`](#table-duty-assignments) | on | 1 | 0 | 1 | 2 |
| Scheduling & timetable | [`visit_sessions`](#table-visit-sessions) | on | 1 | 1 | 7 | 2 |
| HR & staff attendance | [`staff_members`](#table-staff-members) | on | 1 | 2 | 8 | 3 |
| HR & staff attendance | [`staff_jobs`](#table-staff-jobs) | on | 0 | 2 | 3 | 0 |
| HR & staff attendance | [`staff_profiles`](#table-staff-profiles) | on | 0 | 2 | 2 | 0 |
| HR & staff attendance | [`staff_statutory`](#table-staff-statutory) | on | 0 | 2 | 2 | 0 |
| HR & staff attendance | [`staff_qualifications`](#table-staff-qualifications) | on | 0 | 0 | 2 | 0 |
| HR & staff attendance | [`staff_documents`](#table-staff-documents) | on | 0 | 1 | 2 | 0 |
| HR & staff attendance | [`staff_events`](#table-staff-events) | on | 0 | 0 | 1 | 0 |
| HR & staff attendance | [`staff_exits`](#table-staff-exits) | on | 0 | 1 | 1 | 0 |
| HR & staff attendance | [`hr_departments`](#table-hr-departments) | on | 0 | 1 | 3 | 0 |
| HR & staff attendance | [`hr_grades`](#table-hr-grades) | on | 0 | 2 | 3 | 0 |
| HR & staff attendance | [`hr_posts`](#table-hr-posts) | on | 0 | 2 | 2 | 0 |
| HR & staff attendance | [`hr_settings`](#table-hr-settings) | on | 0 | 1 | 2 | 0 |
| HR & staff attendance | [`leave_policies`](#table-leave-policies) | on | 1 | 2 | 1 | 2 |
| HR & staff attendance | [`leave_requests`](#table-leave-requests) | on | 1 | 2 | 6 | 4 |
| HR & staff attendance | [`comp_off_grants`](#table-comp-off-grants) | on | 1 | 1 | 1 | 3 |
| HR & staff attendance | [`staff_absences`](#table-staff-absences) | on | 1 | 1 | 3 | 2 |
| HR & staff attendance | [`attendance_settings`](#table-attendance-settings) | on | 1 | 1 | 1 | 2 |
| HR & staff attendance | [`attendance_devices`](#table-attendance-devices) | on | 1 | 0 | 2 | 2 |
| HR & staff attendance | [`attendance_month_reviews`](#table-attendance-month-reviews) | on | 1 | 1 | 1 | 2 |
| HR & staff attendance | [`shifts`](#table-shifts) | on | 1 | 0 | 1 | 2 |
| HR & staff attendance | [`staff_shift_plans`](#table-staff-shift-plans) | on | 1 | 1 | 1 | 2 |
| HR & staff attendance | [`shift_overrides`](#table-shift-overrides) | on | 1 | 0 | 1 | 2 |
| HR & staff attendance | [`staff_punches`](#table-staff-punches) | on | 1 | 0 | 5 | 2 |
| HR & staff attendance | [`staff_day_marks`](#table-staff-day-marks) | on | 1 | 1 | 1 | 2 |
| HR & staff attendance | [`staff_noshow_alerts`](#table-staff-noshow-alerts) | on | 0 | 0 | 2 | 0 |
| Payroll | [`pay_items`](#table-pay-items) | on | 0 | 2 | 1 | 0 |
| Payroll | [`pay_runs`](#table-pay-runs) | on | 0 | 2 | 1 | 0 |
| Payroll | [`pay_run_lines`](#table-pay-run-lines) | on | 0 | 1 | 1 | 0 |
| Payroll | [`pay_adjustments`](#table-pay-adjustments) | on | 0 | 1 | 1 | 0 |
| Payroll | [`payroll_settings`](#table-payroll-settings) | on | 0 | 2 | 1 | 0 |
| Payroll | [`salary_templates`](#table-salary-templates) | on | 0 | 1 | 1 | 0 |
| Payroll | [`staff_salaries`](#table-staff-salaries) | on | 0 | 1 | 1 | 0 |
| Payroll | [`staff_pay_settings`](#table-staff-pay-settings) | on | 0 | 2 | 1 | 0 |
| Payroll | [`staff_loans`](#table-staff-loans) | on | 0 | 1 | 2 | 0 |
| Payroll | [`loan_recoveries`](#table-loan-recoveries) | on | 0 | 0 | 1 | 0 |
| Payroll | [`statutory_rates`](#table-statutory-rates) | on | 0 | 0 | 0 | 0 |
| Payroll | [`statutory_overrides`](#table-statutory-overrides) | on | 0 | 1 | 1 | 0 |
| Payroll | [`tax_declarations`](#table-tax-declarations) | on | 0 | 1 | 1 | 0 |
| Messaging, notifications & WhatsApp | [`notifications`](#table-notifications) | on | 2 | 1 | 34 | 5 |
| Messaging, notifications & WhatsApp | [`school_threads`](#table-school-threads) | on | 1 | 0 | 10 | 0 |
| Messaging, notifications & WhatsApp | [`school_messages`](#table-school-messages) | on | 1 | 0 | 4 | 0 |
| Messaging, notifications & WhatsApp | [`whatsapp_links`](#table-whatsapp-links) | on | 0 | 0 | 4 | 0 |
| Messaging, notifications & WhatsApp | [`whatsapp_log`](#table-whatsapp-log) | on | 1 | 0 | 25 | 0 |
| Compliance | [`school_filings`](#table-school-filings) | on | 1 | 2 | 1 | 1 |
| Bulk import | [`import_jobs`](#table-import-jobs) | on | 1 | 1 | 5 | 0 |
| Bulk import | [`import_changes`](#table-import-changes) | on | 0 | 0 | 5 | 0 |
| Platform Manager (Sthara ops) | [`ops_operators`](#table-ops-operators) | on | 0 | 1 | 1 | 25 |
| Platform Manager (Sthara ops) | [`ops_territories`](#table-ops-territories) | on | 0 | 0 | 2 | 0 |
| Platform Manager (Sthara ops) | [`ops_territory_members`](#table-ops-territory-members) | on | 0 | 0 | 1 | 0 |
| Platform Manager (Sthara ops) | [`ops_accounts`](#table-ops-accounts) | on | 0 | 0 | 3 | 0 |
| Platform Manager (Sthara ops) | [`ops_contacts`](#table-ops-contacts) | on | 0 | 0 | 1 | 0 |
| Platform Manager (Sthara ops) | [`ops_activities`](#table-ops-activities) | on | 0 | 0 | 1 | 0 |
| Platform Manager (Sthara ops) | [`ops_tasks`](#table-ops-tasks) | on | 0 | 0 | 3 | 0 |
| Platform Manager (Sthara ops) | [`ops_documents`](#table-ops-documents) | on | 0 | 0 | 1 | 0 |
| Platform Manager (Sthara ops) | [`ops_cases`](#table-ops-cases) | on | 0 | 0 | 3 | 0 |
| Platform Manager (Sthara ops) | [`ops_case_messages`](#table-ops-case-messages) | on | 0 | 1 | 3 | 0 |
| Platform Manager (Sthara ops) | [`ops_case_links`](#table-ops-case-links) | on | 0 | 0 | 1 | 0 |
| Platform Manager (Sthara ops) | [`ops_canned_replies`](#table-ops-canned-replies) | on | 0 | 0 | 1 | 0 |
| Platform Manager (Sthara ops) | [`ops_sla_policies`](#table-ops-sla-policies) | on | 0 | 0 | 1 | 0 |
| Platform Manager (Sthara ops) | [`ops_picklists`](#table-ops-picklists) | on | 0 | 0 | 2 | 0 |
| Platform Manager (Sthara ops) | [`ops_opportunities`](#table-ops-opportunities) | on | 0 | 0 | 2 | 0 |
| Platform Manager (Sthara ops) | [`ops_opportunity_events`](#table-ops-opportunity-events) | on | 0 | 0 | 2 | 0 |
| Platform Manager (Sthara ops) | [`ops_opportunity_stages`](#table-ops-opportunity-stages) | on | 0 | 0 | 1 | 0 |
| Platform Manager (Sthara ops) | [`ops_quotes`](#table-ops-quotes) | on | 0 | 1 | 1 | 0 |
| Platform Manager (Sthara ops) | [`ops_quote_approvals`](#table-ops-quote-approvals) | on | 0 | 0 | 1 | 0 |
| Platform Manager (Sthara ops) | [`ops_discount_limits`](#table-ops-discount-limits) | on | 0 | 0 | 1 | 0 |
| Platform Manager (Sthara ops) | [`ops_partners`](#table-ops-partners) | on | 0 | 0 | 1 | 0 |
| Platform Manager (Sthara ops) | [`ops_commission_rules`](#table-ops-commission-rules) | on | 0 | 0 | 1 | 0 |
| Platform Manager (Sthara ops) | [`ops_commissions`](#table-ops-commissions) | on | 0 | 1 | 2 | 0 |
| Platform Manager (Sthara ops) | [`ops_campaigns`](#table-ops-campaigns) | on | 0 | 0 | 1 | 0 |
| Platform Manager (Sthara ops) | [`ops_marketing_spend`](#table-ops-marketing-spend) | on | 0 | 0 | 1 | 0 |
| Platform Manager (Sthara ops) | [`enquiries`](#table-enquiries) | on | 0 | 1 | 4 | 0 |
| Platform Manager (Sthara ops) | [`ops_access_grants`](#table-ops-access-grants) | on | 0 | 1 | 1 | 0 |
| Platform Manager (Sthara ops) | [`ops_access_events`](#table-ops-access-events) | on | 0 | 0 | 3 | 0 |
| Platform Manager (Sthara ops) | [`ops_job_runs`](#table-ops-job-runs) | on | 0 | 0 | 1 | 0 |
| Platform Manager (Sthara ops) | [`qa_runs`](#table-qa-runs) | on | 0 | 0 | 3 | 0 |
| Platform Manager (Sthara ops) | [`qa_upload_tokens`](#table-qa-upload-tokens) | on | 0 | 0 | 3 | 0 |
| Observability & metering | [`app_errors`](#table-app-errors) | on | 0 | 0 | 0 | 0 |
| Observability & metering | [`app_error_groups`](#table-app-error-groups) | on | 0 | 0 | 1 | 0 |
| Observability & metering | [`request_log`](#table-request-log) | on | 0 | 0 | 0 | 0 |
| Observability & metering | [`ai_usage`](#table-ai-usage) | on | 0 | 0 | 0 | 0 |
| Sandbox seed schema | [`sandbox_seed.chapters`](#table-sandbox-seed-chapters) | **off** | 0 | 0 | 0 | 0 |
| Sandbox seed schema | [`sandbox_seed.notes`](#table-sandbox-seed-notes) | **off** | 0 | 0 | 0 | 0 |

## Tenancy, identity & access

### Table schools

- **Kind:** table
- **Row-level security:** enabled, 2 policies
- **Grants:** `authenticated` delete/insert/references/select/trigger/update; `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **Referenced by:** `academic_events`, `account_requests`, `admission_applicants`, `admission_documents`, `admission_events`, `admission_offers`, `admission_seats`, `admission_stages`, `ai_usage`, `app_errors`, `assignments`, `attendance`, `attendance_devices`, `attendance_month_reviews`, `attendance_settings`, `bell_periods`, `bell_schedules`, `cc_groups`, `cc_memberships`, `certificate_settings`, `certificate_types`, `certificates`, `class_subjects`, `classes`, `comp_off_grants`, `consents`, `counselling_cases`, `counselling_referrals`, `counselling_sessions`, `course_plans`, `cover_assignments`, `discipline_actions`, `doc_counters`, `duty_assignments`, `duty_posts`, `duty_roster`, `emergency_contacts`, `engagement_scores`, `enrolments`, `exam_assessments`, `exam_class_terms`, `exam_marks`, `exam_schemes`, `exam_sheets`, `exam_student_terms`, `exam_terms`, `family_members`, `fee_concession_requests`, `fee_day_closes`, `fee_invoices`, `fee_payments`, `fee_reminders`, `fee_structures`, `health_events`, `house_members`, `house_points`, `houses`, `hr_departments`, `hr_grades`, `hr_posts`, `hr_settings`, `import_jobs`, `incidents`, `kirti_entries`, `lab_runs`, `lab_scenes`, `leave_policies`, `leave_requests`, `legacy_results`, `lesson_plans`, `loan_recoveries`, `materials`, `notifications`, `ops_access_grants`, `ops_accounts`, `ops_activities`, `ops_cases`, `ops_commissions`, `ops_contacts`, `ops_documents`, `ops_marketing_spend`, `ops_opportunities`, `ops_tasks`, `pay_adjustments`, `pay_items`, `pay_run_lines`, `pay_runs`, `payroll_settings`, `practical_assessment`, `practical_progress`, `probe_acks`, `proctor_alerts`, `report_card_settings`, `report_cards`, `role_grants`, `rooms`, `safeguarding_log`, `salary_templates`, `sched_requirements`, `sched_solver_settings`, `sched_wings`, `school_filings`, `school_messages`, `school_threads`, `shift_overrides`, `shifts`, `sibling_links`, `situations`, `staff_absences`, `staff_day_marks`, `staff_documents`, `staff_events`, `staff_exits`, `staff_jobs`, `staff_loans`, `staff_members`, `staff_noshow_alerts`, `staff_pay_settings`, `staff_profiles`, `staff_punches`, `staff_qualifications`, `staff_salaries`, `staff_shift_plans`, `staff_statutory`, `statutory_overrides`, `student_change_requests`, `student_changes`, `student_documents`, `student_health`, `student_subjects`, `students`, `subject_leads`, `submission_items`, `submissions`, `syllabus`, `syllabus_progress`, `tax_declarations`, `teacher_load_rules`, `teacher_subjects`, `timetable_slots`, `timetable_versions`, `tml_scores`, `tutor_guard_events`, `tutor_sessions`, `users`, `visit_sessions`, `wellness_logs`, `whatsapp_links`, `whatsapp_log`
- **Written by routes:** `/api/admin/admissions/setup` (select/update), `/api/admin/cocurricular` (select/update), `/api/admin/health` (select/update; in SQL: select), `/api/admin/students/settings` (select/update; in SQL: select), `/api/ops/schools` (select/insert; in SQL: select), `/api/ops/schools/[id]` (select; in SQL: select/delete), `/api/ops/schools/[id]/controls` (select; in SQL: select/update), `/api/ops/schools/[id]/settings` (select; in SQL: select/update)
- **Read by routes:** `/api/admin/access`, `/api/admin/account-requests`, `/api/admin/admissions`, `/api/admin/admissions/application`, `/api/admin/admissions/documents`, `/api/admin/admissions/enrol`, `/api/admin/admissions/offers`, `/api/admin/attendance`, `/api/admin/certificates`, `/api/admin/counselling`, `/api/admin/delete-user`, `/api/admin/discipline`, `/api/admin/exams`, `/api/admin/fees`, `/api/admin/filings`, `/api/admin/heatmap-data`, `/api/admin/import`, `/api/admin/import/[id]`, `/api/admin/leave`, `/api/admin/leave-policy`, `/api/admin/payroll`, `/api/admin/payroll/export`, `/api/admin/payroll/run`, `/api/admin/people`, `/api/admin/people/documents`, `/api/admin/people/import`, `/api/admin/people/structure`, `/api/admin/probe`, `/api/admin/safeguarding`, `/api/admin/schedule/calendar`, `/api/admin/schedule/compoff`, `/api/admin/schedule/cover`, `/api/admin/schedule/duties`, `/api/admin/schedule/setup`, `/api/admin/schedule/solver`, `/api/admin/schedule/staff`, `/api/admin/schedule/timetable`, `/api/admin/schedule/visits`, `/api/admin/students`, `/api/admin/students/[id]`, `/api/admin/students/[id]/documents`, `/api/admin/students/[id]/health`, `/api/admin/students/applicants`, `/api/admin/students/requests`, `/api/admin/students/siblings`, `/api/admin/students/year`, `/api/admin/subjects`, `/api/admin/support`, `/api/admin/users`, `/api/admin/users/assignments`, `/api/auth/verify-school`, `/api/feed`, `/api/grading/pages`, `/api/health`, `/api/homework/grade`, `/api/import/worker`, `/api/me/attendance`, `/api/me/employee`, `/api/me/payslips`, `/api/me/report-cards`, `/api/ops/delivery`, `/api/ops/desk`, `/api/ops/desk/[id]`, `/api/ops/errors`, `/api/ops/health`, `/api/ops/marketing`, `/api/ops/overview`, `/api/ops/partners`, `/api/ops/people`, `/api/ops/pipeline`, `/api/ops/pipeline/[id]`, `/api/ops/requests`, `/api/ops/schools/[id]/access`, `/api/ops/schools/[id]/account`, `/api/ops/schools/[id]/classes`, `/api/ops/schools/[id]/crm`, `/api/ops/schools/[id]/import`, `/api/ops/schools/[id]/import/[jobId]`, `/api/ops/schools/[id]/people`, `/api/ops/schools/[id]/subjects`, `/api/ops/schools/[id]/support`, `/api/ops/tasks`, `/api/ops/traffic`, `/api/ops/usage`, `/api/paper-gen`, `/api/parent/ask`, `/api/parent/conduct`, `/api/parent/desk`, `/api/parent/documents`, `/api/parent/family`, `/api/parent/health`, `/api/parent/kirti`, `/api/parent/messages`, `/api/parent/whatsapp`, `/api/portal/year-end`, `/api/quiz/generate`, `/api/quiz/grade`, `/api/staff/ask`, `/api/staff/incidents`, `/api/staff/messages`, `/api/staff/whatsapp`, `/api/student/exam-track`, `/api/student/kirti`, `/api/student/proctor-alert`, `/api/student/subjects`, `/api/student/submit-typed`, `/api/student/upload-submission`, `/api/student/work`, `/api/teacher/acknowledge-situation`, `/api/teacher/assignments`, `/api/teacher/attendance`, `/api/teacher/capture`, `/api/teacher/conduct`, `/api/teacher/copilot`, `/api/teacher/copilot/image`, `/api/teacher/course`, `/api/teacher/cover`, `/api/teacher/exams`, `/api/teacher/health-alerts`, `/api/teacher/homework-gen`, `/api/teacher/kirti`, `/api/teacher/lab`, `/api/teacher/lab/runs`, `/api/teacher/leave`, `/api/teacher/lessons`, `/api/teacher/lessons/draft`, `/api/teacher/outcomes`, `/api/teacher/practicals`, `/api/teacher/quiz-gen`, `/api/teacher/review-submission`, `/api/teacher/submissions`, `/api/timeline`, `/api/tml/compute`, `/api/tutor/session`, `/api/whatsapp/simulate`, `/api/whatsapp/webhook`, `/api/youtube`
- **Read directly by pages (browser, RLS):** `/admin/attendance`, `/admin (layout)`, `/admin/schedule`, `/ (layout)`, `/teacher/attendance`, `/teacher/schedule`, `/verify/[token]`
- **SQL functions:** `app.admission_floor()` select, `app.current_session()` select, `app.guard_pay_runs()` select, `app.guard_report_cards()` select, `health_retention_purge()` select, `hr_daily()` select, `log_app_error()` select, `app.next_admission_no()` select, `app.ops_access_grants_guard()` select, `ops_ai_usage()` select, `ops_delete_school()` select/delete, `ops_registry_counts()` select, `ops_school_metrics()` select, `ops_subject_metrics()` select, `ops_update_school()` select/update, `app.session_start_month()` select

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `name` | text | not null |  |
| `institution_type` | text |  | `'school'::text` |
| `trial_expires_at` | timestamp with time zone |  |  |
| `settings` | jsonb |  | `'{}'::jsonb` |
| `created_at` | timestamp with time zone |  | `now()` |
| `updated_at` | timestamp with time zone | not null | `now()` |

<details><summary>RLS policies (2)</summary>

- **schools_read** · SELECT · authenticated
  - USING `((id = ( SELECT app.current_school_id() AS current_school_id)) OR ( SELECT app.is_superadmin() AS is_superadmin))`
- **schools_superadmin_write** · ALL · authenticated
  - USING `( SELECT app.is_superadmin() AS is_superadmin)`
  - WITH CHECK `( SELECT app.is_superadmin() AS is_superadmin)`

</details>

<details><summary>Triggers (3)</summary>

```sql
CREATE TRIGGER trg_audit_schools AFTER DELETE OR UPDATE ON public.schools FOR EACH ROW EXECUTE FUNCTION app.audit('name,settings,trial_expires_at,institution_type')
CREATE TRIGGER trg_touch_schools BEFORE UPDATE ON public.schools FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at()
CREATE TRIGGER trg_seed_admission_stages AFTER INSERT ON public.schools FOR EACH ROW EXECUTE FUNCTION app.seed_admission_stages()
```

</details>

<details><summary>Indexes (2)</summary>

```sql
CREATE UNIQUE INDEX schools_pkey ON public.schools USING btree (id)
CREATE UNIQUE INDEX schools_code_unique ON public.schools USING btree (((settings ->> 'code'::text))) WHERE ((settings ->> 'code'::text) IS NOT NULL)
```

</details>

### Table users

- **Kind:** table
- **Row-level security:** enabled, 2 policies
- **Grants:** `authenticated` delete/insert/references/select/trigger/update; `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `schools` via `school_id`
- **Referenced by:** `academic_events`, `account_requests`, `admission_applicants`, `admission_documents`, `admission_events`, `admission_offers`, `admission_seats`, `ai_usage`, `app_error_groups`, `app_errors`, `assignments`, `attendance`, `attendance_devices`, `attendance_month_reviews`, `attendance_settings`, `cc_groups`, `cc_memberships`, `certificate_settings`, `certificate_types`, `certificates`, `class_subjects`, `comp_off_grants`, `consents`, `counselling_cases`, `counselling_referrals`, `counselling_sessions`, `course_plans`, `cover_assignments`, `discipline_actions`, `duty_assignments`, `duty_roster`, `engagement_scores`, `enquiries`, `exam_class_terms`, `exam_marks`, `exam_schemes`, `exam_sheets`, `exam_student_terms`, `family_members`, `fee_concession_requests`, `fee_day_closes`, `fee_invoices`, `fee_payments`, `fee_reminders`, `fee_structures`, `guardians`, `house_members`, `house_points`, `hr_posts`, `hr_settings`, `incidents`, `kirti_entries`, `lab_runs`, `lab_scenes`, `leave_policies`, `leave_requests`, `legacy_results`, `lesson_plans`, `materials`, `notifications`, `ops_access_grants`, `ops_accounts`, `ops_activities`, `ops_campaigns`, `ops_canned_replies`, `ops_case_links`, `ops_case_messages`, `ops_cases`, `ops_commissions`, `ops_contacts`, `ops_documents`, `ops_marketing_spend`, `ops_operators`, `ops_opportunities`, `ops_opportunity_events`, `ops_partners`, `ops_quote_approvals`, `ops_quotes`, `ops_tasks`, `pay_adjustments`, `pay_runs`, `payroll_settings`, `practical_assessment`, `practical_progress`, `probe_acks`, `proctor_alerts`, `qa_upload_tokens`, `report_card_settings`, `report_cards`, `role_grants`, `safeguarding_log`, `salary_templates`, `sched_requirements`, `sched_solver_settings`, `school_filings`, `school_messages`, `school_threads`, `shift_overrides`, `situations`, `staff_absences`, `staff_day_marks`, `staff_documents`, `staff_events`, `staff_exits`, `staff_jobs`, `staff_loans`, `staff_members`, `staff_noshow_alerts`, `staff_pay_settings`, `staff_profiles`, `staff_punches`, `staff_qualifications`, `staff_salaries`, `staff_shift_plans`, `staff_statutory`, `statutory_overrides`, `student_change_requests`, `student_chats`, `student_documents`, `student_memory`, `student_subjects`, `students`, `subject_leads`, `submission_items`, `submissions`, `superadmins`, `syllabus`, `syllabus_progress`, `tax_declarations`, `teacher_load_rules`, `teacher_subjects`, `timetable_slots`, `timetable_versions`, `tml_scores`, `tutor_guard_events`, `tutor_session_turns`, `tutor_sessions`, `visit_sessions`, `wellness_logs`, `whatsapp_links`, `whatsapp_log`
- **Written by routes:** `/api/admin/certificates` (select/update), `/api/admin/delete-user` (select/delete), `/api/admin/students/[id]` (select/update), `/api/admin/students/settings` (select; in SQL: update), `/api/admin/users/assignments` (select/update; in SQL: select/update), `/api/ops/me` (select/update), `/api/ops/operators` (select/update/insert/delete), `/api/ops/requests` (select/insert/update; in SQL: select/update), `/api/ops/schools/[id]` (select; in SQL: select/delete), `/api/ops/schools/[id]/people` (select/insert/update; in SQL: select/update), `/api/ops/schools/[id]/people/[userId]` (select/update; in SQL: select/update/delete), `/api/ops/schools/[id]/subjects` (select/update; in SQL: select/update; maybe: select), `/api/ops/schools/[id]/support` (select/update), `/api/student/exam-track` (select/update), `/api/teacher/acknowledge-situation` (select; maybe: update)
- **Read by routes:** `/api/admin/access`, `/api/admin/account-requests`, `/api/admin/admissions`, `/api/admin/admissions/application`, `/api/admin/admissions/documents`, `/api/admin/admissions/enrol`, `/api/admin/admissions/offers`, `/api/admin/admissions/setup`, `/api/admin/attendance`, `/api/admin/cocurricular`, `/api/admin/counselling`, `/api/admin/discipline`, `/api/admin/exams`, `/api/admin/fees`, `/api/admin/filings`, `/api/admin/health`, `/api/admin/heatmap-data`, `/api/admin/import`, `/api/admin/import/[id]`, `/api/admin/leave`, `/api/admin/leave-policy`, `/api/admin/payroll`, `/api/admin/payroll/export`, `/api/admin/payroll/run`, `/api/admin/people`, `/api/admin/people/documents`, `/api/admin/people/import`, `/api/admin/people/structure`, `/api/admin/probe`, `/api/admin/safeguarding`, `/api/admin/schedule/calendar`, `/api/admin/schedule/compoff`, `/api/admin/schedule/cover`, `/api/admin/schedule/duties`, `/api/admin/schedule/setup`, `/api/admin/schedule/solver`, `/api/admin/schedule/staff`, `/api/admin/schedule/timetable`, `/api/admin/schedule/visits`, `/api/admin/students`, `/api/admin/students/[id]/documents`, `/api/admin/students/[id]/health`, `/api/admin/students/applicants`, `/api/admin/students/requests`, `/api/admin/students/siblings`, `/api/admin/students/year`, `/api/admin/subjects`, `/api/admin/support`, `/api/admin/users`, `/api/errors`, `/api/feed`, `/api/grading/pages`, `/api/homework/grade`, `/api/import/worker`, `/api/me/attendance`, `/api/me/employee`, `/api/me/payslips`, `/api/me/report-cards`, `/api/ops/audit`, `/api/ops/delivery`, `/api/ops/desk`, `/api/ops/desk/[id]`, `/api/ops/desk/settings`, `/api/ops/enquiries`, `/api/ops/errors`, `/api/ops/health`, `/api/ops/marketing`, `/api/ops/overview`, `/api/ops/partners`, `/api/ops/people`, `/api/ops/pipeline`, `/api/ops/pipeline/[id]`, `/api/ops/pipeline/settings`, `/api/ops/qa`, `/api/ops/schools`, `/api/ops/schools/[id]/access`, `/api/ops/schools/[id]/account`, `/api/ops/schools/[id]/classes`, `/api/ops/schools/[id]/controls`, `/api/ops/schools/[id]/crm`, `/api/ops/schools/[id]/import`, `/api/ops/schools/[id]/import/[jobId]`, `/api/ops/schools/[id]/inspect`, `/api/ops/schools/[id]/settings`, `/api/ops/settings`, `/api/ops/tasks`, `/api/ops/territories`, `/api/ops/traffic`, `/api/ops/usage`, `/api/paper-gen`, `/api/parent/ask`, `/api/parent/conduct`, `/api/parent/desk`, `/api/parent/documents`, `/api/parent/family`, `/api/parent/health`, `/api/parent/kirti`, `/api/parent/messages`, `/api/parent/whatsapp`, `/api/portal/year-end`, `/api/quiz/generate`, `/api/quiz/grade`, `/api/staff/ask`, `/api/staff/incidents`, `/api/staff/messages`, `/api/staff/whatsapp`, `/api/student/kirti`, `/api/student/proctor-alert`, `/api/student/subjects`, `/api/student/submit-typed`, `/api/student/upload-submission`, `/api/student/work`, `/api/teacher/assignments`, `/api/teacher/attendance`, `/api/teacher/capture`, `/api/teacher/conduct`, `/api/teacher/copilot`, `/api/teacher/copilot/image`, `/api/teacher/course`, `/api/teacher/cover`, `/api/teacher/exams`, `/api/teacher/health-alerts`, `/api/teacher/homework-gen`, `/api/teacher/kirti`, `/api/teacher/lab`, `/api/teacher/lab/runs`, `/api/teacher/leave`, `/api/teacher/lessons`, `/api/teacher/lessons/draft`, `/api/teacher/outcomes`, `/api/teacher/practicals`, `/api/teacher/quiz-gen`, `/api/teacher/review-submission`, `/api/teacher/submissions`, `/api/timeline`, `/api/tml/compute`, `/api/tutor/session`, `/api/whatsapp/simulate`, `/api/whatsapp/webhook`, `/api/youtube`
- **Read directly by pages (browser, RLS):** `/admin (layout)`, `/admin/schedule`, `/admin/vault`, `/ (layout)`, `/login`, `/ops/[schoolId]`, `/ops/audit`, `/ops/delivery`, `/ops/desk/[id]`, `/ops/desk`, `/ops/desk/settings`, `/ops/enquiries`, `/ops/errors`, `/ops/health`, `/ops (layout)`, `/ops/marketing`, `/ops/operators`, `/ops/partners`, `/ops/people`, `/ops/pipeline/[id]`, `/ops/pipeline`, `/ops/pipeline/settings`, `/ops/quality`, `/ops/requests`, `/ops/schools/[schoolId]`, `/ops/schools`, `/ops/settings`, `/ops/tasks`, `/ops/traffic`, `/ops/usage`, `/teacher/feed`, `/teacher (layout)`, `/teacher/schedule`, `/teacher/wellness`
- **SQL functions:** `admin_invoice_student()` select, `admin_raise_invoices()` select, `app.audit()` select, `app.current_school_id()` select, `app.enrol_core()` select, `app.guard_director()` select, `app.guard_exam_student_terms()` select, `app.guard_report_cards()` select, `app.guard_role_grant()` select, `app.guard_subject_link()` select, `app.guard_superadmin()` select, `app.guard_superadmin_list()` select, `hr_daily()` select, `hr_link_login()` select, `import_attendance()` select, `import_exam_marks()` select, `import_fee_invoices()` select, `import_fee_payments()` select, `import_legacy_results()` select, `import_undo()` select, `app.is_admin()` select, `app.is_staff()` select, `app.is_superadmin()` select, `app.is_teacher()` select, `app.link_guardian_family()` select, `log_app_error()` select, `app.on_class_rename()` select, `ops_ai_usage()` select, `ops_delete_account()` select/delete, `ops_delete_school()` select/delete, `ops_login_check()` select, `ops_platform_health()` select, `ops_registry_counts()` select, `ops_rename_class_subject()` select, `ops_school_diagnostics()` select, `ops_school_metrics()` select, `ops_subject_metrics()` select, `app.perm_holders()` select, `app.reconcile_student_subjects()` select, `school_wellness_aggregates()` select, `school_wellness_report()` select, `app.sees_learning()` select, `set_consent()` select, `app.sync_student_login()` update, `app.sync_teacher_assignments()` select/update, `teacher_wellness_feed()` select, `app.teaches_class()` select, `app.teaches_student()` select, `app.user_cp_reader()` select, `app.user_has_perm()` select, `app.user_role()` select

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null |  |
| `school_id` | uuid |  |  |
| `name` | text |  |  |
| `email` | text |  |  |
| `role` | text | not null | `'student'::text` |
| `student_class` | text |  |  |
| `branch` | text |  |  |
| `year` | text |  |  |
| `semester` | text |  |  |
| `custom_student_id` | text |  |  |
| `teacher_class` | text |  |  |
| `teacher_subject` | text |  |  |
| `assignments` | jsonb |  | `'[]'::jsonb` |
| `teaching_subjects` | jsonb |  | `'[]'::jsonb` |
| `historical_weaknesses` | text[] |  | `'{}'::text[]` |
| `metadata` | jsonb |  | `'{}'::jsonb` |
| `created_at` | timestamp with time zone |  | `now()` |
| `memory_profile` | jsonb |  | `'{}'::jsonb` |
| `updated_at` | timestamp with time zone | not null | `now()` |

<details><summary>Unique and check constraints</summary>

```sql
UNIQUE UNIQUE (email)
CHECK ((role = ANY (ARRAY['student'::text, 'teacher'::text, 'admin'::text, 'parent'::text, 'superadmin'::text, 'operator'::text]))) NOT VALID
```

</details>

<details><summary>RLS policies (2)</summary>

- **users_read** · SELECT · authenticated
  - USING `((id = ( SELECT auth.uid() AS uid)) OR (( SELECT app.is_staff() AS is_staff) AND (school_id = ( SELECT app.current_school_id() AS current_school_id))) OR app.is_parent_of(id) OR ( SELECT app.is_superadmin() AS is_superadmin))`
- **users_superadmin_write** · ALL · authenticated
  - USING `( SELECT app.is_superadmin() AS is_superadmin)`
  - WITH CHECK `( SELECT app.is_superadmin() AS is_superadmin)`

</details>

<details><summary>Triggers (8)</summary>

```sql
CREATE TRIGGER trg_audit_users AFTER DELETE OR UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION app.audit('role,school_id,email')
CREATE TRIGGER trg_bootstrap_school_admin AFTER INSERT OR UPDATE OF role, school_id ON public.users FOR EACH ROW EXECUTE FUNCTION app.bootstrap_school_admin()
CREATE TRIGGER trg_guard_superadmin_users BEFORE INSERT OR UPDATE OF role ON public.users FOR EACH ROW EXECUTE FUNCTION app.guard_superadmin()
CREATE TRIGGER trg_release_staff_threads BEFORE DELETE ON public.users FOR EACH ROW EXECUTE FUNCTION app.release_staff_threads()
CREATE TRIGGER trg_student_class_change AFTER INSERT OR UPDATE OF student_class, role, school_id ON public.users FOR EACH ROW EXECUTE FUNCTION app.on_student_class_change()
CREATE TRIGGER trg_touch_users BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at()
CREATE TRIGGER trg_users_on_register AFTER INSERT OR UPDATE OF role, school_id ON public.users FOR EACH ROW EXECUTE FUNCTION app.users_on_register()
CREATE TRIGGER trg_student_login_change AFTER INSERT OR UPDATE OF student_class, custom_student_id, name, role, school_id, metadata ON public.users FOR EACH ROW EXECUTE FUNCTION app.on_student_login_change()
```

</details>

<details><summary>Indexes (5)</summary>

```sql
CREATE UNIQUE INDEX users_email_key ON public.users USING btree (email)
CREATE UNIQUE INDEX users_pkey ON public.users USING btree (id)
CREATE INDEX idx_users_role ON public.users USING btree (role)
CREATE INDEX idx_users_school_id ON public.users USING btree (school_id)
CREATE INDEX idx_users_school_role ON public.users USING btree (school_id, role)
```

</details>

### Table superadmins

- **Kind:** table
- **Row-level security:** enabled, 1 policies
- **Grants:** `authenticated` delete/insert/references/select/trigger/update; `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (user_id)`
- **References:** `users` via `user_id`
- **Read by routes:** `/api/admin/fees`, `/api/ops/audit`, `/api/ops/delivery`, `/api/ops/desk`, `/api/ops/desk/[id]`, `/api/ops/desk/settings`, `/api/ops/enquiries`, `/api/ops/errors`, `/api/ops/health`, `/api/ops/marketing`, `/api/ops/me`, `/api/ops/operators`, `/api/ops/overview`, `/api/ops/partners`, `/api/ops/people`, `/api/ops/pipeline`, `/api/ops/pipeline/[id]`, `/api/ops/pipeline/settings`, `/api/ops/qa`, `/api/ops/requests`, `/api/ops/schools`, `/api/ops/schools/[id]`, `/api/ops/schools/[id]/access`, `/api/ops/schools/[id]/account`, `/api/ops/schools/[id]/classes`, `/api/ops/schools/[id]/controls`, `/api/ops/schools/[id]/crm`, `/api/ops/schools/[id]/import`, `/api/ops/schools/[id]/import/[jobId]`, `/api/ops/schools/[id]/inspect`, `/api/ops/schools/[id]/people`, `/api/ops/schools/[id]/people/[userId]`, `/api/ops/schools/[id]/settings`, `/api/ops/schools/[id]/subjects`, `/api/ops/schools/[id]/support`, `/api/ops/settings`, `/api/ops/tasks`, `/api/ops/territories`, `/api/ops/traffic`, `/api/ops/usage`, `/api/staff/ask`, `/api/whatsapp/simulate`, `/api/whatsapp/webhook`
- **Read directly by pages (browser, RLS):** `/ops/[schoolId]`, `/ops/audit`, `/ops/delivery`, `/ops/desk/[id]`, `/ops/desk`, `/ops/desk/settings`, `/ops/enquiries`, `/ops/errors`, `/ops/health`, `/ops (layout)`, `/ops/marketing`, `/ops/operators`, `/ops/partners`, `/ops/people`, `/ops/pipeline/[id]`, `/ops/pipeline`, `/ops/pipeline/settings`, `/ops/quality`, `/ops/requests`, `/ops/schools/[schoolId]`, `/ops/schools`, `/ops/settings`, `/ops/tasks`, `/ops/traffic`, `/ops/usage`
- **SQL functions:** `app.guard_director()` select, `app.guard_superadmin()` select, `app.guard_superadmin_list()` select, `app.is_superadmin()` select, `ops_platform_health()` select, `app.user_has_perm()` select

| Column | Type | Null | Default |
|---|---|---|---|
| `user_id` | uuid | not null |  |

<details><summary>RLS policies (1)</summary>

- **superadmins_read** · SELECT · authenticated
  - USING `( SELECT app.is_superadmin() AS is_superadmin)`

</details>

<details><summary>Triggers (1)</summary>

```sql
CREATE TRIGGER trg_guard_superadmin_list BEFORE INSERT OR UPDATE ON public.superadmins FOR EACH ROW EXECUTE FUNCTION app.guard_superadmin_list()
```

</details>

<details><summary>Indexes (1)</summary>

```sql
CREATE UNIQUE INDEX superadmins_pkey ON public.superadmins USING btree (user_id)
```

</details>

### Table role_grants

- **Kind:** table
- **Row-level security:** enabled, 1 policies
- **Grants:** `authenticated` delete/insert/references/select/trigger/update; `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `users` via `granted_by`, `users` via `revoked_by`, `schools` via `school_id`, `users` via `user_id`
- **Written by routes:** `/api/admin/access` (select/insert/update)
- **Read by routes:** `/api/admin/account-requests`, `/api/admin/admissions`, `/api/admin/admissions/application`, `/api/admin/admissions/documents`, `/api/admin/admissions/enrol`, `/api/admin/admissions/offers`, `/api/admin/admissions/setup`, `/api/admin/attendance`, `/api/admin/certificates`, `/api/admin/cocurricular`, `/api/admin/counselling`, `/api/admin/delete-user`, `/api/admin/discipline`, `/api/admin/exams`, `/api/admin/fees`, `/api/admin/filings`, `/api/admin/health`, `/api/admin/heatmap-data`, `/api/admin/import`, `/api/admin/import/[id]`, `/api/admin/leave`, `/api/admin/leave-policy`, `/api/admin/payroll`, `/api/admin/payroll/export`, `/api/admin/payroll/run`, `/api/admin/people`, `/api/admin/people/documents`, `/api/admin/people/import`, `/api/admin/people/structure`, `/api/admin/probe`, `/api/admin/safeguarding`, `/api/admin/schedule/calendar`, `/api/admin/schedule/compoff`, `/api/admin/schedule/cover`, `/api/admin/schedule/duties`, `/api/admin/schedule/setup`, `/api/admin/schedule/solver`, `/api/admin/schedule/staff`, `/api/admin/schedule/timetable`, `/api/admin/schedule/visits`, `/api/admin/students`, `/api/admin/students/[id]`, `/api/admin/students/[id]/documents`, `/api/admin/students/[id]/health`, `/api/admin/students/applicants`, `/api/admin/students/requests`, `/api/admin/students/settings`, `/api/admin/students/siblings`, `/api/admin/students/year`, `/api/admin/subjects`, `/api/admin/support`, `/api/admin/users`, `/api/admin/users/assignments`, `/api/feed`, `/api/me/attendance`, `/api/me/employee`, `/api/me/payslips`, `/api/ops/delivery`, `/api/ops/health`, `/api/ops/overview`, `/api/ops/schools`, `/api/ops/schools/[id]`, `/api/ops/schools/[id]/people/[userId]`, `/api/ops/schools/[id]/support`, `/api/paper-gen`, `/api/parent/ask`, `/api/parent/conduct`, `/api/parent/messages`, `/api/staff/ask`, `/api/staff/incidents`, `/api/staff/messages`, `/api/staff/whatsapp`, `/api/student/proctor-alert`, `/api/teacher/acknowledge-situation`, `/api/teacher/assignments`, `/api/teacher/attendance`, `/api/teacher/capture`, `/api/teacher/conduct`, `/api/teacher/copilot`, `/api/teacher/copilot/image`, `/api/teacher/course`, `/api/teacher/cover`, `/api/teacher/exams`, `/api/teacher/health-alerts`, `/api/teacher/homework-gen`, `/api/teacher/kirti`, `/api/teacher/lab`, `/api/teacher/lab/runs`, `/api/teacher/leave`, `/api/teacher/lessons`, `/api/teacher/lessons/draft`, `/api/teacher/outcomes`, `/api/teacher/practicals`, `/api/teacher/quiz-gen`, `/api/teacher/review-submission`, `/api/teacher/submissions`, `/api/timeline`, `/api/tutor/session`, `/api/whatsapp/simulate`, `/api/whatsapp/webhook`
- **Read directly by pages (browser, RLS):** `/admin (layout)`
- **SQL functions:** `app.bootstrap_school_admin()` select/insert, `app.guard_role_grant()` select, `hr_daily()` select, `ops_delete_account()` select, `app.perm_holders()` select, `app.user_cp_reader()` select, `app.user_has_perm()` select

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `school_id` | uuid | not null |  |
| `user_id` | uuid | not null |  |
| `role_key` | text | not null |  |
| `expires_on` | date |  |  |
| `note` | text |  |  |
| `granted_by` | uuid |  |  |
| `granted_at` | timestamp with time zone | not null | `now()` |
| `revoked_at` | timestamp with time zone |  |  |
| `revoked_by` | uuid |  |  |
| `updated_at` | timestamp with time zone | not null | `now()` |

<details><summary>Unique and check constraints</summary>

```sql
CHECK (((note IS NULL) OR (char_length(note) <= 300)))
CHECK ((role_key = ANY (ARRAY['school_admin'::text, 'principal'::text, 'vice_principal'::text, 'finance_head'::text, 'accountant'::text, 'cashier'::text, 'admissions_officer'::text, 'hr_manager'::text, 'academic_coordinator'::text, 'counsellor'::text, 'dpo'::text, 'registrar'::text, 'health_officer'::text, 'safeguarding_lead'::text])))
```

</details>

<details><summary>RLS policies (1)</summary>

- **role_grants_read** · SELECT · authenticated
  - USING `((user_id = ( SELECT auth.uid() AS uid)) OR (( SELECT app.has_perm('access.manage'::text) AS has_perm) AND (school_id = ( SELECT app.current_school_id() AS current_school_id))) OR ( SELECT app.is_superadmin() AS is_superadmin))`

</details>

<details><summary>Triggers (2)</summary>

```sql
CREATE TRIGGER trg_audit_role_grants AFTER INSERT OR DELETE OR UPDATE ON public.role_grants FOR EACH ROW EXECUTE FUNCTION app.audit()
CREATE TRIGGER trg_guard_role_grant BEFORE INSERT OR DELETE OR UPDATE ON public.role_grants FOR EACH ROW EXECUTE FUNCTION app.guard_role_grant()
```

</details>

<details><summary>Indexes (3)</summary>

```sql
CREATE UNIQUE INDEX role_grants_pkey ON public.role_grants USING btree (id)
CREATE INDEX idx_role_grants_school ON public.role_grants USING btree (school_id) WHERE (revoked_at IS NULL)
CREATE UNIQUE INDEX uq_role_grants_active ON public.role_grants USING btree (user_id, role_key) WHERE (revoked_at IS NULL)
```

</details>

### Table role_permissions

- **Kind:** table
- **Row-level security:** enabled, 1 policies
- **Grants:** `authenticated` delete/insert/references/select/trigger/update; `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (role_key, perm)`
- **Read by routes:** `/api/admin/attendance`, `/api/admin/fees`, `/api/admin/people`, `/api/ops/delivery`, `/api/staff/ask`, `/api/teacher/cover`, `/api/whatsapp/simulate`, `/api/whatsapp/webhook`
- **SQL functions:** `hr_daily()` select, `app.perm_holders()` select, `app.user_has_perm()` select

| Column | Type | Null | Default |
|---|---|---|---|
| `role_key` | text | not null |  |
| `perm` | text | not null |  |

<details><summary>RLS policies (1)</summary>

- **role_permissions_read** · SELECT · authenticated
  - USING `true`

</details>

<details><summary>Indexes (1)</summary>

```sql
CREATE UNIQUE INDEX role_permissions_pkey ON public.role_permissions USING btree (role_key, perm)
```

</details>

### Table guardians

- **Kind:** table
- **Row-level security:** enabled, 2 policies
- **Grants:** `authenticated` delete/insert/references/select/trigger/update; `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `users` via `parent_id`, `users` via `student_id`
- **Written by routes:** `/api/ops/requests` (upsert), `/api/ops/schools/[id]/people` (upsert), `/api/ops/schools/[id]/support` (select/upsert/update/delete)
- **Read by routes:** `/api/admin/admissions`, `/api/admin/admissions/application`, `/api/admin/admissions/offers`, `/api/admin/discipline`, `/api/admin/exams`, `/api/admin/fees`, `/api/admin/probe`, `/api/admin/users`, `/api/grading/pages`, `/api/me/report-cards`, `/api/ops/overview`, `/api/ops/schools`, `/api/ops/schools/[id]`, `/api/ops/schools/[id]/controls`, `/api/parent/ask`, `/api/parent/conduct`, `/api/parent/desk`, `/api/parent/documents`, `/api/parent/family`, `/api/parent/health`, `/api/parent/kirti`, `/api/parent/messages`, `/api/portal/year-end`, `/api/staff/ask`, `/api/staff/incidents`, `/api/staff/messages`, `/api/teacher/attendance`, `/api/teacher/conduct`, `/api/teacher/review-submission`, `/api/teacher/submissions`, `/api/timeline`, `/api/whatsapp/simulate`, `/api/whatsapp/webhook`
- **Read directly by pages (browser, RLS):** `/admin (layout)`
- **SQL functions:** `app.is_parent_of()` select, `ops_school_diagnostics()` select, `ops_school_metrics()` select, `app.parent_of_student()` select

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `parent_id` | uuid | not null |  |
| `student_id` | uuid | not null |  |
| `relationship` | text |  |  |
| `verified` | boolean | not null | `false` |
| `created_at` | timestamp with time zone | not null | `now()` |

<details><summary>Unique and check constraints</summary>

```sql
UNIQUE UNIQUE (parent_id, student_id)
```

</details>

<details><summary>RLS policies (2)</summary>

- **guardians_admin_write** · ALL · authenticated
  - USING `((( SELECT app.has_perm('people.manage'::text) AS has_perm) AND (EXISTS ( SELECT 1    FROM users u   WHERE ((u.id = guardians.student_id) AND (u.school_id = ( SELECT app.current_school_id() AS current_school_id)))))) OR ( SELECT app.is_superadmin() AS is_superadmin))`
  - WITH CHECK `((( SELECT app.has_perm('people.manage'::text) AS has_perm) AND (EXISTS ( SELECT 1    FROM users u   WHERE ((u.id = guardians.student_id) AND (u.school_id = ( SELECT app.current_school_id() AS current_school_id)))))) OR ( SELECT app.is_superadmin() AS is_superadmin))`
- **guardians_read** · SELECT · authenticated
  - USING `((parent_id = ( SELECT auth.uid() AS uid)) OR (student_id = ( SELECT auth.uid() AS uid)) OR ((( SELECT app.has_perm('people.manage'::text) AS has_perm) OR ( SELECT app.has_perm('compliance.read'::text) AS has_perm) OR ( SELECT app.has_perm('fees.remind'::text) AS has_perm)) AND (EXISTS ( SELECT 1    FROM users u   WHERE ((u.id = guardians.student_id) AND (u.school_id = ( SELECT app.current_school_id() AS current_school_id)))))) OR ( SELECT app.is_superadmin() AS is_superadmin))`

</details>

<details><summary>Triggers (2)</summary>

```sql
CREATE TRIGGER trg_audit_guardians AFTER INSERT OR DELETE OR UPDATE ON public.guardians FOR EACH ROW EXECUTE FUNCTION app.audit()
CREATE TRIGGER trg_guardian_family AFTER INSERT ON public.guardians FOR EACH ROW EXECUTE FUNCTION app.on_guardian_link()
```

</details>

<details><summary>Indexes (4)</summary>

```sql
CREATE UNIQUE INDEX guardians_parent_id_student_id_key ON public.guardians USING btree (parent_id, student_id)
CREATE UNIQUE INDEX guardians_pkey ON public.guardians USING btree (id)
CREATE INDEX idx_guardians_parent ON public.guardians USING btree (parent_id)
CREATE INDEX idx_guardians_student ON public.guardians USING btree (student_id)
```

</details>

### Table consents

- **Kind:** table
- **Row-level security:** enabled, 1 policies
- **Grants:** `authenticated` delete/insert/references/select/trigger/update; `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `users` via `granted_by`, `schools` via `school_id`, `users` via `student_id`
- **Read by routes:** `/api/admin/filings`, `/api/admin/health`, `/api/admin/probe`, `/api/admin/students/[id]/health`, `/api/admin/students/requests`, `/api/ops/overview`, `/api/ops/schools`, `/api/ops/schools/[id]`, `/api/parent/ask`, `/api/parent/desk`, `/api/parent/family`, `/api/parent/health`, `/api/staff/ask`, `/api/whatsapp/simulate`, `/api/whatsapp/webhook`
- **Read directly by pages (browser, RLS):** `/admin (layout)`, `/student (layout)`
- **SQL functions:** `app.has_wellness_consent()` select, `app.health_consent()` select, `health_consented()` select, `ops_school_metrics()` select, `set_consent()` insert

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `student_id` | uuid | not null |  |
| `school_id` | uuid | not null |  |
| `consent_type` | text | not null |  |
| `granted` | boolean | not null | `false` |
| `granted_by` | uuid |  |  |
| `policy_version` | text |  |  |
| `granted_at` | timestamp with time zone |  |  |
| `revoked_at` | timestamp with time zone |  |  |
| `created_at` | timestamp with time zone | not null | `now()` |
| `updated_at` | timestamp with time zone | not null | `now()` |

<details><summary>Unique and check constraints</summary>

```sql
UNIQUE UNIQUE (student_id, consent_type)
CHECK ((consent_type = ANY (ARRAY['wellness_checkin'::text, 'ai_tutor'::text, 'data_processing'::text, 'proctoring'::text, 'health_record'::text])))
```

</details>

<details><summary>RLS policies (1)</summary>

- **consents_read** · SELECT · authenticated
  - USING `((student_id = ( SELECT auth.uid() AS uid)) OR app.is_parent_of(student_id) OR (( SELECT app.has_perm('compliance.read'::text) AS has_perm) AND (school_id = ( SELECT app.current_school_id() AS current_school_id))) OR ( SELECT app.is_superadmin() AS is_superadmin))`

</details>

<details><summary>Triggers (3)</summary>

```sql
CREATE TRIGGER trg_audit_consents AFTER INSERT OR DELETE OR UPDATE ON public.consents FOR EACH ROW EXECUTE FUNCTION app.audit()
CREATE TRIGGER trg_touch_consents BEFORE UPDATE ON public.consents FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at()
CREATE TRIGGER trg_health_consent AFTER INSERT OR UPDATE OF granted ON public.consents FOR EACH ROW EXECUTE FUNCTION app.on_health_consent()
```

</details>

<details><summary>Indexes (3)</summary>

```sql
CREATE UNIQUE INDEX consents_pkey ON public.consents USING btree (id)
CREATE UNIQUE INDEX consents_student_id_consent_type_key ON public.consents USING btree (student_id, consent_type)
CREATE INDEX idx_consents_student ON public.consents USING btree (student_id)
```

</details>

### Table account_requests

- **Kind:** table
- **Row-level security:** enabled, 1 policies
- **Grants:** `authenticated` select; `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `admission_applicants` via `applicant_id`, `users` via `decided_by`, `users` via `requested_by`, `schools` via `school_id`
- **Written by routes:** `/api/admin/account-requests` (insert/select/update), `/api/admin/admissions/enrol` (select/insert/update), `/api/ops/requests` (select/update)
- **Read by routes:** `/api/admin/import`, `/api/admin/import/[id]`, `/api/import/worker`, `/api/ops/overview`, `/api/ops/schools/[id]/import`, `/api/ops/schools/[id]/import/[jobId]`
- **Read directly by pages (browser, RLS):** `/admin/admissions`, `/admin/directory`
- **SQL functions:** `import_undo()` select

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `school_id` | uuid | not null |  |
| `kind` | text | not null |  |
| `applicant_id` | uuid |  |  |
| `people` | jsonb | not null | `'[]'::jsonb` |
| `options` | jsonb | not null | `'{}'::jsonb` |
| `note` | text |  |  |
| `status` | text | not null | `'pending'::text` |
| `requested_by` | uuid |  |  |
| `created_at` | timestamp with time zone | not null | `now()` |
| `decided_by` | uuid |  |  |
| `decided_at` | timestamp with time zone |  |  |
| `decision_note` | text |  |  |
| `result` | jsonb |  |  |

<details><summary>Unique and check constraints</summary>

```sql
CHECK (((decision_note IS NULL) OR (length(decision_note) <= 1000)))
CHECK (((kind <> 'enrolment'::text) OR (applicant_id IS NOT NULL)))
CHECK ((kind = ANY (ARRAY['enrolment'::text, 'accounts'::text])))
CHECK (((note IS NULL) OR (length(note) <= 1000)))
CHECK (((jsonb_typeof(people) = 'array'::text) AND (jsonb_array_length(people) <= 200)))
CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'cancelled'::text])))
```

</details>

<details><summary>RLS policies (1)</summary>

- **account_requests_read** · SELECT · authenticated
  - USING `(((school_id = ( SELECT app.current_school_id() AS current_school_id)) AND (( SELECT app.has_perm('admissions.read'::text) AS has_perm) OR ( SELECT app.has_perm('admissions.manage'::text) AS has_perm) OR ( SELECT app.has_perm('people.manage'::text) AS has_perm))) OR ( SELECT app.is_superadmin() AS is_superadmin))`

</details>

<details><summary>Indexes (4)</summary>

```sql
CREATE UNIQUE INDEX account_requests_pkey ON public.account_requests USING btree (id)
CREATE INDEX ix_account_requests_pending ON public.account_requests USING btree (created_at) WHERE (status = 'pending'::text)
CREATE INDEX ix_account_requests_school ON public.account_requests USING btree (school_id, created_at DESC)
CREATE UNIQUE INDEX uq_account_requests_applicant ON public.account_requests USING btree (applicant_id) WHERE ((status = 'pending'::text) AND (applicant_id IS NOT NULL))
```

</details>

### Table platform_config

> Operator overrides of code-defined platform settings (src/lib/settings/registry.ts). Service role only.

- **Kind:** table
- **Row-level security:** enabled, 0 policies
- **Grants:** `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (key)`
- **References:** `auth.users` via `updated_by`
- **Written by routes:** `/api/ops/settings` (select; in SQL: select/insert)
- **Read by routes:** `/api/homework/grade`, `/api/ops/health`, `/api/ops/overview`, `/api/ops/schools`, `/api/ops/traffic`, `/api/paper-gen`, `/api/parent/ask`, `/api/platform/public`, `/api/quiz/generate`, `/api/quiz/grade`, `/api/staff/ask`, `/api/teacher/capture`, `/api/teacher/copilot`, `/api/teacher/copilot/image`, `/api/teacher/homework-gen`, `/api/teacher/lessons/draft`, `/api/teacher/quiz-gen`, `/api/timeline`, `/api/tutor/session`, `/api/whatsapp/simulate`, `/api/whatsapp/webhook`
- **SQL functions:** `ops_set_platform_config()` select/insert

| Column | Type | Null | Default |
|---|---|---|---|
| `key` | text | not null |  |
| `value` | jsonb | not null |  |
| `updated_by` | uuid |  |  |
| `updated_at` | timestamp with time zone | not null | `now()` |

<details><summary>Unique and check constraints</summary>

```sql
CHECK (((key ~ '^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$'::text) AND (length(key) <= 64)))
```

</details>

<details><summary>Indexes (1)</summary>

```sql
CREATE UNIQUE INDEX platform_config_pkey ON public.platform_config USING btree (key)
```

</details>

### Table settings_changes

> Append-only journal of operator settings changes (platform and per school). Service role only.

- **Kind:** table
- **Row-level security:** enabled, 0 policies
- **Grants:** `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `auth.users` via `actor_id`
- **Written by routes:** `/api/ops/schools/[id]` (select; in SQL: insert), `/api/ops/schools/[id]/controls` (in SQL: insert), `/api/ops/schools/[id]/people/[userId]` (in SQL: insert), `/api/ops/schools/[id]/settings` (in SQL: insert), `/api/ops/settings` (select; in SQL: insert)
- **Read by routes:** `/api/ops/audit`, `/api/ops/overview`, `/api/ops/schools/[id]/crm`
- **SQL functions:** `ops_delete_account()` insert, `ops_delete_school()` insert, `ops_set_platform_config()` insert, `ops_update_school()` insert

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | bigint | not null |  |
| `at` | timestamp with time zone | not null | `now()` |
| `actor_id` | uuid |  |  |
| `actor_email` | text |  |  |
| `scope` | text | not null |  |
| `school_id` | uuid |  |  |
| `key` | text | not null |  |
| `old_value` | jsonb |  |  |
| `new_value` | jsonb |  |  |
| `reason` | text | not null |  |

<details><summary>Unique and check constraints</summary>

```sql
CHECK (((scope = 'school'::text) OR (school_id IS NULL)))
CHECK (((length(key) >= 1) AND (length(key) <= 64)))
CHECK (((length(btrim(reason)) >= 4) AND (length(btrim(reason)) <= 500)))
CHECK ((scope = ANY (ARRAY['platform'::text, 'school'::text])))
```

</details>

<details><summary>Triggers (1)</summary>

```sql
CREATE TRIGGER trg_settings_changes_immutable BEFORE DELETE OR UPDATE ON public.settings_changes FOR EACH ROW EXECUTE FUNCTION app.settings_changes_immutable()
```

</details>

<details><summary>Indexes (3)</summary>

```sql
CREATE UNIQUE INDEX settings_changes_pkey ON public.settings_changes USING btree (id)
CREATE INDEX idx_settings_changes_at ON public.settings_changes USING btree (at DESC)
CREATE INDEX idx_settings_changes_school ON public.settings_changes USING btree (school_id, at DESC)
```

</details>

### Table audit_log

- **Kind:** table
- **Row-level security:** enabled, 1 policies
- **Grants:** `authenticated` delete/insert/references/select/trigger/update; `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **Written by routes:** `/api/admin/admissions/documents` (insert), `/api/admin/admissions/setup` (insert), `/api/admin/certificates` (insert), `/api/admin/counselling` (insert), `/api/admin/exams` (insert), `/api/admin/health` (insert), `/api/admin/import` (insert), `/api/admin/import/[id]` (insert), `/api/admin/payroll` (insert/select), `/api/admin/payroll/export` (insert), `/api/admin/payroll/run` (insert), `/api/admin/people` (insert), `/api/admin/people/documents` (insert), `/api/admin/safeguarding` (insert), `/api/admin/students` (insert), `/api/admin/students/[id]` (insert), `/api/admin/students/[id]/documents` (insert), `/api/admin/students/[id]/health` (insert), `/api/admin/students/requests` (insert), `/api/admin/students/settings` (insert), `/api/admin/students/year` (insert), `/api/admin/subjects` (insert; maybe: select), `/api/admin/users/assignments` (insert), `/api/import/worker` (insert), `/api/ops/delivery` (insert), `/api/ops/desk/settings` (insert), `/api/ops/enquiries` (insert), `/api/ops/marketing` (insert; maybe: select), `/api/ops/me` (insert), `/api/ops/operators` (insert), `/api/ops/partners` (insert), `/api/ops/pipeline/settings` (insert), `/api/ops/qa` (insert), `/api/ops/requests` (insert), `/api/ops/schools` (insert; in SQL: select), `/api/ops/schools/[id]/access` (insert), `/api/ops/schools/[id]/account` (insert), `/api/ops/schools/[id]/classes` (insert), `/api/ops/schools/[id]/crm` (insert), `/api/ops/schools/[id]/import` (insert), `/api/ops/schools/[id]/import/[jobId]` (insert), `/api/ops/schools/[id]/people` (insert), `/api/ops/schools/[id]/people/[userId]` (insert), `/api/ops/schools/[id]/subjects` (insert; maybe: select), `/api/ops/schools/[id]/support` (insert), `/api/ops/territories` (insert), `/api/parent/documents` (insert), `/api/teacher/exams` (insert), `/api/teacher/outcomes` (insert), `/api/teacher/practicals` (insert), `/api/timeline` (insert)
- **Read by routes:** `/api/ops/audit`, `/api/ops/health`, `/api/ops/overview`, `/api/ops/schools/[id]`, `/api/ops/schools/[id]/inspect`, `/api/staff/ask`, `/api/whatsapp/simulate`, `/api/whatsapp/webhook`
- **Read directly by pages (browser, RLS):** `/admin (layout)`
- **SQL functions:** `app.audit()` insert, `app.audit_exam_marks()` insert, `app.audit_fields_only()` insert, `app.audit_students()` insert, `app.audit_touch_only()` insert, `ops_platform_health()` select, `ops_school_metrics()` select

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | bigint | not null |  |
| `at` | timestamp with time zone | not null | `now()` |
| `actor_id` | uuid |  |  |
| `actor_role` | text |  |  |
| `action` | text | not null |  |
| `table_name` | text | not null |  |
| `row_id` | text |  |  |
| `school_id` | uuid |  |  |
| `old_values` | jsonb |  |  |
| `new_values` | jsonb |  |  |

<details><summary>RLS policies (1)</summary>

- **audit_log_read** · SELECT · authenticated
  - USING `((( SELECT app.has_perm('audit.read'::text) AS has_perm) AND (school_id = ( SELECT app.current_school_id() AS current_school_id))) OR ( SELECT app.is_superadmin() AS is_superadmin))`

</details>

<details><summary>Indexes (3)</summary>

```sql
CREATE UNIQUE INDEX audit_log_pkey ON public.audit_log USING btree (id)
CREATE INDEX idx_audit_row ON public.audit_log USING btree (table_name, row_id)
CREATE INDEX idx_audit_school_at ON public.audit_log USING btree (school_id, at DESC)
```

</details>

## Living Record: student spine

### Table students

- **Kind:** table
- **Row-level security:** enabled, 1 policies
- **Grants:** `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `admission_applicants` via `applicant_id`, `auth.users` via `created_by`, `schools` via `school_id`, `users` via `user_id`
- **Referenced by:** `cc_memberships`, `certificates`, `counselling_cases`, `counselling_referrals`, `discipline_actions`, `emergency_contacts`, `enrolments`, `family_members`, `health_events`, `house_members`, `kirti_entries`, `sibling_links`, `student_change_requests`, `student_changes`, `student_documents`, `student_health`
- **Written by routes:** `/api/admin/certificates` (select/update; in SQL: select), `/api/admin/health` (select; in SQL: select/update), `/api/admin/students` (select/insert; in SQL: select), `/api/admin/students/[id]` (select/update; in SQL: select/update), `/api/admin/students/requests` (select; in SQL: select/update), `/api/admin/students/year` (in SQL: select/update)
- **Read by routes:** `/api/admin/admissions`, `/api/admin/admissions/application`, `/api/admin/admissions/offers`, `/api/admin/cocurricular`, `/api/admin/counselling`, `/api/admin/discipline`, `/api/admin/import`, `/api/admin/import/[id]`, `/api/admin/students/[id]/documents`, `/api/admin/students/[id]/health`, `/api/admin/students/applicants`, `/api/admin/students/settings`, `/api/admin/students/siblings`, `/api/import/worker`, `/api/ops/overview`, `/api/ops/schools/[id]`, `/api/ops/schools/[id]/import`, `/api/ops/schools/[id]/import/[jobId]`, `/api/parent/ask`, `/api/parent/conduct`, `/api/parent/documents`, `/api/parent/family`, `/api/parent/health`, `/api/parent/kirti`, `/api/portal/year-end`, `/api/student/kirti`, `/api/teacher/conduct`, `/api/teacher/health-alerts`, `/api/teacher/kirti`, `/api/timeline`, `/api/whatsapp/simulate`, `/api/whatsapp/webhook`
- **SQL functions:** `app.admission_floor()` select, `app.health_consent()` select, `health_consented()` select, `health_retention_purge()` select, `import_cc_memberships()` select, `import_certificates()` select, `import_documents()` select, `import_enrolments()` select, `import_family()` select/update, `import_health()` select, `import_health_events()` select, `import_house_members()` select, `import_kirti()` select, `import_students()` select/update/insert, `app.link_guardian_family()` select, `app.move_enrolment()` select, `app.next_admission_no()` select, `app.on_health_consent()` select, `app.on_student_login_change()` select/update/insert, `ops_subject_metrics()` select, `app.parent_of_student()` select, `student_correct()` select/update, `student_move()` select, `student_promote()` select/update, `student_renumber()` select, `student_sync_school()` select, `app.suggest_siblings()` select, `app.sync_student_login()` select

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `school_id` | uuid | not null |  |
| `user_id` | uuid |  |  |
| `admission_no` | text | not null |  |
| `status` | text | not null | `'active'::text` |
| `full_name` | text | not null |  |
| `aadhaar_name` | text |  |  |
| `gender` | text |  |  |
| `date_of_birth` | date |  |  |
| `photo_path` | text |  |  |
| `pen` | text |  |  |
| `apaar_id` | text |  |  |
| `aadhaar_cipher` | text |  |  |
| `aadhaar_last4` | text |  |  |
| `aadhaar_hash` | text |  |  |
| `no_aadhaar` | boolean | not null | `false` |
| `cbse_reg_no` | text |  |  |
| `board_roll_no` | text |  |  |
| `admitted_on` | date |  |  |
| `admitted_grade` | smallint |  |  |
| `previous_school` | text |  |  |
| `previous_status` | text |  |  |
| `previous_class` | text |  |  |
| `previous_tc_no` | text |  |  |
| `rte_seat` | boolean | not null | `false` |
| `rte_amount` | numeric(10,2) |  |  |
| `medium` | text |  |  |
| `indian_national` | boolean | not null | `true` |
| `left_on` | date |  |  |
| `leaving_reason` | text |  |  |
| `cancelled_at` | timestamp with time zone |  |  |
| `cancel_reason` | text |  |  |
| `applicant_id` | uuid |  |  |
| `import_job_id` | uuid |  |  |
| `created_by` | uuid |  |  |
| `created_at` | timestamp with time zone | not null | `now()` |
| `updated_at` | timestamp with time zone | not null | `now()` |
| `mother_tongue` | text |  |  |
| `social_category` | text |  |  |
| `religion` | text |  |  |
| `minority` | boolean |  |  |
| `bpl` | boolean |  |  |
| `aay` | boolean |  |  |
| `ews` | boolean |  |  |
| `family_income` | numeric(12,2) |  |  |
| `address` | jsonb |  |  |
| `permanent_address` | jsonb |  |  |
| `permanent_same` | boolean | not null | `true` |
| `distance_km` | numeric(6,2) |  |  |
| `family_code` | text |  |  |

<details><summary>Unique and check constraints</summary>

```sql
UNIQUE UNIQUE (user_id)
CHECK (((length(TRIM(BOTH FROM admission_no)) >= 1) AND (length(TRIM(BOTH FROM admission_no)) <= 30)))
CHECK ((status = ANY (ARRAY['active'::text, 'left'::text, 'cancelled'::text])))
CHECK (((length(TRIM(BOTH FROM full_name)) >= 1) AND (length(TRIM(BOTH FROM full_name)) <= 120)))
CHECK (((aadhaar_name IS NULL) OR (length(aadhaar_name) <= 120)))
CHECK ((gender = ANY (ARRAY['male'::text, 'female'::text, 'transgender'::text])))
CHECK (((date_of_birth IS NULL) OR ((date_of_birth >= '1980-01-01'::date) AND (date_of_birth <= '2100-01-01'::date))))
CHECK (((photo_path IS NULL) OR (length(photo_path) <= 300)))
CHECK ((pen ~ '^\d{11}$'::text))
CHECK ((apaar_id ~ '^\d{12}$'::text))
CHECK (((aadhaar_cipher IS NULL) OR (length(aadhaar_cipher) <= 200)))
CHECK ((aadhaar_last4 ~ '^\d{4}$'::text))
CHECK ((aadhaar_hash ~ '^[0-9a-f]{64}$'::text))
CHECK ((((aadhaar_cipher IS NULL) = (aadhaar_last4 IS NULL)) AND ((aadhaar_cipher IS NULL) = (aadhaar_hash IS NULL))))
CHECK ((NOT (no_aadhaar AND (aadhaar_cipher IS NOT NULL))))
CHECK (((cbse_reg_no IS NULL) OR ((length(cbse_reg_no) >= 1) AND (length(cbse_reg_no) <= 20))))
CHECK (((board_roll_no IS NULL) OR ((length(board_roll_no) >= 1) AND (length(board_roll_no) <= 20))))
CHECK (((admitted_grade >= '-3'::integer) AND (admitted_grade <= 12)))
CHECK (((previous_school IS NULL) OR (length(previous_school) <= 200)))
CHECK (((status = 'cancelled'::text) = (cancelled_at IS NOT NULL)))
CHECK ((previous_status = ANY (ARRAY['same_school'::text, 'other_school'::text, 'anganwadi_ecce'::text, 'not_studying'::text])))
CHECK (((previous_class IS NULL) OR (length(previous_class) <= 40)))
CHECK (((previous_tc_no IS NULL) OR (length(previous_tc_no) <= 40)))
CHECK (((rte_amount IS NULL) OR (rte_amount >= (0)::numeric)))
CHECK (((medium IS NULL) OR (length(medium) <= 40)))
CHECK (((leaving_reason IS NULL) OR (length(leaving_reason) <= 300)))
CHECK (((cancel_reason IS NULL) OR (length(cancel_reason) <= 300)))
CHECK (((mother_tongue IS NULL) OR (length(mother_tongue) <= 40)))
CHECK ((social_category = ANY (ARRAY['general'::text, 'sc'::text, 'st'::text, 'obc'::text])))
CHECK ((religion = ANY (ARRAY['hindu'::text, 'muslim'::text, 'christian'::text, 'sikh'::text, 'buddhist'::text, 'parsi'::text, 'jain'::text, 'other'::text])))
CHECK (((family_income IS NULL) OR (family_income >= (0)::numeric)))
CHECK (((address IS NULL) OR (jsonb_typeof(address) = 'object'::text)))
CHECK (((permanent_address IS NULL) OR (jsonb_typeof(permanent_address) = 'object'::text)))
CHECK (((distance_km IS NULL) OR ((distance_km >= (0)::numeric) AND (distance_km <= (500)::numeric))))
CHECK (((family_code IS NULL) OR ((length(family_code) >= 1) AND (length(family_code) <= 40))))
```

</details>

<details><summary>RLS policies (1)</summary>

- **students_read** · SELECT · authenticated
  - USING `((( SELECT app.has_perm('students.read'::text) AS has_perm) AND (school_id = ( SELECT app.current_school_id() AS current_school_id))) OR (user_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1    FROM guardians g   WHERE ((g.student_id = students.user_id) AND (g.parent_id = ( SELECT auth.uid() AS uid)) AND g.verified))) OR ( SELECT app.is_superadmin() AS is_superadmin))`

</details>

<details><summary>Triggers (4)</summary>

```sql
CREATE TRIGGER trg_touch_students BEFORE UPDATE ON public.students FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at()
CREATE TRIGGER trg_audit_students AFTER INSERT OR DELETE OR UPDATE ON public.students FOR EACH ROW EXECUTE FUNCTION app.audit_students()
CREATE TRIGGER trg_student_sync AFTER INSERT OR UPDATE OF admission_no, user_id ON public.students FOR EACH ROW EXECUTE FUNCTION app.on_student_change()
CREATE TRIGGER trg_student_family_code AFTER UPDATE OF family_code ON public.students FOR EACH ROW WHEN (((new.family_code IS NOT NULL) AND (new.family_code IS DISTINCT FROM old.family_code))) EXECUTE FUNCTION app.on_family_code_change()
```

</details>

<details><summary>Indexes (7)</summary>

```sql
CREATE UNIQUE INDEX students_pkey ON public.students USING btree (id)
CREATE UNIQUE INDEX students_user_id_key ON public.students USING btree (user_id)
CREATE UNIQUE INDEX students_admission_no ON public.students USING btree (school_id, lower(admission_no))
CREATE INDEX students_school ON public.students USING btree (school_id, status, full_name)
CREATE UNIQUE INDEX students_aadhaar ON public.students USING btree (school_id, aadhaar_hash) WHERE ((aadhaar_hash IS NOT NULL) AND (status <> 'cancelled'::text))
CREATE INDEX students_import_job ON public.students USING btree (import_job_id) WHERE (import_job_id IS NOT NULL)
CREATE INDEX students_family_code ON public.students USING btree (school_id, lower(family_code)) WHERE (family_code IS NOT NULL)
```

</details>

### Table student_changes

- **Kind:** table
- **Row-level security:** enabled, 1 policies
- **Grants:** `authenticated` select; `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `schools` via `school_id`, `students` via `student_id`, `auth.users` via `changed_by`
- **Written by routes:** `/api/admin/certificates` (insert), `/api/admin/health` (in SQL: insert), `/api/admin/students/[id]` (select/insert; in SQL: insert), `/api/admin/students/requests` (in SQL: insert)
- **SQL functions:** `import_students()` insert, `app.on_student_login_change()` insert, `student_correct()` insert

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | bigint | not null | `nextval('student_changes_id_seq'::regclass)` |
| `school_id` | uuid | not null |  |
| `student_id` | uuid | not null |  |
| `field` | text | not null |  |
| `old_value` | text |  |  |
| `new_value` | text |  |  |
| `reason` | text | not null |  |
| `changed_by` | uuid |  |  |
| `changed_by_kind` | text | not null | `'staff'::text` |
| `changed_at` | timestamp with time zone | not null | `now()` |

<details><summary>Unique and check constraints</summary>

```sql
CHECK ((field ~ '^[a-z_0-9]{1,40}$'::text))
CHECK (((old_value IS NULL) OR (length(old_value) <= 400)))
CHECK (((new_value IS NULL) OR (length(new_value) <= 400)))
CHECK (((length(TRIM(BOTH FROM reason)) >= 1) AND (length(TRIM(BOTH FROM reason)) <= 300)))
CHECK ((changed_by_kind = ANY (ARRAY['staff'::text, 'operator'::text, 'import'::text, 'system'::text])))
```

</details>

<details><summary>RLS policies (1)</summary>

- **student_changes_read** · SELECT · authenticated
  - USING `((( SELECT app.has_perm('students.read'::text) AS has_perm) AND (school_id = ( SELECT app.current_school_id() AS current_school_id))) OR ( SELECT app.is_superadmin() AS is_superadmin))`

</details>

<details><summary>Indexes (2)</summary>

```sql
CREATE UNIQUE INDEX student_changes_pkey ON public.student_changes USING btree (id)
CREATE INDEX student_changes_student ON public.student_changes USING btree (student_id, changed_at DESC)
```

</details>

### Table enrolments

- **Kind:** table
- **Row-level security:** enabled, 1 policies
- **Grants:** `authenticated` select; `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `schools` via `school_id`, `students` via `student_id`, `classes` via `class_id`, `auth.users` via `proposed_by`, `auth.users` via `approved_by`, `auth.users` via `finalised_by`
- **Written by routes:** `/api/admin/certificates` (select/update; in SQL: select/update/insert), `/api/admin/students` (select; in SQL: select/update/insert), `/api/admin/students/[id]` (select/update; in SQL: select/update/insert), `/api/admin/students/year` (select/update; in SQL: select/update/insert), `/api/teacher/outcomes` (select/update)
- **Read by routes:** `/api/admin/admissions`, `/api/admin/admissions/application`, `/api/admin/admissions/offers`, `/api/admin/health`, `/api/admin/import`, `/api/admin/import/[id]`, `/api/admin/students/[id]/documents`, `/api/admin/students/settings`, `/api/import/worker`, `/api/ops/schools/[id]/import`, `/api/ops/schools/[id]/import/[jobId]`, `/api/parent/ask`, `/api/parent/documents`, `/api/portal/year-end`, `/api/teacher/conduct`, `/api/teacher/health-alerts`, `/api/teacher/kirti`, `/api/timeline`, `/api/whatsapp/simulate`, `/api/whatsapp/webhook`
- **SQL functions:** `import_enrolments()` select/update/insert, `import_undo()` select, `app.move_enrolment()` select/update/insert, `app.on_student_login_change()` select/update, `student_promote()` select/update, `student_renumber()` select/update, `app.sync_student_login()` select

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `school_id` | uuid | not null |  |
| `student_id` | uuid | not null |  |
| `session` | text | not null |  |
| `grade` | smallint |  |  |
| `section` | text |  |  |
| `class_id` | uuid |  |  |
| `class_name` | text |  |  |
| `roll_no` | text |  |  |
| `stream` | text |  |  |
| `languages` | jsonb | not null | `'{}'::jsonb` |
| `vocational` | jsonb | not null | `'{}'::jsonb` |
| `facilities` | text[] | not null | `'{}'::text[]` |
| `starts_on` | date | not null |  |
| `ends_on` | date |  |  |
| `end_reason` | text |  |  |
| `proposed_outcome` | text |  |  |
| `proposed_note` | text |  |  |
| `proposed_by` | uuid |  |  |
| `proposed_at` | timestamp with time zone |  |  |
| `approved_by` | uuid |  |  |
| `approved_at` | timestamp with time zone |  |  |
| `returned_note` | text |  |  |
| `outcome` | text |  |  |
| `finalised_by` | uuid |  |  |
| `finalised_at` | timestamp with time zone |  |  |
| `published_at` | timestamp with time zone |  |  |
| `import_job_id` | uuid |  |  |
| `created_at` | timestamp with time zone | not null | `now()` |
| `updated_at` | timestamp with time zone | not null | `now()` |

<details><summary>Unique and check constraints</summary>

```sql
CHECK ((session ~ '^\d{4}-\d{2}$'::text))
CHECK (((grade >= '-3'::integer) AND (grade <= 12)))
CHECK (((section IS NULL) OR ((length(section) >= 1) AND (length(section) <= 10))))
CHECK (((class_name IS NULL) OR ((length(class_name) >= 1) AND (length(class_name) <= 40))))
CHECK (((roll_no IS NULL) OR ((length(roll_no) >= 1) AND (length(roll_no) <= 12))))
CHECK ((stream = ANY (ARRAY['science'::text, 'commerce'::text, 'humanities'::text, 'vocational'::text, 'other'::text])))
CHECK ((jsonb_typeof(languages) = 'object'::text))
CHECK ((jsonb_typeof(vocational) = 'object'::text))
CHECK ((end_reason = ANY (ARRAY['class_change'::text, 'promoted'::text, 'retained'::text, 'left'::text, 'correction'::text])))
CHECK (((ends_on IS NULL) OR (ends_on >= starts_on)))
CHECK (((ends_on IS NULL) = (end_reason IS NULL)))
CHECK ((proposed_outcome = ANY (ARRAY['promoted'::text, 'detained'::text, 'promoted_no_exam'::text, 'dropout'::text, 'repeater'::text, 'left'::text])))
CHECK (((proposed_note IS NULL) OR (length(proposed_note) <= 300)))
CHECK (((returned_note IS NULL) OR (length(returned_note) <= 300)))
CHECK ((outcome = ANY (ARRAY['promoted'::text, 'detained'::text, 'promoted_no_exam'::text, 'dropout'::text, 'repeater'::text, 'left'::text])))
CHECK (((outcome IS NULL) = (finalised_at IS NULL)))
CHECK (((approved_at IS NULL) OR (proposed_at IS NOT NULL)))
```

</details>

<details><summary>RLS policies (1)</summary>

- **enrolments_read** · SELECT · authenticated
  - USING `((( SELECT app.has_perm('students.read'::text) AS has_perm) AND (school_id = ( SELECT app.current_school_id() AS current_school_id))) OR (EXISTS ( SELECT 1    FROM students s   WHERE ((s.id = enrolments.student_id) AND ((s.user_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1            FROM guardians g           WHERE ((g.student_id = s.user_id) AND (g.parent_id = ( SELECT auth.uid() AS uid)) AND g.verified))))))) OR ( SELECT app.is_superadmin() AS is_superadmin))`

</details>

<details><summary>Triggers (3)</summary>

```sql
CREATE TRIGGER trg_touch_enrolments BEFORE UPDATE ON public.enrolments FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at()
CREATE TRIGGER trg_audit_enrolments AFTER INSERT OR DELETE OR UPDATE ON public.enrolments FOR EACH ROW EXECUTE FUNCTION app.audit()
CREATE TRIGGER trg_enrolment_sync AFTER INSERT OR DELETE OR UPDATE OF class_name, session, starts_on, ends_on ON public.enrolments FOR EACH ROW EXECUTE FUNCTION app.on_enrolment_change()
```

</details>

<details><summary>Indexes (5)</summary>

```sql
CREATE UNIQUE INDEX enrolments_pkey ON public.enrolments USING btree (id)
CREATE UNIQUE INDEX enrolments_open ON public.enrolments USING btree (student_id) WHERE (ends_on IS NULL)
CREATE INDEX enrolments_student ON public.enrolments USING btree (student_id, session, starts_on)
CREATE INDEX enrolments_school_session ON public.enrolments USING btree (school_id, session, grade, section)
CREATE INDEX enrolments_import_job ON public.enrolments USING btree (import_job_id) WHERE (import_job_id IS NOT NULL)
```

</details>

### Table family_members

- **Kind:** table
- **Row-level security:** enabled, 1 policies
- **Grants:** `authenticated` select; `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `schools` via `school_id`, `students` via `student_id`, `users` via `user_id`, `auth.users` via `created_by`
- **Referenced by:** `emergency_contacts`
- **Written by routes:** `/api/admin/health` (select/update/insert), `/api/admin/import` (in SQL: select/update), `/api/admin/import/[id]` (in SQL: select/update), `/api/admin/students` (insert), `/api/admin/students/[id]` (select/update/insert/delete), `/api/admin/students/requests` (select/update/insert), `/api/import/worker` (in SQL: select/update), `/api/ops/schools/[id]/import` (in SQL: select/update), `/api/ops/schools/[id]/import/[jobId]` (in SQL: select/update)
- **Read by routes:** `/api/admin/admissions`, `/api/admin/admissions/application`, `/api/admin/admissions/offers`, `/api/admin/certificates`, `/api/parent/family`, `/api/parent/health`
- **SQL functions:** `import_family()` select/update/insert, `import_undo()` select/update, `app.link_guardian_family()` select/update/insert, `app.suggest_siblings()` select

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `school_id` | uuid | not null |  |
| `student_id` | uuid | not null |  |
| `relation` | text | not null |  |
| `name` | text | not null |  |
| `phone` | text |  |  |
| `email` | text |  |  |
| `education` | text |  |  |
| `occupation` | text |  |  |
| `annual_income` | numeric(12,2) |  |  |
| `is_primary` | boolean | not null | `false` |
| `lives_with` | boolean | not null | `true` |
| `user_id` | uuid |  |  |
| `import_job_id` | uuid |  |  |
| `created_by` | uuid |  |  |
| `created_at` | timestamp with time zone | not null | `now()` |
| `updated_at` | timestamp with time zone | not null | `now()` |

<details><summary>Unique and check constraints</summary>

```sql
CHECK (((occupation IS NULL) OR (length(occupation) <= 80)))
CHECK ((relation = ANY (ARRAY['mother'::text, 'father'::text, 'guardian'::text, 'grandparent'::text, 'sibling'::text, 'other'::text])))
CHECK (((length(TRIM(BOTH FROM name)) >= 1) AND (length(TRIM(BOTH FROM name)) <= 120)))
CHECK (((phone IS NULL) OR (phone ~ '^\+?\d{10,13}$'::text)))
CHECK (((email IS NULL) OR ((length(email) <= 160) AND (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'::text))))
CHECK ((education = ANY (ARRAY['none'::text, 'primary'::text, 'upper_primary'::text, 'secondary'::text, 'higher_secondary'::text, 'graduate'::text, 'post_graduate'::text, 'other'::text])))
CHECK (((annual_income IS NULL) OR (annual_income >= (0)::numeric)))
```

</details>

<details><summary>RLS policies (1)</summary>

- **family_members_read** · SELECT · authenticated
  - USING `((( SELECT app.has_perm('students.read'::text) AS has_perm) AND (school_id = ( SELECT app.current_school_id() AS current_school_id))) OR app.parent_of_student(student_id) OR ( SELECT app.is_superadmin() AS is_superadmin))`

</details>

<details><summary>Triggers (3)</summary>

```sql
CREATE TRIGGER trg_touch_family_members BEFORE UPDATE ON public.family_members FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at()
CREATE TRIGGER trg_audit_family_members AFTER INSERT OR DELETE OR UPDATE ON public.family_members FOR EACH ROW EXECUTE FUNCTION app.audit()
CREATE TRIGGER trg_family_siblings AFTER INSERT OR UPDATE OF phone, user_id ON public.family_members FOR EACH ROW EXECUTE FUNCTION app.on_family_change()
```

</details>

<details><summary>Indexes (6)</summary>

```sql
CREATE UNIQUE INDEX family_members_pkey ON public.family_members USING btree (id)
CREATE INDEX family_members_student ON public.family_members USING btree (student_id)
CREATE INDEX family_members_phone ON public.family_members USING btree (school_id, app.phone_key(phone)) WHERE (phone IS NOT NULL)
CREATE INDEX family_members_user ON public.family_members USING btree (user_id) WHERE (user_id IS NOT NULL)
CREATE INDEX family_members_import_job ON public.family_members USING btree (import_job_id) WHERE (import_job_id IS NOT NULL)
CREATE UNIQUE INDEX family_members_primary ON public.family_members USING btree (student_id) WHERE is_primary
```

</details>

### Table emergency_contacts

- **Kind:** table
- **Row-level security:** enabled, 1 policies
- **Grants:** `authenticated` select; `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `schools` via `school_id`, `students` via `student_id`, `family_members` via `family_member_id`
- **Written by routes:** `/api/admin/health` (select/update/insert/delete), `/api/admin/students/[id]` (select/update/insert/delete), `/api/admin/students/requests` (select/update/insert/delete)
- **Read by routes:** `/api/admin/import`, `/api/admin/import/[id]`, `/api/import/worker`, `/api/ops/schools/[id]/import`, `/api/ops/schools/[id]/import/[jobId]`, `/api/parent/family`
- **SQL functions:** `import_family()` select/update/insert, `import_undo()` select

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `school_id` | uuid | not null |  |
| `student_id` | uuid | not null |  |
| `position` | smallint | not null |  |
| `family_member_id` | uuid |  |  |
| `name` | text |  |  |
| `relation` | text |  |  |
| `phone` | text |  |  |
| `import_job_id` | uuid |  |  |
| `created_at` | timestamp with time zone | not null | `now()` |
| `updated_at` | timestamp with time zone | not null | `now()` |

<details><summary>Unique and check constraints</summary>

```sql
UNIQUE UNIQUE (student_id, "position") DEFERRABLE INITIALLY DEFERRED
CHECK ((("position" >= 1) AND ("position" <= 3)))
CHECK (((name IS NULL) OR ((length(TRIM(BOTH FROM name)) >= 1) AND (length(TRIM(BOTH FROM name)) <= 120))))
CHECK (((relation IS NULL) OR (length(relation) <= 40)))
CHECK (((phone IS NULL) OR (phone ~ '^\+?\d{10,13}$'::text)))
CHECK (((family_member_id IS NOT NULL) OR ((name IS NOT NULL) AND (phone IS NOT NULL))))
```

</details>

<details><summary>RLS policies (1)</summary>

- **emergency_contacts_read** · SELECT · authenticated
  - USING `((( SELECT app.has_perm('students.read'::text) AS has_perm) AND (school_id = ( SELECT app.current_school_id() AS current_school_id))) OR app.parent_of_student(student_id) OR ( SELECT app.is_superadmin() AS is_superadmin))`

</details>

<details><summary>Triggers (2)</summary>

```sql
CREATE TRIGGER trg_touch_emergency_contacts BEFORE UPDATE ON public.emergency_contacts FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at()
CREATE TRIGGER trg_audit_emergency_contacts AFTER INSERT OR DELETE OR UPDATE ON public.emergency_contacts FOR EACH ROW EXECUTE FUNCTION app.audit()
```

</details>

<details><summary>Indexes (3)</summary>

```sql
CREATE UNIQUE INDEX emergency_contacts_pkey ON public.emergency_contacts USING btree (id)
CREATE UNIQUE INDEX emergency_contacts_student_id_position_key ON public.emergency_contacts USING btree (student_id, "position")
CREATE INDEX emergency_contacts_import_job ON public.emergency_contacts USING btree (import_job_id) WHERE (import_job_id IS NOT NULL)
```

</details>

### Table sibling_links

- **Kind:** table
- **Row-level security:** enabled, 1 policies
- **Grants:** `authenticated` select; `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `schools` via `school_id`, `students` via `a`, `students` via `b`, `auth.users` via `decided_by`
- **Written by routes:** `/api/admin/students/[id]` (select/update/insert)
- **Read by routes:** `/api/admin/cocurricular`, `/api/admin/import`, `/api/admin/import/[id]`, `/api/admin/students/siblings`, `/api/import/worker`, `/api/ops/schools/[id]/import`, `/api/ops/schools/[id]/import/[jobId]`
- **SQL functions:** `import_undo()` select, `app.suggest_siblings()` insert

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `school_id` | uuid | not null |  |
| `a` | uuid | not null |  |
| `b` | uuid | not null |  |
| `status` | text | not null | `'suggested'::text` |
| `source` | text | not null |  |
| `decided_by` | uuid |  |  |
| `decided_at` | timestamp with time zone |  |  |
| `created_at` | timestamp with time zone | not null | `now()` |
| `updated_at` | timestamp with time zone | not null | `now()` |

<details><summary>Unique and check constraints</summary>

```sql
UNIQUE UNIQUE (a, b)
CHECK ((a < b))
CHECK ((status = ANY (ARRAY['suggested'::text, 'confirmed'::text, 'rejected'::text])))
CHECK ((source = ANY (ARRAY['phone'::text, 'login'::text, 'family_code'::text, 'office'::text])))
```

</details>

<details><summary>RLS policies (1)</summary>

- **sibling_links_read** · SELECT · authenticated
  - USING `((( SELECT app.has_perm('students.read'::text) AS has_perm) AND (school_id = ( SELECT app.current_school_id() AS current_school_id))) OR ( SELECT app.is_superadmin() AS is_superadmin))`

</details>

<details><summary>Triggers (2)</summary>

```sql
CREATE TRIGGER trg_touch_sibling_links BEFORE UPDATE ON public.sibling_links FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at()
CREATE TRIGGER trg_audit_sibling_links AFTER INSERT OR DELETE OR UPDATE ON public.sibling_links FOR EACH ROW EXECUTE FUNCTION app.audit('status')
```

</details>

<details><summary>Indexes (4)</summary>

```sql
CREATE UNIQUE INDEX sibling_links_pkey ON public.sibling_links USING btree (id)
CREATE UNIQUE INDEX sibling_links_a_b_key ON public.sibling_links USING btree (a, b)
CREATE INDEX sibling_links_b ON public.sibling_links USING btree (b)
CREATE INDEX sibling_links_open ON public.sibling_links USING btree (school_id) WHERE (status = 'suggested'::text)
```

</details>

### Table student_change_requests

- **Kind:** table
- **Row-level security:** enabled, 1 policies
- **Grants:** `authenticated` select; `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `schools` via `school_id`, `students` via `student_id`, `users` via `requested_by`, `auth.users` via `decided_by`
- **Written by routes:** `/api/admin/health` (select/update), `/api/admin/students/requests` (select/update), `/api/parent/documents` (select/insert), `/api/parent/family` (select/insert), `/api/parent/health` (select/insert)
- **Read by routes:** `/api/admin/import`, `/api/admin/import/[id]`, `/api/admin/students/[id]`, `/api/import/worker`, `/api/ops/schools/[id]/import`, `/api/ops/schools/[id]/import/[jobId]`
- **SQL functions:** `import_undo()` select

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `school_id` | uuid | not null |  |
| `student_id` | uuid | not null |  |
| `requested_by` | uuid | not null |  |
| `kind` | text | not null |  |
| `target_id` | uuid |  |  |
| `proposed` | jsonb | not null |  |
| `note` | text |  |  |
| `status` | text | not null | `'pending'::text` |
| `decided_by` | uuid |  |  |
| `decided_at` | timestamp with time zone |  |  |
| `decision_note` | text |  |  |
| `created_at` | timestamp with time zone | not null | `now()` |
| `updated_at` | timestamp with time zone | not null | `now()` |

<details><summary>Unique and check constraints</summary>

```sql
CHECK ((jsonb_typeof(proposed) = 'object'::text))
CHECK (((note IS NULL) OR (length(note) <= 300)))
CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'withdrawn'::text])))
CHECK (((decision_note IS NULL) OR (length(decision_note) <= 300)))
CHECK ((kind = ANY (ARRAY['address'::text, 'family'::text, 'emergency'::text, 'health'::text, 'document_erasure'::text])))
```

</details>

<details><summary>RLS policies (1)</summary>

- **student_change_requests_read** · SELECT · authenticated
  - USING `((( SELECT app.has_perm('students.read'::text) AS has_perm) AND (school_id = ( SELECT app.current_school_id() AS current_school_id))) OR (requested_by = ( SELECT auth.uid() AS uid)) OR ( SELECT app.is_superadmin() AS is_superadmin))`

</details>

<details><summary>Triggers (2)</summary>

```sql
CREATE TRIGGER trg_touch_student_change_requests BEFORE UPDATE ON public.student_change_requests FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at()
CREATE TRIGGER trg_audit_student_change_requests AFTER INSERT OR UPDATE ON public.student_change_requests FOR EACH ROW EXECUTE FUNCTION app.audit('status')
```

</details>

<details><summary>Indexes (3)</summary>

```sql
CREATE UNIQUE INDEX student_change_requests_pkey ON public.student_change_requests USING btree (id)
CREATE INDEX student_change_requests_open ON public.student_change_requests USING btree (school_id, created_at) WHERE (status = 'pending'::text)
CREATE INDEX student_change_requests_student ON public.student_change_requests USING btree (student_id, created_at DESC)
```

</details>

### Table legacy_results

- **Kind:** table
- **Row-level security:** enabled, 1 policies
- **Grants:** `authenticated` select; `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `users` via `student_id`, `import_jobs` via `import_job_id`, `schools` via `school_id`
- **SQL functions:** `import_legacy_results()` select/update/insert

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `school_id` | uuid | not null |  |
| `student_id` | uuid | not null |  |
| `session` | text | not null |  |
| `class_name` | text |  |  |
| `term` | text | not null |  |
| `subject` | text | not null |  |
| `marks` | numeric(7,2) |  |  |
| `max_marks` | numeric(7,2) |  |  |
| `grade` | text |  |  |
| `code` | text |  |  |
| `import_job_id` | uuid |  |  |
| `created_at` | timestamp with time zone | not null | `now()` |
| `updated_at` | timestamp with time zone | not null | `now()` |

<details><summary>Unique and check constraints</summary>

```sql
UNIQUE UNIQUE (student_id, session, term, subject)
CHECK ((session ~ '^\d{4}-\d{2}$'::text))
CHECK (((class_name IS NULL) OR ((length(class_name) >= 1) AND (length(class_name) <= 40))))
CHECK (((length(term) >= 1) AND (length(term) <= 60)))
CHECK (((length(subject) >= 1) AND (length(subject) <= 80)))
CHECK (((marks IS NULL) OR (marks >= (0)::numeric)))
CHECK (((max_marks IS NULL) OR (max_marks > (0)::numeric)))
CHECK (((grade IS NULL) OR ((length(grade) >= 1) AND (length(grade) <= 8))))
CHECK (((code IS NULL) OR (code = ANY (ARRAY['AB'::text, 'ML'::text, 'EX'::text]))))
CHECK (((marks IS NULL) OR (max_marks IS NULL) OR (marks <= max_marks)))
CHECK (((code IS NULL) OR (marks IS NULL)))
CHECK (((marks IS NOT NULL) OR (grade IS NOT NULL) OR (code IS NOT NULL)))
```

</details>

<details><summary>RLS policies (1)</summary>

- **legacy_results_read** · SELECT · authenticated
  - USING `((( SELECT app.has_perm('exams.read'::text) AS has_perm) AND (school_id = ( SELECT app.current_school_id() AS current_school_id))) OR (student_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1    FROM guardians g   WHERE ((g.student_id = legacy_results.student_id) AND (g.parent_id = ( SELECT auth.uid() AS uid)) AND g.verified))) OR ( SELECT app.is_superadmin() AS is_superadmin))`

</details>

<details><summary>Triggers (2)</summary>

```sql
CREATE TRIGGER trg_touch_legacy_results BEFORE UPDATE ON public.legacy_results FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at()
CREATE TRIGGER trg_audit_legacy_results AFTER INSERT OR DELETE OR UPDATE ON public.legacy_results FOR EACH ROW EXECUTE FUNCTION app.audit()
```

</details>

<details><summary>Indexes (4)</summary>

```sql
CREATE UNIQUE INDEX legacy_results_pkey ON public.legacy_results USING btree (id)
CREATE UNIQUE INDEX legacy_results_student_id_session_term_subject_key ON public.legacy_results USING btree (student_id, session, term, subject)
CREATE INDEX legacy_results_school ON public.legacy_results USING btree (school_id, session)
CREATE INDEX legacy_results_import_job ON public.legacy_results USING btree (import_job_id) WHERE (import_job_id IS NOT NULL)
```

</details>

## Living Record: health & documents

### Table student_health

- **Kind:** table
- **Row-level security:** enabled, 1 policies
- **Grants:** `authenticated` select; `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `students` via `student_id`, `schools` via `school_id`, `auth.users` via `updated_by`
- **Written by routes:** `/api/admin/health` (select/update/insert), `/api/admin/students/[id]/health` (select/update/insert), `/api/admin/students/requests` (select/update/insert)
- **Read by routes:** `/api/admin/import`, `/api/admin/import/[id]`, `/api/import/worker`, `/api/ops/schools/[id]/import`, `/api/ops/schools/[id]/import/[jobId]`, `/api/parent/health`, `/api/teacher/health-alerts`
- **SQL functions:** `app.erase_health()` update, `health_retention_purge()` select, `import_health()` select/update/insert, `import_undo()` select

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `student_id` | uuid | not null |  |
| `school_id` | uuid | not null |  |
| `blood_group` | text |  |  |
| `height_cm` | numeric(5,1) |  |  |
| `weight_kg` | numeric(5,1) |  |  |
| `measured_on` | date |  |  |
| `cwsn` | boolean | not null | `false` |
| `impairments` | text[] | not null | `'{}'::text[]` |
| `disability_certificate` | boolean |  |  |
| `disability_percent` | smallint |  |  |
| `screening` | jsonb | not null | `'{}'::jsonb` |
| `allergies` | jsonb | not null | `'[]'::jsonb` |
| `conditions` | jsonb | not null | `'[]'::jsonb` |
| `medication` | jsonb | not null | `'[]'::jsonb` |
| `keep_after_leaving` | boolean | not null | `false` |
| `legal_hold` | boolean | not null | `false` |
| `erased_at` | timestamp with time zone |  |  |
| `erased_reason` | text |  |  |
| `import_job_id` | uuid |  |  |
| `updated_by` | uuid |  |  |
| `created_at` | timestamp with time zone | not null | `now()` |
| `updated_at` | timestamp with time zone | not null | `now()` |

<details><summary>Unique and check constraints</summary>

```sql
UNIQUE UNIQUE (student_id)
CHECK ((jsonb_typeof(allergies) = 'array'::text))
CHECK ((jsonb_typeof(conditions) = 'array'::text))
CHECK ((blood_group = ANY (ARRAY['A+'::text, 'A-'::text, 'B+'::text, 'B-'::text, 'AB+'::text, 'AB-'::text, 'O+'::text, 'O-'::text])))
CHECK (((height_cm IS NULL) OR ((height_cm >= (30)::numeric) AND (height_cm <= (250)::numeric))))
CHECK (((weight_kg IS NULL) OR ((weight_kg >= (5)::numeric) AND (weight_kg <= (250)::numeric))))
CHECK ((impairments <@ ARRAY['blindness'::text, 'low_vision'::text, 'hearing'::text, 'speech'::text, 'locomotor'::text, 'mental_illness'::text, 'specific_learning'::text, 'cerebral_palsy'::text, 'autism'::text, 'multiple'::text, 'intellectual'::text, 'other'::text]))
CHECK (((disability_percent IS NULL) OR ((disability_percent >= 0) AND (disability_percent <= 100))))
CHECK ((jsonb_typeof(screening) = 'object'::text))
CHECK ((jsonb_typeof(medication) = 'array'::text))
CHECK (((erased_reason IS NULL) OR (length(erased_reason) <= 200)))
```

</details>

<details><summary>RLS policies (1)</summary>

- **student_health_read** · SELECT · authenticated
  - USING `((( SELECT app.has_perm('health.read'::text) AS has_perm) AND (school_id = ( SELECT app.current_school_id() AS current_school_id))) OR ( SELECT app.is_superadmin() AS is_superadmin))`

</details>

<details><summary>Triggers (3)</summary>

```sql
CREATE TRIGGER trg_touch_student_health BEFORE UPDATE ON public.student_health FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at()
CREATE TRIGGER trg_audit_student_health AFTER INSERT OR DELETE OR UPDATE ON public.student_health FOR EACH ROW EXECUTE FUNCTION app.audit()
CREATE TRIGGER trg_guard_student_health BEFORE INSERT OR UPDATE ON public.student_health FOR EACH ROW EXECUTE FUNCTION app.guard_health()
```

</details>

<details><summary>Indexes (4)</summary>

```sql
CREATE UNIQUE INDEX student_health_pkey ON public.student_health USING btree (id)
CREATE UNIQUE INDEX student_health_student_id_key ON public.student_health USING btree (student_id)
CREATE INDEX student_health_school ON public.student_health USING btree (school_id)
CREATE INDEX student_health_import_job ON public.student_health USING btree (import_job_id) WHERE (import_job_id IS NOT NULL)
```

</details>

### Table health_events

- **Kind:** table
- **Row-level security:** enabled, 1 policies
- **Grants:** `authenticated` select; `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `schools` via `school_id`, `students` via `student_id`, `auth.users` via `recorded_by`
- **Written by routes:** `/api/admin/students/[id]/health` (select/insert/delete)
- **Read by routes:** `/api/admin/import`, `/api/admin/import/[id]`, `/api/import/worker`, `/api/ops/schools/[id]/import`, `/api/ops/schools/[id]/import/[jobId]`, `/api/parent/ask`, `/api/parent/health`, `/api/timeline`, `/api/whatsapp/simulate`, `/api/whatsapp/webhook`
- **SQL functions:** `app.erase_health()` delete, `health_retention_purge()` select, `import_health_events()` select/insert, `import_undo()` select

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `school_id` | uuid | not null |  |
| `student_id` | uuid | not null |  |
| `kind` | text | not null |  |
| `on_date` | date | not null |  |
| `data` | jsonb | not null | `'{}'::jsonb` |
| `note` | text |  |  |
| `recorded_by` | uuid |  |  |
| `import_job_id` | uuid |  |  |
| `created_at` | timestamp with time zone | not null | `now()` |
| `updated_at` | timestamp with time zone | not null | `now()` |

<details><summary>Unique and check constraints</summary>

```sql
CHECK ((kind = ANY (ARRAY['checkup'::text, 'vaccination'::text])))
CHECK (((on_date >= '1990-01-01'::date) AND (on_date <= '2100-01-01'::date)))
CHECK ((jsonb_typeof(data) = 'object'::text))
CHECK (((note IS NULL) OR (length(note) <= 500)))
```

</details>

<details><summary>RLS policies (1)</summary>

- **health_events_read** · SELECT · authenticated
  - USING `((( SELECT app.has_perm('health.read'::text) AS has_perm) AND (school_id = ( SELECT app.current_school_id() AS current_school_id))) OR ( SELECT app.is_superadmin() AS is_superadmin))`

</details>

<details><summary>Triggers (3)</summary>

```sql
CREATE TRIGGER trg_touch_health_events BEFORE UPDATE ON public.health_events FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at()
CREATE TRIGGER trg_audit_health_events AFTER INSERT OR DELETE OR UPDATE ON public.health_events FOR EACH ROW EXECUTE FUNCTION app.audit()
CREATE TRIGGER trg_guard_health_events BEFORE INSERT OR UPDATE ON public.health_events FOR EACH ROW EXECUTE FUNCTION app.guard_health()
```

</details>

<details><summary>Indexes (3)</summary>

```sql
CREATE UNIQUE INDEX health_events_pkey ON public.health_events USING btree (id)
CREATE INDEX health_events_student ON public.health_events USING btree (student_id, on_date DESC)
CREATE INDEX health_events_import_job ON public.health_events USING btree (import_job_id) WHERE (import_job_id IS NOT NULL)
```

</details>

### Table student_documents

- **Kind:** table
- **Row-level security:** enabled, 0 policies
- **Grants:** `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `users` via `uploaded_by`, `users` via `verified_by`, `schools` via `school_id`, `students` via `student_id`
- **Referenced by:** `admission_documents`, `kirti_entries`
- **Written by routes:** `/api/admin/cocurricular` (update/insert/select), `/api/admin/health` (select/delete), `/api/admin/students` (insert/select), `/api/admin/students/[id]/documents` (select/insert/update/delete), `/api/admin/students/requests` (select/delete), `/api/parent/documents` (select/insert/update), `/api/teacher/kirti` (insert/select)
- **Read by routes:** `/api/admin/import`, `/api/admin/import/[id]`, `/api/import/worker`, `/api/ops/schools/[id]/import`, `/api/ops/schools/[id]/import/[jobId]`, `/api/parent/ask`, `/api/timeline`, `/api/whatsapp/simulate`, `/api/whatsapp/webhook`
- **SQL functions:** `import_documents()` select/update/insert, `import_undo()` select

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `school_id` | uuid | not null |  |
| `student_id` | uuid | not null |  |
| `kind` | text | not null |  |
| `title` | text | not null |  |
| `document_no` | text |  |  |
| `issued_on` | date |  |  |
| `valid_until` | date |  |  |
| `storage_path` | text | not null |  |
| `file_name` | text | not null |  |
| `size_bytes` | bigint |  |  |
| `inline_type` | text |  |  |
| `status` | text | not null | `'awaiting'::text` |
| `source` | text | not null |  |
| `uploaded_by` | uuid |  |  |
| `verified_by` | uuid |  |  |
| `verified_at` | timestamp with time zone |  |  |
| `reject_note` | text |  |  |
| `import_job_id` | uuid |  |  |
| `created_at` | timestamp with time zone | not null | `now()` |
| `updated_at` | timestamp with time zone | not null | `now()` |

<details><summary>Unique and check constraints</summary>

```sql
UNIQUE UNIQUE (storage_path)
CHECK ((kind ~ '^[a-z_]{2,40}$'::text))
CHECK (((length(TRIM(BOTH FROM title)) >= 1) AND (length(TRIM(BOTH FROM title)) <= 120)))
CHECK (((document_no IS NULL) OR (length(document_no) <= 60)))
CHECK (((valid_until IS NULL) OR (issued_on IS NULL) OR (valid_until >= issued_on)))
CHECK ((length(storage_path) <= 400))
CHECK (((length(file_name) >= 1) AND (length(file_name) <= 200)))
CHECK (((size_bytes IS NULL) OR ((size_bytes >= 0) AND (size_bytes <= 26214400))))
CHECK (((inline_type IS NULL) OR (inline_type = ANY (ARRAY['application/pdf'::text, 'image/jpeg'::text, 'image/png'::text, 'image/webp'::text, 'image/gif'::text, 'none'::text]))))
CHECK ((status = ANY (ARRAY['awaiting'::text, 'verified'::text, 'rejected'::text])))
CHECK (((reject_note IS NULL) OR (length(reject_note) <= 300)))
CHECK (((status <> 'verified'::text) OR (verified_at IS NOT NULL)))
CHECK (((status <> 'rejected'::text) OR (reject_note IS NOT NULL)))
CHECK ((source = ANY (ARRAY['office'::text, 'parent'::text, 'import'::text, 'admission'::text])))
```

</details>

<details><summary>Triggers (2)</summary>

```sql
CREATE TRIGGER trg_touch_student_documents BEFORE UPDATE ON public.student_documents FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at()
CREATE TRIGGER trg_audit_student_documents AFTER INSERT OR DELETE OR UPDATE ON public.student_documents FOR EACH ROW EXECUTE FUNCTION app.audit()
```

</details>

<details><summary>Indexes (5)</summary>

```sql
CREATE UNIQUE INDEX student_documents_pkey ON public.student_documents USING btree (id)
CREATE UNIQUE INDEX student_documents_storage_path_key ON public.student_documents USING btree (storage_path)
CREATE INDEX student_documents_student ON public.student_documents USING btree (student_id, kind)
CREATE INDEX student_documents_awaiting ON public.student_documents USING btree (school_id, created_at) WHERE (status = 'awaiting'::text)
CREATE INDEX student_documents_import_job ON public.student_documents USING btree (import_job_id) WHERE (import_job_id IS NOT NULL)
```

</details>

### Table certificates

- **Kind:** table
- **Row-level security:** enabled, 0 policies
- **Grants:** `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `users` via `approved_by`, `users` via `cancelled_by`, `schools` via `school_id`, `students` via `student_id`, `certificate_types` via `type_id`, `certificates` via `duplicate_of`, `users` via `prepared_by`
- **Written by routes:** `/api/admin/certificates` (select/insert/update/delete; in SQL: select/update)
- **Read by routes:** `/api/admin/import`, `/api/admin/import/[id]`, `/api/import/worker`, `/api/ops/schools/[id]/import`, `/api/ops/schools/[id]/import/[jobId]`, `/api/parent/ask`, `/api/timeline`, `/api/whatsapp/simulate`, `/api/whatsapp/webhook`
- **Read directly by pages (browser, RLS):** `/verify/[token]`
- **SQL functions:** `certificate_issue()` select/update, `import_certificates()` select/update/insert, `import_undo()` select

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `school_id` | uuid | not null |  |
| `student_id` | uuid | not null |  |
| `type_id` | uuid | not null |  |
| `status` | text | not null | `'draft'::text` |
| `serial` | integer |  |  |
| `number` | text |  |  |
| `copy_no` | smallint | not null | `0` |
| `duplicate_of` | uuid |  |  |
| `data` | jsonb | not null | `'{}'::jsonb` |
| `issued_on` | date |  |  |
| `dues` | numeric(12,2) |  |  |
| `dues_override` | text |  |  |
| `prepared_by` | uuid |  |  |
| `submitted_at` | timestamp with time zone |  |  |
| `returned_note` | text |  |  |
| `approved_by` | uuid |  |  |
| `approved_at` | timestamp with time zone |  |  |
| `cancelled_by` | uuid |  |  |
| `cancelled_at` | timestamp with time zone |  |  |
| `cancel_reason` | text |  |  |
| `verify_token` | text | not null | `replace((gen_random_uuid())::text, '-'::text, ''::text)` |
| `pdf_path` | text |  |  |
| `source` | text | not null | `'sthara'::text` |
| `portal_ref` | text |  |  |
| `import_job_id` | uuid |  |  |
| `created_at` | timestamp with time zone | not null | `now()` |
| `updated_at` | timestamp with time zone | not null | `now()` |

<details><summary>Unique and check constraints</summary>

```sql
UNIQUE UNIQUE (verify_token)
CHECK ((status = ANY (ARRAY['draft'::text, 'pending'::text, 'issued'::text, 'cancelled'::text])))
CHECK (((serial IS NULL) OR (serial > 0)))
CHECK (((number IS NULL) OR (length(number) <= 40)))
CHECK (((copy_no >= 0) AND (copy_no <= 20)))
CHECK (((copy_no = 0) = (duplicate_of IS NULL)))
CHECK ((jsonb_typeof(data) = 'object'::text))
CHECK (((status <> ALL (ARRAY['issued'::text, 'cancelled'::text])) OR ((number IS NOT NULL) AND (issued_on IS NOT NULL)) OR (source = 'portal'::text)))
CHECK (((dues IS NULL) OR (dues >= (0)::numeric)))
CHECK (((dues_override IS NULL) OR ((length(dues_override) >= 3) AND (length(dues_override) <= 300))))
CHECK (((returned_note IS NULL) OR (length(returned_note) <= 300)))
CHECK (((cancel_reason IS NULL) OR ((length(cancel_reason) >= 3) AND (length(cancel_reason) <= 300))))
CHECK (((status <> 'cancelled'::text) OR (cancel_reason IS NOT NULL)))
CHECK (((pdf_path IS NULL) OR (length(pdf_path) <= 300)))
CHECK ((source = ANY (ARRAY['sthara'::text, 'portal'::text, 'import'::text])))
CHECK (((portal_ref IS NULL) OR (length(portal_ref) <= 60)))
```

</details>

<details><summary>Triggers (3)</summary>

```sql
CREATE TRIGGER trg_touch_certificates BEFORE UPDATE ON public.certificates FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at()
CREATE TRIGGER trg_audit_certificates AFTER INSERT OR DELETE OR UPDATE ON public.certificates FOR EACH ROW EXECUTE FUNCTION app.audit('status')
CREATE TRIGGER trg_guard_certificates BEFORE DELETE OR UPDATE ON public.certificates FOR EACH ROW EXECUTE FUNCTION app.guard_certificate()
```

</details>

<details><summary>Indexes (6)</summary>

```sql
CREATE UNIQUE INDEX certificates_pkey ON public.certificates USING btree (id)
CREATE UNIQUE INDEX certificates_verify_token_key ON public.certificates USING btree (verify_token)
CREATE UNIQUE INDEX certificates_number ON public.certificates USING btree (type_id, serial, copy_no) WHERE (serial IS NOT NULL)
CREATE INDEX certificates_student ON public.certificates USING btree (student_id, created_at DESC)
CREATE INDEX certificates_open ON public.certificates USING btree (school_id, status) WHERE (status = ANY (ARRAY['draft'::text, 'pending'::text]))
CREATE INDEX certificates_import_job ON public.certificates USING btree (import_job_id) WHERE (import_job_id IS NOT NULL)
```

</details>

### Table certificate_settings

- **Kind:** table
- **Row-level security:** enabled, 0 policies
- **Grants:** `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (school_id)`
- **References:** `schools` via `school_id`, `users` via `updated_by`
- **Written by routes:** `/api/admin/certificates` (select/upsert)

| Column | Type | Null | Default |
|---|---|---|---|
| `school_id` | uuid | not null |  |
| `tc_mode` | text | not null | `'sthara'::text` |
| `udise_code` | text |  |  |
| `principal_name` | text |  |  |
| `signature` | text |  |  |
| `stamp` | text |  |  |
| `updated_by` | uuid |  |  |
| `updated_at` | timestamp with time zone | not null | `now()` |

<details><summary>Unique and check constraints</summary>

```sql
CHECK ((tc_mode = ANY (ARRAY['sthara'::text, 'portal'::text])))
CHECK (((udise_code IS NULL) OR (udise_code ~ '^\d{11}$'::text)))
CHECK (((principal_name IS NULL) OR (length(principal_name) <= 120)))
CHECK (((signature IS NULL) OR ((signature ~ '^data:image/(png|jpeg);base64,'::text) AND (length(signature) <= 400000))))
CHECK (((stamp IS NULL) OR ((stamp ~ '^data:image/(png|jpeg);base64,'::text) AND (length(stamp) <= 400000))))
```

</details>

<details><summary>Triggers (2)</summary>

```sql
CREATE TRIGGER trg_touch_certificate_settings BEFORE UPDATE ON public.certificate_settings FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at()
CREATE TRIGGER trg_audit_certificate_settings AFTER INSERT OR DELETE OR UPDATE ON public.certificate_settings FOR EACH ROW EXECUTE FUNCTION app.audit()
```

</details>

<details><summary>Indexes (1)</summary>

```sql
CREATE UNIQUE INDEX certificate_settings_pkey ON public.certificate_settings USING btree (school_id)
```

</details>

### Table certificate_types

- **Kind:** table
- **Row-level security:** enabled, 0 policies
- **Grants:** `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `schools` via `school_id`, `users` via `created_by`
- **Referenced by:** `certificates`
- **Written by routes:** `/api/admin/certificates` (select/insert/update; in SQL: select), `/api/admin/import` (select/insert), `/api/admin/import/[id]` (select/insert), `/api/import/worker` (select/insert), `/api/ops/schools/[id]/import` (select/insert), `/api/ops/schools/[id]/import/[jobId]` (select/insert)
- **Read directly by pages (browser, RLS):** `/verify/[token]`
- **SQL functions:** `certificate_issue()` select, `import_certificates()` select

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `school_id` | uuid | not null |  |
| `kind` | text | not null |  |
| `title` | text | not null |  |
| `body` | text |  |  |
| `prefix` | text | not null |  |
| `needs_approval` | boolean | not null | `true` |
| `active` | boolean | not null | `true` |
| `created_by` | uuid |  |  |
| `created_at` | timestamp with time zone | not null | `now()` |
| `updated_at` | timestamp with time zone | not null | `now()` |

<details><summary>Unique and check constraints</summary>

```sql
CHECK ((kind = ANY (ARRAY['tc'::text, 'bonafide'::text, 'character'::text, 'fee_paid'::text, 'custom'::text])))
CHECK (((length(TRIM(BOTH FROM title)) >= 1) AND (length(TRIM(BOTH FROM title)) <= 80)))
CHECK (((body IS NULL) OR (length(body) <= 4000)))
CHECK ((prefix ~ '^[A-Z0-9/.-]{1,12}$'::text))
CHECK (((kind <> 'tc'::text) OR needs_approval))
```

</details>

<details><summary>Triggers (2)</summary>

```sql
CREATE TRIGGER trg_touch_certificate_types BEFORE UPDATE ON public.certificate_types FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at()
CREATE TRIGGER trg_audit_certificate_types AFTER INSERT OR DELETE OR UPDATE ON public.certificate_types FOR EACH ROW EXECUTE FUNCTION app.audit()
```

</details>

<details><summary>Indexes (3)</summary>

```sql
CREATE UNIQUE INDEX certificate_types_pkey ON public.certificate_types USING btree (id)
CREATE UNIQUE INDEX certificate_types_builtin ON public.certificate_types USING btree (school_id, kind) WHERE (kind <> 'custom'::text)
CREATE UNIQUE INDEX certificate_types_prefix ON public.certificate_types USING btree (school_id, prefix)
```

</details>

### Table doc_counters

- **Kind:** table
- **Row-level security:** enabled, 0 policies
- **Grants:** `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (school_id, kind, session)`
- **References:** `schools` via `school_id`
- **Written by routes:** `/api/admin/certificates` (in SQL: insert), `/api/admin/fees` (in SQL: insert), `/api/admin/health` (in SQL: insert), `/api/admin/import` (in SQL: insert), `/api/admin/import/[id]` (in SQL: insert), `/api/admin/students` (in SQL: insert), `/api/admin/students/[id]` (in SQL: insert), `/api/admin/students/requests` (in SQL: insert), `/api/import/worker` (in SQL: insert), `/api/ops/requests` (in SQL: insert), `/api/ops/schools/[id]/import` (in SQL: insert), `/api/ops/schools/[id]/import/[jobId]` (in SQL: insert)
- **Read by routes:** `/api/admin/students/settings`
- **SQL functions:** `app.admission_floor()` insert, `certificate_issue()` insert, `import_certificates()` insert, `import_fee_payments()` insert, `import_receipt_floor()` insert, `app.next_admission_no()` insert, `app.next_doc_no()` insert

| Column | Type | Null | Default |
|---|---|---|---|
| `school_id` | uuid | not null |  |
| `kind` | text | not null |  |
| `session` | text | not null |  |
| `last_no` | integer | not null | `0` |

<details><summary>Unique and check constraints</summary>

```sql
CHECK (((kind = ANY (ARRAY['invoice'::text, 'receipt'::text, 'admission'::text])) OR (kind ~ '^cert:[0-9a-f-]{36}$'::text)))
```

</details>

<details><summary>Indexes (1)</summary>

```sql
CREATE UNIQUE INDEX doc_counters_pkey ON public.doc_counters USING btree (school_id, kind, session)
```

</details>

## Co-curricular (Kirti)

### Table houses

- **Kind:** table
- **Row-level security:** enabled, 0 policies
- **Grants:** `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `schools` via `school_id`
- **Referenced by:** `house_members`, `house_points`, `kirti_entries`
- **Written by routes:** `/api/admin/cocurricular` (select/update/insert)
- **Read by routes:** `/api/admin/import`, `/api/admin/import/[id]`, `/api/import/worker`, `/api/ops/schools/[id]/import`, `/api/ops/schools/[id]/import/[jobId]`, `/api/teacher/kirti`
- **SQL functions:** `import_house_members()` select

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `school_id` | uuid | not null |  |
| `name` | text | not null |  |
| `colour` | text |  |  |
| `active` | boolean | not null | `true` |
| `created_at` | timestamp with time zone | not null | `now()` |
| `updated_at` | timestamp with time zone | not null | `now()` |

<details><summary>Unique and check constraints</summary>

```sql
CHECK (((length(TRIM(BOTH FROM name)) >= 1) AND (length(TRIM(BOTH FROM name)) <= 40)))
CHECK (((colour IS NULL) OR (colour ~ '^#[0-9A-Fa-f]{6}$'::text)))
```

</details>

<details><summary>Triggers (2)</summary>

```sql
CREATE TRIGGER trg_touch_houses BEFORE UPDATE ON public.houses FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at()
CREATE TRIGGER trg_audit_houses AFTER INSERT OR DELETE OR UPDATE ON public.houses FOR EACH ROW EXECUTE FUNCTION app.audit()
```

</details>

<details><summary>Indexes (2)</summary>

```sql
CREATE UNIQUE INDEX houses_pkey ON public.houses USING btree (id)
CREATE UNIQUE INDEX houses_name ON public.houses USING btree (school_id, lower(name))
```

</details>

### Table house_members

- **Kind:** table
- **Row-level security:** enabled, 0 policies
- **Grants:** `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `houses` via `house_id`, `users` via `set_by`, `schools` via `school_id`, `students` via `student_id`
- **Written by routes:** `/api/admin/cocurricular` (select/update/insert/delete), `/api/admin/import` (in SQL: delete/select), `/api/admin/import/[id]` (in SQL: delete/select), `/api/import/worker` (in SQL: delete/select), `/api/ops/schools/[id]/import` (in SQL: delete/select), `/api/ops/schools/[id]/import/[jobId]` (in SQL: delete/select)
- **Read by routes:** `/api/admin/certificates`, `/api/parent/kirti`, `/api/student/kirti`
- **SQL functions:** `import_house_members()` select/update/insert, `import_kirti()` select, `import_undo()` delete/select

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `school_id` | uuid | not null |  |
| `student_id` | uuid | not null |  |
| `house_id` | uuid | not null |  |
| `from_date` | date | not null |  |
| `to_date` | date |  |  |
| `reason` | text |  |  |
| `set_by` | uuid |  |  |
| `import_job_id` | uuid |  |  |
| `created_at` | timestamp with time zone | not null | `now()` |
| `updated_at` | timestamp with time zone | not null | `now()` |

<details><summary>Unique and check constraints</summary>

```sql
CHECK (((to_date IS NULL) OR (to_date >= from_date)))
CHECK (((reason IS NULL) OR (length(reason) <= 200)))
```

</details>

<details><summary>Triggers (2)</summary>

```sql
CREATE TRIGGER trg_touch_house_members BEFORE UPDATE ON public.house_members FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at()
CREATE TRIGGER trg_audit_house_members AFTER INSERT OR DELETE OR UPDATE ON public.house_members FOR EACH ROW EXECUTE FUNCTION app.audit()
```

</details>

<details><summary>Indexes (4)</summary>

```sql
CREATE UNIQUE INDEX house_members_pkey ON public.house_members USING btree (id)
CREATE UNIQUE INDEX house_members_open ON public.house_members USING btree (student_id) WHERE (to_date IS NULL)
CREATE INDEX house_members_house ON public.house_members USING btree (house_id) WHERE (to_date IS NULL)
CREATE INDEX house_members_import_job ON public.house_members USING btree (import_job_id) WHERE (import_job_id IS NOT NULL)
```

</details>

### Table house_points

- **Kind:** table
- **Row-level security:** enabled, 0 policies
- **Grants:** `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `schools` via `school_id`, `houses` via `house_id`, `users` via `recorded_by`, `users` via `approved_by`
- **Written by routes:** `/api/admin/cocurricular` (select/update/insert), `/api/teacher/kirti` (insert)

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `school_id` | uuid | not null |  |
| `house_id` | uuid | not null |  |
| `session` | text | not null |  |
| `on_date` | date | not null |  |
| `points` | integer | not null |  |
| `reason` | text | not null |  |
| `status` | text | not null | `'pending'::text` |
| `reject_note` | text |  |  |
| `recorded_by` | uuid |  |  |
| `approved_by` | uuid |  |  |
| `approved_at` | timestamp with time zone |  |  |
| `created_at` | timestamp with time zone | not null | `now()` |
| `updated_at` | timestamp with time zone | not null | `now()` |

<details><summary>Unique and check constraints</summary>

```sql
CHECK ((session ~ '^\d{4}-\d{2}$'::text))
CHECK ((((points >= '-1000'::integer) AND (points <= 5000)) AND (points <> 0)))
CHECK (((length(TRIM(BOTH FROM reason)) >= 2) AND (length(TRIM(BOTH FROM reason)) <= 160)))
CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])))
CHECK (((reject_note IS NULL) OR (length(reject_note) <= 300)))
```

</details>

<details><summary>Triggers (2)</summary>

```sql
CREATE TRIGGER trg_touch_house_points BEFORE UPDATE ON public.house_points FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at()
CREATE TRIGGER trg_audit_house_points AFTER INSERT OR DELETE OR UPDATE ON public.house_points FOR EACH ROW EXECUTE FUNCTION app.audit('status')
```

</details>

<details><summary>Indexes (2)</summary>

```sql
CREATE UNIQUE INDEX house_points_pkey ON public.house_points USING btree (id)
CREATE INDEX house_points_house ON public.house_points USING btree (house_id, session)
```

</details>

### Table cc_groups

- **Kind:** table
- **Row-level security:** enabled, 0 policies
- **Grants:** `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `schools` via `school_id`, `users` via `in_charge`, `users` via `created_by`
- **Referenced by:** `cc_memberships`, `kirti_entries`
- **Written by routes:** `/api/admin/cocurricular` (select/update/insert)
- **Read by routes:** `/api/admin/import`, `/api/admin/import/[id]`, `/api/import/worker`, `/api/ops/schools/[id]/import`, `/api/ops/schools/[id]/import/[jobId]`, `/api/teacher/kirti`
- **SQL functions:** `import_cc_memberships()` select

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `school_id` | uuid | not null |  |
| `kind` | text | not null |  |
| `name` | text | not null |  |
| `in_charge` | uuid |  |  |
| `active` | boolean | not null | `true` |
| `created_by` | uuid |  |  |
| `created_at` | timestamp with time zone | not null | `now()` |
| `updated_at` | timestamp with time zone | not null | `now()` |

<details><summary>Unique and check constraints</summary>

```sql
CHECK ((kind = ANY (ARRAY['club'::text, 'team'::text, 'ncc'::text, 'scouts_guides'::text, 'other'::text])))
CHECK (((length(TRIM(BOTH FROM name)) >= 1) AND (length(TRIM(BOTH FROM name)) <= 80)))
```

</details>

<details><summary>Triggers (2)</summary>

```sql
CREATE TRIGGER trg_touch_cc_groups BEFORE UPDATE ON public.cc_groups FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at()
CREATE TRIGGER trg_audit_cc_groups AFTER INSERT OR DELETE OR UPDATE ON public.cc_groups FOR EACH ROW EXECUTE FUNCTION app.audit()
```

</details>

<details><summary>Indexes (2)</summary>

```sql
CREATE UNIQUE INDEX cc_groups_pkey ON public.cc_groups USING btree (id)
CREATE UNIQUE INDEX cc_groups_name ON public.cc_groups USING btree (school_id, lower(name))
```

</details>

### Table cc_memberships

- **Kind:** table
- **Row-level security:** enabled, 0 policies
- **Grants:** `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `schools` via `school_id`, `cc_groups` via `group_id`, `students` via `student_id`, `users` via `added_by`
- **Written by routes:** `/api/admin/cocurricular` (select/upsert/update), `/api/teacher/kirti` (select/upsert/update)
- **Read by routes:** `/api/admin/certificates`, `/api/admin/import`, `/api/admin/import/[id]`, `/api/import/worker`, `/api/ops/schools/[id]/import`, `/api/ops/schools/[id]/import/[jobId]`, `/api/parent/kirti`, `/api/student/kirti`
- **SQL functions:** `import_cc_memberships()` select/update/insert, `import_undo()` select

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `school_id` | uuid | not null |  |
| `group_id` | uuid | not null |  |
| `student_id` | uuid | not null |  |
| `session` | text | not null |  |
| `role` | text |  |  |
| `left_on` | date |  |  |
| `added_by` | uuid |  |  |
| `import_job_id` | uuid |  |  |
| `created_at` | timestamp with time zone | not null | `now()` |
| `updated_at` | timestamp with time zone | not null | `now()` |

<details><summary>Unique and check constraints</summary>

```sql
UNIQUE UNIQUE (group_id, student_id, session)
CHECK ((session ~ '^\d{4}-\d{2}$'::text))
CHECK (((role IS NULL) OR ((length(role) >= 1) AND (length(role) <= 40))))
```

</details>

<details><summary>Triggers (2)</summary>

```sql
CREATE TRIGGER trg_touch_cc_memberships BEFORE UPDATE ON public.cc_memberships FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at()
CREATE TRIGGER trg_audit_cc_memberships AFTER INSERT OR DELETE OR UPDATE ON public.cc_memberships FOR EACH ROW EXECUTE FUNCTION app.audit()
```

</details>

<details><summary>Indexes (4)</summary>

```sql
CREATE UNIQUE INDEX cc_memberships_pkey ON public.cc_memberships USING btree (id)
CREATE UNIQUE INDEX cc_memberships_group_id_student_id_session_key ON public.cc_memberships USING btree (group_id, student_id, session)
CREATE INDEX cc_memberships_student ON public.cc_memberships USING btree (student_id)
CREATE INDEX cc_memberships_import_job ON public.cc_memberships USING btree (import_job_id) WHERE (import_job_id IS NOT NULL)
```

</details>

### Table kirti_entries

- **Kind:** table
- **Row-level security:** enabled, 0 policies
- **Grants:** `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `schools` via `school_id`, `students` via `student_id`, `houses` via `house_id`, `cc_groups` via `group_id`, `student_documents` via `document_id`, `users` via `recorded_by`, `users` via `approved_by`
- **Written by routes:** `/api/admin/cocurricular` (select/update/insert), `/api/teacher/kirti` (select/insert)
- **Read by routes:** `/api/admin/certificates`, `/api/admin/import`, `/api/admin/import/[id]`, `/api/import/worker`, `/api/ops/schools/[id]/import`, `/api/ops/schools/[id]/import/[jobId]`, `/api/parent/ask`, `/api/parent/kirti`, `/api/student/kirti`, `/api/timeline`, `/api/whatsapp/simulate`, `/api/whatsapp/webhook`
- **SQL functions:** `import_kirti()` select/update/insert, `import_undo()` select

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `school_id` | uuid | not null |  |
| `student_id` | uuid | not null |  |
| `session` | text | not null |  |
| `on_date` | date | not null |  |
| `title` | text | not null |  |
| `category` | text | not null |  |
| `level` | text | not null |  |
| `position` | text | not null |  |
| `position_note` | text |  |  |
| `house_points` | integer |  |  |
| `house_id` | uuid |  |  |
| `group_id` | uuid |  |  |
| `document_id` | uuid |  |  |
| `notes` | text |  |  |
| `status` | text | not null | `'pending'::text` |
| `reject_note` | text |  |  |
| `recorded_by` | uuid |  |  |
| `approved_by` | uuid |  |  |
| `approved_at` | timestamp with time zone |  |  |
| `import_job_id` | uuid |  |  |
| `created_at` | timestamp with time zone | not null | `now()` |
| `updated_at` | timestamp with time zone | not null | `now()` |

<details><summary>Unique and check constraints</summary>

```sql
CHECK ((session ~ '^\d{4}-\d{2}$'::text))
CHECK (((length(TRIM(BOTH FROM title)) >= 2) AND (length(TRIM(BOTH FROM title)) <= 160)))
CHECK ((category = ANY (ARRAY['sports'::text, 'academic'::text, 'arts'::text, 'music_dance'::text, 'literary'::text, 'science'::text, 'cultural'::text, 'community'::text, 'leadership'::text, 'other'::text])))
CHECK ((level = ANY (ARRAY['class'::text, 'house'::text, 'school'::text, 'inter_school'::text, 'zone'::text, 'district'::text, 'state'::text, 'national'::text, 'international'::text])))
CHECK (("position" = ANY (ARRAY['participant'::text, 'first'::text, 'second'::text, 'third'::text, 'special'::text, 'other'::text])))
CHECK (((position_note IS NULL) OR (length(position_note) <= 60)))
CHECK ((("position" <> 'other'::text) OR (position_note IS NOT NULL)))
CHECK (((house_points IS NULL) OR ((house_points >= '-100'::integer) AND (house_points <= 1000))))
CHECK (((notes IS NULL) OR (length(notes) <= 500)))
CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])))
CHECK (((reject_note IS NULL) OR (length(reject_note) <= 300)))
CHECK (((status <> 'rejected'::text) OR (reject_note IS NOT NULL)))
```

</details>

<details><summary>Triggers (2)</summary>

```sql
CREATE TRIGGER trg_touch_kirti_entries BEFORE UPDATE ON public.kirti_entries FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at()
CREATE TRIGGER trg_audit_kirti_entries AFTER INSERT OR DELETE OR UPDATE ON public.kirti_entries FOR EACH ROW EXECUTE FUNCTION app.audit('status')
```

</details>

<details><summary>Indexes (5)</summary>

```sql
CREATE UNIQUE INDEX kirti_entries_pkey ON public.kirti_entries USING btree (id)
CREATE INDEX kirti_entries_student ON public.kirti_entries USING btree (student_id, on_date DESC)
CREATE INDEX kirti_entries_pending ON public.kirti_entries USING btree (school_id, created_at) WHERE (status = 'pending'::text)
CREATE INDEX kirti_entries_house ON public.kirti_entries USING btree (house_id, session) WHERE ((status = 'approved'::text) AND (house_points IS NOT NULL))
CREATE INDEX kirti_entries_import_job ON public.kirti_entries USING btree (import_job_id) WHERE (import_job_id IS NOT NULL)
```

</details>

## Conduct, wellbeing & safeguarding

### Table discipline_actions

- **Kind:** table
- **Row-level security:** enabled, 0 policies
- **Grants:** `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `schools` via `school_id`, `students` via `student_id`, `incidents` via `incident_id`, `users` via `proposed_by`, `users` via `approved_by`, `users` via `cancelled_by`
- **Written by routes:** `/api/admin/discipline` (select/insert/update), `/api/teacher/conduct` (select/insert/update)
- **Read by routes:** `/api/admin/import`, `/api/admin/import/[id]`, `/api/import/worker`, `/api/ops/schools/[id]/import`, `/api/ops/schools/[id]/import/[jobId]`, `/api/parent/ask`, `/api/parent/conduct`, `/api/timeline`, `/api/whatsapp/simulate`, `/api/whatsapp/webhook`
- **SQL functions:** `import_undo()` select

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `school_id` | uuid | not null |  |
| `student_id` | uuid | not null |  |
| `incident_id` | uuid |  |  |
| `session` | text | not null |  |
| `kind` | text | not null |  |
| `on_date` | date | not null |  |
| `until_date` | date |  |  |
| `reason` | text | not null |  |
| `details` | text |  |  |
| `status` | text | not null | `'proposed'::text` |
| `return_note` | text |  |  |
| `cancel_reason` | text |  |  |
| `notify_parent` | boolean | not null | `false` |
| `parent_notified_at` | timestamp with time zone |  |  |
| `proposed_by` | uuid |  |  |
| `approved_by` | uuid |  |  |
| `approved_at` | timestamp with time zone |  |  |
| `cancelled_by` | uuid |  |  |
| `cancelled_at` | timestamp with time zone |  |  |
| `created_at` | timestamp with time zone | not null | `now()` |
| `updated_at` | timestamp with time zone | not null | `now()` |

<details><summary>Unique and check constraints</summary>

```sql
CHECK ((session ~ '^\d{4}-\d{2}$'::text))
CHECK ((kind = ANY (ARRAY['warning'::text, 'parent_meeting'::text, 'detention'::text, 'suspension'::text])))
CHECK (((kind <> 'suspension'::text) OR (until_date IS NOT NULL)))
CHECK (((until_date IS NULL) OR (until_date >= on_date)))
CHECK (((length(TRIM(BOTH FROM reason)) >= 3) AND (length(TRIM(BOTH FROM reason)) <= 300)))
CHECK (((details IS NULL) OR (length(details) <= 2000)))
CHECK ((status = ANY (ARRAY['proposed'::text, 'approved'::text, 'returned'::text, 'cancelled'::text])))
CHECK (((return_note IS NULL) OR (length(return_note) <= 300)))
CHECK (((status <> 'returned'::text) OR (return_note IS NOT NULL)))
CHECK (((cancel_reason IS NULL) OR (length(cancel_reason) <= 300)))
CHECK (((status <> 'cancelled'::text) OR (cancel_reason IS NOT NULL)))
```

</details>

<details><summary>Triggers (2)</summary>

```sql
CREATE TRIGGER trg_touch_discipline_actions BEFORE UPDATE ON public.discipline_actions FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at()
CREATE TRIGGER trg_audit_discipline_actions AFTER INSERT OR DELETE OR UPDATE ON public.discipline_actions FOR EACH ROW EXECUTE FUNCTION app.audit()
```

</details>

<details><summary>Indexes (5)</summary>

```sql
CREATE UNIQUE INDEX discipline_actions_pkey ON public.discipline_actions USING btree (id)
CREATE INDEX discipline_actions_student ON public.discipline_actions USING btree (student_id, on_date DESC)
CREATE INDEX discipline_actions_school ON public.discipline_actions USING btree (school_id, created_at DESC)
CREATE INDEX discipline_actions_waiting ON public.discipline_actions USING btree (school_id, created_at) WHERE (status = 'proposed'::text)
CREATE INDEX discipline_actions_incident ON public.discipline_actions USING btree (incident_id) WHERE (incident_id IS NOT NULL)
```

</details>

### Table counselling_cases

- **Kind:** table
- **Row-level security:** enabled, 0 policies
- **Grants:** `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `users` via `counsellor_id`, `schools` via `school_id`, `students` via `student_id`
- **Referenced by:** `counselling_referrals`, `counselling_sessions`
- **Written by routes:** `/api/admin/counselling` (select/insert/update)
- **Read by routes:** `/api/admin/discipline`, `/api/admin/import`, `/api/admin/import/[id]`, `/api/import/worker`, `/api/ops/schools/[id]/import`, `/api/ops/schools/[id]/import/[jobId]`, `/api/parent/ask`, `/api/timeline`, `/api/whatsapp/simulate`, `/api/whatsapp/webhook`
- **SQL functions:** `import_undo()` select

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `school_id` | uuid | not null |  |
| `student_id` | uuid | not null |  |
| `status` | text | not null | `'open'::text` |
| `opened_on` | date | not null |  |
| `closed_on` | date |  |  |
| `counsellor_id` | uuid |  |  |
| `created_at` | timestamp with time zone | not null | `now()` |
| `updated_at` | timestamp with time zone | not null | `now()` |

<details><summary>Unique and check constraints</summary>

```sql
CHECK ((status = ANY (ARRAY['open'::text, 'closed'::text, 'referred'::text])))
CHECK (((closed_on IS NULL) OR (closed_on >= opened_on)))
CHECK (((status = 'open'::text) = (closed_on IS NULL)))
```

</details>

<details><summary>Triggers (2)</summary>

```sql
CREATE TRIGGER trg_touch_counselling_cases BEFORE UPDATE ON public.counselling_cases FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at()
CREATE TRIGGER trg_audit_counselling_cases AFTER INSERT OR DELETE OR UPDATE ON public.counselling_cases FOR EACH ROW EXECUTE FUNCTION app.audit()
```

</details>

<details><summary>Indexes (3)</summary>

```sql
CREATE UNIQUE INDEX counselling_cases_pkey ON public.counselling_cases USING btree (id)
CREATE INDEX counselling_cases_student ON public.counselling_cases USING btree (student_id, opened_on DESC)
CREATE INDEX counselling_cases_school ON public.counselling_cases USING btree (school_id, opened_on DESC)
```

</details>

### Table counselling_sessions

- **Kind:** table
- **Row-level security:** enabled, 0 policies
- **Grants:** `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `schools` via `school_id`, `counselling_cases` via `case_id`, `users` via `counsellor_id`
- **Written by routes:** `/api/admin/counselling` (select/insert)
- **Read by routes:** `/api/admin/discipline`

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `school_id` | uuid | not null |  |
| `case_id` | uuid | not null |  |
| `on_date` | date | not null |  |
| `notes_cipher` | text | not null |  |
| `counsellor_id` | uuid |  |  |
| `created_at` | timestamp with time zone | not null | `now()` |
| `updated_at` | timestamp with time zone | not null | `now()` |

<details><summary>Unique and check constraints</summary>

```sql
CHECK ((notes_cipher ~~ 'v1:%'::text))
```

</details>

<details><summary>Triggers (2)</summary>

```sql
CREATE TRIGGER trg_touch_counselling_sessions BEFORE UPDATE ON public.counselling_sessions FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at()
CREATE TRIGGER trg_audit_counselling_sessions AFTER INSERT OR DELETE OR UPDATE ON public.counselling_sessions FOR EACH ROW EXECUTE FUNCTION app.audit()
```

</details>

<details><summary>Indexes (2)</summary>

```sql
CREATE UNIQUE INDEX counselling_sessions_pkey ON public.counselling_sessions USING btree (id)
CREATE INDEX counselling_sessions_case ON public.counselling_sessions USING btree (case_id, on_date DESC)
```

</details>

### Table counselling_referrals

- **Kind:** table
- **Row-level security:** enabled, 0 policies
- **Grants:** `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `schools` via `school_id`, `students` via `student_id`, `users` via `from_user`, `counselling_cases` via `case_id`, `users` via `seen_by`
- **Written by routes:** `/api/admin/counselling` (select/insert/update), `/api/parent/conduct` (select/insert), `/api/teacher/conduct` (select/insert)
- **Read by routes:** `/api/admin/import`, `/api/admin/import/[id]`, `/api/import/worker`, `/api/ops/schools/[id]/import`, `/api/ops/schools/[id]/import/[jobId]`
- **SQL functions:** `import_undo()` select

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `school_id` | uuid | not null |  |
| `student_id` | uuid | not null |  |
| `from_kind` | text | not null |  |
| `from_user` | uuid |  |  |
| `reason_cipher` | text | not null |  |
| `status` | text | not null | `'new'::text` |
| `case_id` | uuid |  |  |
| `seen_by` | uuid |  |  |
| `seen_at` | timestamp with time zone |  |  |
| `created_at` | timestamp with time zone | not null | `now()` |
| `updated_at` | timestamp with time zone | not null | `now()` |

<details><summary>Unique and check constraints</summary>

```sql
CHECK ((from_kind = ANY (ARRAY['teacher'::text, 'parent'::text, 'office'::text])))
CHECK ((reason_cipher ~~ 'v1:%'::text))
CHECK ((status = ANY (ARRAY['new'::text, 'seen'::text, 'declined'::text])))
```

</details>

<details><summary>Triggers (2)</summary>

```sql
CREATE TRIGGER trg_touch_counselling_referrals BEFORE UPDATE ON public.counselling_referrals FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at()
CREATE TRIGGER trg_audit_counselling_referrals AFTER INSERT OR DELETE OR UPDATE ON public.counselling_referrals FOR EACH ROW EXECUTE FUNCTION app.audit('status')
```

</details>

<details><summary>Indexes (4)</summary>

```sql
CREATE UNIQUE INDEX counselling_referrals_pkey ON public.counselling_referrals USING btree (id)
CREATE INDEX counselling_referrals_new ON public.counselling_referrals USING btree (school_id, created_at) WHERE (status = 'new'::text)
CREATE INDEX counselling_referrals_from ON public.counselling_referrals USING btree (from_user, created_at DESC)
CREATE INDEX counselling_referrals_student ON public.counselling_referrals USING btree (student_id)
```

</details>

### Table safeguarding_log

- **Kind:** table
- **Row-level security:** enabled, 0 policies
- **Grants:** `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `schools` via `school_id`, `incidents` via `incident_id`, `users` via `by_user`
- **Written by routes:** `/api/admin/safeguarding` (select/insert)

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `school_id` | uuid | not null |  |
| `incident_id` | uuid | not null |  |
| `kind` | text | not null |  |
| `on_date` | date | not null |  |
| `ref` | text |  |  |
| `details_cipher` | text |  |  |
| `by_user` | uuid |  |  |
| `created_at` | timestamp with time zone | not null | `now()` |

<details><summary>Unique and check constraints</summary>

```sql
CHECK ((kind = ANY (ARRAY['note'::text, 'reported_police'::text, 'reported_cwc'::text, 'parent_informed'::text, 'referred'::text, 'closed'::text])))
CHECK (((ref IS NULL) OR (length(ref) <= 80)))
CHECK (((details_cipher IS NULL) OR (details_cipher ~~ 'v1:%'::text)))
```

</details>

<details><summary>Triggers (1)</summary>

```sql
CREATE TRIGGER trg_audit_safeguarding_log AFTER INSERT OR DELETE OR UPDATE ON public.safeguarding_log FOR EACH ROW EXECUTE FUNCTION app.audit()
```

</details>

<details><summary>Indexes (2)</summary>

```sql
CREATE UNIQUE INDEX safeguarding_log_pkey ON public.safeguarding_log USING btree (id)
CREATE INDEX safeguarding_log_incident ON public.safeguarding_log USING btree (incident_id, on_date)
```

</details>

### Table incidents

- **Kind:** table
- **Row-level security:** enabled, 1 policies
- **Grants:** `authenticated` select; `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `users` via `closed_by`, `users` via `logged_by`, `users` via `parent_notice_by`, `schools` via `school_id`, `users` via `student_id`
- **Referenced by:** `discipline_actions`, `safeguarding_log`
- **Written by routes:** `/api/admin/safeguarding` (select/update), `/api/staff/incidents` (insert/select/update)
- **Read by routes:** `/api/admin/discipline`, `/api/feed`, `/api/ops/overview`, `/api/ops/schools`, `/api/ops/schools/[id]`, `/api/parent/ask`, `/api/staff/ask`, `/api/teacher/conduct`, `/api/timeline`, `/api/whatsapp/simulate`, `/api/whatsapp/webhook`
- **Read directly by pages (browser, RLS):** `/admin/feed`, `/teacher/feed`
- **SQL functions:** `ops_school_metrics()` select

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `school_id` | uuid | not null |  |
| `student_id` | uuid |  |  |
| `class_name` | text |  |  |
| `category` | text | not null |  |
| `severity` | text | not null |  |
| `summary` | text | not null |  |
| `details` | text |  |  |
| `location` | text |  |  |
| `occurred_at` | timestamp with time zone | not null | `now()` |
| `logged_by` | uuid |  |  |
| `parent_notice` | text | not null |  |
| `parent_notice_by` | uuid |  |  |
| `parent_notice_at` | timestamp with time zone |  |  |
| `status` | text | not null | `'open'::text` |
| `outcome` | text |  |  |
| `closed_by` | uuid |  |  |
| `closed_at` | timestamp with time zone |  |  |
| `created_at` | timestamp with time zone | not null | `now()` |
| `updated_at` | timestamp with time zone | not null | `now()` |

<details><summary>Unique and check constraints</summary>

```sql
CHECK ((category = ANY (ARRAY['health'::text, 'discipline'::text, 'bullying'::text, 'safety'::text, 'property'::text, 'child_protection'::text, 'other'::text])))
CHECK (((details IS NULL) OR (length(details) <= 4000)))
CHECK (((location IS NULL) OR (length(location) <= 120)))
CHECK (((outcome IS NULL) OR (length(outcome) <= 2000)))
CHECK ((parent_notice = ANY (ARRAY['sent'::text, 'awaiting_class_teacher'::text, 'principal_decides'::text, 'declined'::text, 'not_applicable'::text])))
CHECK ((severity = ANY (ARRAY['critical'::text, 'high'::text, 'normal'::text])))
CHECK ((status = ANY (ARRAY['open'::text, 'closed'::text])))
CHECK (((length(summary) >= 3) AND (length(summary) <= 160)))
```

</details>

<details><summary>RLS policies (1)</summary>

- **incidents_read** · SELECT · authenticated
  - USING `(((school_id = ( SELECT app.current_school_id() AS current_school_id)) AND ((logged_by = ( SELECT auth.uid() AS uid)) OR ((category = 'child_protection'::text) AND ( SELECT app.cp_reader() AS cp_reader)) OR ((category <> 'child_protection'::text) AND (( SELECT app.has_perm('incidents.manage'::text) AS has_perm) OR ( SELECT app.has_perm('feed.read'::text) AS has_perm) OR (( SELECT app.is_teacher() AS is_teacher) AND (student_id IS NOT NULL) AND app.teaches_student(student_id)) OR (( SELECT app.is_teacher() AS is_teacher) AND (student_id IS NULL) AND (class_name IS NOT NULL) AND app.teaches_class(class_name)))))) OR ( SELECT app.is_superadmin() AS is_superadmin))`

</details>

<details><summary>Triggers (2)</summary>

```sql
CREATE TRIGGER trg_audit_incidents AFTER INSERT OR DELETE OR UPDATE ON public.incidents FOR EACH ROW EXECUTE FUNCTION app.audit()
CREATE TRIGGER trg_touch_incidents BEFORE UPDATE ON public.incidents FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at()
```

</details>

<details><summary>Indexes (3)</summary>

```sql
CREATE UNIQUE INDEX incidents_pkey ON public.incidents USING btree (id)
CREATE INDEX idx_incidents_school ON public.incidents USING btree (school_id, created_at DESC)
CREATE INDEX idx_incidents_student ON public.incidents USING btree (student_id, created_at DESC)
```

</details>

### Table wellness_logs

- **Kind:** table
- **Row-level security:** enabled, 4 policies
- **Grants:** `authenticated` delete/insert/references/select/trigger/update; `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `schools` via `school_id`, `users` via `student_id`
- **Written by routes:** `/api/teacher/acknowledge-situation` (select; maybe: update)
- **Read by routes:** `/api/admin/filings`, `/api/feed`, `/api/ops/overview`, `/api/ops/schools`, `/api/ops/schools/[id]`, `/api/parent/ask`, `/api/parent/desk`, `/api/staff/ask`, `/api/timeline`, `/api/whatsapp/simulate`, `/api/whatsapp/webhook`
- **Read directly by pages (browser, RLS):** `/student (layout)`
- **SQL functions:** `ops_school_metrics()` select, `parent_wellness_summary()` select, `school_wellness_aggregates()` select, `school_wellness_report()` select, `teacher_wellness_feed()` select

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `student_id` | uuid |  |  |
| `school_id` | uuid |  |  |
| `mood` | text |  |  |
| `energy` | integer |  |  |
| `note` | text |  |  |
| `created_at` | timestamp with time zone |  | `now()` |
| `shared` | boolean | not null | `false` |
| `resolved` | boolean | not null | `false` |

<details><summary>Unique and check constraints</summary>

```sql
CHECK (((energy IS NULL) OR ((energy >= 1) AND (energy <= 5)))) NOT VALID
CHECK (((note IS NULL) OR (char_length(note) <= 4000))) NOT VALID
```

</details>

<details><summary>RLS policies (4)</summary>

- **wellness_own_delete** · DELETE · authenticated
  - USING `(student_id = ( SELECT auth.uid() AS uid))`
- **wellness_own_insert** · INSERT · authenticated
  - WITH CHECK `((student_id = ( SELECT auth.uid() AS uid)) AND (NOT (school_id IS DISTINCT FROM ( SELECT app.current_school_id() AS current_school_id))) AND app.has_wellness_consent(student_id))`
- **wellness_own_read** · SELECT · authenticated
  - USING `(student_id = ( SELECT auth.uid() AS uid))`
- **wellness_own_update** · UPDATE · authenticated
  - USING `((student_id = ( SELECT auth.uid() AS uid)) AND app.has_wellness_consent(student_id))`
  - WITH CHECK `((student_id = ( SELECT auth.uid() AS uid)) AND (NOT (school_id IS DISTINCT FROM ( SELECT app.current_school_id() AS current_school_id))) AND app.has_wellness_consent(student_id))`

</details>

<details><summary>Triggers (2)</summary>

```sql
CREATE TRIGGER trg_guard_wellness_insert BEFORE INSERT ON public.wellness_logs FOR EACH ROW EXECUTE FUNCTION app.guard_wellness_insert()
CREATE TRIGGER trg_guard_wellness_update BEFORE UPDATE ON public.wellness_logs FOR EACH ROW EXECUTE FUNCTION app.guard_wellness_update()
```

</details>

<details><summary>Indexes (4)</summary>

```sql
CREATE UNIQUE INDEX wellness_logs_pkey ON public.wellness_logs USING btree (id)
CREATE INDEX idx_wellness_school_created ON public.wellness_logs USING btree (school_id, created_at DESC)
CREATE INDEX idx_wellness_student ON public.wellness_logs USING btree (student_id)
CREATE INDEX idx_wellness_student_created ON public.wellness_logs USING btree (student_id, created_at DESC)
```

</details>

### Table situations

- **Kind:** table · in the `supabase_realtime` publication
- **Row-level security:** enabled, 1 policies
- **Grants:** `authenticated` references/select/trigger; `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `users` via `acknowledged_by`, `schools` via `school_id`, `users` via `student_id`, `users` via `teacher_id`
- **Written by routes:** `/api/admin/safeguarding` (update), `/api/admin/users/assignments` (in SQL: update), `/api/feed` (select/upsert/update), `/api/ops/requests` (in SQL: update), `/api/ops/schools/[id]/classes` (in SQL: update), `/api/ops/schools/[id]/people` (in SQL: update), `/api/ops/schools/[id]/people/[userId]` (in SQL: update), `/api/ops/schools/[id]/subjects` (in SQL: update), `/api/staff/incidents` (select/upsert/update), `/api/student/proctor-alert` (select/upsert/update), `/api/teacher/attendance` (select/upsert/update), `/api/tutor/session` (select/upsert/update), `/api/whatsapp/simulate` (select/update/upsert), `/api/whatsapp/webhook` (select/update/upsert)
- **Read by routes:** `/api/ops/overview`, `/api/ops/schools`, `/api/ops/schools/[id]`, `/api/staff/ask`
- **Read directly by pages (browser, RLS):** `/admin/feed`, `/teacher/feed`
- **SQL functions:** `ops_rename_class_subject()` update, `ops_school_metrics()` select

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `school_id` | uuid |  |  |
| `teacher_id` | uuid |  |  |
| `type` | text |  |  |
| `message` | text |  |  |
| `student_name` | text |  |  |
| `student_id` | uuid |  |  |
| `acknowledged` | boolean |  | `false` |
| `metadata` | jsonb |  | `'{}'::jsonb` |
| `created_at` | timestamp with time zone |  | `now()` |
| `category` | text | not null |  |
| `severity` | text | not null | `'normal'::text` |
| `title` | text | not null |  |
| `class_name` | text |  |  |
| `subject` | text |  |  |
| `audience` | text | not null | `'staff'::text` |
| `source_table` | text |  |  |
| `source_id` | uuid |  |  |
| `dedupe_key` | text |  |  |
| `acknowledged_by` | uuid |  |  |
| `acknowledged_at` | timestamp with time zone |  |  |
| `ack_by_name` | text |  |  |
| `ack_note` | text |  |  |
| `escalate_at` | timestamp with time zone |  |  |
| `escalated_at` | timestamp with time zone |  |  |
| `updated_at` | timestamp with time zone | not null | `now()` |

<details><summary>Unique and check constraints</summary>

```sql
CHECK (((ack_note IS NULL) OR (length(ack_note) <= 500)))
CHECK ((audience = ANY (ARRAY['staff'::text, 'principal'::text, 'safeguarding'::text])))
CHECK ((category = ANY (ARRAY['academic'::text, 'wellness'::text, 'attendance'::text, 'incident'::text, 'security'::text])))
CHECK ((severity = ANY (ARRAY['critical'::text, 'high'::text, 'normal'::text])))
```

</details>

<details><summary>RLS policies (1)</summary>

- **situations_read** · SELECT · authenticated
  - USING `(((school_id = ( SELECT app.current_school_id() AS current_school_id)) AND (((audience = 'staff'::text) AND ( SELECT app.is_teacher() AS is_teacher) AND ((teacher_id = ( SELECT auth.uid() AS uid)) OR ((teacher_id IS NULL) AND (student_id IS NOT NULL) AND app.teaches_student(student_id)) OR ((teacher_id IS NULL) AND (student_id IS NULL) AND (class_name IS NOT NULL) AND app.teaches_class(class_name)))) OR ((audience = 'staff'::text) AND ( SELECT app.has_perm('feed.read'::text) AS has_perm)) OR ((audience = 'staff'::text) AND ( SELECT app.has_perm('incidents.manage'::text) AS has_perm)) OR ((audience = 'principal'::text) AND ( SELECT app.cp_reader() AS cp_reader)) OR ((audience = 'safeguarding'::text) AND ( SELECT app.has_perm('safeguarding.read'::text) AS has_perm)))) OR ( SELECT app.is_superadmin() AS is_superadmin))`

</details>

<details><summary>Triggers (1)</summary>

```sql
CREATE TRIGGER trg_touch_situations BEFORE UPDATE ON public.situations FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at()
```

</details>

<details><summary>Indexes (5)</summary>

```sql
CREATE UNIQUE INDEX situations_pkey ON public.situations USING btree (id)
CREATE INDEX idx_situations_open_escalation ON public.situations USING btree (school_id, escalate_at) WHERE ((acknowledged_at IS NULL) AND (escalate_at IS NOT NULL))
CREATE INDEX idx_situations_school ON public.situations USING btree (school_id)
CREATE INDEX idx_situations_school_recent ON public.situations USING btree (school_id, created_at DESC)
CREATE UNIQUE INDEX uq_situations_dedupe ON public.situations USING btree (school_id, dedupe_key)
```

</details>

### Table proctor_alerts

- **Kind:** table
- **Row-level security:** enabled, 1 policies
- **Grants:** `authenticated` delete/insert/references/select/trigger/update; `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `assignments` via `assignment_id`, `schools` via `school_id`, `users` via `student_id`
- **Written by routes:** `/api/student/proctor-alert` (insert)
- **Read by routes:** `/api/feed`, `/api/staff/ask`, `/api/student/submit-typed`, `/api/teacher/review-submission`, `/api/teacher/submissions`, `/api/tml/compute`, `/api/tutor/session`, `/api/whatsapp/simulate`, `/api/whatsapp/webhook`
- **Read directly by pages (browser, RLS):** `/admin (layout)`, `/teacher (layout)`

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `school_id` | uuid |  |  |
| `student_id` | uuid | not null |  |
| `student_name` | text |  |  |
| `assignment_id` | uuid |  |  |
| `assignment_title` | text |  |  |
| `switch_count` | integer | not null | `0` |
| `flagged_at` | timestamp with time zone | not null | `now()` |

<details><summary>Unique and check constraints</summary>

```sql
CHECK ((switch_count >= 0))
```

</details>

<details><summary>RLS policies (1)</summary>

- **proctor_alerts_read** · SELECT · authenticated
  - USING `((( SELECT app.sees_learning() AS sees_learning) AND (school_id = ( SELECT app.current_school_id() AS current_school_id))) OR ( SELECT app.is_superadmin() AS is_superadmin))`

</details>

<details><summary>Indexes (3)</summary>

```sql
CREATE UNIQUE INDEX proctor_alerts_pkey ON public.proctor_alerts USING btree (id)
CREATE INDEX idx_proctor_alerts_school ON public.proctor_alerts USING btree (school_id, flagged_at DESC)
CREATE INDEX idx_proctor_alerts_student ON public.proctor_alerts USING btree (student_id, assignment_id)
```

</details>

### Table probe_acks

- **Kind:** table
- **Row-level security:** enabled, 1 policies
- **Grants:** `authenticated` delete/insert/references/select/trigger/update; `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `users` via `acked_by`, `schools` via `school_id`
- **Written by routes:** `/api/admin/probe` (upsert/delete)
- **Read by routes:** `/api/staff/ask`, `/api/whatsapp/simulate`, `/api/whatsapp/webhook`
- **Read directly by pages (browser, RLS):** `/admin (layout)`

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `school_id` | uuid | not null |  |
| `finding_key` | text | not null |  |
| `fingerprint` | text | not null |  |
| `status` | text | not null |  |
| `snooze_until` | date |  |  |
| `note` | text |  |  |
| `acked_by` | uuid |  |  |
| `acked_at` | timestamp with time zone | not null | `now()` |

<details><summary>Unique and check constraints</summary>

```sql
UNIQUE UNIQUE (school_id, finding_key)
CHECK (((status <> 'snoozed'::text) OR (snooze_until IS NOT NULL)))
CHECK ((char_length(finding_key) <= 200))
CHECK ((char_length(fingerprint) <= 200))
CHECK (((note IS NULL) OR (char_length(note) <= 500)))
CHECK ((status = ANY (ARRAY['acknowledged'::text, 'snoozed'::text])))
```

</details>

<details><summary>RLS policies (1)</summary>

- **probe_acks_read** · SELECT · authenticated
  - USING `((( SELECT app.has_perm('probe.view'::text) AS has_perm) AND (school_id = ( SELECT app.current_school_id() AS current_school_id))) OR ( SELECT app.is_superadmin() AS is_superadmin))`

</details>

<details><summary>Triggers (1)</summary>

```sql
CREATE TRIGGER trg_audit_probe_acks AFTER INSERT OR DELETE OR UPDATE ON public.probe_acks FOR EACH ROW EXECUTE FUNCTION app.audit()
```

</details>

<details><summary>Indexes (2)</summary>

```sql
CREATE UNIQUE INDEX probe_acks_pkey ON public.probe_acks USING btree (id)
CREATE UNIQUE INDEX probe_acks_school_id_finding_key_key ON public.probe_acks USING btree (school_id, finding_key)
```

</details>

## Curriculum & teaching plan

### Table classes

- **Kind:** table
- **Row-level security:** enabled, 2 policies
- **Grants:** `authenticated` delete/insert/references/select/trigger/update; `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `schools` via `school_id`
- **Referenced by:** `class_subjects`, `enrolments`, `exam_class_terms`, `exam_sheets`, `report_cards`
- **Written by routes:** `/api/ops/schools/[id]/classes` (select/update/insert), `/api/ops/schools/[id]/subjects` (select/update; in SQL: select; maybe: select)
- **Read by routes:** `/api/admin/admissions/enrol`, `/api/admin/certificates`, `/api/admin/exams`, `/api/admin/import`, `/api/admin/import/[id]`, `/api/admin/students`, `/api/admin/students/[id]`, `/api/admin/students/year`, `/api/admin/subjects`, `/api/admin/users/assignments`, `/api/import/worker`, `/api/ops/health`, `/api/ops/overview`, `/api/ops/requests`, `/api/ops/schools`, `/api/ops/schools/[id]`, `/api/ops/schools/[id]/controls`, `/api/ops/schools/[id]/import`, `/api/ops/schools/[id]/import/[jobId]`, `/api/ops/schools/[id]/people`, `/api/ops/schools/[id]/people/[userId]`, `/api/ops/schools/[id]/support`, `/api/student/subjects`, `/api/teacher/exams`, `/api/teacher/practicals`, `/api/tutor/session`
- **Read directly by pages (browser, RLS):** `/admin/admissions`, `/admin/directory`
- **SQL functions:** `app.enrol_core()` select, `app.guard_exam_student_terms()` select, `app.guard_subject_link()` select, `import_enrolments()` select, `app.move_enrolment()` select, `ops_registry_counts()` select, `ops_school_diagnostics()` select, `ops_school_metrics()` select, `ops_subject_metrics()` select, `app.reconcile_student_subjects()` select, `app.sync_class_subject_meta()` update, `app.sync_teacher_assignments()` select

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `school_id` | uuid |  |  |
| `name` | text |  |  |
| `metadata` | jsonb |  | `'{}'::jsonb` |
| `created_at` | timestamp with time zone |  | `now()` |

<details><summary>RLS policies (2)</summary>

- **classes_read** · SELECT · authenticated
  - USING `((school_id = ( SELECT app.current_school_id() AS current_school_id)) OR ( SELECT app.is_superadmin() AS is_superadmin))`
- **classes_superadmin_write** · ALL · authenticated
  - USING `( SELECT app.is_superadmin() AS is_superadmin)`
  - WITH CHECK `( SELECT app.is_superadmin() AS is_superadmin)`

</details>

<details><summary>Triggers (1)</summary>

```sql
CREATE TRIGGER trg_class_rename AFTER UPDATE OF name ON public.classes FOR EACH ROW EXECUTE FUNCTION app.on_class_rename()
```

</details>

<details><summary>Indexes (1)</summary>

```sql
CREATE UNIQUE INDEX classes_pkey ON public.classes USING btree (id)
```

</details>

### Table class_subjects

- **Kind:** table
- **Row-level security:** enabled, 1 policies
- **Grants:** `authenticated` select; `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `classes` via `class_id`, `users` via `created_by`, `schools` via `school_id`
- **Referenced by:** `exam_sheets`, `student_subjects`, `teacher_subjects`
- **Written by routes:** `/api/ops/schools/[id]/classes` (select/insert/update/delete), `/api/ops/schools/[id]/subjects` (select/insert/update/delete; in SQL: select; maybe: select)
- **Read by routes:** `/api/admin/certificates`, `/api/admin/exams`, `/api/admin/import`, `/api/admin/import/[id]`, `/api/admin/subjects`, `/api/admin/users/assignments`, `/api/import/worker`, `/api/ops/overview`, `/api/ops/requests`, `/api/ops/schools/[id]`, `/api/ops/schools/[id]/import`, `/api/ops/schools/[id]/import/[jobId]`, `/api/ops/schools/[id]/people`, `/api/ops/schools/[id]/people/[userId]`, `/api/teacher/exams`, `/api/teacher/practicals`
- **SQL functions:** `app.enrol_core()` select, `app.guard_subject_link()` select, `ops_subject_metrics()` select, `app.reconcile_student_subjects()` select, `app.sync_class_subject_meta()` select, `app.sync_teacher_assignments()` select

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `school_id` | uuid | not null |  |
| `class_id` | uuid | not null |  |
| `subject_key` | text | not null |  |
| `subject_name` | text | not null |  |
| `board` | text | not null | `'CBSE'::text` |
| `level` | text | not null |  |
| `kind` | text | not null | `'core'::text` |
| `created_by` | uuid |  |  |
| `created_at` | timestamp with time zone | not null | `now()` |
| `updated_at` | timestamp with time zone | not null | `now()` |

<details><summary>Unique and check constraints</summary>

```sql
UNIQUE UNIQUE (class_id, subject_key)
CHECK ((level ~ '^(1[0-2]|[1-9])$'::text))
CHECK ((board = 'CBSE'::text))
CHECK ((kind = ANY (ARRAY['core'::text, 'elective'::text])))
CHECK (((subject_key ~ '^[a-z0-9]+(-[a-z0-9]+)*$'::text) AND (char_length(subject_key) <= 80)))
CHECK (((char_length(subject_name) >= 1) AND (char_length(subject_name) <= 120)))
```

</details>

<details><summary>RLS policies (1)</summary>

- **class_subjects_read** · SELECT · authenticated
  - USING `((school_id = ( SELECT app.current_school_id() AS current_school_id)) OR ( SELECT app.is_superadmin() AS is_superadmin))`

</details>

<details><summary>Triggers (3)</summary>

```sql
CREATE TRIGGER trg_audit_class_subjects AFTER INSERT OR DELETE OR UPDATE ON public.class_subjects FOR EACH ROW EXECUTE FUNCTION app.audit('subject_name,kind,level')
CREATE TRIGGER trg_class_subject_change AFTER INSERT OR DELETE OR UPDATE ON public.class_subjects FOR EACH ROW EXECUTE FUNCTION app.on_class_subject_change()
CREATE TRIGGER trg_guard_class_subjects BEFORE INSERT OR UPDATE ON public.class_subjects FOR EACH ROW EXECUTE FUNCTION app.guard_subject_link()
```

</details>

<details><summary>Indexes (3)</summary>

```sql
CREATE UNIQUE INDEX class_subjects_class_id_subject_key_key ON public.class_subjects USING btree (class_id, subject_key)
CREATE UNIQUE INDEX class_subjects_pkey ON public.class_subjects USING btree (id)
CREATE INDEX idx_class_subjects_school ON public.class_subjects USING btree (school_id, subject_key)
```

</details>

### Table student_subjects

- **Kind:** table
- **Row-level security:** enabled, 1 policies
- **Grants:** `authenticated` select; `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `class_subjects` via `class_subject_id`, `users` via `created_by`, `schools` via `school_id`, `users` via `student_id`
- **Written by routes:** `/api/admin/subjects` (select/delete/upsert; maybe: select), `/api/ops/schools/[id]/subjects` (select/delete/upsert; maybe: select)
- **Read by routes:** `/api/admin/exams`, `/api/ops/overview`, `/api/ops/schools/[id]`, `/api/ops/schools/[id]/classes`, `/api/student/subjects`, `/api/teacher/exams`, `/api/teacher/practicals`, `/api/tutor/session`
- **SQL functions:** `app.enrol_core()` insert, `app.on_class_subject_change()` update, `ops_subject_metrics()` select, `app.reconcile_student_subjects()` delete/insert/select

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `school_id` | uuid | not null |  |
| `student_id` | uuid | not null |  |
| `class_subject_id` | uuid | not null |  |
| `source` | text | not null |  |
| `created_by` | uuid |  |  |
| `created_at` | timestamp with time zone | not null | `now()` |

<details><summary>Unique and check constraints</summary>

```sql
UNIQUE UNIQUE (student_id, class_subject_id)
CHECK ((source = ANY (ARRAY['core'::text, 'elective'::text])))
```

</details>

<details><summary>RLS policies (1)</summary>

- **student_subjects_read** · SELECT · authenticated
  - USING `((student_id = ( SELECT auth.uid() AS uid)) OR ( SELECT app.is_parent_of(student_subjects.student_id) AS is_parent_of) OR (( SELECT app.is_staff() AS is_staff) AND (school_id = ( SELECT app.current_school_id() AS current_school_id))) OR ( SELECT app.is_superadmin() AS is_superadmin))`

</details>

<details><summary>Triggers (2)</summary>

```sql
CREATE TRIGGER trg_audit_student_subjects AFTER INSERT OR DELETE OR UPDATE ON public.student_subjects FOR EACH ROW EXECUTE FUNCTION app.audit('source')
CREATE TRIGGER trg_guard_student_subjects BEFORE INSERT OR UPDATE ON public.student_subjects FOR EACH ROW EXECUTE FUNCTION app.guard_subject_link()
```

</details>

<details><summary>Indexes (3)</summary>

```sql
CREATE UNIQUE INDEX student_subjects_pkey ON public.student_subjects USING btree (id)
CREATE UNIQUE INDEX student_subjects_student_id_class_subject_id_key ON public.student_subjects USING btree (student_id, class_subject_id)
CREATE INDEX idx_student_subjects_cs ON public.student_subjects USING btree (class_subject_id)
```

</details>

### Table teacher_subjects

- **Kind:** table
- **Row-level security:** enabled, 1 policies
- **Grants:** `authenticated` select; `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `class_subjects` via `class_subject_id`, `users` via `created_by`, `schools` via `school_id`, `users` via `teacher_id`
- **Written by routes:** `/api/admin/users/assignments` (select/delete/upsert; in SQL: select), `/api/ops/requests` (select/delete/upsert; in SQL: select), `/api/ops/schools/[id]/people` (select/delete/upsert; in SQL: select), `/api/ops/schools/[id]/people/[userId]` (select/delete/upsert; in SQL: select), `/api/ops/schools/[id]/subjects` (select/delete/upsert; in SQL: select; maybe: select)
- **Read by routes:** `/api/admin/exams`, `/api/admin/subjects`, `/api/ops/overview`, `/api/ops/schools/[id]`, `/api/ops/schools/[id]/classes`, `/api/student/subjects`, `/api/teacher/exams`, `/api/teacher/practicals`, `/api/tutor/session`
- **SQL functions:** `app.on_class_subject_change()` select, `ops_subject_metrics()` select, `app.sync_teacher_assignments()` select

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `school_id` | uuid | not null |  |
| `teacher_id` | uuid | not null |  |
| `class_subject_id` | uuid | not null |  |
| `role` | text | not null | `'subject_teacher'::text` |
| `created_by` | uuid |  |  |
| `created_at` | timestamp with time zone | not null | `now()` |

<details><summary>Unique and check constraints</summary>

```sql
UNIQUE UNIQUE (teacher_id, class_subject_id)
CHECK ((role = ANY (ARRAY['subject_teacher'::text, 'co_teacher'::text])))
```

</details>

<details><summary>RLS policies (1)</summary>

- **teacher_subjects_read** · SELECT · authenticated
  - USING `((school_id = ( SELECT app.current_school_id() AS current_school_id)) OR ( SELECT app.is_superadmin() AS is_superadmin))`

</details>

<details><summary>Triggers (3)</summary>

```sql
CREATE TRIGGER trg_audit_teacher_subjects AFTER INSERT OR DELETE OR UPDATE ON public.teacher_subjects FOR EACH ROW EXECUTE FUNCTION app.audit('role,teacher_id')
CREATE TRIGGER trg_guard_teacher_subjects BEFORE INSERT OR UPDATE ON public.teacher_subjects FOR EACH ROW EXECUTE FUNCTION app.guard_subject_link()
CREATE TRIGGER trg_teacher_subject_change AFTER INSERT OR DELETE OR UPDATE ON public.teacher_subjects FOR EACH ROW EXECUTE FUNCTION app.on_teacher_subject_change()
```

</details>

<details><summary>Indexes (3)</summary>

```sql
CREATE UNIQUE INDEX teacher_subjects_pkey ON public.teacher_subjects USING btree (id)
CREATE UNIQUE INDEX teacher_subjects_teacher_id_class_subject_id_key ON public.teacher_subjects USING btree (teacher_id, class_subject_id)
CREATE INDEX idx_teacher_subjects_cs ON public.teacher_subjects USING btree (class_subject_id)
```

</details>

### Table subject_leads

- **Kind:** table
- **Row-level security:** enabled, 1 policies
- **Grants:** `authenticated` select; `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `users` via `created_by`, `schools` via `school_id`, `users` via `user_id`
- **Written by routes:** `/api/admin/subjects` (select/delete/insert; maybe: select), `/api/ops/schools/[id]/subjects` (select/delete/insert; maybe: select)
- **Read by routes:** `/api/ops/overview`, `/api/ops/schools/[id]`
- **SQL functions:** `ops_subject_metrics()` select

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `school_id` | uuid | not null |  |
| `subject_key` | text | not null |  |
| `subject_name` | text | not null |  |
| `user_id` | uuid | not null |  |
| `created_by` | uuid |  |  |
| `created_at` | timestamp with time zone | not null | `now()` |

<details><summary>Unique and check constraints</summary>

```sql
UNIQUE UNIQUE (school_id, subject_key, user_id)
```

</details>

<details><summary>RLS policies (1)</summary>

- **subject_leads_read** · SELECT · authenticated
  - USING `((school_id = ( SELECT app.current_school_id() AS current_school_id)) OR ( SELECT app.is_superadmin() AS is_superadmin))`

</details>

<details><summary>Triggers (2)</summary>

```sql
CREATE TRIGGER trg_audit_subject_leads AFTER INSERT OR DELETE OR UPDATE ON public.subject_leads FOR EACH ROW EXECUTE FUNCTION app.audit()
CREATE TRIGGER trg_guard_subject_leads BEFORE INSERT OR UPDATE ON public.subject_leads FOR EACH ROW EXECUTE FUNCTION app.guard_subject_link()
```

</details>

<details><summary>Indexes (2)</summary>

```sql
CREATE UNIQUE INDEX subject_leads_pkey ON public.subject_leads USING btree (id)
CREATE UNIQUE INDEX subject_leads_school_id_subject_key_user_id_key ON public.subject_leads USING btree (school_id, subject_key, user_id)
```

</details>

### Table syllabus

- **Kind:** table
- **Row-level security:** enabled, 2 policies
- **Grants:** `authenticated` delete/insert/references/select/trigger/update; `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `schools` via `school_id`, `users` via `teacher_id`
- **Written by routes:** `/api/admin/users/assignments` (in SQL: update/select), `/api/ops/requests` (in SQL: update/select), `/api/ops/schools/[id]/classes` (in SQL: update/select), `/api/ops/schools/[id]/people` (in SQL: update/select), `/api/ops/schools/[id]/people/[userId]` (in SQL: update/select), `/api/ops/schools/[id]/subjects` (in SQL: update/select)
- **SQL functions:** `ops_rename_class_subject()` update/select

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `school_id` | uuid |  |  |
| `teacher_id` | uuid |  |  |
| `subject` | text |  |  |
| `class` | text |  |  |
| `topic` | text |  |  |
| `month` | text |  |  |
| `status` | text |  | `'pending'::text` |
| `created_at` | timestamp with time zone |  | `now()` |
| `grade` | text |  |  |
| `objectives` | text |  |  |
| `publisher` | text |  | `'NCERT'::text` |
| `unit_id` | text |  |  |
| `tags` | text[] |  |  |
| `exam_weightage` | integer |  |  |
| `toughness_level` | text |  |  |
| `weightage_score` | numeric |  |  |

<details><summary>Unique and check constraints</summary>

```sql
UNIQUE UNIQUE (teacher_id, topic, month, subject)
```

</details>

<details><summary>RLS policies (2)</summary>

- **syllabus_read** · SELECT · authenticated
  - USING `((school_id = ( SELECT app.current_school_id() AS current_school_id)) OR ( SELECT app.is_superadmin() AS is_superadmin))`
- **syllabus_staff_write** · ALL · authenticated
  - USING `((school_id = ( SELECT app.current_school_id() AS current_school_id)) AND ((( SELECT app.is_teacher() AS is_teacher) AND (teacher_id = ( SELECT auth.uid() AS uid))) OR ( SELECT app.has_perm('people.manage'::text) AS has_perm)))`
  - WITH CHECK `((school_id = ( SELECT app.current_school_id() AS current_school_id)) AND ((( SELECT app.is_teacher() AS is_teacher) AND (teacher_id = ( SELECT auth.uid() AS uid))) OR ( SELECT app.has_perm('people.manage'::text) AS has_perm)))`

</details>

<details><summary>Indexes (3)</summary>

```sql
CREATE UNIQUE INDEX syllabus_pkey ON public.syllabus USING btree (id)
CREATE UNIQUE INDEX syllabus_unique_topic_month_teacher ON public.syllabus USING btree (teacher_id, topic, month, subject)
CREATE INDEX idx_syllabus_teacher ON public.syllabus USING btree (teacher_id)
```

</details>

### Table syllabus_progress

- **Kind:** table
- **Row-level security:** enabled, 1 policies
- **Grants:** `authenticated` delete/insert/references/select/trigger/update; `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `schools` via `school_id`, `users` via `updated_by`
- **Written by routes:** `/api/admin/users/assignments` (in SQL: update/select), `/api/ops/requests` (in SQL: update/select), `/api/ops/schools/[id]/classes` (in SQL: update/select), `/api/ops/schools/[id]/people` (in SQL: update/select), `/api/ops/schools/[id]/people/[userId]` (in SQL: update/select), `/api/ops/schools/[id]/subjects` (in SQL: update/select; maybe: select), `/api/teacher/course` (select/upsert), `/api/teacher/lessons` (upsert)
- **Read by routes:** `/api/admin/subjects`, `/api/ops/overview`, `/api/ops/schools`, `/api/ops/schools/[id]`, `/api/teacher/copilot`
- **Read directly by pages (browser, RLS):** `/teacher/syllabus`
- **SQL functions:** `ops_rename_class_subject()` update/select, `ops_school_metrics()` select

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `school_id` | uuid | not null |  |
| `class` | text | not null |  |
| `subject` | text | not null |  |
| `session` | text | not null | `'2026-27'::text` |
| `chapter_key` | text | not null |  |
| `topic` | text | not null | `''::text` |
| `status` | text | not null | `'not_started'::text` |
| `taught_on` | date |  |  |
| `planned_start` | date |  |  |
| `planned_end` | date |  |  |
| `note` | text |  |  |
| `updated_by` | uuid |  |  |
| `updated_at` | timestamp with time zone | not null | `now()` |

<details><summary>Unique and check constraints</summary>

```sql
UNIQUE UNIQUE (school_id, class, subject, session, chapter_key, topic)
CHECK (((planned_end IS NULL) OR (planned_start IS NULL) OR (planned_end >= planned_start)))
CHECK (((note IS NULL) OR (char_length(note) <= 2000)))
CHECK ((status = ANY (ARRAY['not_started'::text, 'in_progress'::text, 'taught'::text, 'revisit'::text])))
```

</details>

<details><summary>RLS policies (1)</summary>

- **syllabus_progress_staff_read** · SELECT · authenticated
  - USING `((( SELECT app.sees_learning() AS sees_learning) AND (school_id = ( SELECT app.current_school_id() AS current_school_id))) OR ( SELECT app.is_superadmin() AS is_superadmin))`

</details>

<details><summary>Triggers (1)</summary>

```sql
CREATE TRIGGER trg_touch_syllabus_progress BEFORE UPDATE ON public.syllabus_progress FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at()
```

</details>

<details><summary>Indexes (3)</summary>

```sql
CREATE UNIQUE INDEX syllabus_progress_pkey ON public.syllabus_progress USING btree (id)
CREATE UNIQUE INDEX syllabus_progress_school_id_class_subject_session_chapter_k_key ON public.syllabus_progress USING btree (school_id, class, subject, session, chapter_key, topic)
CREATE INDEX idx_syllabus_progress_course ON public.syllabus_progress USING btree (school_id, class, subject, session)
```

</details>

### Table course_plans

- **Kind:** table
- **Row-level security:** enabled, 1 policies
- **Grants:** `authenticated` delete/insert/references/select/trigger/update; `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `schools` via `school_id`, `users` via `updated_by`
- **Written by routes:** `/api/admin/schedule/timetable` (select/update/insert), `/api/admin/users/assignments` (in SQL: update/select), `/api/ops/requests` (in SQL: update/select), `/api/ops/schools/[id]/classes` (in SQL: update/select), `/api/ops/schools/[id]/people` (in SQL: update/select), `/api/ops/schools/[id]/people/[userId]` (in SQL: update/select), `/api/ops/schools/[id]/subjects` (in SQL: update/select; maybe: select), `/api/teacher/course` (select/upsert)
- **Read by routes:** `/api/admin/subjects`
- **Read directly by pages (browser, RLS):** `/teacher/syllabus`
- **SQL functions:** `ops_rename_class_subject()` update/select

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `school_id` | uuid | not null |  |
| `class` | text | not null |  |
| `subject` | text | not null |  |
| `session` | text | not null | `'2026-27'::text` |
| `term_start` | date | not null |  |
| `term_end` | date | not null |  |
| `periods_per_week` | integer | not null | `6` |
| `period_minutes` | integer | not null | `40` |
| `updated_by` | uuid |  |  |
| `created_at` | timestamp with time zone | not null | `now()` |
| `updated_at` | timestamp with time zone | not null | `now()` |
| `periods_source` | text | not null | `'manual'::text` |

<details><summary>Unique and check constraints</summary>

```sql
UNIQUE UNIQUE (school_id, class, subject, session)
CHECK ((term_end > term_start))
CHECK (((period_minutes >= 20) AND (period_minutes <= 120)))
CHECK (((periods_per_week >= 1) AND (periods_per_week <= 20)))
CHECK ((periods_source = ANY (ARRAY['manual'::text, 'timetable'::text])))
```

</details>

<details><summary>RLS policies (1)</summary>

- **course_plans_staff_read** · SELECT · authenticated
  - USING `((( SELECT app.sees_learning() AS sees_learning) AND (school_id = ( SELECT app.current_school_id() AS current_school_id))) OR ( SELECT app.is_superadmin() AS is_superadmin))`

</details>

<details><summary>Triggers (1)</summary>

```sql
CREATE TRIGGER trg_touch_course_plans BEFORE UPDATE ON public.course_plans FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at()
```

</details>

<details><summary>Indexes (2)</summary>

```sql
CREATE UNIQUE INDEX course_plans_pkey ON public.course_plans USING btree (id)
CREATE UNIQUE INDEX course_plans_school_id_class_subject_session_key ON public.course_plans USING btree (school_id, class, subject, session)
```

</details>

### Table lesson_plans

- **Kind:** table
- **Row-level security:** enabled, 1 policies
- **Grants:** `authenticated` delete/insert/references/select/trigger/update; `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `assignments` via `homework_assignment_id`, `schools` via `school_id`, `users` via `teacher_id`
- **Referenced by:** `lab_scenes`
- **Written by routes:** `/api/admin/users/assignments` (in SQL: update), `/api/ops/requests` (in SQL: update), `/api/ops/schools/[id]/classes` (in SQL: update), `/api/ops/schools/[id]/people` (in SQL: update), `/api/ops/schools/[id]/people/[userId]` (in SQL: update), `/api/ops/schools/[id]/subjects` (in SQL: update; maybe: select), `/api/teacher/lessons` (insert/select/update/delete)
- **Read by routes:** `/api/admin/subjects`, `/api/ops/overview`, `/api/ops/schools`, `/api/ops/schools/[id]`, `/api/staff/ask`, `/api/teacher/copilot`, `/api/teacher/lab`, `/api/whatsapp/simulate`, `/api/whatsapp/webhook`
- **Read directly by pages (browser, RLS):** `/admin (layout)`, `/teacher/lab/build`, `/teacher/syllabus`
- **SQL functions:** `ops_rename_class_subject()` update, `ops_school_metrics()` select

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `school_id` | uuid | not null |  |
| `teacher_id` | uuid | not null |  |
| `class` | text | not null |  |
| `subject` | text | not null |  |
| `session` | text | not null | `'2026-27'::text` |
| `chapter_key` | text | not null |  |
| `chapter_name` | text | not null |  |
| `topics` | text[] | not null | `'{}'::text[]` |
| `title` | text | not null |  |
| `lesson_date` | date |  |  |
| `period` | integer |  |  |
| `duration_min` | integer | not null | `40` |
| `objectives` | text[] | not null | `'{}'::text[]` |
| `success_criteria` | text[] | not null | `'{}'::text[]` |
| `prior_knowledge` | text |  |  |
| `materials` | jsonb | not null | `'[]'::jsonb` |
| `stages` | jsonb | not null | `'[]'::jsonb` |
| `differentiation` | jsonb | not null | `'{}'::jsonb` |
| `check_for_understanding` | text |  |  |
| `homework_assignment_id` | uuid |  |  |
| `status` | text | not null | `'draft'::text` |
| `reflection` | text |  |  |
| `taught_on` | date |  |  |
| `ai_drafted` | boolean | not null | `false` |
| `created_at` | timestamp with time zone | not null | `now()` |
| `updated_at` | timestamp with time zone | not null | `now()` |

<details><summary>Unique and check constraints</summary>

```sql
CHECK (((duration_min >= 10) AND (duration_min <= 240)))
CHECK (((period IS NULL) OR ((period >= 1) AND (period <= 12))))
CHECK ((status = ANY (ARRAY['draft'::text, 'ready'::text, 'taught'::text])))
CHECK (((char_length(title) >= 1) AND (char_length(title) <= 200)))
```

</details>

<details><summary>RLS policies (1)</summary>

- **lesson_plans_staff_read** · SELECT · authenticated
  - USING `((( SELECT app.sees_learning() AS sees_learning) AND (school_id = ( SELECT app.current_school_id() AS current_school_id))) OR ( SELECT app.is_superadmin() AS is_superadmin))`

</details>

<details><summary>Triggers (1)</summary>

```sql
CREATE TRIGGER trg_touch_lesson_plans BEFORE UPDATE ON public.lesson_plans FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at()
```

</details>

<details><summary>Indexes (3)</summary>

```sql
CREATE UNIQUE INDEX lesson_plans_pkey ON public.lesson_plans USING btree (id)
CREATE INDEX idx_lesson_plans_course ON public.lesson_plans USING btree (school_id, class, subject, lesson_date)
CREATE INDEX idx_lesson_plans_teacher ON public.lesson_plans USING btree (teacher_id, lesson_date)
```

</details>

### Table learning_outcomes

- **Kind:** table
- **Row-level security:** enabled, 2 policies
- **Grants:** `authenticated` delete/insert/references/select/trigger/update; `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **Referenced by:** `submission_items`

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `subject` | text | not null |  |
| `class` | text | not null |  |
| `unit_name` | text | not null |  |
| `outcome_code` | text | not null |  |
| `outcome_name` | text | not null |  |
| `description` | text |  |  |
| `created_at` | timestamp with time zone |  | `now()` |

<details><summary>Unique and check constraints</summary>

```sql
UNIQUE UNIQUE (outcome_code)
```

</details>

<details><summary>RLS policies (2)</summary>

- **learning_outcomes_read** · SELECT · authenticated
  - USING `true`
- **learning_outcomes_superadmin_write** · ALL · authenticated
  - USING `( SELECT app.is_superadmin() AS is_superadmin)`
  - WITH CHECK `( SELECT app.is_superadmin() AS is_superadmin)`

</details>

<details><summary>Indexes (2)</summary>

```sql
CREATE UNIQUE INDEX learning_outcomes_outcome_code_key ON public.learning_outcomes USING btree (outcome_code)
CREATE UNIQUE INDEX learning_outcomes_pkey ON public.learning_outcomes USING btree (id)
```

</details>

### Table materials

- **Kind:** table
- **Row-level security:** enabled, 2 policies
- **Grants:** `authenticated` delete/insert/references/select/trigger/update; `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `schools` via `school_id`, `users` via `teacher_id`
- **Written by routes:** `/api/admin/users/assignments` (in SQL: update), `/api/ops/requests` (in SQL: update), `/api/ops/schools/[id]/classes` (in SQL: update), `/api/ops/schools/[id]/people` (in SQL: update), `/api/ops/schools/[id]/people/[userId]` (in SQL: update), `/api/ops/schools/[id]/subjects` (in SQL: update)
- **Read by routes:** `/api/ops/overview`, `/api/ops/schools`, `/api/ops/schools/[id]`
- **Read directly by pages (browser, RLS):** `/student/videos`
- **SQL functions:** `ops_rename_class_subject()` update, `ops_school_metrics()` select

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `school_id` | uuid |  |  |
| `teacher_id` | uuid |  |  |
| `title` | text |  |  |
| `content` | jsonb |  |  |
| `subject` | text |  |  |
| `class` | text |  |  |
| `created_at` | timestamp with time zone |  | `now()` |

<details><summary>RLS policies (2)</summary>

- **materials_read** · SELECT · authenticated
  - USING `((school_id IS NULL) OR (school_id = ( SELECT app.current_school_id() AS current_school_id)) OR ( SELECT app.is_superadmin() AS is_superadmin))`
- **materials_staff_write** · ALL · authenticated
  - USING `(((( SELECT app.is_teacher() AS is_teacher) OR ( SELECT app.has_perm('people.manage'::text) AS has_perm)) AND (school_id = ( SELECT app.current_school_id() AS current_school_id))) OR ( SELECT app.is_superadmin() AS is_superadmin))`
  - WITH CHECK `(((( SELECT app.is_teacher() AS is_teacher) OR ( SELECT app.has_perm('people.manage'::text) AS has_perm)) AND (school_id = ( SELECT app.current_school_id() AS current_school_id))) OR ( SELECT app.is_superadmin() AS is_superadmin))`

</details>

<details><summary>Indexes (1)</summary>

```sql
CREATE UNIQUE INDEX materials_pkey ON public.materials USING btree (id)
```

</details>

## Assignments, grading & TML

### Table assignments

- **Kind:** table
- **Row-level security:** enabled, 4 policies
- **Grants:** `authenticated` delete/insert/references/select/trigger/update; `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `schools` via `school_id`, `users` via `teacher_id`
- **Referenced by:** `lesson_plans`, `proctor_alerts`, `submission_items`, `submissions`
- **Written by routes:** `/api/admin/users/assignments` (in SQL: update), `/api/ops/requests` (in SQL: update), `/api/ops/schools/[id]/classes` (in SQL: update), `/api/ops/schools/[id]/people` (in SQL: update), `/api/ops/schools/[id]/people/[userId]` (in SQL: update), `/api/ops/schools/[id]/subjects` (in SQL: update; maybe: select), `/api/teacher/assignments` (insert/select/update/delete)
- **Read by routes:** `/api/admin/heatmap-data`, `/api/admin/subjects`, `/api/feed`, `/api/grading/pages`, `/api/homework/grade`, `/api/ops/overview`, `/api/ops/schools`, `/api/ops/schools/[id]`, `/api/parent/ask`, `/api/parent/desk`, `/api/staff/ask`, `/api/student/proctor-alert`, `/api/student/submit-typed`, `/api/student/upload-submission`, `/api/student/work`, `/api/teacher/attendance`, `/api/teacher/capture`, `/api/teacher/copilot`, `/api/teacher/exams`, `/api/teacher/lessons`, `/api/teacher/review-submission`, `/api/teacher/submissions`, `/api/timeline`, `/api/whatsapp/simulate`, `/api/whatsapp/webhook`
- **Read directly by pages (browser, RLS):** `/admin (layout)`, `/admin/paper-gen`, `/teacher (layout)`, `/teacher/syllabus`
- **SQL functions:** `admin_teacher_work()` select, `ops_rename_class_subject()` update, `ops_school_metrics()` select

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `school_id` | uuid |  |  |
| `teacher_id` | uuid |  |  |
| `title` | text | not null |  |
| `type` | text |  |  |
| `subject` | text |  |  |
| `class` | text |  |  |
| `description` | text |  |  |
| `instructions` | text |  |  |
| `due_date` | date |  |  |
| `questions` | jsonb |  | `'[]'::jsonb` |
| `tasks` | jsonb |  | `'[]'::jsonb` |
| `units` | text[] |  | `'{}'::text[]` |
| `question_paper_url` | text |  |  |
| `assigned_student_ids` | text[] |  | `'{}'::text[]` |
| `total_marks` | numeric |  |  |
| `status` | text |  | `'published'::text` |
| `created_at` | timestamp with time zone |  | `now()` |
| `proctored` | boolean | not null | `false` |
| `submission_mode` | text | not null | `'handwritten'::text` |
| `updated_at` | timestamp with time zone | not null | `now()` |

<details><summary>Unique and check constraints</summary>

```sql
CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text])))
CHECK ((submission_mode = ANY (ARRAY['typed'::text, 'handwritten'::text])))
CHECK ((type = ANY (ARRAY['homework'::text, 'quiz'::text, 'task'::text])))
```

</details>

<details><summary>RLS policies (4)</summary>

- **assignments_read** · SELECT · authenticated
  - USING `(((school_id = ( SELECT app.current_school_id() AS current_school_id)) AND ( SELECT app.is_staff() AS is_staff)) OR ( SELECT app.is_superadmin() AS is_superadmin))`
- **assignments_staff_delete** · DELETE · authenticated
  - USING `((school_id = ( SELECT app.current_school_id() AS current_school_id)) AND ((( SELECT app.is_teacher() AS is_teacher) AND (teacher_id = ( SELECT auth.uid() AS uid))) OR ( SELECT app.has_perm('people.manage'::text) AS has_perm)))`
- **assignments_staff_insert** · INSERT · authenticated
  - WITH CHECK `((school_id = ( SELECT app.current_school_id() AS current_school_id)) AND ((( SELECT app.is_teacher() AS is_teacher) AND (teacher_id = ( SELECT auth.uid() AS uid))) OR ( SELECT app.has_perm('people.manage'::text) AS has_perm)))`
- **assignments_staff_update** · UPDATE · authenticated
  - USING `((school_id = ( SELECT app.current_school_id() AS current_school_id)) AND ((( SELECT app.is_teacher() AS is_teacher) AND (teacher_id = ( SELECT auth.uid() AS uid))) OR ( SELECT app.has_perm('people.manage'::text) AS has_perm)))`
  - WITH CHECK `((school_id = ( SELECT app.current_school_id() AS current_school_id)) AND ((( SELECT app.is_teacher() AS is_teacher) AND (teacher_id = ( SELECT auth.uid() AS uid))) OR ( SELECT app.has_perm('people.manage'::text) AS has_perm)))`

</details>

<details><summary>Triggers (1)</summary>

```sql
CREATE TRIGGER trg_touch_assignments BEFORE UPDATE ON public.assignments FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at()
```

</details>

<details><summary>Indexes (5)</summary>

```sql
CREATE UNIQUE INDEX assignments_pkey ON public.assignments USING btree (id)
CREATE INDEX idx_assignments_class ON public.assignments USING btree (class)
CREATE INDEX idx_assignments_school ON public.assignments USING btree (school_id, created_at DESC)
CREATE INDEX idx_assignments_school_id ON public.assignments USING btree (school_id)
CREATE INDEX idx_assignments_teacher ON public.assignments USING btree (teacher_id)
```

</details>

### Table assignments_student

- **Kind:** view
- **Row-level security:** n/a (view)
- **Grants:** `authenticated` delete/insert/references/select/trigger/truncate/update; `service_role` delete/insert/references/select/trigger/truncate/update
- **Read directly by pages (browser, RLS):** `/student/homework/[id]`, `/student (layout)`

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid |  |  |
| `school_id` | uuid |  |  |
| `teacher_id` | uuid |  |  |
| `title` | text |  |  |
| `type` | text |  |  |
| `subject` | text |  |  |
| `class` | text |  |  |
| `description` | text |  |  |
| `instructions` | text |  |  |
| `due_date` | date |  |  |
| `questions` | jsonb |  |  |
| `tasks` | jsonb |  |  |
| `units` | text[] |  |  |
| `question_paper_url` | text |  |  |
| `assigned_student_ids` | text[] |  |  |
| `total_marks` | numeric |  |  |
| `status` | text |  |  |
| `created_at` | timestamp with time zone |  |  |
| `proctored` | boolean |  |  |
| `submission_mode` | text |  |  |
| `updated_at` | timestamp with time zone |  |  |

### Table submissions

- **Kind:** table
- **Row-level security:** enabled, 1 policies
- **Grants:** `authenticated` delete/insert/references/select/trigger/update; `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `assignments` via `assignment_id`, `schools` via `school_id`, `users` via `student_id`
- **Referenced by:** `submission_items`
- **Written by routes:** `/api/homework/grade` (select/insert/update), `/api/student/submit-typed` (select/insert), `/api/teacher/capture` (select/update/insert), `/api/teacher/review-submission` (select/update), `/api/teacher/submissions` (select/update/delete)
- **Read by routes:** `/api/admin/heatmap-data`, `/api/feed`, `/api/grading/pages`, `/api/ops/overview`, `/api/ops/schools`, `/api/ops/schools/[id]`, `/api/parent/ask`, `/api/parent/desk`, `/api/staff/ask`, `/api/student/work`, `/api/teacher/assignments`, `/api/teacher/copilot`, `/api/teacher/exams`, `/api/timeline`, `/api/tml/compute`, `/api/tutor/session`, `/api/whatsapp/simulate`, `/api/whatsapp/webhook`
- **Read directly by pages (browser, RLS):** `/admin (layout)`, `/student/homework/[id]`, `/student (layout)`, `/teacher (layout)`
- **SQL functions:** `admin_teacher_work()` select, `ops_school_metrics()` select

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `assignment_id` | uuid |  |  |
| `student_id` | uuid |  |  |
| `school_id` | uuid |  |  |
| `score` | numeric |  |  |
| `max_score` | numeric |  |  |
| `grade` | text |  |  |
| `final_grade` | text |  |  |
| `ai_graded` | boolean |  | `false` |
| `ai_result` | jsonb |  |  |
| `teacher_approved` | boolean |  |  |
| `image_urls` | text[] |  | `'{}'::text[]` |
| `submission_text` | text |  |  |
| `answers` | jsonb |  |  |
| `type` | text |  |  |
| `submitted_at` | timestamp with time zone |  | `now()` |
| `ai_feedback` | text |  |  |
| `ai_grade` | text |  |  |
| `updated_at` | timestamp with time zone |  | `now()` |
| `teacher_note` | text |  |  |

<details><summary>Unique and check constraints</summary>

```sql
UNIQUE UNIQUE (assignment_id, student_id)
CHECK (((score IS NULL) OR ((score >= (0)::numeric) AND ((max_score IS NULL) OR (score <= max_score))))) NOT VALID
```

</details>

<details><summary>RLS policies (1)</summary>

- **submissions_read** · SELECT · authenticated
  - USING `((student_id = ( SELECT auth.uid() AS uid)) OR (( SELECT app.sees_learning() AS sees_learning) AND (school_id = ( SELECT app.current_school_id() AS current_school_id))) OR app.is_parent_of(student_id) OR ( SELECT app.is_superadmin() AS is_superadmin))`

</details>

<details><summary>Triggers (2)</summary>

```sql
CREATE TRIGGER trg_audit_submissions AFTER DELETE OR UPDATE ON public.submissions FOR EACH ROW EXECUTE FUNCTION app.audit('score,max_score,grade,final_grade,teacher_approved,ai_grade')
CREATE TRIGGER trg_touch_submissions BEFORE UPDATE ON public.submissions FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at()
```

</details>

<details><summary>Indexes (5)</summary>

```sql
CREATE UNIQUE INDEX submissions_pkey ON public.submissions USING btree (id)
CREATE UNIQUE INDEX unique_assignment_student ON public.submissions USING btree (assignment_id, student_id)
CREATE INDEX idx_submissions_assign ON public.submissions USING btree (assignment_id)
CREATE INDEX idx_submissions_school ON public.submissions USING btree (school_id)
CREATE INDEX idx_submissions_student ON public.submissions USING btree (student_id)
```

</details>

### Table submission_items

- **Kind:** table
- **Row-level security:** enabled, 1 policies
- **Grants:** `authenticated` delete/insert/references/select/trigger/update; `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `assignments` via `assignment_id`, `learning_outcomes` via `outcome_code`, `schools` via `school_id`, `users` via `student_id`, `submissions` via `submission_id`
- **Written by routes:** `/api/homework/grade` (delete), `/api/student/submit-typed` (insert/select), `/api/teacher/capture` (delete), `/api/teacher/review-submission` (delete/insert/select), `/api/teacher/submissions` (select/delete)
- **Read by routes:** `/api/ops/overview`, `/api/staff/ask`, `/api/student/work`, `/api/tml/compute`, `/api/tutor/session`, `/api/whatsapp/simulate`, `/api/whatsapp/webhook`
- **Read directly by pages (browser, RLS):** `/teacher (layout)`
- **SQL functions:** `ops_tml_stale()` select

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `submission_id` | uuid | not null |  |
| `assignment_id` | uuid | not null |  |
| `student_id` | uuid | not null |  |
| `school_id` | uuid |  |  |
| `question_index` | integer | not null |  |
| `outcome_code` | text |  |  |
| `component_type` | text | not null | `'homework'::text` |
| `score` | numeric(5,2) | not null | `0` |
| `max_score` | numeric(5,2) | not null | `1` |
| `difficulty` | text |  | `'medium'::text` |
| `hints_used` | integer |  | `0` |
| `attempts_count` | integer |  | `1` |
| `teacher_confirmed` | boolean |  | `true` |
| `created_at` | timestamp with time zone |  | `now()` |

<details><summary>Unique and check constraints</summary>

```sql
CHECK ((component_type = ANY (ARRAY['assessment'::text, 'quiz'::text, 'homework'::text, 'retention'::text, 'classwork'::text])))
CHECK ((difficulty = ANY (ARRAY['easy'::text, 'medium'::text, 'hard'::text])))
```

</details>

<details><summary>RLS policies (1)</summary>

- **submission_items_read** · SELECT · authenticated
  - USING `((student_id = ( SELECT auth.uid() AS uid)) OR (( SELECT app.sees_learning() AS sees_learning) AND (school_id = ( SELECT app.current_school_id() AS current_school_id))) OR app.is_parent_of(student_id) OR ( SELECT app.is_superadmin() AS is_superadmin))`

</details>

<details><summary>Indexes (3)</summary>

```sql
CREATE UNIQUE INDEX submission_items_pkey ON public.submission_items USING btree (id)
CREATE INDEX idx_submission_items_confirmed_recent ON public.submission_items USING btree (created_at) WHERE teacher_confirmed
CREATE INDEX idx_submission_items_student ON public.submission_items USING btree (student_id, created_at DESC)
```

</details>

### Table tml_scores

- **Kind:** table
- **Row-level security:** enabled, 1 policies
- **Grants:** `authenticated` delete/insert/references/select/trigger/update; `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `schools` via `school_id`, `users` via `student_id`
- **Written by routes:** `/api/admin/users/assignments` (in SQL: update), `/api/ops/requests` (in SQL: update), `/api/ops/schools/[id]/classes` (in SQL: update), `/api/ops/schools/[id]/people` (in SQL: update), `/api/ops/schools/[id]/people/[userId]` (in SQL: update), `/api/ops/schools/[id]/subjects` (in SQL: update), `/api/student/submit-typed` (insert), `/api/teacher/review-submission` (insert/select), `/api/teacher/submissions` (insert), `/api/tml/compute` (insert), `/api/tutor/session` (select/insert)
- **Read by routes:** `/api/admin/exams`, `/api/feed`, `/api/ops/overview`, `/api/parent/ask`, `/api/parent/desk`, `/api/staff/ask`, `/api/student/subjects`, `/api/teacher/copilot`, `/api/teacher/exams`, `/api/timeline`, `/api/whatsapp/simulate`, `/api/whatsapp/webhook`
- **Read directly by pages (browser, RLS):** `/admin (layout)`, `/student (layout)`, `/teacher (layout)`
- **SQL functions:** `ops_rename_class_subject()` update, `ops_tml_stale()` select

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `student_id` | uuid | not null |  |
| `school_id` | uuid |  |  |
| `subject` | text | not null |  |
| `topic_name` | text | not null |  |
| `outcome_code` | text |  |  |
| `score` | numeric(5,2) | not null |  |
| `confidence_band` | text |  | `'provisional'::text` |
| `item_count` | integer |  | `0` |
| `components` | jsonb |  | `'{}'::jsonb` |
| `computed_at` | timestamp with time zone |  | `now()` |

<details><summary>Unique and check constraints</summary>

```sql
CHECK ((confidence_band = ANY (ARRAY['insufficient'::text, 'provisional'::text, 'firm'::text])))
CHECK (((score >= (0)::numeric) AND (score <= (100)::numeric)))
```

</details>

<details><summary>RLS policies (1)</summary>

- **tml_scores_read** · SELECT · authenticated
  - USING `((student_id = ( SELECT auth.uid() AS uid)) OR (( SELECT app.sees_learning() AS sees_learning) AND (school_id = ( SELECT app.current_school_id() AS current_school_id))) OR app.is_parent_of(student_id) OR ( SELECT app.is_superadmin() AS is_superadmin))`

</details>

<details><summary>Indexes (3)</summary>

```sql
CREATE UNIQUE INDEX tml_scores_pkey ON public.tml_scores USING btree (id)
CREATE INDEX idx_tml_scores_student_computed ON public.tml_scores USING btree (student_id, computed_at DESC)
CREATE INDEX idx_tml_student_subject ON public.tml_scores USING btree (student_id, subject, computed_at DESC)
```

</details>

### Table engagement_scores

- **Kind:** table
- **Row-level security:** enabled, 1 policies
- **Grants:** `authenticated` delete/insert/references/select/trigger/update; `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `schools` via `school_id`, `users` via `student_id`
- **Read by routes:** `/api/student/submit-typed`, `/api/teacher/review-submission`, `/api/teacher/submissions`, `/api/tml/compute`, `/api/tutor/session`

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `student_id` | uuid | not null |  |
| `school_id` | uuid |  |  |
| `attendance_score` | numeric(5,2) |  | `100` |
| `app_engagement_score` | numeric(5,2) |  | `100` |
| `teacher_engagement_score` | numeric(5,2) |  | `100` |
| `overall_engagement` | numeric(5,2) |  | `100` |
| `computed_at` | timestamp with time zone |  | `now()` |

<details><summary>RLS policies (1)</summary>

- **engagement_scores_read** · SELECT · authenticated
  - USING `((student_id = ( SELECT auth.uid() AS uid)) OR (( SELECT app.sees_learning() AS sees_learning) AND (school_id = ( SELECT app.current_school_id() AS current_school_id))) OR app.is_parent_of(student_id) OR ( SELECT app.is_superadmin() AS is_superadmin))`

</details>

<details><summary>Indexes (1)</summary>

```sql
CREATE UNIQUE INDEX engagement_scores_pkey ON public.engagement_scores USING btree (id)
```

</details>

## AI tutor

### Table tutor_sessions

- **Kind:** table
- **Row-level security:** enabled, 1 policies
- **Grants:** `authenticated` delete/insert/references/select/trigger/update; `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `schools` via `school_id`, `users` via `student_id`
- **Written by routes:** `/api/admin/users/assignments` (in SQL: update), `/api/ops/requests` (in SQL: update), `/api/ops/schools/[id]/classes` (in SQL: update), `/api/ops/schools/[id]/people` (in SQL: update), `/api/ops/schools/[id]/people/[userId]` (in SQL: update), `/api/ops/schools/[id]/subjects` (in SQL: update), `/api/tutor/session` (insert/select)
- **Read by routes:** `/api/ops/overview`, `/api/ops/schools`, `/api/ops/schools/[id]`, `/api/student/submit-typed`, `/api/teacher/copilot`, `/api/teacher/review-submission`, `/api/teacher/submissions`, `/api/tml/compute`
- **Read directly by pages (browser, RLS):** `/student (layout)`
- **SQL functions:** `ops_rename_class_subject()` update, `ops_school_metrics()` select

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `student_id` | uuid | not null |  |
| `school_id` | uuid |  |  |
| `subject` | text |  |  |
| `topic` | text |  |  |
| `question_id` | text |  |  |
| `hint_depth` | integer |  | `0` |
| `answer_revealed` | boolean |  | `false` |
| `created_at` | timestamp with time zone |  | `now()` |
| `subject_key` | text |  |  |
| `chapter_key` | text |  |  |
| `micro_topic` | text |  |  |
| `grounding` | text |  |  |

<details><summary>Unique and check constraints</summary>

```sql
CHECK (((grounding IS NULL) OR (grounding = ANY (ARRAY['syllabus'::text, 'prerequisite'::text, 'exam'::text, 'study_skills'::text]))))
```

</details>

<details><summary>RLS policies (1)</summary>

- **tutor_sessions_read** · SELECT · authenticated
  - USING `((student_id = ( SELECT auth.uid() AS uid)) OR (( SELECT app.sees_learning() AS sees_learning) AND (school_id = ( SELECT app.current_school_id() AS current_school_id))) OR ( SELECT app.is_superadmin() AS is_superadmin))`

</details>

<details><summary>Indexes (2)</summary>

```sql
CREATE UNIQUE INDEX tutor_sessions_pkey ON public.tutor_sessions USING btree (id)
CREATE INDEX idx_tutor_sessions_student ON public.tutor_sessions USING btree (student_id, created_at DESC)
```

</details>

### Table tutor_session_turns

- **Kind:** table
- **Row-level security:** enabled, 0 policies
- **Grants:** `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (sid)`
- **References:** `users` via `student_id`
- **Written by routes:** `/api/tutor/session` (delete/insert/update/select)

| Column | Type | Null | Default |
|---|---|---|---|
| `sid` | uuid | not null |  |
| `student_id` | uuid | not null |  |
| `seq` | integer | not null | `0` |
| `created_at` | timestamp with time zone | not null | `now()` |
| `updated_at` | timestamp with time zone | not null | `now()` |

<details><summary>Indexes (2)</summary>

```sql
CREATE UNIQUE INDEX tutor_session_turns_pkey ON public.tutor_session_turns USING btree (sid)
CREATE INDEX tutor_session_turns_student_idx ON public.tutor_session_turns USING btree (student_id, created_at)
```

</details>

### Table tutor_guard_events

- **Kind:** table
- **Row-level security:** enabled, 1 policies
- **Grants:** `authenticated` select; `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `schools` via `school_id`, `users` via `student_id`
- **Written by routes:** `/api/tutor/session` (insert/select)

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `school_id` | uuid |  |  |
| `student_id` | uuid | not null |  |
| `kind` | text | not null |  |
| `subject_key` | text |  |  |
| `created_at` | timestamp with time zone | not null | `now()` |

<details><summary>Unique and check constraints</summary>

```sql
CHECK ((kind = ANY (ARRAY['off_topic'::text, 'profanity'::text, 'safety'::text])))
```

</details>

<details><summary>RLS policies (1)</summary>

- **tutor_guard_events_read** · SELECT · authenticated
  - USING `((student_id = ( SELECT auth.uid() AS uid)) OR ((school_id = ( SELECT app.current_school_id() AS current_school_id)) AND ( SELECT app.has_perm('feed.read'::text) AS has_perm)) OR ( SELECT app.is_superadmin() AS is_superadmin))`

</details>

<details><summary>Indexes (3)</summary>

```sql
CREATE UNIQUE INDEX tutor_guard_events_pkey ON public.tutor_guard_events USING btree (id)
CREATE INDEX idx_tutor_guard_school ON public.tutor_guard_events USING btree (school_id, created_at DESC)
CREATE INDEX idx_tutor_guard_student ON public.tutor_guard_events USING btree (student_id, kind, created_at DESC)
```

</details>

### Table student_chats

- **Kind:** table · in the `supabase_realtime` publication
- **Row-level security:** enabled, 1 policies
- **Grants:** `authenticated` delete/insert/references/select/trigger/update; `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `users` via `student_id`
- **Read by routes:** `/api/ops/overview`, `/api/ops/schools`, `/api/ops/schools/[id]`
- **SQL functions:** `ops_school_metrics()` select

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `student_id` | uuid |  |  |
| `role` | text |  |  |
| `content` | text |  |  |
| `created_at` | timestamp with time zone |  | `now()` |

<details><summary>Unique and check constraints</summary>

```sql
CHECK ((role = ANY (ARRAY['user'::text, 'model'::text])))
```

</details>

<details><summary>RLS policies (1)</summary>

- **student_chats_own** · ALL · authenticated
  - USING `(student_id = ( SELECT auth.uid() AS uid))`
  - WITH CHECK `(student_id = ( SELECT auth.uid() AS uid))`

</details>

<details><summary>Indexes (2)</summary>

```sql
CREATE UNIQUE INDEX student_chats_pkey ON public.student_chats USING btree (id)
CREATE INDEX idx_student_chats_student ON public.student_chats USING btree (student_id)
```

</details>

### Table student_memory

- **Kind:** table
- **Row-level security:** enabled, 1 policies
- **Grants:** `authenticated` delete/insert/references/select/trigger/update; `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (student_id)`
- **References:** `users` via `student_id`

| Column | Type | Null | Default |
|---|---|---|---|
| `student_id` | uuid | not null |  |
| `memory` | jsonb |  | `'{}'::jsonb` |
| `updated_at` | timestamp with time zone |  | `now()` |

<details><summary>RLS policies (1)</summary>

- **student_memory_own_read** · SELECT · authenticated
  - USING `(student_id = ( SELECT auth.uid() AS uid))`

</details>

<details><summary>Indexes (1)</summary>

```sql
CREATE UNIQUE INDEX student_memory_pkey ON public.student_memory USING btree (student_id)
```

</details>

## Live Lab & practicals

### Table lab_scenes

- **Kind:** table
- **Row-level security:** enabled, 1 policies
- **Grants:** `authenticated` select; `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `lesson_plans` via `lesson_plan_id`, `schools` via `school_id`, `users` via `teacher_id`
- **Referenced by:** `lab_runs`
- **Written by routes:** `/api/teacher/lab` (select/insert/update/delete)
- **Read by routes:** `/api/teacher/lab/runs`
- **Read directly by pages (browser, RLS):** `/teacher/lab`, `/teacher/syllabus`

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `school_id` | uuid | not null |  |
| `teacher_id` | uuid | not null |  |
| `class` | text | not null |  |
| `subject` | text | not null |  |
| `chapter` | text |  |  |
| `engine` | text | not null |  |
| `title` | text | not null |  |
| `scene` | jsonb | not null |  |
| `lesson_plan_id` | uuid |  |  |
| `created_at` | timestamp with time zone | not null | `now()` |
| `updated_at` | timestamp with time zone | not null | `now()` |

<details><summary>Unique and check constraints</summary>

```sql
CHECK (((chapter IS NULL) OR (char_length(chapter) <= 200)))
CHECK (((char_length(class) >= 1) AND (char_length(class) <= 40)))
CHECK ((engine ~ '^[a-z][a-z-]{1,29}$'::text))
CHECK (((jsonb_typeof(scene) = 'object'::text) AND (pg_column_size(scene) < 8192)))
CHECK (((char_length(subject) >= 1) AND (char_length(subject) <= 60)))
CHECK (((char_length(title) >= 1) AND (char_length(title) <= 140)))
```

</details>

<details><summary>RLS policies (1)</summary>

- **lab_scenes_staff_read** · SELECT · authenticated
  - USING `((( SELECT app.is_staff() AS is_staff) AND (school_id = ( SELECT app.current_school_id() AS current_school_id))) OR ( SELECT app.is_superadmin() AS is_superadmin))`

</details>

<details><summary>Indexes (4)</summary>

```sql
CREATE UNIQUE INDEX lab_scenes_pkey ON public.lab_scenes USING btree (id)
CREATE INDEX lab_scenes_lesson_idx ON public.lab_scenes USING btree (lesson_plan_id) WHERE (lesson_plan_id IS NOT NULL)
CREATE INDEX lab_scenes_school_class_idx ON public.lab_scenes USING btree (school_id, class, subject, updated_at DESC)
CREATE INDEX lab_scenes_teacher_idx ON public.lab_scenes USING btree (teacher_id, updated_at DESC)
```

</details>

### Table lab_runs

- **Kind:** table
- **Row-level security:** enabled, 1 policies
- **Grants:** `authenticated` select; `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `lab_scenes` via `scene_id`, `schools` via `school_id`, `users` via `teacher_id`
- **Written by routes:** `/api/teacher/lab/runs` (select/update/insert)
- **Read by routes:** `/api/teacher/copilot`
- **Read directly by pages (browser, RLS):** `/teacher/lab`

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null |  |
| `school_id` | uuid | not null |  |
| `teacher_id` | uuid | not null |  |
| `class` | text | not null |  |
| `subject` | text | not null |  |
| `chapter` | text |  |  |
| `engine` | text | not null |  |
| `scene_id` | uuid |  |  |
| `scene` | jsonb | not null |  |
| `results` | jsonb | not null | `'[]'::jsonb` |
| `started_at` | timestamp with time zone | not null | `now()` |
| `updated_at` | timestamp with time zone | not null | `now()` |

<details><summary>Unique and check constraints</summary>

```sql
CHECK (((chapter IS NULL) OR (char_length(chapter) <= 200)))
CHECK (((char_length(class) >= 1) AND (char_length(class) <= 40)))
CHECK ((engine ~ '^[a-z][a-z-]{1,29}$'::text))
CHECK (((jsonb_typeof(results) = 'array'::text) AND (pg_column_size(results) < 32768)))
CHECK (((jsonb_typeof(scene) = 'object'::text) AND (pg_column_size(scene) < 8192)))
CHECK (((char_length(subject) >= 1) AND (char_length(subject) <= 60)))
```

</details>

<details><summary>RLS policies (1)</summary>

- **lab_runs_staff_read** · SELECT · authenticated
  - USING `((( SELECT app.is_staff() AS is_staff) AND (school_id = ( SELECT app.current_school_id() AS current_school_id))) OR ( SELECT app.is_superadmin() AS is_superadmin))`

</details>

<details><summary>Indexes (4)</summary>

```sql
CREATE UNIQUE INDEX lab_runs_pkey ON public.lab_runs USING btree (id)
CREATE INDEX lab_runs_scene_idx ON public.lab_runs USING btree (scene_id) WHERE (scene_id IS NOT NULL)
CREATE INDEX lab_runs_school_class_idx ON public.lab_runs USING btree (school_id, class, subject, updated_at DESC)
CREATE INDEX lab_runs_teacher_idx ON public.lab_runs USING btree (teacher_id, updated_at DESC)
```

</details>

### Table practical_assessment

- **Kind:** table
- **Row-level security:** enabled, 1 policies
- **Grants:** `authenticated` select; `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `schools` via `school_id`, `exam_sheets` via `sheet_id`, `users` via `student_id`, `users` via `updated_by`
- **Written by routes:** `/api/teacher/practicals` (upsert/delete)
- **Read directly by pages (browser, RLS):** `/teacher/lab/practicals`

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `school_id` | uuid | not null |  |
| `sheet_id` | uuid | not null |  |
| `class` | text | not null |  |
| `subject` | text | not null |  |
| `student_id` | uuid | not null |  |
| `parts` | jsonb | not null |  |
| `total` | numeric(5,1) | not null |  |
| `updated_by` | uuid |  |  |
| `updated_at` | timestamp with time zone | not null | `now()` |

<details><summary>Unique and check constraints</summary>

```sql
UNIQUE UNIQUE (sheet_id, student_id)
CHECK (((char_length(class) >= 1) AND (char_length(class) <= 40)))
CHECK ((jsonb_typeof(parts) = 'object'::text))
CHECK (((char_length(subject) >= 1) AND (char_length(subject) <= 60)))
CHECK (((total >= (0)::numeric) AND (total <= (100)::numeric)))
```

</details>

<details><summary>RLS policies (1)</summary>

- **practical_assessment_staff_read** · SELECT · authenticated
  - USING `((( SELECT app.is_staff() AS is_staff) AND (school_id = ( SELECT app.current_school_id() AS current_school_id))) OR ( SELECT app.is_superadmin() AS is_superadmin))`

</details>

<details><summary>Indexes (3)</summary>

```sql
CREATE UNIQUE INDEX practical_assessment_pkey ON public.practical_assessment USING btree (id)
CREATE UNIQUE INDEX practical_assessment_sheet_id_student_id_key ON public.practical_assessment USING btree (sheet_id, student_id)
CREATE INDEX practical_assessment_class_idx ON public.practical_assessment USING btree (school_id, class, subject)
```

</details>

### Table practical_progress

- **Kind:** table
- **Row-level security:** enabled, 1 policies
- **Grants:** `authenticated` select; `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `schools` via `school_id`, `users` via `student_id`, `users` via `updated_by`
- **Written by routes:** `/api/teacher/practicals` (select/upsert)
- **Read directly by pages (browser, RLS):** `/teacher/lab/practicals`

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `school_id` | uuid | not null |  |
| `class` | text | not null |  |
| `subject` | text | not null |  |
| `student_id` | uuid | not null |  |
| `practical` | text | not null |  |
| `done_on` | date |  |  |
| `record` | text | not null | `'none'::text` |
| `viva` | smallint |  |  |
| `note` | text |  |  |
| `updated_by` | uuid |  |  |
| `updated_at` | timestamp with time zone | not null | `now()` |

<details><summary>Unique and check constraints</summary>

```sql
UNIQUE UNIQUE (student_id, subject, practical)
CHECK (((char_length(class) >= 1) AND (char_length(class) <= 40)))
CHECK (((note IS NULL) OR (char_length(note) <= 300)))
CHECK ((practical ~ '^[a-z]{1,2}[0-9]{1,2}-[a-z0-9]{2,6}$'::text))
CHECK ((record = ANY (ARRAY['none'::text, 'submitted'::text, 'checked'::text])))
CHECK (((char_length(subject) >= 1) AND (char_length(subject) <= 60)))
CHECK (((viva IS NULL) OR ((viva >= 0) AND (viva <= 5))))
```

</details>

<details><summary>RLS policies (1)</summary>

- **practical_progress_staff_read** · SELECT · authenticated
  - USING `((( SELECT app.is_staff() AS is_staff) AND (school_id = ( SELECT app.current_school_id() AS current_school_id))) OR ( SELECT app.is_superadmin() AS is_superadmin))`

</details>

<details><summary>Indexes (3)</summary>

```sql
CREATE UNIQUE INDEX practical_progress_pkey ON public.practical_progress USING btree (id)
CREATE UNIQUE INDEX practical_progress_student_id_subject_practical_key ON public.practical_progress USING btree (student_id, subject, practical)
CREATE INDEX practical_progress_class_idx ON public.practical_progress USING btree (school_id, class, subject)
```

</details>

## Exams & report cards

### Table exam_schemes

- **Kind:** table
- **Row-level security:** enabled, 0 policies
- **Grants:** `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `users` via `created_by`, `schools` via `school_id`, `users` via `updated_by`
- **Referenced by:** `exam_assessments`, `exam_terms`
- **Written by routes:** `/api/admin/exams` (select/insert/delete/update)
- **Read by routes:** `/api/admin/import`, `/api/admin/import/[id]`, `/api/import/worker`, `/api/ops/schools/[id]/import`, `/api/ops/schools/[id]/import/[jobId]`, `/api/teacher/exams`
- **SQL functions:** `app.guard_exam_scheme_grades()` select

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `school_id` | uuid | not null |  |
| `session` | text | not null |  |
| `name` | text | not null |  |
| `grades` | smallint[] | not null |  |
| `preset` | text |  |  |
| `grading` | jsonb | not null |  |
| `rules` | jsonb | not null | `'{}'::jsonb` |
| `status` | text | not null | `'active'::text` |
| `created_by` | uuid |  |  |
| `updated_by` | uuid |  |  |
| `created_at` | timestamp with time zone | not null | `now()` |
| `updated_at` | timestamp with time zone | not null | `now()` |

<details><summary>Unique and check constraints</summary>

```sql
CHECK (((cardinality(grades) >= 1) AND (cardinality(grades) <= 12) AND (grades <@ ARRAY[(1)::smallint, (2)::smallint, (3)::smallint, (4)::smallint, (5)::smallint, (6)::smallint, (7)::smallint, (8)::smallint, (9)::smallint, (10)::smallint, (11)::smallint, (12)::smallint])))
CHECK ((jsonb_typeof(grading) = 'array'::text))
CHECK (((length(TRIM(BOTH FROM name)) >= 1) AND (length(TRIM(BOTH FROM name)) <= 80)))
CHECK ((preset = ANY (ARRAY['foundational'::text, 'primary'::text, 'middle'::text, 'secondary'::text, 'senior'::text])))
CHECK ((jsonb_typeof(rules) = 'object'::text))
CHECK ((session ~ '^\d{4}-\d{2}$'::text))
CHECK ((status = ANY (ARRAY['active'::text, 'archived'::text])))
```

</details>

<details><summary>Triggers (3)</summary>

```sql
CREATE TRIGGER trg_audit_exam_schemes AFTER INSERT OR DELETE OR UPDATE ON public.exam_schemes FOR EACH ROW EXECUTE FUNCTION app.audit('name,grades,grading,rules,status')
CREATE TRIGGER trg_guard_exam_scheme_grades BEFORE INSERT OR UPDATE ON public.exam_schemes FOR EACH ROW EXECUTE FUNCTION app.guard_exam_scheme_grades()
CREATE TRIGGER trg_touch_exam_schemes BEFORE UPDATE ON public.exam_schemes FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at()
```

</details>

<details><summary>Indexes (2)</summary>

```sql
CREATE UNIQUE INDEX exam_schemes_pkey ON public.exam_schemes USING btree (id)
CREATE INDEX idx_exam_schemes_school ON public.exam_schemes USING btree (school_id, session)
```

</details>

### Table exam_terms

- **Kind:** table
- **Row-level security:** enabled, 0 policies
- **Grants:** `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `exam_schemes` via `scheme_id`, `schools` via `school_id`
- **Referenced by:** `exam_assessments`, `exam_class_terms`, `exam_student_terms`, `report_cards`
- **Written by routes:** `/api/admin/exams` (select/insert/update/delete)
- **Read by routes:** `/api/teacher/exams`
- **SQL functions:** `app.guard_exam_student_terms()` select, `app.guard_report_cards()` select

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `school_id` | uuid | not null |  |
| `scheme_id` | uuid | not null |  |
| `name` | text | not null |  |
| `seq` | smallint | not null |  |
| `starts_on` | date | not null |  |
| `ends_on` | date | not null |  |
| `weight` | numeric(5,2) | not null | `0` |
| `components` | jsonb | not null | `'[]'::jsonb` |
| `subject_weights` | jsonb | not null | `'{}'::jsonb` |
| `created_at` | timestamp with time zone | not null | `now()` |
| `updated_at` | timestamp with time zone | not null | `now()` |

<details><summary>Unique and check constraints</summary>

```sql
UNIQUE UNIQUE (scheme_id, seq)
CHECK ((ends_on >= starts_on))
CHECK ((jsonb_typeof(components) = 'array'::text))
CHECK (((length(TRIM(BOTH FROM name)) >= 1) AND (length(TRIM(BOTH FROM name)) <= 60)))
CHECK (((seq >= 1) AND (seq <= 12)))
CHECK ((jsonb_typeof(subject_weights) = 'object'::text))
CHECK (((weight >= (0)::numeric) AND (weight <= (100)::numeric)))
```

</details>

<details><summary>Triggers (2)</summary>

```sql
CREATE TRIGGER trg_audit_exam_terms AFTER INSERT OR DELETE OR UPDATE ON public.exam_terms FOR EACH ROW EXECUTE FUNCTION app.audit('name,weight,components,subject_weights,starts_on,ends_on')
CREATE TRIGGER trg_touch_exam_terms BEFORE UPDATE ON public.exam_terms FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at()
```

</details>

<details><summary>Indexes (2)</summary>

```sql
CREATE UNIQUE INDEX exam_terms_pkey ON public.exam_terms USING btree (id)
CREATE UNIQUE INDEX exam_terms_scheme_id_seq_key ON public.exam_terms USING btree (scheme_id, seq)
```

</details>

### Table exam_assessments

- **Kind:** table
- **Row-level security:** enabled, 0 policies
- **Grants:** `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `exam_schemes` via `scheme_id`, `schools` via `school_id`, `exam_terms` via `term_id`
- **Referenced by:** `exam_sheets`
- **Written by routes:** `/api/admin/exams` (select/insert/update/delete)
- **Read by routes:** `/api/admin/import`, `/api/admin/import/[id]`, `/api/import/worker`, `/api/ops/schools/[id]/import`, `/api/ops/schools/[id]/import/[jobId]`, `/api/teacher/exams`, `/api/teacher/practicals`

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `school_id` | uuid | not null |  |
| `scheme_id` | uuid | not null |  |
| `term_id` | uuid | not null |  |
| `code` | text | not null |  |
| `name` | text | not null |  |
| `kind` | text | not null | `'written'::text` |
| `max_marks` | numeric(6,2) | not null |  |
| `seq` | smallint | not null | `1` |
| `subjects` | jsonb | not null | `'{}'::jsonb` |
| `held_from` | date |  |  |
| `held_to` | date |  |  |
| `created_at` | timestamp with time zone | not null | `now()` |
| `updated_at` | timestamp with time zone | not null | `now()` |

<details><summary>Unique and check constraints</summary>

```sql
UNIQUE UNIQUE (scheme_id, code)
CHECK ((code ~ '^[A-Z][A-Z0-9]{0,11}$'::text))
CHECK ((kind = ANY (ARRAY['written'::text, 'internal'::text, 'practical'::text, 'project'::text, 'oral'::text])))
CHECK (((max_marks > (0)::numeric) AND (max_marks <= (1000)::numeric)))
CHECK (((length(TRIM(BOTH FROM name)) >= 1) AND (length(TRIM(BOTH FROM name)) <= 80)))
CHECK ((jsonb_typeof(subjects) = 'object'::text))
```

</details>

<details><summary>Triggers (2)</summary>

```sql
CREATE TRIGGER trg_audit_exam_assessments AFTER INSERT OR DELETE OR UPDATE ON public.exam_assessments FOR EACH ROW EXECUTE FUNCTION app.audit('code,name,max_marks,subjects')
CREATE TRIGGER trg_touch_exam_assessments BEFORE UPDATE ON public.exam_assessments FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at()
```

</details>

<details><summary>Indexes (3)</summary>

```sql
CREATE UNIQUE INDEX exam_assessments_pkey ON public.exam_assessments USING btree (id)
CREATE UNIQUE INDEX exam_assessments_scheme_id_code_key ON public.exam_assessments USING btree (scheme_id, code)
CREATE INDEX idx_exam_assessments_term ON public.exam_assessments USING btree (term_id)
```

</details>

### Table exam_sheets

- **Kind:** table
- **Row-level security:** enabled, 0 policies
- **Grants:** `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `exam_assessments` via `assessment_id`, `classes` via `class_id`, `class_subjects` via `class_subject_id`, `users` via `reopened_by`, `users` via `returned_by`, `schools` via `school_id`, `users` via `submitted_by`
- **Referenced by:** `exam_marks`, `practical_assessment`
- **Written by routes:** `/api/admin/exams` (select/update/delete/upsert), `/api/teacher/exams` (select/update)
- **Read by routes:** `/api/admin/import`, `/api/admin/import/[id]`, `/api/import/worker`, `/api/ops/schools/[id]/import`, `/api/ops/schools/[id]/import/[jobId]`, `/api/teacher/practicals`
- **SQL functions:** `app.audit_exam_marks()` select, `app.guard_exam_marks()` select, `import_exam_marks()` select, `import_undo()` select

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `school_id` | uuid | not null |  |
| `assessment_id` | uuid | not null |  |
| `class_subject_id` | uuid | not null |  |
| `class_id` | uuid | not null |  |
| `status` | text | not null | `'open'::text` |
| `max_marks` | numeric(6,2) | not null |  |
| `submitted_by` | uuid |  |  |
| `submitted_at` | timestamp with time zone |  |  |
| `returned_note` | text |  |  |
| `returned_by` | uuid |  |  |
| `returned_at` | timestamp with time zone |  |  |
| `reopened_reason` | text |  |  |
| `reopened_by` | uuid |  |  |
| `reopened_at` | timestamp with time zone |  |  |
| `created_at` | timestamp with time zone | not null | `now()` |
| `updated_at` | timestamp with time zone | not null | `now()` |

<details><summary>Unique and check constraints</summary>

```sql
UNIQUE UNIQUE (assessment_id, class_subject_id)
CHECK ((max_marks > (0)::numeric))
CHECK ((length(reopened_reason) <= 1000))
CHECK ((length(returned_note) <= 1000))
CHECK ((status = ANY (ARRAY['open'::text, 'submitted'::text, 'locked'::text])))
```

</details>

<details><summary>Triggers (2)</summary>

```sql
CREATE TRIGGER trg_audit_exam_sheets AFTER UPDATE ON public.exam_sheets FOR EACH ROW EXECUTE FUNCTION app.audit('status,returned_note,reopened_reason')
CREATE TRIGGER trg_touch_exam_sheets BEFORE UPDATE ON public.exam_sheets FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at()
```

</details>

<details><summary>Indexes (4)</summary>

```sql
CREATE UNIQUE INDEX exam_sheets_assessment_id_class_subject_id_key ON public.exam_sheets USING btree (assessment_id, class_subject_id)
CREATE UNIQUE INDEX exam_sheets_pkey ON public.exam_sheets USING btree (id)
CREATE INDEX idx_exam_sheets_class ON public.exam_sheets USING btree (class_id)
CREATE INDEX idx_exam_sheets_school ON public.exam_sheets USING btree (school_id, status)
```

</details>

### Table exam_marks

- **Kind:** table
- **Row-level security:** enabled, 0 policies
- **Grants:** `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `schools` via `school_id`, `exam_sheets` via `sheet_id`, `users` via `student_id`, `users` via `updated_by`
- **Written by routes:** `/api/teacher/exams` (select/upsert/delete), `/api/teacher/practicals` (upsert/delete)
- **Read by routes:** `/api/admin/exams`
- **SQL functions:** `import_exam_marks()` select/update/insert

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `school_id` | uuid | not null |  |
| `sheet_id` | uuid | not null |  |
| `student_id` | uuid | not null |  |
| `marks` | numeric(6,2) |  |  |
| `code` | text |  |  |
| `questions` | jsonb |  |  |
| `source` | text | not null | `'grid'::text` |
| `source_ref` | uuid |  |  |
| `updated_by` | uuid |  |  |
| `updated_at` | timestamp with time zone | not null | `now()` |
| `import_job_id` | uuid |  |  |

<details><summary>Unique and check constraints</summary>

```sql
UNIQUE UNIQUE (sheet_id, student_id)
CHECK ((NOT ((marks IS NOT NULL) AND (code IS NOT NULL))))
CHECK ((code = ANY (ARRAY['AB'::text, 'ML'::text, 'EX'::text])))
CHECK ((marks >= (0)::numeric))
CHECK (((questions IS NULL) OR (jsonb_typeof(questions) = 'array'::text)))
CHECK ((source = ANY (ARRAY['grid'::text, 'import'::text, 'online'::text, 'script'::text, 'practical'::text])))
```

</details>

<details><summary>Triggers (2)</summary>

```sql
CREATE TRIGGER trg_audit_exam_marks AFTER INSERT OR DELETE OR UPDATE ON public.exam_marks FOR EACH ROW EXECUTE FUNCTION app.audit_exam_marks()
CREATE TRIGGER trg_guard_exam_marks BEFORE INSERT OR DELETE OR UPDATE ON public.exam_marks FOR EACH ROW EXECUTE FUNCTION app.guard_exam_marks()
```

</details>

<details><summary>Indexes (4)</summary>

```sql
CREATE UNIQUE INDEX exam_marks_pkey ON public.exam_marks USING btree (id)
CREATE UNIQUE INDEX exam_marks_sheet_id_student_id_key ON public.exam_marks USING btree (sheet_id, student_id)
CREATE INDEX idx_exam_marks_student ON public.exam_marks USING btree (student_id)
CREATE INDEX exam_marks_import_job ON public.exam_marks USING btree (import_job_id) WHERE (import_job_id IS NOT NULL)
```

</details>

### Table exam_class_terms

- **Kind:** table
- **Row-level security:** enabled, 0 policies
- **Grants:** `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `classes` via `class_id`, `users` via `published_by`, `users` via `reopened_by`, `users` via `reviewed_by`, `schools` via `school_id`, `exam_terms` via `term_id`
- **Written by routes:** `/api/admin/exams` (select/update/insert), `/api/teacher/exams` (select/update/insert)
- **SQL functions:** `app.guard_exam_student_terms()` select

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `school_id` | uuid | not null |  |
| `term_id` | uuid | not null |  |
| `class_id` | uuid | not null |  |
| `status` | text | not null | `'open'::text` |
| `version` | integer | not null | `0` |
| `reviewed_by` | uuid |  |  |
| `reviewed_at` | timestamp with time zone |  |  |
| `published_by` | uuid |  |  |
| `published_at` | timestamp with time zone |  |  |
| `reopen_reason` | text |  |  |
| `reopened_by` | uuid |  |  |
| `reopened_at` | timestamp with time zone |  |  |
| `updated_at` | timestamp with time zone | not null | `now()` |

<details><summary>Unique and check constraints</summary>

```sql
UNIQUE UNIQUE (term_id, class_id)
CHECK ((length(reopen_reason) <= 1000))
CHECK ((status = ANY (ARRAY['open'::text, 'reviewed'::text, 'published'::text])))
CHECK ((version >= 0))
```

</details>

<details><summary>Triggers (2)</summary>

```sql
CREATE TRIGGER trg_audit_exam_class_terms AFTER INSERT OR UPDATE ON public.exam_class_terms FOR EACH ROW EXECUTE FUNCTION app.audit('status,version,reopen_reason')
CREATE TRIGGER trg_touch_exam_class_terms BEFORE UPDATE ON public.exam_class_terms FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at()
```

</details>

<details><summary>Indexes (2)</summary>

```sql
CREATE UNIQUE INDEX exam_class_terms_pkey ON public.exam_class_terms USING btree (id)
CREATE UNIQUE INDEX exam_class_terms_term_id_class_id_key ON public.exam_class_terms USING btree (term_id, class_id)
```

</details>

### Table exam_student_terms

- **Kind:** table
- **Row-level security:** enabled, 0 policies
- **Grants:** `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `schools` via `school_id`, `users` via `student_id`, `exam_terms` via `term_id`, `users` via `updated_by`
- **Written by routes:** `/api/teacher/exams` (select/upsert)
- **Read by routes:** `/api/admin/exams`

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `school_id` | uuid | not null |  |
| `term_id` | uuid | not null |  |
| `student_id` | uuid | not null |  |
| `remark` | text |  |  |
| `coscholastic` | jsonb | not null | `'{}'::jsonb` |
| `updated_by` | uuid |  |  |
| `updated_at` | timestamp with time zone | not null | `now()` |

<details><summary>Unique and check constraints</summary>

```sql
UNIQUE UNIQUE (term_id, student_id)
CHECK ((jsonb_typeof(coscholastic) = 'object'::text))
CHECK ((length(remark) <= 600))
```

</details>

<details><summary>Triggers (2)</summary>

```sql
CREATE TRIGGER trg_guard_exam_student_terms BEFORE INSERT OR DELETE OR UPDATE ON public.exam_student_terms FOR EACH ROW EXECUTE FUNCTION app.guard_exam_student_terms()
CREATE TRIGGER trg_touch_exam_student_terms BEFORE UPDATE ON public.exam_student_terms FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at()
```

</details>

<details><summary>Indexes (2)</summary>

```sql
CREATE UNIQUE INDEX exam_student_terms_pkey ON public.exam_student_terms USING btree (id)
CREATE UNIQUE INDEX exam_student_terms_term_id_student_id_key ON public.exam_student_terms USING btree (term_id, student_id)
```

</details>

### Table report_cards

- **Kind:** table
- **Row-level security:** enabled, 0 policies
- **Grants:** `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `classes` via `class_id`, `users` via `published_by`, `users` via `released_by`, `schools` via `school_id`, `users` via `student_id`, `exam_terms` via `term_id`
- **Written by routes:** `/api/admin/exams` (select/update/insert)
- **Read by routes:** `/api/admin/students/year`, `/api/me/report-cards`, `/api/parent/ask`, `/api/teacher/outcomes`, `/api/timeline`, `/api/whatsapp/simulate`, `/api/whatsapp/webhook`

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `school_id` | uuid | not null |  |
| `student_id` | uuid | not null |  |
| `term_id` | uuid | not null |  |
| `class_id` | uuid |  |  |
| `version` | integer | not null |  |
| `snapshot` | jsonb | not null |  |
| `revised` | boolean | not null | `false` |
| `revision_reason` | text |  |  |
| `published_by` | uuid |  |  |
| `published_at` | timestamp with time zone | not null | `now()` |
| `superseded_at` | timestamp with time zone |  |  |
| `held` | boolean | not null | `false` |
| `hold_reason` | text |  |  |
| `held_at` | timestamp with time zone |  |  |
| `released_by` | uuid |  |  |
| `released_at` | timestamp with time zone |  |  |

<details><summary>Unique and check constraints</summary>

```sql
UNIQUE UNIQUE (student_id, term_id, version)
CHECK ((length(hold_reason) <= 300))
CHECK ((length(revision_reason) <= 1000))
CHECK ((jsonb_typeof(snapshot) = 'object'::text))
CHECK ((version >= 1))
```

</details>

<details><summary>Triggers (1)</summary>

```sql
CREATE TRIGGER trg_guard_report_cards BEFORE DELETE OR UPDATE ON public.report_cards FOR EACH ROW EXECUTE FUNCTION app.guard_report_cards()
```

</details>

<details><summary>Indexes (4)</summary>

```sql
CREATE UNIQUE INDEX report_cards_pkey ON public.report_cards USING btree (id)
CREATE UNIQUE INDEX report_cards_student_id_term_id_version_key ON public.report_cards USING btree (student_id, term_id, version)
CREATE INDEX idx_report_cards_student ON public.report_cards USING btree (student_id) WHERE (superseded_at IS NULL)
CREATE INDEX idx_report_cards_term ON public.report_cards USING btree (term_id, class_id)
```

</details>

### Table report_card_settings

- **Kind:** table
- **Row-level security:** enabled, 0 policies
- **Grants:** `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (school_id)`
- **References:** `schools` via `school_id`, `users` via `updated_by`
- **Written by routes:** `/api/admin/exams` (select/upsert)
- **Read by routes:** `/api/admin/certificates`, `/api/teacher/exams`

| Column | Type | Null | Default |
|---|---|---|---|
| `school_id` | uuid | not null |  |
| `logo` | text |  |  |
| `accent` | text | not null | `'#002147'::text` |
| `affiliation` | text |  |  |
| `address` | text |  |  |
| `signatures` | jsonb | not null | `'["Class teacher", "Principal", "Parent"]'::jsonb` |
| `show` | jsonb | not null | `'{}'::jsonb` |
| `hold_on_dues` | boolean | not null | `false` |
| `hold_min_amount` | numeric(12,2) | not null | `1` |
| `updated_by` | uuid |  |  |
| `updated_at` | timestamp with time zone | not null | `now()` |

<details><summary>Unique and check constraints</summary>

```sql
CHECK ((accent ~ '^#[0-9a-fA-F]{6}$'::text))
CHECK ((length(address) <= 300))
CHECK ((length(affiliation) <= 120))
CHECK ((hold_min_amount >= (0)::numeric))
CHECK (((logo IS NULL) OR ((logo ~ '^data:image/(png|jpeg|webp);base64,'::text) AND (length(logo) <= 400000))))
CHECK ((jsonb_typeof(show) = 'object'::text))
CHECK ((jsonb_typeof(signatures) = 'array'::text))
```

</details>

<details><summary>Triggers (1)</summary>

```sql
CREATE TRIGGER trg_touch_report_card_settings BEFORE UPDATE ON public.report_card_settings FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at()
```

</details>

<details><summary>Indexes (1)</summary>

```sql
CREATE UNIQUE INDEX report_card_settings_pkey ON public.report_card_settings USING btree (school_id)
```

</details>

## Student attendance

### Table attendance

- **Kind:** table
- **Row-level security:** enabled, 1 policies
- **Grants:** `authenticated` select; `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `users` via `marked_by`, `schools` via `school_id`, `users` via `student_id`
- **Written by routes:** `/api/teacher/attendance` (select/upsert), `/api/whatsapp/simulate` (select/upsert; in SQL: select), `/api/whatsapp/webhook` (select/upsert; in SQL: select)
- **Read by routes:** `/api/admin/certificates`, `/api/admin/exams`, `/api/feed`, `/api/ops/overview`, `/api/ops/schools`, `/api/ops/schools/[id]`, `/api/parent/ask`, `/api/parent/desk`, `/api/staff/ask`, `/api/teacher/exams`, `/api/timeline`
- **Read directly by pages (browser, RLS):** `/admin/attendance`, `/admin/feed`, `/teacher/attendance`
- **SQL functions:** `exam_attendance()` select, `import_attendance()` select/update/insert, `ops_school_metrics()` select, `school_attendance_summary()` select, `student_attendance_timeline()` select

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `school_id` | uuid | not null |  |
| `student_id` | uuid | not null |  |
| `class_name` | text | not null |  |
| `day` | date | not null |  |
| `status` | text | not null |  |
| `note` | text |  |  |
| `marked_by` | uuid |  |  |
| `marked_at` | timestamp with time zone | not null | `now()` |
| `updated_at` | timestamp with time zone | not null | `now()` |
| `import_job_id` | uuid |  |  |

<details><summary>Unique and check constraints</summary>

```sql
UNIQUE UNIQUE (student_id, day)
CHECK (((length(class_name) >= 1) AND (length(class_name) <= 40)))
CHECK (((note IS NULL) OR (length(note) <= 300)))
CHECK ((status = ANY (ARRAY['present'::text, 'absent'::text, 'late'::text, 'excused'::text])))
```

</details>

<details><summary>RLS policies (1)</summary>

- **attendance_read** · SELECT · authenticated
  - USING `((student_id = ( SELECT auth.uid() AS uid)) OR app.is_parent_of(student_id) OR ((school_id = ( SELECT app.current_school_id() AS current_school_id)) AND (( SELECT app.is_teacher() AS is_teacher) AND app.teaches_student(student_id))) OR ((school_id = ( SELECT app.current_school_id() AS current_school_id)) AND ( SELECT app.has_perm('attendance.read'::text) AS has_perm)) OR ( SELECT app.is_superadmin() AS is_superadmin))`

</details>

<details><summary>Triggers (2)</summary>

```sql
CREATE TRIGGER trg_audit_attendance AFTER DELETE OR UPDATE ON public.attendance FOR EACH ROW EXECUTE FUNCTION app.audit('status')
CREATE TRIGGER trg_touch_attendance BEFORE UPDATE ON public.attendance FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at()
```

</details>

<details><summary>Indexes (5)</summary>

```sql
CREATE UNIQUE INDEX attendance_pkey ON public.attendance USING btree (id)
CREATE UNIQUE INDEX attendance_student_id_day_key ON public.attendance USING btree (student_id, day)
CREATE INDEX idx_attendance_class_day ON public.attendance USING btree (school_id, class_name, day)
CREATE INDEX idx_attendance_student ON public.attendance USING btree (student_id, day DESC)
CREATE INDEX attendance_import_job ON public.attendance USING btree (import_job_id) WHERE (import_job_id IS NOT NULL)
```

</details>

## Admissions

### Table admission_applicants

- **Kind:** table
- **Row-level security:** enabled, 1 policies
- **Grants:** `authenticated` delete/insert/references/select/trigger/update; `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `users` via `created_by`, `users` via `parent_id`, `schools` via `school_id`, `users` via `student_id`
- **Referenced by:** `account_requests`, `admission_documents`, `admission_events`, `admission_offers`, `students`
- **Written by routes:** `/api/admin/admissions` (insert/select/update; in SQL: select/update), `/api/admin/admissions/offers` (select; in SQL: select/update), `/api/admin/admissions/setup` (in SQL: select/update), `/api/ops/requests` (select/update)
- **Read by routes:** `/api/admin/admissions/application`, `/api/admin/admissions/documents`, `/api/admin/admissions/enrol`, `/api/admin/students`, `/api/admin/students/applicants`, `/api/staff/ask`, `/api/whatsapp/simulate`, `/api/whatsapp/webhook`
- **Read directly by pages (browser, RLS):** `/admin (layout)`
- **SQL functions:** `app.admission_issue()` select/update, `admission_move()` select/update, `admission_offer_cancel()` select, `admission_offer_decide()` select, `admission_offer_propose()` select, `admission_offer_respond()` update, `admission_promote()` select, `app.admission_seats_left()` select, `admission_set_stages()` select, `admission_sweep()` update, `import_admission_applicants()` select/update/insert

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `school_id` | uuid | not null |  |
| `session` | text | not null |  |
| `name` | text | not null |  |
| `grade` | integer | not null |  |
| `date_of_birth` | date |  |  |
| `guardian_name` | text |  |  |
| `guardian_phone` | text |  |  |
| `guardian_email` | text |  |  |
| `previous_school` | text |  |  |
| `source` | text | not null | `'walk_in'::text` |
| `stage` | text | not null | `'enquiry'::text` |
| `furthest_stage` | text | not null | `'enquiry'::text` |
| `assessment_on` | date |  |  |
| `notes` | text |  |  |
| `stage_changed_at` | timestamp with time zone | not null | `now()` |
| `created_by` | uuid |  |  |
| `created_at` | timestamp with time zone | not null | `now()` |
| `updated_at` | timestamp with time zone | not null | `now()` |
| `student_id` | uuid |  |  |
| `parent_id` | uuid |  |  |
| `import_job_id` | uuid |  |  |
| `form` | jsonb | not null | `'{}'::jsonb` |
| `applied_on` | date |  |  |
| `channel` | text | not null | `'office'::text` |

<details><summary>Unique and check constraints</summary>

```sql
CHECK (((guardian_email IS NULL) OR (char_length(guardian_email) <= 160)))
CHECK (((guardian_name IS NULL) OR (char_length(guardian_name) <= 120)))
CHECK (((guardian_phone IS NULL) OR (char_length(guardian_phone) <= 20)))
CHECK (((char_length(name) >= 1) AND (char_length(name) <= 120)))
CHECK (((notes IS NULL) OR (char_length(notes) <= 2000)))
CHECK (((previous_school IS NULL) OR (char_length(previous_school) <= 160)))
CHECK ((session ~ '^\d{4}-\d{2}$'::text))
CHECK ((source = ANY (ARRAY['walk_in'::text, 'website'::text, 'referral'::text, 'sibling'::text, 'event'::text, 'advertisement'::text, 'other'::text])))
CHECK ((stage ~ '^[a-z][a-z0-9_]{1,30}$'::text))
CHECK (((furthest_stage ~ '^[a-z][a-z0-9_]{1,30}$'::text) AND (furthest_stage <> ALL (ARRAY['rejected'::text, 'withdrawn'::text]))))
CHECK (((grade >= '-2'::integer) AND (grade <= 12)))
CHECK (((jsonb_typeof(form) = 'object'::text) AND (pg_column_size(form) <= 32768)))
CHECK ((channel = ANY (ARRAY['office'::text, 'online'::text, 'portal'::text, 'import'::text])))
```

</details>

<details><summary>RLS policies (1)</summary>

- **admission_applicants_read** · SELECT · authenticated
  - USING `((( SELECT app.has_perm('admissions.read'::text) AS has_perm) AND (school_id = ( SELECT app.current_school_id() AS current_school_id))) OR ( SELECT app.is_superadmin() AS is_superadmin))`

</details>

<details><summary>Triggers (3)</summary>

```sql
CREATE TRIGGER trg_audit_admission_applicants AFTER INSERT OR DELETE OR UPDATE ON public.admission_applicants FOR EACH ROW EXECUTE FUNCTION app.audit()
CREATE TRIGGER trg_touch_admission_applicants BEFORE UPDATE ON public.admission_applicants FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at()
CREATE TRIGGER trg_admission_offer_backfill AFTER INSERT OR UPDATE OF stage ON public.admission_applicants FOR EACH ROW EXECUTE FUNCTION app.admission_offer_backfill()
```

</details>

<details><summary>Indexes (4)</summary>

```sql
CREATE UNIQUE INDEX admission_applicants_pkey ON public.admission_applicants USING btree (id)
CREATE INDEX idx_admission_applicants_school ON public.admission_applicants USING btree (school_id, session, stage)
CREATE INDEX admission_applicants_import_job ON public.admission_applicants USING btree (import_job_id) WHERE (import_job_id IS NOT NULL)
CREATE INDEX admission_applicants_seat ON public.admission_applicants USING btree (school_id, session, grade, stage)
```

</details>

### Table admission_events

- **Kind:** table
- **Row-level security:** enabled, 1 policies
- **Grants:** `authenticated` delete/insert/references/select/trigger/update; `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `users` via `actor_id`, `admission_applicants` via `applicant_id`, `schools` via `school_id`
- **Written by routes:** `/api/admin/admissions` (insert; in SQL: insert), `/api/admin/admissions/offers` (in SQL: insert), `/api/admin/admissions/setup` (in SQL: insert), `/api/ops/requests` (insert)
- **Read by routes:** `/api/ops/overview`, `/api/ops/schools`, `/api/ops/schools/[id]`, `/api/staff/ask`, `/api/whatsapp/simulate`, `/api/whatsapp/webhook`
- **Read directly by pages (browser, RLS):** `/admin (layout)`
- **SQL functions:** `app.admission_issue()` insert, `admission_move()` insert, `admission_offer_cancel()` insert, `admission_offer_decide()` insert, `admission_offer_propose()` insert, `admission_offer_respond()` insert, `admission_sweep()` insert, `ops_school_metrics()` select

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `applicant_id` | uuid | not null |  |
| `school_id` | uuid | not null |  |
| `from_stage` | text |  |  |
| `to_stage` | text | not null |  |
| `note` | text |  |  |
| `actor_id` | uuid |  |  |
| `at` | timestamp with time zone | not null | `now()` |
| `offer_status` | text |  |  |

<details><summary>Unique and check constraints</summary>

```sql
CHECK (((note IS NULL) OR (char_length(note) <= 1000)))
CHECK (((offer_status IS NULL) OR (offer_status = ANY (ARRAY['proposed'::text, 'returned'::text, 'waitlisted'::text, 'issued'::text, 'accepted'::text, 'declined'::text, 'lapsed'::text, 'withdrawn'::text, 'enrolled'::text]))))
```

</details>

<details><summary>RLS policies (1)</summary>

- **admission_events_read** · SELECT · authenticated
  - USING `((( SELECT app.has_perm('admissions.read'::text) AS has_perm) AND (school_id = ( SELECT app.current_school_id() AS current_school_id))) OR ( SELECT app.is_superadmin() AS is_superadmin))`

</details>

<details><summary>Indexes (2)</summary>

```sql
CREATE UNIQUE INDEX admission_events_pkey ON public.admission_events USING btree (id)
CREATE INDEX idx_admission_events_applicant ON public.admission_events USING btree (applicant_id, at)
```

</details>

### Table admission_stages

- **Kind:** table
- **Row-level security:** enabled, 1 policies
- **Grants:** `authenticated` select; `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `schools` via `school_id`
- **Written by routes:** `/api/admin/admissions` (select; in SQL: insert/select), `/api/admin/admissions/setup` (in SQL: select/insert/update)
- **Read by routes:** `/api/admin/admissions/offers`, `/api/staff/ask`, `/api/whatsapp/simulate`, `/api/whatsapp/webhook`
- **Read directly by pages (browser, RLS):** `/admin (layout)`
- **SQL functions:** `admission_ensure_stages()` insert/select, `app.admission_issue()` select, `admission_move()` select, `admission_offer_propose()` select, `app.admission_rank()` select, `admission_set_stages()` select/insert/update

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `school_id` | uuid | not null |  |
| `key` | text | not null |  |
| `label` | text | not null |  |
| `position` | integer | not null | `0` |
| `system` | text |  |  |
| `active` | boolean | not null | `true` |
| `respond_days` | integer |  |  |
| `created_at` | timestamp with time zone | not null | `now()` |
| `updated_at` | timestamp with time zone | not null | `now()` |
| `requires` | text[] | not null | `'{}'::text[]` |

<details><summary>Unique and check constraints</summary>

```sql
UNIQUE UNIQUE (school_id, key)
CHECK (((key ~ '^[a-z][a-z0-9_]{1,30}$'::text) AND (key <> ALL (ARRAY['rejected'::text, 'withdrawn'::text, 'reopen'::text]))))
CHECK (((length(TRIM(BOTH FROM label)) >= 1) AND (length(TRIM(BOTH FROM label)) <= 40)))
CHECK (((system IS NULL) OR (system = ANY (ARRAY['offer'::text, 'enrolled'::text]))))
CHECK (((respond_days IS NULL) OR ((respond_days >= 1) AND (respond_days <= 90))))
CHECK (((system IS NULL) OR (key = system)))
CHECK (((system IS NULL) OR active))
CHECK ((requires <@ ARRAY['documents'::text, 'age'::text]))
```

</details>

<details><summary>RLS policies (1)</summary>

- **admission_stages_read** · SELECT · authenticated
  - USING `((( SELECT app.has_perm('admissions.read'::text) AS has_perm) AND (school_id = ( SELECT app.current_school_id() AS current_school_id))) OR ( SELECT app.is_superadmin() AS is_superadmin))`

</details>

<details><summary>Triggers (2)</summary>

```sql
CREATE TRIGGER trg_touch_admission_stages BEFORE UPDATE ON public.admission_stages FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at()
CREATE TRIGGER trg_audit_admission_stages AFTER INSERT OR DELETE OR UPDATE ON public.admission_stages FOR EACH ROW EXECUTE FUNCTION app.audit()
```

</details>

<details><summary>Indexes (3)</summary>

```sql
CREATE UNIQUE INDEX admission_stages_pkey ON public.admission_stages USING btree (id)
CREATE UNIQUE INDEX admission_stages_school_id_key_key ON public.admission_stages USING btree (school_id, key)
CREATE UNIQUE INDEX admission_stages_system ON public.admission_stages USING btree (school_id, system) WHERE (system IS NOT NULL)
```

</details>

### Table admission_seats

- **Kind:** table
- **Row-level security:** enabled, 1 policies
- **Grants:** `authenticated` select; `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `schools` via `school_id`, `users` via `updated_by`
- **Written by routes:** `/api/admin/admissions/setup` (upsert/delete; in SQL: select)
- **Read by routes:** `/api/admin/admissions`, `/api/admin/admissions/offers`, `/api/staff/ask`, `/api/whatsapp/simulate`, `/api/whatsapp/webhook`
- **Read directly by pages (browser, RLS):** `/admin (layout)`
- **SQL functions:** `app.admission_seats_left()` select

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `school_id` | uuid | not null |  |
| `session` | text | not null |  |
| `grade` | integer | not null |  |
| `capacity` | integer | not null |  |
| `updated_by` | uuid |  |  |
| `created_at` | timestamp with time zone | not null | `now()` |
| `updated_at` | timestamp with time zone | not null | `now()` |

<details><summary>Unique and check constraints</summary>

```sql
UNIQUE UNIQUE (school_id, session, grade)
CHECK ((session ~ '^\d{4}-\d{2}$'::text))
CHECK (((capacity >= 0) AND (capacity <= 5000)))
CHECK (((grade >= '-2'::integer) AND (grade <= 12)))
```

</details>

<details><summary>RLS policies (1)</summary>

- **admission_seats_read** · SELECT · authenticated
  - USING `((( SELECT app.has_perm('admissions.read'::text) AS has_perm) AND (school_id = ( SELECT app.current_school_id() AS current_school_id))) OR ( SELECT app.is_superadmin() AS is_superadmin))`

</details>

<details><summary>Triggers (2)</summary>

```sql
CREATE TRIGGER trg_touch_admission_seats BEFORE UPDATE ON public.admission_seats FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at()
CREATE TRIGGER trg_audit_admission_seats AFTER INSERT OR DELETE OR UPDATE ON public.admission_seats FOR EACH ROW EXECUTE FUNCTION app.audit()
```

</details>

<details><summary>Indexes (2)</summary>

```sql
CREATE UNIQUE INDEX admission_seats_pkey ON public.admission_seats USING btree (id)
CREATE UNIQUE INDEX admission_seats_school_id_session_grade_key ON public.admission_seats USING btree (school_id, session, grade)
```

</details>

### Table admission_offers

- **Kind:** table
- **Row-level security:** enabled, 1 policies
- **Grants:** `authenticated` select; `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `schools` via `school_id`, `admission_applicants` via `applicant_id`, `users` via `proposed_by`, `users` via `decided_by`
- **Written by routes:** `/api/admin/admissions` (select; in SQL: select/update), `/api/admin/admissions/offers` (in SQL: select/insert/update), `/api/admin/admissions/setup` (in SQL: select/update), `/api/ops/requests` (select/update)
- **Read by routes:** `/api/admin/admissions/enrol`, `/api/staff/ask`, `/api/whatsapp/simulate`, `/api/whatsapp/webhook`
- **Read directly by pages (browser, RLS):** `/admin (layout)`
- **SQL functions:** `app.admission_close_offer()` select/update, `app.admission_issue()` select/update, `admission_move()` select, `app.admission_offer_backfill()` select/insert, `admission_offer_cancel()` select/update, `admission_offer_decide()` select/update, `admission_offer_propose()` select/insert, `admission_offer_respond()` select/update, `admission_promote()` select, `admission_sweep()` select

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `school_id` | uuid | not null |  |
| `applicant_id` | uuid | not null |  |
| `session` | text | not null |  |
| `grade` | integer | not null |  |
| `status` | text | not null | `'proposed'::text` |
| `proposed_by` | uuid |  |  |
| `proposed_at` | timestamp with time zone | not null | `now()` |
| `proposal_note` | text |  |  |
| `decided_by` | uuid |  |  |
| `decided_at` | timestamp with time zone |  |  |
| `decision_note` | text |  |  |
| `waitlisted_at` | timestamp with time zone |  |  |
| `issued_at` | timestamp with time zone |  |  |
| `respond_by` | date |  |  |
| `responded_at` | timestamp with time zone |  |  |
| `response_note` | text |  |  |
| `closed_at` | timestamp with time zone |  |  |
| `created_at` | timestamp with time zone | not null | `now()` |
| `updated_at` | timestamp with time zone | not null | `now()` |

<details><summary>Unique and check constraints</summary>

```sql
CHECK ((session ~ '^\d{4}-\d{2}$'::text))
CHECK ((status = ANY (ARRAY['proposed'::text, 'returned'::text, 'waitlisted'::text, 'issued'::text, 'accepted'::text, 'declined'::text, 'lapsed'::text, 'withdrawn'::text, 'enrolled'::text])))
CHECK (((proposal_note IS NULL) OR (length(proposal_note) <= 1000)))
CHECK (((decision_note IS NULL) OR (length(decision_note) <= 1000)))
CHECK (((response_note IS NULL) OR (length(response_note) <= 1000)))
CHECK (((decided_by IS NULL) OR (proposed_by IS NULL) OR (decided_by <> proposed_by)))
CHECK (((grade >= '-2'::integer) AND (grade <= 12)))
```

</details>

<details><summary>RLS policies (1)</summary>

- **admission_offers_read** · SELECT · authenticated
  - USING `((( SELECT app.has_perm('admissions.read'::text) AS has_perm) AND (school_id = ( SELECT app.current_school_id() AS current_school_id))) OR ( SELECT app.is_superadmin() AS is_superadmin))`

</details>

<details><summary>Triggers (2)</summary>

```sql
CREATE TRIGGER trg_touch_admission_offers BEFORE UPDATE ON public.admission_offers FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at()
CREATE TRIGGER trg_audit_admission_offers AFTER INSERT OR DELETE OR UPDATE ON public.admission_offers FOR EACH ROW EXECUTE FUNCTION app.audit()
```

</details>

<details><summary>Indexes (4)</summary>

```sql
CREATE UNIQUE INDEX admission_offers_pkey ON public.admission_offers USING btree (id)
CREATE UNIQUE INDEX admission_offers_live ON public.admission_offers USING btree (applicant_id) WHERE (status = ANY (ARRAY['proposed'::text, 'waitlisted'::text, 'issued'::text, 'accepted'::text]))
CREATE INDEX admission_offers_queue ON public.admission_offers USING btree (school_id, session, grade, status, waitlisted_at)
CREATE INDEX admission_offers_lapse ON public.admission_offers USING btree (respond_by) WHERE (status = 'issued'::text)
```

</details>

### Table admission_documents

- **Kind:** table
- **Row-level security:** enabled, 0 policies
- **Grants:** `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `schools` via `school_id`, `admission_applicants` via `applicant_id`, `users` via `uploaded_by`, `users` via `verified_by`, `student_documents` via `moved_to`
- **Written by routes:** `/api/admin/admissions/documents` (insert/select/update/delete), `/api/admin/students` (select/update)
- **Read by routes:** `/api/admin/admissions`, `/api/admin/admissions/application`, `/api/admin/admissions/offers`, `/api/admin/students/applicants`

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `school_id` | uuid | not null |  |
| `applicant_id` | uuid | not null |  |
| `kind` | text | not null |  |
| `title` | text | not null |  |
| `document_no` | text |  |  |
| `issued_on` | date |  |  |
| `valid_until` | date |  |  |
| `storage_path` | text | not null |  |
| `file_name` | text | not null |  |
| `size_bytes` | bigint |  |  |
| `inline_type` | text |  |  |
| `status` | text | not null | `'awaiting'::text` |
| `source` | text | not null |  |
| `uploaded_by` | uuid |  |  |
| `verified_by` | uuid |  |  |
| `verified_at` | timestamp with time zone |  |  |
| `reject_note` | text |  |  |
| `moved_to` | uuid |  |  |
| `moved_at` | timestamp with time zone |  |  |
| `created_at` | timestamp with time zone | not null | `now()` |
| `updated_at` | timestamp with time zone | not null | `now()` |

<details><summary>Unique and check constraints</summary>

```sql
UNIQUE UNIQUE (storage_path)
CHECK ((kind ~ '^[a-z_]{2,40}$'::text))
CHECK (((length(TRIM(BOTH FROM title)) >= 1) AND (length(TRIM(BOTH FROM title)) <= 120)))
CHECK (((document_no IS NULL) OR (length(document_no) <= 60)))
CHECK (((valid_until IS NULL) OR (issued_on IS NULL) OR (valid_until >= issued_on)))
CHECK ((length(storage_path) <= 400))
CHECK (((length(file_name) >= 1) AND (length(file_name) <= 200)))
CHECK (((size_bytes IS NULL) OR ((size_bytes >= 0) AND (size_bytes <= 26214400))))
CHECK (((inline_type IS NULL) OR (inline_type = ANY (ARRAY['application/pdf'::text, 'image/jpeg'::text, 'image/png'::text, 'image/webp'::text, 'image/gif'::text, 'none'::text]))))
CHECK ((status = ANY (ARRAY['awaiting'::text, 'verified'::text, 'rejected'::text])))
CHECK ((source = ANY (ARRAY['office'::text, 'family'::text])))
CHECK (((reject_note IS NULL) OR (length(reject_note) <= 300)))
```

</details>

<details><summary>Triggers (2)</summary>

```sql
CREATE TRIGGER trg_touch_admission_documents BEFORE UPDATE ON public.admission_documents FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at()
CREATE TRIGGER trg_audit_admission_documents AFTER INSERT OR DELETE OR UPDATE ON public.admission_documents FOR EACH ROW EXECUTE FUNCTION app.audit()
```

</details>

<details><summary>Indexes (3)</summary>

```sql
CREATE UNIQUE INDEX admission_documents_pkey ON public.admission_documents USING btree (id)
CREATE UNIQUE INDEX admission_documents_storage_path_key ON public.admission_documents USING btree (storage_path)
CREATE INDEX admission_documents_applicant ON public.admission_documents USING btree (applicant_id)
```

</details>

## Fees

### Table fee_structures

- **Kind:** table
- **Row-level security:** enabled, 1 policies
- **Grants:** `authenticated` delete/insert/references/select/trigger/update; `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `schools` via `school_id`, `users` via `updated_by`
- **Written by routes:** `/api/admin/fees` (upsert/select; in SQL: select)
- **Read by routes:** `/api/ops/overview`, `/api/ops/requests`, `/api/ops/schools`, `/api/ops/schools/[id]`, `/api/staff/ask`, `/api/whatsapp/simulate`, `/api/whatsapp/webhook`
- **Read directly by pages (browser, RLS):** `/admin (layout)`
- **SQL functions:** `admin_invoice_student()` select, `admin_raise_invoices()` select, `import_fee_structures()` select/update/insert, `ops_school_metrics()` select

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `school_id` | uuid | not null |  |
| `session` | text | not null |  |
| `grade` | integer | not null |  |
| `annual_fee` | numeric(12,2) | not null |  |
| `schedule` | jsonb | not null | `'[]'::jsonb` |
| `note` | text |  |  |
| `updated_by` | uuid |  |  |
| `created_at` | timestamp with time zone | not null | `now()` |
| `updated_at` | timestamp with time zone | not null | `now()` |
| `import_job_id` | uuid |  |  |

<details><summary>Unique and check constraints</summary>

```sql
UNIQUE UNIQUE (school_id, session, grade)
CHECK ((annual_fee >= (0)::numeric))
CHECK (((grade >= 1) AND (grade <= 12)))
CHECK (((note IS NULL) OR (char_length(note) <= 500)))
CHECK ((jsonb_typeof(schedule) = 'array'::text))
CHECK ((session ~ '^\d{4}-\d{2}$'::text))
```

</details>

<details><summary>RLS policies (1)</summary>

- **fee_structures_read** · SELECT · authenticated
  - USING `((( SELECT app.has_perm('fees.read'::text) AS has_perm) AND (school_id = ( SELECT app.current_school_id() AS current_school_id))) OR ((( SELECT app.user_role() AS user_role) = 'parent'::text) AND (school_id = ( SELECT app.current_school_id() AS current_school_id))) OR ( SELECT app.is_superadmin() AS is_superadmin))`

</details>

<details><summary>Triggers (2)</summary>

```sql
CREATE TRIGGER trg_audit_fee_structures AFTER INSERT OR DELETE OR UPDATE ON public.fee_structures FOR EACH ROW EXECUTE FUNCTION app.audit()
CREATE TRIGGER trg_touch_fee_structures BEFORE UPDATE ON public.fee_structures FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at()
```

</details>

<details><summary>Indexes (3)</summary>

```sql
CREATE UNIQUE INDEX fee_structures_pkey ON public.fee_structures USING btree (id)
CREATE UNIQUE INDEX fee_structures_school_id_session_grade_key ON public.fee_structures USING btree (school_id, session, grade)
CREATE INDEX fee_structures_import_job ON public.fee_structures USING btree (import_job_id) WHERE (import_job_id IS NOT NULL)
```

</details>

### Table fee_invoices

- **Kind:** table
- **Row-level security:** enabled, 1 policies
- **Grants:** `authenticated` delete/insert/references/select/trigger/update; `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `users` via `created_by`, `schools` via `school_id`, `users` via `student_id`
- **Referenced by:** `fee_concession_requests`, `fee_payments`
- **Written by routes:** `/api/admin/fees` (select/update; in SQL: select/insert/update), `/api/ops/requests` (in SQL: select/insert)
- **Read by routes:** `/api/admin/certificates`, `/api/admin/exams`, `/api/ops/overview`, `/api/ops/schools`, `/api/ops/schools/[id]`, `/api/ops/schools/[id]/people/[userId]`, `/api/parent/ask`, `/api/parent/desk`, `/api/staff/ask`, `/api/timeline`, `/api/whatsapp/simulate`, `/api/whatsapp/webhook`
- **Read directly by pages (browser, RLS):** `/admin (layout)`
- **SQL functions:** `admin_decide_concession()` select/update, `admin_invoice_student()` select/insert, `admin_raise_invoices()` select/insert, `admin_record_payment()` select, `exam_fee_dues()` select, `import_fee_invoices()` select/update/insert, `import_fee_payments()` select, `ops_delete_account()` select, `ops_delete_school()` select, `ops_school_metrics()` select

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `school_id` | uuid | not null |  |
| `student_id` | uuid | not null |  |
| `session` | text | not null |  |
| `instalment_no` | integer | not null |  |
| `label` | text | not null |  |
| `invoice_no` | text | not null |  |
| `due_on` | date | not null |  |
| `amount` | numeric(12,2) | not null |  |
| `concession` | numeric(12,2) | not null | `0` |
| `concession_reason` | text |  |  |
| `voided_at` | timestamp with time zone |  |  |
| `void_reason` | text |  |  |
| `created_by` | uuid |  |  |
| `created_at` | timestamp with time zone | not null | `now()` |
| `updated_at` | timestamp with time zone | not null | `now()` |
| `import_job_id` | uuid |  |  |

<details><summary>Unique and check constraints</summary>

```sql
UNIQUE UNIQUE (school_id, invoice_no)
UNIQUE UNIQUE (student_id, session, instalment_no)
CHECK ((amount >= (0)::numeric))
CHECK ((concession <= amount))
CHECK (((concession = (0)::numeric) OR (concession_reason IS NOT NULL)))
CHECK (((voided_at IS NULL) OR (void_reason IS NOT NULL)))
CHECK ((concession >= (0)::numeric))
CHECK (((instalment_no >= 1) AND (instalment_no <= 12)))
```

</details>

<details><summary>RLS policies (1)</summary>

- **fee_invoices_read** · SELECT · authenticated
  - USING `((( SELECT app.has_perm('fees.read'::text) AS has_perm) AND (school_id = ( SELECT app.current_school_id() AS current_school_id))) OR app.is_parent_of(student_id) OR ( SELECT app.is_superadmin() AS is_superadmin))`

</details>

<details><summary>Triggers (2)</summary>

```sql
CREATE TRIGGER trg_audit_fee_invoices AFTER INSERT OR DELETE OR UPDATE ON public.fee_invoices FOR EACH ROW EXECUTE FUNCTION app.audit()
CREATE TRIGGER trg_touch_fee_invoices BEFORE UPDATE ON public.fee_invoices FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at()
```

</details>

<details><summary>Indexes (5)</summary>

```sql
CREATE UNIQUE INDEX fee_invoices_pkey ON public.fee_invoices USING btree (id)
CREATE UNIQUE INDEX fee_invoices_school_id_invoice_no_key ON public.fee_invoices USING btree (school_id, invoice_no)
CREATE UNIQUE INDEX fee_invoices_student_id_session_instalment_no_key ON public.fee_invoices USING btree (student_id, session, instalment_no)
CREATE INDEX idx_fee_invoices_school ON public.fee_invoices USING btree (school_id, session, due_on)
CREATE INDEX fee_invoices_import_job ON public.fee_invoices USING btree (import_job_id) WHERE (import_job_id IS NOT NULL)
```

</details>

### Table fee_payments

- **Kind:** table
- **Row-level security:** enabled, 1 policies
- **Grants:** `authenticated` delete/insert/references/select/trigger/update; `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `fee_invoices` via `invoice_id`, `users` via `recorded_by`, `schools` via `school_id`, `users` via `student_id`, `users` via `voided_by`
- **Written by routes:** `/api/admin/fees` (update/select; in SQL: select/insert), `/api/admin/import` (in SQL: select/update), `/api/admin/import/[id]` (in SQL: select/update), `/api/import/worker` (in SQL: select/update), `/api/ops/schools/[id]/import` (in SQL: select/update), `/api/ops/schools/[id]/import/[jobId]` (in SQL: select/update)
- **Read by routes:** `/api/admin/certificates`, `/api/admin/exams`, `/api/ops/overview`, `/api/ops/schools`, `/api/ops/schools/[id]`, `/api/ops/schools/[id]/people/[userId]`, `/api/parent/ask`, `/api/parent/desk`, `/api/staff/ask`, `/api/timeline`, `/api/whatsapp/simulate`, `/api/whatsapp/webhook`
- **Read directly by pages (browser, RLS):** `/admin (layout)`
- **SQL functions:** `admin_close_day()` select, `admin_decide_concession()` select, `admin_record_payment()` select/insert, `exam_fee_dues()` select, `import_fee_invoices()` select, `import_fee_payments()` select/insert, `import_undo()` select/update, `ops_delete_account()` select, `ops_delete_school()` select, `ops_school_metrics()` select

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `school_id` | uuid | not null |  |
| `invoice_id` | uuid | not null |  |
| `student_id` | uuid | not null |  |
| `amount` | numeric(12,2) | not null |  |
| `mode` | text | not null |  |
| `reference` | text |  |  |
| `paid_on` | date | not null |  |
| `receipt_no` | text | not null |  |
| `recorded_by` | uuid |  |  |
| `recorded_at` | timestamp with time zone | not null | `now()` |
| `voided_at` | timestamp with time zone |  |  |
| `void_reason` | text |  |  |
| `voided_by` | uuid |  |  |
| `import_job_id` | uuid |  |  |

<details><summary>Unique and check constraints</summary>

```sql
UNIQUE UNIQUE (school_id, receipt_no)
CHECK ((amount > (0)::numeric))
CHECK (((voided_at IS NULL) OR (void_reason IS NOT NULL)))
CHECK ((mode = ANY (ARRAY['upi'::text, 'bank_transfer'::text, 'card'::text, 'cheque'::text, 'cash'::text, 'dd'::text])))
CHECK (((reference IS NULL) OR (char_length(reference) <= 120)))
```

</details>

<details><summary>RLS policies (1)</summary>

- **fee_payments_read** · SELECT · authenticated
  - USING `((( SELECT app.has_perm('fees.read'::text) AS has_perm) AND (school_id = ( SELECT app.current_school_id() AS current_school_id))) OR app.is_parent_of(student_id) OR ( SELECT app.is_superadmin() AS is_superadmin))`

</details>

<details><summary>Triggers (2)</summary>

```sql
CREATE TRIGGER trg_audit_fee_payments AFTER INSERT OR DELETE OR UPDATE ON public.fee_payments FOR EACH ROW EXECUTE FUNCTION app.audit()
CREATE TRIGGER trg_guard_fee_payment BEFORE DELETE OR UPDATE ON public.fee_payments FOR EACH ROW EXECUTE FUNCTION app.guard_fee_payment()
```

</details>

<details><summary>Indexes (5)</summary>

```sql
CREATE UNIQUE INDEX fee_payments_pkey ON public.fee_payments USING btree (id)
CREATE UNIQUE INDEX fee_payments_school_id_receipt_no_key ON public.fee_payments USING btree (school_id, receipt_no)
CREATE INDEX idx_fee_payments_invoice ON public.fee_payments USING btree (invoice_id)
CREATE INDEX idx_fee_payments_school ON public.fee_payments USING btree (school_id, paid_on DESC)
CREATE INDEX fee_payments_import_job ON public.fee_payments USING btree (import_job_id) WHERE (import_job_id IS NOT NULL)
```

</details>

### Table fee_reminders

- **Kind:** table
- **Row-level security:** enabled, 1 policies
- **Grants:** `authenticated` delete/insert/references/select/trigger/update; `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `schools` via `school_id`, `users` via `sent_by`, `users` via `student_id`
- **Written by routes:** `/api/admin/fees` (select/insert)
- **Read by routes:** `/api/ops/delivery`, `/api/staff/ask`, `/api/whatsapp/simulate`, `/api/whatsapp/webhook`
- **Read directly by pages (browser, RLS):** `/admin (layout)`

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `school_id` | uuid | not null |  |
| `student_id` | uuid | not null |  |
| `invoice_ids` | uuid[] | not null | `'{}'::uuid[]` |
| `outstanding` | numeric(12,2) | not null |  |
| `tone` | text | not null |  |
| `channel` | text | not null | `'in_app'::text` |
| `recipients` | integer | not null | `0` |
| `sent_by` | uuid |  |  |
| `sent_at` | timestamp with time zone | not null | `now()` |

<details><summary>Unique and check constraints</summary>

```sql
CHECK ((channel = ANY (ARRAY['in_app'::text, 'whatsapp'::text, 'email'::text, 'sms'::text])))
CHECK ((tone = ANY (ARRAY['gentle'::text, 'firm'::text, 'final'::text])))
```

</details>

<details><summary>RLS policies (1)</summary>

- **fee_reminders_read** · SELECT · authenticated
  - USING `((( SELECT app.has_perm('fees.read'::text) AS has_perm) AND (school_id = ( SELECT app.current_school_id() AS current_school_id))) OR app.is_parent_of(student_id) OR ( SELECT app.is_superadmin() AS is_superadmin))`

</details>

<details><summary>Triggers (1)</summary>

```sql
CREATE TRIGGER trg_audit_fee_reminders AFTER INSERT OR DELETE OR UPDATE ON public.fee_reminders FOR EACH ROW EXECUTE FUNCTION app.audit()
```

</details>

<details><summary>Indexes (2)</summary>

```sql
CREATE UNIQUE INDEX fee_reminders_pkey ON public.fee_reminders USING btree (id)
CREATE INDEX idx_fee_reminders_student ON public.fee_reminders USING btree (student_id, sent_at DESC)
```

</details>

### Table fee_concession_requests

- **Kind:** table
- **Row-level security:** enabled, 1 policies
- **Grants:** `authenticated` delete/insert/references/select/trigger/update; `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `users` via `decided_by`, `fee_invoices` via `invoice_id`, `users` via `requested_by`, `schools` via `school_id`, `users` via `student_id`
- **Written by routes:** `/api/admin/fees` (insert/select; in SQL: select/update)
- **Read by routes:** `/api/admin/import`, `/api/admin/import/[id]`, `/api/import/worker`, `/api/ops/schools/[id]/import`, `/api/ops/schools/[id]/import/[jobId]`, `/api/staff/ask`, `/api/whatsapp/simulate`, `/api/whatsapp/webhook`
- **Read directly by pages (browser, RLS):** `/admin (layout)`
- **SQL functions:** `admin_decide_concession()` select/update, `import_undo()` select

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `school_id` | uuid | not null |  |
| `invoice_id` | uuid | not null |  |
| `student_id` | uuid | not null |  |
| `amount` | numeric(12,2) | not null |  |
| `reason` | text | not null |  |
| `status` | text | not null | `'pending'::text` |
| `requested_by` | uuid |  |  |
| `requested_at` | timestamp with time zone | not null | `now()` |
| `decided_by` | uuid |  |  |
| `decided_at` | timestamp with time zone |  |  |
| `decision_note` | text |  |  |
| `self_approved` | boolean | not null | `false` |

<details><summary>Unique and check constraints</summary>

```sql
CHECK ((amount >= (0)::numeric))
CHECK (((status <> 'rejected'::text) OR (decision_note IS NOT NULL)))
CHECK (((decision_note IS NULL) OR (char_length(decision_note) <= 300)))
CHECK (((char_length(reason) >= 1) AND (char_length(reason) <= 300)))
CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'withdrawn'::text])))
```

</details>

<details><summary>RLS policies (1)</summary>

- **fee_concession_requests_read** · SELECT · authenticated
  - USING `((( SELECT app.has_perm('fees.read'::text) AS has_perm) AND (school_id = ( SELECT app.current_school_id() AS current_school_id))) OR ( SELECT app.is_superadmin() AS is_superadmin))`

</details>

<details><summary>Triggers (1)</summary>

```sql
CREATE TRIGGER trg_audit_fee_concession_requests AFTER INSERT OR DELETE OR UPDATE ON public.fee_concession_requests FOR EACH ROW EXECUTE FUNCTION app.audit()
```

</details>

<details><summary>Indexes (3)</summary>

```sql
CREATE UNIQUE INDEX fee_concession_requests_pkey ON public.fee_concession_requests USING btree (id)
CREATE INDEX idx_concession_school ON public.fee_concession_requests USING btree (school_id, status)
CREATE UNIQUE INDEX uq_concession_pending ON public.fee_concession_requests USING btree (invoice_id) WHERE (status = 'pending'::text)
```

</details>

### Table fee_day_closes

- **Kind:** table
- **Row-level security:** enabled, 1 policies
- **Grants:** `authenticated` delete/insert/references/select/trigger/update; `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `users` via `closed_by`, `users` via `reopened_by`, `schools` via `school_id`
- **Written by routes:** `/api/admin/fees` (update/select; in SQL: select/insert)
- **Read by routes:** `/api/admin/import`, `/api/admin/import/[id]`, `/api/import/worker`, `/api/ops/schools/[id]/import`, `/api/ops/schools/[id]/import/[jobId]`, `/api/staff/ask`, `/api/whatsapp/simulate`, `/api/whatsapp/webhook`
- **Read directly by pages (browser, RLS):** `/admin (layout)`
- **SQL functions:** `admin_close_day()` insert, `app.day_closed()` select

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `school_id` | uuid | not null |  |
| `day` | date | not null |  |
| `status` | text | not null | `'closed'::text` |
| `totals` | jsonb | not null | `'{}'::jsonb` |
| `receipts` | integer | not null | `0` |
| `cash_expected` | numeric(12,2) | not null | `0` |
| `cash_counted` | numeric(12,2) | not null | `0` |
| `variance` | numeric(12,2) |  | `(cash_counted - cash_expected)` |
| `note` | text |  |  |
| `closed_by` | uuid |  |  |
| `closed_at` | timestamp with time zone | not null | `now()` |
| `reopened_by` | uuid |  |  |
| `reopened_at` | timestamp with time zone |  |  |
| `reopen_reason` | text |  |  |

<details><summary>Unique and check constraints</summary>

```sql
UNIQUE UNIQUE (school_id, day)
CHECK (((status = 'closed'::text) OR ((reopened_at IS NOT NULL) AND (reopen_reason IS NOT NULL))))
CHECK (((variance = (0)::numeric) OR (note IS NOT NULL) OR (status = 'reopened'::text)))
CHECK (((note IS NULL) OR (char_length(note) <= 500)))
CHECK ((status = ANY (ARRAY['closed'::text, 'reopened'::text])))
```

</details>

<details><summary>RLS policies (1)</summary>

- **fee_day_closes_read** · SELECT · authenticated
  - USING `((( SELECT app.has_perm('fees.read'::text) AS has_perm) AND (school_id = ( SELECT app.current_school_id() AS current_school_id))) OR ( SELECT app.is_superadmin() AS is_superadmin))`

</details>

<details><summary>Triggers (1)</summary>

```sql
CREATE TRIGGER trg_audit_fee_day_closes AFTER INSERT OR DELETE OR UPDATE ON public.fee_day_closes FOR EACH ROW EXECUTE FUNCTION app.audit()
```

</details>

<details><summary>Indexes (2)</summary>

```sql
CREATE UNIQUE INDEX fee_day_closes_pkey ON public.fee_day_closes USING btree (id)
CREATE UNIQUE INDEX fee_day_closes_school_id_day_key ON public.fee_day_closes USING btree (school_id, day)
```

</details>

## Scheduling & timetable

### Table sched_wings

- **Kind:** table
- **Row-level security:** enabled, 1 policies
- **Grants:** `authenticated` select; `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `schools` via `school_id`
- **Referenced by:** `bell_schedules`, `staff_members`
- **Written by routes:** `/api/admin/people` (select; maybe: upsert), `/api/admin/schedule/setup` (select/update/insert; maybe: delete)
- **Read by routes:** `/api/admin/payroll/run`, `/api/admin/schedule/calendar`, `/api/admin/schedule/cover`, `/api/admin/schedule/duties`, `/api/admin/schedule/solver`, `/api/admin/schedule/staff`, `/api/admin/schedule/timetable`, `/api/feed`, `/api/parent/ask`, `/api/parent/desk`, `/api/whatsapp/simulate`, `/api/whatsapp/webhook`
- **Read directly by pages (browser, RLS):** `/admin/attendance`, `/admin/schedule`, `/teacher/attendance`, `/teacher/schedule`

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `school_id` | uuid | not null |  |
| `name` | text | not null |  |
| `grade_from` | smallint | not null |  |
| `grade_to` | smallint | not null |  |
| `created_at` | timestamp with time zone | not null | `now()` |

<details><summary>Unique and check constraints</summary>

```sql
UNIQUE UNIQUE (school_id, name)
CHECK ((grade_to >= grade_from))
CHECK (((grade_from >= 0) AND (grade_from <= 12)))
CHECK (((grade_to >= 0) AND (grade_to <= 12)))
CHECK (((length(TRIM(BOTH FROM name)) >= 1) AND (length(TRIM(BOTH FROM name)) <= 60)))
```

</details>

<details><summary>RLS policies (1)</summary>

- **sched_wings_read** · SELECT · authenticated
  - USING `((( SELECT app.is_staff() AS is_staff) AND (school_id = ( SELECT app.current_school_id() AS current_school_id))) OR ( SELECT app.is_superadmin() AS is_superadmin))`

</details>

<details><summary>Indexes (2)</summary>

```sql
CREATE UNIQUE INDEX sched_wings_pkey ON public.sched_wings USING btree (id)
CREATE UNIQUE INDEX sched_wings_school_id_name_key ON public.sched_wings USING btree (school_id, name)
```

</details>

### Table bell_schedules

- **Kind:** table
- **Row-level security:** enabled, 1 policies
- **Grants:** `authenticated` select; `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `schools` via `school_id`, `sched_wings` via `wing_id`
- **Referenced by:** `academic_events`, `bell_periods`
- **Written by routes:** `/api/admin/schedule/setup` (select/update/insert; maybe: delete)
- **Read by routes:** `/api/admin/attendance`, `/api/admin/payroll/run`, `/api/admin/schedule/calendar`, `/api/admin/schedule/cover`, `/api/admin/schedule/duties`, `/api/admin/schedule/solver`, `/api/admin/schedule/timetable`, `/api/feed`, `/api/ops/delivery`, `/api/parent/ask`, `/api/parent/desk`, `/api/whatsapp/simulate`, `/api/whatsapp/webhook`
- **Read directly by pages (browser, RLS):** `/admin/attendance`, `/admin/schedule`, `/teacher/attendance`, `/teacher/schedule`

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `school_id` | uuid | not null |  |
| `wing_id` | uuid |  |  |
| `name` | text | not null |  |
| `kind` | text | not null | `'regular'::text` |
| `weekdays` | smallint[] | not null | `'{}'::smallint[]` |
| `created_at` | timestamp with time zone | not null | `now()` |
| `updated_at` | timestamp with time zone | not null | `now()` |

<details><summary>Unique and check constraints</summary>

```sql
CHECK (((kind = 'regular'::text) OR (weekdays = '{}'::smallint[])))
CHECK ((kind = ANY (ARRAY['regular'::text, 'variant'::text])))
CHECK (((length(TRIM(BOTH FROM name)) >= 1) AND (length(TRIM(BOTH FROM name)) <= 80)))
CHECK ((weekdays <@ ARRAY[(1)::smallint, (2)::smallint, (3)::smallint, (4)::smallint, (5)::smallint, (6)::smallint, (7)::smallint]))
```

</details>

<details><summary>RLS policies (1)</summary>

- **bell_schedules_read** · SELECT · authenticated
  - USING `((( SELECT app.is_staff() AS is_staff) AND (school_id = ( SELECT app.current_school_id() AS current_school_id))) OR ( SELECT app.is_superadmin() AS is_superadmin))`

</details>

<details><summary>Indexes (2)</summary>

```sql
CREATE UNIQUE INDEX bell_schedules_pkey ON public.bell_schedules USING btree (id)
CREATE INDEX idx_bell_schedules_school ON public.bell_schedules USING btree (school_id)
```

</details>

### Table bell_periods

- **Kind:** table
- **Row-level security:** enabled, 1 policies
- **Grants:** `authenticated` select; `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `bell_schedules` via `schedule_id`, `schools` via `school_id`
- **Written by routes:** `/api/admin/schedule/setup` (delete/insert; maybe: delete)
- **Read by routes:** `/api/admin/payroll/run`, `/api/admin/schedule/cover`, `/api/admin/schedule/duties`, `/api/feed`, `/api/whatsapp/simulate`, `/api/whatsapp/webhook`
- **Read directly by pages (browser, RLS):** `/admin/schedule`, `/teacher/schedule`

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `schedule_id` | uuid | not null |  |
| `school_id` | uuid | not null |  |
| `seq` | smallint | not null |  |
| `label` | text | not null |  |
| `kind` | text | not null | `'period'::text` |
| `period_no` | smallint |  |  |
| `starts_at` | time without time zone | not null |  |
| `ends_at` | time without time zone | not null |  |

<details><summary>Unique and check constraints</summary>

```sql
UNIQUE UNIQUE (schedule_id, seq)
CHECK ((ends_at > starts_at))
CHECK (((kind = 'period'::text) = (period_no IS NOT NULL)))
CHECK ((kind = ANY (ARRAY['period'::text, 'break'::text, 'lunch'::text, 'assembly'::text, 'other'::text])))
CHECK (((length(TRIM(BOTH FROM label)) >= 1) AND (length(TRIM(BOTH FROM label)) <= 40)))
CHECK (((period_no >= 1) AND (period_no <= 16)))
CHECK (((seq >= 1) AND (seq <= 40)))
```

</details>

<details><summary>RLS policies (1)</summary>

- **bell_periods_read** · SELECT · authenticated
  - USING `((( SELECT app.is_staff() AS is_staff) AND (school_id = ( SELECT app.current_school_id() AS current_school_id))) OR ( SELECT app.is_superadmin() AS is_superadmin))`

</details>

<details><summary>Indexes (4)</summary>

```sql
CREATE UNIQUE INDEX bell_periods_pkey ON public.bell_periods USING btree (id)
CREATE UNIQUE INDEX bell_periods_schedule_id_seq_key ON public.bell_periods USING btree (schedule_id, seq)
CREATE INDEX idx_bell_periods_school ON public.bell_periods USING btree (school_id)
CREATE UNIQUE INDEX uq_bell_periods_no ON public.bell_periods USING btree (schedule_id, period_no) WHERE (period_no IS NOT NULL)
```

</details>

### Table rooms

- **Kind:** table
- **Row-level security:** enabled, 1 policies
- **Grants:** `authenticated` select; `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `schools` via `school_id`
- **Referenced by:** `duty_assignments`, `sched_requirements`, `timetable_slots`
- **Written by routes:** `/api/admin/schedule/setup` (update/insert; maybe: delete), `/api/admin/schedule/timetable` (select/insert)
- **Read by routes:** `/api/admin/payroll/run`, `/api/admin/schedule/cover`, `/api/admin/schedule/duties`, `/api/admin/schedule/solver`, `/api/feed`, `/api/whatsapp/simulate`, `/api/whatsapp/webhook`
- **Read directly by pages (browser, RLS):** `/admin/schedule`, `/teacher/schedule`

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `school_id` | uuid | not null |  |
| `name` | text | not null |  |
| `kind` | text | not null | `'classroom'::text` |
| `capacity` | integer |  |  |
| `home_class` | text |  |  |
| `active` | boolean | not null | `true` |
| `created_at` | timestamp with time zone | not null | `now()` |

<details><summary>Unique and check constraints</summary>

```sql
UNIQUE UNIQUE (school_id, name)
CHECK (((capacity >= 1) AND (capacity <= 5000)))
CHECK ((kind = ANY (ARRAY['classroom'::text, 'lab'::text, 'hall'::text, 'library'::text, 'ground'::text, 'other'::text])))
CHECK (((length(TRIM(BOTH FROM name)) >= 1) AND (length(TRIM(BOTH FROM name)) <= 60)))
```

</details>

<details><summary>RLS policies (1)</summary>

- **rooms_read** · SELECT · authenticated
  - USING `((( SELECT app.is_staff() AS is_staff) AND (school_id = ( SELECT app.current_school_id() AS current_school_id))) OR ( SELECT app.is_superadmin() AS is_superadmin))`

</details>

<details><summary>Indexes (3)</summary>

```sql
CREATE UNIQUE INDEX rooms_pkey ON public.rooms USING btree (id)
CREATE UNIQUE INDEX rooms_school_id_name_key ON public.rooms USING btree (school_id, name)
CREATE UNIQUE INDEX uq_rooms_home_class ON public.rooms USING btree (school_id, app.norm_class(home_class)) WHERE ((home_class IS NOT NULL) AND active)
```

</details>

### Table academic_events

- **Kind:** table
- **Row-level security:** enabled, 1 policies
- **Grants:** `authenticated` select; `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `bell_schedules` via `bell_schedule_id`, `users` via `created_by`, `schools` via `school_id`
- **Referenced by:** `duty_assignments`
- **Written by routes:** `/api/admin/schedule/calendar` (update/select/insert/delete), `/api/admin/schedule/setup` (select; maybe: delete)
- **Read by routes:** `/api/admin/attendance`, `/api/admin/payroll/run`, `/api/admin/schedule/cover`, `/api/admin/schedule/duties`, `/api/feed`, `/api/ops/delivery`, `/api/parent/ask`, `/api/parent/desk`, `/api/whatsapp/simulate`, `/api/whatsapp/webhook`
- **Read directly by pages (browser, RLS):** `/admin/attendance`, `/admin/schedule`, `/teacher/attendance`, `/teacher/schedule`

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `school_id` | uuid | not null |  |
| `title` | text | not null |  |
| `kind` | text | not null |  |
| `starts_on` | date | not null |  |
| `ends_on` | date | not null |  |
| `wing_ids` | uuid[] |  |  |
| `bell_schedule_id` | uuid |  |  |
| `suspends_classes` | boolean | not null | `false` |
| `staff_scope` | text | not null | `'none'::text` |
| `starts_at` | time without time zone |  |  |
| `ends_at` | time without time zone |  |  |
| `notes` | text |  |  |
| `created_by` | uuid |  |  |
| `created_at` | timestamp with time zone | not null | `now()` |
| `updated_at` | timestamp with time zone | not null | `now()` |

<details><summary>Unique and check constraints</summary>

```sql
CHECK ((ends_on >= starts_on))
CHECK (((ends_on - starts_on) <= 366))
CHECK (((starts_at IS NULL) OR (ends_at IS NULL) OR (ends_at > starts_at)))
CHECK ((kind = ANY (ARRAY['holiday'::text, 'exam'::text, 'ptm'::text, 'meeting'::text, 'event'::text, 'other'::text])))
CHECK ((length(notes) <= 2000))
CHECK ((staff_scope = ANY (ARRAY['all'::text, 'teaching'::text, 'office'::text, 'none'::text])))
CHECK (((length(TRIM(BOTH FROM title)) >= 1) AND (length(TRIM(BOTH FROM title)) <= 120)))
```

</details>

<details><summary>RLS policies (1)</summary>

- **academic_events_read** · SELECT · authenticated
  - USING `((( SELECT app.is_staff() AS is_staff) AND (school_id = ( SELECT app.current_school_id() AS current_school_id))) OR ( SELECT app.is_superadmin() AS is_superadmin))`

</details>

<details><summary>Triggers (1)</summary>

```sql
CREATE TRIGGER trg_audit_academic_events AFTER INSERT OR DELETE OR UPDATE ON public.academic_events FOR EACH ROW EXECUTE FUNCTION app.audit()
```

</details>

<details><summary>Indexes (2)</summary>

```sql
CREATE UNIQUE INDEX academic_events_pkey ON public.academic_events USING btree (id)
CREATE INDEX idx_academic_events_school ON public.academic_events USING btree (school_id, starts_on)
```

</details>

### Table timetable_versions

- **Kind:** table
- **Row-level security:** enabled, 1 policies
- **Grants:** `authenticated` select; `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `users` via `created_by`, `users` via `published_by`, `schools` via `school_id`
- **Referenced by:** `timetable_slots`
- **Written by routes:** `/api/admin/schedule/solver` (insert/select/delete), `/api/admin/schedule/timetable` (select/insert/delete/update)
- **Read by routes:** `/api/admin/payroll/run`, `/api/admin/schedule/cover`, `/api/admin/schedule/duties`, `/api/feed`, `/api/ops/overview`, `/api/ops/schools`, `/api/ops/schools/[id]`, `/api/parent/ask`, `/api/parent/desk`, `/api/whatsapp/simulate`, `/api/whatsapp/webhook`
- **Read directly by pages (browser, RLS):** `/admin/directory`, `/admin/schedule`, `/teacher/schedule`
- **SQL functions:** `app.check_timetable_slot()` select, `app.guard_published_slots()` select, `ops_school_metrics()` select

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `school_id` | uuid | not null |  |
| `session` | text | not null |  |
| `name` | text | not null |  |
| `status` | text | not null | `'draft'::text` |
| `effective_from` | date |  |  |
| `source` | text | not null | `'manual'::text` |
| `notes` | text |  |  |
| `created_by` | uuid |  |  |
| `published_by` | uuid |  |  |
| `published_at` | timestamp with time zone |  |  |
| `created_at` | timestamp with time zone | not null | `now()` |
| `updated_at` | timestamp with time zone | not null | `now()` |
| `solver_report` | jsonb |  |  |

<details><summary>Unique and check constraints</summary>

```sql
CHECK (((status <> 'published'::text) OR ((effective_from IS NOT NULL) AND (published_at IS NOT NULL))))
CHECK (((length(TRIM(BOTH FROM name)) >= 1) AND (length(TRIM(BOTH FROM name)) <= 80)))
CHECK ((length(notes) <= 2000))
CHECK ((source = ANY (ARRAY['manual'::text, 'import'::text, 'copy'::text, 'solver'::text])))
CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'archived'::text])))
```

</details>

<details><summary>RLS policies (1)</summary>

- **timetable_versions_read** · SELECT · authenticated
  - USING `((( SELECT app.is_staff() AS is_staff) AND (school_id = ( SELECT app.current_school_id() AS current_school_id)) AND ((status <> 'draft'::text) OR ( SELECT app.has_perm('schedule.academic'::text) AS has_perm))) OR ( SELECT app.is_superadmin() AS is_superadmin))`

</details>

<details><summary>Triggers (1)</summary>

```sql
CREATE TRIGGER trg_audit_timetable_versions AFTER INSERT OR DELETE OR UPDATE ON public.timetable_versions FOR EACH ROW EXECUTE FUNCTION app.audit('status,effective_from,name')
```

</details>

<details><summary>Indexes (3)</summary>

```sql
CREATE UNIQUE INDEX timetable_versions_pkey ON public.timetable_versions USING btree (id)
CREATE INDEX idx_timetable_versions_school ON public.timetable_versions USING btree (school_id, session, status)
CREATE UNIQUE INDEX uq_timetable_versions_effective ON public.timetable_versions USING btree (school_id, effective_from) WHERE (status = 'published'::text)
```

</details>

### Table timetable_slots

- **Kind:** table
- **Row-level security:** enabled, 1 policies
- **Grants:** `authenticated` select; `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `rooms` via `room_id`, `schools` via `school_id`, `staff_members` via `staff_member_id`, `users` via `teacher_id`, `timetable_versions` via `version_id`
- **Referenced by:** `cover_assignments`, `visit_sessions`
- **Written by routes:** `/api/admin/people` (in SQL: update), `/api/admin/schedule/setup` (select; maybe: delete), `/api/admin/schedule/solver` (insert), `/api/admin/schedule/timetable` (select/insert/delete/update), `/api/admin/users/assignments` (in SQL: update), `/api/ops/requests` (in SQL: update), `/api/ops/schools/[id]/classes` (in SQL: update), `/api/ops/schools/[id]/people` (in SQL: update), `/api/ops/schools/[id]/people/[userId]` (in SQL: update), `/api/ops/schools/[id]/subjects` (in SQL: update; maybe: select)
- **Read by routes:** `/api/admin/payroll/run`, `/api/admin/schedule/cover`, `/api/admin/schedule/duties`, `/api/admin/schedule/visits`, `/api/admin/subjects`, `/api/feed`, `/api/parent/ask`, `/api/parent/desk`, `/api/whatsapp/simulate`, `/api/whatsapp/webhook`
- **Read directly by pages (browser, RLS):** `/admin/directory`, `/admin/schedule`, `/teacher/schedule`
- **SQL functions:** `app.check_timetable_slot()` select, `hr_link_login()` update, `app.relabel_timetable_subject()` update

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `version_id` | uuid | not null |  |
| `school_id` | uuid | not null |  |
| `class` | text | not null |  |
| `class_key` | text |  | `app.norm_class(class)` |
| `group_label` | text | not null | `''::text` |
| `weekday` | smallint | not null |  |
| `period_no` | smallint | not null |  |
| `subject` | text | not null |  |
| `teacher_id` | uuid |  |  |
| `room_id` | uuid |  |  |
| `combined` | boolean | not null | `false` |
| `created_at` | timestamp with time zone | not null | `now()` |
| `staff_member_id` | uuid |  |  |
| `locked` | boolean | not null | `false` |

<details><summary>Unique and check constraints</summary>

```sql
UNIQUE UNIQUE (version_id, class_key, weekday, period_no, group_label)
CHECK (((length(TRIM(BOTH FROM class)) >= 1) AND (length(TRIM(BOTH FROM class)) <= 40)))
CHECK ((length(group_label) <= 40))
CHECK (((teacher_id IS NULL) OR (staff_member_id IS NULL)))
CHECK (((period_no >= 1) AND (period_no <= 16)))
CHECK (((length(TRIM(BOTH FROM subject)) >= 1) AND (length(TRIM(BOTH FROM subject)) <= 80)))
CHECK (((weekday >= 1) AND (weekday <= 7)))
```

</details>

<details><summary>RLS policies (1)</summary>

- **timetable_slots_read** · SELECT · authenticated
  - USING `((( SELECT app.is_staff() AS is_staff) AND (school_id = ( SELECT app.current_school_id() AS current_school_id)) AND (( SELECT app.has_perm('schedule.academic'::text) AS has_perm) OR (EXISTS ( SELECT 1    FROM timetable_versions v   WHERE ((v.id = timetable_slots.version_id) AND (v.status <> 'draft'::text)))))) OR ( SELECT app.is_superadmin() AS is_superadmin))`

</details>

<details><summary>Triggers (2)</summary>

```sql
CREATE TRIGGER trg_check_timetable_slot BEFORE INSERT OR UPDATE ON public.timetable_slots FOR EACH ROW EXECUTE FUNCTION app.check_timetable_slot()
CREATE TRIGGER trg_guard_published_slots BEFORE INSERT OR DELETE OR UPDATE ON public.timetable_slots FOR EACH ROW EXECUTE FUNCTION app.guard_published_slots()
```

</details>

<details><summary>Indexes (5)</summary>

```sql
CREATE UNIQUE INDEX timetable_slots_pkey ON public.timetable_slots USING btree (id)
CREATE UNIQUE INDEX timetable_slots_version_id_class_key_weekday_period_no_grou_key ON public.timetable_slots USING btree (version_id, class_key, weekday, period_no, group_label)
CREATE INDEX idx_timetable_slots_staff_member ON public.timetable_slots USING btree (staff_member_id, version_id) WHERE (staff_member_id IS NOT NULL)
CREATE INDEX idx_timetable_slots_teacher ON public.timetable_slots USING btree (teacher_id, version_id) WHERE (teacher_id IS NOT NULL)
CREATE INDEX idx_timetable_slots_version ON public.timetable_slots USING btree (version_id, weekday, period_no)
```

</details>

### Table sched_requirements

- **Kind:** table
- **Row-level security:** enabled, 1 policies
- **Grants:** `authenticated` select; `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `rooms` via `room_id`, `schools` via `school_id`, `staff_members` via `staff_member_id`, `users` via `teacher_id`, `users` via `updated_by`
- **Written by routes:** `/api/admin/people` (in SQL: update), `/api/admin/schedule/solver` (update/insert/select/delete), `/api/admin/users/assignments` (in SQL: update/select), `/api/ops/requests` (in SQL: update/select), `/api/ops/schools/[id]/classes` (in SQL: update/select), `/api/ops/schools/[id]/people` (in SQL: update/select), `/api/ops/schools/[id]/people/[userId]` (in SQL: update/select), `/api/ops/schools/[id]/subjects` (in SQL: update/select)
- **Read directly by pages (browser, RLS):** `/admin/schedule`
- **SQL functions:** `hr_link_login()` update, `ops_rename_class_subject()` update/select

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `school_id` | uuid | not null |  |
| `session` | text | not null |  |
| `class` | text | not null |  |
| `class_key` | text |  | `app.norm_class(class)` |
| `subject` | text | not null |  |
| `group_label` | text | not null | `''::text` |
| `teacher_id` | uuid |  |  |
| `staff_member_id` | uuid |  |  |
| `periods_per_week` | smallint | not null |  |
| `doubles` | smallint | not null | `0` |
| `room_kind` | text |  |  |
| `room_id` | uuid |  |  |
| `max_per_day` | smallint | not null | `1` |
| `combined_key` | text |  |  |
| `notes` | text |  |  |
| `updated_by` | uuid |  |  |
| `updated_at` | timestamp with time zone | not null | `now()` |
| `created_at` | timestamp with time zone | not null | `now()` |

<details><summary>Unique and check constraints</summary>

```sql
CHECK (((doubles >= 0) AND ((doubles * 2) <= periods_per_week)))
CHECK (((length(class) >= 1) AND (length(class) <= 40)))
CHECK ((session ~ '^\d{4}-\d{2}$'::text))
CHECK (((combined_key IS NULL) OR ((length(combined_key) >= 1) AND (length(combined_key) <= 40))))
CHECK ((length(group_label) <= 40))
CHECK (((max_per_day >= 1) AND (max_per_day <= 4)))
CHECK (((notes IS NULL) OR (length(notes) <= 500)))
CHECK (((teacher_id IS NULL) OR (staff_member_id IS NULL)))
CHECK (((periods_per_week >= 1) AND (periods_per_week <= 20)))
CHECK (((room_kind IS NULL) OR (room_kind = ANY (ARRAY['classroom'::text, 'lab'::text, 'hall'::text, 'library'::text, 'ground'::text, 'other'::text]))))
CHECK (((length(subject) >= 1) AND (length(subject) <= 80)))
```

</details>

<details><summary>RLS policies (1)</summary>

- **sched_requirements_read** · SELECT · authenticated
  - USING `(((school_id = ( SELECT app.current_school_id() AS current_school_id)) AND (( SELECT app.has_perm('schedule.academic'::text) AS has_perm) OR ( SELECT app.has_perm('schedule.workforce'::text) AS has_perm) OR ( SELECT app.has_perm('workforce.read'::text) AS has_perm))) OR ( SELECT app.is_superadmin() AS is_superadmin))`

</details>

<details><summary>Indexes (3)</summary>

```sql
CREATE UNIQUE INDEX sched_requirements_pkey ON public.sched_requirements USING btree (id)
CREATE INDEX ix_sched_requirements_school ON public.sched_requirements USING btree (school_id, session)
CREATE UNIQUE INDEX uq_sched_requirements ON public.sched_requirements USING btree (school_id, session, class_key, lower(subject), group_label)
```

</details>

### Table sched_solver_settings

- **Kind:** table
- **Row-level security:** enabled, 1 policies
- **Grants:** `authenticated` select; `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (school_id)`
- **References:** `schools` via `school_id`, `users` via `updated_by`
- **Written by routes:** `/api/admin/schedule/solver` (upsert)
- **Read directly by pages (browser, RLS):** `/admin/schedule`

| Column | Type | Null | Default |
|---|---|---|---|
| `school_id` | uuid | not null |  |
| `default_target_per_week` | smallint | not null | `30` |
| `default_max_per_day` | smallint | not null | `7` |
| `default_max_consecutive` | smallint | not null | `4` |
| `class_teacher_first` | boolean | not null | `true` |
| `subject_spread` | boolean | not null | `true` |
| `updated_by` | uuid |  |  |
| `updated_at` | timestamp with time zone | not null | `now()` |

<details><summary>Unique and check constraints</summary>

```sql
CHECK (((default_max_consecutive >= 1) AND (default_max_consecutive <= 12)))
CHECK (((default_max_per_day >= 1) AND (default_max_per_day <= 12)))
CHECK (((default_target_per_week >= 1) AND (default_target_per_week <= 60)))
```

</details>

<details><summary>RLS policies (1)</summary>

- **sched_solver_settings_read** · SELECT · authenticated
  - USING `(((school_id = ( SELECT app.current_school_id() AS current_school_id)) AND (( SELECT app.has_perm('schedule.academic'::text) AS has_perm) OR ( SELECT app.has_perm('schedule.workforce'::text) AS has_perm) OR ( SELECT app.has_perm('workforce.read'::text) AS has_perm))) OR ( SELECT app.is_superadmin() AS is_superadmin))`

</details>

<details><summary>Indexes (1)</summary>

```sql
CREATE UNIQUE INDEX sched_solver_settings_pkey ON public.sched_solver_settings USING btree (school_id)
```

</details>

### Table teacher_load_rules

- **Kind:** table
- **Row-level security:** enabled, 1 policies
- **Grants:** `authenticated` select; `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `schools` via `school_id`, `staff_members` via `staff_member_id`, `users` via `updated_by`, `users` via `user_id`
- **Written by routes:** `/api/admin/schedule/solver` (select/update/insert/delete)
- **Read directly by pages (browser, RLS):** `/admin/schedule`

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `school_id` | uuid | not null |  |
| `user_id` | uuid |  |  |
| `staff_member_id` | uuid |  |  |
| `target_per_week` | smallint |  |  |
| `max_per_day` | smallint |  |  |
| `max_per_week` | smallint |  |  |
| `max_consecutive` | smallint |  |  |
| `unavailable` | jsonb | not null | `'[]'::jsonb` |
| `updated_by` | uuid |  |  |
| `updated_at` | timestamp with time zone | not null | `now()` |

<details><summary>Unique and check constraints</summary>

```sql
CHECK (((max_consecutive IS NULL) OR ((max_consecutive >= 1) AND (max_consecutive <= 12))))
CHECK (((max_per_day IS NULL) OR ((max_per_day >= 1) AND (max_per_day <= 12))))
CHECK (((max_per_week IS NULL) OR ((max_per_week >= 1) AND (max_per_week <= 60))))
CHECK (((user_id IS NULL) <> (staff_member_id IS NULL)))
CHECK (((target_per_week IS NULL) OR ((target_per_week >= 0) AND (target_per_week <= 60))))
CHECK (((jsonb_typeof(unavailable) = 'array'::text) AND (jsonb_array_length(unavailable) <= 14)))
```

</details>

<details><summary>RLS policies (1)</summary>

- **teacher_load_rules_read** · SELECT · authenticated
  - USING `(((school_id = ( SELECT app.current_school_id() AS current_school_id)) AND (( SELECT app.has_perm('schedule.academic'::text) AS has_perm) OR ( SELECT app.has_perm('schedule.workforce'::text) AS has_perm) OR ( SELECT app.has_perm('workforce.read'::text) AS has_perm))) OR ( SELECT app.is_superadmin() AS is_superadmin))`

</details>

<details><summary>Indexes (4)</summary>

```sql
CREATE UNIQUE INDEX teacher_load_rules_pkey ON public.teacher_load_rules USING btree (id)
CREATE INDEX ix_teacher_load_rules_school ON public.teacher_load_rules USING btree (school_id)
CREATE UNIQUE INDEX uq_teacher_load_rules_staff ON public.teacher_load_rules USING btree (staff_member_id) WHERE (staff_member_id IS NOT NULL)
CREATE UNIQUE INDEX uq_teacher_load_rules_user ON public.teacher_load_rules USING btree (user_id) WHERE (user_id IS NOT NULL)
```

</details>

### Table cover_assignments

- **Kind:** table
- **Row-level security:** enabled, 1 policies
- **Grants:** `authenticated` select; `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `staff_members` via `absent_staff_member_id`, `users` via `absent_user_id`, `users` via `assigned_by`, `schools` via `school_id`, `timetable_slots` via `slot_id`, `staff_members` via `sub_staff_member_id`, `users` via `sub_user_id`
- **Written by routes:** `/api/admin/people` (in SQL: update), `/api/admin/schedule/cover` (select/delete/upsert), `/api/admin/users/assignments` (in SQL: update), `/api/ops/requests` (in SQL: update), `/api/ops/schools/[id]/classes` (in SQL: update), `/api/ops/schools/[id]/people` (in SQL: update), `/api/ops/schools/[id]/people/[userId]` (in SQL: update), `/api/ops/schools/[id]/subjects` (in SQL: update), `/api/teacher/cover` (update/select)
- **Read by routes:** `/api/admin/payroll/run`, `/api/admin/schedule/duties`, `/api/feed`, `/api/whatsapp/simulate`, `/api/whatsapp/webhook`
- **Read directly by pages (browser, RLS):** `/admin/schedule`, `/teacher/schedule`
- **SQL functions:** `hr_link_login()` update, `ops_rename_class_subject()` update

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `school_id` | uuid | not null |  |
| `on_date` | date | not null |  |
| `slot_id` | uuid | not null |  |
| `class` | text | not null |  |
| `period_no` | smallint | not null |  |
| `subject` | text | not null |  |
| `absent_user_id` | uuid |  |  |
| `absent_staff_member_id` | uuid |  |  |
| `reason` | text | not null |  |
| `status` | text | not null | `'assigned'::text` |
| `sub_user_id` | uuid |  |  |
| `sub_staff_member_id` | uuid |  |  |
| `flag_note` | text |  |  |
| `flagged_at` | timestamp with time zone |  |  |
| `assigned_by` | uuid |  |  |
| `created_at` | timestamp with time zone | not null | `now()` |
| `updated_at` | timestamp with time zone | not null | `now()` |

<details><summary>Unique and check constraints</summary>

```sql
UNIQUE UNIQUE (on_date, slot_id)
CHECK ((status = ANY (ARRAY['assigned'::text, 'not_needed'::text])))
CHECK (((status <> 'assigned'::text) OR (num_nonnulls(sub_user_id, sub_staff_member_id) = 1)))
CHECK (((status <> 'not_needed'::text) OR (num_nonnulls(sub_user_id, sub_staff_member_id) = 0)))
CHECK ((length(flag_note) <= 500))
CHECK ((reason = ANY (ARRAY['leave'::text, 'absent'::text, 'release'::text])))
```

</details>

<details><summary>RLS policies (1)</summary>

- **cover_assignments_read** · SELECT · authenticated
  - USING `((( SELECT app.is_staff() AS is_staff) AND (school_id = ( SELECT app.current_school_id() AS current_school_id))) OR ( SELECT app.is_superadmin() AS is_superadmin))`

</details>

<details><summary>Triggers (1)</summary>

```sql
CREATE TRIGGER trg_audit_cover_assignments AFTER INSERT OR DELETE OR UPDATE ON public.cover_assignments FOR EACH ROW EXECUTE FUNCTION app.audit('status,sub_user_id,sub_staff_member_id')
```

</details>

<details><summary>Indexes (4)</summary>

```sql
CREATE UNIQUE INDEX cover_assignments_on_date_slot_id_key ON public.cover_assignments USING btree (on_date, slot_id)
CREATE UNIQUE INDEX cover_assignments_pkey ON public.cover_assignments USING btree (id)
CREATE INDEX idx_cover_school_date ON public.cover_assignments USING btree (school_id, on_date)
CREATE INDEX idx_cover_sub_user ON public.cover_assignments USING btree (sub_user_id, on_date) WHERE (sub_user_id IS NOT NULL)
```

</details>

### Table duty_posts

- **Kind:** table
- **Row-level security:** enabled, 1 policies
- **Grants:** `authenticated` select; `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `schools` via `school_id`
- **Referenced by:** `duty_roster`
- **Written by routes:** `/api/admin/schedule/duties` (update/select/insert/delete)
- **Read by routes:** `/api/admin/payroll/run`, `/api/admin/schedule/cover`, `/api/feed`, `/api/whatsapp/simulate`, `/api/whatsapp/webhook`
- **Read directly by pages (browser, RLS):** `/admin/schedule`, `/teacher/schedule`

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `school_id` | uuid | not null |  |
| `name` | text | not null |  |
| `kind` | text | not null | `'other'::text` |
| `weekdays` | smallint[] | not null | `'{1,2,3,4,5}'::smallint[]` |
| `starts_at` | time without time zone | not null |  |
| `ends_at` | time without time zone | not null |  |
| `location` | text |  |  |
| `needed` | smallint | not null | `1` |
| `active` | boolean | not null | `true` |
| `created_at` | timestamp with time zone | not null | `now()` |

<details><summary>Unique and check constraints</summary>

```sql
UNIQUE UNIQUE (school_id, name)
CHECK ((length(location) <= 80))
CHECK ((ends_at > starts_at))
CHECK ((kind = ANY (ARRAY['gate'::text, 'bus'::text, 'lunch'::text, 'corridor'::text, 'assembly'::text, 'event'::text, 'other'::text])))
CHECK (((length(TRIM(BOTH FROM name)) >= 1) AND (length(TRIM(BOTH FROM name)) <= 80)))
CHECK (((needed >= 1) AND (needed <= 20)))
CHECK (((weekdays <@ ARRAY[(1)::smallint, (2)::smallint, (3)::smallint, (4)::smallint, (5)::smallint, (6)::smallint, (7)::smallint]) AND (cardinality(weekdays) > 0)))
```

</details>

<details><summary>RLS policies (1)</summary>

- **duty_posts_read** · SELECT · authenticated
  - USING `((( SELECT app.is_staff() AS is_staff) AND (school_id = ( SELECT app.current_school_id() AS current_school_id))) OR ( SELECT app.is_superadmin() AS is_superadmin))`

</details>

<details><summary>Indexes (2)</summary>

```sql
CREATE UNIQUE INDEX duty_posts_pkey ON public.duty_posts USING btree (id)
CREATE UNIQUE INDEX duty_posts_school_id_name_key ON public.duty_posts USING btree (school_id, name)
```

</details>

### Table duty_roster

- **Kind:** table
- **Row-level security:** enabled, 1 policies
- **Grants:** `authenticated` select; `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `users` via `created_by`, `duty_posts` via `post_id`, `schools` via `school_id`, `staff_members` via `staff_member_id`, `users` via `user_id`
- **Written by routes:** `/api/admin/schedule/duties` (delete/select/insert)
- **Read by routes:** `/api/admin/payroll/run`, `/api/admin/schedule/cover`, `/api/feed`, `/api/whatsapp/simulate`, `/api/whatsapp/webhook`
- **Read directly by pages (browser, RLS):** `/admin/schedule`, `/teacher/schedule`

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `school_id` | uuid | not null |  |
| `post_id` | uuid | not null |  |
| `weekday` | smallint | not null |  |
| `user_id` | uuid |  |  |
| `staff_member_id` | uuid |  |  |
| `created_by` | uuid |  |  |
| `created_at` | timestamp with time zone | not null | `now()` |

<details><summary>Unique and check constraints</summary>

```sql
CHECK ((num_nonnulls(user_id, staff_member_id) = 1))
CHECK (((weekday >= 1) AND (weekday <= 7)))
```

</details>

<details><summary>RLS policies (1)</summary>

- **duty_roster_read** · SELECT · authenticated
  - USING `((( SELECT app.is_staff() AS is_staff) AND (school_id = ( SELECT app.current_school_id() AS current_school_id))) OR ( SELECT app.is_superadmin() AS is_superadmin))`

</details>

<details><summary>Indexes (4)</summary>

```sql
CREATE UNIQUE INDEX duty_roster_pkey ON public.duty_roster USING btree (id)
CREATE INDEX idx_duty_roster_school ON public.duty_roster USING btree (school_id)
CREATE UNIQUE INDEX uq_duty_roster_staff ON public.duty_roster USING btree (post_id, weekday, staff_member_id) WHERE (staff_member_id IS NOT NULL)
CREATE UNIQUE INDEX uq_duty_roster_user ON public.duty_roster USING btree (post_id, weekday, user_id) WHERE (user_id IS NOT NULL)
```

</details>

### Table duty_assignments

- **Kind:** table
- **Row-level security:** enabled, 1 policies
- **Grants:** `authenticated` select; `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `users` via `created_by`, `academic_events` via `event_id`, `rooms` via `room_id`, `schools` via `school_id`, `staff_members` via `staff_member_id`, `users` via `user_id`
- **Written by routes:** `/api/admin/schedule/duties` (select/update/insert/delete)
- **Read by routes:** `/api/admin/payroll/run`, `/api/admin/schedule/cover`, `/api/feed`, `/api/whatsapp/simulate`, `/api/whatsapp/webhook`
- **Read directly by pages (browser, RLS):** `/admin/schedule`, `/teacher/schedule`

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `school_id` | uuid | not null |  |
| `on_date` | date | not null |  |
| `starts_at` | time without time zone | not null |  |
| `ends_at` | time without time zone | not null |  |
| `kind` | text | not null |  |
| `title` | text | not null |  |
| `event_id` | uuid |  |  |
| `room_id` | uuid |  |  |
| `user_id` | uuid |  |  |
| `staff_member_id` | uuid |  |  |
| `note` | text |  |  |
| `created_by` | uuid |  |  |
| `created_at` | timestamp with time zone | not null | `now()` |

<details><summary>Unique and check constraints</summary>

```sql
CHECK ((num_nonnulls(user_id, staff_member_id) = 1))
CHECK ((ends_at > starts_at))
CHECK ((kind = ANY (ARRAY['invigilation'::text, 'event'::text, 'other'::text])))
CHECK ((length(note) <= 500))
CHECK (((length(TRIM(BOTH FROM title)) >= 1) AND (length(TRIM(BOTH FROM title)) <= 120)))
```

</details>

<details><summary>RLS policies (1)</summary>

- **duty_assignments_read** · SELECT · authenticated
  - USING `((( SELECT app.is_staff() AS is_staff) AND (school_id = ( SELECT app.current_school_id() AS current_school_id))) OR ( SELECT app.is_superadmin() AS is_superadmin))`

</details>

<details><summary>Indexes (2)</summary>

```sql
CREATE UNIQUE INDEX duty_assignments_pkey ON public.duty_assignments USING btree (id)
CREATE INDEX idx_duty_assignments_school_date ON public.duty_assignments USING btree (school_id, on_date)
```

</details>

### Table visit_sessions

- **Kind:** table
- **Row-level security:** enabled, 1 policies
- **Grants:** `authenticated` select; `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `users` via `confirmed_by`, `schools` via `school_id`, `timetable_slots` via `slot_id`, `staff_members` via `staff_member_id`
- **Written by routes:** `/api/admin/schedule/visits` (select/update/insert/delete), `/api/admin/users/assignments` (in SQL: update), `/api/ops/requests` (in SQL: update), `/api/ops/schools/[id]/classes` (in SQL: update), `/api/ops/schools/[id]/people` (in SQL: update), `/api/ops/schools/[id]/people/[userId]` (in SQL: update), `/api/ops/schools/[id]/subjects` (in SQL: update)
- **Read by routes:** `/api/admin/payroll/run`, `/api/admin/schedule/cover`, `/api/admin/schedule/duties`, `/api/feed`, `/api/whatsapp/simulate`, `/api/whatsapp/webhook`
- **Read directly by pages (browser, RLS):** `/admin/schedule`, `/teacher/schedule`
- **SQL functions:** `ops_rename_class_subject()` update

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `school_id` | uuid | not null |  |
| `staff_member_id` | uuid | not null |  |
| `on_date` | date | not null |  |
| `slot_id` | uuid |  |  |
| `class` | text |  |  |
| `subject` | text |  |  |
| `status` | text | not null |  |
| `note` | text |  |  |
| `confirmed_by` | uuid |  |  |
| `confirmed_at` | timestamp with time zone | not null | `now()` |

<details><summary>Unique and check constraints</summary>

```sql
CHECK ((length(note) <= 500))
CHECK ((status = ANY (ARRAY['taken'::text, 'missed'::text])))
```

</details>

<details><summary>RLS policies (1)</summary>

- **visit_sessions_read** · SELECT · authenticated
  - USING `(((school_id = ( SELECT app.current_school_id() AS current_school_id)) AND (( SELECT app.has_perm('schedule.academic'::text) AS has_perm) OR ( SELECT app.has_perm('schedule.workforce'::text) AS has_perm) OR ( SELECT app.has_perm('workforce.read'::text) AS has_perm))) OR ( SELECT app.is_superadmin() AS is_superadmin))`

</details>

<details><summary>Triggers (1)</summary>

```sql
CREATE TRIGGER trg_audit_visit_sessions AFTER INSERT OR DELETE OR UPDATE ON public.visit_sessions FOR EACH ROW EXECUTE FUNCTION app.audit('status')
```

</details>

<details><summary>Indexes (3)</summary>

```sql
CREATE UNIQUE INDEX visit_sessions_pkey ON public.visit_sessions USING btree (id)
CREATE INDEX idx_visit_sessions_school ON public.visit_sessions USING btree (school_id, on_date)
CREATE UNIQUE INDEX uq_visit_sessions ON public.visit_sessions USING btree (staff_member_id, on_date, slot_id) WHERE (slot_id IS NOT NULL)
```

</details>

## HR & staff attendance

### Table staff_members

- **Kind:** table
- **Row-level security:** enabled, 1 policies
- **Grants:** `authenticated` select; `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `users` via `created_by`, `hr_departments` via `department_id`, `hr_grades` via `grade_id`, `staff_members` via `manager_id`, `schools` via `school_id`, `users` via `user_id`, `sched_wings` via `wing_id`
- **Referenced by:** `attendance_month_reviews`, `comp_off_grants`, `cover_assignments`, `duty_assignments`, `duty_roster`, `hr_departments`, `leave_requests`, `pay_adjustments`, `pay_run_lines`, `pay_runs`, `sched_requirements`, `shift_overrides`, `staff_absences`, `staff_day_marks`, `staff_documents`, `staff_events`, `staff_exits`, `staff_jobs`, `staff_loans`, `staff_pay_settings`, `staff_profiles`, `staff_punches`, `staff_qualifications`, `staff_salaries`, `staff_shift_plans`, `staff_statutory`, `tax_declarations`, `teacher_load_rules`, `timetable_slots`, `visit_sessions`
- **Written by routes:** `/api/admin/attendance` (select; maybe: delete), `/api/admin/people` (select/insert/update; in SQL: select/update/delete; maybe: upsert), `/api/admin/people/import` (select/update/insert; maybe: upsert), `/api/admin/people/structure` (select; maybe: update/delete), `/api/admin/schedule/staff` (update/select/insert), `/api/me/employee` (select; in SQL: select/update), `/api/whatsapp/simulate` (select/update), `/api/whatsapp/webhook` (select/update)
- **Read by routes:** `/api/admin/admissions`, `/api/admin/admissions/application`, `/api/admin/admissions/offers`, `/api/admin/leave`, `/api/admin/payroll`, `/api/admin/payroll/run`, `/api/admin/people/documents`, `/api/admin/schedule/compoff`, `/api/admin/schedule/cover`, `/api/admin/schedule/duties`, `/api/admin/schedule/solver`, `/api/admin/schedule/timetable`, `/api/admin/schedule/visits`, `/api/attendance/device`, `/api/feed`, `/api/me/payslips`, `/api/ops/delivery`, `/api/staff/ask`
- **Read directly by pages (browser, RLS):** `/admin (layout)`, `/admin/schedule`, `/teacher/schedule`
- **SQL functions:** `hr_daily()` select, `hr_link_login()` select/delete/update, `hr_next_employee_code()` select, `hr_reassign_reports()` select, `hr_sync_jobs()` select, `app.sync_staff_job()` update, `app.users_on_register()` select/insert

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `school_id` | uuid | not null |  |
| `user_id` | uuid |  |  |
| `name` | text | not null |  |
| `category` | text | not null |  |
| `designation` | text | not null | `''::text` |
| `wing_id` | uuid |  |  |
| `phone_e164` | text |  |  |
| `employee_code` | text |  |  |
| `joined_on` | date |  |  |
| `active` | boolean | not null | `true` |
| `created_by` | uuid |  |  |
| `created_at` | timestamp with time zone | not null | `now()` |
| `updated_at` | timestamp with time zone | not null | `now()` |
| `employment` | text | not null | `'permanent'::text` |
| `contract_from` | date |  |  |
| `contract_to` | date |  |  |
| `whatsapp_opt_in` | boolean | not null | `false` |
| `department_id` | uuid |  |  |
| `grade_id` | uuid |  |  |
| `manager_id` | uuid |  |  |
| `probation_until` | date |  |  |
| `confirmed_on` | date |  |  |
| `exit_on` | date |  |  |

<details><summary>Unique and check constraints</summary>

```sql
CHECK ((category = ANY (ARRAY['teaching'::text, 'office'::text, 'support'::text, 'assistant'::text])))
CHECK (((contract_to IS NULL) OR (contract_from IS NULL) OR (contract_to >= contract_from)))
CHECK ((length(designation) <= 80))
CHECK ((length(employee_code) <= 40))
CHECK ((employment = ANY (ARRAY['permanent'::text, 'contract'::text, 'visiting'::text])))
CHECK (((length(TRIM(BOTH FROM name)) >= 1) AND (length(TRIM(BOTH FROM name)) <= 120)))
CHECK (((manager_id IS NULL) OR (manager_id <> id)))
CHECK ((phone_e164 ~ '^\+[1-9][0-9]{7,14}$'::text))
```

</details>

<details><summary>RLS policies (1)</summary>

- **staff_members_read** · SELECT · authenticated
  - USING `((user_id = ( SELECT auth.uid() AS uid)) OR ((school_id = ( SELECT app.current_school_id() AS current_school_id)) AND (( SELECT app.has_perm('schedule.workforce'::text) AS has_perm) OR ( SELECT app.has_perm('workforce.read'::text) AS has_perm))) OR ( SELECT app.is_superadmin() AS is_superadmin))`

</details>

<details><summary>Triggers (2)</summary>

```sql
CREATE TRIGGER trg_audit_staff_members AFTER INSERT OR DELETE OR UPDATE ON public.staff_members FOR EACH ROW EXECUTE FUNCTION app.audit('name,category,designation,phone_e164,active,user_id,employee_code,joined_on,probation_until,confirmed_on,exit_on')
CREATE TRIGGER trg_staff_members_job AFTER INSERT OR UPDATE ON public.staff_members FOR EACH ROW EXECUTE FUNCTION app.staff_members_job()
```

</details>

<details><summary>Indexes (6)</summary>

```sql
CREATE UNIQUE INDEX staff_members_pkey ON public.staff_members USING btree (id)
CREATE INDEX idx_staff_members_department ON public.staff_members USING btree (department_id) WHERE (department_id IS NOT NULL)
CREATE INDEX idx_staff_members_manager ON public.staff_members USING btree (manager_id) WHERE (manager_id IS NOT NULL)
CREATE INDEX idx_staff_members_school ON public.staff_members USING btree (school_id, active)
CREATE UNIQUE INDEX uq_staff_members_code ON public.staff_members USING btree (school_id, employee_code) WHERE (employee_code IS NOT NULL)
CREATE UNIQUE INDEX uq_staff_members_user ON public.staff_members USING btree (school_id, user_id) WHERE (user_id IS NOT NULL)
```

</details>

### Table staff_jobs

- **Kind:** table
- **Row-level security:** enabled, 0 policies
- **Grants:** `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `users` via `created_by`, `hr_departments` via `department_id`, `hr_grades` via `grade_id`, `staff_members` via `manager_id`, `schools` via `school_id`, `staff_members` via `staff_member_id`
- **Written by routes:** `/api/admin/people` (select/update/insert/delete/upsert; in SQL: select/insert; maybe: upsert), `/api/admin/people/import` (select/update), `/api/admin/people/structure` (select; maybe: update/delete)
- **Read by routes:** `/api/me/employee`
- **SQL functions:** `hr_link_login()` select, `hr_reassign_reports()` insert, `app.staff_members_job()` insert, `app.sync_staff_job()` select

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `school_id` | uuid | not null |  |
| `staff_member_id` | uuid | not null |  |
| `effective_from` | date | not null |  |
| `action` | text | not null |  |
| `designation` | text | not null | `''::text` |
| `category` | text | not null |  |
| `department_id` | uuid |  |  |
| `grade_id` | uuid |  |  |
| `manager_id` | uuid |  |  |
| `employment` | text | not null | `'permanent'::text` |
| `contract_from` | date |  |  |
| `contract_to` | date |  |  |
| `reason` | text |  |  |
| `authority` | text |  |  |
| `created_by` | uuid |  |  |
| `created_at` | timestamp with time zone | not null | `now()` |

<details><summary>Unique and check constraints</summary>

```sql
UNIQUE UNIQUE (staff_member_id, effective_from)
CHECK ((action = ANY (ARRAY['hire'::text, 'redesignation'::text, 'transfer'::text, 'promotion'::text, 'employment_change'::text, 'renewal'::text, 'rehire'::text, 'correction'::text])))
CHECK ((length(authority) <= 120))
CHECK ((category = ANY (ARRAY['teaching'::text, 'office'::text, 'support'::text, 'assistant'::text])))
CHECK (((manager_id IS NULL) OR (manager_id <> staff_member_id)))
CHECK (((contract_from IS NULL) OR (contract_to IS NULL) OR (contract_to >= contract_from)))
CHECK ((length(designation) <= 80))
CHECK ((employment = ANY (ARRAY['permanent'::text, 'contract'::text, 'visiting'::text])))
CHECK ((length(reason) <= 500))
```

</details>

<details><summary>Triggers (2)</summary>

```sql
CREATE TRIGGER trg_audit_staff_jobs AFTER INSERT OR DELETE OR UPDATE ON public.staff_jobs FOR EACH ROW EXECUTE FUNCTION app.audit()
CREATE TRIGGER trg_staff_jobs_sync AFTER INSERT OR DELETE OR UPDATE ON public.staff_jobs FOR EACH ROW EXECUTE FUNCTION app.staff_jobs_sync()
```

</details>

<details><summary>Indexes (3)</summary>

```sql
CREATE UNIQUE INDEX staff_jobs_pkey ON public.staff_jobs USING btree (id)
CREATE UNIQUE INDEX staff_jobs_staff_member_id_effective_from_key ON public.staff_jobs USING btree (staff_member_id, effective_from)
CREATE INDEX idx_staff_jobs_school ON public.staff_jobs USING btree (school_id, effective_from)
```

</details>

### Table staff_profiles

- **Kind:** table
- **Row-level security:** enabled, 0 policies
- **Grants:** `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (staff_member_id)`
- **References:** `schools` via `school_id`, `staff_members` via `staff_member_id`, `users` via `updated_by`
- **Written by routes:** `/api/admin/people` (select; in SQL: select; maybe: upsert), `/api/admin/people/import` (maybe: upsert)
- **Read by routes:** `/api/admin/payroll/run`, `/api/me/employee`
- **SQL functions:** `hr_link_login()` select

| Column | Type | Null | Default |
|---|---|---|---|
| `staff_member_id` | uuid | not null |  |
| `school_id` | uuid | not null |  |
| `date_of_birth` | date |  |  |
| `gender` | text |  |  |
| `blood_group` | text |  |  |
| `marital_status` | text |  |  |
| `kin_name` | text |  |  |
| `personal_email` | text |  |  |
| `address` | text |  |  |
| `city` | text |  |  |
| `state` | text |  |  |
| `pincode` | text |  |  |
| `emergency_name` | text |  |  |
| `emergency_relation` | text |  |  |
| `emergency_phone` | text |  |  |
| `updated_by` | uuid |  |  |
| `updated_at` | timestamp with time zone | not null | `now()` |

<details><summary>Unique and check constraints</summary>

```sql
CHECK ((length(address) <= 400))
CHECK ((blood_group = ANY (ARRAY['A+'::text, 'A-'::text, 'B+'::text, 'B-'::text, 'AB+'::text, 'AB-'::text, 'O+'::text, 'O-'::text])))
CHECK ((length(city) <= 80))
CHECK ((length(emergency_name) <= 120))
CHECK ((emergency_phone ~ '^\+[1-9][0-9]{7,14}$'::text))
CHECK ((length(emergency_relation) <= 60))
CHECK ((gender = ANY (ARRAY['female'::text, 'male'::text, 'other'::text])))
CHECK ((length(kin_name) <= 120))
CHECK ((marital_status = ANY (ARRAY['single'::text, 'married'::text, 'widowed'::text, 'divorced'::text])))
CHECK ((length(personal_email) <= 200))
CHECK ((pincode ~ '^[1-9][0-9]{5}$'::text))
CHECK ((length(state) <= 80))
```

</details>

<details><summary>Triggers (2)</summary>

```sql
CREATE TRIGGER trg_audit_staff_profiles AFTER INSERT OR DELETE OR UPDATE ON public.staff_profiles FOR EACH ROW EXECUTE FUNCTION app.audit_fields_only()
CREATE TRIGGER trg_touch_staff_profiles BEFORE UPDATE ON public.staff_profiles FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at()
```

</details>

<details><summary>Indexes (1)</summary>

```sql
CREATE UNIQUE INDEX staff_profiles_pkey ON public.staff_profiles USING btree (staff_member_id)
```

</details>

### Table staff_statutory

- **Kind:** table
- **Row-level security:** enabled, 0 policies
- **Grants:** `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (staff_member_id)`
- **References:** `schools` via `school_id`, `staff_members` via `staff_member_id`, `users` via `updated_by`
- **Written by routes:** `/api/admin/people` (select; in SQL: select; maybe: upsert), `/api/admin/people/import` (maybe: upsert)
- **Read by routes:** `/api/admin/payroll/export`, `/api/admin/payroll/run`, `/api/me/employee`
- **SQL functions:** `hr_link_login()` select

| Column | Type | Null | Default |
|---|---|---|---|
| `staff_member_id` | uuid | not null |  |
| `school_id` | uuid | not null |  |
| `pan` | text |  |  |
| `uan` | text |  |  |
| `esi_no` | text |  |  |
| `aadhaar_last4` | text |  |  |
| `bank_account` | text |  |  |
| `bank_ifsc` | text |  |  |
| `bank_name` | text |  |  |
| `bank_holder` | text |  |  |
| `nominee_name` | text |  |  |
| `nominee_relation` | text |  |  |
| `updated_by` | uuid |  |  |
| `updated_at` | timestamp with time zone | not null | `now()` |

<details><summary>Unique and check constraints</summary>

```sql
CHECK ((aadhaar_last4 ~ '^[0-9]{4}$'::text))
CHECK ((bank_account ~ '^[0-9]{6,18}$'::text))
CHECK ((length(bank_holder) <= 120))
CHECK ((bank_ifsc ~ '^[A-Z]{4}0[A-Z0-9]{6}$'::text))
CHECK ((length(bank_name) <= 80))
CHECK ((esi_no ~ '^[0-9]{10}$'::text))
CHECK ((length(nominee_name) <= 120))
CHECK ((length(nominee_relation) <= 60))
CHECK ((pan ~ '^[A-Z]{5}[0-9]{4}[A-Z]$'::text))
CHECK ((uan ~ '^[0-9]{12}$'::text))
```

</details>

<details><summary>Triggers (2)</summary>

```sql
CREATE TRIGGER trg_audit_staff_statutory AFTER INSERT OR DELETE OR UPDATE ON public.staff_statutory FOR EACH ROW EXECUTE FUNCTION app.audit_fields_only()
CREATE TRIGGER trg_touch_staff_statutory BEFORE UPDATE ON public.staff_statutory FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at()
```

</details>

<details><summary>Indexes (1)</summary>

```sql
CREATE UNIQUE INDEX staff_statutory_pkey ON public.staff_statutory USING btree (staff_member_id)
```

</details>

### Table staff_qualifications

- **Kind:** table
- **Row-level security:** enabled, 0 policies
- **Grants:** `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `users` via `created_by`, `staff_documents` via `document_id`, `schools` via `school_id`, `staff_members` via `staff_member_id`, `users` via `verified_by`
- **Written by routes:** `/api/admin/people` (select; in SQL: select; maybe: upsert), `/api/admin/people/documents` (select/update/insert/delete)
- **Read by routes:** `/api/me/employee`
- **SQL functions:** `hr_link_login()` select

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `school_id` | uuid | not null |  |
| `staff_member_id` | uuid | not null |  |
| `kind` | text | not null |  |
| `title` | text | not null |  |
| `institution` | text |  |  |
| `year` | smallint |  |  |
| `result` | text |  |  |
| `verified_on` | date |  |  |
| `verified_by` | uuid |  |  |
| `document_id` | uuid |  |  |
| `created_by` | uuid |  |  |
| `created_at` | timestamp with time zone | not null | `now()` |

<details><summary>Unique and check constraints</summary>

```sql
CHECK ((length(institution) <= 160))
CHECK ((kind = ANY (ARRAY['school'::text, 'diploma'::text, 'graduate'::text, 'postgraduate'::text, 'doctorate'::text, 'd_el_ed'::text, 'b_ed'::text, 'm_ed'::text, 'ctet'::text, 'state_tet'::text, 'net_set'::text, 'certificate'::text, 'other'::text])))
CHECK ((length(result) <= 60))
CHECK (((length(TRIM(BOTH FROM title)) >= 1) AND (length(TRIM(BOTH FROM title)) <= 120)))
CHECK (((year >= 1950) AND (year <= 2100)))
```

</details>

<details><summary>Indexes (2)</summary>

```sql
CREATE UNIQUE INDEX staff_qualifications_pkey ON public.staff_qualifications USING btree (id)
CREATE INDEX idx_staff_qualifications_member ON public.staff_qualifications USING btree (staff_member_id)
```

</details>

### Table staff_documents

- **Kind:** table
- **Row-level security:** enabled, 0 policies
- **Grants:** `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `schools` via `school_id`, `staff_members` via `staff_member_id`, `users` via `uploaded_by`
- **Referenced by:** `staff_qualifications`
- **Written by routes:** `/api/admin/people` (select; in SQL: select; maybe: upsert), `/api/admin/people/documents` (select/insert/delete)
- **Read by routes:** `/api/me/employee`
- **SQL functions:** `hr_daily()` select, `hr_link_login()` select

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `school_id` | uuid | not null |  |
| `staff_member_id` | uuid | not null |  |
| `kind` | text | not null |  |
| `title` | text | not null |  |
| `issued_on` | date |  |  |
| `expires_on` | date |  |  |
| `storage_path` | text |  |  |
| `file_name` | text |  |  |
| `mime` | text |  |  |
| `size_bytes` | integer |  |  |
| `uploaded_by` | uuid |  |  |
| `created_at` | timestamp with time zone | not null | `now()` |

<details><summary>Unique and check constraints</summary>

```sql
CHECK ((size_bytes >= 0))
CHECK (((issued_on IS NULL) OR (expires_on IS NULL) OR (expires_on >= issued_on)))
CHECK ((length(file_name) <= 200))
CHECK ((kind = ANY (ARRAY['photo'::text, 'id_proof'::text, 'address_proof'::text, 'qualification'::text, 'experience'::text, 'appointment_letter'::text, 'contract'::text, 'police_verification'::text, 'driving_licence'::text, 'medical_fitness'::text, 'bank_proof'::text, 'other'::text])))
CHECK ((length(mime) <= 100))
CHECK (((length(TRIM(BOTH FROM title)) >= 1) AND (length(TRIM(BOTH FROM title)) <= 120)))
```

</details>

<details><summary>Triggers (1)</summary>

```sql
CREATE TRIGGER trg_audit_staff_documents AFTER INSERT OR DELETE ON public.staff_documents FOR EACH ROW EXECUTE FUNCTION app.audit()
```

</details>

<details><summary>Indexes (3)</summary>

```sql
CREATE UNIQUE INDEX staff_documents_pkey ON public.staff_documents USING btree (id)
CREATE INDEX idx_staff_documents_expiry ON public.staff_documents USING btree (school_id, expires_on) WHERE (expires_on IS NOT NULL)
CREATE INDEX idx_staff_documents_member ON public.staff_documents USING btree (staff_member_id)
```

</details>

### Table staff_events

- **Kind:** table
- **Row-level security:** enabled, 0 policies
- **Grants:** `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `users` via `created_by`, `schools` via `school_id`, `staff_members` via `staff_member_id`
- **Written by routes:** `/api/admin/people` (select/insert; in SQL: select; maybe: upsert)
- **Read by routes:** `/api/me/employee`
- **SQL functions:** `hr_link_login()` select

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `school_id` | uuid | not null |  |
| `staff_member_id` | uuid | not null |  |
| `kind` | text | not null |  |
| `on_date` | date | not null |  |
| `note` | text |  |  |
| `meta` | jsonb | not null | `'{}'::jsonb` |
| `created_by` | uuid |  |  |
| `created_at` | timestamp with time zone | not null | `now()` |

<details><summary>Unique and check constraints</summary>

```sql
CHECK ((kind = ANY (ARRAY['probation_set'::text, 'probation_extended'::text, 'confirmed'::text, 'exit_started'::text, 'exit_withdrawn'::text, 'exited'::text, 'rehired'::text])))
CHECK ((length(note) <= 1000))
```

</details>

<details><summary>Indexes (2)</summary>

```sql
CREATE UNIQUE INDEX staff_events_pkey ON public.staff_events USING btree (id)
CREATE INDEX idx_staff_events_member ON public.staff_events USING btree (staff_member_id, on_date)
```

</details>

### Table staff_exits

- **Kind:** table
- **Row-level security:** enabled, 0 policies
- **Grants:** `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `users` via `closed_by`, `users` via `created_by`, `schools` via `school_id`, `staff_members` via `staff_member_id`
- **Referenced by:** `pay_runs`
- **Written by routes:** `/api/admin/people` (select/insert/update; in SQL: select; maybe: upsert)
- **Read by routes:** `/api/admin/payroll`, `/api/admin/payroll/run`
- **SQL functions:** `hr_daily()` select, `hr_link_login()` select

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `school_id` | uuid | not null |  |
| `staff_member_id` | uuid | not null |  |
| `kind` | text | not null |  |
| `notice_on` | date | not null |  |
| `last_day` | date | not null |  |
| `reason` | text |  |  |
| `checklist` | jsonb | not null | `'[]'::jsonb` |
| `status` | text | not null | `'notice'::text` |
| `login_flagged_at` | timestamp with time zone |  |  |
| `closed_by` | uuid |  |  |
| `closed_at` | timestamp with time zone |  |  |
| `created_by` | uuid |  |  |
| `created_at` | timestamp with time zone | not null | `now()` |

<details><summary>Unique and check constraints</summary>

```sql
CHECK ((last_day >= notice_on))
CHECK (((jsonb_typeof(checklist) = 'array'::text) AND (jsonb_array_length(checklist) <= 40)))
CHECK ((kind = ANY (ARRAY['resignation'::text, 'termination'::text, 'retirement'::text, 'contract_end'::text, 'absconding'::text, 'death'::text])))
CHECK ((length(reason) <= 1000))
CHECK ((status = ANY (ARRAY['notice'::text, 'completed'::text, 'withdrawn'::text])))
```

</details>

<details><summary>Triggers (1)</summary>

```sql
CREATE TRIGGER trg_audit_staff_exits AFTER INSERT OR DELETE OR UPDATE ON public.staff_exits FOR EACH ROW EXECUTE FUNCTION app.audit('kind,notice_on,last_day,status,login_flagged_at')
```

</details>

<details><summary>Indexes (3)</summary>

```sql
CREATE UNIQUE INDEX staff_exits_pkey ON public.staff_exits USING btree (id)
CREATE INDEX idx_staff_exits_school ON public.staff_exits USING btree (school_id, status)
CREATE UNIQUE INDEX uq_staff_exits_open ON public.staff_exits USING btree (staff_member_id) WHERE (status = 'notice'::text)
```

</details>

### Table hr_departments

- **Kind:** table
- **Row-level security:** enabled, 0 policies
- **Grants:** `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `staff_members` via `head_id`, `schools` via `school_id`
- **Referenced by:** `hr_posts`, `staff_jobs`, `staff_members`
- **Written by routes:** `/api/admin/people` (select/update; in SQL: select; maybe: upsert), `/api/admin/people/import` (select/insert; maybe: upsert), `/api/admin/people/structure` (insert/select; maybe: update/delete)
- **Read by routes:** `/api/admin/payroll`, `/api/admin/payroll/run`, `/api/me/employee`
- **SQL functions:** `hr_link_login()` select

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `school_id` | uuid | not null |  |
| `name` | text | not null |  |
| `kind` | text | not null | `'academic'::text` |
| `head_id` | uuid |  |  |
| `active` | boolean | not null | `true` |
| `created_at` | timestamp with time zone | not null | `now()` |
| `updated_at` | timestamp with time zone | not null | `now()` |

<details><summary>Unique and check constraints</summary>

```sql
CHECK ((kind = ANY (ARRAY['academic'::text, 'administrative'::text, 'support'::text])))
CHECK (((length(TRIM(BOTH FROM name)) >= 1) AND (length(TRIM(BOTH FROM name)) <= 80)))
```

</details>

<details><summary>Triggers (1)</summary>

```sql
CREATE TRIGGER trg_touch_hr_departments BEFORE UPDATE ON public.hr_departments FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at()
```

</details>

<details><summary>Indexes (2)</summary>

```sql
CREATE UNIQUE INDEX hr_departments_pkey ON public.hr_departments USING btree (id)
CREATE UNIQUE INDEX uq_hr_departments_name ON public.hr_departments USING btree (school_id, lower(TRIM(BOTH FROM name)))
```

</details>

### Table hr_grades

- **Kind:** table
- **Row-level security:** enabled, 0 policies
- **Grants:** `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `schools` via `school_id`
- **Referenced by:** `hr_posts`, `salary_templates`, `staff_jobs`, `staff_members`
- **Written by routes:** `/api/admin/people` (select; maybe: upsert), `/api/admin/people/import` (select/insert; maybe: upsert), `/api/admin/people/structure` (insert/select; maybe: update/delete)
- **Read by routes:** `/api/admin/payroll`, `/api/admin/payroll/run`, `/api/me/employee`

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `school_id` | uuid | not null |  |
| `name` | text | not null |  |
| `category` | text |  |  |
| `pay_min` | numeric(12,2) |  |  |
| `pay_max` | numeric(12,2) |  |  |
| `sort` | smallint | not null | `0` |
| `active` | boolean | not null | `true` |
| `created_at` | timestamp with time zone | not null | `now()` |
| `updated_at` | timestamp with time zone | not null | `now()` |

<details><summary>Unique and check constraints</summary>

```sql
CHECK ((category = ANY (ARRAY['teaching'::text, 'office'::text, 'support'::text, 'assistant'::text])))
CHECK (((pay_min IS NULL) OR (pay_max IS NULL) OR (pay_max >= pay_min)))
CHECK (((length(TRIM(BOTH FROM name)) >= 1) AND (length(TRIM(BOTH FROM name)) <= 60)))
CHECK ((pay_max >= (0)::numeric))
CHECK ((pay_min >= (0)::numeric))
```

</details>

<details><summary>Triggers (2)</summary>

```sql
CREATE TRIGGER trg_audit_hr_grades AFTER INSERT OR DELETE OR UPDATE ON public.hr_grades FOR EACH ROW EXECUTE FUNCTION app.audit('name,pay_min,pay_max,active')
CREATE TRIGGER trg_touch_hr_grades BEFORE UPDATE ON public.hr_grades FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at()
```

</details>

<details><summary>Indexes (2)</summary>

```sql
CREATE UNIQUE INDEX hr_grades_pkey ON public.hr_grades USING btree (id)
CREATE UNIQUE INDEX uq_hr_grades_name ON public.hr_grades USING btree (school_id, lower(TRIM(BOTH FROM name)))
```

</details>

### Table hr_posts

- **Kind:** table
- **Row-level security:** enabled, 0 policies
- **Grants:** `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `hr_departments` via `department_id`, `hr_grades` via `grade_id`, `schools` via `school_id`, `users` via `updated_by`
- **Written by routes:** `/api/admin/people` (select; maybe: upsert), `/api/admin/people/structure` (insert/select/delete; maybe: update/delete)

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `school_id` | uuid | not null |  |
| `department_id` | uuid | not null |  |
| `grade_id` | uuid |  |  |
| `sanctioned` | smallint | not null |  |
| `note` | text |  |  |
| `updated_by` | uuid |  |  |
| `updated_at` | timestamp with time zone | not null | `now()` |

<details><summary>Unique and check constraints</summary>

```sql
CHECK ((length(note) <= 300))
CHECK (((sanctioned >= 0) AND (sanctioned <= 2000)))
```

</details>

<details><summary>Triggers (2)</summary>

```sql
CREATE TRIGGER trg_audit_hr_posts AFTER INSERT OR DELETE OR UPDATE ON public.hr_posts FOR EACH ROW EXECUTE FUNCTION app.audit('sanctioned')
CREATE TRIGGER trg_touch_hr_posts BEFORE UPDATE ON public.hr_posts FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at()
```

</details>

<details><summary>Indexes (2)</summary>

```sql
CREATE UNIQUE INDEX hr_posts_pkey ON public.hr_posts USING btree (id)
CREATE UNIQUE INDEX uq_hr_posts ON public.hr_posts USING btree (school_id, department_id, COALESCE(grade_id, '00000000-0000-0000-0000-000000000000'::uuid))
```

</details>

### Table hr_settings

- **Kind:** table
- **Row-level security:** enabled, 0 policies
- **Grants:** `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (school_id)`
- **References:** `schools` via `school_id`, `users` via `updated_by`
- **Written by routes:** `/api/admin/people` (select; in SQL: insert/update), `/api/admin/people/structure` (upsert; maybe: update/delete)
- **SQL functions:** `hr_daily()` select, `hr_next_employee_code()` insert/update

| Column | Type | Null | Default |
|---|---|---|---|
| `school_id` | uuid | not null |  |
| `code_prefix` | text | not null | `'EMP-'::text` |
| `code_width` | smallint | not null | `4` |
| `code_last_no` | integer | not null | `0` |
| `probation_months` | smallint | not null | `6` |
| `notice_days` | smallint | not null | `30` |
| `alert_days` | smallint | not null | `30` |
| `updated_by` | uuid |  |  |
| `updated_at` | timestamp with time zone | not null | `now()` |

<details><summary>Unique and check constraints</summary>

```sql
CHECK ((code_last_no >= 0))
CHECK ((code_prefix ~ '^[A-Za-z0-9/_-]{0,12}$'::text))
CHECK (((alert_days >= 1) AND (alert_days <= 180)))
CHECK (((code_width >= 2) AND (code_width <= 8)))
CHECK (((notice_days >= 0) AND (notice_days <= 365)))
CHECK (((probation_months >= 0) AND (probation_months <= 36)))
```

</details>

<details><summary>Triggers (1)</summary>

```sql
CREATE TRIGGER trg_touch_hr_settings BEFORE UPDATE ON public.hr_settings FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at()
```

</details>

<details><summary>Indexes (1)</summary>

```sql
CREATE UNIQUE INDEX hr_settings_pkey ON public.hr_settings USING btree (school_id)
```

</details>

### Table leave_policies

- **Kind:** table
- **Row-level security:** enabled, 1 policies
- **Grants:** `authenticated` delete/insert/references/select/trigger/update; `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `schools` via `school_id`, `users` via `updated_by`
- **Written by routes:** `/api/admin/leave-policy` (upsert/delete)
- **Read by routes:** `/api/admin/leave`, `/api/staff/ask`, `/api/teacher/leave`, `/api/whatsapp/simulate`, `/api/whatsapp/webhook`
- **Read directly by pages (browser, RLS):** `/admin (layout)`, `/teacher/leave`

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `school_id` | uuid | not null |  |
| `session` | text | not null |  |
| `leave_type` | text | not null |  |
| `days_per_year` | numeric(5,1) | not null |  |
| `updated_by` | uuid |  |  |
| `updated_at` | timestamp with time zone | not null | `now()` |

<details><summary>Unique and check constraints</summary>

```sql
UNIQUE UNIQUE (school_id, session, leave_type)
CHECK (((days_per_year >= (0)::numeric) AND (days_per_year <= (366)::numeric)))
CHECK ((leave_type = ANY (ARRAY['casual'::text, 'sick'::text, 'earned'::text, 'duty'::text, 'maternity'::text, 'paternity'::text, 'unpaid'::text])))
CHECK ((session ~ '^\d{4}-\d{2}$'::text))
```

</details>

<details><summary>RLS policies (1)</summary>

- **leave_policies_read** · SELECT · authenticated
  - USING `((( SELECT app.is_staff() AS is_staff) AND (school_id = ( SELECT app.current_school_id() AS current_school_id))) OR ( SELECT app.is_superadmin() AS is_superadmin))`

</details>

<details><summary>Triggers (2)</summary>

```sql
CREATE TRIGGER trg_audit_leave_policies AFTER INSERT OR DELETE OR UPDATE ON public.leave_policies FOR EACH ROW EXECUTE FUNCTION app.audit()
CREATE TRIGGER trg_touch_leave_policies BEFORE UPDATE ON public.leave_policies FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at()
```

</details>

<details><summary>Indexes (2)</summary>

```sql
CREATE UNIQUE INDEX leave_policies_pkey ON public.leave_policies USING btree (id)
CREATE UNIQUE INDEX leave_policies_school_id_session_leave_type_key ON public.leave_policies USING btree (school_id, session, leave_type)
```

</details>

### Table leave_requests

- **Kind:** table
- **Row-level security:** enabled, 1 policies
- **Grants:** `authenticated` delete/insert/references/select/trigger/update; `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `users` via `decided_by`, `users` via `entered_by`, `schools` via `school_id`, `users` via `staff_id`, `staff_members` via `staff_member_id`
- **Written by routes:** `/api/admin/attendance` (select/insert; maybe: delete), `/api/admin/leave` (select/update), `/api/admin/people` (in SQL: update), `/api/teacher/leave` (select/insert/update), `/api/whatsapp/simulate` (select/insert), `/api/whatsapp/webhook` (select/insert)
- **Read by routes:** `/api/admin/payroll/run`, `/api/admin/schedule/cover`, `/api/admin/schedule/duties`, `/api/feed`, `/api/ops/delivery`, `/api/ops/overview`, `/api/ops/schools`, `/api/ops/schools/[id]`, `/api/staff/ask`
- **Read directly by pages (browser, RLS):** `/admin (layout)`, `/admin/schedule`, `/teacher/leave`, `/teacher/schedule`
- **SQL functions:** `hr_link_login()` update, `ops_school_metrics()` select

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `school_id` | uuid | not null |  |
| `staff_id` | uuid |  |  |
| `leave_type` | text | not null |  |
| `from_date` | date | not null |  |
| `to_date` | date | not null |  |
| `half_day` | boolean | not null | `false` |
| `reason` | text | not null |  |
| `status` | text | not null | `'pending'::text` |
| `decided_by` | uuid |  |  |
| `decided_at` | timestamp with time zone |  |  |
| `decision_note` | text |  |  |
| `created_at` | timestamp with time zone | not null | `now()` |
| `updated_at` | timestamp with time zone | not null | `now()` |
| `staff_member_id` | uuid |  |  |
| `source` | text | not null | `'app'::text` |
| `entered_by` | uuid |  |  |

<details><summary>Unique and check constraints</summary>

```sql
CHECK ((to_date >= from_date))
CHECK (((NOT half_day) OR (to_date = from_date)))
CHECK (((status <> 'rejected'::text) OR (decision_note IS NOT NULL)))
CHECK (((decision_note IS NULL) OR (char_length(decision_note) <= 1000)))
CHECK ((leave_type = ANY (ARRAY['casual'::text, 'sick'::text, 'earned'::text, 'duty'::text, 'maternity'::text, 'paternity'::text, 'unpaid'::text, 'compensatory'::text])))
CHECK ((num_nonnulls(staff_id, staff_member_id) = 1))
CHECK (((char_length(reason) >= 1) AND (char_length(reason) <= 1000)))
CHECK ((source = ANY (ARRAY['app'::text, 'office'::text, 'whatsapp'::text])))
CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'cancelled'::text])))
```

</details>

<details><summary>RLS policies (1)</summary>

- **leave_requests_read** · SELECT · authenticated
  - USING `((staff_id = ( SELECT auth.uid() AS uid)) OR (( SELECT app.has_perm('workforce.read'::text) AS has_perm) AND (school_id = ( SELECT app.current_school_id() AS current_school_id))) OR ( SELECT app.is_superadmin() AS is_superadmin))`

</details>

<details><summary>Triggers (2)</summary>

```sql
CREATE TRIGGER trg_audit_leave_requests AFTER INSERT OR DELETE OR UPDATE ON public.leave_requests FOR EACH ROW EXECUTE FUNCTION app.audit()
CREATE TRIGGER trg_touch_leave_requests BEFORE UPDATE ON public.leave_requests FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at()
```

</details>

<details><summary>Indexes (4)</summary>

```sql
CREATE UNIQUE INDEX leave_requests_pkey ON public.leave_requests USING btree (id)
CREATE INDEX idx_leave_requests_member ON public.leave_requests USING btree (staff_member_id, from_date DESC) WHERE (staff_member_id IS NOT NULL)
CREATE INDEX idx_leave_requests_school ON public.leave_requests USING btree (school_id, status, from_date)
CREATE INDEX idx_leave_requests_staff ON public.leave_requests USING btree (staff_id, from_date DESC)
```

</details>

### Table comp_off_grants

- **Kind:** table
- **Row-level security:** enabled, 1 policies
- **Grants:** `authenticated` select; `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `users` via `granted_by`, `users` via `revoked_by`, `schools` via `school_id`, `staff_members` via `staff_member_id`, `users` via `user_id`
- **Written by routes:** `/api/admin/schedule/compoff` (select/insert/update)
- **Read by routes:** `/api/admin/leave`, `/api/admin/payroll/run`, `/api/admin/schedule/cover`, `/api/admin/schedule/duties`, `/api/feed`, `/api/teacher/leave`, `/api/whatsapp/simulate`, `/api/whatsapp/webhook`
- **Read directly by pages (browser, RLS):** `/admin/schedule`, `/teacher/leave`, `/teacher/schedule`

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `school_id` | uuid | not null |  |
| `user_id` | uuid |  |  |
| `staff_member_id` | uuid |  |  |
| `days` | numeric(2,1) | not null |  |
| `duty_on` | date | not null |  |
| `source` | text | not null |  |
| `source_id` | uuid |  |  |
| `note` | text | not null |  |
| `granted_by` | uuid |  |  |
| `granted_at` | timestamp with time zone | not null | `now()` |
| `revoked_at` | timestamp with time zone |  |  |
| `revoked_by` | uuid |  |  |

<details><summary>Unique and check constraints</summary>

```sql
CHECK ((num_nonnulls(user_id, staff_member_id) = 1))
CHECK ((days = ANY (ARRAY[0.5, (1)::numeric])))
CHECK (((length(TRIM(BOTH FROM note)) >= 1) AND (length(TRIM(BOTH FROM note)) <= 500)))
CHECK ((source = ANY (ARRAY['roster'::text, 'duty'::text, 'cover'::text, 'other'::text])))
```

</details>

<details><summary>RLS policies (1)</summary>

- **comp_off_grants_read** · SELECT · authenticated
  - USING `((user_id = ( SELECT auth.uid() AS uid)) OR ((school_id = ( SELECT app.current_school_id() AS current_school_id)) AND (( SELECT app.has_perm('schedule.workforce'::text) AS has_perm) OR ( SELECT app.has_perm('workforce.read'::text) AS has_perm) OR ( SELECT app.has_perm('leave.approve'::text) AS has_perm))) OR ( SELECT app.is_superadmin() AS is_superadmin))`

</details>

<details><summary>Triggers (1)</summary>

```sql
CREATE TRIGGER trg_audit_comp_off_grants AFTER INSERT OR DELETE OR UPDATE ON public.comp_off_grants FOR EACH ROW EXECUTE FUNCTION app.audit('days,revoked_at')
```

</details>

<details><summary>Indexes (2)</summary>

```sql
CREATE UNIQUE INDEX comp_off_grants_pkey ON public.comp_off_grants USING btree (id)
CREATE INDEX idx_comp_off_school ON public.comp_off_grants USING btree (school_id, duty_on)
```

</details>

### Table staff_absences

- **Kind:** table
- **Row-level security:** enabled, 1 policies
- **Grants:** `authenticated` select; `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `users` via `confirmed_by`, `users` via `created_by`, `schools` via `school_id`, `staff_members` via `staff_member_id`, `users` via `user_id`
- **Written by routes:** `/api/admin/schedule/cover` (insert/select/update), `/api/whatsapp/simulate` (select/insert), `/api/whatsapp/webhook` (select/insert)
- **Read by routes:** `/api/admin/attendance`, `/api/admin/payroll/run`, `/api/admin/schedule/duties`, `/api/feed`, `/api/ops/delivery`
- **Read directly by pages (browser, RLS):** `/admin/schedule`, `/teacher/schedule`

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `school_id` | uuid | not null |  |
| `user_id` | uuid |  |  |
| `staff_member_id` | uuid |  |  |
| `on_date` | date | not null |  |
| `kind` | text | not null | `'absent'::text` |
| `portion` | text | not null | `'full'::text` |
| `period_nos` | smallint[] | not null | `'{}'::smallint[]` |
| `reason` | text |  |  |
| `status` | text | not null | `'confirmed'::text` |
| `source` | text | not null | `'office'::text` |
| `created_by` | uuid |  |  |
| `confirmed_by` | uuid |  |  |
| `confirmed_at` | timestamp with time zone |  |  |
| `created_at` | timestamp with time zone | not null | `now()` |

<details><summary>Unique and check constraints</summary>

```sql
CHECK ((num_nonnulls(user_id, staff_member_id) = 1))
CHECK (((portion <> 'periods'::text) OR (cardinality(period_nos) > 0)))
CHECK (((kind <> 'release'::text) OR (portion = 'periods'::text)))
CHECK ((kind = ANY (ARRAY['absent'::text, 'release'::text])))
CHECK ((period_nos <@ ARRAY[(1)::smallint, (2)::smallint, (3)::smallint, (4)::smallint, (5)::smallint, (6)::smallint, (7)::smallint, (8)::smallint, (9)::smallint, (10)::smallint, (11)::smallint, (12)::smallint, (13)::smallint, (14)::smallint, (15)::smallint, (16)::smallint]))
CHECK ((portion = ANY (ARRAY['full'::text, 'am'::text, 'pm'::text, 'periods'::text])))
CHECK ((length(reason) <= 500))
CHECK ((source = ANY (ARRAY['office'::text, 'whatsapp'::text])))
CHECK ((status = ANY (ARRAY['reported'::text, 'confirmed'::text, 'cancelled'::text])))
```

</details>

<details><summary>RLS policies (1)</summary>

- **staff_absences_read** · SELECT · authenticated
  - USING `((user_id = ( SELECT auth.uid() AS uid)) OR ((school_id = ( SELECT app.current_school_id() AS current_school_id)) AND (( SELECT app.has_perm('schedule.academic'::text) AS has_perm) OR ( SELECT app.has_perm('schedule.workforce'::text) AS has_perm) OR ( SELECT app.has_perm('workforce.read'::text) AS has_perm))) OR ( SELECT app.is_superadmin() AS is_superadmin))`

</details>

<details><summary>Triggers (1)</summary>

```sql
CREATE TRIGGER trg_audit_staff_absences AFTER INSERT OR DELETE OR UPDATE ON public.staff_absences FOR EACH ROW EXECUTE FUNCTION app.audit('status,portion,period_nos')
```

</details>

<details><summary>Indexes (2)</summary>

```sql
CREATE UNIQUE INDEX staff_absences_pkey ON public.staff_absences USING btree (id)
CREATE INDEX idx_staff_absences_school_date ON public.staff_absences USING btree (school_id, on_date)
```

</details>

### Table attendance_settings

- **Kind:** table
- **Row-level security:** enabled, 1 policies
- **Grants:** `authenticated` select; `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (school_id)`
- **References:** `schools` via `school_id`, `users` via `updated_by`
- **Written by routes:** `/api/admin/attendance` (upsert/select; maybe: delete)
- **Read by routes:** `/api/me/attendance`, `/api/ops/delivery`
- **Read directly by pages (browser, RLS):** `/admin/schedule`, `/teacher/schedule`

| Column | Type | Null | Default |
|---|---|---|---|
| `school_id` | uuid | not null |  |
| `teacher_start` | time without time zone | not null | `'07:45:00'::time without time zone` |
| `teacher_end` | time without time zone | not null | `'15:00:00'::time without time zone` |
| `office_start` | time without time zone | not null | `'09:00:00'::time without time zone` |
| `office_end` | time without time zone | not null | `'17:00:00'::time without time zone` |
| `grace_min` | smallint | not null | `10` |
| `lates_rule` | boolean | not null | `true` |
| `lates_per_half_day` | smallint | not null | `3` |
| `short_rule` | boolean | not null | `true` |
| `min_full_hours` | numeric(4,2) | not null | `6` |
| `absent_rule` | boolean | not null | `true` |
| `geofence_lat` | numeric(9,6) |  |  |
| `geofence_lng` | numeric(9,6) |  |  |
| `geofence_radius_m` | integer | not null | `200` |
| `noshow_alerts` | boolean | not null | `true` |
| `updated_by` | uuid |  |  |
| `updated_at` | timestamp with time zone | not null | `now()` |

<details><summary>Unique and check constraints</summary>

```sql
CHECK (((teacher_end > teacher_start) AND (office_end > office_start)))
CHECK (((geofence_lat >= ('-90'::integer)::numeric) AND (geofence_lat <= (90)::numeric)))
CHECK (((geofence_lng >= ('-180'::integer)::numeric) AND (geofence_lng <= (180)::numeric)))
CHECK (((geofence_radius_m >= 50) AND (geofence_radius_m <= 5000)))
CHECK (((grace_min >= 0) AND (grace_min <= 120)))
CHECK (((lates_per_half_day >= 1) AND (lates_per_half_day <= 31)))
CHECK (((min_full_hours >= (1)::numeric) AND (min_full_hours <= (16)::numeric)))
```

</details>

<details><summary>RLS policies (1)</summary>

- **attendance_settings_read** · SELECT · authenticated
  - USING `((( SELECT app.is_staff() AS is_staff) AND (school_id = ( SELECT app.current_school_id() AS current_school_id))) OR ( SELECT app.is_superadmin() AS is_superadmin))`

</details>

<details><summary>Triggers (1)</summary>

```sql
CREATE TRIGGER trg_audit_attendance_settings AFTER INSERT OR UPDATE ON public.attendance_settings FOR EACH ROW EXECUTE FUNCTION app.audit()
```

</details>

<details><summary>Indexes (1)</summary>

```sql
CREATE UNIQUE INDEX attendance_settings_pkey ON public.attendance_settings USING btree (school_id)
```

</details>

### Table attendance_devices

- **Kind:** table
- **Row-level security:** enabled, 1 policies
- **Grants:** `authenticated` select; `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `users` via `created_by`, `schools` via `school_id`
- **Referenced by:** `staff_punches`
- **Written by routes:** `/api/admin/attendance` (select/insert/update; maybe: delete), `/api/attendance/device` (select/update)
- **Read by routes:** `/api/ops/delivery`
- **Read directly by pages (browser, RLS):** `/admin/schedule`, `/teacher/schedule`

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `school_id` | uuid | not null |  |
| `name` | text | not null |  |
| `vendor` | text |  |  |
| `token_hash` | text | not null |  |
| `active` | boolean | not null | `true` |
| `last_seen_at` | timestamp with time zone |  |  |
| `created_by` | uuid |  |  |
| `created_at` | timestamp with time zone | not null | `now()` |

<details><summary>Unique and check constraints</summary>

```sql
UNIQUE UNIQUE (token_hash)
CHECK (((length(TRIM(BOTH FROM name)) >= 1) AND (length(TRIM(BOTH FROM name)) <= 80)))
CHECK ((length(vendor) <= 60))
```

</details>

<details><summary>RLS policies (1)</summary>

- **attendance_devices_read** · SELECT · authenticated
  - USING `(((school_id = ( SELECT app.current_school_id() AS current_school_id)) AND ( SELECT app.has_perm('schedule.workforce'::text) AS has_perm)) OR ( SELECT app.is_superadmin() AS is_superadmin))`

</details>

<details><summary>Indexes (2)</summary>

```sql
CREATE UNIQUE INDEX attendance_devices_pkey ON public.attendance_devices USING btree (id)
CREATE UNIQUE INDEX attendance_devices_token_hash_key ON public.attendance_devices USING btree (token_hash)
```

</details>

### Table attendance_month_reviews

- **Kind:** table
- **Row-level security:** enabled, 1 policies
- **Grants:** `authenticated` select; `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `users` via `confirmed_by`, `schools` via `school_id`, `staff_members` via `staff_member_id`, `users` via `user_id`
- **Written by routes:** `/api/admin/attendance` (select/delete/insert; maybe: delete)
- **Read by routes:** `/api/admin/payroll/run`, `/api/ops/delivery`
- **Read directly by pages (browser, RLS):** `/admin/schedule`, `/teacher/schedule`

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `school_id` | uuid | not null |  |
| `user_id` | uuid |  |  |
| `staff_member_id` | uuid |  |  |
| `month` | date | not null |  |
| `status` | text | not null | `'confirmed'::text` |
| `summary` | jsonb | not null |  |
| `waived` | text[] | not null | `'{}'::text[]` |
| `lop_days` | numeric(5,1) | not null | `0` |
| `note` | text |  |  |
| `confirmed_by` | uuid |  |  |
| `confirmed_at` | timestamp with time zone | not null | `now()` |

<details><summary>Unique and check constraints</summary>

```sql
CHECK ((num_nonnulls(user_id, staff_member_id) = 1))
CHECK ((lop_days >= (0)::numeric))
CHECK ((EXTRACT(day FROM month) = (1)::numeric))
CHECK ((length(note) <= 1000))
CHECK ((status = 'confirmed'::text))
```

</details>

<details><summary>RLS policies (1)</summary>

- **attendance_month_reviews_read** · SELECT · authenticated
  - USING `((user_id = ( SELECT auth.uid() AS uid)) OR ((school_id = ( SELECT app.current_school_id() AS current_school_id)) AND (( SELECT app.has_perm('schedule.workforce'::text) AS has_perm) OR ( SELECT app.has_perm('workforce.read'::text) AS has_perm) OR ( SELECT app.has_perm('schedule.academic'::text) AS has_perm))) OR ( SELECT app.is_superadmin() AS is_superadmin))`

</details>

<details><summary>Triggers (1)</summary>

```sql
CREATE TRIGGER trg_audit_month_reviews AFTER INSERT OR DELETE OR UPDATE ON public.attendance_month_reviews FOR EACH ROW EXECUTE FUNCTION app.audit('lop_days,waived')
```

</details>

<details><summary>Indexes (3)</summary>

```sql
CREATE UNIQUE INDEX attendance_month_reviews_pkey ON public.attendance_month_reviews USING btree (id)
CREATE UNIQUE INDEX uq_review_staff ON public.attendance_month_reviews USING btree (staff_member_id, month) WHERE (staff_member_id IS NOT NULL)
CREATE UNIQUE INDEX uq_review_user ON public.attendance_month_reviews USING btree (user_id, month) WHERE (user_id IS NOT NULL)
```

</details>

### Table shifts

- **Kind:** table
- **Row-level security:** enabled, 1 policies
- **Grants:** `authenticated` select; `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `schools` via `school_id`
- **Referenced by:** `shift_overrides`, `staff_shift_plans`
- **Written by routes:** `/api/admin/attendance` (update/insert/select; maybe: delete)
- **Read by routes:** `/api/ops/delivery`
- **Read directly by pages (browser, RLS):** `/admin/schedule`, `/teacher/schedule`

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `school_id` | uuid | not null |  |
| `name` | text | not null |  |
| `starts_at` | time without time zone | not null |  |
| `ends_at` | time without time zone | not null |  |
| `active` | boolean | not null | `true` |
| `created_at` | timestamp with time zone | not null | `now()` |

<details><summary>Unique and check constraints</summary>

```sql
UNIQUE UNIQUE (school_id, name)
CHECK ((ends_at <> starts_at))
CHECK (((length(TRIM(BOTH FROM name)) >= 1) AND (length(TRIM(BOTH FROM name)) <= 60)))
```

</details>

<details><summary>RLS policies (1)</summary>

- **shifts_read** · SELECT · authenticated
  - USING `((( SELECT app.is_staff() AS is_staff) AND (school_id = ( SELECT app.current_school_id() AS current_school_id))) OR ( SELECT app.is_superadmin() AS is_superadmin))`

</details>

<details><summary>Indexes (2)</summary>

```sql
CREATE UNIQUE INDEX shifts_pkey ON public.shifts USING btree (id)
CREATE UNIQUE INDEX shifts_school_id_name_key ON public.shifts USING btree (school_id, name)
```

</details>

### Table staff_shift_plans

- **Kind:** table
- **Row-level security:** enabled, 1 policies
- **Grants:** `authenticated` select; `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `schools` via `school_id`, `shifts` via `shift_id`, `staff_members` via `staff_member_id`, `users` via `updated_by`, `users` via `user_id`
- **Written by routes:** `/api/admin/attendance` (select/update/insert; maybe: delete)
- **Read by routes:** `/api/ops/delivery`
- **Read directly by pages (browser, RLS):** `/admin/schedule`, `/teacher/schedule`

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `school_id` | uuid | not null |  |
| `user_id` | uuid |  |  |
| `staff_member_id` | uuid |  |  |
| `mode` | text | not null | `'fixed'::text` |
| `shift_id` | uuid |  |  |
| `rotation` | uuid[] | not null | `'{}'::uuid[]` |
| `off_mode` | text | not null | `'fixed'::text` |
| `off_days` | smallint[] | not null | `'{7}'::smallint[]` |
| `off_cycle` | smallint[] | not null | `'{}'::smallint[]` |
| `anchor_date` | date | not null | `CURRENT_DATE` |
| `works_holidays` | boolean | not null | `false` |
| `rules_exempt` | boolean | not null | `false` |
| `grace_min` | smallint |  |  |
| `note` | text |  |  |
| `updated_by` | uuid |  |  |
| `updated_at` | timestamp with time zone | not null | `now()` |

<details><summary>Unique and check constraints</summary>

```sql
CHECK ((num_nonnulls(user_id, staff_member_id) = 1))
CHECK (((mode <> 'fixed'::text) OR (shift_id IS NOT NULL)))
CHECK (((mode <> 'rotating'::text) OR (cardinality(rotation) > 0)))
CHECK (((off_mode <> 'rotating'::text) OR (cardinality(off_cycle) > 0)))
CHECK (((off_days <@ ARRAY[(1)::smallint, (2)::smallint, (3)::smallint, (4)::smallint, (5)::smallint, (6)::smallint, (7)::smallint]) AND (off_cycle <@ ARRAY[(1)::smallint, (2)::smallint, (3)::smallint, (4)::smallint, (5)::smallint, (6)::smallint, (7)::smallint])))
CHECK (((grace_min >= 0) AND (grace_min <= 120)))
CHECK ((mode = ANY (ARRAY['fixed'::text, 'rotating'::text])))
CHECK ((length(note) <= 500))
CHECK ((off_mode = ANY (ARRAY['fixed'::text, 'rotating'::text, 'none'::text])))
```

</details>

<details><summary>RLS policies (1)</summary>

- **staff_shift_plans_read** · SELECT · authenticated
  - USING `((user_id = ( SELECT auth.uid() AS uid)) OR ((school_id = ( SELECT app.current_school_id() AS current_school_id)) AND (( SELECT app.has_perm('schedule.workforce'::text) AS has_perm) OR ( SELECT app.has_perm('workforce.read'::text) AS has_perm) OR ( SELECT app.has_perm('schedule.academic'::text) AS has_perm))) OR ( SELECT app.is_superadmin() AS is_superadmin))`

</details>

<details><summary>Triggers (1)</summary>

```sql
CREATE TRIGGER trg_audit_shift_plans AFTER INSERT OR DELETE OR UPDATE ON public.staff_shift_plans FOR EACH ROW EXECUTE FUNCTION app.audit('mode,shift_id,rotation,off_mode,off_days,off_cycle,rules_exempt,grace_min')
```

</details>

<details><summary>Indexes (4)</summary>

```sql
CREATE UNIQUE INDEX staff_shift_plans_pkey ON public.staff_shift_plans USING btree (id)
CREATE INDEX idx_shift_plans_school ON public.staff_shift_plans USING btree (school_id)
CREATE UNIQUE INDEX uq_shift_plans_staff ON public.staff_shift_plans USING btree (staff_member_id) WHERE (staff_member_id IS NOT NULL)
CREATE UNIQUE INDEX uq_shift_plans_user ON public.staff_shift_plans USING btree (user_id) WHERE (user_id IS NOT NULL)
```

</details>

### Table shift_overrides

- **Kind:** table
- **Row-level security:** enabled, 1 policies
- **Grants:** `authenticated` select; `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `users` via `created_by`, `schools` via `school_id`, `shifts` via `shift_id`, `staff_members` via `staff_member_id`, `users` via `user_id`
- **Written by routes:** `/api/admin/attendance` (delete/insert/select; maybe: delete)
- **Read by routes:** `/api/ops/delivery`
- **Read directly by pages (browser, RLS):** `/admin/schedule`, `/teacher/schedule`

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `school_id` | uuid | not null |  |
| `user_id` | uuid |  |  |
| `staff_member_id` | uuid |  |  |
| `on_date` | date | not null |  |
| `kind` | text | not null |  |
| `shift_id` | uuid |  |  |
| `swap_group` | uuid |  |  |
| `reason` | text | not null |  |
| `created_by` | uuid |  |  |
| `created_at` | timestamp with time zone | not null | `now()` |

<details><summary>Unique and check constraints</summary>

```sql
CHECK ((num_nonnulls(user_id, staff_member_id) = 1))
CHECK (((kind <> 'shift'::text) OR (shift_id IS NOT NULL)))
CHECK ((kind = ANY (ARRAY['shift'::text, 'off'::text, 'work'::text])))
CHECK (((length(TRIM(BOTH FROM reason)) >= 1) AND (length(TRIM(BOTH FROM reason)) <= 300)))
```

</details>

<details><summary>RLS policies (1)</summary>

- **shift_overrides_read** · SELECT · authenticated
  - USING `((user_id = ( SELECT auth.uid() AS uid)) OR ((school_id = ( SELECT app.current_school_id() AS current_school_id)) AND (( SELECT app.has_perm('schedule.workforce'::text) AS has_perm) OR ( SELECT app.has_perm('workforce.read'::text) AS has_perm) OR ( SELECT app.has_perm('schedule.academic'::text) AS has_perm))) OR ( SELECT app.is_superadmin() AS is_superadmin))`

</details>

<details><summary>Indexes (4)</summary>

```sql
CREATE UNIQUE INDEX shift_overrides_pkey ON public.shift_overrides USING btree (id)
CREATE INDEX idx_shift_overrides_school ON public.shift_overrides USING btree (school_id, on_date)
CREATE UNIQUE INDEX uq_shift_overrides_staff ON public.shift_overrides USING btree (staff_member_id, on_date) WHERE (staff_member_id IS NOT NULL)
CREATE UNIQUE INDEX uq_shift_overrides_user ON public.shift_overrides USING btree (user_id, on_date) WHERE (user_id IS NOT NULL)
```

</details>

### Table staff_punches

- **Kind:** table
- **Row-level security:** enabled, 1 policies
- **Grants:** `authenticated` select; `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `users` via `created_by`, `attendance_devices` via `device_id`, `schools` via `school_id`, `staff_members` via `staff_member_id`, `users` via `user_id`
- **Written by routes:** `/api/admin/attendance` (select/insert), `/api/attendance/device` (select/insert), `/api/me/attendance` (insert), `/api/whatsapp/simulate` (insert/select), `/api/whatsapp/webhook` (insert/select)
- **Read by routes:** `/api/admin/payroll/run`, `/api/feed`, `/api/ops/delivery`
- **Read directly by pages (browser, RLS):** `/admin/schedule`, `/teacher/schedule`

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `school_id` | uuid | not null |  |
| `user_id` | uuid |  |  |
| `staff_member_id` | uuid |  |  |
| `at` | timestamp with time zone | not null |  |
| `direction` | text | not null | `'unknown'::text` |
| `source` | text | not null |  |
| `on_campus` | boolean |  |  |
| `device_id` | uuid |  |  |
| `created_by` | uuid |  |  |
| `created_at` | timestamp with time zone | not null | `now()` |

<details><summary>Unique and check constraints</summary>

```sql
CHECK ((num_nonnulls(user_id, staff_member_id) = 1))
CHECK ((direction = ANY (ARRAY['in'::text, 'out'::text, 'unknown'::text])))
CHECK ((source = ANY (ARRAY['biometric'::text, 'app'::text, 'whatsapp'::text])))
```

</details>

<details><summary>RLS policies (1)</summary>

- **staff_punches_read** · SELECT · authenticated
  - USING `((user_id = ( SELECT auth.uid() AS uid)) OR ((school_id = ( SELECT app.current_school_id() AS current_school_id)) AND (( SELECT app.has_perm('schedule.workforce'::text) AS has_perm) OR ( SELECT app.has_perm('workforce.read'::text) AS has_perm) OR ( SELECT app.has_perm('schedule.academic'::text) AS has_perm))) OR ( SELECT app.is_superadmin() AS is_superadmin))`

</details>

<details><summary>Indexes (4)</summary>

```sql
CREATE UNIQUE INDEX staff_punches_pkey ON public.staff_punches USING btree (id)
CREATE INDEX idx_punches_school_at ON public.staff_punches USING btree (school_id, at)
CREATE UNIQUE INDEX uq_punch_staff ON public.staff_punches USING btree (staff_member_id, at, source) WHERE (staff_member_id IS NOT NULL)
CREATE UNIQUE INDEX uq_punch_user ON public.staff_punches USING btree (user_id, at, source) WHERE (user_id IS NOT NULL)
```

</details>

### Table staff_day_marks

- **Kind:** table
- **Row-level security:** enabled, 1 policies
- **Grants:** `authenticated` select; `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `users` via `created_by`, `schools` via `school_id`, `staff_members` via `staff_member_id`, `users` via `user_id`
- **Written by routes:** `/api/admin/attendance` (delete/insert/select; maybe: delete)
- **Read by routes:** `/api/admin/payroll/run`, `/api/ops/delivery`
- **Read directly by pages (browser, RLS):** `/admin/schedule`, `/teacher/schedule`

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `school_id` | uuid | not null |  |
| `user_id` | uuid |  |  |
| `staff_member_id` | uuid |  |  |
| `on_date` | date | not null |  |
| `status` | text | not null |  |
| `in_at` | time without time zone |  |  |
| `out_at` | time without time zone |  |  |
| `source` | text | not null |  |
| `reason` | text |  |  |
| `created_by` | uuid |  |  |
| `updated_at` | timestamp with time zone | not null | `now()` |

<details><summary>Unique and check constraints</summary>

```sql
CHECK ((num_nonnulls(user_id, staff_member_id) = 1))
CHECK (((source <> 'override'::text) OR (length(TRIM(BOTH FROM COALESCE(reason, ''::text))) > 0)))
CHECK ((length(reason) <= 300))
CHECK ((source = ANY (ARRAY['register'::text, 'override'::text])))
CHECK ((status = ANY (ARRAY['present'::text, 'absent'::text, 'half_day'::text, 'off'::text])))
```

</details>

<details><summary>RLS policies (1)</summary>

- **staff_day_marks_read** · SELECT · authenticated
  - USING `((user_id = ( SELECT auth.uid() AS uid)) OR ((school_id = ( SELECT app.current_school_id() AS current_school_id)) AND (( SELECT app.has_perm('schedule.workforce'::text) AS has_perm) OR ( SELECT app.has_perm('workforce.read'::text) AS has_perm) OR ( SELECT app.has_perm('schedule.academic'::text) AS has_perm))) OR ( SELECT app.is_superadmin() AS is_superadmin))`

</details>

<details><summary>Triggers (1)</summary>

```sql
CREATE TRIGGER trg_audit_staff_day_marks AFTER INSERT OR DELETE OR UPDATE ON public.staff_day_marks FOR EACH ROW EXECUTE FUNCTION app.audit('status,in_at,out_at,reason')
```

</details>

<details><summary>Indexes (4)</summary>

```sql
CREATE UNIQUE INDEX staff_day_marks_pkey ON public.staff_day_marks USING btree (id)
CREATE INDEX idx_marks_school_date ON public.staff_day_marks USING btree (school_id, on_date)
CREATE UNIQUE INDEX uq_marks_staff ON public.staff_day_marks USING btree (staff_member_id, on_date) WHERE (staff_member_id IS NOT NULL)
CREATE UNIQUE INDEX uq_marks_user ON public.staff_day_marks USING btree (user_id, on_date) WHERE (user_id IS NOT NULL)
```

</details>

### Table staff_noshow_alerts

- **Kind:** table
- **Row-level security:** enabled, 0 policies
- **Grants:** `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (user_id, on_date)`
- **References:** `schools` via `school_id`, `users` via `user_id`
- **Written by routes:** `/api/admin/attendance` (select/insert), `/api/ops/delivery` (select/insert)

| Column | Type | Null | Default |
|---|---|---|---|
| `school_id` | uuid | not null |  |
| `user_id` | uuid | not null |  |
| `on_date` | date | not null |  |
| `alerted_at` | timestamp with time zone | not null | `now()` |

<details><summary>Indexes (1)</summary>

```sql
CREATE UNIQUE INDEX staff_noshow_alerts_pkey ON public.staff_noshow_alerts USING btree (user_id, on_date)
```

</details>

## Payroll

### Table pay_items

- **Kind:** table
- **Row-level security:** enabled, 0 policies
- **Grants:** `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `schools` via `school_id`
- **Referenced by:** `pay_adjustments`
- **Written by routes:** `/api/admin/payroll` (select/insert/update/delete)
- **Read by routes:** `/api/admin/payroll/run`

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `school_id` | uuid | not null |  |
| `code` | text | not null |  |
| `name` | text | not null |  |
| `kind` | text | not null |  |
| `calc` | text | not null |  |
| `percent_of` | text |  |  |
| `count_source` | text |  |  |
| `threshold` | numeric(8,2) | not null | `0` |
| `default_value` | numeric(12,2) | not null | `0` |
| `role` | text |  |  |
| `taxable` | boolean | not null | `true` |
| `pf_wage` | boolean | not null | `false` |
| `esi_wage` | boolean | not null | `true` |
| `prorate` | boolean | not null | `true` |
| `sort` | smallint | not null | `0` |
| `active` | boolean | not null | `true` |
| `created_at` | timestamp with time zone | not null | `now()` |
| `updated_at` | timestamp with time zone | not null | `now()` |

<details><summary>Unique and check constraints</summary>

```sql
UNIQUE UNIQUE (school_id, code)
CHECK ((kind = ANY (ARRAY['earning'::text, 'deduction'::text])))
CHECK ((calc = ANY (ARRAY['fixed'::text, 'percent'::text, 'rate_count'::text])))
CHECK (((calc <> 'percent'::text) OR (percent_of IS NOT NULL)))
CHECK (((calc <> 'rate_count'::text) OR (count_source IS NOT NULL)))
CHECK ((code ~ '^[A-Z0-9_]{1,16}$'::text))
CHECK ((count_source = ANY (ARRAY['sessions'::text, 'duties'::text, 'duty_hours'::text, 'invigilation'::text, 'event_duty'::text, 'covers'::text, 'lessons'::text])))
CHECK ((default_value >= (0)::numeric))
CHECK (((length(TRIM(BOTH FROM name)) >= 1) AND (length(TRIM(BOTH FROM name)) <= 60)))
CHECK ((percent_of = ANY (ARRAY['basic'::text, 'basic_da'::text, 'gross'::text])))
CHECK ((role = ANY (ARRAY['basic'::text, 'da'::text, 'hra'::text])))
CHECK ((threshold >= (0)::numeric))
```

</details>

<details><summary>Triggers (2)</summary>

```sql
CREATE TRIGGER trg_audit_pay_items AFTER INSERT OR DELETE OR UPDATE ON public.pay_items FOR EACH ROW EXECUTE FUNCTION app.audit('name,calc,percent_of,count_source,threshold,taxable,pf_wage,esi_wage,prorate,active')
CREATE TRIGGER trg_touch_pay_items BEFORE UPDATE ON public.pay_items FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at()
```

</details>

<details><summary>Indexes (2)</summary>

```sql
CREATE UNIQUE INDEX pay_items_pkey ON public.pay_items USING btree (id)
CREATE UNIQUE INDEX pay_items_school_id_code_key ON public.pay_items USING btree (school_id, code)
```

</details>

### Table pay_runs

- **Kind:** table
- **Row-level security:** enabled, 0 policies
- **Grants:** `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `users` via `approved_by`, `users` via `computed_by`, `staff_exits` via `exit_id`, `schools` via `school_id`, `staff_members` via `staff_member_id`, `users` via `submitted_by`
- **Referenced by:** `loan_recoveries`, `pay_run_lines`
- **Written by routes:** `/api/admin/payroll/run` (select/insert/update/delete; in SQL: select/update)
- **Read by routes:** `/api/admin/payroll`, `/api/admin/payroll/export`
- **SQL functions:** `app.guard_pay_run_lines()` select, `payroll_approve_run()` select/update

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `school_id` | uuid | not null |  |
| `kind` | text | not null | `'regular'::text` |
| `month` | date | not null |  |
| `staff_member_id` | uuid |  |  |
| `exit_id` | uuid |  |  |
| `inputs` | jsonb | not null | `'{}'::jsonb` |
| `status` | text | not null | `'draft'::text` |
| `totals` | jsonb | not null | `'{}'::jsonb` |
| `warnings` | jsonb | not null | `'[]'::jsonb` |
| `computed_at` | timestamp with time zone |  |  |
| `computed_by` | uuid |  |  |
| `submitted_by` | uuid |  |  |
| `submitted_at` | timestamp with time zone |  |  |
| `approved_by` | uuid |  |  |
| `approved_at` | timestamp with time zone |  |  |
| `note` | text |  |  |
| `created_at` | timestamp with time zone | not null | `now()` |

<details><summary>Unique and check constraints</summary>

```sql
CHECK ((jsonb_typeof(inputs) = 'object'::text))
CHECK (((status <> 'approved'::text) OR (approved_by <> submitted_by)))
CHECK (((kind = 'settlement'::text) = (staff_member_id IS NOT NULL)))
CHECK (((kind <> 'settlement'::text) OR (exit_id IS NOT NULL) OR (status = 'approved'::text)))
CHECK (((status <> 'approved'::text) OR ((approved_by IS NOT NULL) AND (submitted_by IS NOT NULL))))
CHECK ((kind = ANY (ARRAY['regular'::text, 'settlement'::text])))
CHECK ((EXTRACT(day FROM month) = (1)::numeric))
CHECK ((length(note) <= 1000))
CHECK ((status = ANY (ARRAY['draft'::text, 'submitted'::text, 'approved'::text])))
```

</details>

<details><summary>Triggers (2)</summary>

```sql
CREATE TRIGGER trg_audit_pay_runs AFTER INSERT OR DELETE OR UPDATE ON public.pay_runs FOR EACH ROW EXECUTE FUNCTION app.audit('status,submitted_by,approved_by')
CREATE TRIGGER trg_guard_pay_runs BEFORE DELETE OR UPDATE ON public.pay_runs FOR EACH ROW EXECUTE FUNCTION app.guard_pay_runs()
```

</details>

<details><summary>Indexes (3)</summary>

```sql
CREATE UNIQUE INDEX pay_runs_pkey ON public.pay_runs USING btree (id)
CREATE UNIQUE INDEX uq_pay_runs_month ON public.pay_runs USING btree (school_id, month) WHERE (kind = 'regular'::text)
CREATE UNIQUE INDEX uq_pay_runs_settlement ON public.pay_runs USING btree (exit_id) WHERE (kind = 'settlement'::text)
```

</details>

### Table pay_run_lines

- **Kind:** table
- **Row-level security:** enabled, 0 policies
- **Grants:** `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `pay_runs` via `run_id`, `schools` via `school_id`, `staff_members` via `staff_member_id`
- **Written by routes:** `/api/admin/payroll/run` (select/delete/insert)
- **Read by routes:** `/api/admin/payroll`, `/api/admin/payroll/export`, `/api/me/payslips`

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `run_id` | uuid | not null |  |
| `school_id` | uuid | not null |  |
| `staff_member_id` | uuid | not null |  |
| `month` | date | not null |  |
| `person` | jsonb | not null |  |
| `days` | jsonb | not null |  |
| `earnings` | jsonb | not null | `'[]'::jsonb` |
| `deductions` | jsonb | not null | `'[]'::jsonb` |
| `employer` | jsonb | not null | `'[]'::jsonb` |
| `tax` | jsonb | not null | `'{}'::jsonb` |
| `gross` | numeric(12,2) | not null | `0` |
| `total_deductions` | numeric(12,2) | not null | `0` |
| `net` | numeric(12,2) | not null | `0` |
| `on_hold` | boolean | not null | `false` |
| `pay_mode` | text | not null | `'bank'::text` |
| `flags` | text[] | not null | `'{}'::text[]` |

<details><summary>Unique and check constraints</summary>

```sql
UNIQUE UNIQUE (run_id, staff_member_id)
```

</details>

<details><summary>Triggers (1)</summary>

```sql
CREATE TRIGGER trg_guard_pay_run_lines BEFORE INSERT OR DELETE OR UPDATE ON public.pay_run_lines FOR EACH ROW EXECUTE FUNCTION app.guard_pay_run_lines()
```

</details>

<details><summary>Indexes (3)</summary>

```sql
CREATE UNIQUE INDEX pay_run_lines_pkey ON public.pay_run_lines USING btree (id)
CREATE UNIQUE INDEX pay_run_lines_run_id_staff_member_id_key ON public.pay_run_lines USING btree (run_id, staff_member_id)
CREATE INDEX idx_pay_run_lines_member ON public.pay_run_lines USING btree (staff_member_id, month)
```

</details>

### Table pay_adjustments

- **Kind:** table
- **Row-level security:** enabled, 0 policies
- **Grants:** `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `users` via `created_by`, `pay_items` via `item_id`, `schools` via `school_id`, `staff_members` via `staff_member_id`
- **Written by routes:** `/api/admin/payroll` (select/insert/delete)
- **Read by routes:** `/api/admin/payroll/run`

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `school_id` | uuid | not null |  |
| `staff_member_id` | uuid | not null |  |
| `month` | date | not null |  |
| `mode` | text | not null | `'add'::text` |
| `item_id` | uuid |  |  |
| `kind` | text | not null |  |
| `label` | text | not null |  |
| `amount` | numeric(12,2) | not null |  |
| `taxable` | boolean | not null | `true` |
| `note` | text | not null |  |
| `created_by` | uuid |  |  |
| `created_at` | timestamp with time zone | not null | `now()` |

<details><summary>Unique and check constraints</summary>

```sql
CHECK ((amount >= (0)::numeric))
CHECK (((mode <> 'override'::text) OR (item_id IS NOT NULL)))
CHECK ((kind = ANY (ARRAY['earning'::text, 'deduction'::text])))
CHECK (((length(TRIM(BOTH FROM label)) >= 1) AND (length(TRIM(BOTH FROM label)) <= 80)))
CHECK ((mode = ANY (ARRAY['add'::text, 'override'::text])))
CHECK ((EXTRACT(day FROM month) = (1)::numeric))
CHECK (((length(TRIM(BOTH FROM note)) >= 1) AND (length(TRIM(BOTH FROM note)) <= 500)))
```

</details>

<details><summary>Triggers (1)</summary>

```sql
CREATE TRIGGER trg_audit_pay_adjustments AFTER INSERT OR DELETE OR UPDATE ON public.pay_adjustments FOR EACH ROW EXECUTE FUNCTION app.audit_touch_only()
```

</details>

<details><summary>Indexes (3)</summary>

```sql
CREATE UNIQUE INDEX pay_adjustments_pkey ON public.pay_adjustments USING btree (id)
CREATE INDEX idx_pay_adjustments_month ON public.pay_adjustments USING btree (school_id, month)
CREATE UNIQUE INDEX uq_pay_adjustments_override ON public.pay_adjustments USING btree (staff_member_id, month, item_id) WHERE (mode = 'override'::text)
```

</details>

### Table payroll_settings

- **Kind:** table
- **Row-level security:** enabled, 0 policies
- **Grants:** `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (school_id)`
- **References:** `schools` via `school_id`, `users` via `updated_by`
- **Written by routes:** `/api/admin/payroll` (select/upsert)
- **Read by routes:** `/api/admin/payroll/run`

| Column | Type | Null | Default |
|---|---|---|---|
| `school_id` | uuid | not null |  |
| `day_basis` | text | not null | `'calendar'::text` |
| `pf_enabled` | boolean | not null | `false` |
| `pf_policy` | text | not null | `'capped'::text` |
| `pf_code` | text |  |  |
| `esi_enabled` | boolean | not null | `false` |
| `esi_code` | text |  |  |
| `pt_state` | text |  |  |
| `tds_enabled` | boolean | not null | `true` |
| `tan` | text |  |  |
| `employer_pan` | text |  |  |
| `bonus_enabled` | boolean | not null | `false` |
| `bonus_month` | smallint | not null | `10` |
| `gratuity_enabled` | boolean | not null | `true` |
| `encash_types` | text[] | not null | `'{earned}'::text[]` |
| `updated_by` | uuid |  |  |
| `updated_at` | timestamp with time zone | not null | `now()` |

<details><summary>Unique and check constraints</summary>

```sql
CHECK (((bonus_month >= 1) AND (bonus_month <= 12)))
CHECK ((day_basis = ANY (ARRAY['calendar'::text, 'fixed30'::text, 'working26'::text])))
CHECK ((employer_pan ~ '^[A-Z]{5}[0-9]{4}[A-Z]$'::text))
CHECK ((length(esi_code) <= 40))
CHECK ((length(pf_code) <= 40))
CHECK ((pf_policy = ANY (ARRAY['capped'::text, 'full'::text])))
CHECK ((pt_state ~ '^[A-Z]{2}$'::text))
CHECK ((tan ~ '^[A-Z]{4}[0-9]{5}[A-Z]$'::text))
```

</details>

<details><summary>Triggers (2)</summary>

```sql
CREATE TRIGGER trg_audit_payroll_settings AFTER INSERT OR UPDATE ON public.payroll_settings FOR EACH ROW EXECUTE FUNCTION app.audit()
CREATE TRIGGER trg_touch_payroll_settings BEFORE UPDATE ON public.payroll_settings FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at()
```

</details>

<details><summary>Indexes (1)</summary>

```sql
CREATE UNIQUE INDEX payroll_settings_pkey ON public.payroll_settings USING btree (school_id)
```

</details>

### Table salary_templates

- **Kind:** table
- **Row-level security:** enabled, 0 policies
- **Grants:** `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `hr_grades` via `grade_id`, `schools` via `school_id`, `users` via `updated_by`
- **Referenced by:** `staff_salaries`
- **Written by routes:** `/api/admin/payroll` (select/update/insert/delete)

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `school_id` | uuid | not null |  |
| `grade_id` | uuid |  |  |
| `name` | text | not null |  |
| `lines` | jsonb | not null | `'[]'::jsonb` |
| `active` | boolean | not null | `true` |
| `updated_by` | uuid |  |  |
| `updated_at` | timestamp with time zone | not null | `now()` |

<details><summary>Unique and check constraints</summary>

```sql
CHECK (((jsonb_typeof(lines) = 'array'::text) AND (jsonb_array_length(lines) <= 60)))
CHECK (((length(TRIM(BOTH FROM name)) >= 1) AND (length(TRIM(BOTH FROM name)) <= 80)))
```

</details>

<details><summary>Triggers (1)</summary>

```sql
CREATE TRIGGER trg_touch_salary_templates BEFORE UPDATE ON public.salary_templates FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at()
```

</details>

<details><summary>Indexes (2)</summary>

```sql
CREATE UNIQUE INDEX salary_templates_pkey ON public.salary_templates USING btree (id)
CREATE UNIQUE INDEX uq_salary_templates_name ON public.salary_templates USING btree (school_id, lower(TRIM(BOTH FROM name)))
```

</details>

### Table staff_salaries

- **Kind:** table
- **Row-level security:** enabled, 0 policies
- **Grants:** `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `users` via `created_by`, `schools` via `school_id`, `staff_members` via `staff_member_id`, `salary_templates` via `template_id`
- **Written by routes:** `/api/admin/payroll` (select/update/insert/delete)
- **Read by routes:** `/api/admin/payroll/run`

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `school_id` | uuid | not null |  |
| `staff_member_id` | uuid | not null |  |
| `effective_from` | date | not null |  |
| `template_id` | uuid |  |  |
| `lines` | jsonb | not null |  |
| `reason` | text |  |  |
| `created_by` | uuid |  |  |
| `created_at` | timestamp with time zone | not null | `now()` |

<details><summary>Unique and check constraints</summary>

```sql
UNIQUE UNIQUE (staff_member_id, effective_from)
CHECK (((jsonb_typeof(lines) = 'array'::text) AND ((jsonb_array_length(lines) >= 1) AND (jsonb_array_length(lines) <= 60))))
CHECK ((length(reason) <= 500))
```

</details>

<details><summary>Triggers (1)</summary>

```sql
CREATE TRIGGER trg_audit_staff_salaries AFTER INSERT OR DELETE OR UPDATE ON public.staff_salaries FOR EACH ROW EXECUTE FUNCTION app.audit_touch_only()
```

</details>

<details><summary>Indexes (3)</summary>

```sql
CREATE UNIQUE INDEX staff_salaries_pkey ON public.staff_salaries USING btree (id)
CREATE UNIQUE INDEX staff_salaries_staff_member_id_effective_from_key ON public.staff_salaries USING btree (staff_member_id, effective_from)
CREATE INDEX idx_staff_salaries_school ON public.staff_salaries USING btree (school_id, effective_from)
```

</details>

### Table staff_pay_settings

- **Kind:** table
- **Row-level security:** enabled, 0 policies
- **Grants:** `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (staff_member_id)`
- **References:** `schools` via `school_id`, `staff_members` via `staff_member_id`, `users` via `updated_by`
- **Written by routes:** `/api/admin/payroll` (select/upsert)
- **Read by routes:** `/api/admin/payroll/run`

| Column | Type | Null | Default |
|---|---|---|---|
| `staff_member_id` | uuid | not null |  |
| `school_id` | uuid | not null |  |
| `tax_regime` | text | not null | `'new'::text` |
| `pf_mode` | text | not null | `'policy'::text` |
| `vpf_pct` | numeric(5,2) | not null | `0` |
| `esi_exempt` | boolean | not null | `false` |
| `pt_exempt` | boolean | not null | `false` |
| `tds_exempt` | boolean | not null | `false` |
| `pay_mode` | text | not null | `'bank'::text` |
| `on_hold` | boolean | not null | `false` |
| `hold_reason` | text |  |  |
| `updated_by` | uuid |  |  |
| `updated_at` | timestamp with time zone | not null | `now()` |

<details><summary>Unique and check constraints</summary>

```sql
CHECK ((length(hold_reason) <= 300))
CHECK ((pay_mode = ANY (ARRAY['bank'::text, 'cash'::text, 'cheque'::text])))
CHECK ((pf_mode = ANY (ARRAY['policy'::text, 'exempt'::text, 'capped'::text, 'full'::text])))
CHECK ((tax_regime = ANY (ARRAY['new'::text, 'old'::text])))
CHECK (((vpf_pct >= (0)::numeric) AND (vpf_pct <= (88)::numeric)))
```

</details>

<details><summary>Triggers (2)</summary>

```sql
CREATE TRIGGER trg_audit_staff_pay_settings AFTER INSERT OR DELETE OR UPDATE ON public.staff_pay_settings FOR EACH ROW EXECUTE FUNCTION app.audit_touch_only()
CREATE TRIGGER trg_touch_staff_pay_settings BEFORE UPDATE ON public.staff_pay_settings FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at()
```

</details>

<details><summary>Indexes (1)</summary>

```sql
CREATE UNIQUE INDEX staff_pay_settings_pkey ON public.staff_pay_settings USING btree (staff_member_id)
```

</details>

### Table staff_loans

- **Kind:** table
- **Row-level security:** enabled, 0 policies
- **Grants:** `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `users` via `created_by`, `schools` via `school_id`, `staff_members` via `staff_member_id`
- **Referenced by:** `loan_recoveries`
- **Written by routes:** `/api/admin/payroll` (select/insert/update), `/api/admin/payroll/run` (select; in SQL: select/update)
- **SQL functions:** `payroll_approve_run()` select/update

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `school_id` | uuid | not null |  |
| `staff_member_id` | uuid | not null |  |
| `kind` | text | not null |  |
| `principal` | numeric(12,2) | not null |  |
| `issued_on` | date | not null |  |
| `instalment` | numeric(12,2) | not null |  |
| `start_month` | date | not null |  |
| `status` | text | not null | `'open'::text` |
| `note` | text |  |  |
| `created_by` | uuid |  |  |
| `created_at` | timestamp with time zone | not null | `now()` |
| `closed_at` | timestamp with time zone |  |  |

<details><summary>Unique and check constraints</summary>

```sql
CHECK ((instalment > (0)::numeric))
CHECK ((kind = ANY (ARRAY['advance'::text, 'loan'::text])))
CHECK ((length(note) <= 500))
CHECK ((principal > (0)::numeric))
CHECK ((EXTRACT(day FROM start_month) = (1)::numeric))
CHECK ((status = ANY (ARRAY['open'::text, 'closed'::text, 'written_off'::text])))
```

</details>

<details><summary>Triggers (1)</summary>

```sql
CREATE TRIGGER trg_audit_staff_loans AFTER INSERT OR DELETE OR UPDATE ON public.staff_loans FOR EACH ROW EXECUTE FUNCTION app.audit_touch_only()
```

</details>

<details><summary>Indexes (2)</summary>

```sql
CREATE UNIQUE INDEX staff_loans_pkey ON public.staff_loans USING btree (id)
CREATE INDEX idx_staff_loans_member ON public.staff_loans USING btree (staff_member_id, status)
```

</details>

### Table loan_recoveries

- **Kind:** table
- **Row-level security:** enabled, 0 policies
- **Grants:** `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `staff_loans` via `loan_id`, `pay_runs` via `run_id`, `schools` via `school_id`
- **Written by routes:** `/api/admin/payroll/run` (select; in SQL: insert/select)
- **Read by routes:** `/api/admin/payroll`
- **SQL functions:** `payroll_approve_run()` insert/select

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `loan_id` | uuid | not null |  |
| `run_id` | uuid | not null |  |
| `school_id` | uuid | not null |  |
| `amount` | numeric(12,2) | not null |  |

<details><summary>Unique and check constraints</summary>

```sql
UNIQUE UNIQUE (loan_id, run_id)
CHECK ((amount > (0)::numeric))
```

</details>

<details><summary>Indexes (2)</summary>

```sql
CREATE UNIQUE INDEX loan_recoveries_loan_id_run_id_key ON public.loan_recoveries USING btree (loan_id, run_id)
CREATE UNIQUE INDEX loan_recoveries_pkey ON public.loan_recoveries USING btree (id)
```

</details>

### Table statutory_rates

- **Kind:** table
- **Row-level security:** enabled, 0 policies
- **Grants:** `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (key, effective_from)`
- **Read by routes:** `/api/admin/payroll`, `/api/admin/payroll/export`, `/api/admin/payroll/run`

| Column | Type | Null | Default |
|---|---|---|---|
| `key` | text | not null |  |
| `effective_from` | date | not null |  |
| `value` | jsonb | not null |  |
| `note` | text |  |  |
| `updated_at` | timestamp with time zone | not null | `now()` |

<details><summary>Unique and check constraints</summary>

```sql
CHECK ((key ~ '^[a-z]+(:[A-Za-z]+)?$'::text))
CHECK ((length(note) <= 500))
CHECK ((jsonb_typeof(value) = 'object'::text))
```

</details>

<details><summary>Indexes (1)</summary>

```sql
CREATE UNIQUE INDEX statutory_rates_pkey ON public.statutory_rates USING btree (key, effective_from)
```

</details>

### Table statutory_overrides

- **Kind:** table
- **Row-level security:** enabled, 0 policies
- **Grants:** `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `users` via `created_by`, `schools` via `school_id`
- **Written by routes:** `/api/admin/payroll` (select/delete/upsert)
- **Read by routes:** `/api/admin/payroll/export`, `/api/admin/payroll/run`

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `school_id` | uuid | not null |  |
| `key` | text | not null |  |
| `effective_from` | date | not null |  |
| `value` | jsonb | not null |  |
| `reason` | text | not null |  |
| `created_by` | uuid |  |  |
| `created_at` | timestamp with time zone | not null | `now()` |

<details><summary>Unique and check constraints</summary>

```sql
UNIQUE UNIQUE (school_id, key, effective_from)
CHECK (((length(TRIM(BOTH FROM reason)) >= 1) AND (length(TRIM(BOTH FROM reason)) <= 500)))
CHECK ((jsonb_typeof(value) = 'object'::text))
```

</details>

<details><summary>Triggers (1)</summary>

```sql
CREATE TRIGGER trg_audit_statutory_overrides AFTER INSERT OR DELETE OR UPDATE ON public.statutory_overrides FOR EACH ROW EXECUTE FUNCTION app.audit()
```

</details>

<details><summary>Indexes (2)</summary>

```sql
CREATE UNIQUE INDEX statutory_overrides_pkey ON public.statutory_overrides USING btree (id)
CREATE UNIQUE INDEX statutory_overrides_school_id_key_effective_from_key ON public.statutory_overrides USING btree (school_id, key, effective_from)
```

</details>

### Table tax_declarations

- **Kind:** table
- **Row-level security:** enabled, 0 policies
- **Grants:** `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `schools` via `school_id`, `staff_members` via `staff_member_id`, `users` via `updated_by`, `users` via `verified_by`
- **Written by routes:** `/api/admin/payroll` (select/upsert)
- **Read by routes:** `/api/admin/payroll/run`

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `school_id` | uuid | not null |  |
| `staff_member_id` | uuid | not null |  |
| `fy` | text | not null |  |
| `items` | jsonb | not null | `'{}'::jsonb` |
| `proofs_verified` | boolean | not null | `false` |
| `verified_by` | uuid |  |  |
| `verified_at` | timestamp with time zone |  |  |
| `updated_by` | uuid |  |  |
| `updated_at` | timestamp with time zone | not null | `now()` |

<details><summary>Unique and check constraints</summary>

```sql
UNIQUE UNIQUE (staff_member_id, fy)
CHECK ((fy ~ '^\d{4}-\d{2}$'::text))
CHECK ((jsonb_typeof(items) = 'object'::text))
```

</details>

<details><summary>Triggers (1)</summary>

```sql
CREATE TRIGGER trg_audit_tax_declarations AFTER INSERT OR DELETE OR UPDATE ON public.tax_declarations FOR EACH ROW EXECUTE FUNCTION app.audit_touch_only()
```

</details>

<details><summary>Indexes (2)</summary>

```sql
CREATE UNIQUE INDEX tax_declarations_pkey ON public.tax_declarations USING btree (id)
CREATE UNIQUE INDEX tax_declarations_staff_member_id_fy_key ON public.tax_declarations USING btree (staff_member_id, fy)
```

</details>

## Messaging, notifications & WhatsApp

### Table notifications

- **Kind:** table · in the `supabase_realtime` publication
- **Row-level security:** enabled, 2 policies
- **Grants:** `authenticated` references/select/trigger; `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `schools` via `school_id`, `users` via `student_id`, `users` via `user_id`
- **Written by routes:** `/api/admin/access` (insert), `/api/admin/admissions` (in SQL: insert), `/api/admin/admissions/offers` (in SQL: insert), `/api/admin/admissions/setup` (in SQL: insert), `/api/admin/attendance` (insert), `/api/admin/counselling` (insert), `/api/admin/discipline` (insert), `/api/admin/exams` (insert), `/api/admin/fees` (insert), `/api/admin/leave` (insert), `/api/admin/payroll/run` (insert), `/api/admin/people` (insert; maybe: upsert), `/api/admin/probe` (select/insert), `/api/admin/schedule/compoff` (insert), `/api/admin/schedule/cover` (insert), `/api/admin/schedule/duties` (insert), `/api/admin/schedule/timetable` (insert), `/api/feed` (insert), `/api/ops/delivery` (select/insert), `/api/ops/desk/[id]` (insert), `/api/ops/requests` (insert), `/api/parent/conduct` (insert), `/api/parent/messages` (insert), `/api/staff/incidents` (insert), `/api/staff/messages` (insert), `/api/student/proctor-alert` (insert), `/api/teacher/attendance` (insert), `/api/teacher/conduct` (insert), `/api/teacher/cover` (insert), `/api/teacher/review-submission` (insert), `/api/teacher/submissions` (insert), `/api/tutor/session` (insert), `/api/whatsapp/simulate` (insert/select), `/api/whatsapp/webhook` (insert/select)
- **Read by routes:** `/api/parent/ask`, `/api/parent/desk`
- **Read directly by pages (browser, RLS):** `/admin (layout)`, `/ops (layout)`, `/parent (layout)`, `/student (layout)`, `/teacher (layout)`
- **SQL functions:** `admission_offer_decide()` insert, `admission_promote()` insert, `hr_daily()` insert

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `school_id` | uuid |  |  |
| `student_id` | uuid |  |  |
| `title` | text |  |  |
| `body` | text |  |  |
| `read` | boolean |  | `false` |
| `created_at` | timestamp with time zone |  | `now()` |
| `user_id` | uuid |  |  |
| `type` | text |  |  |
| `metadata` | jsonb | not null | `'{}'::jsonb` |

<details><summary>RLS policies (2)</summary>

- **notifications_mark_read** · UPDATE · authenticated
  - USING `((user_id = ( SELECT auth.uid() AS uid)) OR (student_id = ( SELECT auth.uid() AS uid)))`
  - WITH CHECK `((user_id = ( SELECT auth.uid() AS uid)) OR (student_id = ( SELECT auth.uid() AS uid)))`
- **notifications_read** · SELECT · authenticated
  - USING `((user_id = ( SELECT auth.uid() AS uid)) OR (student_id = ( SELECT auth.uid() AS uid)))`

</details>

<details><summary>Triggers (1)</summary>

```sql
CREATE TRIGGER trg_guard_notification_update BEFORE UPDATE ON public.notifications FOR EACH ROW EXECUTE FUNCTION app.guard_notification_update()
```

</details>

<details><summary>Indexes (3)</summary>

```sql
CREATE UNIQUE INDEX notifications_pkey ON public.notifications USING btree (id)
CREATE INDEX idx_notifications_student ON public.notifications USING btree (student_id, created_at DESC)
CREATE INDEX idx_notifications_user ON public.notifications USING btree (user_id, created_at DESC)
```

</details>

### Table school_threads

- **Kind:** table
- **Row-level security:** enabled, 1 policies
- **Grants:** `authenticated` select; `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `users` via `parent_id`, `schools` via `school_id`, `users` via `staff_id`, `users` via `student_id`
- **Referenced by:** `school_messages`
- **Written by routes:** `/api/admin/users/assignments` (in SQL: update), `/api/ops/requests` (in SQL: update), `/api/ops/schools/[id]/classes` (in SQL: update), `/api/ops/schools/[id]/people` (in SQL: update), `/api/ops/schools/[id]/people/[userId]` (in SQL: update), `/api/ops/schools/[id]/subjects` (in SQL: update), `/api/parent/messages` (select/update/insert), `/api/staff/messages` (select/update), `/api/whatsapp/simulate` (select/update/insert), `/api/whatsapp/webhook` (select/update/insert)
- **Read by routes:** `/api/feed`, `/api/parent/ask`, `/api/parent/desk`, `/api/staff/ask`
- **SQL functions:** `app.can_see_thread()` select, `ops_rename_class_subject()` update, `app.release_staff_threads()` update

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `school_id` | uuid | not null |  |
| `student_id` | uuid | not null |  |
| `parent_id` | uuid | not null |  |
| `staff_id` | uuid |  |  |
| `audience` | text | not null | `'teacher'::text` |
| `subject` | text | not null |  |
| `topic` | text | not null | `'general'::text` |
| `status` | text | not null | `'open'::text` |
| `last_message_at` | timestamp with time zone | not null | `now()` |
| `parent_read_at` | timestamp with time zone |  |  |
| `staff_read_at` | timestamp with time zone |  |  |
| `created_at` | timestamp with time zone | not null | `now()` |

<details><summary>Unique and check constraints</summary>

```sql
CHECK ((audience = ANY (ARRAY['teacher'::text, 'office'::text])))
CHECK (((audience = 'office'::text) = (staff_id IS NULL)))
CHECK ((status = ANY (ARRAY['open'::text, 'closed'::text])))
CHECK (((length(subject) >= 1) AND (length(subject) <= 160)))
CHECK ((topic = ANY (ARRAY['general'::text, 'academics'::text, 'homework'::text, 'wellbeing'::text, 'fees'::text, 'meeting'::text, 'leave'::text])))
```

</details>

<details><summary>RLS policies (1)</summary>

- **school_threads_read** · SELECT · authenticated
  - USING `(((parent_id = ( SELECT auth.uid() AS uid)) AND app.is_parent_of(student_id)) OR (staff_id = ( SELECT auth.uid() AS uid)) OR ((school_id = ( SELECT app.current_school_id() AS current_school_id)) AND ( SELECT app.has_perm('messages.office'::text) AS has_perm)) OR ( SELECT app.is_superadmin() AS is_superadmin))`

</details>

<details><summary>Indexes (4)</summary>

```sql
CREATE UNIQUE INDEX school_threads_pkey ON public.school_threads USING btree (id)
CREATE INDEX idx_school_threads_parent ON public.school_threads USING btree (parent_id, last_message_at DESC)
CREATE INDEX idx_school_threads_school ON public.school_threads USING btree (school_id, audience, last_message_at DESC)
CREATE INDEX idx_school_threads_staff ON public.school_threads USING btree (staff_id, last_message_at DESC)
```

</details>

### Table school_messages

- **Kind:** table
- **Row-level security:** enabled, 1 policies
- **Grants:** `authenticated` select; `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `schools` via `school_id`, `users` via `sender_id`, `school_threads` via `thread_id`
- **Written by routes:** `/api/parent/messages` (select/insert), `/api/staff/messages` (select/insert), `/api/whatsapp/simulate` (insert/select), `/api/whatsapp/webhook` (insert/select)
- **Read by routes:** `/api/ops/overview`, `/api/ops/schools`, `/api/ops/schools/[id]`, `/api/parent/ask`, `/api/parent/desk`, `/api/staff/ask`
- **SQL functions:** `ops_school_metrics()` select

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `thread_id` | uuid | not null |  |
| `school_id` | uuid | not null |  |
| `sender_id` | uuid |  |  |
| `sender_role` | text | not null |  |
| `body` | text | not null |  |
| `channel` | text | not null | `'web'::text` |
| `created_at` | timestamp with time zone | not null | `now()` |

<details><summary>Unique and check constraints</summary>

```sql
CHECK ((sender_role = ANY (ARRAY['parent'::text, 'teacher'::text, 'admin'::text])))
CHECK (((length(body) >= 1) AND (length(body) <= 4000)))
CHECK ((channel = ANY (ARRAY['web'::text, 'whatsapp'::text])))
```

</details>

<details><summary>RLS policies (1)</summary>

- **school_messages_read** · SELECT · authenticated
  - USING `app.can_see_thread(thread_id)`

</details>

<details><summary>Indexes (2)</summary>

```sql
CREATE UNIQUE INDEX school_messages_pkey ON public.school_messages USING btree (id)
CREATE INDEX idx_school_messages_thread ON public.school_messages USING btree (thread_id, created_at)
```

</details>

### Table whatsapp_links

- **Kind:** table
- **Row-level security:** enabled, 0 policies
- **Grants:** `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (user_id)`
- **References:** `schools` via `school_id`, `users` via `user_id`
- **Written by routes:** `/api/parent/whatsapp` (select/upsert/update/delete), `/api/staff/whatsapp` (select/upsert/update/delete), `/api/whatsapp/simulate` (select/update), `/api/whatsapp/webhook` (select/update)
- **Read by routes:** `/api/admin/attendance`, `/api/admin/discipline`, `/api/admin/exams`, `/api/admin/fees`, `/api/admin/leave`, `/api/admin/schedule/compoff`, `/api/admin/schedule/cover`, `/api/admin/schedule/duties`, `/api/feed`, `/api/ops/delivery`, `/api/parent/ask`, `/api/parent/desk`, `/api/parent/messages`, `/api/staff/incidents`, `/api/staff/messages`, `/api/student/proctor-alert`, `/api/teacher/attendance`, `/api/teacher/conduct`, `/api/teacher/cover`, `/api/teacher/review-submission`, `/api/teacher/submissions`, `/api/tutor/session`

| Column | Type | Null | Default |
|---|---|---|---|
| `user_id` | uuid | not null |  |
| `school_id` | uuid |  |  |
| `phone_e164` | text | not null |  |
| `opted_in` | boolean | not null | `false` |
| `verified_at` | timestamp with time zone |  |  |
| `verified_mode` | text |  |  |
| `otp_hash` | text |  |  |
| `otp_expires_at` | timestamp with time zone |  |  |
| `otp_attempts` | integer | not null | `0` |
| `prefs` | jsonb | not null | `'{"fees": true, "alerts": true, "grades": true, "messages": true, "homework_due": true}'::jsonb` |
| `created_at` | timestamp with time zone | not null | `now()` |
| `updated_at` | timestamp with time zone | not null | `now()` |

<details><summary>Unique and check constraints</summary>

```sql
CHECK ((phone_e164 ~ '^\+[1-9][0-9]{7,14}$'::text))
CHECK ((verified_mode = ANY (ARRAY['live'::text, 'simulated'::text])))
```

</details>

<details><summary>Indexes (2)</summary>

```sql
CREATE UNIQUE INDEX whatsapp_links_pkey ON public.whatsapp_links USING btree (user_id)
CREATE UNIQUE INDEX uq_whatsapp_links_verified_phone ON public.whatsapp_links USING btree (phone_e164) WHERE (verified_at IS NOT NULL)
```

</details>

### Table whatsapp_log

- **Kind:** table
- **Row-level security:** enabled, 1 policies
- **Grants:** `authenticated` select; `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `schools` via `school_id`, `users` via `user_id`
- **Written by routes:** `/api/admin/attendance` (select/insert), `/api/admin/discipline` (select/insert), `/api/admin/exams` (select/insert), `/api/admin/fees` (select/insert), `/api/admin/leave` (select/insert), `/api/admin/payroll/run` (select/insert), `/api/admin/schedule/compoff` (select/insert), `/api/admin/schedule/cover` (select/insert), `/api/admin/schedule/duties` (select/insert), `/api/feed` (select/insert), `/api/ops/delivery` (select/insert), `/api/parent/messages` (select/insert), `/api/parent/whatsapp` (select/insert), `/api/staff/incidents` (select/insert), `/api/staff/messages` (select/insert), `/api/staff/whatsapp` (select/insert), `/api/student/proctor-alert` (select/insert), `/api/teacher/attendance` (select/insert), `/api/teacher/conduct` (select/insert), `/api/teacher/cover` (select/insert), `/api/teacher/review-submission` (select/insert), `/api/teacher/submissions` (select/insert), `/api/tutor/session` (select/insert), `/api/whatsapp/simulate` (select/insert/update), `/api/whatsapp/webhook` (insert/select/update)

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `direction` | text | not null |  |
| `user_id` | uuid |  |  |
| `school_id` | uuid |  |  |
| `phone_e164` | text | not null |  |
| `kind` | text | not null |  |
| `body` | text | not null |  |
| `status` | text | not null |  |
| `provider_id` | text |  |  |
| `error` | text |  |  |
| `meta` | jsonb | not null | `'{}'::jsonb` |
| `created_at` | timestamp with time zone | not null | `now()` |

<details><summary>Unique and check constraints</summary>

```sql
CHECK ((direction = ANY (ARRAY['in'::text, 'out'::text])))
CHECK ((kind = ANY (ARRAY['ask'::text, 'answer'::text, 'notify'::text, 'otp'::text, 'message'::text, 'system'::text])))
CHECK ((status = ANY (ARRAY['simulated'::text, 'sent'::text, 'failed'::text, 'received'::text, 'ignored'::text])))
```

</details>

<details><summary>RLS policies (1)</summary>

- **whatsapp_log_read** · SELECT · authenticated
  - USING `( SELECT app.is_superadmin() AS is_superadmin)`

</details>

<details><summary>Indexes (5)</summary>

```sql
CREATE UNIQUE INDEX whatsapp_log_pkey ON public.whatsapp_log USING btree (id)
CREATE INDEX idx_whatsapp_log_phone ON public.whatsapp_log USING btree (phone_e164, created_at DESC)
CREATE INDEX idx_whatsapp_log_user ON public.whatsapp_log USING btree (user_id, created_at DESC)
CREATE INDEX idx_whatsapp_log_user_kind ON public.whatsapp_log USING btree (user_id, direction, kind, created_at DESC)
CREATE UNIQUE INDEX uq_whatsapp_log_inbound ON public.whatsapp_log USING btree (provider_id) WHERE ((direction = 'in'::text) AND (provider_id IS NOT NULL))
```

</details>

## Compliance

### Table school_filings

- **Kind:** table
- **Row-level security:** enabled, 1 policies
- **Grants:** `authenticated` delete/insert/references/select/trigger/update; `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `users` via `filed_by`, `schools` via `school_id`, `users` via `updated_by`
- **Written by routes:** `/api/admin/filings` (select/upsert/update)
- **Read by routes:** `/api/staff/ask`, `/api/whatsapp/simulate`, `/api/whatsapp/webhook`
- **Read directly by pages (browser, RLS):** `/admin (layout)`

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `school_id` | uuid | not null |  |
| `kind` | text | not null |  |
| `session` | text | not null |  |
| `due_on` | date |  |  |
| `data` | jsonb | not null | `'{}'::jsonb` |
| `snapshot` | jsonb |  |  |
| `status` | text | not null | `'draft'::text` |
| `filed_by` | uuid |  |  |
| `filed_at` | timestamp with time zone |  |  |
| `updated_by` | uuid |  |  |
| `created_at` | timestamp with time zone | not null | `now()` |
| `updated_at` | timestamp with time zone | not null | `now()` |

<details><summary>Unique and check constraints</summary>

```sql
UNIQUE UNIQUE (school_id, kind, session)
CHECK (((status = 'draft'::text) OR ((filed_at IS NOT NULL) AND (snapshot IS NOT NULL))))
CHECK ((jsonb_typeof(data) = 'object'::text))
CHECK ((kind = 'cbse_wellness'::text))
CHECK ((session ~ '^\d{4}-\d{2}$'::text))
CHECK ((status = ANY (ARRAY['draft'::text, 'filed'::text])))
```

</details>

<details><summary>RLS policies (1)</summary>

- **school_filings_read** · SELECT · authenticated
  - USING `((( SELECT app.has_perm('wellness.read'::text) AS has_perm) AND (school_id = ( SELECT app.current_school_id() AS current_school_id))) OR ( SELECT app.is_superadmin() AS is_superadmin))`

</details>

<details><summary>Triggers (2)</summary>

```sql
CREATE TRIGGER trg_audit_school_filings AFTER INSERT OR DELETE OR UPDATE ON public.school_filings FOR EACH ROW EXECUTE FUNCTION app.audit()
CREATE TRIGGER trg_touch_school_filings BEFORE UPDATE ON public.school_filings FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at()
```

</details>

<details><summary>Indexes (2)</summary>

```sql
CREATE UNIQUE INDEX school_filings_pkey ON public.school_filings USING btree (id)
CREATE UNIQUE INDEX school_filings_school_id_kind_session_key ON public.school_filings USING btree (school_id, kind, session)
```

</details>

## Bulk import

### Table import_jobs

- **Kind:** table
- **Row-level security:** enabled, 1 policies
- **Grants:** `authenticated` select; `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `schools` via `school_id`, `auth.users` via `by_user`, `ops_access_grants` via `grant_id`, `auth.users` via `committed_by`, `auth.users` via `undone_by`
- **Referenced by:** `import_changes`, `legacy_results`
- **Written by routes:** `/api/admin/import` (select/update/insert; in SQL: update/select), `/api/admin/import/[id]` (select/update; in SQL: update/select), `/api/import/worker` (update; in SQL: update/select), `/api/ops/schools/[id]/import` (select/update/insert; in SQL: update/select), `/api/ops/schools/[id]/import/[jobId]` (select/update; in SQL: update/select)
- **SQL functions:** `import_claim()` update/select, `import_undo()` select/update

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `school_id` | uuid | not null |  |
| `dataset` | text | not null |  |
| `status` | text | not null | `'uploading'::text` |
| `phase_cursor` | integer | not null | `0` |
| `file_path` | text |  |  |
| `file_name` | text | not null |  |
| `file_kind` | text | not null |  |
| `file_bytes` | bigint |  |  |
| `file_sha256` | text |  |  |
| `total_rows` | integer |  |  |
| `added` | integer | not null | `0` |
| `updated` | integer | not null | `0` |
| `unchanged` | integer | not null | `0` |
| `kept` | integer | not null | `0` |
| `problem_count` | integer | not null | `0` |
| `problems` | jsonb | not null | `'[]'::jsonb` |
| `summary` | jsonb | not null | `'{}'::jsonb` |
| `by_user` | uuid |  |  |
| `by_kind` | text | not null |  |
| `by_name` | text | not null |  |
| `grant_id` | uuid |  |  |
| `attempts` | integer | not null | `0` |
| `locked_until` | timestamp with time zone |  |  |
| `last_error` | text |  |  |
| `created_at` | timestamp with time zone | not null | `now()` |
| `checked_at` | timestamp with time zone |  |  |
| `committed_at` | timestamp with time zone |  |  |
| `committed_by` | uuid |  |  |
| `undone_at` | timestamp with time zone |  |  |
| `undone_by` | uuid |  |  |
| `updated_at` | timestamp with time zone | not null | `now()` |

<details><summary>Unique and check constraints</summary>

```sql
CHECK ((dataset ~ '^[a-z_]{2,40}$'::text))
CHECK ((status = ANY (ARRAY['uploading'::text, 'checking'::text, 'rejected'::text, 'checked'::text, 'committing'::text, 'committed'::text, 'failed'::text, 'undoing'::text, 'undone'::text, 'cancelled'::text])))
CHECK ((phase_cursor >= 0))
CHECK (((file_path IS NULL) OR (length(file_path) <= 300)))
CHECK (((length(file_name) >= 1) AND (length(file_name) <= 200)))
CHECK ((file_kind = ANY (ARRAY['csv'::text, 'xlsx'::text])))
CHECK (((file_bytes IS NULL) OR (file_bytes >= 0)))
CHECK (((file_sha256 IS NULL) OR (file_sha256 ~ '^[0-9a-f]{64}$'::text)))
CHECK (((total_rows IS NULL) OR (total_rows >= 0)))
CHECK ((jsonb_typeof(problems) = 'array'::text))
CHECK ((jsonb_typeof(summary) = 'object'::text))
CHECK ((by_kind = ANY (ARRAY['admin'::text, 'operator'::text])))
CHECK (((length(by_name) >= 1) AND (length(by_name) <= 200)))
CHECK (((by_kind = 'operator'::text) = (grant_id IS NOT NULL)))
CHECK (((last_error IS NULL) OR (length(last_error) <= 2000)))
```

</details>

<details><summary>RLS policies (1)</summary>

- **import_jobs_read** · SELECT · authenticated
  - USING `((( SELECT app.has_perm('data.import'::text) AS has_perm) AND (school_id = ( SELECT app.current_school_id() AS current_school_id))) OR ( SELECT app.is_superadmin() AS is_superadmin))`

</details>

<details><summary>Triggers (1)</summary>

```sql
CREATE TRIGGER trg_touch_import_jobs BEFORE UPDATE ON public.import_jobs FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at()
```

</details>

<details><summary>Indexes (3)</summary>

```sql
CREATE UNIQUE INDEX import_jobs_pkey ON public.import_jobs USING btree (id)
CREATE INDEX import_jobs_school ON public.import_jobs USING btree (school_id, created_at DESC)
CREATE INDEX import_jobs_waiting ON public.import_jobs USING btree (locked_until) WHERE (status = ANY (ARRAY['checking'::text, 'committing'::text, 'undoing'::text]))
```

</details>

### Table import_changes

- **Kind:** table
- **Row-level security:** enabled, 0 policies
- **Grants:** `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `import_jobs` via `job_id`
- **Written by routes:** `/api/admin/import` (in SQL: select/delete), `/api/admin/import/[id]` (in SQL: select/delete), `/api/import/worker` (in SQL: select/delete), `/api/ops/schools/[id]/import` (in SQL: select/delete), `/api/ops/schools/[id]/import/[jobId]` (in SQL: select/delete)
- **SQL functions:** `import_admission_applicants()` insert, `import_attendance()` insert, `import_cc_memberships()` insert, `import_certificates()` insert, `import_documents()` insert, `import_enrolments()` insert, `import_exam_marks()` insert, `import_family()` insert, `import_fee_invoices()` insert, `import_fee_structures()` insert, `import_health()` insert, `import_house_members()` insert, `import_kirti()` insert, `import_legacy_results()` insert, `import_students()` insert, `import_undo()` select/delete

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | bigint | not null | `nextval('import_changes_id_seq'::regclass)` |
| `job_id` | uuid | not null |  |
| `school_id` | uuid | not null |  |
| `table_name` | text | not null |  |
| `row_id` | uuid | not null |  |
| `before` | jsonb | not null |  |

<details><summary>Unique and check constraints</summary>

```sql
UNIQUE UNIQUE (job_id, table_name, row_id)
CHECK ((table_name = ANY (ARRAY['attendance'::text, 'exam_marks'::text, 'legacy_results'::text, 'fee_structures'::text, 'fee_invoices'::text, 'admission_applicants'::text, 'students'::text, 'enrolments'::text, 'family_members'::text, 'student_health'::text, 'emergency_contacts'::text, 'family_primary'::text, 'student_documents'::text, 'certificates'::text, 'house_members'::text, 'cc_memberships'::text, 'kirti_entries'::text])))
```

</details>

<details><summary>Indexes (2)</summary>

```sql
CREATE UNIQUE INDEX import_changes_pkey ON public.import_changes USING btree (id)
CREATE UNIQUE INDEX import_changes_job_id_table_name_row_id_key ON public.import_changes USING btree (job_id, table_name, row_id)
```

</details>

## Platform Manager (Sthara ops)

### Table ops_operators

- **Kind:** table
- **Row-level security:** enabled, 0 policies
- **Grants:** `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (user_id)`
- **References:** `users` via `created_by`, `ops_operators` via `manager_id`, `users` via `user_id`
- **Referenced by:** `enquiries`, `ops_accounts`, `ops_cases`, `ops_opportunities`, `ops_tasks`, `ops_territories`, `ops_territory_members`
- **Written by routes:** `/api/ops/operators` (select/insert/update)
- **Read by routes:** `/api/admin/support`, `/api/ops/audit`, `/api/ops/delivery`, `/api/ops/desk`, `/api/ops/desk/[id]`, `/api/ops/desk/settings`, `/api/ops/enquiries`, `/api/ops/errors`, `/api/ops/health`, `/api/ops/marketing`, `/api/ops/me`, `/api/ops/overview`, `/api/ops/partners`, `/api/ops/people`, `/api/ops/pipeline`, `/api/ops/pipeline/[id]`, `/api/ops/pipeline/settings`, `/api/ops/qa`, `/api/ops/requests`, `/api/ops/schools`, `/api/ops/schools/[id]`, `/api/ops/schools/[id]/access`, `/api/ops/schools/[id]/account`, `/api/ops/schools/[id]/classes`, `/api/ops/schools/[id]/controls`, `/api/ops/schools/[id]/crm`, `/api/ops/schools/[id]/import`, `/api/ops/schools/[id]/import/[jobId]`, `/api/ops/schools/[id]/inspect`, `/api/ops/schools/[id]/people`, `/api/ops/schools/[id]/people/[userId]`, `/api/ops/schools/[id]/settings`, `/api/ops/schools/[id]/subjects`, `/api/ops/schools/[id]/support`, `/api/ops/settings`, `/api/ops/tasks`, `/api/ops/territories`, `/api/ops/traffic`, `/api/ops/usage`
- **Read directly by pages (browser, RLS):** `/ops/[schoolId]`, `/ops/audit`, `/ops/delivery`, `/ops/desk/[id]`, `/ops/desk`, `/ops/desk/settings`, `/ops/enquiries`, `/ops/errors`, `/ops/health`, `/ops (layout)`, `/ops/marketing`, `/ops/operators`, `/ops/partners`, `/ops/people`, `/ops/pipeline/[id]`, `/ops/pipeline`, `/ops/pipeline/settings`, `/ops/quality`, `/ops/requests`, `/ops/schools/[schoolId]`, `/ops/schools`, `/ops/settings`, `/ops/tasks`, `/ops/traffic`, `/ops/usage`

| Column | Type | Null | Default |
|---|---|---|---|
| `user_id` | uuid | not null |  |
| `role` | text | not null |  |
| `manager_id` | uuid |  |  |
| `title` | text |  |  |
| `active` | boolean | not null | `true` |
| `created_at` | timestamp with time zone | not null | `now()` |
| `created_by` | uuid |  |  |
| `updated_at` | timestamp with time zone | not null | `now()` |

<details><summary>Unique and check constraints</summary>

```sql
CHECK ((manager_id IS DISTINCT FROM user_id))
CHECK ((role = ANY (ARRAY['director'::text, 'regional_lead'::text, 'sales_rep'::text, 'account_manager'::text, 'support_agent'::text, 'engineer'::text, 'finance'::text])))
CHECK (((title IS NULL) OR (length(title) <= 80)))
```

</details>

<details><summary>Triggers (1)</summary>

```sql
CREATE TRIGGER trg_guard_director BEFORE INSERT OR UPDATE OF role, user_id ON public.ops_operators FOR EACH ROW EXECUTE FUNCTION app.guard_director()
```

</details>

<details><summary>Indexes (2)</summary>

```sql
CREATE UNIQUE INDEX ops_operators_pkey ON public.ops_operators USING btree (user_id)
CREATE INDEX ix_ops_operators_manager ON public.ops_operators USING btree (manager_id)
```

</details>

### Table ops_territories

- **Kind:** table
- **Row-level security:** enabled, 0 policies
- **Grants:** `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `ops_operators` via `default_owner_id`, `ops_territories` via `parent_id`
- **Referenced by:** `enquiries`, `ops_accounts`, `ops_opportunities`, `ops_territory_members`
- **Written by routes:** `/api/ops/operators` (select/update), `/api/ops/territories` (select/update/insert/delete)
- **Read by routes:** `/api/ops/audit`, `/api/ops/delivery`, `/api/ops/desk`, `/api/ops/desk/[id]`, `/api/ops/desk/settings`, `/api/ops/enquiries`, `/api/ops/errors`, `/api/ops/health`, `/api/ops/marketing`, `/api/ops/me`, `/api/ops/overview`, `/api/ops/partners`, `/api/ops/people`, `/api/ops/pipeline`, `/api/ops/pipeline/[id]`, `/api/ops/pipeline/settings`, `/api/ops/qa`, `/api/ops/requests`, `/api/ops/schools`, `/api/ops/schools/[id]`, `/api/ops/schools/[id]/access`, `/api/ops/schools/[id]/account`, `/api/ops/schools/[id]/classes`, `/api/ops/schools/[id]/controls`, `/api/ops/schools/[id]/crm`, `/api/ops/schools/[id]/import`, `/api/ops/schools/[id]/import/[jobId]`, `/api/ops/schools/[id]/inspect`, `/api/ops/schools/[id]/people`, `/api/ops/schools/[id]/people/[userId]`, `/api/ops/schools/[id]/settings`, `/api/ops/schools/[id]/subjects`, `/api/ops/schools/[id]/support`, `/api/ops/settings`, `/api/ops/tasks`, `/api/ops/traffic`, `/api/ops/usage`

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `name` | text | not null |  |
| `level` | text | not null |  |
| `parent_id` | uuid |  |  |
| `state` | text |  |  |
| `district` | text |  |  |
| `default_owner_id` | uuid |  |  |
| `created_at` | timestamp with time zone | not null | `now()` |

<details><summary>Unique and check constraints</summary>

```sql
CHECK ((((level = 'region'::text) AND (parent_id IS NULL) AND (state IS NULL) AND (district IS NULL)) OR ((level = 'state'::text) AND (state IS NOT NULL) AND (district IS NULL)) OR ((level = 'district'::text) AND (parent_id IS NOT NULL) AND (state IS NOT NULL) AND (district IS NOT NULL))))
CHECK (((district IS NULL) OR (length(district) <= 80)))
CHECK ((level = ANY (ARRAY['region'::text, 'state'::text, 'district'::text])))
CHECK (((length(name) >= 2) AND (length(name) <= 80)))
CHECK (((state IS NULL) OR (length(state) <= 60)))
```

</details>

<details><summary>Indexes (5)</summary>

```sql
CREATE UNIQUE INDEX ops_territories_pkey ON public.ops_territories USING btree (id)
CREATE INDEX ix_ops_territories_parent ON public.ops_territories USING btree (parent_id)
CREATE UNIQUE INDEX ux_ops_territories_district ON public.ops_territories USING btree (lower(state), lower(district)) WHERE (level = 'district'::text)
CREATE UNIQUE INDEX ux_ops_territories_region ON public.ops_territories USING btree (lower(name)) WHERE (level = 'region'::text)
CREATE UNIQUE INDEX ux_ops_territories_state ON public.ops_territories USING btree (lower(state)) WHERE (level = 'state'::text)
```

</details>

### Table ops_territory_members

- **Kind:** table
- **Row-level security:** enabled, 0 policies
- **Grants:** `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (territory_id, operator_id)`
- **References:** `ops_operators` via `operator_id`, `ops_territories` via `territory_id`
- **Written by routes:** `/api/ops/operators` (select/delete/insert)
- **Read by routes:** `/api/ops/audit`, `/api/ops/delivery`, `/api/ops/desk`, `/api/ops/desk/[id]`, `/api/ops/desk/settings`, `/api/ops/enquiries`, `/api/ops/errors`, `/api/ops/health`, `/api/ops/marketing`, `/api/ops/me`, `/api/ops/overview`, `/api/ops/partners`, `/api/ops/people`, `/api/ops/pipeline`, `/api/ops/pipeline/[id]`, `/api/ops/pipeline/settings`, `/api/ops/qa`, `/api/ops/requests`, `/api/ops/schools`, `/api/ops/schools/[id]`, `/api/ops/schools/[id]/access`, `/api/ops/schools/[id]/account`, `/api/ops/schools/[id]/classes`, `/api/ops/schools/[id]/controls`, `/api/ops/schools/[id]/crm`, `/api/ops/schools/[id]/import`, `/api/ops/schools/[id]/import/[jobId]`, `/api/ops/schools/[id]/inspect`, `/api/ops/schools/[id]/people`, `/api/ops/schools/[id]/people/[userId]`, `/api/ops/schools/[id]/settings`, `/api/ops/schools/[id]/subjects`, `/api/ops/schools/[id]/support`, `/api/ops/settings`, `/api/ops/tasks`, `/api/ops/territories`, `/api/ops/traffic`, `/api/ops/usage`

| Column | Type | Null | Default |
|---|---|---|---|
| `territory_id` | uuid | not null |  |
| `operator_id` | uuid | not null |  |

<details><summary>Indexes (2)</summary>

```sql
CREATE UNIQUE INDEX ops_territory_members_pkey ON public.ops_territory_members USING btree (territory_id, operator_id)
CREATE INDEX ix_ops_territory_members_operator ON public.ops_territory_members USING btree (operator_id)
```

</details>

### Table ops_accounts

- **Kind:** table
- **Row-level security:** enabled, 0 policies
- **Grants:** `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (school_id)`
- **References:** `ops_operators` via `owner_id`, `schools` via `school_id`, `ops_territories` via `territory_id`, `users` via `updated_by`
- **Written by routes:** `/api/ops/schools` (select/upsert/insert), `/api/ops/schools/[id]/account` (select/upsert), `/api/ops/territories` (select/update)
- **Read by routes:** `/api/admin/support`, `/api/ops/audit`, `/api/ops/delivery`, `/api/ops/desk`, `/api/ops/desk/[id]`, `/api/ops/desk/settings`, `/api/ops/enquiries`, `/api/ops/errors`, `/api/ops/health`, `/api/ops/marketing`, `/api/ops/me`, `/api/ops/operators`, `/api/ops/overview`, `/api/ops/partners`, `/api/ops/people`, `/api/ops/pipeline`, `/api/ops/pipeline/[id]`, `/api/ops/pipeline/settings`, `/api/ops/qa`, `/api/ops/requests`, `/api/ops/schools/[id]`, `/api/ops/schools/[id]/access`, `/api/ops/schools/[id]/classes`, `/api/ops/schools/[id]/controls`, `/api/ops/schools/[id]/crm`, `/api/ops/schools/[id]/import`, `/api/ops/schools/[id]/import/[jobId]`, `/api/ops/schools/[id]/inspect`, `/api/ops/schools/[id]/people`, `/api/ops/schools/[id]/people/[userId]`, `/api/ops/schools/[id]/settings`, `/api/ops/schools/[id]/subjects`, `/api/ops/schools/[id]/support`, `/api/ops/settings`, `/api/ops/tasks`, `/api/ops/traffic`, `/api/ops/usage`

| Column | Type | Null | Default |
|---|---|---|---|
| `school_id` | uuid | not null |  |
| `state` | text |  |  |
| `district` | text |  |  |
| `territory_id` | uuid |  |  |
| `owner_id` | uuid |  |  |
| `updated_at` | timestamp with time zone | not null | `now()` |
| `updated_by` | uuid |  |  |

<details><summary>Unique and check constraints</summary>

```sql
CHECK (((district IS NULL) OR (length(district) <= 80)))
CHECK (((state IS NULL) OR (length(state) <= 60)))
```

</details>

<details><summary>Indexes (3)</summary>

```sql
CREATE UNIQUE INDEX ops_accounts_pkey ON public.ops_accounts USING btree (school_id)
CREATE INDEX ix_ops_accounts_owner ON public.ops_accounts USING btree (owner_id)
CREATE INDEX ix_ops_accounts_territory ON public.ops_accounts USING btree (territory_id)
```

</details>

### Table ops_contacts

- **Kind:** table
- **Row-level security:** enabled, 0 policies
- **Grants:** `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `users` via `created_by`, `schools` via `school_id`, `users` via `user_id`
- **Referenced by:** `ops_activities`, `ops_cases`
- **Written by routes:** `/api/ops/schools/[id]/crm` (select/update/insert)
- **Read by routes:** `/api/ops/desk/[id]`, `/api/ops/health`, `/api/ops/overview`, `/api/ops/schools`, `/api/ops/schools/[id]`
- **SQL functions:** `ops_registry_counts()` select

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `school_id` | uuid | not null |  |
| `name` | text | not null |  |
| `role` | text | not null | `'other'::text` |
| `title` | text |  |  |
| `email` | text |  |  |
| `phone` | text |  |  |
| `is_primary` | boolean | not null | `false` |
| `decides` | boolean | not null | `false` |
| `note` | text |  |  |
| `user_id` | uuid |  |  |
| `active` | boolean | not null | `true` |
| `created_by` | uuid |  |  |
| `created_at` | timestamp with time zone | not null | `now()` |
| `updated_at` | timestamp with time zone | not null | `now()` |

<details><summary>Unique and check constraints</summary>

```sql
CHECK (((email IS NULL) OR (length(email) <= 200)))
CHECK (((length(name) >= 2) AND (length(name) <= 120)))
CHECK (((note IS NULL) OR (length(note) <= 1000)))
CHECK (((phone IS NULL) OR (length(phone) <= 30)))
CHECK ((length(role) <= 40))
CHECK (((title IS NULL) OR (length(title) <= 80)))
```

</details>

<details><summary>Indexes (3)</summary>

```sql
CREATE UNIQUE INDEX ops_contacts_pkey ON public.ops_contacts USING btree (id)
CREATE INDEX ix_ops_contacts_school ON public.ops_contacts USING btree (school_id)
CREATE UNIQUE INDEX ux_ops_contacts_primary ON public.ops_contacts USING btree (school_id) WHERE (is_primary AND active)
```

</details>

### Table ops_activities

- **Kind:** table
- **Row-level security:** enabled, 0 policies
- **Grants:** `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `ops_cases` via `case_id`, `ops_contacts` via `contact_id`, `users` via `created_by`, `schools` via `school_id`
- **Written by routes:** `/api/ops/schools/[id]/crm` (select/insert)
- **Read by routes:** `/api/ops/health`, `/api/ops/overview`, `/api/ops/schools`, `/api/ops/schools/[id]`
- **SQL functions:** `ops_registry_counts()` select

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `school_id` | uuid | not null |  |
| `kind` | text | not null |  |
| `direction` | text |  |  |
| `subject` | text | not null |  |
| `body` | text |  |  |
| `happened_at` | timestamp with time zone | not null | `now()` |
| `contact_id` | uuid |  |  |
| `case_id` | uuid |  |  |
| `created_by` | uuid |  |  |
| `created_at` | timestamp with time zone | not null | `now()` |

<details><summary>Unique and check constraints</summary>

```sql
CHECK (((body IS NULL) OR (length(body) <= 6000)))
CHECK (((direction IS NULL) OR (direction = ANY (ARRAY['in'::text, 'out'::text]))))
CHECK ((kind = ANY (ARRAY['call'::text, 'meeting'::text, 'email'::text, 'whatsapp'::text, 'visit'::text, 'note'::text])))
CHECK (((length(subject) >= 2) AND (length(subject) <= 160)))
```

</details>

<details><summary>Indexes (2)</summary>

```sql
CREATE UNIQUE INDEX ops_activities_pkey ON public.ops_activities USING btree (id)
CREATE INDEX ix_ops_activities_school ON public.ops_activities USING btree (school_id, happened_at DESC)
```

</details>

### Table ops_tasks

- **Kind:** table
- **Row-level security:** enabled, 0 policies
- **Grants:** `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `ops_cases` via `case_id`, `users` via `created_by`, `enquiries` via `enquiry_id`, `ops_opportunities` via `opportunity_id`, `ops_operators` via `owner_id`, `schools` via `school_id`
- **Written by routes:** `/api/ops/pipeline/[id]` (select/insert), `/api/ops/schools/[id]/crm` (select/update/insert), `/api/ops/tasks` (select/update)
- **Read by routes:** `/api/ops/health`, `/api/ops/overview`, `/api/ops/schools`, `/api/ops/schools/[id]`
- **SQL functions:** `ops_registry_counts()` select

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `school_id` | uuid |  |  |
| `enquiry_id` | uuid |  |  |
| `case_id` | uuid |  |  |
| `title` | text | not null |  |
| `note` | text |  |  |
| `due_on` | date |  |  |
| `priority` | text | not null | `'normal'::text` |
| `status` | text | not null | `'open'::text` |
| `owner_id` | uuid |  |  |
| `created_by` | uuid |  |  |
| `created_at` | timestamp with time zone | not null | `now()` |
| `done_at` | timestamp with time zone |  |  |
| `opportunity_id` | uuid |  |  |

<details><summary>Unique and check constraints</summary>

```sql
CHECK (((note IS NULL) OR (length(note) <= 2000)))
CHECK ((priority = ANY (ARRAY['high'::text, 'normal'::text, 'low'::text])))
CHECK ((status = ANY (ARRAY['open'::text, 'done'::text, 'cancelled'::text])))
CHECK (((length(title) >= 2) AND (length(title) <= 200)))
```

</details>

<details><summary>Indexes (4)</summary>

```sql
CREATE UNIQUE INDEX ops_tasks_pkey ON public.ops_tasks USING btree (id)
CREATE INDEX ix_ops_tasks_opportunity ON public.ops_tasks USING btree (opportunity_id) WHERE (status = 'open'::text)
CREATE INDEX ix_ops_tasks_owner ON public.ops_tasks USING btree (owner_id, due_on) WHERE (status = 'open'::text)
CREATE INDEX ix_ops_tasks_school ON public.ops_tasks USING btree (school_id) WHERE (status = 'open'::text)
```

</details>

### Table ops_documents

- **Kind:** table
- **Row-level security:** enabled, 0 policies
- **Grants:** `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `schools` via `school_id`, `users` via `uploaded_by`
- **Written by routes:** `/api/ops/schools/[id]/crm` (select/insert/delete)

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `school_id` | uuid | not null |  |
| `kind` | text | not null |  |
| `title` | text | not null |  |
| `signed_on` | date |  |  |
| `expires_on` | date |  |  |
| `storage_path` | text | not null |  |
| `file_name` | text | not null |  |
| `mime` | text | not null |  |
| `size_bytes` | integer | not null |  |
| `uploaded_by` | uuid |  |  |
| `created_at` | timestamp with time zone | not null | `now()` |

<details><summary>Unique and check constraints</summary>

```sql
CHECK (((expires_on IS NULL) OR (signed_on IS NULL) OR (expires_on >= signed_on)))
CHECK ((length(file_name) <= 200))
CHECK ((kind = ANY (ARRAY['contract'::text, 'mou'::text, 'purchase_order'::text, 'proposal'::text, 'invoice'::text, 'other'::text])))
CHECK ((size_bytes > 0))
CHECK (((length(title) >= 2) AND (length(title) <= 160)))
```

</details>

<details><summary>Indexes (2)</summary>

```sql
CREATE UNIQUE INDEX ops_documents_pkey ON public.ops_documents USING btree (id)
CREATE INDEX ix_ops_documents_school ON public.ops_documents USING btree (school_id, created_at DESC)
```

</details>

### Table ops_cases

- **Kind:** table
- **Row-level security:** enabled, 0 policies
- **Grants:** `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `ops_contacts` via `contact_id`, `ops_operators` via `owner_id`, `users` via `raised_by`, `schools` via `school_id`
- **Referenced by:** `ops_activities`, `ops_case_links`, `ops_case_messages`, `ops_tasks`
- **Written by routes:** `/api/admin/support` (select/insert/update), `/api/ops/desk` (select/insert), `/api/ops/desk/[id]` (select/update)
- **Read by routes:** `/api/ops/health`, `/api/ops/overview`, `/api/ops/schools`, `/api/ops/schools/[id]`, `/api/ops/schools/[id]/crm`, `/api/ops/tasks`
- **SQL functions:** `app.ops_case_messages_guard()` select, `ops_registry_counts()` select

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `number` | bigint | not null | `nextval('ops_case_number_seq'::regclass)` |
| `school_id` | uuid | not null |  |
| `subject` | text | not null |  |
| `category` | text | not null | `'other'::text` |
| `priority` | text | not null | `'normal'::text` |
| `status` | text | not null | `'new'::text` |
| `source` | text | not null | `'operator'::text` |
| `raised_by` | uuid |  |  |
| `raised_by_name` | text |  |  |
| `contact_id` | uuid |  |  |
| `owner_id` | uuid |  |  |
| `first_response_due` | timestamp with time zone | not null |  |
| `resolve_due` | timestamp with time zone | not null |  |
| `first_responded_at` | timestamp with time zone |  |  |
| `resolved_at` | timestamp with time zone |  |  |
| `closed_at` | timestamp with time zone |  |  |
| `reopened` | integer | not null | `0` |
| `last_school_at` | timestamp with time zone |  |  |
| `last_operator_at` | timestamp with time zone |  |  |
| `created_at` | timestamp with time zone | not null | `now()` |
| `updated_at` | timestamp with time zone | not null | `now()` |

<details><summary>Unique and check constraints</summary>

```sql
UNIQUE UNIQUE (number)
CHECK ((length(category) <= 40))
CHECK ((priority = ANY (ARRAY['urgent'::text, 'high'::text, 'normal'::text, 'low'::text])))
CHECK (((raised_by_name IS NULL) OR (length(raised_by_name) <= 120)))
CHECK ((source = ANY (ARRAY['school_portal'::text, 'operator'::text, 'phone'::text, 'email'::text, 'whatsapp'::text])))
CHECK ((status = ANY (ARRAY['new'::text, 'open'::text, 'waiting_school'::text, 'resolved'::text, 'closed'::text])))
CHECK (((length(subject) >= 4) AND (length(subject) <= 160)))
```

</details>

<details><summary>Indexes (5)</summary>

```sql
CREATE UNIQUE INDEX ops_cases_number_key ON public.ops_cases USING btree (number)
CREATE UNIQUE INDEX ops_cases_pkey ON public.ops_cases USING btree (id)
CREATE INDEX ix_ops_cases_open ON public.ops_cases USING btree (status, resolve_due) WHERE (status <> ALL (ARRAY['resolved'::text, 'closed'::text]))
CREATE INDEX ix_ops_cases_owner ON public.ops_cases USING btree (owner_id) WHERE (status <> ALL (ARRAY['resolved'::text, 'closed'::text]))
CREATE INDEX ix_ops_cases_school ON public.ops_cases USING btree (school_id, created_at DESC)
```

</details>

### Table ops_case_messages

- **Kind:** table
- **Row-level security:** enabled, 0 policies
- **Grants:** `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `users` via `author_id`, `ops_cases` via `case_id`
- **Written by routes:** `/api/admin/support` (select/insert), `/api/ops/desk` (insert), `/api/ops/desk/[id]` (select/insert)

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `case_id` | uuid | not null |  |
| `author_kind` | text | not null |  |
| `author_id` | uuid |  |  |
| `author_name` | text |  |  |
| `body` | text | not null |  |
| `internal` | boolean | not null | `false` |
| `created_at` | timestamp with time zone | not null | `now()` |

<details><summary>Unique and check constraints</summary>

```sql
CHECK ((author_kind = ANY (ARRAY['school'::text, 'operator'::text, 'system'::text])))
CHECK (((author_name IS NULL) OR (length(author_name) <= 120)))
CHECK (((length(body) >= 1) AND (length(body) <= 8000)))
CHECK (((NOT internal) OR (author_kind = 'operator'::text)))
```

</details>

<details><summary>Triggers (1)</summary>

```sql
CREATE TRIGGER trg_ops_case_messages_guard BEFORE DELETE OR UPDATE ON public.ops_case_messages FOR EACH ROW EXECUTE FUNCTION app.ops_case_messages_guard()
```

</details>

<details><summary>Indexes (2)</summary>

```sql
CREATE UNIQUE INDEX ops_case_messages_pkey ON public.ops_case_messages USING btree (id)
CREATE INDEX ix_ops_case_messages_case ON public.ops_case_messages USING btree (case_id, created_at)
```

</details>

### Table ops_case_links

- **Kind:** table
- **Row-level security:** enabled, 0 policies
- **Grants:** `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `ops_cases` via `case_id`, `users` via `created_by`
- **Written by routes:** `/api/ops/desk/[id]` (select/insert/delete)

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `case_id` | uuid | not null |  |
| `kind` | text | not null |  |
| `ref` | text | not null |  |
| `label` | text |  |  |
| `created_by` | uuid |  |  |
| `created_at` | timestamp with time zone | not null | `now()` |

<details><summary>Unique and check constraints</summary>

```sql
UNIQUE UNIQUE (case_id, kind, ref)
CHECK ((kind = ANY (ARRAY['error'::text, 'record'::text, 'audit'::text, 'request'::text, 'url'::text])))
CHECK (((label IS NULL) OR (length(label) <= 200)))
CHECK (((length(ref) >= 1) AND (length(ref) <= 400)))
```

</details>

<details><summary>Indexes (2)</summary>

```sql
CREATE UNIQUE INDEX ops_case_links_case_id_kind_ref_key ON public.ops_case_links USING btree (case_id, kind, ref)
CREATE UNIQUE INDEX ops_case_links_pkey ON public.ops_case_links USING btree (id)
```

</details>

### Table ops_canned_replies

- **Kind:** table
- **Row-level security:** enabled, 0 policies
- **Grants:** `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `users` via `created_by`
- **Written by routes:** `/api/ops/desk/settings` (select/update/insert/delete)
- **Read by routes:** `/api/ops/desk/[id]`

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `title` | text | not null |  |
| `body` | text | not null |  |
| `created_by` | uuid |  |  |
| `updated_at` | timestamp with time zone | not null | `now()` |

<details><summary>Unique and check constraints</summary>

```sql
CHECK (((length(body) >= 2) AND (length(body) <= 4000)))
CHECK (((length(title) >= 2) AND (length(title) <= 80)))
```

</details>

<details><summary>Indexes (1)</summary>

```sql
CREATE UNIQUE INDEX ops_canned_replies_pkey ON public.ops_canned_replies USING btree (id)
```

</details>

### Table ops_sla_policies

- **Kind:** table
- **Row-level security:** enabled, 0 policies
- **Grants:** `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (priority)`
- **Written by routes:** `/api/ops/desk/settings` (select/upsert)
- **Read by routes:** `/api/admin/support`, `/api/ops/desk`, `/api/ops/desk/[id]`

| Column | Type | Null | Default |
|---|---|---|---|
| `priority` | text | not null |  |
| `first_response_minutes` | integer | not null |  |
| `resolve_minutes` | integer | not null |  |

<details><summary>Unique and check constraints</summary>

```sql
CHECK ((resolve_minutes >= first_response_minutes))
CHECK (((first_response_minutes >= 5) AND (first_response_minutes <= 43200)))
CHECK ((priority = ANY (ARRAY['urgent'::text, 'high'::text, 'normal'::text, 'low'::text])))
CHECK (((resolve_minutes >= 30) AND (resolve_minutes <= 129600)))
```

</details>

<details><summary>Indexes (1)</summary>

```sql
CREATE UNIQUE INDEX ops_sla_policies_pkey ON public.ops_sla_policies USING btree (priority)
```

</details>

### Table ops_picklists

- **Kind:** table
- **Row-level security:** enabled, 0 policies
- **Grants:** `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (kind, key)`
- **Written by routes:** `/api/ops/desk/settings` (select/upsert), `/api/ops/pipeline/settings` (select/upsert)
- **Read by routes:** `/api/admin/support`, `/api/ops/desk`, `/api/ops/desk/[id]`, `/api/ops/pipeline`, `/api/ops/pipeline/[id]`, `/api/ops/schools/[id]/crm`

| Column | Type | Null | Default |
|---|---|---|---|
| `kind` | text | not null |  |
| `key` | text | not null |  |
| `label` | text | not null |  |
| `sort` | integer | not null | `100` |
| `active` | boolean | not null | `true` |

<details><summary>Unique and check constraints</summary>

```sql
CHECK ((key ~ '^[a-z0-9_]{2,40}$'::text))
CHECK ((kind = ANY (ARRAY['case_category'::text, 'contact_role'::text, 'loss_reason'::text])))
CHECK (((length(label) >= 2) AND (length(label) <= 60)))
```

</details>

<details><summary>Indexes (1)</summary>

```sql
CREATE UNIQUE INDEX ops_picklists_pkey ON public.ops_picklists USING btree (kind, key)
```

</details>

### Table ops_opportunities

- **Kind:** table
- **Row-level security:** enabled, 0 policies
- **Grants:** `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `ops_campaigns` via `campaign_id`, `users` via `created_by`, `enquiries` via `enquiry_id`, `ops_operators` via `owner_id`, `ops_partners` via `partner_id`, `schools` via `school_id`, `ops_opportunity_stages` via `stage`, `ops_territories` via `territory_id`
- **Referenced by:** `ops_commissions`, `ops_marketing_spend`, `ops_opportunity_events`, `ops_quotes`, `ops_tasks`
- **Written by routes:** `/api/ops/pipeline` (select/insert), `/api/ops/pipeline/[id]` (select/update)
- **Read by routes:** `/api/ops/enquiries`, `/api/ops/marketing`, `/api/ops/overview`, `/api/ops/partners`, `/api/ops/pipeline/settings`, `/api/ops/schools/[id]/crm`

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `number` | bigint | not null | `nextval('ops_opportunity_number_seq'::regclass)` |
| `name` | text | not null |  |
| `kind` | text | not null | `'new'::text` |
| `stage` | text | not null |  |
| `enquiry_id` | uuid |  |  |
| `school_id` | uuid |  |  |
| `plan` | text |  |  |
| `students` | integer |  |  |
| `price_per_student` | numeric(10,2) |  |  |
| `amount` | numeric(14,2) | not null | `0` |
| `expected_close` | date |  |  |
| `next_step` | text |  |  |
| `contact_name` | text |  |  |
| `contact_phone` | text |  |  |
| `contact_email` | text |  |  |
| `state` | text |  |  |
| `district` | text |  |  |
| `territory_id` | uuid |  |  |
| `owner_id` | uuid |  |  |
| `loss_reason` | text |  |  |
| `closed_note` | text |  |  |
| `closed_at` | timestamp with time zone |  |  |
| `stage_changed_at` | timestamp with time zone | not null | `now()` |
| `created_by` | uuid |  |  |
| `created_at` | timestamp with time zone | not null | `now()` |
| `updated_at` | timestamp with time zone | not null | `now()` |
| `source` | text |  |  |
| `campaign_id` | uuid |  |  |
| `partner_id` | uuid |  |  |

<details><summary>Unique and check constraints</summary>

```sql
UNIQUE UNIQUE (number)
CHECK ((amount >= (0)::numeric))
CHECK (((closed_note IS NULL) OR (length(closed_note) <= 1000)))
CHECK (((contact_email IS NULL) OR (length(contact_email) <= 200)))
CHECK (((contact_name IS NULL) OR (length(contact_name) <= 120)))
CHECK (((contact_phone IS NULL) OR (length(contact_phone) <= 30)))
CHECK (((district IS NULL) OR (length(district) <= 80)))
CHECK ((kind = ANY (ARRAY['new'::text, 'pilot_conversion'::text, 'renewal'::text, 'expansion'::text])))
CHECK (((loss_reason IS NULL) OR (length(loss_reason) <= 40)))
CHECK (((length(name) >= 2) AND (length(name) <= 160)))
CHECK (((next_step IS NULL) OR (length(next_step) <= 300)))
CHECK (((plan IS NULL) OR (plan = ANY (ARRAY['pilot'::text, 'aadhara'::text, 'sthamba'::text, 'shikhara'::text, 'mandala'::text]))))
CHECK (((price_per_student IS NULL) OR (price_per_student >= (0)::numeric)))
CHECK (((source IS NULL) OR (source = ANY (ARRAY['website'::text, 'partner'::text, 'referral'::text, 'outbound'::text, 'event'::text, 'inbound_call'::text, 'existing'::text, 'other'::text]))))
CHECK (((state IS NULL) OR (length(state) <= 60)))
CHECK (((students IS NULL) OR ((students >= 1) AND (students <= 999999))))
```

</details>

<details><summary>Indexes (9)</summary>

```sql
CREATE UNIQUE INDEX ops_opportunities_number_key ON public.ops_opportunities USING btree (number)
CREATE UNIQUE INDEX ops_opportunities_pkey ON public.ops_opportunities USING btree (id)
CREATE INDEX ix_ops_opportunities_campaign ON public.ops_opportunities USING btree (campaign_id)
CREATE INDEX ix_ops_opportunities_owner ON public.ops_opportunities USING btree (owner_id)
CREATE INDEX ix_ops_opportunities_partner ON public.ops_opportunities USING btree (partner_id)
CREATE INDEX ix_ops_opportunities_school ON public.ops_opportunities USING btree (school_id)
CREATE INDEX ix_ops_opportunities_stage ON public.ops_opportunities USING btree (stage)
CREATE INDEX ix_ops_opportunities_territory ON public.ops_opportunities USING btree (territory_id)
CREATE UNIQUE INDEX ux_ops_opportunities_enquiry ON public.ops_opportunities USING btree (enquiry_id) WHERE (enquiry_id IS NOT NULL)
```

</details>

### Table ops_opportunity_events

- **Kind:** table
- **Row-level security:** enabled, 0 policies
- **Grants:** `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `users` via `by_id`, `ops_opportunities` via `opportunity_id`
- **Written by routes:** `/api/ops/pipeline` (insert), `/api/ops/pipeline/[id]` (select/insert)

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | bigint | not null |  |
| `opportunity_id` | uuid | not null |  |
| `at` | timestamp with time zone | not null | `now()` |
| `kind` | text | not null |  |
| `body` | text |  |  |
| `from_stage` | text |  |  |
| `to_stage` | text |  |  |
| `by_id` | uuid |  |  |
| `by_name` | text |  |  |

<details><summary>Unique and check constraints</summary>

```sql
CHECK (((body IS NULL) OR (length(body) <= 6000)))
CHECK (((by_name IS NULL) OR (length(by_name) <= 120)))
CHECK ((kind = ANY (ARRAY['created'::text, 'stage'::text, 'note'::text, 'call'::text, 'meeting'::text, 'email'::text, 'whatsapp'::text, 'visit'::text, 'quote'::text, 'approval'::text, 'owner'::text, 'change'::text])))
```

</details>

<details><summary>Indexes (2)</summary>

```sql
CREATE UNIQUE INDEX ops_opportunity_events_pkey ON public.ops_opportunity_events USING btree (id)
CREATE INDEX ix_ops_opportunity_events_opp ON public.ops_opportunity_events USING btree (opportunity_id, at DESC)
```

</details>

### Table ops_opportunity_stages

- **Kind:** table
- **Row-level security:** enabled, 0 policies
- **Grants:** `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (key)`
- **Referenced by:** `ops_opportunities`
- **Written by routes:** `/api/ops/pipeline/settings` (select/upsert)
- **Read by routes:** `/api/ops/marketing`, `/api/ops/overview`, `/api/ops/partners`, `/api/ops/pipeline`, `/api/ops/pipeline/[id]`, `/api/ops/schools/[id]/crm`

| Column | Type | Null | Default |
|---|---|---|---|
| `key` | text | not null |  |
| `label` | text | not null |  |
| `sort` | integer | not null | `100` |
| `probability` | integer | not null |  |
| `kind` | text | not null | `'open'::text` |
| `active` | boolean | not null | `true` |

<details><summary>Unique and check constraints</summary>

```sql
CHECK ((key ~ '^[a-z0-9_]{2,40}$'::text))
CHECK ((kind = ANY (ARRAY['open'::text, 'won'::text, 'lost'::text])))
CHECK (((length(label) >= 2) AND (length(label) <= 60)))
CHECK (((probability >= 0) AND (probability <= 100)))
```

</details>

<details><summary>Indexes (1)</summary>

```sql
CREATE UNIQUE INDEX ops_opportunity_stages_pkey ON public.ops_opportunity_stages USING btree (key)
```

</details>

### Table ops_quotes

- **Kind:** table
- **Row-level security:** enabled, 0 policies
- **Grants:** `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `users` via `created_by`, `ops_opportunities` via `opportunity_id`
- **Referenced by:** `ops_quote_approvals`
- **Written by routes:** `/api/ops/pipeline/[id]` (select/insert/update)
- **Read by routes:** `/api/ops/overview`, `/api/ops/pipeline`

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `number` | bigint | not null | `nextval('ops_quote_number_seq'::regclass)` |
| `opportunity_id` | uuid | not null |  |
| `version` | integer | not null | `1` |
| `plan` | text | not null |  |
| `students` | integer | not null |  |
| `list_price` | numeric(10,2) |  |  |
| `price_per_student` | numeric(10,2) | not null |  |
| `discount_pct` | numeric(5,2) | not null | `0` |
| `term_months` | integer | not null | `12` |
| `valid_until` | date | not null |  |
| `notes` | text |  |  |
| `status` | text | not null | `'draft'::text` |
| `needs_role` | text |  |  |
| `created_by` | uuid |  |  |
| `created_by_name` | text |  |  |
| `created_at` | timestamp with time zone | not null | `now()` |
| `updated_at` | timestamp with time zone | not null | `now()` |

<details><summary>Unique and check constraints</summary>

```sql
UNIQUE UNIQUE (number)
UNIQUE UNIQUE (opportunity_id, version)
CHECK (((discount_pct >= (0)::numeric) AND (discount_pct <= (100)::numeric)))
CHECK (((list_price IS NULL) OR (list_price > (0)::numeric)))
CHECK (((needs_role IS NULL) OR (needs_role = ANY (ARRAY['regional_lead'::text, 'director'::text]))))
CHECK (((notes IS NULL) OR (length(notes) <= 3000)))
CHECK ((plan = ANY (ARRAY['aadhara'::text, 'sthamba'::text, 'shikhara'::text, 'mandala'::text])))
CHECK ((price_per_student > (0)::numeric))
CHECK ((status = ANY (ARRAY['draft'::text, 'pending_approval'::text, 'approved'::text, 'rejected'::text, 'sent'::text, 'accepted'::text, 'declined'::text, 'expired'::text])))
CHECK (((students >= 1) AND (students <= 999999)))
CHECK (((term_months >= 1) AND (term_months <= 60)))
```

</details>

<details><summary>Triggers (1)</summary>

```sql
CREATE TRIGGER trg_ops_quotes_guard BEFORE UPDATE ON public.ops_quotes FOR EACH ROW EXECUTE FUNCTION app.ops_quotes_guard()
```

</details>

<details><summary>Indexes (4)</summary>

```sql
CREATE UNIQUE INDEX ops_quotes_number_key ON public.ops_quotes USING btree (number)
CREATE UNIQUE INDEX ops_quotes_opportunity_id_version_key ON public.ops_quotes USING btree (opportunity_id, version)
CREATE UNIQUE INDEX ops_quotes_pkey ON public.ops_quotes USING btree (id)
CREATE INDEX ix_ops_quotes_status ON public.ops_quotes USING btree (status) WHERE (status = 'pending_approval'::text)
```

</details>

### Table ops_quote_approvals

- **Kind:** table
- **Row-level security:** enabled, 0 policies
- **Grants:** `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `users` via `by_id`, `ops_quotes` via `quote_id`
- **Written by routes:** `/api/ops/pipeline/[id]` (select/insert)

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `quote_id` | uuid | not null |  |
| `decision` | text | not null |  |
| `by_id` | uuid |  |  |
| `by_name` | text |  |  |
| `by_role` | text |  |  |
| `note` | text |  |  |
| `at` | timestamp with time zone | not null | `now()` |

<details><summary>Unique and check constraints</summary>

```sql
CHECK ((decision = ANY (ARRAY['requested'::text, 'approved'::text, 'rejected'::text])))
CHECK (((note IS NULL) OR (length(note) <= 1000)))
```

</details>

<details><summary>Indexes (2)</summary>

```sql
CREATE UNIQUE INDEX ops_quote_approvals_pkey ON public.ops_quote_approvals USING btree (id)
CREATE INDEX ix_ops_quote_approvals_quote ON public.ops_quote_approvals USING btree (quote_id, at)
```

</details>

### Table ops_discount_limits

- **Kind:** table
- **Row-level security:** enabled, 0 policies
- **Grants:** `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (role)`
- **Written by routes:** `/api/ops/pipeline/settings` (select/upsert)
- **Read by routes:** `/api/ops/overview`, `/api/ops/pipeline`, `/api/ops/pipeline/[id]`

| Column | Type | Null | Default |
|---|---|---|---|
| `role` | text | not null |  |
| `max_pct` | numeric(5,2) | not null |  |

<details><summary>Unique and check constraints</summary>

```sql
CHECK (((max_pct >= (0)::numeric) AND (max_pct <= (100)::numeric)))
CHECK ((role = ANY (ARRAY['director'::text, 'regional_lead'::text, 'sales_rep'::text, 'account_manager'::text])))
```

</details>

<details><summary>Indexes (1)</summary>

```sql
CREATE UNIQUE INDEX ops_discount_limits_pkey ON public.ops_discount_limits USING btree (role)
```

</details>

### Table ops_partners

- **Kind:** table
- **Row-level security:** enabled, 0 policies
- **Grants:** `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `users` via `created_by`
- **Referenced by:** `ops_commissions`, `ops_opportunities`
- **Written by routes:** `/api/ops/partners` (select/update/insert)
- **Read by routes:** `/api/ops/pipeline`, `/api/ops/pipeline/[id]`

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `name` | text | not null |  |
| `kind` | text | not null | `'dealer'::text` |
| `contact_name` | text |  |  |
| `phone` | text |  |  |
| `email` | text |  |  |
| `state` | text |  |  |
| `district` | text |  |  |
| `pan` | text |  |  |
| `gstin` | text |  |  |
| `commission_pct` | numeric(5,2) | not null | `0` |
| `commission_basis` | text | not null | `'first_year'::text` |
| `notes` | text |  |  |
| `active` | boolean | not null | `true` |
| `created_by` | uuid |  |  |
| `created_at` | timestamp with time zone | not null | `now()` |
| `updated_at` | timestamp with time zone | not null | `now()` |

<details><summary>Unique and check constraints</summary>

```sql
CHECK ((commission_basis = ANY (ARRAY['first_year'::text, 'every_year'::text])))
CHECK (((commission_pct >= (0)::numeric) AND (commission_pct <= (100)::numeric)))
CHECK (((contact_name IS NULL) OR (length(contact_name) <= 120)))
CHECK (((district IS NULL) OR (length(district) <= 80)))
CHECK (((email IS NULL) OR (length(email) <= 200)))
CHECK (((gstin IS NULL) OR (length(gstin) <= 20)))
CHECK ((kind = ANY (ARRAY['dealer'::text, 'referral'::text, 'reseller'::text, 'consultant'::text, 'other'::text])))
CHECK (((length(name) >= 2) AND (length(name) <= 160)))
CHECK (((notes IS NULL) OR (length(notes) <= 2000)))
CHECK (((pan IS NULL) OR (length(pan) <= 20)))
CHECK (((phone IS NULL) OR (length(phone) <= 30)))
CHECK (((state IS NULL) OR (length(state) <= 60)))
```

</details>

<details><summary>Indexes (2)</summary>

```sql
CREATE UNIQUE INDEX ops_partners_pkey ON public.ops_partners USING btree (id)
CREATE UNIQUE INDEX ux_ops_partners_name ON public.ops_partners USING btree (lower(name))
```

</details>

### Table ops_commission_rules

- **Kind:** table
- **Row-level security:** enabled, 0 policies
- **Grants:** `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (key)`
- **Written by routes:** `/api/ops/partners` (select/upsert)
- **Read by routes:** `/api/ops/pipeline/[id]`

| Column | Type | Null | Default |
|---|---|---|---|
| `key` | text | not null |  |
| `rate_pct` | numeric(5,2) | not null | `0` |
| `active` | boolean | not null | `false` |

<details><summary>Unique and check constraints</summary>

```sql
CHECK ((key = ANY (ARRAY['deal_owner'::text, 'owner_manager'::text])))
CHECK (((rate_pct >= (0)::numeric) AND (rate_pct <= (100)::numeric)))
```

</details>

<details><summary>Indexes (1)</summary>

```sql
CREATE UNIQUE INDEX ops_commission_rules_pkey ON public.ops_commission_rules USING btree (key)
```

</details>

### Table ops_commissions

- **Kind:** table
- **Row-level security:** enabled, 0 policies
- **Grants:** `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `users` via `approved_by`, `users` via `created_by`, `users` via `operator_id`, `ops_opportunities` via `opportunity_id`, `ops_partners` via `partner_id`, `schools` via `school_id`
- **Written by routes:** `/api/ops/partners` (select/insert/update), `/api/ops/pipeline/[id]` (select/update/insert)
- **Read by routes:** `/api/ops/schools/[id]/crm`

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `opportunity_id` | uuid |  |  |
| `school_id` | uuid |  |  |
| `payee_kind` | text | not null |  |
| `partner_id` | uuid |  |  |
| `operator_id` | uuid |  |  |
| `payee_name` | text | not null |  |
| `reason` | text | not null |  |
| `basis_amount` | numeric(14,2) |  |  |
| `rate_pct` | numeric(5,2) |  |  |
| `amount` | numeric(14,2) | not null |  |
| `status` | text | not null | `'accrued'::text` |
| `auto` | boolean | not null | `false` |
| `accrued_at` | timestamp with time zone | not null | `now()` |
| `approved_by` | uuid |  |  |
| `approved_at` | timestamp with time zone |  |  |
| `paid_on` | date |  |  |
| `payment_ref` | text |  |  |
| `note` | text |  |  |
| `created_by` | uuid |  |  |

<details><summary>Unique and check constraints</summary>

```sql
CHECK ((amount > (0)::numeric))
CHECK (((basis_amount IS NULL) OR (basis_amount >= (0)::numeric)))
CHECK (((note IS NULL) OR (length(note) <= 500)))
CHECK ((payee_kind = ANY (ARRAY['partner'::text, 'operator'::text, 'other'::text])))
CHECK (((length(payee_name) >= 2) AND (length(payee_name) <= 160)))
CHECK (((payment_ref IS NULL) OR (length(payment_ref) <= 120)))
CHECK (((rate_pct IS NULL) OR ((rate_pct >= (0)::numeric) AND (rate_pct <= (100)::numeric))))
CHECK (((length(reason) >= 2) AND (length(reason) <= 200)))
CHECK ((status = ANY (ARRAY['accrued'::text, 'approved'::text, 'paid'::text, 'cancelled'::text])))
```

</details>

<details><summary>Triggers (1)</summary>

```sql
CREATE TRIGGER trg_ops_commissions_guard BEFORE DELETE OR UPDATE ON public.ops_commissions FOR EACH ROW EXECUTE FUNCTION app.ops_commissions_guard()
```

</details>

<details><summary>Indexes (4)</summary>

```sql
CREATE UNIQUE INDEX ops_commissions_pkey ON public.ops_commissions USING btree (id)
CREATE INDEX ix_ops_commissions_opp ON public.ops_commissions USING btree (opportunity_id)
CREATE INDEX ix_ops_commissions_partner ON public.ops_commissions USING btree (partner_id)
CREATE INDEX ix_ops_commissions_status ON public.ops_commissions USING btree (status)
```

</details>

### Table ops_campaigns

- **Kind:** table
- **Row-level security:** enabled, 0 policies
- **Grants:** `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `users` via `created_by`
- **Referenced by:** `enquiries`, `ops_marketing_spend`, `ops_opportunities`
- **Written by routes:** `/api/ops/marketing` (select/update/insert; maybe: select)
- **Read by routes:** `/api/ops/enquiries`, `/api/ops/pipeline`, `/api/ops/pipeline/[id]`

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `name` | text | not null |  |
| `code` | text | not null |  |
| `channel` | text | not null | `'other'::text` |
| `starts_on` | date |  |  |
| `ends_on` | date |  |  |
| `budget` | numeric(14,2) |  |  |
| `notes` | text |  |  |
| `active` | boolean | not null | `true` |
| `created_by` | uuid |  |  |
| `created_at` | timestamp with time zone | not null | `now()` |

<details><summary>Unique and check constraints</summary>

```sql
CHECK (((notes IS NULL) OR (length(notes) <= 2000)))
CHECK (((budget IS NULL) OR (budget >= (0)::numeric)))
CHECK ((channel = ANY (ARRAY['search_ads'::text, 'social_ads'::text, 'event'::text, 'print'::text, 'outbound'::text, 'referral_programme'::text, 'content'::text, 'partner'::text, 'other'::text])))
CHECK (((ends_on IS NULL) OR (starts_on IS NULL) OR (ends_on >= starts_on)))
CHECK ((code ~ '^[a-z0-9_-]{2,60}$'::text))
CHECK (((length(name) >= 2) AND (length(name) <= 160)))
```

</details>

<details><summary>Indexes (2)</summary>

```sql
CREATE UNIQUE INDEX ops_campaigns_pkey ON public.ops_campaigns USING btree (id)
CREATE UNIQUE INDEX ux_ops_campaigns_code ON public.ops_campaigns USING btree (code)
```

</details>

### Table ops_marketing_spend

- **Kind:** table
- **Row-level security:** enabled, 0 policies
- **Grants:** `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `ops_campaigns` via `campaign_id`, `enquiries` via `enquiry_id`, `users` via `entered_by`, `ops_opportunities` via `opportunity_id`, `schools` via `school_id`
- **Written by routes:** `/api/ops/marketing` (select/insert/delete; maybe: select)
- **Read by routes:** `/api/ops/pipeline/[id]`, `/api/ops/schools/[id]/crm`

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `campaign_id` | uuid |  |  |
| `opportunity_id` | uuid |  |  |
| `enquiry_id` | uuid |  |  |
| `school_id` | uuid |  |  |
| `spent_on` | date | not null |  |
| `amount` | numeric(14,2) | not null |  |
| `category` | text | not null | `'other'::text` |
| `note` | text |  |  |
| `entered_by` | uuid |  |  |
| `created_at` | timestamp with time zone | not null | `now()` |

<details><summary>Unique and check constraints</summary>

```sql
CHECK ((amount > (0)::numeric))
CHECK ((category = ANY (ARRAY['ads'::text, 'event'::text, 'travel'::text, 'print'::text, 'gifts'::text, 'agency'::text, 'pilot_kit'::text, 'other'::text])))
CHECK (((campaign_id IS NOT NULL) OR (opportunity_id IS NOT NULL) OR (enquiry_id IS NOT NULL) OR (school_id IS NOT NULL)))
CHECK (((note IS NULL) OR (length(note) <= 500)))
```

</details>

<details><summary>Indexes (4)</summary>

```sql
CREATE UNIQUE INDEX ops_marketing_spend_pkey ON public.ops_marketing_spend USING btree (id)
CREATE INDEX ix_ops_marketing_spend_campaign ON public.ops_marketing_spend USING btree (campaign_id)
CREATE INDEX ix_ops_marketing_spend_opp ON public.ops_marketing_spend USING btree (opportunity_id)
CREATE INDEX ix_ops_marketing_spend_school ON public.ops_marketing_spend USING btree (school_id)
```

</details>

### Table enquiries

- **Kind:** table
- **Row-level security:** enabled, 0 policies
- **Grants:** `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `ops_campaigns` via `campaign_id`, `users` via `handled_by`, `ops_operators` via `owner_id`, `ops_territories` via `territory_id`
- **Referenced by:** `ops_marketing_spend`, `ops_opportunities`, `ops_tasks`
- **Written by routes:** `/api/ops/enquiries` (select/update), `/api/ops/pipeline` (select/update), `/api/ops/schools` (select/update), `/api/ops/territories` (select/update)
- **Read by routes:** `/api/ops/marketing`, `/api/ops/overview`, `/api/ops/pipeline/[id]`

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `submission_id` | uuid | not null |  |
| `name` | text | not null |  |
| `email` | text | not null |  |
| `school` | text | not null |  |
| `role` | text | not null |  |
| `phone` | text |  |  |
| `message` | text | not null |  |
| `consent` | boolean | not null |  |
| `source_origin` | text | not null |  |
| `status` | text | not null | `'new'::text` |
| `note` | text |  |  |
| `handled_by` | uuid |  |  |
| `created_at` | timestamp with time zone | not null | `now()` |
| `updated_at` | timestamp with time zone | not null | `now()` |
| `designation` | text |  |  |
| `city` | text |  |  |
| `student_count` | integer |  |  |
| `board` | text |  |  |
| `improvement_goal` | text |  |  |
| `state` | text |  |  |
| `district` | text |  |  |
| `territory_id` | uuid |  |  |
| `owner_id` | uuid |  |  |
| `source` | text |  |  |
| `campaign_id` | uuid |  |  |
| `utm` | jsonb |  |  |

<details><summary>Unique and check constraints</summary>

```sql
UNIQUE UNIQUE (submission_id)
CHECK (consent)
CHECK (((board IS NULL) OR (board = ANY (ARRAY['cbse'::text, 'icse'::text, 'state'::text, 'ib'::text, 'cambridge'::text, 'other'::text]))))
CHECK (((city IS NULL) OR (char_length(city) <= 100)))
CHECK (((designation IS NULL) OR (char_length(designation) <= 100)))
CHECK (((district IS NULL) OR (length(district) <= 80)))
CHECK (((char_length(email) >= 3) AND (char_length(email) <= 254)))
CHECK (((improvement_goal IS NULL) OR (improvement_goal = ANY (ARRAY['learning-gaps'::text, 'learning-outcomes'::text, 'teacher-workload'::text, 'academic-visibility'::text, 'parent-engagement'::text, 'explore-ai'::text, 'full-platform'::text]))))
CHECK (((char_length(message) >= 10) AND (char_length(message) <= 3000)))
CHECK (((char_length(name) >= 2) AND (char_length(name) <= 100)))
CHECK (((note IS NULL) OR (char_length(note) <= 2000)))
CHECK (((phone IS NULL) OR (char_length(phone) <= 30)))
CHECK ((role = ANY (ARRAY['school-leader'::text, 'administrator'::text, 'teacher'::text, 'parent'::text, 'other'::text])))
CHECK (((char_length(school) >= 2) AND (char_length(school) <= 160)))
CHECK (((source IS NULL) OR (length(source) <= 40)))
CHECK (((state IS NULL) OR (length(state) <= 60)))
CHECK ((status = ANY (ARRAY['new'::text, 'contacted'::text, 'qualified'::text, 'closed'::text, 'spam'::text])))
CHECK (((student_count IS NULL) OR ((student_count >= 1) AND (student_count <= 999999))))
```

</details>

<details><summary>Triggers (1)</summary>

```sql
CREATE TRIGGER trg_touch_enquiries BEFORE UPDATE ON public.enquiries FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at()
```

</details>

<details><summary>Indexes (6)</summary>

```sql
CREATE UNIQUE INDEX enquiries_pkey ON public.enquiries USING btree (id)
CREATE UNIQUE INDEX enquiries_submission_id_key ON public.enquiries USING btree (submission_id)
CREATE INDEX idx_enquiries_status ON public.enquiries USING btree (status, created_at DESC)
CREATE INDEX ix_enquiries_campaign ON public.enquiries USING btree (campaign_id)
CREATE INDEX ix_enquiries_owner ON public.enquiries USING btree (owner_id)
CREATE INDEX ix_enquiries_territory ON public.enquiries USING btree (territory_id)
```

</details>

### Table ops_access_grants

- **Kind:** table
- **Row-level security:** enabled, 0 policies
- **Grants:** `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `users` via `operator_id`, `schools` via `school_id`
- **Referenced by:** `import_jobs`, `ops_access_events`
- **Written by routes:** `/api/ops/schools/[id]/access` (select/insert/update)
- **Read by routes:** `/api/admin/access`, `/api/ops/desk/[id]`, `/api/ops/schools/[id]/account`, `/api/ops/schools/[id]/crm`, `/api/ops/schools/[id]/import`, `/api/ops/schools/[id]/import/[jobId]`, `/api/ops/schools/[id]/inspect`

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `operator_id` | uuid |  |  |
| `operator_email` | text | not null |  |
| `operator_role` | text | not null |  |
| `school_id` | uuid | not null |  |
| `scope` | text | not null | `'records'::text` |
| `reason` | text | not null |  |
| `case_ref` | text |  |  |
| `started_at` | timestamp with time zone | not null | `now()` |
| `expires_at` | timestamp with time zone | not null |  |
| `ended_at` | timestamp with time zone |  |  |

<details><summary>Unique and check constraints</summary>

```sql
CHECK (((case_ref IS NULL) OR (length(case_ref) <= 80)))
CHECK (((length(reason) >= 10) AND (length(reason) <= 500)))
CHECK (((expires_at > started_at) AND (expires_at <= (started_at + '00:30:00'::interval))))
CHECK ((scope = ANY (ARRAY['records'::text, 'view_as'::text, 'import'::text])))
```

</details>

<details><summary>Triggers (1)</summary>

```sql
CREATE TRIGGER trg_ops_access_grants_guard BEFORE DELETE OR UPDATE ON public.ops_access_grants FOR EACH ROW EXECUTE FUNCTION app.ops_access_grants_guard()
```

</details>

<details><summary>Indexes (3)</summary>

```sql
CREATE UNIQUE INDEX ops_access_grants_pkey ON public.ops_access_grants USING btree (id)
CREATE INDEX ix_ops_access_grants_operator ON public.ops_access_grants USING btree (operator_id, expires_at DESC)
CREATE INDEX ix_ops_access_grants_school ON public.ops_access_grants USING btree (school_id, started_at DESC)
```

</details>

### Table ops_access_events

- **Kind:** table
- **Row-level security:** enabled, 0 policies
- **Grants:** `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `ops_access_grants` via `grant_id`
- **Written by routes:** `/api/ops/schools/[id]/import` (insert), `/api/ops/schools/[id]/import/[jobId]` (insert), `/api/ops/schools/[id]/inspect` (insert)
- **Read by routes:** `/api/admin/access`, `/api/ops/schools/[id]/account`

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | bigint | not null |  |
| `grant_id` | uuid | not null |  |
| `at` | timestamp with time zone | not null | `now()` |
| `action` | text | not null |  |
| `target` | text |  |  |

<details><summary>Unique and check constraints</summary>

```sql
CHECK ((length(action) <= 80))
CHECK (((target IS NULL) OR (length(target) <= 300)))
```

</details>

<details><summary>Indexes (2)</summary>

```sql
CREATE UNIQUE INDEX ops_access_events_pkey ON public.ops_access_events USING btree (id)
CREATE INDEX ix_ops_access_events_grant ON public.ops_access_events USING btree (grant_id, at)
```

</details>

### Table ops_job_runs

- **Kind:** table
- **Row-level security:** enabled, 0 policies
- **Grants:** `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **Written by routes:** `/api/ops/delivery` (select/insert)

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | bigint | not null |  |
| `job` | text | not null |  |
| `started_at` | timestamp with time zone | not null | `now()` |
| `finished_at` | timestamp with time zone |  |  |
| `ok` | boolean |  |  |
| `detail` | jsonb | not null | `'{}'::jsonb` |
| `triggered_by` | text | not null | `'schedule'::text` |

<details><summary>Unique and check constraints</summary>

```sql
CHECK ((length(job) <= 60))
CHECK ((length(triggered_by) <= 200))
```

</details>

<details><summary>Indexes (2)</summary>

```sql
CREATE UNIQUE INDEX ops_job_runs_pkey ON public.ops_job_runs USING btree (id)
CREATE INDEX ix_ops_job_runs_job ON public.ops_job_runs USING btree (job, started_at DESC)
```

</details>

### Table qa_runs

- **Kind:** table
- **Row-level security:** enabled, 0 policies
- **Grants:** `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `qa_upload_tokens` via `token_id`
- **Written by routes:** `/api/ops/qa` (select/update/delete), `/api/qa/runs` (insert/select/update), `/api/qa/runs/[id]/complete` (select/update)

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `token_id` | uuid |  |  |
| `status` | text | not null | `'uploading'::text` |
| `started_at` | timestamp with time zone | not null |  |
| `finished_at` | timestamp with time zone | not null |  |
| `machine` | text |  |  |
| `git_commit` | text |  |  |
| `git_branch` | text |  |  |
| `git_dirty` | boolean | not null | `false` |
| `target` | text |  |  |
| `stages` | jsonb | not null | `'[]'::jsonb` |
| `totals` | jsonb | not null | `'{}'::jsonb` |
| `failures` | jsonb | not null | `'[]'::jsonb` |
| `files` | jsonb | not null | `'[]'::jsonb` |
| `pinned` | boolean | not null | `false` |
| `pin_note` | text |  |  |
| `files_purged_at` | timestamp with time zone |  |  |
| `created_at` | timestamp with time zone | not null | `now()` |

<details><summary>Unique and check constraints</summary>

```sql
CHECK ((finished_at >= started_at))
CHECK ((jsonb_typeof(failures) = 'array'::text))
CHECK ((jsonb_typeof(files) = 'array'::text))
CHECK ((length(git_branch) <= 200))
CHECK ((git_commit ~ '^[0-9a-f]{7,40}$'::text))
CHECK ((length(machine) <= 120))
CHECK ((length(pin_note) <= 300))
CHECK ((jsonb_typeof(stages) = 'array'::text))
CHECK ((status = ANY (ARRAY['uploading'::text, 'pass'::text, 'fail'::text])))
CHECK ((length(target) <= 300))
CHECK ((jsonb_typeof(totals) = 'object'::text))
```

</details>

<details><summary>Indexes (2)</summary>

```sql
CREATE UNIQUE INDEX qa_runs_pkey ON public.qa_runs USING btree (id)
CREATE INDEX idx_qa_runs_started ON public.qa_runs USING btree (started_at DESC)
```

</details>

### Table qa_upload_tokens

- **Kind:** table
- **Row-level security:** enabled, 0 policies
- **Grants:** `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `users` via `created_by`
- **Referenced by:** `qa_runs`
- **Written by routes:** `/api/ops/qa` (select/insert/update), `/api/qa/runs` (select/update), `/api/qa/runs/[id]/complete` (select/update)

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | not null | `gen_random_uuid()` |
| `label` | text | not null |  |
| `token_hash` | text | not null |  |
| `created_by` | uuid |  |  |
| `created_at` | timestamp with time zone | not null | `now()` |
| `last_used_at` | timestamp with time zone |  |  |
| `revoked_at` | timestamp with time zone |  |  |

<details><summary>Unique and check constraints</summary>

```sql
UNIQUE UNIQUE (token_hash)
CHECK (((length(TRIM(BOTH FROM label)) >= 1) AND (length(TRIM(BOTH FROM label)) <= 80)))
CHECK ((token_hash ~ '^[0-9a-f]{64}$'::text))
```

</details>

<details><summary>Indexes (2)</summary>

```sql
CREATE UNIQUE INDEX qa_upload_tokens_pkey ON public.qa_upload_tokens USING btree (id)
CREATE UNIQUE INDEX qa_upload_tokens_token_hash_key ON public.qa_upload_tokens USING btree (token_hash)
```

</details>

## Observability & metering

### Table app_errors

- **Kind:** table
- **Row-level security:** enabled, 0 policies
- **Grants:** `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `app_error_groups` via `fingerprint`, `schools` via `school_id`, `users` via `user_id`
- **Read by routes:** `/api/ops/errors`, `/api/ops/overview`, `/api/ops/schools`, `/api/ops/schools/[id]`, `/api/ops/traffic`
- **SQL functions:** `log_app_error()` insert/delete, `ops_error_stats()` select, `ops_school_metrics()` select

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | bigint | not null |  |
| `fingerprint` | text | not null |  |
| `at` | timestamp with time zone | not null | `now()` |
| `source` | text | not null |  |
| `kind` | text | not null |  |
| `message` | text | not null |  |
| `stack` | text |  |  |
| `route` | text |  |  |
| `method` | text |  |  |
| `path` | text |  |  |
| `school_id` | uuid |  |  |
| `user_id` | uuid |  |  |
| `user_role` | text |  |  |
| `release` | text |  |  |
| `environment` | text |  |  |
| `user_agent` | text |  |  |
| `digest` | text |  |  |
| `repeats` | integer | not null | `1` |
| `context` | jsonb | not null | `'{}'::jsonb` |

<details><summary>Unique and check constraints</summary>

```sql
CHECK ((length(message) <= 2000))
CHECK (((method IS NULL) OR (length(method) <= 10)))
CHECK (((path IS NULL) OR (length(path) <= 500)))
CHECK ((repeats >= 1))
CHECK (((route IS NULL) OR (length(route) <= 300)))
CHECK (((stack IS NULL) OR (length(stack) <= 8000)))
CHECK (((user_agent IS NULL) OR (length(user_agent) <= 400)))
```

</details>

<details><summary>Indexes (3)</summary>

```sql
CREATE UNIQUE INDEX app_errors_pkey ON public.app_errors USING btree (id)
CREATE INDEX ix_app_errors_at ON public.app_errors USING btree (at DESC)
CREATE INDEX ix_app_errors_group ON public.app_errors USING btree (fingerprint, at DESC)
```

</details>

### Table app_error_groups

- **Kind:** table
- **Row-level security:** enabled, 0 policies
- **Grants:** `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (fingerprint)`
- **References:** `users` via `resolved_by`
- **Referenced by:** `app_errors`
- **Written by routes:** `/api/ops/errors` (select/update)
- **Read by routes:** `/api/ops/overview`
- **SQL functions:** `log_app_error()` insert

| Column | Type | Null | Default |
|---|---|---|---|
| `fingerprint` | text | not null |  |
| `source` | text | not null |  |
| `kind` | text | not null |  |
| `message` | text | not null |  |
| `route` | text |  |  |
| `status` | text | not null | `'open'::text` |
| `events` | bigint | not null | `0` |
| `first_seen` | timestamp with time zone | not null | `now()` |
| `last_seen` | timestamp with time zone | not null | `now()` |
| `last_release` | text |  |  |
| `last_environment` | text |  |  |
| `resolved_at` | timestamp with time zone |  |  |
| `resolved_by` | uuid |  |  |
| `regressed_at` | timestamp with time zone |  |  |
| `note` | text |  |  |

<details><summary>Unique and check constraints</summary>

```sql
CHECK (((length(fingerprint) >= 8) AND (length(fingerprint) <= 80)))
CHECK ((kind = ANY (ARRAY['uncaught'::text, 'logged'::text, 'client'::text, 'render'::text, 'unhandled'::text])))
CHECK ((length(message) <= 2000))
CHECK (((note IS NULL) OR (length(note) <= 2000)))
CHECK (((route IS NULL) OR (length(route) <= 300)))
CHECK ((source = ANY (ARRAY['server'::text, 'client'::text])))
CHECK ((status = ANY (ARRAY['open'::text, 'resolved'::text, 'ignored'::text])))
```

</details>

<details><summary>Indexes (2)</summary>

```sql
CREATE UNIQUE INDEX app_error_groups_pkey ON public.app_error_groups USING btree (fingerprint)
CREATE INDEX ix_app_error_groups_seen ON public.app_error_groups USING btree (last_seen DESC)
```

</details>

### Table request_log

- **Kind:** table
- **Row-level security:** enabled, 0 policies
- **Grants:** `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **Read by routes:** `/api/ops/traffic`
- **SQL functions:** `ops_request_stats()` select

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | bigint | not null |  |
| `at` | timestamp with time zone | not null | `now()` |
| `method` | text | not null |  |
| `route` | text | not null |  |
| `user_id` | uuid |  |  |
| `user_role` | text |  |  |
| `school_id` | uuid |  |  |
| `duration_ms` | integer | not null |  |
| `release` | text |  |  |

<details><summary>Unique and check constraints</summary>

```sql
CHECK ((duration_ms >= 0))
CHECK ((length(method) <= 10))
CHECK (((release IS NULL) OR (length(release) <= 60)))
CHECK ((length(route) <= 300))
CHECK (((user_role IS NULL) OR (length(user_role) <= 30)))
```

</details>

<details><summary>Indexes (4)</summary>

```sql
CREATE UNIQUE INDEX request_log_pkey ON public.request_log USING btree (id)
CREATE INDEX ix_request_log_at ON public.request_log USING btree (at DESC)
CREATE INDEX ix_request_log_school ON public.request_log USING btree (school_id, at DESC)
CREATE INDEX ix_request_log_user ON public.request_log USING btree (user_id, at DESC)
```

</details>

### Table ai_usage

- **Kind:** table
- **Row-level security:** enabled, 0 policies
- **Grants:** `service_role` delete/insert/references/select/trigger/truncate/update
- **Primary key:** `PRIMARY KEY (id)`
- **References:** `schools` via `school_id`, `users` via `user_id`
- **Read by routes:** `/api/ops/delivery`, `/api/ops/overview`, `/api/ops/schools`, `/api/ops/schools/[id]`, `/api/ops/traffic`, `/api/ops/usage`
- **SQL functions:** `ops_ai_usage()` select, `ops_school_ai()` select, `ops_school_metrics()` select

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | bigint | not null |  |
| `at` | timestamp with time zone | not null | `now()` |
| `feature` | text | not null |  |
| `model` | text | not null |  |
| `user_id` | uuid |  |  |
| `school_id` | uuid |  |  |
| `input_tokens` | integer | not null | `0` |
| `output_tokens` | integer | not null | `0` |
| `thinking_tokens` | integer | not null | `0` |
| `cached_tokens` | integer | not null | `0` |
| `cost_usd` | numeric(14,8) |  |  |
| `ok` | boolean | not null | `true` |
| `latency_ms` | integer |  |  |
| `error` | text |  |  |

<details><summary>Unique and check constraints</summary>

```sql
CHECK ((cached_tokens >= 0))
CHECK (((length(feature) >= 1) AND (length(feature) <= 60)))
CHECK ((input_tokens >= 0))
CHECK (((length(model) >= 1) AND (length(model) <= 80)))
CHECK ((output_tokens >= 0))
CHECK ((thinking_tokens >= 0))
```

</details>

<details><summary>Indexes (3)</summary>

```sql
CREATE UNIQUE INDEX ai_usage_pkey ON public.ai_usage USING btree (id)
CREATE INDEX idx_ai_usage_at ON public.ai_usage USING btree (at DESC)
CREATE INDEX idx_ai_usage_school_at ON public.ai_usage USING btree (school_id, at DESC)
```

</details>

## Sandbox seed schema

### Table sandbox_seed.chapters

- **Kind:** table
- **Row-level security:** **disabled**
- **Grants:** none to API roles
- **Primary key:** `PRIMARY KEY (id)`

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | integer | not null | `1` |
| `doc` | jsonb | not null |  |

<details><summary>Unique and check constraints</summary>

```sql
CHECK ((id = 1))
```

</details>

<details><summary>Indexes (1)</summary>

```sql
CREATE UNIQUE INDEX chapters_pkey ON sandbox_seed.chapters USING btree (id)
```

</details>

### Table sandbox_seed.notes

- **Kind:** table
- **Row-level security:** **disabled**
- **Grants:** none to API roles
- **Primary key:** `PRIMARY KEY (k)`

| Column | Type | Null | Default |
|---|---|---|---|
| `k` | text | not null |  |
| `v` | text |  |  |

<details><summary>Indexes (1)</summary>

```sql
CREATE UNIQUE INDEX notes_pkey ON sandbox_seed.notes USING btree (k)
```

</details>

