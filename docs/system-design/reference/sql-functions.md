# SQL functions

> Generated 2026-10-29 from the code on this branch and the 18 migrations in `supabase/migrations/` (replayed into a scratch Postgres 16 with Supabase stubs). Every function in the `public` and `app` schemas: signature, security mode, who may execute it, the tables its body touches (parsed from the body), what calls it (routes by rpc, other functions, triggers, cron) and its source. Do not hand-edit; see [../README.md](../README.md#how-this-was-produced).

| Function | Security | Execute | Called by routes | Fired by triggers on |
|---|---|---|---|---|
| [`admin_close_day()`](#fn-admin-close-day) | definer | postgres, service_role | 1 |  |
| [`admin_decide_concession()`](#fn-admin-decide-concession) | definer | postgres, service_role | 1 |  |
| [`admin_invoice_student()`](#fn-admin-invoice-student) | definer | postgres, service_role | 1 |  |
| [`admin_raise_invoices()`](#fn-admin-raise-invoices) | definer | postgres, service_role | 1 |  |
| [`admin_record_payment()`](#fn-admin-record-payment) | definer | postgres, service_role | 1 |  |
| [`admin_teacher_work()`](#fn-admin-teacher-work) | definer | authenticated, postgres, service_role | 3 |  |
| [`admission_ensure_stages()`](#fn-admission-ensure-stages) | definer | postgres, service_role | 2 |  |
| [`admission_move()`](#fn-admission-move) | definer | postgres, service_role | 1 |  |
| [`admission_offer_cancel()`](#fn-admission-offer-cancel) | definer | postgres, service_role | 1 |  |
| [`admission_offer_decide()`](#fn-admission-offer-decide) | definer | postgres, service_role | 1 |  |
| [`admission_offer_propose()`](#fn-admission-offer-propose) | definer | postgres, service_role | 1 |  |
| [`admission_offer_respond()`](#fn-admission-offer-respond) | definer | postgres, service_role | 1 |  |
| [`admission_promote()`](#fn-admission-promote) | definer | postgres, service_role | 3 |  |
| [`admission_set_stages()`](#fn-admission-set-stages) | definer | postgres, service_role | 1 |  |
| [`admission_sweep()`](#fn-admission-sweep) | definer | postgres, service_role | 0 |  |
| [`app.admission_close_offer()`](#fn-app-admission-close-offer) | definer | postgres | 2 |  |
| [`app.admission_floor()`](#fn-app-admission-floor) | definer | postgres | 3 |  |
| [`app.admission_issue()`](#fn-app-admission-issue) | definer | postgres | 3 |  |
| [`app.admission_lock_grade()`](#fn-app-admission-lock-grade) | invoker | postgres | 3 |  |
| [`app.admission_offer_backfill()`](#fn-app-admission-offer-backfill) | definer | postgres | 0 | admission_applicants |
| [`app.admission_rank()`](#fn-app-admission-rank) | definer | postgres | 2 |  |
| [`app.admission_seats_left()`](#fn-app-admission-seats-left) | definer | postgres | 3 |  |
| [`app.admission_today()`](#fn-app-admission-today) | invoker | PUBLIC(default) | 3 |  |
| [`app.audit()`](#fn-app-audit) | definer | authenticated, postgres | 0 | academic_events, admission_applicants, admission_documents, admission_offers, admission_seats, admission_stages, attendance, attendance_month_reviews, attendance_settings, cc_groups, cc_memberships, certificate_settings, certificate_types, certificates, class_subjects, comp_off_grants, consents, counselling_cases, counselling_referrals, counselling_sessions, cover_assignments, discipline_actions, emergency_contacts, enrolments, exam_assessments, exam_class_terms, exam_schemes, exam_sheets, exam_terms, family_members, fee_concession_requests, fee_day_closes, fee_invoices, fee_payments, fee_reminders, fee_structures, guardians, health_events, house_members, house_points, houses, hr_grades, hr_posts, incidents, kirti_entries, leave_policies, leave_requests, legacy_results, pay_items, pay_runs, payroll_settings, probe_acks, role_grants, safeguarding_log, school_filings, schools, sibling_links, staff_absences, staff_day_marks, staff_documents, staff_exits, staff_jobs, staff_members, staff_shift_plans, statutory_overrides, student_change_requests, student_documents, student_health, student_subjects, subject_leads, submissions, teacher_subjects, timetable_versions, users, visit_sessions |
| [`app.audit_exam_marks()`](#fn-app-audit-exam-marks) | definer | PUBLIC(default) | 0 | exam_marks |
| [`app.audit_fields_only()`](#fn-app-audit-fields-only) | definer | PUBLIC(default) | 0 | staff_profiles, staff_statutory |
| [`app.audit_students()`](#fn-app-audit-students) | definer | PUBLIC(default) | 0 | students |
| [`app.audit_touch_only()`](#fn-app-audit-touch-only) | definer | PUBLIC(default) | 0 | pay_adjustments, staff_loans, staff_pay_settings, staff_salaries, tax_declarations |
| [`app.bootstrap_school_admin()`](#fn-app-bootstrap-school-admin) | definer | authenticated, postgres, service_role | 0 | users |
| [`app.can_see_thread()`](#fn-app-can-see-thread) | definer | authenticated, postgres | 0 |  |
| [`app.check_timetable_slot()`](#fn-app-check-timetable-slot) | invoker | PUBLIC(default) | 0 | timetable_slots |
| [`app.cp_reader()`](#fn-app-cp-reader) | definer | authenticated, postgres, service_role | 0 |  |
| [`app.current_school_id()`](#fn-app-current-school-id) | definer | authenticated, postgres | 3 |  |
| [`app.current_session()`](#fn-app-current-session) | definer | PUBLIC(default) | 1 |  |
| [`app.day_closed()`](#fn-app-day-closed) | definer | authenticated, postgres, service_role | 6 |  |
| [`app.enrol_core()`](#fn-app-enrol-core) | definer | postgres | 0 |  |
| [`app.erase_health()`](#fn-app-erase-health) | definer | PUBLIC(default) | 0 |  |
| [`app.grade_from_class()`](#fn-app-grade-from-class) | invoker | PUBLIC(default) | 4 |  |
| [`app.grade_of()`](#fn-app-grade-of) | invoker | authenticated, postgres | 9 |  |
| [`app.guard_certificate()`](#fn-app-guard-certificate) | invoker | PUBLIC(default) | 0 | certificates |
| [`app.guard_director()`](#fn-app-guard-director) | definer | postgres | 0 | ops_operators |
| [`app.guard_exam_marks()`](#fn-app-guard-exam-marks) | invoker | PUBLIC(default) | 0 | exam_marks |
| [`app.guard_exam_scheme_grades()`](#fn-app-guard-exam-scheme-grades) | invoker | PUBLIC(default) | 0 | exam_schemes |
| [`app.guard_exam_student_terms()`](#fn-app-guard-exam-student-terms) | invoker | PUBLIC(default) | 0 | exam_student_terms |
| [`app.guard_fee_payment()`](#fn-app-guard-fee-payment) | invoker | authenticated, postgres | 0 | fee_payments |
| [`app.guard_health()`](#fn-app-guard-health) | definer | PUBLIC(default) | 0 | health_events, student_health |
| [`app.guard_notification_update()`](#fn-app-guard-notification-update) | invoker | authenticated, postgres | 0 | notifications |
| [`app.guard_pay_run_lines()`](#fn-app-guard-pay-run-lines) | invoker | PUBLIC(default) | 0 | pay_run_lines |
| [`app.guard_pay_runs()`](#fn-app-guard-pay-runs) | invoker | PUBLIC(default) | 0 | pay_runs |
| [`app.guard_published_slots()`](#fn-app-guard-published-slots) | invoker | PUBLIC(default) | 0 | timetable_slots |
| [`app.guard_report_cards()`](#fn-app-guard-report-cards) | invoker | PUBLIC(default) | 0 | report_cards |
| [`app.guard_role_grant()`](#fn-app-guard-role-grant) | definer | authenticated, postgres, service_role | 0 | role_grants |
| [`app.guard_subject_link()`](#fn-app-guard-subject-link) | definer | postgres | 0 | class_subjects, student_subjects, subject_leads, teacher_subjects |
| [`app.guard_superadmin()`](#fn-app-guard-superadmin) | invoker | postgres | 0 | users |
| [`app.guard_superadmin_list()`](#fn-app-guard-superadmin-list) | invoker | postgres | 0 | superadmins |
| [`app.guard_wellness_insert()`](#fn-app-guard-wellness-insert) | invoker | authenticated, postgres | 0 | wellness_logs |
| [`app.guard_wellness_update()`](#fn-app-guard-wellness-update) | invoker | authenticated, postgres | 0 | wellness_logs |
| [`app.has_perm()`](#fn-app-has-perm) | definer | authenticated, postgres, service_role | 3 |  |
| [`app.has_wellness_consent()`](#fn-app-has-wellness-consent) | definer | authenticated, postgres | 0 |  |
| [`app.health_consent()`](#fn-app-health-consent) | definer | PUBLIC(default) | 0 |  |
| [`app.importing()`](#fn-app-importing) | invoker | postgres | 0 |  |
| [`app.is_admin()`](#fn-app-is-admin) | definer | authenticated, postgres | 0 |  |
| [`app.is_parent_of()`](#fn-app-is-parent-of) | definer | authenticated, postgres | 0 |  |
| [`app.is_server()`](#fn-app-is-server) | invoker | authenticated, postgres, service_role | 0 |  |
| [`app.is_staff()`](#fn-app-is-staff) | definer | authenticated, postgres | 0 |  |
| [`app.is_superadmin()`](#fn-app-is-superadmin) | definer | authenticated, postgres | 3 |  |
| [`app.is_teacher()`](#fn-app-is-teacher) | definer | authenticated, postgres | 0 |  |
| [`app.link_guardian_family()`](#fn-app-link-guardian-family) | definer | PUBLIC(default) | 0 |  |
| [`app.move_enrolment()`](#fn-app-move-enrolment) | definer | postgres | 4 |  |
| [`app.next_admission_no()`](#fn-app-next-admission-no) | definer | postgres | 1 |  |
| [`app.next_doc_no()`](#fn-app-next-doc-no) | definer | postgres | 2 |  |
| [`app.norm_class()`](#fn-app-norm-class) | invoker | authenticated, postgres, service_role | 12 |  |
| [`app.on_class_rename()`](#fn-app-on-class-rename) | definer | postgres | 0 | classes |
| [`app.on_class_subject_change()`](#fn-app-on-class-subject-change) | definer | postgres | 0 | class_subjects |
| [`app.on_enrolment_change()`](#fn-app-on-enrolment-change) | definer | PUBLIC(default) | 0 | enrolments |
| [`app.on_family_change()`](#fn-app-on-family-change) | definer | PUBLIC(default) | 0 | family_members |
| [`app.on_family_code_change()`](#fn-app-on-family-code-change) | definer | PUBLIC(default) | 0 | students |
| [`app.on_guardian_link()`](#fn-app-on-guardian-link) | definer | PUBLIC(default) | 0 | guardians |
| [`app.on_health_consent()`](#fn-app-on-health-consent) | definer | PUBLIC(default) | 0 | consents |
| [`app.on_student_change()`](#fn-app-on-student-change) | definer | PUBLIC(default) | 0 | students |
| [`app.on_student_class_change()`](#fn-app-on-student-class-change) | definer | postgres | 0 | users |
| [`app.on_student_login_change()`](#fn-app-on-student-login-change) | definer | PUBLIC(default) | 0 | users |
| [`app.on_teacher_subject_change()`](#fn-app-on-teacher-subject-change) | definer | postgres | 0 | teacher_subjects |
| [`app.ops_access_grants_guard()`](#fn-app-ops-access-grants-guard) | invoker | postgres | 0 | ops_access_grants |
| [`app.ops_case_messages_guard()`](#fn-app-ops-case-messages-guard) | invoker | postgres | 0 | ops_case_messages |
| [`app.ops_commissions_guard()`](#fn-app-ops-commissions-guard) | invoker | postgres | 0 | ops_commissions |
| [`app.ops_inspect_links()`](#fn-app-ops-inspect-links) | invoker | postgres | 1 |  |
| [`app.ops_inspectable()`](#fn-app-ops-inspectable) | invoker | postgres | 1 |  |
| [`app.ops_quotes_guard()`](#fn-app-ops-quotes-guard) | invoker | postgres | 0 | ops_quotes |
| [`app.parent_of_student()`](#fn-app-parent-of-student) | definer | PUBLIC(default) | 0 |  |
| [`app.perm_holders()`](#fn-app-perm-holders) | definer | authenticated, postgres, service_role | 1 |  |
| [`app.phone_key()`](#fn-app-phone-key) | invoker | PUBLIC(default) | 0 |  |
| [`app.reconcile_student_subjects()`](#fn-app-reconcile-student-subjects) | definer | postgres | 0 |  |
| [`app.relabel_timetable_subject()`](#fn-app-relabel-timetable-subject) | definer | postgres | 6 |  |
| [`app.release_staff_threads()`](#fn-app-release-staff-threads) | definer | postgres | 0 | users |
| [`app.school_today()`](#fn-app-school-today) | invoker | PUBLIC(default) | 3 |  |
| [`app.section_from_class()`](#fn-app-section-from-class) | invoker | PUBLIC(default) | 4 |  |
| [`app.seed_admission_stages()`](#fn-app-seed-admission-stages) | definer | postgres | 0 | schools |
| [`app.sees_learning()`](#fn-app-sees-learning) | definer | authenticated, postgres | 0 |  |
| [`app.session_ends()`](#fn-app-session-ends) | definer | PUBLIC(default) | 1 |  |
| [`app.session_of()`](#fn-app-session-of) | definer | PUBLIC(default) | 5 |  |
| [`app.session_start_month()`](#fn-app-session-start-month) | definer | PUBLIC(default) | 5 |  |
| [`app.session_starts()`](#fn-app-session-starts) | definer | PUBLIC(default) | 1 |  |
| [`app.settings_changes_immutable()`](#fn-app-settings-changes-immutable) | invoker | PUBLIC(default) | 0 | settings_changes |
| [`app.staff_jobs_sync()`](#fn-app-staff-jobs-sync) | definer | PUBLIC(default) | 0 | staff_jobs |
| [`app.staff_members_job()`](#fn-app-staff-members-job) | definer | PUBLIC(default) | 0 | staff_members |
| [`app.strip_answer_key()`](#fn-app-strip-answer-key) | invoker | authenticated, postgres | 0 |  |
| [`app.suggest_siblings()`](#fn-app-suggest-siblings) | definer | PUBLIC(default) | 0 |  |
| [`app.sync_class_subject_meta()`](#fn-app-sync-class-subject-meta) | definer | postgres | 0 |  |
| [`app.sync_staff_job()`](#fn-app-sync-staff-job) | definer | PUBLIC(default) | 2 |  |
| [`app.sync_student_login()`](#fn-app-sync-student-login) | definer | postgres | 1 |  |
| [`app.sync_teacher_assignments()`](#fn-app-sync-teacher-assignments) | definer | postgres | 5 |  |
| [`app.teaches_class()`](#fn-app-teaches-class) | definer | authenticated, postgres | 0 |  |
| [`app.teaches_student()`](#fn-app-teaches-student) | definer | authenticated, postgres | 0 |  |
| [`app.touch_updated_at()`](#fn-app-touch-updated-at) | invoker | authenticated, postgres | 0 | admission_applicants, admission_documents, admission_offers, admission_seats, admission_stages, assignments, attendance, cc_groups, cc_memberships, certificate_settings, certificate_types, certificates, consents, counselling_cases, counselling_referrals, counselling_sessions, course_plans, discipline_actions, emergency_contacts, enquiries, enrolments, exam_assessments, exam_class_terms, exam_schemes, exam_sheets, exam_student_terms, exam_terms, family_members, fee_invoices, fee_structures, health_events, house_members, house_points, houses, hr_departments, hr_grades, hr_posts, hr_settings, import_jobs, incidents, kirti_entries, leave_policies, leave_requests, legacy_results, lesson_plans, pay_items, payroll_settings, report_card_settings, salary_templates, school_filings, schools, sibling_links, situations, staff_pay_settings, staff_profiles, staff_statutory, student_change_requests, student_documents, student_health, students, submissions, syllabus_progress, users |
| [`app.user_cp_reader()`](#fn-app-user-cp-reader) | definer | authenticated, postgres, service_role | 0 |  |
| [`app.user_has_perm()`](#fn-app-user-has-perm) | definer | authenticated, postgres, service_role | 4 |  |
| [`app.user_role()`](#fn-app-user-role) | definer | authenticated, postgres | 0 |  |
| [`app.users_on_register()`](#fn-app-users-on-register) | definer | PUBLIC(default) | 0 | users |
| [`certificate_issue()`](#fn-certificate-issue) | definer | postgres, service_role | 1 |  |
| [`exam_attendance()`](#fn-exam-attendance) | invoker | postgres, service_role | 2 |  |
| [`exam_fee_dues()`](#fn-exam-fee-dues) | invoker | postgres, service_role | 1 |  |
| [`health_consented()`](#fn-health-consented) | definer | postgres, service_role | 5 |  |
| [`health_retention_purge()`](#fn-health-retention-purge) | definer | postgres, service_role | 0 |  |
| [`hr_daily()`](#fn-hr-daily) | definer | postgres, service_role | 0 |  |
| [`hr_link_login()`](#fn-hr-link-login) | definer | postgres, service_role | 1 |  |
| [`hr_next_employee_code()`](#fn-hr-next-employee-code) | definer | postgres, service_role | 1 |  |
| [`hr_reassign_reports()`](#fn-hr-reassign-reports) | definer | postgres, service_role | 1 |  |
| [`hr_sync_jobs()`](#fn-hr-sync-jobs) | definer | postgres, service_role | 2 |  |
| [`import_admission_applicants()`](#fn-import-admission-applicants) | definer | postgres, service_role | 0 |  |
| [`import_attendance()`](#fn-import-attendance) | definer | postgres, service_role | 0 |  |
| [`import_cc_memberships()`](#fn-import-cc-memberships) | definer | postgres, service_role | 0 |  |
| [`import_certificates()`](#fn-import-certificates) | definer | postgres, service_role | 0 |  |
| [`import_claim()`](#fn-import-claim) | definer | postgres, service_role | 5 |  |
| [`import_documents()`](#fn-import-documents) | definer | postgres, service_role | 0 |  |
| [`import_enrolments()`](#fn-import-enrolments) | definer | postgres, service_role | 0 |  |
| [`import_exam_marks()`](#fn-import-exam-marks) | definer | postgres, service_role | 0 |  |
| [`import_family()`](#fn-import-family) | definer | postgres, service_role | 0 |  |
| [`import_fee_invoices()`](#fn-import-fee-invoices) | definer | postgres, service_role | 0 |  |
| [`import_fee_payments()`](#fn-import-fee-payments) | definer | postgres, service_role | 0 |  |
| [`import_fee_structures()`](#fn-import-fee-structures) | definer | postgres, service_role | 0 |  |
| [`import_health()`](#fn-import-health) | definer | postgres, service_role | 0 |  |
| [`import_health_events()`](#fn-import-health-events) | definer | postgres, service_role | 0 |  |
| [`import_house_members()`](#fn-import-house-members) | definer | postgres, service_role | 0 |  |
| [`import_kirti()`](#fn-import-kirti) | definer | postgres, service_role | 0 |  |
| [`import_legacy_results()`](#fn-import-legacy-results) | definer | postgres, service_role | 0 |  |
| [`import_receipt_floor()`](#fn-import-receipt-floor) | definer | postgres, service_role | 5 |  |
| [`import_students()`](#fn-import-students) | definer | postgres, service_role | 0 |  |
| [`import_undo()`](#fn-import-undo) | definer | postgres, service_role | 5 |  |
| [`log_app_error()`](#fn-log-app-error) | invoker | postgres, service_role | 0 |  |
| [`ops_ai_usage()`](#fn-ops-ai-usage) | invoker | postgres, service_role | 2 |  |
| [`ops_delete_account()`](#fn-ops-delete-account) | invoker | postgres, service_role | 1 |  |
| [`ops_delete_school()`](#fn-ops-delete-school) | invoker | postgres, service_role | 1 |  |
| [`ops_error_stats()`](#fn-ops-error-stats) | invoker | postgres, service_role | 2 |  |
| [`ops_inspect_find()`](#fn-ops-inspect-find) | definer | postgres, service_role | 1 |  |
| [`ops_inspect_list()`](#fn-ops-inspect-list) | definer | postgres, service_role | 1 |  |
| [`ops_inspect_meta()`](#fn-ops-inspect-meta) | definer | postgres, service_role | 1 |  |
| [`ops_inspect_row()`](#fn-ops-inspect-row) | definer | postgres, service_role | 1 |  |
| [`ops_jobs()`](#fn-ops-jobs) | definer | postgres, service_role | 1 |  |
| [`ops_login_check()`](#fn-ops-login-check) | definer | postgres, service_role | 1 |  |
| [`ops_migrations()`](#fn-ops-migrations) | definer | postgres, service_role | 1 |  |
| [`ops_norm_class()`](#fn-ops-norm-class) | invoker | anon, authenticated, postgres, service_role | 4 |  |
| [`ops_platform_health()`](#fn-ops-platform-health) | definer | postgres, service_role | 2 |  |
| [`ops_registry_counts()`](#fn-ops-registry-counts) | definer | postgres, service_role | 4 |  |
| [`ops_rename_class_subject()`](#fn-ops-rename-class-subject) | definer | postgres, service_role | 6 |  |
| [`ops_request_stats()`](#fn-ops-request-stats) | definer | postgres, service_role | 1 |  |
| [`ops_resync_teacher()`](#fn-ops-resync-teacher) | definer | postgres, service_role | 5 |  |
| [`ops_school_ai()`](#fn-ops-school-ai) | definer | postgres, service_role | 1 |  |
| [`ops_school_diagnostics()`](#fn-ops-school-diagnostics) | definer | postgres, service_role | 1 |  |
| [`ops_school_metrics()`](#fn-ops-school-metrics) | definer | postgres, service_role | 3 |  |
| [`ops_set_platform_config()`](#fn-ops-set-platform-config) | definer | postgres, service_role | 1 |  |
| [`ops_subject_metrics()`](#fn-ops-subject-metrics) | definer | postgres, service_role | 2 |  |
| [`ops_tml_stale()`](#fn-ops-tml-stale) | definer | postgres, service_role | 1 |  |
| [`ops_update_school()`](#fn-ops-update-school) | definer | postgres, service_role | 2 |  |
| [`parent_wellness_summary()`](#fn-parent-wellness-summary) | definer | authenticated, postgres, service_role | 0 |  |
| [`payroll_approve_run()`](#fn-payroll-approve-run) | definer | postgres, service_role | 1 |  |
| [`rls_auto_enable()`](#fn-rls-auto-enable) | definer | postgres, service_role | 0 |  |
| [`school_attendance_summary()`](#fn-school-attendance-summary) | definer | authenticated, postgres, service_role | 0 |  |
| [`school_wellness_aggregates()`](#fn-school-wellness-aggregates) | definer | authenticated, postgres, service_role | 0 |  |
| [`school_wellness_report()`](#fn-school-wellness-report) | definer | authenticated, postgres, service_role | 3 |  |
| [`set_consent()`](#fn-set-consent) | definer | authenticated, postgres, service_role | 0 |  |
| [`student_attendance_timeline()`](#fn-student-attendance-timeline) | invoker | postgres, service_role | 4 |  |
| [`student_correct()`](#fn-student-correct) | definer | postgres, service_role | 3 |  |
| [`student_move()`](#fn-student-move) | definer | postgres, service_role | 3 |  |
| [`student_next_admission_no()`](#fn-student-next-admission-no) | definer | postgres, service_role | 1 |  |
| [`student_promote()`](#fn-student-promote) | definer | postgres, service_role | 1 |  |
| [`student_renumber()`](#fn-student-renumber) | definer | postgres, service_role | 1 |  |
| [`student_sync_school()`](#fn-student-sync-school) | definer | postgres, service_role | 1 |  |
| [`teacher_wellness_feed()`](#fn-teacher-wellness-feed) | definer | authenticated, postgres, service_role | 0 |  |

### fn admin_close_day

`admin_close_day(p_school uuid, p_day date, p_cash_counted numeric, p_note text, p_actor uuid)` → `fee_day_closes` · plpgsql · security definer · execute: postgres, service_role

- **Touches:** `fee_payments` select, `fee_day_closes` insert
- **Calls:** `app.user_has_perm()`, `app.day_closed()`
- **Reached from routes:** `/api/admin/fees`

<details><summary>Source</summary>

```sql
DECLARE v public.fee_day_closes; v_totals jsonb; v_n int; v_cash numeric;
BEGIN
  IF NOT app.user_has_perm(p_actor, 'fees.dayclose') THEN RAISE EXCEPTION 'You can''t close the day book' USING ERRCODE = '42501'; END IF;
  IF p_day > current_date THEN RAISE EXCEPTION 'A future day can''t be closed' USING ERRCODE = '22023'; END IF;
  IF app.day_closed(p_school, p_day) THEN RAISE EXCEPTION 'That day is already closed' USING ERRCODE = '22023'; END IF;
  SELECT coalesce(jsonb_object_agg(mode, total), '{}'::jsonb), coalesce(sum(n), 0)::int
    INTO v_totals, v_n
    FROM (SELECT mode, sum(amount) AS total, count(*) AS n FROM public.fee_payments
          WHERE school_id = p_school AND paid_on = p_day AND voided_at IS NULL GROUP BY mode) t;
  v_cash := coalesce((v_totals ->> 'cash')::numeric, 0);
  IF p_cash_counted <> v_cash AND nullif(trim(p_note), '') IS NULL THEN
    RAISE EXCEPTION 'Cash counted differs from receipts by %; explain the difference', p_cash_counted - v_cash USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.fee_day_closes (school_id, day, status, totals, receipts, cash_expected, cash_counted, note, closed_by, closed_at,
                                     reopened_by, reopened_at, reopen_reason)
  VALUES (p_school, p_day, 'closed', v_totals, v_n, v_cash, p_cash_counted, nullif(trim(p_note), ''), p_actor, now(), NULL, NULL, NULL)
  ON CONFLICT (school_id, day) DO UPDATE
    SET status = 'closed', totals = EXCLUDED.totals, receipts = EXCLUDED.receipts, cash_expected = EXCLUDED.cash_expected,
        cash_counted = EXCLUDED.cash_counted, note = EXCLUDED.note, closed_by = EXCLUDED.closed_by, closed_at = now(),
        reopened_by = NULL, reopened_at = NULL, reopen_reason = NULL
  RETURNING * INTO v;
  RETURN v;
END
```

</details>

### fn admin_decide_concession

`admin_decide_concession(p_school uuid, p_request uuid, p_approve boolean, p_note text, p_actor uuid)` → `fee_concession_requests` · plpgsql · security definer · execute: postgres, service_role

- **Touches:** `fee_concession_requests` select/update, `fee_invoices` select/update, `fee_payments` select
- **Calls:** `app.user_has_perm()`, `app.perm_holders()`
- **Reached from routes:** `/api/admin/fees`

<details><summary>Source</summary>

```sql
DECLARE r public.fee_concession_requests; inv public.fee_invoices; v_paid numeric; v_self boolean;
BEGIN
  IF NOT app.user_has_perm(p_actor, 'fees.concession.approve') THEN
    RAISE EXCEPTION 'You can''t approve concessions' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO r FROM public.fee_concession_requests WHERE id = p_request AND school_id = p_school FOR UPDATE;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Request not found' USING ERRCODE = 'P0002'; END IF;
  IF r.status <> 'pending' THEN RAISE EXCEPTION 'This request was already decided' USING ERRCODE = '22023'; END IF;
  v_self := r.requested_by = p_actor;
  IF v_self AND app.perm_holders(p_school, 'fees.concession.approve') > 1 THEN
    RAISE EXCEPTION 'Someone else has to approve a concession you requested' USING ERRCODE = '42501';
  END IF;
  IF NOT p_approve THEN
    IF nullif(trim(p_note), '') IS NULL THEN RAISE EXCEPTION 'Give a reason for rejecting' USING ERRCODE = '22023'; END IF;
    UPDATE public.fee_concession_requests SET status = 'rejected', decided_by = p_actor, decided_at = now(), decision_note = trim(p_note)
      WHERE id = r.id RETURNING * INTO r;
    RETURN r;
  END IF;
  SELECT * INTO inv FROM public.fee_invoices WHERE id = r.invoice_id FOR UPDATE;
  IF inv.voided_at IS NOT NULL THEN RAISE EXCEPTION 'The invoice was voided' USING ERRCODE = '22023'; END IF;
  SELECT coalesce(sum(amount), 0) INTO v_paid FROM public.fee_payments WHERE invoice_id = inv.id AND voided_at IS NULL;
  IF r.amount > inv.amount - v_paid THEN
    RAISE EXCEPTION 'The concession is more than the unpaid part of the invoice (%)', inv.amount - v_paid USING ERRCODE = '22023';
  END IF;
  UPDATE public.fee_invoices SET concession = r.amount, concession_reason = CASE WHEN r.amount > 0 THEN r.reason END WHERE id = inv.id;
  UPDATE public.fee_concession_requests SET status = 'approved', decided_by = p_actor, decided_at = now(),
         decision_note = nullif(trim(p_note), ''), self_approved = v_self
    WHERE id = r.id RETURNING * INTO r;
  RETURN r;
END
```

</details>

### fn admin_invoice_student

`admin_invoice_student(p_school uuid, p_student uuid, p_session text, p_actor uuid)` → `integer` · plpgsql · security definer · execute: postgres, service_role

- **Touches:** `users` select, `fee_structures` select, `fee_invoices` select/insert
- **Calls:** `app.grade_of()`, `app.next_doc_no()`
- **Reached from routes:** `/api/ops/requests`

<details><summary>Source</summary>

```sql
DECLARE fs record; e jsonb; n int := 0; v_no int;
BEGIN
  SELECT s.annual_fee, s.schedule INTO fs FROM public.users u
    JOIN public.fee_structures s ON s.school_id = u.school_id AND s.session = p_session AND s.grade = app.grade_of(u.student_class)
   WHERE u.id = p_student AND u.school_id = p_school AND u.role = 'student';
  IF NOT FOUND THEN RETURN 0; END IF;
  FOR e IN SELECT * FROM jsonb_array_elements(fs.schedule) LOOP
    v_no := (e ->> 'no')::int;
    CONTINUE WHEN NOT EXISTS (SELECT 1 FROM public.fee_invoices i JOIN public.users x ON x.id = i.student_id
                              WHERE i.school_id = p_school AND i.session = p_session AND i.instalment_no = v_no AND i.voided_at IS NULL
                                AND app.grade_of(x.student_class) = (SELECT app.grade_of(student_class) FROM public.users WHERE id = p_student));
    CONTINUE WHEN EXISTS (SELECT 1 FROM public.fee_invoices WHERE student_id = p_student AND session = p_session AND instalment_no = v_no);
    INSERT INTO public.fee_invoices (school_id, student_id, session, instalment_no, label, invoice_no, due_on, amount, created_by)
    VALUES (p_school, p_student, p_session, v_no, coalesce(e ->> 'label', 'Instalment ' || v_no),
            app.next_doc_no(p_school, 'invoice', p_session), (e ->> 'due_on')::date, round(fs.annual_fee * (e ->> 'share')::numeric, 2), p_actor);
    n := n + 1;
  END LOOP;
  RETURN n;
END
```

</details>

### fn admin_raise_invoices

`admin_raise_invoices(p_school uuid, p_session text, p_instalment integer, p_actor uuid)` → `integer` · plpgsql · security definer · execute: postgres, service_role

- **Touches:** `users` select, `fee_structures` select, `fee_invoices` select/insert
- **Calls:** `app.grade_of()`, `app.next_doc_no()`
- **Reached from routes:** `/api/admin/fees`

<details><summary>Source</summary>

```sql
DECLARE r record; n int := 0; v_share numeric; v_label text; v_due date;
BEGIN
  FOR r IN
    SELECT u.id AS student_id, fs.annual_fee, fs.schedule
    FROM public.users u
    JOIN public.fee_structures fs
      ON fs.school_id = u.school_id AND fs.session = p_session AND fs.grade = app.grade_of(u.student_class)
    WHERE u.school_id = p_school AND u.role = 'student'
      AND NOT EXISTS (SELECT 1 FROM public.fee_invoices i
                      WHERE i.student_id = u.id AND i.session = p_session AND i.instalment_no = p_instalment)
    ORDER BY u.student_class, u.name
  LOOP
    SELECT (e ->> 'share')::numeric, e ->> 'label', (e ->> 'due_on')::date INTO v_share, v_label, v_due
    FROM jsonb_array_elements(r.schedule) e WHERE (e ->> 'no')::int = p_instalment;
    CONTINUE WHEN v_share IS NULL OR v_due IS NULL;
    INSERT INTO public.fee_invoices (school_id, student_id, session, instalment_no, label, invoice_no, due_on, amount, created_by)
    VALUES (p_school, r.student_id, p_session, p_instalment, coalesce(v_label, 'Instalment ' || p_instalment),
            app.next_doc_no(p_school, 'invoice', p_session), v_due, round(r.annual_fee * v_share, 2), p_actor);
    n := n + 1;
  END LOOP;
  RETURN n;
END
```

</details>

### fn admin_record_payment

`admin_record_payment(p_school uuid, p_invoice uuid, p_amount numeric, p_mode text, p_reference text, p_paid_on date, p_actor uuid)` → `fee_payments` · plpgsql · security definer · execute: postgres, service_role

- **Touches:** `fee_invoices` select, `fee_payments` select/insert
- **Calls:** `app.day_closed()`, `app.next_doc_no()`
- **Reached from routes:** `/api/admin/fees`

<details><summary>Source</summary>

```sql
DECLARE inv public.fee_invoices; v_paid numeric; v public.fee_payments;
BEGIN
  IF app.day_closed(p_school, p_paid_on) THEN
    RAISE EXCEPTION 'The day book for % is closed. Reopen it to add a receipt on that date.', p_paid_on USING ERRCODE = '22023';
  END IF;
  SELECT * INTO inv FROM public.fee_invoices WHERE id = p_invoice AND school_id = p_school FOR UPDATE;
  IF inv.id IS NULL THEN RAISE EXCEPTION 'Invoice not found' USING ERRCODE = 'P0002'; END IF;
  IF inv.voided_at IS NOT NULL THEN RAISE EXCEPTION 'This invoice was voided' USING ERRCODE = '22023'; END IF;
  SELECT coalesce(sum(amount), 0) INTO v_paid FROM public.fee_payments WHERE invoice_id = p_invoice AND voided_at IS NULL;
  IF p_amount > inv.amount - inv.concession - v_paid THEN
    RAISE EXCEPTION 'Payment exceeds the balance due (%)', inv.amount - inv.concession - v_paid USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.fee_payments (school_id, invoice_id, student_id, amount, mode, reference, paid_on, receipt_no, recorded_by)
  VALUES (p_school, p_invoice, inv.student_id, p_amount, p_mode, nullif(trim(p_reference), ''), p_paid_on,
          app.next_doc_no(p_school, 'receipt', inv.session), p_actor)
  RETURNING * INTO v;
  RETURN v;
END
```

</details>

### fn admin_teacher_work

`admin_teacher_work(p_school uuid, p_from timestamp with time zone DEFAULT (now() - '30 days'::interval), p_to timestamp with time zone DEFAULT now())` → `TABLE(teacher_id uuid, pending bigint, oldest_pending timestamp with time zone, graded30 bigint, last_graded timestamp with time zone)` · sql · security definer · execute: authenticated, postgres, service_role

- **Touches:** `submissions` select, `assignments` select
- **Calls:** `app.is_superadmin()`, `app.current_school_id()`, `app.has_perm()`
- **Reached from routes:** `/api/staff/ask`, `/api/whatsapp/simulate`, `/api/whatsapp/webhook`

<details><summary>Source</summary>

```sql
WITH ok AS (
    SELECT coalesce(auth.jwt() ->> 'role', '') = 'service_role'
        OR app.is_superadmin()
        OR (p_school = app.current_school_id() AND (app.has_perm('dashboard.view') OR app.has_perm('workforce.read'))) AS allowed
  )
  SELECT a.teacher_id,
         count(*) FILTER (WHERE s.teacher_approved IS NOT TRUE),
         min(s.submitted_at) FILTER (WHERE s.teacher_approved IS NOT TRUE),
         count(*) FILTER (WHERE s.teacher_approved IS TRUE AND s.updated_at >= p_from AND s.updated_at <= p_to),
         max(s.updated_at) FILTER (WHERE s.teacher_approved IS TRUE AND s.updated_at >= p_from AND s.updated_at <= p_to)
  FROM public.submissions s
  JOIN public.assignments a ON a.id = s.assignment_id
  WHERE a.school_id = p_school AND (SELECT allowed FROM ok)
  GROUP BY a.teacher_id
```

</details>

### fn admission_ensure_stages

`admission_ensure_stages(p_school uuid)` → `void` · sql · security definer · execute: postgres, service_role

- **Touches:** `admission_stages` insert/select
- **Reached from routes:** `/api/admin/admissions`, `/api/admin/admissions/setup`
- **Called by SQL:** `admission_set_stages()`, `app.seed_admission_stages()`

<details><summary>Source</summary>

```sql
INSERT INTO public.admission_stages (school_id, key, label, position, system, respond_days)
    SELECT p_school, k, l, p, s, d FROM (VALUES
      ('enquiry', 'Enquiry', 1, NULL, NULL::int), ('application', 'Application', 2, NULL, NULL), ('assessment', 'Assessment', 3, NULL, NULL),
      ('offer', 'Offer', 100, 'offer', 14), ('enrolled', 'Enrolled', 101, 'enrolled', NULL)) AS t(k, l, p, s, d)
    WHERE NOT EXISTS (SELECT 1 FROM public.admission_stages x WHERE x.school_id = p_school)
  ON CONFLICT DO NOTHING;
```

</details>

### fn admission_move

`admission_move(p_school uuid, p_applicant uuid, p_from text, p_to text, p_actor uuid, p_note text)` → `text` · plpgsql · security definer · execute: postgres, service_role

- **Touches:** `admission_applicants` select/update, `admission_stages` select, `admission_offers` select, `admission_events` insert
- **Calls:** `app.admission_close_offer()`, `app.admission_rank()`, `admission_promote()`
- **Reached from routes:** `/api/admin/admissions`

<details><summary>Source</summary>

```sql
DECLARE a public.admission_applicants; v_to text := p_to; v_next text; v_rank int; v_held boolean;
BEGIN
  SELECT * INTO a FROM public.admission_applicants WHERE id = p_applicant AND school_id = p_school FOR UPDATE;
  IF a.id IS NULL THEN RAISE EXCEPTION 'Applicant not found.' USING ERRCODE = 'P0002'; END IF;
  IF a.stage IS DISTINCT FROM p_from THEN RAISE EXCEPTION 'Someone else just moved this applicant. Refresh and try again.' USING ERRCODE = 'SA409'; END IF;

  IF v_to IN ('rejected', 'withdrawn') THEN
    IF a.stage IN ('rejected', 'withdrawn') THEN RAISE EXCEPTION 'This applicant is already closed.' USING ERRCODE = '22023'; END IF;
    IF a.stage = 'enrolled' AND v_to <> 'withdrawn' THEN RAISE EXCEPTION 'An enrolled student can only be marked withdrawn.' USING ERRCODE = '22023'; END IF;
    IF coalesce(trim(p_note), '') = '' THEN RAISE EXCEPTION 'Give a reason — it stays on the applicant''s record.' USING ERRCODE = '22023'; END IF;
    v_held := a.stage IN ('offer', 'enrolled');
    PERFORM app.admission_close_offer(a.id, 'withdrawn', p_actor, p_note);
  ELSIF v_to = 'reopen' THEN
    IF a.stage NOT IN ('rejected', 'withdrawn') THEN RAISE EXCEPTION 'Only a rejected or withdrawn applicant can be reopened.' USING ERRCODE = '22023'; END IF;
    -- Back to the furthest own stage reached that is still in use; someone who got as far as Offer goes back to
    -- the last own stage (a lost seat is not given back: propose again).
    v_rank := app.admission_rank(p_school, a.furthest_stage);
    SELECT s.key INTO v_to FROM public.admission_stages s
      WHERE s.school_id = p_school AND s.system IS NULL AND s.active AND s.position <= v_rank
      ORDER BY s.position DESC LIMIT 1;
    IF v_to IS NULL THEN
      SELECT s.key INTO v_to FROM public.admission_stages s WHERE s.school_id = p_school AND s.system IS NULL AND s.active ORDER BY s.position LIMIT 1;
    END IF;
    IF v_to IS NULL THEN RAISE EXCEPTION 'The pipeline has no stages before Offer.' USING ERRCODE = '22023'; END IF;
  ELSE
    IF EXISTS (SELECT 1 FROM public.admission_stages s WHERE s.school_id = p_school AND s.key = v_to AND s.system = 'offer') THEN
      RAISE EXCEPTION 'An offer needs approval: use Propose offer.' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM public.admission_stages s WHERE s.school_id = p_school AND s.key = v_to AND s.system = 'enrolled') THEN
      RAISE EXCEPTION 'Enrolment goes through Sthara: open the applicant and use Request enrolment.' USING ERRCODE = '22023';
    END IF;
    IF a.stage IN ('rejected', 'withdrawn', 'offer', 'enrolled') THEN
      RAISE EXCEPTION 'An applicant at this stage can''t move there.' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM public.admission_offers o WHERE o.applicant_id = a.id AND o.status IN ('proposed', 'waitlisted')) THEN
      RAISE EXCEPTION 'This applicant has an offer waiting. Cancel it before moving them.' USING ERRCODE = '22023';
    END IF;
    v_rank := app.admission_rank(p_school, a.stage);
    SELECT s.key INTO v_next FROM public.admission_stages s
      WHERE s.school_id = p_school AND s.system IS NULL AND s.active AND s.position > v_rank ORDER BY s.position LIMIT 1;
    IF v_next IS DISTINCT FROM v_to THEN RAISE EXCEPTION 'Applicants move forward one stage at a time.' USING ERRCODE = '22023'; END IF;
  END IF;

  UPDATE public.admission_applicants SET stage = v_to, stage_changed_at = now(),
      furthest_stage = CASE WHEN v_to NOT IN ('rejected', 'withdrawn') AND app.admission_rank(p_school, v_to) > app.admission_rank(p_school, a.furthest_stage)
                            THEN v_to ELSE furthest_stage END
    WHERE id = a.id;
  INSERT INTO public.admission_events (applicant_id, school_id, from_stage, to_stage, note, actor_id)
    VALUES (a.id, p_school, a.stage, v_to, nullif(trim(p_note), ''), p_actor);
  IF v_held THEN PERFORM public.admission_promote(p_school, a.session, a.grade, p_actor); END IF;
  RETURN v_to;
END
```

</details>

### fn admission_offer_cancel

`admission_offer_cancel(p_school uuid, p_offer uuid, p_actor uuid, p_note text)` → `void` · plpgsql · security definer · execute: postgres, service_role

- **Touches:** `admission_offers` select/update, `admission_applicants` select, `admission_events` insert
- **Reached from routes:** `/api/admin/admissions/offers`

<details><summary>Source</summary>

```sql
DECLARE o public.admission_offers; v_stage text;
BEGIN
  SELECT * INTO o FROM public.admission_offers WHERE id = p_offer AND school_id = p_school FOR UPDATE;
  IF o.id IS NULL THEN RAISE EXCEPTION 'That offer no longer exists.' USING ERRCODE = 'P0002'; END IF;
  IF o.status NOT IN ('proposed', 'waitlisted') THEN
    RAISE EXCEPTION 'An offer that has gone out ends when the family declines, or by withdrawing or rejecting the applicant.' USING ERRCODE = 'SA409';
  END IF;
  UPDATE public.admission_offers SET status = 'withdrawn', closed_at = now(), decision_note = coalesce(nullif(trim(p_note), ''), decision_note) WHERE id = o.id;
  SELECT stage INTO v_stage FROM public.admission_applicants WHERE id = o.applicant_id;
  INSERT INTO public.admission_events (applicant_id, school_id, from_stage, to_stage, note, actor_id, offer_status)
    VALUES (o.applicant_id, p_school, v_stage, v_stage, coalesce(nullif(trim(p_note), ''), 'Offer cancelled'), p_actor, 'withdrawn');
END
```

</details>

### fn admission_offer_decide

`admission_offer_decide(p_school uuid, p_offer uuid, p_actor uuid, p_approve boolean, p_note text)` → `text` · plpgsql · security definer · execute: postgres, service_role

- **Touches:** `admission_offers` select/update, `admission_applicants` select, `admission_events` insert, `notifications` insert
- **Calls:** `app.admission_lock_grade()`, `app.admission_seats_left()`, `app.admission_issue()`, `admission_promote()`
- **Reached from routes:** `/api/admin/admissions/offers`

<details><summary>Source</summary>

```sql
DECLARE o public.admission_offers; v_left int; v_stage text;
BEGIN
  SELECT * INTO o FROM public.admission_offers WHERE id = p_offer AND school_id = p_school;
  IF o.id IS NULL THEN RAISE EXCEPTION 'That offer no longer exists.' USING ERRCODE = 'P0002'; END IF;
  PERFORM app.admission_lock_grade(p_school, o.session, o.grade);
  SELECT * INTO o FROM public.admission_offers WHERE id = p_offer FOR UPDATE;
  IF o.status <> 'proposed' THEN RAISE EXCEPTION 'That offer isn''t waiting for approval.' USING ERRCODE = 'SA409'; END IF;
  IF o.proposed_by = p_actor THEN RAISE EXCEPTION 'You proposed this offer, so someone else has to approve it.' USING ERRCODE = '42501'; END IF;
  SELECT stage INTO v_stage FROM public.admission_applicants WHERE id = o.applicant_id;

  IF NOT p_approve THEN
    IF coalesce(trim(p_note), '') = '' THEN RAISE EXCEPTION 'Say why the offer is sent back.' USING ERRCODE = '22023'; END IF;
    UPDATE public.admission_offers SET status = 'returned', decided_by = p_actor, decided_at = now(), decision_note = trim(p_note), closed_at = now() WHERE id = o.id;
    INSERT INTO public.admission_events (applicant_id, school_id, from_stage, to_stage, note, actor_id, offer_status)
      VALUES (o.applicant_id, p_school, v_stage, v_stage, trim(p_note), p_actor, 'returned');
    IF o.proposed_by IS NOT NULL THEN
      INSERT INTO public.notifications (school_id, user_id, type, title, body, metadata)
        SELECT p_school, o.proposed_by, 'admissions', 'Offer for ' || a.name || ' sent back', trim(p_note), jsonb_build_object('applicantId', a.id)
        FROM public.admission_applicants a WHERE a.id = o.applicant_id;
    END IF;
    RETURN 'returned';
  END IF;

  UPDATE public.admission_offers SET decided_by = p_actor, decided_at = now(), decision_note = nullif(trim(p_note), '') WHERE id = o.id;
  v_left := app.admission_seats_left(p_school, o.session, o.grade);
  -- Someone already waiting keeps their place in the queue ahead of a new approval.
  IF (v_left IS NULL OR v_left > 0) AND NOT EXISTS (SELECT 1 FROM public.admission_offers w WHERE w.school_id = p_school AND w.session = o.session
                                                    AND w.grade = o.grade AND w.status = 'waitlisted') THEN
    PERFORM app.admission_issue(o.id, p_actor, nullif(trim(p_note), ''));
    RETURN 'issued';
  END IF;
  UPDATE public.admission_offers SET status = 'waitlisted', waitlisted_at = now() WHERE id = o.id;
  INSERT INTO public.admission_events (applicant_id, school_id, from_stage, to_stage, note, actor_id, offer_status)
    VALUES (o.applicant_id, p_school, v_stage, v_stage, 'Approved; grade ' || o.grade || ' is full, so on the waitlist', p_actor, 'waitlisted');
  PERFORM public.admission_promote(p_school, o.session, o.grade, p_actor);
  RETURN (SELECT status FROM public.admission_offers WHERE id = o.id);
END
```

</details>

### fn admission_offer_propose

`admission_offer_propose(p_school uuid, p_applicant uuid, p_actor uuid, p_note text, p_respond_by date)` → `uuid` · plpgsql · security definer · execute: postgres, service_role

- **Touches:** `admission_applicants` select, `admission_stages` select, `admission_offers` select/insert, `admission_events` insert
- **Calls:** `app.admission_rank()`, `app.admission_today()`
- **Reached from routes:** `/api/admin/admissions/offers`

<details><summary>Source</summary>

```sql
DECLARE a public.admission_applicants; v_id uuid;
BEGIN
  SELECT * INTO a FROM public.admission_applicants WHERE id = p_applicant AND school_id = p_school FOR UPDATE;
  IF a.id IS NULL THEN RAISE EXCEPTION 'Applicant not found.' USING ERRCODE = 'P0002'; END IF;
  IF a.stage IN ('rejected', 'withdrawn', 'offer', 'enrolled') THEN RAISE EXCEPTION 'Only an open applicant before Offer can be proposed for one.' USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM public.admission_stages s WHERE s.school_id = p_school AND s.system IS NULL AND s.active
             AND s.position > app.admission_rank(p_school, a.stage)) THEN
    RAISE EXCEPTION 'Take them through the remaining stages first.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.admission_offers o WHERE o.applicant_id = a.id AND o.status IN ('proposed', 'waitlisted', 'issued', 'accepted')) THEN
    RAISE EXCEPTION 'This applicant already has an offer in progress.' USING ERRCODE = '23505';
  END IF;
  IF p_respond_by IS NOT NULL AND p_respond_by < app.admission_today() THEN RAISE EXCEPTION 'The reply-by date has passed.' USING ERRCODE = '22023'; END IF;
  INSERT INTO public.admission_offers (school_id, applicant_id, session, grade, status, proposed_by, proposal_note, respond_by)
    VALUES (p_school, a.id, a.session, a.grade, 'proposed', p_actor, nullif(trim(p_note), ''), p_respond_by) RETURNING id INTO v_id;
  INSERT INTO public.admission_events (applicant_id, school_id, from_stage, to_stage, note, actor_id, offer_status)
    VALUES (a.id, p_school, a.stage, a.stage, nullif(trim(p_note), ''), p_actor, 'proposed');
  RETURN v_id;
END
```

</details>

### fn admission_offer_respond

`admission_offer_respond(p_school uuid, p_offer uuid, p_actor uuid, p_accept boolean, p_note text)` → `text` · plpgsql · security definer · execute: postgres, service_role

- **Touches:** `admission_offers` select/update, `admission_events` insert, `admission_applicants` update
- **Calls:** `app.admission_close_offer()`, `admission_promote()`
- **Reached from routes:** `/api/admin/admissions/offers`

<details><summary>Source</summary>

```sql
DECLARE o public.admission_offers;
BEGIN
  SELECT * INTO o FROM public.admission_offers WHERE id = p_offer AND school_id = p_school FOR UPDATE;
  IF o.id IS NULL THEN RAISE EXCEPTION 'That offer no longer exists.' USING ERRCODE = 'P0002'; END IF;
  IF o.status <> 'issued' THEN RAISE EXCEPTION 'Only an offer that has gone out can be accepted or declined.' USING ERRCODE = 'SA409'; END IF;
  IF p_accept THEN
    UPDATE public.admission_offers SET status = 'accepted', responded_at = now(), response_note = nullif(trim(p_note), '') WHERE id = o.id;
    INSERT INTO public.admission_events (applicant_id, school_id, from_stage, to_stage, note, actor_id, offer_status)
      VALUES (o.applicant_id, p_school, 'offer', 'offer', nullif(trim(p_note), ''), p_actor, 'accepted');
    RETURN 'accepted';
  END IF;
  IF coalesce(trim(p_note), '') = '' THEN RAISE EXCEPTION 'Say why the family declined.' USING ERRCODE = '22023'; END IF;
  PERFORM app.admission_close_offer(o.applicant_id, 'declined', p_actor, trim(p_note));
  UPDATE public.admission_applicants SET stage = 'withdrawn', stage_changed_at = now() WHERE id = o.applicant_id;
  INSERT INTO public.admission_events (applicant_id, school_id, from_stage, to_stage, note, actor_id, offer_status)
    VALUES (o.applicant_id, p_school, 'offer', 'withdrawn', 'Declined the offer: ' || trim(p_note), p_actor, 'declined');
  PERFORM public.admission_promote(p_school, o.session, o.grade, p_actor);
  RETURN 'declined';
END
```

</details>

### fn admission_promote

`admission_promote(p_school uuid, p_session text, p_grade integer, p_actor uuid)` → `integer` · plpgsql · security definer · execute: postgres, service_role

- **Touches:** `admission_offers` select, `admission_applicants` select, `notifications` insert
- **Calls:** `app.admission_lock_grade()`, `app.admission_seats_left()`, `app.admission_issue()`
- **Reached from routes:** `/api/admin/admissions`, `/api/admin/admissions/offers`, `/api/admin/admissions/setup`
- **Called by SQL:** `admission_move()`, `admission_offer_decide()`, `admission_offer_respond()`, `admission_sweep()`

<details><summary>Source</summary>

```sql
DECLARE v_left int; v_next public.admission_offers; v_n int := 0; v_name text;
BEGIN
  PERFORM app.admission_lock_grade(p_school, p_session, p_grade);
  LOOP
    v_left := app.admission_seats_left(p_school, p_session, p_grade);
    EXIT WHEN v_left IS NOT NULL AND v_left <= 0;
    SELECT * INTO v_next FROM public.admission_offers
      WHERE school_id = p_school AND session = p_session AND grade = p_grade AND status = 'waitlisted'
      ORDER BY waitlisted_at, created_at LIMIT 1 FOR UPDATE SKIP LOCKED;
    EXIT WHEN v_next.id IS NULL;
    PERFORM app.admission_issue(v_next.id, p_actor, 'A seat came free: offer issued from the waitlist');
    SELECT name INTO v_name FROM public.admission_applicants WHERE id = v_next.applicant_id;
    IF v_next.proposed_by IS NOT NULL THEN
      INSERT INTO public.notifications (school_id, user_id, type, title, body, metadata)
        VALUES (p_school, v_next.proposed_by, 'admissions', v_name || ' has an offer from the waitlist',
                'A grade ' || p_grade || ' seat came free. Tell the family and record their answer.', jsonb_build_object('applicantId', v_next.applicant_id));
    END IF;
    v_n := v_n + 1;
    v_next := NULL;
  END LOOP;
  RETURN v_n;
END
```

</details>

### fn admission_set_stages

`admission_set_stages(p_school uuid, p_stages jsonb)` → `void` · plpgsql · security definer · execute: postgres, service_role

- **Touches:** `admission_stages` select/insert/update, `admission_applicants` select
- **Calls:** `admission_ensure_stages()`
- **Reached from routes:** `/api/admin/admissions/setup`

<details><summary>Source</summary>

```sql
DECLARE r jsonb; i int := 0; v_key text; v_base text; v_label text; v_keys text[] := '{}'; v_n int; v_stuck record; v_days int; v_req text[];
BEGIN
  PERFORM public.admission_ensure_stages(p_school);
  PERFORM pg_advisory_xact_lock(hashtextextended('admission-stages:' || p_school, 0));
  IF jsonb_typeof(p_stages->'own') IS DISTINCT FROM 'array' OR jsonb_array_length(p_stages->'own') = 0 THEN
    RAISE EXCEPTION 'Keep at least one stage before Offer.' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_stages->'own') > 12 THEN RAISE EXCEPTION 'At most 12 stages before Offer.' USING ERRCODE = '22023'; END IF;
  FOR r IN SELECT * FROM jsonb_array_elements(p_stages->'own') LOOP
    i := i + 1;
    v_label := trim(coalesce(r->>'label', ''));
    IF length(v_label) NOT BETWEEN 1 AND 40 THEN RAISE EXCEPTION 'Give every stage a name of up to 40 characters.' USING ERRCODE = '22023'; END IF;
    v_req := CASE WHEN jsonb_typeof(r->'requires') = 'array' THEN ARRAY(SELECT DISTINCT jsonb_array_elements_text(r->'requires')) ELSE '{}'::text[] END;
    IF NOT v_req <@ ARRAY['documents', 'age']::text[] THEN RAISE EXCEPTION 'A stage can require documents or the age check.' USING ERRCODE = '22023'; END IF;
    v_key := nullif(r->>'key', '');
    IF v_key IS NULL THEN
      v_base := left(trim(both '_' from regexp_replace(lower(v_label), '[^a-z0-9]+', '_', 'g')), 24);
      IF v_base !~ '^[a-z]' THEN v_base := 's_' || v_base; END IF;
      IF length(v_base) < 2 OR v_base IN ('rejected', 'withdrawn', 'reopen', 'offer', 'enrolled') THEN v_base := 'stage_' || i; END IF;
      v_key := v_base; v_n := 1;
      WHILE EXISTS (SELECT 1 FROM public.admission_stages WHERE school_id = p_school AND key = v_key) LOOP
        v_n := v_n + 1; v_key := left(v_base, 24) || '_' || v_n;
      END LOOP;
      INSERT INTO public.admission_stages (school_id, key, label, position, system, active, requires)
        VALUES (p_school, v_key, v_label, i, NULL, coalesce((r->>'active')::boolean, true), v_req);
    ELSE
      UPDATE public.admission_stages SET label = v_label, position = i, active = coalesce((r->>'active')::boolean, true), requires = v_req
        WHERE school_id = p_school AND key = v_key AND system IS NULL;
      IF NOT FOUND THEN RAISE EXCEPTION 'A stage changed while you were editing. Reload and try again.' USING ERRCODE = 'SA409'; END IF;
    END IF;
    v_keys := v_keys || v_key;
  END LOOP;
  IF EXISTS (SELECT 1 FROM public.admission_stages WHERE school_id = p_school AND system IS NULL AND NOT key = ANY (v_keys)) THEN
    RAISE EXCEPTION 'A stage changed while you were editing. Reload and try again.' USING ERRCODE = 'SA409';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.admission_stages WHERE school_id = p_school AND system IS NULL AND active) THEN
    RAISE EXCEPTION 'Keep at least one stage before Offer in use.' USING ERRCODE = '22023';
  END IF;
  SELECT s.label, count(*) AS n INTO v_stuck FROM public.admission_stages s JOIN public.admission_applicants a ON a.school_id = s.school_id AND a.stage = s.key
    WHERE s.school_id = p_school AND s.system IS NULL AND NOT s.active GROUP BY s.label ORDER BY count(*) DESC LIMIT 1;
  IF v_stuck.label IS NOT NULL THEN
    RAISE EXCEPTION '% applicant(s) are at %. Move them on before retiring it.', v_stuck.n, v_stuck.label USING ERRCODE = '22023';
  END IF;

  v_label := trim(coalesce(p_stages->'offer'->>'label', ''));
  v_days := nullif(p_stages->'offer'->>'respondDays', '')::int;
  IF v_label <> '' THEN
    IF length(v_label) > 40 THEN RAISE EXCEPTION 'Give every stage a name of up to 40 characters.' USING ERRCODE = '22023'; END IF;
    UPDATE public.admission_stages SET label = v_label WHERE school_id = p_school AND system = 'offer';
  END IF;
  IF v_days IS NOT NULL THEN
    IF v_days NOT BETWEEN 1 AND 90 THEN RAISE EXCEPTION 'Families need between 1 and 90 days to accept.' USING ERRCODE = '22023'; END IF;
    UPDATE public.admission_stages SET respond_days = v_days WHERE school_id = p_school AND system = 'offer';
  END IF;
  v_label := trim(coalesce(p_stages->'enrolled'->>'label', ''));
  IF v_label <> '' THEN
    IF length(v_label) > 40 THEN RAISE EXCEPTION 'Give every stage a name of up to 40 characters.' USING ERRCODE = '22023'; END IF;
    UPDATE public.admission_stages SET label = v_label WHERE school_id = p_school AND system = 'enrolled';
  END IF;
  IF (SELECT count(*) FROM public.admission_stages WHERE school_id = p_school AND active) <>
     (SELECT count(DISTINCT lower(label)) FROM public.admission_stages WHERE school_id = p_school AND active) THEN
    RAISE EXCEPTION 'Two stages have the same name.' USING ERRCODE = '22023';
  END IF;
END
```

</details>

### fn admission_sweep

`admission_sweep(p_school uuid DEFAULT NULL::uuid)` → `jsonb` · plpgsql · security definer · execute: postgres, service_role

- **Touches:** `admission_offers` select, `admission_applicants` update, `admission_events` insert
- **Calls:** `app.admission_today()`, `app.admission_close_offer()`, `admission_promote()`
- **pg_cron:** `admission-sweep`

<details><summary>Source</summary>

```sql
DECLARE o record; g record; v_lapsed int := 0; v_issued int := 0;
BEGIN
  FOR o IN SELECT * FROM public.admission_offers
           WHERE status = 'issued' AND respond_by < app.admission_today() AND (p_school IS NULL OR school_id = p_school) FOR UPDATE SKIP LOCKED LOOP
    PERFORM app.admission_close_offer(o.applicant_id, 'lapsed', NULL, 'Not accepted by ' || to_char(o.respond_by, 'DD Mon YYYY'));
    UPDATE public.admission_applicants SET stage = 'withdrawn', stage_changed_at = now() WHERE id = o.applicant_id AND stage = 'offer';
    INSERT INTO public.admission_events (applicant_id, school_id, from_stage, to_stage, note, actor_id, offer_status)
      VALUES (o.applicant_id, o.school_id, 'offer', 'withdrawn', 'Offer lapsed: not accepted by ' || to_char(o.respond_by, 'DD Mon YYYY'), NULL, 'lapsed');
    v_lapsed := v_lapsed + 1;
  END LOOP;
  FOR g IN SELECT DISTINCT school_id, session, grade FROM public.admission_offers
           WHERE status = 'waitlisted' AND (p_school IS NULL OR school_id = p_school) LOOP
    v_issued := v_issued + public.admission_promote(g.school_id, g.session, g.grade, NULL);
  END LOOP;
  RETURN jsonb_build_object('lapsed', v_lapsed, 'issued', v_issued);
END
```

</details>

### fn app.admission_close_offer

`app.admission_close_offer(p_applicant uuid, p_status text, p_actor uuid, p_note text)` → `void` · plpgsql · security definer · execute: postgres

- **Touches:** `admission_offers` select/update
- **Reached from routes:** `/api/admin/admissions`, `/api/admin/admissions/offers`
- **Called by SQL:** `admission_move()`, `admission_offer_respond()`, `admission_sweep()`

<details><summary>Source</summary>

```sql
DECLARE o public.admission_offers;
BEGIN
  SELECT * INTO o FROM public.admission_offers WHERE applicant_id = p_applicant AND status IN ('proposed', 'waitlisted', 'issued', 'accepted') FOR UPDATE;
  IF o.id IS NULL THEN RETURN; END IF;
  UPDATE public.admission_offers SET status = p_status, closed_at = now(),
      response_note = CASE WHEN p_status IN ('declined', 'lapsed') THEN p_note ELSE response_note END,
      responded_at = CASE WHEN p_status = 'declined' THEN now() ELSE responded_at END,
      decision_note = CASE WHEN p_status = 'withdrawn' THEN coalesce(p_note, decision_note) ELSE decision_note END
    WHERE id = o.id;
END
```

</details>

### fn app.admission_floor

`app.admission_floor(p_school uuid)` → `void` · plpgsql · security definer · execute: postgres

- **Touches:** `schools` select, `students` select, `doc_counters` insert
- **Reached from routes:** `/api/admin/health`, `/api/admin/students/[id]`, `/api/admin/students/requests`
- **Called by SQL:** `import_students()`, `app.on_student_login_change()`, `student_correct()`

<details><summary>Source</summary>

```sql
DECLARE
  v_prefix text := left(coalesce((SELECT settings -> 'admission' ->> 'prefix' FROM public.schools WHERE id = p_school), ''), 12);
  v_max int;
BEGIN
  SELECT max(substr(admission_no, length(v_prefix) + 1)::bigint) FILTER (WHERE substr(admission_no, length(v_prefix) + 1) ~ '^\d{1,9}$')::int INTO v_max
    FROM public.students WHERE school_id = p_school AND (v_prefix = '' OR lower(left(admission_no, length(v_prefix))) = lower(v_prefix));
  IF v_max IS NOT NULL THEN
    INSERT INTO public.doc_counters (school_id, kind, session, last_no) VALUES (p_school, 'admission', 'all', v_max)
      ON CONFLICT (school_id, kind, session) DO UPDATE SET last_no = greatest(doc_counters.last_no, EXCLUDED.last_no);
  END IF;
END
```

</details>

### fn app.admission_issue

`app.admission_issue(p_offer uuid, p_actor uuid, p_note text)` → `void` · plpgsql · security definer · execute: postgres

- **Touches:** `admission_offers` select/update, `admission_stages` select, `admission_applicants` select/update, `admission_events` insert
- **Calls:** `app.admission_today()`
- **Reached from routes:** `/api/admin/admissions`, `/api/admin/admissions/offers`, `/api/admin/admissions/setup`
- **Called by SQL:** `admission_offer_decide()`, `admission_promote()`

<details><summary>Source</summary>

```sql
DECLARE o public.admission_offers; v_days int; v_from text;
BEGIN
  SELECT * INTO o FROM public.admission_offers WHERE id = p_offer FOR UPDATE;
  SELECT coalesce(respond_days, 14) INTO v_days FROM public.admission_stages WHERE school_id = o.school_id AND system = 'offer';
  UPDATE public.admission_offers SET status = 'issued', issued_at = now(),
      respond_by = CASE WHEN respond_by IS NOT NULL AND respond_by >= app.admission_today() THEN respond_by ELSE app.admission_today() + coalesce(v_days, 14) END
    WHERE id = p_offer;
  SELECT stage INTO v_from FROM public.admission_applicants WHERE id = o.applicant_id;
  UPDATE public.admission_applicants SET stage = 'offer', stage_changed_at = now(),
      furthest_stage = CASE WHEN furthest_stage = 'enrolled' THEN furthest_stage ELSE 'offer' END
    WHERE id = o.applicant_id;
  INSERT INTO public.admission_events (applicant_id, school_id, from_stage, to_stage, note, actor_id, offer_status)
    VALUES (o.applicant_id, o.school_id, v_from, 'offer', p_note, p_actor, 'issued');
END
```

</details>

### fn app.admission_lock_grade

`app.admission_lock_grade(p_school uuid, p_session text, p_grade integer)` → `void` · sql · security invoker · execute: postgres

- **Reached from routes:** `/api/admin/admissions`, `/api/admin/admissions/offers`, `/api/admin/admissions/setup`
- **Called by SQL:** `admission_offer_decide()`, `admission_promote()`

<details><summary>Source</summary>

```sql
SELECT pg_advisory_xact_lock(hashtextextended('admission:' || p_school || ':' || p_session || ':' || p_grade, 0))
```

</details>

### fn app.admission_offer_backfill

`app.admission_offer_backfill()` → `trigger` · plpgsql · security definer · execute: postgres

- **Touches:** `admission_offers` select/insert
- **Trigger function on:** `admission_applicants`

<details><summary>Source</summary>

```sql
BEGIN
  IF NEW.stage = 'offer' AND NOT EXISTS (SELECT 1 FROM public.admission_offers o WHERE o.applicant_id = NEW.id AND o.status IN ('proposed', 'waitlisted', 'issued', 'accepted')) THEN
    INSERT INTO public.admission_offers (school_id, applicant_id, session, grade, status, proposal_note, issued_at)
      VALUES (NEW.school_id, NEW.id, NEW.session, NEW.grade, 'issued', 'Recorded at Offer without an approval step', now());
  END IF;
  RETURN NEW;
END
```

</details>

### fn app.admission_rank

`app.admission_rank(p_school uuid, p_key text)` → `integer` · sql · security definer · execute: postgres

- **Touches:** `admission_stages` select
- **Reached from routes:** `/api/admin/admissions`, `/api/admin/admissions/offers`
- **Called by SQL:** `admission_move()`, `admission_offer_propose()`

<details><summary>Source</summary>

```sql
SELECT coalesce((SELECT CASE s.system WHEN 'offer' THEN 1000000 WHEN 'enrolled' THEN 1000001 ELSE s.position END
                   FROM public.admission_stages s WHERE s.school_id = p_school AND s.key = p_key), -1);
```

</details>

### fn app.admission_seats_left

`app.admission_seats_left(p_school uuid, p_session text, p_grade integer)` → `integer` · sql · security definer · execute: postgres

- **Touches:** `admission_applicants` select, `admission_seats` select
- **Reached from routes:** `/api/admin/admissions`, `/api/admin/admissions/offers`, `/api/admin/admissions/setup`
- **Called by SQL:** `admission_offer_decide()`, `admission_promote()`

<details><summary>Source</summary>

```sql
SELECT s.capacity - (SELECT count(*)::int FROM public.admission_applicants a
                       WHERE a.school_id = p_school AND a.session = p_session AND a.grade = p_grade AND a.stage IN ('offer', 'enrolled'))
  FROM public.admission_seats s WHERE s.school_id = p_school AND s.session = p_session AND s.grade = p_grade;
```

</details>

### fn app.admission_today

`app.admission_today()` → `date` · sql · security invoker · execute: PUBLIC(default)

- **Reached from routes:** `/api/admin/admissions`, `/api/admin/admissions/offers`, `/api/admin/admissions/setup`
- **Called by SQL:** `app.admission_issue()`, `admission_offer_propose()`, `admission_sweep()`

<details><summary>Source</summary>

```sql
SELECT (now() AT TIME ZONE 'Asia/Kolkata')::date
```

</details>

### fn app.audit

`app.audit()` → `trigger` · plpgsql · security definer · execute: authenticated, postgres

- **Touches:** `users` select, `audit_log` insert
- **Calls:** `app.importing()`, `app.user_role()`
- **Trigger function on:** `academic_events`, `admission_applicants`, `admission_documents`, `admission_offers`, `admission_seats`, `admission_stages`, `attendance`, `attendance_month_reviews`, `attendance_settings`, `cc_groups`, `cc_memberships`, `certificate_settings`, `certificate_types`, `certificates`, `class_subjects`, `comp_off_grants`, `consents`, `counselling_cases`, `counselling_referrals`, `counselling_sessions`, `cover_assignments`, `discipline_actions`, `emergency_contacts`, `enrolments`, `exam_assessments`, `exam_class_terms`, `exam_schemes`, `exam_sheets`, `exam_terms`, `family_members`, `fee_concession_requests`, `fee_day_closes`, `fee_invoices`, `fee_payments`, `fee_reminders`, `fee_structures`, `guardians`, `health_events`, `house_members`, `house_points`, `houses`, `hr_grades`, `hr_posts`, `incidents`, `kirti_entries`, `leave_policies`, `leave_requests`, `legacy_results`, `pay_items`, `pay_runs`, `payroll_settings`, `probe_acks`, `role_grants`, `safeguarding_log`, `school_filings`, `schools`, `sibling_links`, `staff_absences`, `staff_day_marks`, `staff_documents`, `staff_exits`, `staff_jobs`, `staff_members`, `staff_shift_plans`, `statutory_overrides`, `student_change_requests`, `student_documents`, `student_health`, `student_subjects`, `subject_leads`, `submissions`, `teacher_subjects`, `timetable_versions`, `users`, `visit_sessions`

<details><summary>Source</summary>

```sql
DECLARE
  v_old jsonb := CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) END;
  v_new jsonb := CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) END;
  v_row jsonb := coalesce(v_new, v_old);
  v_school uuid;
BEGIN
  -- Bulk imports are audited once, by their import_jobs row.
  IF app.importing() THEN RETURN NULL; END IF;
  IF TG_OP = 'UPDATE' AND TG_NARGS > 0 THEN
    IF NOT EXISTS (SELECT 1 FROM unnest(string_to_array(TG_ARGV[0], ',')) f
                   WHERE v_old -> f IS DISTINCT FROM v_new -> f) THEN
      RETURN NULL;
    END IF;
  END IF;
  v_school := CASE WHEN TG_TABLE_NAME = 'guardians'
                   THEN (SELECT school_id FROM public.users WHERE id = (v_row ->> 'student_id')::uuid)
                   ELSE nullif(v_row ->> 'school_id', '')::uuid END;
  INSERT INTO public.audit_log (actor_id, actor_role, action, table_name, row_id, school_id, old_values, new_values)
  VALUES (auth.uid(), CASE WHEN auth.uid() IS NULL THEN 'server' ELSE coalesce(app.user_role(), 'unknown') END,
          TG_OP, TG_TABLE_NAME, v_row ->> 'id', v_school, v_old, v_new);
  RETURN NULL;
END
```

</details>

### fn app.audit_exam_marks

`app.audit_exam_marks()` → `trigger` · plpgsql · security definer · execute: PUBLIC(default)

- **Touches:** `exam_sheets` select, `audit_log` insert
- **Calls:** `app.importing()`, `app.user_role()`
- **Trigger function on:** `exam_marks`

<details><summary>Source</summary>

```sql
DECLARE v_was_submitted boolean;
BEGIN
  IF app.importing() THEN RETURN NULL; END IF;
  SELECT submitted_at IS NOT NULL INTO v_was_submitted FROM public.exam_sheets WHERE id = coalesce(NEW.sheet_id, OLD.sheet_id);
  IF NOT coalesce(v_was_submitted, false) THEN RETURN NULL; END IF;
  IF TG_OP = 'UPDATE' AND NEW.marks IS NOT DISTINCT FROM OLD.marks AND NEW.code IS NOT DISTINCT FROM OLD.code THEN RETURN NULL; END IF;
  INSERT INTO public.audit_log (actor_id, actor_role, action, table_name, row_id, school_id, old_values, new_values)
  VALUES (coalesce(auth.uid(), (coalesce(NEW, OLD)).updated_by), CASE WHEN auth.uid() IS NULL THEN 'server' ELSE coalesce(app.user_role(), 'unknown') END,
          TG_OP, 'exam_marks', (coalesce(NEW, OLD)).id::text, (coalesce(NEW, OLD)).school_id,
          CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE jsonb_build_object('sheet_id', OLD.sheet_id, 'student_id', OLD.student_id, 'marks', OLD.marks, 'code', OLD.code) END,
          CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE jsonb_build_object('sheet_id', NEW.sheet_id, 'student_id', NEW.student_id, 'marks', NEW.marks, 'code', NEW.code, 'source', NEW.source) END);
  RETURN NULL;
END
```

</details>

### fn app.audit_fields_only

`app.audit_fields_only()` → `trigger` · plpgsql · security definer · execute: PUBLIC(default)

- **Touches:** `audit_log` insert
- **Calls:** `app.user_role()`
- **Trigger function on:** `staff_profiles`, `staff_statutory`

<details><summary>Source</summary>

```sql
DECLARE
  v_old jsonb := CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) END;
  v_new jsonb := CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) END;
  v_row jsonb := coalesce(v_new, v_old);
  v_fields text[];
BEGIN
  SELECT coalesce(array_agg(k ORDER BY k), '{}') INTO v_fields
  FROM jsonb_object_keys(v_row) k
  WHERE k NOT IN ('staff_member_id', 'school_id', 'updated_at', 'updated_by')
    AND coalesce(v_old -> k, 'null'::jsonb) IS DISTINCT FROM coalesce(v_new -> k, 'null'::jsonb);
  IF TG_OP = 'UPDATE' AND cardinality(v_fields) = 0 THEN RETURN NULL; END IF;
  INSERT INTO public.audit_log (actor_id, actor_role, action, table_name, row_id, school_id, old_values, new_values)
  VALUES (coalesce(auth.uid(), nullif(v_row ->> 'updated_by', '')::uuid),
          CASE WHEN auth.uid() IS NULL THEN 'server' ELSE coalesce(app.user_role(), 'unknown') END,
          TG_OP, TG_TABLE_NAME, v_row ->> 'staff_member_id', nullif(v_row ->> 'school_id', '')::uuid,
          NULL, jsonb_build_object('fields', to_jsonb(v_fields)));
  RETURN NULL;
END
```

</details>

### fn app.audit_students

`app.audit_students()` → `trigger` · plpgsql · security definer · execute: PUBLIC(default)

- **Touches:** `audit_log` insert
- **Calls:** `app.importing()`, `app.user_role()`
- **Trigger function on:** `students`

<details><summary>Source</summary>

```sql
DECLARE
  v_old jsonb := CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) - 'aadhaar_cipher' - 'aadhaar_hash' END;
  v_new jsonb := CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) - 'aadhaar_cipher' - 'aadhaar_hash' END;
BEGIN
  IF app.importing() THEN RETURN NULL; END IF;
  IF TG_OP = 'UPDATE' AND (v_old - 'updated_at') = (v_new - 'updated_at') AND OLD.aadhaar_cipher IS NOT DISTINCT FROM NEW.aadhaar_cipher THEN RETURN NULL; END IF;
  INSERT INTO public.audit_log (actor_id, actor_role, action, table_name, row_id, school_id, old_values, new_values)
  VALUES (auth.uid(), CASE WHEN auth.uid() IS NULL THEN 'server' ELSE coalesce(app.user_role(), 'unknown') END,
          TG_OP, 'students', coalesce(NEW.id, OLD.id)::text, coalesce(NEW.school_id, OLD.school_id), v_old, v_new);
  RETURN NULL;
END
```

</details>

### fn app.audit_touch_only

`app.audit_touch_only()` → `trigger` · plpgsql · security definer · execute: PUBLIC(default)

- **Touches:** `audit_log` insert
- **Calls:** `app.user_role()`
- **Trigger function on:** `pay_adjustments`, `staff_loans`, `staff_pay_settings`, `staff_salaries`, `tax_declarations`

<details><summary>Source</summary>

```sql
DECLARE v_row jsonb := to_jsonb(coalesce(NEW, OLD));
BEGIN
  INSERT INTO public.audit_log (actor_id, actor_role, action, table_name, row_id, school_id, old_values, new_values)
  VALUES (coalesce(auth.uid(), nullif(v_row ->> 'created_by', '')::uuid, nullif(v_row ->> 'updated_by', '')::uuid),
          CASE WHEN auth.uid() IS NULL THEN 'server' ELSE coalesce(app.user_role(), 'unknown') END,
          TG_OP, TG_TABLE_NAME, coalesce(v_row ->> 'id', v_row ->> 'staff_member_id'), nullif(v_row ->> 'school_id', '')::uuid, NULL,
          jsonb_strip_nulls(jsonb_build_object('staff_member_id', v_row ->> 'staff_member_id', 'effective_from', v_row ->> 'effective_from', 'month', v_row ->> 'month', 'fy', v_row ->> 'fy')));
  RETURN NULL;
END
```

</details>

### fn app.bootstrap_school_admin

`app.bootstrap_school_admin()` → `trigger` · plpgsql · security definer · execute: authenticated, postgres, service_role

- **Touches:** `role_grants` select/insert
- **Trigger function on:** `users`

<details><summary>Source</summary>

```sql
BEGIN
  IF NEW.role = 'admin' AND NEW.school_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.role_grants g WHERE g.school_id = NEW.school_id AND g.role_key = 'school_admin' AND g.revoked_at IS NULL) THEN
    INSERT INTO public.role_grants (school_id, user_id, role_key, note) VALUES (NEW.school_id, NEW.id, 'school_admin', 'First admin of the school');
  END IF;
  RETURN NULL;
END
```

</details>

### fn app.can_see_thread

`app.can_see_thread(p_thread uuid)` → `boolean` · sql · security definer · execute: authenticated, postgres

- **Touches:** `school_threads` select
- **Calls:** `app.is_parent_of()`, `app.current_school_id()`, `app.has_perm()`, `app.is_superadmin()`

<details><summary>Source</summary>

```sql
SELECT EXISTS (
    SELECT 1 FROM public.school_threads t
    WHERE t.id = p_thread AND (
      (t.parent_id = auth.uid() AND app.is_parent_of(t.student_id))
      OR t.staff_id = auth.uid()
      OR (t.school_id = app.current_school_id() AND app.has_perm('messages.office'))
      OR app.is_superadmin()
    )
  )
```

</details>

### fn app.check_timetable_slot

`app.check_timetable_slot()` → `trigger` · plpgsql · security invoker · execute: PUBLIC(default)

- **Touches:** `timetable_versions` select, `timetable_slots` select
- **Trigger function on:** `timetable_slots`

<details><summary>Source</summary>

```sql
DECLARE clash record;
BEGIN
  IF NEW.school_id IS DISTINCT FROM (SELECT school_id FROM public.timetable_versions WHERE id = NEW.version_id) THEN
    RAISE EXCEPTION 'timetable slot and version are in different schools';
  END IF;
  IF NEW.teacher_id IS NOT NULL OR NEW.staff_member_id IS NOT NULL THEN
    SELECT s.class INTO clash FROM public.timetable_slots s
     WHERE s.version_id = NEW.version_id AND s.weekday = NEW.weekday AND s.period_no = NEW.period_no AND s.id <> NEW.id
       AND ((NEW.teacher_id IS NOT NULL AND s.teacher_id = NEW.teacher_id)
            OR (NEW.staff_member_id IS NOT NULL AND s.staff_member_id = NEW.staff_member_id))
       AND NOT (NEW.combined AND s.combined AND lower(s.subject) = lower(NEW.subject))
     LIMIT 1;
    IF FOUND THEN
      RAISE EXCEPTION 'teacher clash: already teaching % in this period', clash.class USING ERRCODE = '23P01';
    END IF;
  END IF;
  IF NEW.room_id IS NOT NULL THEN
    SELECT s.class INTO clash FROM public.timetable_slots s
     WHERE s.version_id = NEW.version_id AND s.weekday = NEW.weekday AND s.period_no = NEW.period_no
       AND s.room_id = NEW.room_id AND s.id <> NEW.id
       AND NOT (NEW.combined AND s.combined AND lower(s.subject) = lower(NEW.subject))
     LIMIT 1;
    IF FOUND THEN
      RAISE EXCEPTION 'room clash: % is already in this room in this period', clash.class USING ERRCODE = '23P01';
    END IF;
  END IF;
  RETURN NEW;
END
```

</details>

### fn app.cp_reader

`app.cp_reader()` → `boolean` · sql · security definer · execute: authenticated, postgres, service_role

- **Calls:** `app.user_cp_reader()`

<details><summary>Source</summary>

```sql
SELECT app.user_cp_reader(auth.uid())
```

</details>

### fn app.current_school_id

`app.current_school_id()` → `uuid` · sql · security definer · execute: authenticated, postgres

- **Touches:** `users` select
- **Reached from routes:** `/api/staff/ask`, `/api/whatsapp/simulate`, `/api/whatsapp/webhook`
- **Called by SQL:** `admin_teacher_work()`, `app.can_see_thread()`, `school_attendance_summary()`, `school_wellness_aggregates()`, `school_wellness_report()`

<details><summary>Source</summary>

```sql
SELECT school_id FROM public.users WHERE id = auth.uid()
```

</details>

### fn app.current_session

`app.current_session(p_school uuid)` → `text` · sql · security definer · execute: PUBLIC(default)

- **Touches:** `schools` select
- **Calls:** `app.session_of()`, `app.school_today()`
- **Reached from routes:** `/api/admin/students/settings`
- **Called by SQL:** `import_enrolments()`, `app.on_student_login_change()`, `app.sync_student_login()`

<details><summary>Source</summary>

```sql
SELECT coalesce(CASE WHEN (s.settings -> 'session' ->> 'current') ~ '^\d{4}-\d{2}$' THEN s.settings -> 'session' ->> 'current' END,
                  app.session_of(p_school, app.school_today()))
  FROM public.schools s WHERE s.id = p_school
```

</details>

### fn app.day_closed

`app.day_closed(p_school uuid, p_day date)` → `boolean` · sql · security definer · execute: authenticated, postgres, service_role

- **Touches:** `fee_day_closes` select
- **Reached from routes:** `/api/admin/fees`, `/api/admin/import`, `/api/admin/import/[id]`, `/api/import/worker`, `/api/ops/schools/[id]/import`, `/api/ops/schools/[id]/import/[jobId]`
- **Called by SQL:** `admin_close_day()`, `admin_record_payment()`, `app.guard_fee_payment()`, `import_undo()`

<details><summary>Source</summary>

```sql
SELECT EXISTS (SELECT 1 FROM public.fee_day_closes WHERE school_id = p_school AND day = p_day AND status = 'closed')
```

</details>

### fn app.enrol_core

`app.enrol_core(p_class_subject uuid)` → `void` · sql · security definer · execute: postgres

- **Touches:** `student_subjects` insert, `class_subjects` select, `classes` select, `users` select
- **Calls:** `app.norm_class()`
- **Called by SQL:** `app.on_class_subject_change()`

<details><summary>Source</summary>

```sql
INSERT INTO public.student_subjects (school_id, student_id, class_subject_id, source)
  SELECT cs.school_id, u.id, cs.id, 'core'
  FROM public.class_subjects cs
  JOIN public.classes c ON c.id = cs.class_id
  JOIN public.users u ON u.school_id = cs.school_id AND u.role = 'student' AND app.norm_class(u.student_class) = app.norm_class(c.name)
  WHERE cs.id = p_class_subject AND cs.kind = 'core'
  ON CONFLICT (student_id, class_subject_id) DO NOTHING;
```

</details>

### fn app.erase_health

`app.erase_health(p_student uuid, p_reason text)` → `void` · plpgsql · security definer · execute: PUBLIC(default)

- **Touches:** `student_health` update, `health_events` delete
- **Called by SQL:** `health_retention_purge()`, `app.on_health_consent()`

<details><summary>Source</summary>

```sql
BEGIN
  UPDATE public.student_health SET allergies = '[]', conditions = '[]', medication = '[]', erased_at = now(), erased_reason = left(p_reason, 200)
    WHERE student_id = p_student AND (allergies <> '[]'::jsonb OR conditions <> '[]'::jsonb OR medication <> '[]'::jsonb);
  DELETE FROM public.health_events WHERE student_id = p_student;
END
```

</details>

### fn app.grade_from_class

`app.grade_from_class(t text)` → `integer` · sql · security invoker · execute: PUBLIC(default)

- **Calls:** `app.grade_of()`
- **Reached from routes:** `/api/admin/certificates`, `/api/admin/students`, `/api/admin/students/[id]`, `/api/admin/students/year`
- **Called by SQL:** `app.move_enrolment()`

<details><summary>Source</summary>

```sql
SELECT CASE
    WHEN lower(coalesce(t, '')) ~ '(nursery|pre-?kg|pp-?1|playgroup)' THEN -2
    WHEN lower(coalesce(t, '')) ~ '(lkg|pp-?2)' THEN -1
    WHEN lower(coalesce(t, '')) ~ '(ukg|pp-?3)' THEN 0
    ELSE CASE WHEN app.grade_of(t) BETWEEN 1 AND 12 THEN app.grade_of(t) END END
```

</details>

### fn app.grade_of

`app.grade_of(t text)` → `integer` · sql · security invoker · execute: authenticated, postgres

- **Reached from routes:** `/api/admin/certificates`, `/api/admin/fees`, `/api/admin/students`, `/api/admin/students/[id]`, `/api/admin/students/year`, `/api/ops/requests`, `/api/staff/ask`, `/api/whatsapp/simulate`, `/api/whatsapp/webhook`
- **Called by SQL:** `admin_invoice_student()`, `admin_raise_invoices()`, `app.grade_from_class()`, `school_wellness_report()`

<details><summary>Source</summary>

```sql
SELECT nullif(substring(coalesce(t, '') from '(\d{1,2})'), '')::int
```

</details>

### fn app.guard_certificate

`app.guard_certificate()` → `trigger` · plpgsql · security invoker · execute: PUBLIC(default)

- **Trigger function on:** `certificates`

<details><summary>Source</summary>

```sql
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status IN ('issued', 'cancelled') AND coalesce(current_setting('sthara.import_job', true), '') = '' THEN
      RAISE EXCEPTION 'an issued certificate stays on the register; cancel it instead' USING ERRCODE = '42501';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.status IN ('issued', 'cancelled') AND coalesce(current_setting('sthara.import_job', true), '') = '' AND (
      NEW.data IS DISTINCT FROM OLD.data OR NEW.number IS DISTINCT FROM OLD.number OR NEW.serial IS DISTINCT FROM OLD.serial
      OR NEW.issued_on IS DISTINCT FROM OLD.issued_on OR NEW.student_id IS DISTINCT FROM OLD.student_id OR NEW.type_id IS DISTINCT FROM OLD.type_id
      OR (OLD.status = 'cancelled' AND NEW.status <> 'cancelled')) THEN
    RAISE EXCEPTION 'an issued certificate can''t be changed; cancel it and issue a new one' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END
```

</details>

### fn app.guard_director

`app.guard_director()` → `trigger` · plpgsql · security definer · execute: postgres

- **Touches:** `users` select, `superadmins` select
- **Trigger function on:** `ops_operators`

<details><summary>Source</summary>

```sql
BEGIN
  IF NEW.role = 'director' AND NOT (
       EXISTS (SELECT 1 FROM public.users WHERE id = NEW.user_id AND role = 'superadmin')
       OR EXISTS (SELECT 1 FROM public.superadmins WHERE user_id = NEW.user_id)) THEN
    RAISE EXCEPTION 'Only the superadmin can be a director' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END
```

</details>

### fn app.guard_exam_marks

`app.guard_exam_marks()` → `trigger` · plpgsql · security invoker · execute: PUBLIC(default)

- **Touches:** `exam_sheets` select
- **Trigger function on:** `exam_marks`

<details><summary>Source</summary>

```sql
DECLARE s record;
BEGIN
  IF TG_OP = 'DELETE' AND NOT EXISTS (SELECT 1 FROM public.exam_sheets WHERE id = OLD.sheet_id) THEN RETURN OLD; END IF;
  SELECT status, max_marks INTO s FROM public.exam_sheets WHERE id = coalesce(NEW.sheet_id, OLD.sheet_id);
  IF s.status <> 'open' THEN
    RAISE EXCEPTION 'marks sheet is not open' USING ERRCODE = '42501';
  END IF;
  IF TG_OP <> 'DELETE' AND NEW.marks IS NOT NULL AND NEW.marks > s.max_marks THEN
    RAISE EXCEPTION 'marks above the maximum' USING ERRCODE = '23514';
  END IF;
  RETURN coalesce(NEW, OLD);
END
```

</details>

### fn app.guard_exam_scheme_grades

`app.guard_exam_scheme_grades()` → `trigger` · plpgsql · security invoker · execute: PUBLIC(default)

- **Touches:** `exam_schemes` select
- **Trigger function on:** `exam_schemes`

<details><summary>Source</summary>

```sql
BEGIN
  IF NEW.status = 'active' AND EXISTS (
    SELECT 1 FROM public.exam_schemes s
    WHERE s.school_id = NEW.school_id AND s.session = NEW.session AND s.status = 'active' AND s.id <> NEW.id AND s.grades && NEW.grades
  ) THEN
    RAISE EXCEPTION 'another active scheme already covers one of these classes' USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END
```

</details>

### fn app.guard_exam_student_terms

`app.guard_exam_student_terms()` → `trigger` · plpgsql · security invoker · execute: PUBLIC(default)

- **Touches:** `exam_terms` select, `exam_class_terms` select, `classes` select, `users` select
- **Trigger function on:** `exam_student_terms`

<details><summary>Source</summary>

```sql
DECLARE v_student uuid := coalesce(NEW.student_id, OLD.student_id); v_term uuid := coalesce(NEW.term_id, OLD.term_id);
BEGIN
  IF TG_OP = 'DELETE' AND NOT EXISTS (SELECT 1 FROM public.exam_terms WHERE id = v_term) THEN RETURN OLD; END IF;
  IF EXISTS (
    SELECT 1 FROM public.exam_class_terms ct JOIN public.classes c ON c.id = ct.class_id JOIN public.users u ON u.id = v_student
    WHERE ct.term_id = v_term AND ct.status = 'published'
      AND regexp_replace(lower(c.name), 'class|[^a-z0-9]', '', 'g') = regexp_replace(lower(coalesce(u.student_class, '')), 'class|[^a-z0-9]', '', 'g')
  ) THEN
    RAISE EXCEPTION 'class term is published' USING ERRCODE = '42501';
  END IF;
  RETURN coalesce(NEW, OLD);
END
```

</details>

### fn app.guard_fee_payment

`app.guard_fee_payment()` → `trigger` · plpgsql · security invoker · execute: authenticated, postgres

- **Calls:** `app.day_closed()`
- **Trigger function on:** `fee_payments`

<details><summary>Source</summary>

```sql
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Receipts cannot be deleted; void them instead' USING ERRCODE = '42501'; END IF;
  IF OLD.voided_at IS NOT NULL THEN RAISE EXCEPTION 'This receipt is already void' USING ERRCODE = '42501'; END IF;
  IF (NEW.amount, NEW.invoice_id, NEW.student_id, NEW.mode, NEW.paid_on, NEW.receipt_no, NEW.school_id)
     IS DISTINCT FROM (OLD.amount, OLD.invoice_id, OLD.student_id, OLD.mode, OLD.paid_on, OLD.receipt_no, OLD.school_id) THEN
    RAISE EXCEPTION 'Receipts cannot be edited; void and re-issue' USING ERRCODE = '42501';
  END IF;
  IF NEW.voided_at IS NOT NULL AND app.day_closed(OLD.school_id, OLD.paid_on) THEN
    RAISE EXCEPTION 'The day book for % is closed. Reopen it to void this receipt.', OLD.paid_on USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END
```

</details>

### fn app.guard_health

`app.guard_health()` → `trigger` · plpgsql · security definer · execute: PUBLIC(default)

- **Calls:** `app.health_consent()`
- **Trigger function on:** `health_events`, `student_health`

<details><summary>Source</summary>

```sql
BEGIN
  IF TG_TABLE_NAME = 'student_health' THEN
    IF (NEW.allergies <> '[]'::jsonb OR NEW.conditions <> '[]'::jsonb OR NEW.medication <> '[]'::jsonb)
       AND (TG_OP = 'INSERT' OR (NEW.allergies, NEW.conditions, NEW.medication) IS DISTINCT FROM (OLD.allergies, OLD.conditions, OLD.medication))
       AND NOT app.health_consent(NEW.student_id) THEN
      RAISE EXCEPTION 'Allergies, conditions and medication need the parent''s health consent' USING ERRCODE = '42501';
    END IF;
  ELSIF (TG_OP = 'INSERT' OR (NEW.kind, NEW.on_date, NEW.data, NEW.note) IS DISTINCT FROM (OLD.kind, OLD.on_date, OLD.data, OLD.note))
        AND NOT app.health_consent(NEW.student_id) THEN
    RAISE EXCEPTION 'Check-ups and vaccinations need the parent''s health consent' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END
```

</details>

### fn app.guard_notification_update

`app.guard_notification_update()` → `trigger` · plpgsql · security invoker · execute: authenticated, postgres

- **Calls:** `app.is_server()`
- **Trigger function on:** `notifications`

<details><summary>Source</summary>

```sql
DECLARE v_read boolean := NEW.read;
BEGIN
  IF NOT app.is_server() THEN
    NEW := OLD;
    NEW.read := v_read;
  END IF;
  RETURN NEW;
END
```

</details>

### fn app.guard_pay_run_lines

`app.guard_pay_run_lines()` → `trigger` · plpgsql · security invoker · execute: PUBLIC(default)

- **Touches:** `pay_runs` select
- **Trigger function on:** `pay_run_lines`

<details><summary>Source</summary>

```sql
BEGIN
  IF EXISTS (SELECT 1 FROM public.pay_runs r WHERE r.id = coalesce(NEW.run_id, OLD.run_id) AND r.status = 'approved') THEN
    RAISE EXCEPTION 'pay run is approved and frozen' USING ERRCODE = '42501';
  END IF;
  RETURN coalesce(NEW, OLD);
END
```

</details>

### fn app.guard_pay_runs

`app.guard_pay_runs()` → `trigger` · plpgsql · security invoker · execute: PUBLIC(default)

- **Touches:** `schools` select
- **Trigger function on:** `pay_runs`

<details><summary>Source</summary>

```sql
BEGIN
  -- Removing a whole school takes its payroll with it: by then the school row is already gone.
  IF TG_OP = 'DELETE' AND NOT EXISTS (SELECT 1 FROM public.schools WHERE id = OLD.school_id) THEN RETURN OLD; END IF;
  IF OLD.status = 'approved' THEN
    RAISE EXCEPTION 'pay run is approved and frozen' USING ERRCODE = '42501';
  END IF;
  RETURN coalesce(NEW, OLD);
END
```

</details>

### fn app.guard_published_slots

`app.guard_published_slots()` → `trigger` · plpgsql · security invoker · execute: PUBLIC(default)

- **Touches:** `timetable_versions` select
- **Trigger function on:** `timetable_slots`

<details><summary>Source</summary>

```sql
BEGIN
  -- A deleted person or room leaves the lesson in place, unassigned. (class_key is generated, so it isn't
  -- computed yet in a BEFORE trigger and is left out of the comparison.)
  IF TG_OP = 'UPDATE'
     AND (to_jsonb(NEW) - ARRAY['teacher_id', 'staff_member_id', 'room_id', 'class_key']) = (to_jsonb(OLD) - ARRAY['teacher_id', 'staff_member_id', 'room_id', 'class_key'])
     AND (NEW.teacher_id IS NULL OR NEW.teacher_id IS NOT DISTINCT FROM OLD.teacher_id)
     AND (NEW.staff_member_id IS NULL OR NEW.staff_member_id IS NOT DISTINCT FROM OLD.staff_member_id)
     AND (NEW.room_id IS NULL OR NEW.room_id IS NOT DISTINCT FROM OLD.room_id) THEN
    RETURN NEW;
  END IF;
  -- Subject linking relabels a subject to its official name; nothing else may change.
  IF TG_OP = 'UPDATE' AND current_setting('app.subject_relabel', true) = 'on'
     AND (to_jsonb(NEW) - ARRAY['subject', 'class_key']) = (to_jsonb(OLD) - ARRAY['subject', 'class_key']) THEN
    RETURN NEW;
  END IF;
  -- Linking a login: the lesson's register teacher becomes the same person's account; nothing else may change.
  IF TG_OP = 'UPDATE' AND current_setting('app.person_relink', true) = 'on'
     AND OLD.staff_member_id IS NOT NULL AND NEW.staff_member_id IS NULL AND OLD.teacher_id IS NULL AND NEW.teacher_id IS NOT NULL
     AND (to_jsonb(NEW) - ARRAY['teacher_id', 'staff_member_id', 'class_key']) = (to_jsonb(OLD) - ARRAY['teacher_id', 'staff_member_id', 'class_key']) THEN
    RETURN NEW;
  END IF;
  IF EXISTS (SELECT 1 FROM public.timetable_versions v
             WHERE v.id = coalesce(NEW.version_id, OLD.version_id) AND v.status <> 'draft') THEN
    RAISE EXCEPTION 'this timetable is published; copy it to a new draft to change it' USING ERRCODE = '42501';
  END IF;
  RETURN coalesce(NEW, OLD);
END
```

</details>

### fn app.guard_report_cards

`app.guard_report_cards()` → `trigger` · plpgsql · security invoker · execute: PUBLIC(default)

- **Touches:** `schools` select, `users` select, `exam_terms` select
- **Trigger function on:** `report_cards`

<details><summary>Source</summary>

```sql
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF NOT EXISTS (SELECT 1 FROM public.schools WHERE id = OLD.school_id)
       OR NOT EXISTS (SELECT 1 FROM public.users WHERE id = OLD.student_id)
       OR NOT EXISTS (SELECT 1 FROM public.exam_terms WHERE id = OLD.term_id) THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'report cards are kept' USING ERRCODE = '42501';
  END IF;
  IF NEW.snapshot IS DISTINCT FROM OLD.snapshot OR NEW.version <> OLD.version OR NEW.student_id <> OLD.student_id OR NEW.term_id <> OLD.term_id
     OR NEW.published_at <> OLD.published_at OR NEW.revised <> OLD.revised OR NEW.revision_reason IS DISTINCT FROM OLD.revision_reason
     OR (OLD.superseded_at IS NOT NULL AND NEW.superseded_at IS DISTINCT FROM OLD.superseded_at) THEN
    RAISE EXCEPTION 'published report card is frozen' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END
```

</details>

### fn app.guard_role_grant

`app.guard_role_grant()` → `trigger` · plpgsql · security definer · execute: authenticated, postgres, service_role

- **Touches:** `users` select, `role_grants` select
- **Trigger function on:** `role_grants`

<details><summary>Source</summary>

```sql
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = NEW.user_id AND school_id = NEW.school_id AND role = 'admin') THEN
      RAISE EXCEPTION 'Roles can only be given to office (admin) accounts of this school' USING ERRCODE = '22023';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    IF EXISTS (SELECT 1 FROM public.users WHERE id = OLD.user_id) THEN
      RAISE EXCEPTION 'Grants are revoked, not deleted' USING ERRCODE = '42501';
    END IF;
    RETURN OLD;
  END IF;
  IF (NEW.user_id, NEW.role_key, NEW.school_id) IS DISTINCT FROM (OLD.user_id, OLD.role_key, OLD.school_id) THEN
    RAISE EXCEPTION 'Revoke this grant and create a new one instead' USING ERRCODE = '42501';
  END IF;
  IF OLD.revoked_at IS NULL AND NEW.revoked_at IS NOT NULL AND OLD.role_key = 'school_admin'
     AND NOT EXISTS (SELECT 1 FROM public.role_grants g WHERE g.school_id = OLD.school_id AND g.role_key = 'school_admin'
                     AND g.revoked_at IS NULL AND g.id <> OLD.id AND (g.expires_on IS NULL OR g.expires_on >= current_date)) THEN
    RAISE EXCEPTION 'A school must keep at least one school admin' USING ERRCODE = '22023';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END
```

</details>

### fn app.guard_subject_link

`app.guard_subject_link()` → `trigger` · plpgsql · security definer · execute: postgres

- **Touches:** `classes` select, `users` select, `class_subjects` select
- **Trigger function on:** `class_subjects`, `student_subjects`, `subject_leads`, `teacher_subjects`

<details><summary>Source</summary>

```sql
DECLARE v_school uuid; v_role text; v_user_school uuid;
BEGIN
  IF TG_TABLE_NAME = 'class_subjects' THEN
    SELECT school_id INTO v_school FROM public.classes WHERE id = NEW.class_id;
    IF v_school IS DISTINCT FROM NEW.school_id THEN RAISE EXCEPTION 'class_subjects: class belongs to another school'; END IF;
    NEW.updated_at := now();
    RETURN NEW;
  END IF;
  IF TG_TABLE_NAME = 'subject_leads' THEN
    SELECT role, school_id INTO v_role, v_user_school FROM public.users WHERE id = NEW.user_id;
    IF v_user_school IS DISTINCT FROM NEW.school_id OR v_role NOT IN ('teacher', 'admin') THEN
      RAISE EXCEPTION 'subject_leads: a subject lead must be a teacher or office account of the school';
    END IF;
    RETURN NEW;
  END IF;
  SELECT school_id INTO v_school FROM public.class_subjects WHERE id = NEW.class_subject_id;
  IF v_school IS DISTINCT FROM NEW.school_id THEN RAISE EXCEPTION '%: class subject belongs to another school', TG_TABLE_NAME; END IF;
  SELECT role, school_id INTO v_role, v_user_school FROM public.users
   WHERE id = (to_jsonb(NEW) ->> CASE WHEN TG_TABLE_NAME = 'student_subjects' THEN 'student_id' ELSE 'teacher_id' END)::uuid;
  IF v_user_school IS DISTINCT FROM NEW.school_id THEN RAISE EXCEPTION '%: person belongs to another school', TG_TABLE_NAME; END IF;
  IF TG_TABLE_NAME = 'student_subjects' AND v_role <> 'student' THEN RAISE EXCEPTION 'student_subjects: not a student'; END IF;
  IF TG_TABLE_NAME = 'teacher_subjects' AND v_role <> 'teacher' THEN RAISE EXCEPTION 'teacher_subjects: not a teacher'; END IF;
  RETURN NEW;
END
```

</details>

### fn app.guard_superadmin

`app.guard_superadmin()` → `trigger` · plpgsql · security invoker · execute: postgres

- **Touches:** `users` select, `superadmins` select
- **Trigger function on:** `users`

<details><summary>Source</summary>

```sql
BEGIN
  IF NEW.role = 'superadmin' AND (TG_OP = 'INSERT' OR OLD.role IS DISTINCT FROM 'superadmin') THEN
    -- Deliberately not SECURITY DEFINER: current_user is whoever is really asking.
    IF current_user NOT IN ('postgres', 'supabase_admin') THEN
      RAISE EXCEPTION 'Superadmin access is granted only by the database owner' USING ERRCODE = '42501';
    END IF;
    IF EXISTS (SELECT 1 FROM public.users WHERE role = 'superadmin' AND id <> NEW.id)
       OR EXISTS (SELECT 1 FROM public.superadmins WHERE user_id <> NEW.id) THEN
      RAISE EXCEPTION 'There is already a superadmin. Remove that one first, in the same transaction.' USING ERRCODE = '23505';
    END IF;
  END IF;
  RETURN NEW;
END
```

</details>

### fn app.guard_superadmin_list

`app.guard_superadmin_list()` → `trigger` · plpgsql · security invoker · execute: postgres

- **Touches:** `users` select, `superadmins` select
- **Trigger function on:** `superadmins`

<details><summary>Source</summary>

```sql
BEGIN
  IF TG_OP = 'INSERT' OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    IF current_user NOT IN ('postgres', 'supabase_admin') THEN
      RAISE EXCEPTION 'Superadmin access is granted only by the database owner' USING ERRCODE = '42501';
    END IF;
    IF EXISTS (SELECT 1 FROM public.users WHERE role = 'superadmin' AND id <> NEW.user_id)
       OR EXISTS (SELECT 1 FROM public.superadmins WHERE user_id <> NEW.user_id) THEN
      RAISE EXCEPTION 'There is already a superadmin. Remove that one first, in the same transaction.' USING ERRCODE = '23505';
    END IF;
  END IF;
  RETURN NEW;
END
```

</details>

### fn app.guard_wellness_insert

`app.guard_wellness_insert()` → `trigger` · plpgsql · security invoker · execute: authenticated, postgres

- **Calls:** `app.is_server()`
- **Trigger function on:** `wellness_logs`

<details><summary>Source</summary>

```sql
BEGIN
  IF NOT app.is_server() THEN NEW.resolved := false; END IF;
  RETURN NEW;
END
```

</details>

### fn app.guard_wellness_update

`app.guard_wellness_update()` → `trigger` · plpgsql · security invoker · execute: authenticated, postgres

- **Calls:** `app.is_server()`
- **Trigger function on:** `wellness_logs`

<details><summary>Source</summary>

```sql
BEGIN
  IF NOT app.is_server() THEN
    NEW.resolved   := OLD.resolved;
    NEW.student_id := OLD.student_id;
    NEW.school_id  := OLD.school_id;
  END IF;
  RETURN NEW;
END
```

</details>

### fn app.has_perm

`app.has_perm(p text)` → `boolean` · sql · security definer · execute: authenticated, postgres, service_role

- **Calls:** `app.user_has_perm()`
- **Reached from routes:** `/api/staff/ask`, `/api/whatsapp/simulate`, `/api/whatsapp/webhook`
- **Called by SQL:** `admin_teacher_work()`, `app.can_see_thread()`, `school_attendance_summary()`, `school_wellness_aggregates()`, `school_wellness_report()`, `app.sees_learning()`

<details><summary>Source</summary>

```sql
SELECT app.user_has_perm(auth.uid(), p)
```

</details>

### fn app.has_wellness_consent

`app.has_wellness_consent(p_student uuid)` → `boolean` · sql · security definer · execute: authenticated, postgres

- **Touches:** `consents` select

<details><summary>Source</summary>

```sql
SELECT EXISTS (
    SELECT 1 FROM public.consents c
    WHERE c.student_id = p_student AND c.consent_type = 'wellness_checkin'
      AND c.granted AND c.revoked_at IS NULL
  );
```

</details>

### fn app.health_consent

`app.health_consent(p_student uuid)` → `boolean` · sql · security definer · execute: PUBLIC(default)

- **Touches:** `students` select, `consents` select
- **Called by SQL:** `app.guard_health()`, `import_health()`, `import_health_events()`

<details><summary>Source</summary>

```sql
SELECT EXISTS (SELECT 1 FROM public.students s JOIN public.consents c ON c.student_id = s.user_id
                 WHERE s.id = p_student AND c.consent_type = 'health_record' AND c.granted AND c.revoked_at IS NULL)
```

</details>

### fn app.importing

`app.importing()` → `boolean` · sql · security invoker · execute: postgres

- **Called by SQL:** `app.audit()`, `app.audit_exam_marks()`, `app.audit_students()`, `app.on_family_change()`, `app.on_family_code_change()`

<details><summary>Source</summary>

```sql
SELECT coalesce(current_setting('sthara.import_job', true), '') <> ''
```

</details>

### fn app.is_admin

`app.is_admin()` → `boolean` · sql · security definer · execute: authenticated, postgres

- **Touches:** `users` select

<details><summary>Source</summary>

```sql
SELECT COALESCE((SELECT role = 'admin' FROM public.users WHERE id = auth.uid()), false)
```

</details>

### fn app.is_parent_of

`app.is_parent_of(p_student uuid)` → `boolean` · sql · security definer · execute: authenticated, postgres

- **Touches:** `guardians` select
- **Called by SQL:** `app.can_see_thread()`, `parent_wellness_summary()`, `set_consent()`

<details><summary>Source</summary>

```sql
SELECT EXISTS (SELECT 1 FROM public.guardians WHERE parent_id = auth.uid() AND student_id = p_student AND verified)
```

</details>

### fn app.is_server

`app.is_server()` → `boolean` · sql · security invoker · execute: authenticated, postgres, service_role

- **Called by SQL:** `app.guard_notification_update()`, `app.guard_wellness_insert()`, `app.guard_wellness_update()`

<details><summary>Source</summary>

```sql
SELECT coalesce(auth.role(), '') = 'service_role' OR current_user IN ('postgres', 'supabase_admin', 'service_role')
```

</details>

### fn app.is_staff

`app.is_staff()` → `boolean` · sql · security definer · execute: authenticated, postgres

- **Touches:** `users` select

<details><summary>Source</summary>

```sql
SELECT COALESCE((SELECT role IN ('teacher', 'admin') FROM public.users WHERE id = auth.uid()), false)
```

</details>

### fn app.is_superadmin

`app.is_superadmin()` → `boolean` · sql · security definer · execute: authenticated, postgres

- **Touches:** `users` select, `superadmins` select
- **Reached from routes:** `/api/staff/ask`, `/api/whatsapp/simulate`, `/api/whatsapp/webhook`
- **Called by SQL:** `admin_teacher_work()`, `app.can_see_thread()`, `school_attendance_summary()`

<details><summary>Source</summary>

```sql
SELECT COALESCE((SELECT role = 'superadmin' FROM public.users WHERE id = auth.uid()), false)
      OR EXISTS (SELECT 1 FROM public.superadmins WHERE user_id = auth.uid())
```

</details>

### fn app.is_teacher

`app.is_teacher()` → `boolean` · sql · security definer · execute: authenticated, postgres

- **Touches:** `users` select

<details><summary>Source</summary>

```sql
SELECT COALESCE((SELECT role = 'teacher' FROM public.users WHERE id = auth.uid()), false)
```

</details>

### fn app.link_guardian_family

`app.link_guardian_family(p_parent uuid, p_student_user uuid, p_relationship text)` → `void` · plpgsql · security definer · execute: PUBLIC(default)

- **Touches:** `students` select, `users` select, `family_members` select/update/insert
- **Called by SQL:** `app.on_guardian_link()`

<details><summary>Source</summary>

```sql
DECLARE s public.students; p public.users; v_rel text; v_id uuid;
BEGIN
  SELECT * INTO s FROM public.students WHERE user_id = p_student_user;
  SELECT * INTO p FROM public.users WHERE id = p_parent;
  IF s.id IS NULL OR p.id IS NULL THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM public.family_members WHERE student_id = s.id AND user_id = p.id) THEN RETURN; END IF;
  v_rel := CASE WHEN lower(coalesce(p_relationship, '')) IN ('mother', 'father', 'guardian', 'grandparent') THEN lower(p_relationship) ELSE 'guardian' END;
  SELECT id INTO v_id FROM public.family_members
    WHERE student_id = s.id AND user_id IS NULL AND p.email IS NOT NULL AND lower(email) = lower(p.email) LIMIT 1;
  IF v_id IS NOT NULL THEN
    UPDATE public.family_members SET user_id = p.id WHERE id = v_id;
  ELSE
    INSERT INTO public.family_members (school_id, student_id, relation, name, email, user_id, is_primary)
      VALUES (s.school_id, s.id, v_rel, left(coalesce(nullif(trim(p.name), ''), 'Parent'), 120),
              CASE WHEN p.email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN left(p.email, 160) END, p.id,
              NOT EXISTS (SELECT 1 FROM public.family_members WHERE student_id = s.id AND is_primary));
  END IF;
END
```

</details>

### fn app.move_enrolment

`app.move_enrolment(p_student uuid, p_class text, p_from date, p_reason text)` → `uuid` · plpgsql · security definer · execute: postgres

- **Touches:** `students` select, `classes` select, `enrolments` select/update/insert
- **Calls:** `app.session_of()`, `app.norm_class()`, `app.grade_from_class()`, `app.section_from_class()`
- **Reached from routes:** `/api/admin/certificates`, `/api/admin/students`, `/api/admin/students/[id]`, `/api/admin/students/year`
- **Called by SQL:** `app.on_student_login_change()`, `student_move()`, `student_promote()`

<details><summary>Source</summary>

```sql
DECLARE
  s public.students; o public.enrolments; v_id uuid;
  v_session text; v_class_id uuid; v_class text;
BEGIN
  SELECT * INTO s FROM public.students WHERE id = p_student;
  v_session := app.session_of(s.school_id, p_from);
  SELECT c.id, c.name INTO v_class_id, v_class FROM public.classes c
    WHERE c.school_id = s.school_id AND app.norm_class(c.name) = app.norm_class(p_class) ORDER BY c.created_at LIMIT 1;
  v_class := coalesce(v_class, nullif(trim(p_class), ''));
  SELECT * INTO o FROM public.enrolments WHERE student_id = p_student AND ends_on IS NULL;
  IF o.id IS NOT NULL AND app.norm_class(o.class_name) = app.norm_class(v_class) AND o.session = v_session THEN RETURN o.id; END IF;
  IF o.id IS NOT NULL AND (o.starts_on >= p_from OR (o.session = v_session AND o.class_name IS NULL)) THEN
    UPDATE public.enrolments SET class_name = v_class, class_id = v_class_id, grade = app.grade_from_class(v_class),
      section = app.section_from_class(v_class), roll_no = NULL WHERE id = o.id;
    RETURN o.id;
  END IF;
  IF o.id IS NOT NULL THEN
    UPDATE public.enrolments SET ends_on = p_from - 1, end_reason = coalesce(p_reason, 'class_change') WHERE id = o.id;
  END IF;
  INSERT INTO public.enrolments (school_id, student_id, session, grade, section, class_id, class_name, stream, languages, vocational, starts_on)
    VALUES (s.school_id, p_student, v_session, app.grade_from_class(v_class), app.section_from_class(v_class), v_class_id, v_class,
            CASE WHEN o.session = v_session THEN o.stream END, CASE WHEN o.session = v_session THEN o.languages ELSE '{}'::jsonb END,
            CASE WHEN o.session = v_session THEN o.vocational ELSE '{}'::jsonb END, p_from)
    RETURNING id INTO v_id;
  RETURN v_id;
END
```

</details>

### fn app.next_admission_no

`app.next_admission_no(p_school uuid)` → `text` · plpgsql · security definer · execute: postgres

- **Touches:** `schools` select, `doc_counters` insert, `students` select
- **Reached from routes:** `/api/admin/students`
- **Called by SQL:** `app.on_student_login_change()`, `student_next_admission_no()`

<details><summary>Source</summary>

```sql
DECLARE
  v_set jsonb := (SELECT settings -> 'admission' FROM public.schools WHERE id = p_school);
  v_prefix text := left(coalesce(v_set ->> 'prefix', ''), 12);
  v_pad int := least(greatest(coalesce(CASE WHEN (v_set ->> 'pad') ~ '^\d{1,2}$' THEN (v_set ->> 'pad')::int END, 4), 1), 9);
  v_n int; v_no text;
BEGIN
  LOOP
    INSERT INTO public.doc_counters (school_id, kind, session, last_no) VALUES (p_school, 'admission', 'all', 1)
      ON CONFLICT (school_id, kind, session) DO UPDATE SET last_no = doc_counters.last_no + 1
      RETURNING last_no INTO v_n;
    v_no := v_prefix || lpad(v_n::text, v_pad, '0');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.students WHERE school_id = p_school AND lower(admission_no) = lower(v_no));
  END LOOP;
  RETURN v_no;
END
```

</details>

### fn app.next_doc_no

`app.next_doc_no(p_school uuid, p_kind text, p_session text)` → `text` · plpgsql · security definer · execute: postgres

- **Touches:** `doc_counters` insert
- **Reached from routes:** `/api/admin/fees`, `/api/ops/requests`
- **Called by SQL:** `admin_invoice_student()`, `admin_raise_invoices()`, `admin_record_payment()`, `import_fee_invoices()`, `import_fee_payments()`

<details><summary>Source</summary>

```sql
DECLARE n int;
BEGIN
  INSERT INTO public.doc_counters (school_id, kind, session, last_no) VALUES (p_school, p_kind, p_session, 1)
  ON CONFLICT (school_id, kind, session) DO UPDATE SET last_no = doc_counters.last_no + 1
  RETURNING last_no INTO n;
  RETURN (CASE p_kind WHEN 'invoice' THEN 'INV' ELSE 'RCT' END) || '/' || p_session || '/' || lpad(n::text, 5, '0');
END
```

</details>

### fn app.norm_class

`app.norm_class(t text)` → `text` · sql · security invoker · execute: authenticated, postgres, service_role

- **Reached from routes:** `/api/admin/certificates`, `/api/admin/students`, `/api/admin/students/[id]`, `/api/admin/students/year`, `/api/admin/users/assignments`, `/api/ops/overview`, `/api/ops/requests`, `/api/ops/schools/[id]`, `/api/ops/schools/[id]/classes`, `/api/ops/schools/[id]/people`, `/api/ops/schools/[id]/people/[userId]`, `/api/ops/schools/[id]/subjects`
- **Called by SQL:** `app.enrol_core()`, `import_enrolments()`, `app.move_enrolment()`, `app.on_class_rename()`, `app.on_student_class_change()`, `app.on_student_login_change()`, `ops_rename_class_subject()`, `ops_subject_metrics()`, `app.reconcile_student_subjects()`, `app.relabel_timetable_subject()`, `student_promote()`, `student_renumber()`, `app.sync_teacher_assignments()`, `app.teaches_class()`, `app.teaches_student()`

<details><summary>Source</summary>

```sql
SELECT regexp_replace(lower(coalesce(t, '')), 'class|[^a-z0-9]', '', 'g')
```

</details>

### fn app.on_class_rename

`app.on_class_rename()` → `trigger` · plpgsql · security definer · execute: postgres

- **Touches:** `users` select
- **Calls:** `app.norm_class()`, `app.reconcile_student_subjects()`
- **Trigger function on:** `classes`

<details><summary>Source</summary>

```sql
BEGIN
  IF app.norm_class(OLD.name) <> app.norm_class(NEW.name) THEN
    PERFORM app.reconcile_student_subjects(u.id) FROM public.users u
     WHERE u.school_id = NEW.school_id AND u.role = 'student'
       AND app.norm_class(u.student_class) IN (app.norm_class(OLD.name), app.norm_class(NEW.name));
  END IF;
  RETURN NULL;
END
```

</details>

### fn app.on_class_subject_change

`app.on_class_subject_change()` → `trigger` · plpgsql · security definer · execute: postgres

- **Touches:** `student_subjects` update, `teacher_subjects` select
- **Calls:** `app.sync_class_subject_meta()`, `app.enrol_core()`, `app.sync_teacher_assignments()`
- **Trigger function on:** `class_subjects`

<details><summary>Source</summary>

```sql
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM app.sync_class_subject_meta(OLD.class_id);
    RETURN NULL;
  END IF;
  PERFORM app.sync_class_subject_meta(NEW.class_id);
  IF TG_OP = 'INSERT' OR OLD.kind IS DISTINCT FROM NEW.kind THEN
    IF NEW.kind = 'core' THEN
      PERFORM app.enrol_core(NEW.id);
      UPDATE public.student_subjects SET source = 'core' WHERE class_subject_id = NEW.id;
    ELSIF TG_OP = 'UPDATE' THEN
      UPDATE public.student_subjects SET source = 'elective' WHERE class_subject_id = NEW.id;
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.subject_name IS DISTINCT FROM NEW.subject_name THEN
    PERFORM app.sync_teacher_assignments(ts.teacher_id) FROM public.teacher_subjects ts WHERE ts.class_subject_id = NEW.id;
  END IF;
  RETURN NULL;
END
```

</details>

### fn app.on_enrolment_change

`app.on_enrolment_change()` → `trigger` · plpgsql · security definer · execute: PUBLIC(default)

- **Calls:** `app.sync_student_login()`
- **Trigger function on:** `enrolments`

<details><summary>Source</summary>

```sql
BEGIN
  PERFORM app.sync_student_login(coalesce(NEW.student_id, OLD.student_id));
  RETURN NULL;
END
```

</details>

### fn app.on_family_change

`app.on_family_change()` → `trigger` · plpgsql · security definer · execute: PUBLIC(default)

- **Calls:** `app.importing()`, `app.suggest_siblings()`
- **Trigger function on:** `family_members`

<details><summary>Source</summary>

```sql
BEGIN
  IF app.importing() THEN RETURN NULL; END IF;  -- an import suggests once, at the end of each chunk
  PERFORM app.suggest_siblings(NEW.student_id);
  RETURN NULL;
END
```

</details>

### fn app.on_family_code_change

`app.on_family_code_change()` → `trigger` · plpgsql · security definer · execute: PUBLIC(default)

- **Calls:** `app.importing()`, `app.suggest_siblings()`
- **Trigger function on:** `students`

<details><summary>Source</summary>

```sql
BEGIN
  IF app.importing() THEN RETURN NULL; END IF;
  PERFORM app.suggest_siblings(NEW.id);
  RETURN NULL;
END
```

</details>

### fn app.on_guardian_link

`app.on_guardian_link()` → `trigger` · plpgsql · security definer · execute: PUBLIC(default)

- **Calls:** `app.link_guardian_family()`
- **Trigger function on:** `guardians`

<details><summary>Source</summary>

```sql
BEGIN
  PERFORM app.link_guardian_family(NEW.parent_id, NEW.student_id, NEW.relationship);
  RETURN NULL;
END
```

</details>

### fn app.on_health_consent

`app.on_health_consent()` → `trigger` · plpgsql · security definer · execute: PUBLIC(default)

- **Touches:** `students` select
- **Calls:** `app.erase_health()`
- **Trigger function on:** `consents`

<details><summary>Source</summary>

```sql
BEGIN
  IF NEW.consent_type = 'health_record' AND NOT NEW.granted AND (TG_OP = 'INSERT' OR OLD.granted) THEN
    PERFORM app.erase_health(s.id, 'Health consent withdrawn') FROM public.students s WHERE s.user_id = NEW.student_id;
  END IF;
  RETURN NULL;
END
```

</details>

### fn app.on_student_change

`app.on_student_change()` → `trigger` · plpgsql · security definer · execute: PUBLIC(default)

- **Calls:** `app.sync_student_login()`
- **Trigger function on:** `students`

<details><summary>Source</summary>

```sql
BEGIN
  PERFORM app.sync_student_login(NEW.id);
  RETURN NULL;
END
```

</details>

### fn app.on_student_class_change

`app.on_student_class_change()` → `trigger` · plpgsql · security definer · execute: postgres

- **Calls:** `app.norm_class()`, `app.reconcile_student_subjects()`
- **Trigger function on:** `users`

<details><summary>Source</summary>

```sql
BEGIN
  IF TG_OP = 'INSERT' AND NEW.role <> 'student' THEN RETURN NULL; END IF;
  IF TG_OP = 'UPDATE' AND OLD.role IS NOT DISTINCT FROM NEW.role AND OLD.school_id IS NOT DISTINCT FROM NEW.school_id
     AND app.norm_class(OLD.student_class) = app.norm_class(NEW.student_class) THEN
    RETURN NULL;
  END IF;
  PERFORM app.reconcile_student_subjects(NEW.id);
  RETURN NULL;
END
```

</details>

### fn app.on_student_login_change

`app.on_student_login_change()` → `trigger` · plpgsql · security definer · execute: PUBLIC(default)

- **Touches:** `students` select/update/insert, `enrolments` select/update, `student_changes` insert
- **Calls:** `app.school_today()`, `app.next_admission_no()`, `app.admission_floor()`, `app.move_enrolment()`, `app.session_starts()`, `app.current_session()`, `app.sync_student_login()`, `app.norm_class()`
- **Trigger function on:** `users`

<details><summary>Source</summary>

```sql
DECLARE
  s public.students; v_no text; v_left jsonb; v_today date := app.school_today();
  v_kind text := CASE WHEN auth.uid() IS NULL THEN 'system' ELSE 'operator' END;
BEGIN
  IF current_setting('app.student_sync', true) = '1' THEN RETURN NULL; END IF;
  IF NEW.role IS DISTINCT FROM 'student' OR NEW.school_id IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO s FROM public.students WHERE user_id = NEW.id;
  IF s.id IS NOT NULL AND s.school_id <> NEW.school_id THEN
    -- A login moved to another school: the old record stays with the old school, unlinked.
    UPDATE public.students SET user_id = NULL WHERE id = s.id;
    s := NULL;
  END IF;
  IF s.id IS NULL THEN
    -- Link to a register entry with the same number (imported before the login was issued), or start one.
    SELECT * INTO s FROM public.students WHERE school_id = NEW.school_id AND user_id IS NULL
      AND lower(admission_no) = lower(trim(coalesce(NEW.custom_student_id, ''))) AND status <> 'cancelled';
    IF s.id IS NOT NULL THEN
      PERFORM set_config('app.student_sync', '1', true);
      UPDATE public.students SET user_id = NEW.id WHERE id = s.id;
      PERFORM set_config('app.student_sync', '', true);
    ELSE
      v_no := coalesce(nullif(trim(NEW.custom_student_id), ''), app.next_admission_no(NEW.school_id));
      INSERT INTO public.students (school_id, user_id, admission_no, full_name, status, admitted_on, left_on, leaving_reason)
        VALUES (NEW.school_id, NEW.id, v_no, left(coalesce(nullif(trim(NEW.name), ''), 'Student'), 120),
                CASE WHEN NEW.metadata ? 'left' THEN 'left' ELSE 'active' END,
                CASE WHEN TG_OP = 'INSERT' THEN v_today END,
                CASE WHEN NEW.metadata ? 'left' THEN coalesce(nullif(NEW.metadata -> 'left' ->> 'on', '')::date, v_today) END,
                left(NEW.metadata -> 'left' ->> 'reason', 300))
        RETURNING * INTO s;
      PERFORM app.admission_floor(NEW.school_id);
    END IF;
    IF nullif(trim(NEW.student_class), '') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.enrolments WHERE student_id = s.id) THEN
      PERFORM app.move_enrolment(s.id, NEW.student_class,
        CASE WHEN TG_OP = 'INSERT' THEN v_today ELSE app.session_starts(NEW.school_id, app.current_session(NEW.school_id)) END, NULL);
    END IF;
    PERFORM app.sync_student_login(s.id);
    RETURN NULL;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF nullif(trim(NEW.student_class), '') IS NOT NULL AND app.norm_class(NEW.student_class) <> app.norm_class(OLD.student_class) THEN
      PERFORM app.move_enrolment(s.id, NEW.student_class, v_today, 'class_change');
    END IF;
    IF nullif(trim(NEW.custom_student_id), '') IS NOT NULL AND NEW.custom_student_id IS DISTINCT FROM OLD.custom_student_id
       AND lower(trim(NEW.custom_student_id)) <> lower(s.admission_no) THEN
      INSERT INTO public.student_changes (school_id, student_id, field, old_value, new_value, reason, changed_by, changed_by_kind)
        VALUES (s.school_id, s.id, 'admission_no', s.admission_no, trim(NEW.custom_student_id), 'Corrected by Sthara support', auth.uid(), v_kind);
      UPDATE public.students SET admission_no = trim(NEW.custom_student_id) WHERE id = s.id;
    END IF;
    IF nullif(trim(NEW.name), '') IS NOT NULL AND NEW.name IS DISTINCT FROM OLD.name AND trim(NEW.name) <> s.full_name THEN
      INSERT INTO public.student_changes (school_id, student_id, field, old_value, new_value, reason, changed_by, changed_by_kind)
        VALUES (s.school_id, s.id, 'full_name', s.full_name, left(trim(NEW.name), 120), 'Corrected by Sthara support', auth.uid(), v_kind);
      UPDATE public.students SET full_name = left(trim(NEW.name), 120) WHERE id = s.id;
    END IF;
    v_left := NEW.metadata -> 'left';
    IF (v_left IS NOT NULL) <> (OLD.metadata ? 'left') THEN
      IF v_left IS NOT NULL AND s.status = 'active' THEN
        UPDATE public.students SET status = 'left', left_on = coalesce(nullif(v_left ->> 'on', '')::date, v_today),
          leaving_reason = left(v_left ->> 'reason', 300) WHERE id = s.id;
        UPDATE public.enrolments SET ends_on = greatest(starts_on, coalesce(nullif(v_left ->> 'on', '')::date, v_today)), end_reason = 'left'
          WHERE student_id = s.id AND ends_on IS NULL;
      ELSIF v_left IS NULL AND s.status = 'left' THEN
        UPDATE public.students SET status = 'active', left_on = NULL, leaving_reason = NULL WHERE id = s.id;
        IF nullif(trim(NEW.student_class), '') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.enrolments WHERE student_id = s.id AND ends_on IS NULL) THEN
          PERFORM app.move_enrolment(s.id, NEW.student_class, v_today, NULL);
        END IF;
      END IF;
    END IF;
  END IF;
  RETURN NULL;
END
```

</details>

### fn app.on_teacher_subject_change

`app.on_teacher_subject_change()` → `trigger` · plpgsql · security definer · execute: postgres

- **Calls:** `app.sync_teacher_assignments()`
- **Trigger function on:** `teacher_subjects`

<details><summary>Source</summary>

```sql
BEGIN
  PERFORM app.sync_teacher_assignments(CASE WHEN TG_OP = 'DELETE' THEN OLD.teacher_id ELSE NEW.teacher_id END);
  IF TG_OP = 'UPDATE' AND OLD.teacher_id IS DISTINCT FROM NEW.teacher_id THEN PERFORM app.sync_teacher_assignments(OLD.teacher_id); END IF;
  RETURN NULL;
END
```

</details>

### fn app.ops_access_grants_guard

`app.ops_access_grants_guard()` → `trigger` · plpgsql · security invoker · execute: postgres

- **Touches:** `schools` select
- **Trigger function on:** `ops_access_grants`

<details><summary>Source</summary>

```sql
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- Rows go only when their school is deleted (the cascade), never one by one.
    IF EXISTS (SELECT 1 FROM public.schools WHERE id = OLD.school_id) THEN
      RAISE EXCEPTION 'ops_access_grants is append-only';
    END IF;
    RETURN OLD;
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.operator_email IS DISTINCT FROM OLD.operator_email
     OR NEW.operator_role IS DISTINCT FROM OLD.operator_role OR NEW.school_id IS DISTINCT FROM OLD.school_id
     OR NEW.scope IS DISTINCT FROM OLD.scope OR NEW.reason IS DISTINCT FROM OLD.reason
     OR NEW.case_ref IS DISTINCT FROM OLD.case_ref OR NEW.started_at IS DISTINCT FROM OLD.started_at
     OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
     OR (OLD.operator_id IS NOT NULL AND NEW.operator_id IS NOT NULL AND NEW.operator_id <> OLD.operator_id)
     OR (OLD.ended_at IS NOT NULL AND NEW.ended_at IS DISTINCT FROM OLD.ended_at) THEN
    RAISE EXCEPTION 'An access grant cannot be changed, only ended';
  END IF;
  RETURN NEW;
END
```

</details>

### fn app.ops_case_messages_guard

`app.ops_case_messages_guard()` → `trigger` · plpgsql · security invoker · execute: postgres

- **Touches:** `ops_cases` select
- **Trigger function on:** `ops_case_messages`

<details><summary>Source</summary>

```sql
BEGIN
  IF TG_OP = 'UPDATE' THEN RAISE EXCEPTION 'A case message cannot be changed'; END IF;
  IF EXISTS (SELECT 1 FROM public.ops_cases WHERE id = OLD.case_id) THEN RAISE EXCEPTION 'A case message cannot be removed'; END IF;
  RETURN OLD;
END
```

</details>

### fn app.ops_commissions_guard

`app.ops_commissions_guard()` → `trigger` · plpgsql · security invoker · execute: postgres

- **Trigger function on:** `ops_commissions`

<details><summary>Source</summary>

```sql
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status IN ('approved', 'paid') THEN RAISE EXCEPTION 'An approved or paid commission cannot be deleted'; END IF;
    RETURN OLD;
  END IF;
  IF OLD.status = 'paid' AND (NEW.amount IS DISTINCT FROM OLD.amount OR NEW.payee_name IS DISTINCT FROM OLD.payee_name
     OR NEW.status IS DISTINCT FROM OLD.status OR NEW.paid_on IS DISTINCT FROM OLD.paid_on) THEN
    RAISE EXCEPTION 'A paid commission cannot be changed';
  END IF;
  RETURN NEW;
END
```

</details>

### fn app.ops_inspect_links

`app.ops_inspect_links()` → `TABLE(child text, col text, parent text)` · sql · security invoker · execute: postgres

- **Calls:** `app.ops_inspectable()`
- **Reached from routes:** `/api/ops/schools/[id]/inspect`
- **Called by SQL:** `ops_inspect_meta()`, `ops_inspect_row()`

<details><summary>Source</summary>

```sql
SELECT cr.relname::text, a.attname::text, pr.relname::text
    FROM pg_constraint c
    JOIN pg_class cr ON cr.oid = c.conrelid
    JOIN pg_class pr ON pr.oid = c.confrelid
    JOIN pg_namespace n ON n.oid = cr.relnamespace AND n.nspname = 'public'
    JOIN pg_namespace pn ON pn.oid = pr.relnamespace AND pn.nspname = 'public'
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
   WHERE c.contype = 'f' AND array_length(c.conkey, 1) = 1
     AND cr.relname = ANY (app.ops_inspectable()) AND pr.relname = ANY (app.ops_inspectable())
```

</details>

### fn app.ops_inspectable

`app.ops_inspectable()` → `text[]` · sql · security invoker · execute: postgres

- **Reached from routes:** `/api/ops/schools/[id]/inspect`
- **Called by SQL:** `ops_inspect_find()`, `app.ops_inspect_links()`, `ops_inspect_list()`, `ops_inspect_meta()`, `ops_inspect_row()`

<details><summary>Source</summary>

```sql
SELECT ARRAY[
    'users', 'consents', 'role_grants', 'staff_members', 'staff_jobs',
    'classes', 'class_subjects', 'student_subjects', 'teacher_subjects', 'assignments', 'submissions', 'submission_items',
    'tml_scores', 'lesson_plans', 'course_plans', 'syllabus_progress', 'academic_events', 'timetable_slots',
    'attendance', 'attendance_month_reviews', 'staff_punches', 'staff_day_marks', 'leave_requests',
    'fee_structures', 'fee_invoices', 'fee_payments', 'fee_concession_requests', 'fee_reminders', 'fee_day_closes',
    'admission_applicants', 'admission_events', 'account_requests',
    'notifications', 'school_threads', 'school_messages', 'whatsapp_log', 'situations'
  ]::text[]
```

</details>

### fn app.ops_quotes_guard

`app.ops_quotes_guard()` → `trigger` · plpgsql · security invoker · execute: postgres

- **Trigger function on:** `ops_quotes`

<details><summary>Source</summary>

```sql
BEGIN
  IF OLD.status <> 'draft' AND (NEW.plan IS DISTINCT FROM OLD.plan OR NEW.students IS DISTINCT FROM OLD.students
     OR NEW.price_per_student IS DISTINCT FROM OLD.price_per_student OR NEW.list_price IS DISTINCT FROM OLD.list_price
     OR NEW.discount_pct IS DISTINCT FROM OLD.discount_pct OR NEW.term_months IS DISTINCT FROM OLD.term_months) THEN
    RAISE EXCEPTION 'A quote that has left draft cannot be repriced: make a new version';
  END IF;
  RETURN NEW;
END
```

</details>

### fn app.parent_of_student

`app.parent_of_student(p_student uuid)` → `boolean` · sql · security definer · execute: PUBLIC(default)

- **Touches:** `students` select, `guardians` select

<details><summary>Source</summary>

```sql
SELECT EXISTS (SELECT 1 FROM public.students s JOIN public.guardians g ON g.student_id = s.user_id
                 WHERE s.id = p_student AND g.parent_id = auth.uid() AND g.verified)
```

</details>

### fn app.perm_holders

`app.perm_holders(p_school uuid, p text)` → `integer` · sql · security definer · execute: authenticated, postgres, service_role

- **Touches:** `role_grants` select, `role_permissions` select, `users` select
- **Reached from routes:** `/api/admin/fees`
- **Called by SQL:** `admin_decide_concession()`

<details><summary>Source</summary>

```sql
SELECT count(DISTINCT g.user_id)::int
  FROM public.role_grants g
  JOIN public.role_permissions rp ON rp.role_key = g.role_key AND rp.perm = p
  JOIN public.users x ON x.id = g.user_id AND x.school_id = g.school_id AND x.role = 'admin'
  WHERE g.school_id = p_school AND g.revoked_at IS NULL AND (g.expires_on IS NULL OR g.expires_on >= current_date)
```

</details>

### fn app.phone_key

`app.phone_key(t text)` → `text` · sql · security invoker · execute: PUBLIC(default)

- **Called by SQL:** `app.suggest_siblings()`

<details><summary>Source</summary>

```sql
SELECT nullif(right(regexp_replace(coalesce(t, ''), '\D', '', 'g'), 10), '')
```

</details>

### fn app.reconcile_student_subjects

`app.reconcile_student_subjects(p_student uuid)` → `void` · plpgsql · security definer · execute: postgres

- **Touches:** `users` select, `student_subjects` delete/insert/select, `classes` select, `class_subjects` select
- **Calls:** `app.norm_class()`
- **Called by SQL:** `app.on_class_rename()`, `app.on_student_class_change()`

<details><summary>Source</summary>

```sql
DECLARE v_school uuid; v_role text; v_cls text; v_class uuid;
BEGIN
  SELECT school_id, role, student_class INTO v_school, v_role, v_cls FROM public.users WHERE id = p_student;
  IF v_role IS DISTINCT FROM 'student' THEN
    DELETE FROM public.student_subjects WHERE student_id = p_student;
    RETURN;
  END IF;
  SELECT id INTO v_class FROM public.classes WHERE school_id = v_school AND app.norm_class(name) = app.norm_class(v_cls) ORDER BY created_at LIMIT 1;
  INSERT INTO public.student_subjects (school_id, student_id, class_subject_id, source)
  SELECT v_school, p_student, ncs.id, 'elective'
  FROM public.student_subjects ss
  JOIN public.class_subjects ocs ON ocs.id = ss.class_subject_id
  JOIN public.class_subjects ncs ON ncs.class_id = v_class AND ncs.subject_key = ocs.subject_key
  WHERE ss.student_id = p_student AND ss.source = 'elective' AND ocs.class_id IS DISTINCT FROM v_class
  ON CONFLICT (student_id, class_subject_id) DO NOTHING;
  DELETE FROM public.student_subjects ss USING public.class_subjects cs
   WHERE ss.class_subject_id = cs.id AND ss.student_id = p_student AND cs.class_id IS DISTINCT FROM v_class;
  IF v_class IS NOT NULL THEN
    INSERT INTO public.student_subjects (school_id, student_id, class_subject_id, source)
    SELECT v_school, p_student, cs.id, 'core' FROM public.class_subjects cs WHERE cs.class_id = v_class AND cs.kind = 'core'
    ON CONFLICT (student_id, class_subject_id) DO NOTHING;
  END IF;
END
```

</details>

### fn app.relabel_timetable_subject

`app.relabel_timetable_subject(p_school uuid, p_class_key text, p_from text, p_to text)` → `integer` · plpgsql · security definer · execute: postgres

- **Touches:** `timetable_slots` update
- **Calls:** `app.norm_class()`
- **Reached from routes:** `/api/admin/users/assignments`, `/api/ops/requests`, `/api/ops/schools/[id]/classes`, `/api/ops/schools/[id]/people`, `/api/ops/schools/[id]/people/[userId]`, `/api/ops/schools/[id]/subjects`
- **Called by SQL:** `ops_rename_class_subject()`

<details><summary>Source</summary>

```sql
DECLARE n int;
BEGIN
  PERFORM set_config('app.subject_relabel', 'on', true);
  UPDATE public.timetable_slots SET subject = p_to WHERE school_id = p_school AND app.norm_class(class) = p_class_key AND lower(subject) = p_from;
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM set_config('app.subject_relabel', 'off', true);
  RETURN n;
END
```

</details>

### fn app.release_staff_threads

`app.release_staff_threads()` → `trigger` · plpgsql · security definer · execute: postgres

- **Touches:** `school_threads` update
- **Trigger function on:** `users`

<details><summary>Source</summary>

```sql
BEGIN
  UPDATE public.school_threads SET audience = 'office', staff_id = NULL WHERE staff_id = OLD.id;
  RETURN OLD;
END
```

</details>

### fn app.school_today

`app.school_today()` → `date` · sql · security invoker · execute: PUBLIC(default)

- **Reached from routes:** `/api/admin/people`, `/api/admin/students/settings`, `/api/me/employee`
- **Called by SQL:** `app.current_session()`, `health_retention_purge()`, `hr_daily()`, `hr_reassign_reports()`, `app.on_student_login_change()`, `app.staff_members_job()`, `app.sync_staff_job()`

<details><summary>Source</summary>

```sql
SELECT (now() AT TIME ZONE 'Asia/Kolkata')::date
```

</details>

### fn app.section_from_class

`app.section_from_class(t text)` → `text` · sql · security invoker · execute: PUBLIC(default)

- **Reached from routes:** `/api/admin/certificates`, `/api/admin/students`, `/api/admin/students/[id]`, `/api/admin/students/year`
- **Called by SQL:** `app.move_enrolment()`

<details><summary>Source</summary>

```sql
SELECT upper(substring(coalesce(t, '') from '\d\s*[-\s/]?\s*([A-Za-z]{1,3})\s*$'))
```

</details>

### fn app.seed_admission_stages

`app.seed_admission_stages()` → `trigger` · plpgsql · security definer · execute: postgres

- **Calls:** `admission_ensure_stages()`
- **Trigger function on:** `schools`

<details><summary>Source</summary>

```sql
BEGIN PERFORM public.admission_ensure_stages(NEW.id); RETURN NEW; END
```

</details>

### fn app.sees_learning

`app.sees_learning()` → `boolean` · sql · security definer · execute: authenticated, postgres

- **Touches:** `users` select
- **Calls:** `app.has_perm()`

<details><summary>Source</summary>

```sql
SELECT COALESCE((SELECT role = 'teacher' FROM public.users WHERE id = auth.uid()), false)
      OR app.has_perm('academics.read') OR app.has_perm('workforce.read')
```

</details>

### fn app.session_ends

`app.session_ends(p_school uuid, p_session text)` → `date` · sql · security definer · execute: PUBLIC(default)

- **Calls:** `app.session_starts()`
- **Reached from routes:** `/api/admin/students/year`
- **Called by SQL:** `import_enrolments()`, `student_promote()`

<details><summary>Source</summary>

```sql
SELECT (app.session_starts(p_school, p_session) + interval '1 year' - interval '1 day')::date
```

</details>

### fn app.session_of

`app.session_of(p_school uuid, p_day date)` → `text` · sql · security definer · execute: PUBLIC(default)

- **Calls:** `app.session_start_month()`
- **Reached from routes:** `/api/admin/certificates`, `/api/admin/students`, `/api/admin/students/[id]`, `/api/admin/students/settings`, `/api/admin/students/year`
- **Called by SQL:** `app.current_session()`, `app.move_enrolment()`

<details><summary>Source</summary>

```sql
SELECT y::text || '-' || lpad(((y + 1) % 100)::text, 2, '0')
  FROM (SELECT CASE WHEN extract(month FROM p_day) >= app.session_start_month(p_school)
                    THEN extract(year FROM p_day)::int ELSE extract(year FROM p_day)::int - 1 END AS y) t
```

</details>

### fn app.session_start_month

`app.session_start_month(p_school uuid)` → `integer` · sql · security definer · execute: PUBLIC(default)

- **Touches:** `schools` select
- **Reached from routes:** `/api/admin/certificates`, `/api/admin/students`, `/api/admin/students/[id]`, `/api/admin/students/settings`, `/api/admin/students/year`
- **Called by SQL:** `app.session_of()`, `app.session_starts()`

<details><summary>Source</summary>

```sql
SELECT coalesce(CASE WHEN (s.settings -> 'session' ->> 'startMonth') ~ '^(1[0-2]|[1-9])$'
                       THEN (s.settings -> 'session' ->> 'startMonth')::int END, 4)
  FROM public.schools s WHERE s.id = p_school
```

</details>

### fn app.session_starts

`app.session_starts(p_school uuid, p_session text)` → `date` · sql · security definer · execute: PUBLIC(default)

- **Calls:** `app.session_start_month()`
- **Reached from routes:** `/api/admin/students/year`
- **Called by SQL:** `import_enrolments()`, `app.on_student_login_change()`, `app.session_ends()`, `student_promote()`

<details><summary>Source</summary>

```sql
SELECT make_date(left(p_session, 4)::int, app.session_start_month(p_school), 1)
```

</details>

### fn app.settings_changes_immutable

`app.settings_changes_immutable()` → `trigger` · plpgsql · security invoker · execute: PUBLIC(default)

- **Trigger function on:** `settings_changes`

<details><summary>Source</summary>

```sql
BEGIN
  RAISE EXCEPTION 'settings_changes is append-only';
END
```

</details>

### fn app.staff_jobs_sync

`app.staff_jobs_sync()` → `trigger` · plpgsql · security definer · execute: PUBLIC(default)

- **Calls:** `app.sync_staff_job()`
- **Trigger function on:** `staff_jobs`

<details><summary>Source</summary>

```sql
BEGIN
  PERFORM app.sync_staff_job(coalesce(NEW.staff_member_id, OLD.staff_member_id));
  RETURN NULL;
END
```

</details>

### fn app.staff_members_job

`app.staff_members_job()` → `trigger` · plpgsql · security definer · execute: PUBLIC(default)

- **Touches:** `staff_jobs` insert
- **Calls:** `app.school_today()`
- **Trigger function on:** `staff_members`

<details><summary>Source</summary>

```sql
BEGIN
  IF current_setting('app.job_sync', true) = '1' THEN RETURN NULL; END IF;
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.staff_jobs (school_id, staff_member_id, effective_from, action, designation, category, department_id,
      grade_id, manager_id, employment, contract_from, contract_to, created_by)
    VALUES (NEW.school_id, NEW.id, least(coalesce(NEW.joined_on, NEW.contract_from, app.school_today()), app.school_today()), 'hire',
      NEW.designation, NEW.category, NEW.department_id, NEW.grade_id, NEW.manager_id, NEW.employment, NEW.contract_from, NEW.contract_to, NEW.created_by)
    ON CONFLICT (staff_member_id, effective_from) DO NOTHING;
  ELSIF (NEW.designation, NEW.category, NEW.department_id, NEW.grade_id, NEW.manager_id, NEW.employment, NEW.contract_from, NEW.contract_to)
        IS DISTINCT FROM
        (OLD.designation, OLD.category, OLD.department_id, OLD.grade_id, OLD.manager_id, OLD.employment, OLD.contract_from, OLD.contract_to) THEN
    INSERT INTO public.staff_jobs (school_id, staff_member_id, effective_from, action, designation, category, department_id,
      grade_id, manager_id, employment, contract_from, contract_to, reason, created_by)
    VALUES (NEW.school_id, NEW.id, app.school_today(), 'correction', NEW.designation, NEW.category, NEW.department_id,
      NEW.grade_id, NEW.manager_id, NEW.employment, NEW.contract_from, NEW.contract_to, 'Edited in the staff register', auth.uid())
    ON CONFLICT (staff_member_id, effective_from) DO UPDATE
      SET designation = EXCLUDED.designation, category = EXCLUDED.category, department_id = EXCLUDED.department_id,
          grade_id = EXCLUDED.grade_id, manager_id = EXCLUDED.manager_id, employment = EXCLUDED.employment,
          contract_from = EXCLUDED.contract_from, contract_to = EXCLUDED.contract_to;
  END IF;
  RETURN NULL;
END
```

</details>

### fn app.strip_answer_key

`app.strip_answer_key(qs jsonb)` → `jsonb` · sql · security invoker · execute: authenticated, postgres


<details><summary>Source</summary>

```sql
SELECT CASE WHEN jsonb_typeof(qs) <> 'array' THEN '[]'::jsonb
    ELSE COALESCE((
      SELECT jsonb_agg(CASE WHEN jsonb_typeof(q) = 'object' THEN q - 'answer' - 'correctAnswerIndex' - 'why' ELSE q END ORDER BY ord)
      FROM jsonb_array_elements(qs) WITH ORDINALITY AS t(q, ord)), '[]'::jsonb)
  END
```

</details>

### fn app.suggest_siblings

`app.suggest_siblings(p_student uuid)` → `integer` · plpgsql · security definer · execute: PUBLIC(default)

- **Touches:** `students` select, `family_members` select, `sibling_links` insert
- **Calls:** `app.phone_key()`
- **Called by SQL:** `import_family()`, `app.on_family_change()`, `app.on_family_code_change()`

<details><summary>Source</summary>

```sql
DECLARE v_n int;
BEGIN
  WITH me AS (SELECT id, school_id, family_code FROM public.students WHERE id = p_student AND status <> 'cancelled'),
  hits AS (
    SELECT o.student_id AS other, 'phone' AS source FROM me
      JOIN public.family_members f ON f.student_id = me.id AND f.phone IS NOT NULL AND f.relation <> 'sibling'
      JOIN public.family_members o ON o.school_id = me.school_id AND app.phone_key(o.phone) = app.phone_key(f.phone) AND o.student_id <> me.id AND o.relation <> 'sibling'
    UNION
    SELECT o.student_id, 'login' FROM me
      JOIN public.family_members f ON f.student_id = me.id AND f.user_id IS NOT NULL
      JOIN public.family_members o ON o.user_id = f.user_id AND o.student_id <> me.id
    UNION
    SELECT s.id, 'family_code' FROM me JOIN public.students s ON s.school_id = me.school_id AND me.family_code IS NOT NULL
      AND lower(s.family_code) = lower(me.family_code) AND s.id <> me.id AND s.status <> 'cancelled'),
  best AS (SELECT DISTINCT ON (other) other, source FROM hits ORDER BY other, CASE source WHEN 'login' THEN 1 WHEN 'family_code' THEN 2 ELSE 3 END)
  INSERT INTO public.sibling_links (school_id, a, b, source)
    SELECT me.school_id, least(me.id, best.other), greatest(me.id, best.other), best.source FROM me, best
    ON CONFLICT (a, b) DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END
```

</details>

### fn app.sync_class_subject_meta

`app.sync_class_subject_meta(p_class uuid)` → `void` · sql · security definer · execute: postgres

- **Touches:** `class_subjects` select, `classes` update
- **Called by SQL:** `app.on_class_subject_change()`

<details><summary>Source</summary>

```sql
WITH cur AS (
    SELECT coalesce((SELECT jsonb_agg(cs.subject_name ORDER BY (cs.kind <> 'core'), cs.subject_name)
                     FROM public.class_subjects cs WHERE cs.class_id = p_class), '[]'::jsonb) AS linked
  )
  UPDATE public.classes c SET metadata = coalesce(c.metadata, '{}'::jsonb) || jsonb_build_object(
    'subjects', cur.linked || coalesce((
      SELECT jsonb_agg(e) FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(c.metadata -> 'subjects') = 'array' THEN c.metadata -> 'subjects' ELSE '[]'::jsonb END) e
      WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements_text(cur.linked) l WHERE lower(l) = lower(trim(e)))
        AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(c.metadata -> 'linkedSubjects') = 'array' THEN c.metadata -> 'linkedSubjects' ELSE '[]'::jsonb END) p
                        WHERE lower(p) = lower(trim(e)))), '[]'::jsonb),
    'linkedSubjects', cur.linked)
  FROM cur
  WHERE c.id = p_class;
```

</details>

### fn app.sync_staff_job

`app.sync_staff_job(p_member uuid)` → `boolean` · plpgsql · security definer · execute: PUBLIC(default)

- **Touches:** `staff_jobs` select, `staff_members` update
- **Calls:** `app.school_today()`
- **Reached from routes:** `/api/admin/people`, `/api/me/employee`
- **Called by SQL:** `hr_sync_jobs()`, `app.staff_jobs_sync()`

<details><summary>Source</summary>

```sql
DECLARE j public.staff_jobs; n int;
BEGIN
  SELECT * INTO j FROM public.staff_jobs
  WHERE staff_member_id = p_member AND effective_from <= app.school_today()
  ORDER BY effective_from DESC LIMIT 1;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM set_config('app.job_sync', '1', true);
  UPDATE public.staff_members m
  SET designation = j.designation, category = j.category, department_id = j.department_id, grade_id = j.grade_id,
      manager_id = j.manager_id, employment = j.employment, contract_from = j.contract_from, contract_to = j.contract_to,
      updated_at = now()
  WHERE m.id = p_member
    AND (m.designation, m.category, m.department_id, m.grade_id, m.manager_id, m.employment, m.contract_from, m.contract_to)
        IS DISTINCT FROM
        (j.designation, j.category, j.department_id, j.grade_id, j.manager_id, j.employment, j.contract_from, j.contract_to);
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM set_config('app.job_sync', '', true);
  RETURN n > 0;
END
```

</details>

### fn app.sync_student_login

`app.sync_student_login(p_student uuid)` → `void` · plpgsql · security definer · execute: postgres

- **Touches:** `students` select, `enrolments` select, `users` update
- **Calls:** `app.current_session()`
- **Reached from routes:** `/api/admin/students/settings`
- **Called by SQL:** `app.on_enrolment_change()`, `app.on_student_change()`, `app.on_student_login_change()`, `student_sync_school()`

<details><summary>Source</summary>

```sql
DECLARE s public.students; v_class text;
BEGIN
  SELECT * INTO s FROM public.students WHERE id = p_student;
  IF s.user_id IS NULL THEN RETURN; END IF;
  SELECT e.class_name INTO v_class FROM public.enrolments e
    WHERE e.student_id = s.id AND e.session <= app.current_session(s.school_id)
    ORDER BY e.session DESC, e.starts_on DESC, e.created_at DESC LIMIT 1;
  PERFORM set_config('app.student_sync', '1', true);
  UPDATE public.users u SET student_class = coalesce(v_class, u.student_class), custom_student_id = s.admission_no
    WHERE u.id = s.user_id AND (u.student_class IS DISTINCT FROM coalesce(v_class, u.student_class) OR u.custom_student_id IS DISTINCT FROM s.admission_no);
  PERFORM set_config('app.student_sync', '', true);
END
```

</details>

### fn app.sync_teacher_assignments

`app.sync_teacher_assignments(p_teacher uuid)` → `void` · sql · security definer · execute: postgres

- **Touches:** `teacher_subjects` select, `class_subjects` select, `classes` select, `users` select/update
- **Calls:** `app.norm_class()`
- **Reached from routes:** `/api/admin/users/assignments`, `/api/ops/requests`, `/api/ops/schools/[id]/people`, `/api/ops/schools/[id]/people/[userId]`, `/api/ops/schools/[id]/subjects`
- **Called by SQL:** `app.on_class_subject_change()`, `app.on_teacher_subject_change()`, `ops_resync_teacher()`

<details><summary>Source</summary>

```sql
WITH linked AS (
    SELECT c.id AS class_id, c.name AS class_name, cs.subject_name
    FROM public.teacher_subjects ts
    JOIN public.class_subjects cs ON cs.id = ts.class_subject_id
    JOIN public.classes c ON c.id = cs.class_id
    WHERE ts.teacher_id = p_teacher
  ),
  legacy AS (
    SELECT e FROM public.users u,
      jsonb_array_elements(CASE WHEN jsonb_typeof(u.assignments) = 'array' THEN u.assignments ELSE '[]'::jsonb END) e
    WHERE u.id = p_teacher
      AND (e ->> 'linked') IS NULL
      AND NOT EXISTS (SELECT 1 FROM linked lk
                      WHERE app.norm_class(lk.class_name) = app.norm_class(e ->> 'class')
                        AND lower(lk.subject_name) = lower(trim(e ->> 'subject')))
  ),
  merged AS (
    SELECT class_id, class_name, subject_name, true AS is_linked FROM linked
    UNION
    SELECT (SELECT c.id FROM public.classes c JOIN public.users u ON u.id = p_teacher
             WHERE c.school_id = u.school_id AND app.norm_class(c.name) = app.norm_class(l.e ->> 'class') LIMIT 1),
           l.e ->> 'class', trim(l.e ->> 'subject'), false
    FROM legacy l WHERE coalesce(trim(l.e ->> 'subject'), '') <> ''
  )
  UPDATE public.users u SET
    assignments       = coalesce((SELECT jsonb_agg(jsonb_build_object('class', class_name, 'subject', subject_name)
                                   || CASE WHEN is_linked THEN '{"linked": true}'::jsonb ELSE '{}'::jsonb END ORDER BY class_name, subject_name) FROM merged), '[]'::jsonb),
    teaching_subjects = coalesce((SELECT jsonb_agg(jsonb_build_object('classId', class_id, 'className', class_name, 'subjectName', subject_name)
                                   || CASE WHEN is_linked THEN '{"linked": true}'::jsonb ELSE '{}'::jsonb END ORDER BY class_name, subject_name) FROM merged), '[]'::jsonb),
    teacher_subject   = (SELECT subject_name FROM merged ORDER BY class_name, subject_name LIMIT 1)
  WHERE u.id = p_teacher AND u.role = 'teacher';
```

</details>

### fn app.teaches_class

`app.teaches_class(p_class text)` → `boolean` · sql · security definer · execute: authenticated, postgres

- **Touches:** `users` select
- **Calls:** `app.norm_class()`

<details><summary>Source</summary>

```sql
SELECT app.norm_class(p_class) <> '' AND EXISTS (
    SELECT 1 FROM public.users t
    WHERE t.id = auth.uid() AND t.role = 'teacher'
      AND (app.norm_class(t.teacher_class) = app.norm_class(p_class)
           OR (json_typeof(t.assignments::json) = 'array' AND EXISTS (
                 SELECT 1 FROM json_array_elements(t.assignments::json) e
                 WHERE app.norm_class(e->>'class') = app.norm_class(p_class))))
  )
```

</details>

### fn app.teaches_student

`app.teaches_student(p_student uuid)` → `boolean` · sql · security definer · execute: authenticated, postgres

- **Touches:** `users` select
- **Calls:** `app.norm_class()`
- **Called by SQL:** `teacher_wellness_feed()`

<details><summary>Source</summary>

```sql
SELECT EXISTS (
    SELECT 1
    FROM public.users t
    JOIN public.users s ON s.id = p_student AND s.school_id = t.school_id AND s.role = 'student'
    WHERE t.id = auth.uid() AND t.role = 'teacher'
      AND app.norm_class(s.student_class) <> ''
      AND (
        app.norm_class(t.teacher_class) = app.norm_class(s.student_class)
        OR (json_typeof(t.assignments::json) = 'array' AND EXISTS (
              SELECT 1 FROM json_array_elements(t.assignments::json) e
              WHERE app.norm_class(e->>'class') = app.norm_class(s.student_class)))
      )
  )
```

</details>

### fn app.touch_updated_at

`app.touch_updated_at()` → `trigger` · plpgsql · security invoker · execute: authenticated, postgres

- **Trigger function on:** `admission_applicants`, `admission_documents`, `admission_offers`, `admission_seats`, `admission_stages`, `assignments`, `attendance`, `cc_groups`, `cc_memberships`, `certificate_settings`, `certificate_types`, `certificates`, `consents`, `counselling_cases`, `counselling_referrals`, `counselling_sessions`, `course_plans`, `discipline_actions`, `emergency_contacts`, `enquiries`, `enrolments`, `exam_assessments`, `exam_class_terms`, `exam_schemes`, `exam_sheets`, `exam_student_terms`, `exam_terms`, `family_members`, `fee_invoices`, `fee_structures`, `health_events`, `house_members`, `house_points`, `houses`, `hr_departments`, `hr_grades`, `hr_posts`, `hr_settings`, `import_jobs`, `incidents`, `kirti_entries`, `leave_policies`, `leave_requests`, `legacy_results`, `lesson_plans`, `pay_items`, `payroll_settings`, `report_card_settings`, `salary_templates`, `school_filings`, `schools`, `sibling_links`, `situations`, `staff_pay_settings`, `staff_profiles`, `staff_statutory`, `student_change_requests`, `student_documents`, `student_health`, `students`, `submissions`, `syllabus_progress`, `users`

<details><summary>Source</summary>

```sql
BEGIN NEW.updated_at := now(); RETURN NEW; END
```

</details>

### fn app.user_cp_reader

`app.user_cp_reader(u uuid)` → `boolean` · sql · security definer · execute: authenticated, postgres, service_role

- **Touches:** `role_grants` select, `users` select
- **Calls:** `app.user_has_perm()`
- **Called by SQL:** `app.cp_reader()`

<details><summary>Source</summary>

```sql
SELECT app.user_has_perm(u, 'safeguarding.cases') OR EXISTS (
    SELECT 1 FROM public.role_grants g JOIN public.users x ON x.id = g.user_id AND x.school_id = g.school_id AND x.role = 'admin'
    WHERE g.user_id = u AND g.role_key = 'principal' AND g.revoked_at IS NULL AND (g.expires_on IS NULL OR g.expires_on >= current_date)
      AND NOT EXISTS (
        SELECT 1 FROM public.role_grants d JOIN public.users y ON y.id = d.user_id AND y.school_id = d.school_id AND y.role = 'admin'
        WHERE d.school_id = g.school_id AND d.role_key = 'safeguarding_lead' AND d.revoked_at IS NULL
          AND (d.expires_on IS NULL OR d.expires_on >= current_date)))
```

</details>

### fn app.user_has_perm

`app.user_has_perm(u uuid, p text)` → `boolean` · sql · security definer · execute: authenticated, postgres, service_role

- **Touches:** `users` select, `superadmins` select, `role_grants` select, `role_permissions` select
- **Reached from routes:** `/api/admin/fees`, `/api/staff/ask`, `/api/whatsapp/simulate`, `/api/whatsapp/webhook`
- **Called by SQL:** `admin_close_day()`, `admin_decide_concession()`, `app.has_perm()`, `app.user_cp_reader()`

<details><summary>Source</summary>

```sql
SELECT EXISTS (
    SELECT 1 FROM public.users x
    WHERE x.id = u AND (x.role = 'superadmin' OR EXISTS (SELECT 1 FROM public.superadmins s WHERE s.user_id = u))
  ) OR EXISTS (
    SELECT 1
    FROM public.role_grants g
    JOIN public.role_permissions rp ON rp.role_key = g.role_key AND rp.perm = p
    JOIN public.users x ON x.id = g.user_id AND x.school_id = g.school_id AND x.role = 'admin'
    WHERE g.user_id = u AND g.revoked_at IS NULL AND (g.expires_on IS NULL OR g.expires_on >= current_date)
  )
```

</details>

### fn app.user_role

`app.user_role()` → `text` · sql · security definer · execute: authenticated, postgres

- **Touches:** `users` select
- **Called by SQL:** `app.audit()`, `app.audit_exam_marks()`, `app.audit_fields_only()`, `app.audit_students()`, `app.audit_touch_only()`

<details><summary>Source</summary>

```sql
SELECT role FROM public.users WHERE id = auth.uid()
```

</details>

### fn app.users_on_register

`app.users_on_register()` → `trigger` · plpgsql · security definer · execute: PUBLIC(default)

- **Touches:** `staff_members` select/insert
- **Trigger function on:** `users`

<details><summary>Source</summary>

```sql
BEGIN
  IF NEW.role IN ('teacher', 'admin') AND NEW.school_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.staff_members WHERE school_id = NEW.school_id AND user_id = NEW.id) THEN
    INSERT INTO public.staff_members (school_id, user_id, name, category, designation)
    VALUES (NEW.school_id, NEW.id, left(coalesce(nullif(trim(NEW.name), ''), 'Staff'), 120),
            CASE WHEN NEW.role = 'teacher' THEN 'teaching' ELSE 'office' END,
            CASE WHEN NEW.role = 'teacher' THEN 'Teacher' ELSE 'Office' END);
  END IF;
  RETURN NULL;
END
```

</details>

### fn certificate_issue

`certificate_issue(p_cert uuid, p_school uuid, p_actor uuid, p_data jsonb, p_issued_on date, p_dues numeric, p_override text)` → `certificates` · plpgsql · security definer · execute: postgres, service_role

- **Touches:** `certificates` select/update, `certificate_types` select, `doc_counters` insert
- **Reached from routes:** `/api/admin/certificates`

<details><summary>Source</summary>

```sql
DECLARE c public.certificates; t public.certificate_types; o public.certificates; n int;
BEGIN
  SELECT * INTO c FROM public.certificates WHERE id = p_cert AND school_id = p_school FOR UPDATE;
  IF c.id IS NULL THEN RAISE EXCEPTION 'certificate not found' USING ERRCODE = 'P0002'; END IF;
  IF c.status NOT IN ('draft', 'pending') THEN RAISE EXCEPTION 'this certificate has already been issued' USING ERRCODE = '55000'; END IF;
  SELECT * INTO t FROM public.certificate_types WHERE id = c.type_id;
  IF c.duplicate_of IS NOT NULL THEN
    SELECT * INTO o FROM public.certificates WHERE id = c.duplicate_of;
    c.serial := o.serial; c.number := o.number;
  ELSE
    INSERT INTO public.doc_counters (school_id, kind, session, last_no) VALUES (p_school, 'cert:' || c.type_id::text, 'all', 1)
      ON CONFLICT (school_id, kind, session) DO UPDATE SET last_no = doc_counters.last_no + 1
      RETURNING last_no INTO n;
    c.serial := n; c.number := t.prefix || '/' || lpad(n::text, 4, '0');
  END IF;
  UPDATE public.certificates SET status = 'issued', serial = c.serial, number = c.number, data = p_data, issued_on = p_issued_on,
      dues = p_dues, dues_override = p_override, approved_by = p_actor, approved_at = now(), returned_note = NULL
    WHERE id = c.id RETURNING * INTO c;
  RETURN c;
END
```

</details>

### fn exam_attendance

`exam_attendance(p_school uuid, p_from date, p_to date)` → `TABLE(student_id uuid, class_name text, present bigint, late bigint, absent bigint, excused bigint, class_days bigint)` · sql · security invoker · execute: postgres, service_role

- **Touches:** `attendance` select
- **Reached from routes:** `/api/admin/exams`, `/api/teacher/exams`

<details><summary>Source</summary>

```sql
WITH a AS (
    SELECT student_id, class_name, day, status FROM public.attendance
    WHERE school_id = p_school AND day BETWEEN p_from AND p_to
  ), days AS (
    SELECT regexp_replace(lower(class_name), 'class|[^a-z0-9]', '', 'g') AS k, count(DISTINCT day) AS n FROM a GROUP BY 1
  )
  SELECT a.student_id, max(a.class_name),
         count(*) FILTER (WHERE status = 'present'), count(*) FILTER (WHERE status = 'late'),
         count(*) FILTER (WHERE status = 'absent'), count(*) FILTER (WHERE status = 'excused'),
         max(d.n)
  FROM a JOIN days d ON d.k = regexp_replace(lower(a.class_name), 'class|[^a-z0-9]', '', 'g')
  GROUP BY a.student_id
```

</details>

### fn exam_fee_dues

`exam_fee_dues(p_school uuid, p_today date)` → `TABLE(student_id uuid, overdue numeric)` · sql · security invoker · execute: postgres, service_role

- **Touches:** `fee_invoices` select, `fee_payments` select
- **Reached from routes:** `/api/admin/exams`

<details><summary>Source</summary>

```sql
SELECT i.student_id, sum(i.amount - coalesce(i.concession, 0) - coalesce(p.paid, 0))
  FROM public.fee_invoices i
  LEFT JOIN (SELECT invoice_id, sum(amount) AS paid FROM public.fee_payments WHERE school_id = p_school AND voided_at IS NULL GROUP BY invoice_id) p ON p.invoice_id = i.id
  WHERE i.school_id = p_school AND i.voided_at IS NULL AND i.due_on <= p_today
  GROUP BY i.student_id
  HAVING sum(i.amount - coalesce(i.concession, 0) - coalesce(p.paid, 0)) > 0
```

</details>

### fn health_consented

`health_consented(p_school uuid, p_students uuid[])` → `SETOF uuid` · sql · security definer · execute: postgres, service_role

- **Touches:** `students` select, `consents` select
- **Reached from routes:** `/api/admin/health`, `/api/admin/students/[id]/health`, `/api/admin/students/requests`, `/api/parent/family`, `/api/parent/health`

<details><summary>Source</summary>

```sql
SELECT s.id FROM public.students s JOIN public.consents c ON c.student_id = s.user_id
  WHERE s.school_id = p_school AND s.id = ANY (p_students) AND c.consent_type = 'health_record' AND c.granted AND c.revoked_at IS NULL
```

</details>

### fn health_retention_purge

`health_retention_purge()` → `integer` · plpgsql · security definer · execute: postgres, service_role

- **Touches:** `students` select, `student_health` select, `schools` select, `health_events` select
- **Calls:** `app.school_today()`, `app.erase_health()`
- **pg_cron:** `health-retention`

<details><summary>Source</summary>

```sql
DECLARE r record; v_n int := 0;
BEGIN
  FOR r IN SELECT s.id FROM public.students s JOIN public.student_health h ON h.student_id = s.id JOIN public.schools sc ON sc.id = s.school_id
           WHERE s.status = 'left' AND s.left_on IS NOT NULL AND NOT h.keep_after_leaving AND NOT h.legal_hold
             AND s.left_on + coalesce(CASE WHEN (sc.settings -> 'health' ->> 'retentionDays') ~ '^\d{1,5}$' THEN (sc.settings -> 'health' ->> 'retentionDays')::int END, 365) < app.school_today()
             AND (h.allergies <> '[]'::jsonb OR h.conditions <> '[]'::jsonb OR h.medication <> '[]'::jsonb
                  OR EXISTS (SELECT 1 FROM public.health_events e WHERE e.student_id = s.id)) LOOP
    PERFORM app.erase_health(r.id, 'Retention period after leaving');
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END
```

</details>

### fn hr_daily

`hr_daily()` → `jsonb` · plpgsql · security definer · execute: postgres, service_role

- **Touches:** `schools` select, `hr_settings` select, `staff_members` select, `role_grants` select, `role_permissions` select, `users` select, `staff_exits` select, `staff_documents` select, `notifications` insert
- **Calls:** `app.school_today()`, `hr_sync_jobs()`
- **pg_cron:** `hr-daily`

<details><summary>Source</summary>

```sql
DECLARE s record; a record; today date := app.school_today(); synced int := 0; sent int := 0; holders uuid[];
BEGIN
  FOR s IN SELECT sc.id, coalesce(h.alert_days, 30) AS alert_days FROM public.schools sc LEFT JOIN public.hr_settings h ON h.school_id = sc.id
           WHERE EXISTS (SELECT 1 FROM public.staff_members m WHERE m.school_id = sc.id) LOOP
    synced := synced + public.hr_sync_jobs(s.id);

    SELECT coalesce(array_agg(DISTINCT g.user_id), '{}') INTO holders
    FROM public.role_grants g
    JOIN public.role_permissions rp ON rp.role_key = g.role_key AND rp.perm = 'hr.manage'
    JOIN public.users x ON x.id = g.user_id AND x.school_id = g.school_id AND x.role = 'admin'
    WHERE g.school_id = s.id AND g.revoked_at IS NULL AND (g.expires_on IS NULL OR g.expires_on >= today);
    CONTINUE WHEN cardinality(holders) = 0;

    FOR a IN
      SELECT m.id, m.name || '''s probation ends' AS what, m.probation_until AS due, 'Confirm them or extend the probation.' AS body
      FROM public.staff_members m
      WHERE m.school_id = s.id AND m.active AND m.employment = 'permanent' AND m.probation_until IS NOT NULL AND m.confirmed_on IS NULL
      UNION ALL
      SELECT m.id, m.name || '''s contract ends', m.contract_to, 'Renew it or record the end of contract.'
      FROM public.staff_members m
      WHERE m.school_id = s.id AND m.active AND m.employment <> 'permanent' AND m.contract_to IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM public.staff_exits x WHERE x.staff_member_id = m.id AND x.status = 'notice')
      UNION ALL
      SELECT m.id, m.name || '''s last working day is', x.last_day, 'Finish the exit checklist and close the exit on the day.'
      FROM public.staff_exits x JOIN public.staff_members m ON m.id = x.staff_member_id
      WHERE x.school_id = s.id AND x.status = 'notice'
      UNION ALL
      SELECT m.id, m.name || '''s ' || lower(d.title) || ' expires', d.expires_on, 'Get the renewed document and add it to their record.'
      FROM public.staff_documents d JOIN public.staff_members m ON m.id = d.staff_member_id
      WHERE d.school_id = s.id AND m.active AND d.expires_on IS NOT NULL
    LOOP
      CONTINUE WHEN a.due - today NOT IN (0, 7, s.alert_days);
      INSERT INTO public.notifications (school_id, user_id, type, title, body, metadata)
      SELECT s.id, h, 'hr',
             a.what || CASE a.due - today WHEN 0 THEN ' today' WHEN 1 THEN ' tomorrow' ELSE ' in ' || (a.due - today) || ' days' END,
             a.body || ' Open People > Needs attention.',
             jsonb_build_object('staffMemberId', a.id, 'due', a.due)
      FROM unnest(holders) AS h;
      sent := sent + 1;
    END LOOP;
  END LOOP;
  RETURN jsonb_build_object('synced', synced, 'alerts', sent);
END
```

</details>

### fn hr_link_login

`hr_link_login(p_school uuid, p_member uuid, p_user uuid)` → `void` · plpgsql · security definer · execute: postgres, service_role

- **Touches:** `staff_members` select/delete/update, `users` select, `staff_jobs` select, `staff_profiles` select, `staff_statutory` select, `staff_documents` select, `staff_qualifications` select, `staff_exits` select, `staff_events` select, `hr_departments` select, `leave_requests` update, `cover_assignments` update, `sched_requirements` update, `timetable_slots` update
- **Reached from routes:** `/api/admin/people`

<details><summary>Source</summary>

```sql
DECLARE m public.staff_members; u record; bare uuid; t text;
BEGIN
  SELECT * INTO m FROM public.staff_members WHERE id = p_member AND school_id = p_school FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'hr_link: no such employee' USING ERRCODE = 'P0001'; END IF;
  IF m.user_id IS NOT NULL THEN RAISE EXCEPTION 'hr_link: already has a login' USING ERRCODE = 'P0001'; END IF;
  SELECT id, name, role INTO u FROM public.users WHERE id = p_user AND school_id = p_school AND role IN ('teacher', 'admin');
  IF NOT FOUND THEN RAISE EXCEPTION 'hr_link: no such login' USING ERRCODE = 'P0001'; END IF;

  -- The login's own register row was made automatically. It can go only if nothing was ever recorded on it.
  SELECT id INTO bare FROM public.staff_members WHERE school_id = p_school AND user_id = p_user;
  IF bare IS NOT NULL THEN
    IF (SELECT count(*) FROM public.staff_jobs WHERE staff_member_id = bare) > 1
       OR EXISTS (SELECT 1 FROM public.staff_profiles WHERE staff_member_id = bare)
       OR EXISTS (SELECT 1 FROM public.staff_statutory WHERE staff_member_id = bare)
       OR EXISTS (SELECT 1 FROM public.staff_documents WHERE staff_member_id = bare)
       OR EXISTS (SELECT 1 FROM public.staff_qualifications WHERE staff_member_id = bare)
       OR EXISTS (SELECT 1 FROM public.staff_exits WHERE staff_member_id = bare)
       OR EXISTS (SELECT 1 FROM public.staff_events WHERE staff_member_id = bare)
       OR EXISTS (SELECT 1 FROM public.staff_members WHERE manager_id = bare)
       OR EXISTS (SELECT 1 FROM public.hr_departments WHERE head_id = bare)
       OR EXISTS (SELECT 1 FROM public.staff_members WHERE id = bare AND (employee_code IS NOT NULL OR department_id IS NOT NULL OR grade_id IS NOT NULL)) THEN
      RAISE EXCEPTION 'hr_link: the login already has its own record' USING ERRCODE = 'P0001';
    END IF;
    DELETE FROM public.staff_members WHERE id = bare;
  END IF;

  -- Everything recorded against the register row now belongs to the login. A table that names a person holds
  -- either user_id or staff_member_id, never both, so each row flips from one to the other.
  FOR t IN
    SELECT c.table_name FROM information_schema.columns c
    JOIN information_schema.tables tb ON tb.table_schema = c.table_schema AND tb.table_name = c.table_name AND tb.table_type = 'BASE TABLE'
    WHERE c.table_schema = 'public' AND c.column_name = 'staff_member_id' AND c.table_name <> 'staff_members'
      AND EXISTS (SELECT 1 FROM information_schema.columns c2 WHERE c2.table_schema = 'public' AND c2.table_name = c.table_name AND c2.column_name = 'user_id')
  LOOP
    EXECUTE format('UPDATE public.%I SET user_id = $1, staff_member_id = NULL WHERE staff_member_id = $2', t) USING p_user, p_member;
  END LOOP;
  UPDATE public.leave_requests SET staff_id = p_user, staff_member_id = NULL WHERE staff_member_id = p_member;
  UPDATE public.cover_assignments SET absent_user_id = p_user, absent_staff_member_id = NULL WHERE absent_staff_member_id = p_member;
  UPDATE public.cover_assignments SET sub_user_id = p_user, sub_staff_member_id = NULL WHERE sub_staff_member_id = p_member;
  UPDATE public.sched_requirements SET teacher_id = p_user, staff_member_id = NULL WHERE staff_member_id = p_member;
  PERFORM set_config('app.person_relink', 'on', true);
  UPDATE public.timetable_slots SET teacher_id = p_user, staff_member_id = NULL WHERE staff_member_id = p_member;
  PERFORM set_config('app.person_relink', 'off', true);

  -- People with a login link WhatsApp themselves; the register consent was for the roster-only number.
  UPDATE public.staff_members
  SET user_id = p_user, name = left(coalesce(nullif(trim(u.name), ''), m.name), 120), whatsapp_opt_in = false, updated_at = now()
  WHERE id = p_member;
END
```

</details>

### fn hr_next_employee_code

`hr_next_employee_code(p_school uuid)` → `text` · plpgsql · security definer · execute: postgres, service_role

- **Touches:** `hr_settings` insert/update, `staff_members` select
- **Reached from routes:** `/api/admin/people`

<details><summary>Source</summary>

```sql
DECLARE s public.hr_settings; code text;
BEGIN
  INSERT INTO public.hr_settings (school_id) VALUES (p_school) ON CONFLICT (school_id) DO NOTHING;
  LOOP
    UPDATE public.hr_settings SET code_last_no = code_last_no + 1 WHERE school_id = p_school RETURNING * INTO s;
    code := s.code_prefix || lpad(s.code_last_no::text, s.code_width, '0');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.staff_members WHERE school_id = p_school AND lower(employee_code) = lower(code));
  END LOOP;
  RETURN code;
END
```

</details>

### fn hr_reassign_reports

`hr_reassign_reports(p_school uuid, p_from uuid, p_to uuid, p_on date, p_reason text, p_by uuid)` → `integer` · plpgsql · security definer · execute: postgres, service_role

- **Touches:** `staff_members` select, `staff_jobs` insert
- **Calls:** `app.school_today()`
- **Reached from routes:** `/api/admin/people`

<details><summary>Source</summary>

```sql
DECLARE r public.staff_members; n int := 0; d date := least(p_on, app.school_today());
BEGIN
  IF p_to IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.staff_members WHERE id = p_to AND school_id = p_school AND active) THEN
    RAISE EXCEPTION 'hr_reassign: the new manager is not on the register' USING ERRCODE = 'P0001';
  END IF;
  FOR r IN SELECT * FROM public.staff_members WHERE school_id = p_school AND manager_id = p_from AND active AND id IS DISTINCT FROM p_to LOOP
    INSERT INTO public.staff_jobs (school_id, staff_member_id, effective_from, action, designation, category, department_id, grade_id,
      manager_id, employment, contract_from, contract_to, reason, created_by)
    VALUES (p_school, r.id, d, 'transfer', r.designation, r.category, r.department_id, r.grade_id, p_to, r.employment, r.contract_from, r.contract_to, p_reason, p_by)
    ON CONFLICT (staff_member_id, effective_from) DO UPDATE
      SET manager_id = EXCLUDED.manager_id, reason = EXCLUDED.reason,
          action = CASE WHEN staff_jobs.action IN ('hire', 'rehire') THEN staff_jobs.action ELSE 'transfer' END;
    n := n + 1;
  END LOOP;
  -- If the new manager reported to the person who has gone, they move up to that person's own manager.
  SELECT * INTO r FROM public.staff_members WHERE id = p_to AND manager_id = p_from;
  IF FOUND THEN
    INSERT INTO public.staff_jobs (school_id, staff_member_id, effective_from, action, designation, category, department_id, grade_id,
      manager_id, employment, contract_from, contract_to, reason, created_by)
    VALUES (p_school, r.id, d, 'transfer', r.designation, r.category, r.department_id, r.grade_id,
      (SELECT nullif(manager_id, p_to) FROM public.staff_members WHERE id = p_from), r.employment, r.contract_from, r.contract_to, p_reason, p_by)
    ON CONFLICT (staff_member_id, effective_from) DO UPDATE
      SET manager_id = EXCLUDED.manager_id, reason = EXCLUDED.reason,
          action = CASE WHEN staff_jobs.action IN ('hire', 'rehire') THEN staff_jobs.action ELSE 'transfer' END;
  END IF;
  RETURN n;
END
```

</details>

### fn hr_sync_jobs

`hr_sync_jobs(p_school uuid)` → `integer` · plpgsql · security definer · execute: postgres, service_role

- **Touches:** `staff_members` select
- **Calls:** `app.sync_staff_job()`
- **Reached from routes:** `/api/admin/people`, `/api/me/employee`
- **Called by SQL:** `hr_daily()`

<details><summary>Source</summary>

```sql
DECLARE r record; n int := 0;
BEGIN
  FOR r IN SELECT id FROM public.staff_members WHERE school_id = p_school LOOP
    IF app.sync_staff_job(r.id) THEN n := n + 1; END IF;
  END LOOP;
  RETURN n;
END
```

</details>

### fn import_admission_applicants

`import_admission_applicants(p_job uuid, p_school uuid, p_actor uuid, p_rows jsonb, p_dry boolean)` → `jsonb` · plpgsql · security definer · execute: postgres, service_role

- **Touches:** `admission_applicants` select/update/insert, `import_changes` insert

<details><summary>Source</summary>

```sql
DECLARE v_out jsonb;
BEGIN
  -- An applicant has no number of their own: the same session, name and date of birth (or, without a date of
  -- birth, guardian phone) is the same applicant.
  DROP TABLE IF EXISTS pg_temp._r;
  CREATE TEMP TABLE _r ON COMMIT DROP AS
    SELECT x.*, (SELECT a.id FROM public.admission_applicants a
                 WHERE a.school_id = p_school AND a.session = x.session AND lower(a.name) = lower(x.name)
                   AND (a.date_of_birth = x.date_of_birth OR (x.date_of_birth IS NULL AND a.guardian_phone = x.guardian_phone))
                 ORDER BY a.created_at LIMIT 1) AS cur_id
    FROM jsonb_to_recordset(p_rows) AS x(n int, session text, name text, grade int, date_of_birth date, guardian_name text, guardian_phone text,
      guardian_email text, previous_school text, source text, stage text);
  ALTER TABLE pg_temp._r ADD COLUMN changed boolean;
  UPDATE pg_temp._r r SET changed = r.cur_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.admission_applicants a WHERE a.id = r.cur_id AND
    (r.grade, coalesce(r.guardian_name, a.guardian_name), coalesce(r.guardian_phone, a.guardian_phone), coalesce(r.guardian_email, a.guardian_email),
     coalesce(r.previous_school, a.previous_school), coalesce(r.source, a.source), coalesce(r.stage, a.stage), coalesce(r.date_of_birth, a.date_of_birth))
    IS DISTINCT FROM (a.grade, a.guardian_name, a.guardian_phone, a.guardian_email, a.previous_school, a.source, a.stage, a.date_of_birth))
    WHERE true;
  SELECT jsonb_build_object('added', count(*) FILTER (WHERE cur_id IS NULL), 'updated', count(*) FILTER (WHERE changed),
    'unchanged', count(*) FILTER (WHERE cur_id IS NOT NULL AND NOT changed), 'problems', '[]'::jsonb) INTO v_out FROM pg_temp._r;
  IF p_dry THEN RETURN v_out; END IF;

  PERFORM set_config('sthara.import_job', p_job::text, true);
  INSERT INTO public.import_changes (job_id, school_id, table_name, row_id, before)
    SELECT p_job, p_school, 'admission_applicants', a.id, to_jsonb(a) FROM pg_temp._r JOIN public.admission_applicants a ON a.id = _r.cur_id WHERE _r.changed
    ON CONFLICT (job_id, table_name, row_id) DO NOTHING;
  UPDATE public.admission_applicants a SET grade = r.grade, date_of_birth = coalesce(r.date_of_birth, a.date_of_birth),
      guardian_name = coalesce(r.guardian_name, a.guardian_name), guardian_phone = coalesce(r.guardian_phone, a.guardian_phone),
      guardian_email = coalesce(r.guardian_email, a.guardian_email), previous_school = coalesce(r.previous_school, a.previous_school),
      source = coalesce(r.source, a.source), stage = coalesce(r.stage, a.stage),
      furthest_stage = CASE WHEN array_position(ARRAY['enquiry','application','assessment','offer','enrolled'], coalesce(r.stage, a.stage))
                              > array_position(ARRAY['enquiry','application','assessment','offer','enrolled'], a.furthest_stage)
                            THEN coalesce(r.stage, a.stage) ELSE a.furthest_stage END,
      stage_changed_at = CASE WHEN coalesce(r.stage, a.stage) <> a.stage THEN now() ELSE a.stage_changed_at END,
      import_job_id = p_job
    FROM pg_temp._r r WHERE a.id = r.cur_id AND r.changed;
  INSERT INTO public.admission_applicants (school_id, session, name, grade, date_of_birth, guardian_name, guardian_phone, guardian_email,
      previous_school, source, stage, furthest_stage, created_by, import_job_id)
    SELECT p_school, session, name, grade, date_of_birth, guardian_name, guardian_phone, guardian_email, previous_school,
      coalesce(source, 'other'), coalesce(stage, 'enquiry'),
      CASE WHEN coalesce(stage, 'enquiry') IN ('rejected', 'withdrawn') THEN 'enquiry' ELSE coalesce(stage, 'enquiry') END, p_actor, p_job
    FROM pg_temp._r WHERE cur_id IS NULL;
  RETURN v_out;
END
```

</details>

### fn import_attendance

`import_attendance(p_job uuid, p_school uuid, p_actor uuid, p_rows jsonb, p_dry boolean)` → `jsonb` · plpgsql · security definer · execute: postgres, service_role

- **Touches:** `attendance` select/update/insert, `users` select, `import_changes` insert

<details><summary>Source</summary>

```sql
DECLARE v_out jsonb; v_problems jsonb;
BEGIN
  DROP TABLE IF EXISTS pg_temp._r;
  CREATE TEMP TABLE _r ON COMMIT DROP AS
    SELECT x.*, a.id AS cur_id, a.status AS cur_status, a.note AS cur_note, a.class_name AS cur_class
    FROM jsonb_to_recordset(p_rows) AS x(n int, student_id uuid, class_name text, day date, status text, note text)
    LEFT JOIN public.attendance a ON a.student_id = x.student_id AND a.day = x.day;
  SELECT coalesce(jsonb_agg(jsonb_build_object('n', n, 'error', 'That student is not in this school.') ORDER BY n), '[]') INTO v_problems
    FROM pg_temp._r WHERE NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = _r.student_id AND u.school_id = p_school);
  ALTER TABLE pg_temp._r ADD COLUMN changed boolean;
  UPDATE pg_temp._r SET changed = cur_id IS NOT NULL AND (status, coalesce(note, cur_note), class_name) IS DISTINCT FROM (cur_status, cur_note, cur_class) WHERE true;
  SELECT jsonb_build_object('added', count(*) FILTER (WHERE cur_id IS NULL), 'updated', count(*) FILTER (WHERE changed),
    'unchanged', count(*) FILTER (WHERE cur_id IS NOT NULL AND NOT changed), 'problems', v_problems) INTO v_out FROM pg_temp._r;
  IF p_dry OR jsonb_array_length(v_problems) > 0 THEN RETURN v_out; END IF;

  PERFORM set_config('sthara.import_job', p_job::text, true);
  INSERT INTO public.import_changes (job_id, school_id, table_name, row_id, before)
    SELECT p_job, p_school, 'attendance', a.id, to_jsonb(a) FROM pg_temp._r JOIN public.attendance a ON a.id = _r.cur_id WHERE _r.changed
    ON CONFLICT (job_id, table_name, row_id) DO NOTHING;
  UPDATE public.attendance a SET status = r.status, note = coalesce(r.note, a.note), class_name = r.class_name, import_job_id = p_job
    FROM pg_temp._r r WHERE a.id = r.cur_id AND r.changed;
  INSERT INTO public.attendance (school_id, student_id, class_name, day, status, note, marked_by, import_job_id)
    SELECT p_school, student_id, class_name, day, status, note, p_actor, p_job FROM pg_temp._r WHERE cur_id IS NULL;
  RETURN v_out;
END
```

</details>

### fn import_cc_memberships

`import_cc_memberships(p_job uuid, p_school uuid, p_actor uuid, p_rows jsonb, p_dry boolean)` → `jsonb` · plpgsql · security definer · execute: postgres, service_role

- **Touches:** `cc_memberships` select/update/insert, `students` select, `cc_groups` select, `import_changes` insert

<details><summary>Source</summary>

```sql
DECLARE v_out jsonb; v_problems jsonb;
BEGIN
  DROP TABLE IF EXISTS pg_temp._r;
  CREATE TEMP TABLE _r ON COMMIT DROP AS
    SELECT x.*, s.id AS sid, s.status AS s_status, g.id AS gid,
      (SELECT m.id FROM public.cc_memberships m WHERE m.group_id = x.group_id AND m.student_id = s.id AND m.session = x.session) AS cur_id
    FROM jsonb_to_recordset(p_rows) AS x(n int, admission_no text, group_id uuid, session text, role text)
    LEFT JOIN public.students s ON s.school_id = p_school AND lower(s.admission_no) = lower(x.admission_no)
    LEFT JOIN public.cc_groups g ON g.id = x.group_id AND g.school_id = p_school;
  ALTER TABLE pg_temp._r ADD COLUMN changed boolean;
  UPDATE pg_temp._r r SET changed = r.cur_id IS NOT NULL AND r.role IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.cc_memberships m WHERE m.id = r.cur_id AND m.role IS DISTINCT FROM r.role) WHERE true;
  SELECT coalesce(jsonb_agg(jsonb_build_object('n', n, 'error', e) ORDER BY n), '[]') INTO v_problems FROM (
    SELECT n, CASE
      WHEN sid IS NULL THEN 'No student with admission number ' || admission_no || ' on the register. Import the register first.'
      WHEN s_status = 'cancelled' THEN 'Admission number ' || admission_no || ' was cancelled on the register.'
      WHEN gid IS NULL THEN 'Unknown club or team.'
    END AS e FROM pg_temp._r) p WHERE e IS NOT NULL;
  SELECT jsonb_build_object('added', count(*) FILTER (WHERE cur_id IS NULL), 'updated', count(*) FILTER (WHERE changed),
    'unchanged', count(*) FILTER (WHERE cur_id IS NOT NULL AND NOT changed), 'problems', v_problems) INTO v_out FROM pg_temp._r;
  IF p_dry OR jsonb_array_length(v_problems) > 0 THEN RETURN v_out; END IF;

  PERFORM set_config('sthara.import_job', p_job::text, true);
  INSERT INTO public.import_changes (job_id, school_id, table_name, row_id, before)
    SELECT p_job, p_school, 'cc_memberships', m.id, to_jsonb(m) FROM pg_temp._r JOIN public.cc_memberships m ON m.id = _r.cur_id WHERE _r.changed
    ON CONFLICT (job_id, table_name, row_id) DO NOTHING;
  UPDATE public.cc_memberships m SET role = r.role, import_job_id = p_job FROM pg_temp._r r WHERE m.id = r.cur_id AND r.changed;
  INSERT INTO public.cc_memberships (school_id, group_id, student_id, session, role, added_by, import_job_id)
    SELECT p_school, gid, sid, session, role, p_actor, p_job FROM pg_temp._r WHERE cur_id IS NULL;
  RETURN v_out;
END
```

</details>

### fn import_certificates

`import_certificates(p_job uuid, p_school uuid, p_actor uuid, p_rows jsonb, p_dry boolean)` → `jsonb` · plpgsql · security definer · execute: postgres, service_role

- **Touches:** `certificates` select/update/insert, `students` select, `certificate_types` select, `import_changes` insert, `doc_counters` insert

<details><summary>Source</summary>

```sql
DECLARE v_out jsonb; v_problems jsonb;
BEGIN
  DROP TABLE IF EXISTS pg_temp._r;
  CREATE TEMP TABLE _r ON COMMIT DROP AS
    SELECT x.*, s.id AS sid, s.status AS s_status, t.id AS tid,
      (SELECT c.id FROM public.certificates c WHERE c.type_id = t.id AND c.number = x.number AND c.copy_no = coalesce(x.copy_no, 0) LIMIT 1) AS cur_id
    FROM jsonb_to_recordset(p_rows) AS x(n int, admission_no text, type_id uuid, number text, serial int, copy_no int, issued_on date,
      cancelled boolean, cancel_reason text, data jsonb)
    LEFT JOIN public.students s ON s.school_id = p_school AND lower(s.admission_no) = lower(x.admission_no)
    LEFT JOIN public.certificate_types t ON t.id = x.type_id AND t.school_id = p_school;
  ALTER TABLE pg_temp._r ADD COLUMN changed boolean;
  UPDATE pg_temp._r r SET changed = r.cur_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.certificates c WHERE c.id = r.cur_id AND
    (c.data IS DISTINCT FROM c.data || coalesce(r.data, '{}') OR c.issued_on IS DISTINCT FROM r.issued_on
     OR (c.status = 'cancelled') IS DISTINCT FROM coalesce(r.cancelled, false))) WHERE true;
  SELECT coalesce(jsonb_agg(jsonb_build_object('n', n, 'error', e) ORDER BY n), '[]') INTO v_problems FROM (
    SELECT n, CASE
      WHEN sid IS NULL THEN 'No student with admission number ' || admission_no || ' on the register. Import the register first.'
      WHEN tid IS NULL THEN 'Unknown kind of certificate.'
      WHEN cur_id IS NOT NULL AND (SELECT c.student_id FROM public.certificates c WHERE c.id = _r.cur_id) <> sid
        THEN 'Certificate ' || number || ' is already on the register for another student.'
      WHEN cur_id IS NOT NULL AND (SELECT c.import_job_id IS NULL AND c.source <> 'import' FROM public.certificates c WHERE c.id = _r.cur_id)
        THEN 'Certificate ' || number || ' was issued in Sthara; the past register can''t change it.'
      WHEN coalesce(copy_no, 0) > 0 AND NOT EXISTS (SELECT 1 FROM pg_temp._r o WHERE o.tid = _r.tid AND o.number = _r.number AND coalesce(o.copy_no, 0) = 0)
        AND NOT EXISTS (SELECT 1 FROM public.certificates c WHERE c.type_id = _r.tid AND c.number = _r.number AND c.copy_no = 0)
        THEN 'A duplicate needs its original (copy 0) in the file or on the register.'
    END AS e FROM pg_temp._r) p WHERE e IS NOT NULL;
  SELECT jsonb_build_object('added', count(*) FILTER (WHERE cur_id IS NULL), 'updated', count(*) FILTER (WHERE changed),
    'unchanged', count(*) FILTER (WHERE cur_id IS NOT NULL AND NOT changed), 'problems', v_problems) INTO v_out FROM pg_temp._r;
  IF p_dry OR jsonb_array_length(v_problems) > 0 THEN RETURN v_out; END IF;

  PERFORM set_config('sthara.import_job', p_job::text, true);
  INSERT INTO public.import_changes (job_id, school_id, table_name, row_id, before)
    SELECT p_job, p_school, 'certificates', c.id, to_jsonb(c) FROM pg_temp._r JOIN public.certificates c ON c.id = _r.cur_id WHERE _r.changed
    ON CONFLICT (job_id, table_name, row_id) DO NOTHING;
  UPDATE public.certificates c SET data = c.data || coalesce(r.data, '{}'), issued_on = r.issued_on,
      status = CASE WHEN r.cancelled THEN 'cancelled' ELSE 'issued' END,
      cancel_reason = CASE WHEN r.cancelled THEN coalesce(r.cancel_reason, c.cancel_reason, 'Cancelled before Sthara') END,
      cancelled_at = CASE WHEN r.cancelled THEN coalesce(c.cancelled_at, now()) END, import_job_id = p_job
    FROM pg_temp._r r WHERE c.id = r.cur_id AND r.changed;
  -- Originals first, so duplicates can point at them.
  INSERT INTO public.certificates (school_id, student_id, type_id, status, serial, number, copy_no, data, issued_on, prepared_by, approved_at,
      cancelled_at, cancel_reason, source, import_job_id)
    SELECT p_school, sid, tid, CASE WHEN cancelled THEN 'cancelled' ELSE 'issued' END, serial, number, 0, coalesce(data, '{}'), issued_on, p_actor, now(),
      CASE WHEN cancelled THEN now() END, CASE WHEN cancelled THEN coalesce(cancel_reason, 'Cancelled before Sthara') END, 'import', p_job
    FROM pg_temp._r WHERE cur_id IS NULL AND coalesce(copy_no, 0) = 0;
  INSERT INTO public.certificates (school_id, student_id, type_id, status, serial, number, copy_no, duplicate_of, data, issued_on, prepared_by, approved_at,
      cancelled_at, cancel_reason, source, import_job_id)
    SELECT p_school, r.sid, r.tid, CASE WHEN r.cancelled THEN 'cancelled' ELSE 'issued' END, r.serial, r.number, r.copy_no,
      (SELECT o.id FROM public.certificates o WHERE o.type_id = r.tid AND o.number = r.number AND o.copy_no = 0), coalesce(r.data, '{}'), r.issued_on, p_actor, now(),
      CASE WHEN r.cancelled THEN now() END, CASE WHEN r.cancelled THEN coalesce(r.cancel_reason, 'Cancelled before Sthara') END, 'import', p_job
    FROM pg_temp._r r WHERE r.cur_id IS NULL AND coalesce(r.copy_no, 0) > 0;
  -- Sthara numbering continues past the highest imported serial of each kind.
  INSERT INTO public.doc_counters (school_id, kind, session, last_no)
    SELECT p_school, 'cert:' || tid::text, 'all', max(serial) FROM pg_temp._r WHERE serial IS NOT NULL GROUP BY tid
    ON CONFLICT (school_id, kind, session) DO UPDATE SET last_no = greatest(doc_counters.last_no, EXCLUDED.last_no);
  RETURN v_out;
END
```

</details>

### fn import_claim

`import_claim(p_limit integer DEFAULT 3, p_seconds integer DEFAULT 90)` → `SETOF import_jobs` · sql · security definer · execute: postgres, service_role

- **Touches:** `import_jobs` update/select
- **Reached from routes:** `/api/admin/import`, `/api/admin/import/[id]`, `/api/import/worker`, `/api/ops/schools/[id]/import`, `/api/ops/schools/[id]/import/[jobId]`

<details><summary>Source</summary>

```sql
UPDATE public.import_jobs j SET locked_until = now() + make_interval(secs => p_seconds), attempts = j.attempts + 1
  WHERE j.id IN (
    SELECT id FROM public.import_jobs
    WHERE status IN ('checking', 'committing', 'undoing') AND (locked_until IS NULL OR locked_until < now())
    ORDER BY created_at LIMIT p_limit FOR UPDATE SKIP LOCKED)
  RETURNING j.*;
```

</details>

### fn import_documents

`import_documents(p_job uuid, p_school uuid, p_actor uuid, p_rows jsonb, p_dry boolean)` → `jsonb` · plpgsql · security definer · execute: postgres, service_role

- **Touches:** `student_documents` select/update/insert, `students` select, `import_changes` insert

<details><summary>Source</summary>

```sql
DECLARE v_out jsonb; v_problems jsonb;
BEGIN
  DROP TABLE IF EXISTS pg_temp._r;
  CREATE TEMP TABLE _r ON COMMIT DROP AS
    SELECT x.*, s.id AS sid, s.status AS s_status,
      (SELECT d.id FROM public.student_documents d WHERE d.student_id = s.id AND d.kind = x.kind AND lower(d.file_name) = lower(x.file_name)
        ORDER BY d.created_at LIMIT 1) AS cur_id
    FROM jsonb_to_recordset(p_rows) AS x(n int, admission_no text, kind text, title text, default_title text, document_no text, issued_on date, valid_until date,
      verified boolean, storage_path text, file_name text, size_bytes bigint)
    LEFT JOIN public.students s ON s.school_id = p_school AND lower(s.admission_no) = lower(x.admission_no);
  ALTER TABLE pg_temp._r ADD COLUMN changed boolean;
  UPDATE pg_temp._r r SET changed = r.cur_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.student_documents d WHERE d.id = r.cur_id AND
    ((coalesce(r.title, d.title), coalesce(r.document_no, d.document_no), coalesce(r.issued_on, d.issued_on), coalesce(r.valid_until, d.valid_until))
      IS DISTINCT FROM (d.title, d.document_no, d.issued_on, d.valid_until)
     OR (r.verified IS TRUE AND d.status <> 'verified'))) WHERE true;
  SELECT coalesce(jsonb_agg(jsonb_build_object('n', n, 'error', e) ORDER BY n), '[]') INTO v_problems FROM (
    SELECT n, CASE
      WHEN sid IS NULL THEN 'No student with admission number ' || admission_no || ' on the register. Import the register first.'
      WHEN s_status = 'cancelled' THEN 'Admission number ' || admission_no || ' was cancelled on the register.'
      WHEN storage_path IS NULL OR storage_path NOT LIKE p_school::text || '/import/' || p_job::text || '/%' THEN 'The file for this row is not part of this import.'
      WHEN valid_until < issued_on THEN 'It can''t expire before it was issued.'
    END AS e FROM pg_temp._r) p WHERE e IS NOT NULL;
  SELECT jsonb_build_object('added', count(*) FILTER (WHERE cur_id IS NULL), 'updated', count(*) FILTER (WHERE changed),
    'unchanged', count(*) FILTER (WHERE cur_id IS NOT NULL AND NOT changed), 'problems', v_problems) INTO v_out FROM pg_temp._r;
  IF p_dry OR jsonb_array_length(v_problems) > 0 THEN RETURN v_out; END IF;

  PERFORM set_config('sthara.import_job', p_job::text, true);
  INSERT INTO public.import_changes (job_id, school_id, table_name, row_id, before)
    SELECT p_job, p_school, 'student_documents', d.id, to_jsonb(d) FROM pg_temp._r JOIN public.student_documents d ON d.id = _r.cur_id WHERE _r.changed
    ON CONFLICT (job_id, table_name, row_id) DO NOTHING;
  UPDATE public.student_documents d SET title = coalesce(r.title, d.title), document_no = coalesce(r.document_no, d.document_no),
      issued_on = coalesce(r.issued_on, d.issued_on), valid_until = coalesce(r.valid_until, d.valid_until),
      status = CASE WHEN r.verified IS TRUE THEN 'verified' ELSE d.status END,
      verified_by = CASE WHEN r.verified IS TRUE AND d.status <> 'verified' THEN p_actor ELSE d.verified_by END,
      verified_at = CASE WHEN r.verified IS TRUE AND d.status <> 'verified' THEN now() ELSE d.verified_at END,
      reject_note = CASE WHEN r.verified IS TRUE THEN NULL ELSE d.reject_note END,
      import_job_id = p_job
    FROM pg_temp._r r WHERE d.id = r.cur_id AND r.changed;
  INSERT INTO public.student_documents (school_id, student_id, kind, title, document_no, issued_on, valid_until, storage_path, file_name, size_bytes,
      status, source, uploaded_by, verified_by, verified_at, import_job_id)
    SELECT p_school, sid, kind, left(coalesce(title, default_title, 'Document'), 120), document_no, issued_on, valid_until, storage_path, file_name, size_bytes,
      CASE WHEN verified IS TRUE THEN 'verified' ELSE 'awaiting' END, 'import', p_actor,
      CASE WHEN verified IS TRUE THEN p_actor END, CASE WHEN verified IS TRUE THEN now() END, p_job
    FROM pg_temp._r WHERE cur_id IS NULL;
  RETURN v_out;
END
```

</details>

### fn import_enrolments

`import_enrolments(p_job uuid, p_school uuid, p_actor uuid, p_rows jsonb, p_dry boolean)` → `jsonb` · plpgsql · security definer · execute: postgres, service_role

- **Touches:** `enrolments` select/update/insert, `students` select, `import_changes` insert, `classes` select
- **Calls:** `app.current_session()`, `app.norm_class()`, `app.session_starts()`, `app.session_ends()`

<details><summary>Source</summary>

```sql
DECLARE v_out jsonb; v_problems jsonb; v_current text := app.current_session(p_school);
BEGIN
  DROP TABLE IF EXISTS pg_temp._r;
  CREATE TEMP TABLE _r ON COMMIT DROP AS
    SELECT x.*, s.id AS sid, s.status AS s_status,
      (SELECT e.id FROM public.enrolments e WHERE e.student_id = s.id AND e.session = x.session ORDER BY e.starts_on DESC LIMIT 1) AS cur_id,
      (SELECT count(*) FROM public.enrolments e WHERE e.student_id = s.id AND e.session = x.session) AS cur_rows
    FROM jsonb_to_recordset(p_rows) AS x(n int, admission_no text, session text, grade int, section text, class_name text, roll_no text,
      stream text, languages jsonb, outcome text)
    LEFT JOIN public.students s ON s.school_id = p_school AND lower(s.admission_no) = lower(x.admission_no);
  ALTER TABLE pg_temp._r ADD COLUMN changed boolean;
  UPDATE pg_temp._r r SET changed = r.cur_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.enrolments e WHERE e.id = r.cur_id AND
    (r.grade, coalesce(r.section, e.section), coalesce(r.class_name, e.class_name), coalesce(r.roll_no, e.roll_no), coalesce(r.stream, e.stream),
     coalesce(r.languages, e.languages), coalesce(r.outcome, e.outcome))
    IS DISTINCT FROM (e.grade, e.section, e.class_name, e.roll_no, e.stream, e.languages, e.outcome)) WHERE true;
  SELECT coalesce(jsonb_agg(jsonb_build_object('n', n, 'error', e) ORDER BY n), '[]') INTO v_problems FROM (
    SELECT n, CASE
      WHEN sid IS NULL THEN 'No student with admission number ' || admission_no || ' on the register. Import the register first.'
      WHEN s_status = 'cancelled' THEN 'Admission number ' || admission_no || ' was cancelled on the register.'
      WHEN session >= v_current THEN 'Only past sessions can be imported here; ' || session || ' is the current session or later.'
      WHEN cur_rows > 1 THEN 'This student has more than one row in ' || session || ' (a mid-year move). Correct it on the student record.'
    END AS e FROM pg_temp._r) p WHERE e IS NOT NULL;
  SELECT jsonb_build_object('added', count(*) FILTER (WHERE cur_id IS NULL), 'updated', count(*) FILTER (WHERE changed),
    'unchanged', count(*) FILTER (WHERE cur_id IS NOT NULL AND NOT changed), 'problems', v_problems) INTO v_out FROM pg_temp._r;
  IF p_dry OR jsonb_array_length(v_problems) > 0 THEN RETURN v_out; END IF;

  PERFORM set_config('sthara.import_job', p_job::text, true);
  INSERT INTO public.import_changes (job_id, school_id, table_name, row_id, before)
    SELECT p_job, p_school, 'enrolments', e.id, to_jsonb(e) FROM pg_temp._r JOIN public.enrolments e ON e.id = _r.cur_id WHERE _r.changed
    ON CONFLICT (job_id, table_name, row_id) DO NOTHING;
  UPDATE public.enrolments e SET grade = r.grade, section = coalesce(r.section, e.section), class_name = coalesce(r.class_name, e.class_name),
      roll_no = coalesce(r.roll_no, e.roll_no), stream = coalesce(r.stream, e.stream), languages = coalesce(r.languages, e.languages),
      outcome = coalesce(r.outcome, e.outcome), finalised_at = CASE WHEN coalesce(r.outcome, e.outcome) IS NOT NULL THEN coalesce(e.finalised_at, now()) END,
      finalised_by = CASE WHEN r.outcome IS NOT NULL AND e.outcome IS NULL THEN p_actor ELSE e.finalised_by END, import_job_id = p_job
    FROM pg_temp._r r WHERE e.id = r.cur_id AND r.changed;
  INSERT INTO public.enrolments (school_id, student_id, session, grade, section, class_name, class_id, roll_no, stream, languages, starts_on, ends_on,
      end_reason, outcome, finalised_at, finalised_by, import_job_id)
    SELECT p_school, r.sid, r.session, r.grade, r.section, coalesce(r.class_name, r.grade::text || coalesce('-' || r.section, '')),
      (SELECT c.id FROM public.classes c WHERE c.school_id = p_school AND app.norm_class(c.name) = app.norm_class(coalesce(r.class_name, r.grade::text || coalesce('-' || r.section, ''))) LIMIT 1),
      r.roll_no, r.stream, coalesce(r.languages, '{}'::jsonb), app.session_starts(p_school, r.session), app.session_ends(p_school, r.session),
      CASE WHEN r.outcome IN ('dropout', 'left') THEN 'left' WHEN r.outcome IN ('detained', 'repeater') THEN 'retained' ELSE 'promoted' END,
      r.outcome, CASE WHEN r.outcome IS NOT NULL THEN now() END, CASE WHEN r.outcome IS NOT NULL THEN p_actor END, p_job
    FROM pg_temp._r r WHERE r.cur_id IS NULL;
  RETURN v_out;
END
```

</details>

### fn import_exam_marks

`import_exam_marks(p_job uuid, p_school uuid, p_actor uuid, p_rows jsonb, p_dry boolean)` → `jsonb` · plpgsql · security definer · execute: postgres, service_role

- **Touches:** `exam_sheets` select, `exam_marks` select/update/insert, `users` select, `import_changes` insert

<details><summary>Source</summary>

```sql
DECLARE v_out jsonb; v_problems jsonb;
BEGIN
  DROP TABLE IF EXISTS pg_temp._r;
  CREATE TEMP TABLE _r ON COMMIT DROP AS
    SELECT x.*, m.id AS cur_id, m.marks AS cur_marks, m.code AS cur_code, s.status AS sheet_status, s.max_marks AS sheet_max, s.school_id AS sheet_school
    FROM jsonb_to_recordset(p_rows) AS x(n int, sheet_id uuid, student_id uuid, marks numeric, code text)
    LEFT JOIN public.exam_sheets s ON s.id = x.sheet_id
    LEFT JOIN public.exam_marks m ON m.sheet_id = x.sheet_id AND m.student_id = x.student_id;
  SELECT coalesce(jsonb_agg(jsonb_build_object('n', n, 'error', e) ORDER BY n), '[]') INTO v_problems FROM (
    SELECT n, CASE
      WHEN sheet_school IS DISTINCT FROM p_school THEN 'That marks sheet is not in this school.'
      WHEN NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = _r.student_id AND u.school_id = p_school) THEN 'That student is not in this school.'
      WHEN sheet_status <> 'open' THEN 'That marks sheet is ' || sheet_status || '. Reopen it before importing marks.'
      WHEN marks > sheet_max THEN 'Marks are above the maximum of ' || sheet_max || '.'
    END AS e FROM pg_temp._r) p WHERE e IS NOT NULL;
  ALTER TABLE pg_temp._r ADD COLUMN changed boolean;
  UPDATE pg_temp._r SET changed = cur_id IS NOT NULL AND (marks, code) IS DISTINCT FROM (cur_marks, cur_code) WHERE true;
  SELECT jsonb_build_object('added', count(*) FILTER (WHERE cur_id IS NULL), 'updated', count(*) FILTER (WHERE changed),
    'unchanged', count(*) FILTER (WHERE cur_id IS NOT NULL AND NOT changed), 'problems', v_problems) INTO v_out FROM pg_temp._r;
  IF p_dry OR jsonb_array_length(v_problems) > 0 THEN RETURN v_out; END IF;

  PERFORM set_config('sthara.import_job', p_job::text, true);
  INSERT INTO public.import_changes (job_id, school_id, table_name, row_id, before)
    SELECT p_job, p_school, 'exam_marks', m.id, to_jsonb(m) FROM pg_temp._r JOIN public.exam_marks m ON m.id = _r.cur_id WHERE _r.changed
    ON CONFLICT (job_id, table_name, row_id) DO NOTHING;
  UPDATE public.exam_marks m SET marks = r.marks, code = r.code, source = 'import', updated_by = p_actor, updated_at = now(), import_job_id = p_job
    FROM pg_temp._r r WHERE m.id = r.cur_id AND r.changed;
  INSERT INTO public.exam_marks (school_id, sheet_id, student_id, marks, code, source, updated_by, import_job_id)
    SELECT p_school, sheet_id, student_id, marks, code, 'import', p_actor, p_job FROM pg_temp._r WHERE cur_id IS NULL;
  RETURN v_out;
END
```

</details>

### fn import_family

`import_family(p_job uuid, p_school uuid, p_actor uuid, p_rows jsonb, p_dry boolean)` → `jsonb` · plpgsql · security definer · execute: postgres, service_role

- **Touches:** `family_members` select/update/insert, `students` select/update, `import_changes` insert, `emergency_contacts` select/update/insert
- **Calls:** `app.suggest_siblings()`

<details><summary>Source</summary>

```sql
DECLARE v_out jsonb; v_problems jsonb; v_sid uuid;
BEGIN
  DROP TABLE IF EXISTS pg_temp._r;
  CREATE TEMP TABLE _r ON COMMIT DROP AS
    SELECT x.*, s.id AS sid, s.status AS s_status, s.family_code AS cur_code,
      (SELECT f.id FROM public.family_members f WHERE f.student_id = s.id AND f.relation = x.relation AND lower(f.name) = lower(x.name) LIMIT 1) AS cur_id
    FROM jsonb_to_recordset(p_rows) AS x(n int, admission_no text, relation text, name text, phone text, email text, education text,
      occupation text, annual_income numeric, is_primary boolean, lives_with boolean, emergency int, family_code text)
    LEFT JOIN public.students s ON s.school_id = p_school AND lower(s.admission_no) = lower(x.admission_no);
  ALTER TABLE pg_temp._r ADD COLUMN changed boolean;
  UPDATE pg_temp._r r SET changed = r.cur_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.family_members f WHERE f.id = r.cur_id AND
    (coalesce(r.phone, f.phone), coalesce(r.email, f.email), coalesce(r.education, f.education), coalesce(r.occupation, f.occupation),
     coalesce(r.annual_income, f.annual_income), coalesce(r.is_primary, f.is_primary), coalesce(r.lives_with, f.lives_with))
    IS DISTINCT FROM (f.phone, f.email, f.education, f.occupation, f.annual_income, f.is_primary, f.lives_with)) WHERE true;
  SELECT coalesce(jsonb_agg(jsonb_build_object('n', n, 'error', e) ORDER BY n), '[]') INTO v_problems FROM (
    SELECT n, CASE
      WHEN sid IS NULL THEN 'No student with admission number ' || admission_no || ' on the register. Import the register first.'
      WHEN s_status = 'cancelled' THEN 'Admission number ' || admission_no || ' was cancelled on the register.'
      WHEN is_primary AND EXISTS (SELECT 1 FROM pg_temp._r o WHERE o.sid = _r.sid AND o.is_primary AND o.n < _r.n)
        THEN 'Two primary contacts for the same student in this file. Keep one.'
      WHEN emergency IS NOT NULL AND EXISTS (SELECT 1 FROM pg_temp._r o WHERE o.sid = _r.sid AND o.emergency = _r.emergency AND o.n < _r.n)
        THEN 'Two people are emergency contact ' || emergency || ' for the same student in this file.'
    END AS e FROM pg_temp._r) p WHERE e IS NOT NULL;
  SELECT jsonb_build_object('added', count(*) FILTER (WHERE cur_id IS NULL), 'updated', count(*) FILTER (WHERE changed),
    'unchanged', count(*) FILTER (WHERE cur_id IS NOT NULL AND NOT changed), 'problems', v_problems) INTO v_out FROM pg_temp._r;
  IF p_dry OR jsonb_array_length(v_problems) > 0 THEN RETURN v_out; END IF;

  PERFORM set_config('sthara.import_job', p_job::text, true);
  INSERT INTO public.import_changes (job_id, school_id, table_name, row_id, before)
    SELECT p_job, p_school, 'family_members', f.id, to_jsonb(f) FROM pg_temp._r JOIN public.family_members f ON f.id = _r.cur_id WHERE _r.changed
    ON CONFLICT (job_id, table_name, row_id) DO NOTHING;
  -- A new primary contact in the file takes over from the one on file, which undo makes primary again.
  WITH old AS (
    UPDATE public.family_members f SET is_primary = false
      WHERE f.is_primary AND f.student_id IN (SELECT sid FROM pg_temp._r WHERE is_primary)
        AND f.id NOT IN (SELECT cur_id FROM pg_temp._r WHERE is_primary AND cur_id IS NOT NULL)
      RETURNING f.id)
  INSERT INTO public.import_changes (job_id, school_id, table_name, row_id, before)
    SELECT p_job, p_school, 'family_primary', id, '{}'::jsonb FROM old
    ON CONFLICT (job_id, table_name, row_id) DO NOTHING;
  UPDATE public.family_members f SET phone = coalesce(r.phone, f.phone), email = coalesce(r.email, f.email), education = coalesce(r.education, f.education),
      occupation = coalesce(r.occupation, f.occupation), annual_income = coalesce(r.annual_income, f.annual_income),
      is_primary = coalesce(r.is_primary, f.is_primary), lives_with = coalesce(r.lives_with, f.lives_with), import_job_id = p_job
    FROM pg_temp._r r WHERE f.id = r.cur_id AND r.changed;
  WITH ins AS (
    INSERT INTO public.family_members (school_id, student_id, relation, name, phone, email, education, occupation, annual_income, is_primary, lives_with, created_by, import_job_id)
      SELECT p_school, sid, relation, name, phone, email, education, occupation, annual_income, coalesce(is_primary, false), coalesce(lives_with, true), p_actor, p_job
      FROM pg_temp._r WHERE cur_id IS NULL
      RETURNING id, student_id, relation, name)
  UPDATE pg_temp._r r SET cur_id = ins.id FROM ins WHERE r.cur_id IS NULL AND r.sid = ins.student_id AND r.relation = ins.relation AND lower(r.name) = lower(ins.name);
  -- Emergency places: the person at a place is replaced (calling order follows the file). A place already held is
  -- re-pointed in place with its before-image kept; an empty place gets a new row.
  INSERT INTO public.import_changes (job_id, school_id, table_name, row_id, before)
    SELECT p_job, p_school, 'emergency_contacts', e.id, to_jsonb(e) FROM pg_temp._r r
      JOIN public.emergency_contacts e ON e.student_id = r.sid AND e.position = r.emergency
      WHERE r.emergency IS NOT NULL AND e.family_member_id IS DISTINCT FROM r.cur_id
    ON CONFLICT (job_id, table_name, row_id) DO NOTHING;
  UPDATE public.emergency_contacts e SET family_member_id = r.cur_id, name = NULL, relation = NULL, phone = NULL, import_job_id = p_job
    FROM pg_temp._r r WHERE r.emergency IS NOT NULL AND e.student_id = r.sid AND e.position = r.emergency AND e.family_member_id IS DISTINCT FROM r.cur_id;
  INSERT INTO public.emergency_contacts (school_id, student_id, position, family_member_id, import_job_id)
    SELECT p_school, r.sid, r.emergency, r.cur_id, p_job FROM pg_temp._r r
    WHERE r.emergency IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.emergency_contacts e WHERE e.student_id = r.sid AND e.position = r.emergency);
  UPDATE public.students s SET family_code = r.family_code
    FROM (SELECT DISTINCT ON (sid) sid, family_code FROM pg_temp._r WHERE family_code IS NOT NULL ORDER BY sid, n) r
    WHERE s.id = r.sid AND s.family_code IS DISTINCT FROM r.family_code;
  FOR v_sid IN SELECT DISTINCT sid FROM pg_temp._r LOOP PERFORM app.suggest_siblings(v_sid); END LOOP;
  RETURN v_out;
END
```

</details>

### fn import_fee_invoices

`import_fee_invoices(p_job uuid, p_school uuid, p_actor uuid, p_rows jsonb, p_dry boolean)` → `jsonb` · plpgsql · security definer · execute: postgres, service_role

- **Touches:** `fee_payments` select, `fee_invoices` select/update/insert, `users` select, `import_changes` insert
- **Calls:** `app.next_doc_no()`

<details><summary>Source</summary>

```sql
DECLARE v_out jsonb; v_problems jsonb;
BEGIN
  DROP TABLE IF EXISTS pg_temp._r;
  CREATE TEMP TABLE _r ON COMMIT DROP AS
    SELECT x.*, i.id AS cur_id, i.label AS cur_label, i.due_on AS cur_due, i.amount AS cur_amount, i.concession AS cur_concession,
      i.concession_reason AS cur_reason, i.voided_at IS NOT NULL AS cur_void,
      coalesce((SELECT sum(p.amount) FROM public.fee_payments p WHERE p.invoice_id = i.id AND p.voided_at IS NULL), 0) AS paid
    FROM jsonb_to_recordset(p_rows) AS x(n int, student_id uuid, session text, instalment_no int, label text, due_on date, amount numeric, concession numeric, concession_reason text)
    LEFT JOIN public.fee_invoices i ON i.student_id = x.student_id AND i.session = x.session AND i.instalment_no = x.instalment_no;
  ALTER TABLE pg_temp._r ADD COLUMN changed boolean;
  UPDATE pg_temp._r SET changed = cur_id IS NOT NULL AND (coalesce(label, cur_label), coalesce(due_on, cur_due), amount, coalesce(concession, cur_concession), coalesce(concession_reason, cur_reason))
    IS DISTINCT FROM (cur_label, cur_due, cur_amount, cur_concession, cur_reason) WHERE true;
  SELECT coalesce(jsonb_agg(jsonb_build_object('n', n, 'error', e) ORDER BY n), '[]') INTO v_problems FROM (
    SELECT n, CASE
      WHEN NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = _r.student_id AND u.school_id = p_school) THEN 'That student is not in this school.'
      WHEN cur_id IS NULL AND (label IS NULL OR due_on IS NULL) THEN 'A new invoice needs a label and a due date.'
      WHEN cur_void AND changed THEN 'That instalment''s invoice was voided. Raise it again in Fees instead.'
      WHEN changed AND amount - coalesce(concession, cur_concession) < paid THEN 'More than the new amount has already been paid against this invoice (' || paid || ').'
      WHEN coalesce(concession, cur_concession, 0) > 0 AND coalesce(concession_reason, cur_reason) IS NULL THEN 'A concession needs a reason.'
    END AS e FROM pg_temp._r) p WHERE e IS NOT NULL;
  SELECT jsonb_build_object('added', count(*) FILTER (WHERE cur_id IS NULL), 'updated', count(*) FILTER (WHERE changed),
    'unchanged', count(*) FILTER (WHERE cur_id IS NOT NULL AND NOT changed), 'problems', v_problems) INTO v_out FROM pg_temp._r;
  IF p_dry OR jsonb_array_length(v_problems) > 0 THEN RETURN v_out; END IF;

  PERFORM set_config('sthara.import_job', p_job::text, true);
  INSERT INTO public.import_changes (job_id, school_id, table_name, row_id, before)
    SELECT p_job, p_school, 'fee_invoices', i.id, to_jsonb(i) FROM pg_temp._r JOIN public.fee_invoices i ON i.id = _r.cur_id WHERE _r.changed
    ON CONFLICT (job_id, table_name, row_id) DO NOTHING;
  UPDATE public.fee_invoices i SET label = coalesce(r.label, i.label), due_on = coalesce(r.due_on, i.due_on), amount = r.amount,
      concession = coalesce(r.concession, i.concession), concession_reason = coalesce(r.concession_reason, i.concession_reason), import_job_id = p_job
    FROM pg_temp._r r WHERE i.id = r.cur_id AND r.changed;
  -- Numbers are taken only for rows that are really new, so none is burnt on a re-run.
  INSERT INTO public.fee_invoices (school_id, student_id, session, instalment_no, label, invoice_no, due_on, amount, concession, concession_reason, created_by, import_job_id)
    SELECT p_school, student_id, session, instalment_no, label, app.next_doc_no(p_school, 'invoice', session), due_on, amount,
      coalesce(concession, 0), concession_reason, p_actor, p_job
    FROM pg_temp._r WHERE cur_id IS NULL ORDER BY n;
  RETURN v_out;
END
```

</details>

### fn import_fee_payments

`import_fee_payments(p_job uuid, p_school uuid, p_actor uuid, p_rows jsonb, p_dry boolean)` → `jsonb` · plpgsql · security definer · execute: postgres, service_role

- **Touches:** `fee_invoices` select, `fee_payments` select/insert, `users` select, `doc_counters` insert
- **Calls:** `app.next_doc_no()`

<details><summary>Source</summary>

```sql
DECLARE v_out jsonb; v_problems jsonb;
BEGIN
  -- Receipts are never edited (app.guard_fee_payment): a receipt number already on file is either the same receipt
  -- (left alone) or a clash (refused).
  DROP TABLE IF EXISTS pg_temp._r;
  CREATE TEMP TABLE _r ON COMMIT DROP AS
    SELECT x.*, i.id AS invoice_id, i.amount - i.concession AS net, i.voided_at IS NOT NULL AS invoice_void,
      p.id AS cur_id, (p.invoice_id, p.amount, p.mode, p.paid_on) IS NOT DISTINCT FROM (i.id, x.amount, x.mode, x.paid_on) AS same
    FROM jsonb_to_recordset(p_rows) AS x(n int, student_id uuid, session text, instalment_no int, amount numeric, mode text, reference text, paid_on date, receipt_no text)
    LEFT JOIN public.fee_invoices i ON i.student_id = x.student_id AND i.session = x.session AND i.instalment_no = x.instalment_no AND i.school_id = p_school
    LEFT JOIN public.fee_payments p ON p.school_id = p_school AND p.receipt_no = x.receipt_no;
  SELECT coalesce(jsonb_agg(jsonb_build_object('n', n, 'error', e) ORDER BY n), '[]') INTO v_problems FROM (
    SELECT n, CASE
      WHEN NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = r.student_id AND u.school_id = p_school) THEN 'That student is not in this school.'
      WHEN invoice_id IS NULL THEN 'No invoice for instalment ' || instalment_no || ' of ' || session || '. Import the invoices first.'
      WHEN invoice_void THEN 'The invoice for this instalment was voided.'
      WHEN cur_id IS NOT NULL AND NOT same THEN 'Receipt ' || receipt_no || ' is already on file with different details.'
      WHEN cur_id IS NULL AND amount + coalesce((SELECT sum(q.amount) FROM public.fee_payments q WHERE q.invoice_id = r.invoice_id AND q.voided_at IS NULL), 0)
        + coalesce((SELECT sum(o.amount) FROM pg_temp._r o WHERE o.invoice_id = r.invoice_id AND o.cur_id IS NULL AND o.n < r.n), 0) > net
        THEN 'This payment takes the instalment above its amount (' || net || ').'
    END AS e FROM pg_temp._r r) p WHERE e IS NOT NULL;
  SELECT jsonb_build_object('added', count(*) FILTER (WHERE cur_id IS NULL), 'updated', 0,
    'unchanged', count(*) FILTER (WHERE cur_id IS NOT NULL AND same), 'problems', v_problems) INTO v_out FROM pg_temp._r;
  IF p_dry OR jsonb_array_length(v_problems) > 0 THEN RETURN v_out; END IF;

  PERFORM set_config('sthara.import_job', p_job::text, true);
  -- Receipt numbers Sthara issues carry on after the highest imported one in its format. Moved first, so a row with
  -- no receipt number is numbered after every imported one (import_receipt_floor does the same for the whole file).
  INSERT INTO public.doc_counters (school_id, kind, session, last_no)
    SELECT p_school, 'receipt', m[1], max(m[2]::int)
    FROM (SELECT regexp_match(receipt_no, '^RCT/(\d{4}-\d{2})/(\d{1,9})$') AS m FROM pg_temp._r WHERE cur_id IS NULL AND receipt_no IS NOT NULL) s
    WHERE m IS NOT NULL GROUP BY m[1]
    ON CONFLICT (school_id, kind, session) DO UPDATE SET last_no = greatest(doc_counters.last_no, EXCLUDED.last_no);
  INSERT INTO public.fee_payments (school_id, invoice_id, student_id, amount, mode, reference, paid_on, receipt_no, recorded_by, import_job_id)
    SELECT p_school, invoice_id, student_id, amount, mode, reference, paid_on,
      coalesce(receipt_no, app.next_doc_no(p_school, 'receipt', session)), p_actor, p_job
    FROM pg_temp._r WHERE cur_id IS NULL ORDER BY n;
  RETURN v_out;
END
```

</details>

### fn import_fee_structures

`import_fee_structures(p_job uuid, p_school uuid, p_actor uuid, p_rows jsonb, p_dry boolean)` → `jsonb` · plpgsql · security definer · execute: postgres, service_role

- **Touches:** `fee_structures` select/update/insert, `import_changes` insert

<details><summary>Source</summary>

```sql
DECLARE v_out jsonb;
BEGIN
  DROP TABLE IF EXISTS pg_temp._r;
  CREATE TEMP TABLE _r ON COMMIT DROP AS
    SELECT x.*, f.id AS cur_id, f.annual_fee AS cur_fee, f.schedule AS cur_schedule
    FROM jsonb_to_recordset(p_rows) AS x(n int, session text, grade int, annual_fee numeric, schedule jsonb)
    LEFT JOIN public.fee_structures f ON f.school_id = p_school AND f.session = x.session AND f.grade = x.grade;
  ALTER TABLE pg_temp._r ADD COLUMN changed boolean;
  UPDATE pg_temp._r SET changed = cur_id IS NOT NULL AND (annual_fee, coalesce(schedule, cur_schedule)) IS DISTINCT FROM (cur_fee, cur_schedule) WHERE true;
  SELECT jsonb_build_object('added', count(*) FILTER (WHERE cur_id IS NULL), 'updated', count(*) FILTER (WHERE changed),
    'unchanged', count(*) FILTER (WHERE cur_id IS NOT NULL AND NOT changed), 'problems', '[]'::jsonb) INTO v_out FROM pg_temp._r;
  IF p_dry THEN RETURN v_out; END IF;

  PERFORM set_config('sthara.import_job', p_job::text, true);
  INSERT INTO public.import_changes (job_id, school_id, table_name, row_id, before)
    SELECT p_job, p_school, 'fee_structures', f.id, to_jsonb(f) FROM pg_temp._r JOIN public.fee_structures f ON f.id = _r.cur_id WHERE _r.changed
    ON CONFLICT (job_id, table_name, row_id) DO NOTHING;
  UPDATE public.fee_structures f SET annual_fee = r.annual_fee, schedule = coalesce(r.schedule, f.schedule), updated_by = p_actor, import_job_id = p_job
    FROM pg_temp._r r WHERE f.id = r.cur_id AND r.changed;
  INSERT INTO public.fee_structures (school_id, session, grade, annual_fee, schedule, updated_by, import_job_id)
    SELECT p_school, session, grade, annual_fee, coalesce(schedule, '[]'::jsonb), p_actor, p_job FROM pg_temp._r WHERE cur_id IS NULL;
  RETURN v_out;
END
```

</details>

### fn import_health

`import_health(p_job uuid, p_school uuid, p_actor uuid, p_rows jsonb, p_dry boolean)` → `jsonb` · plpgsql · security definer · execute: postgres, service_role

- **Touches:** `students` select, `student_health` select/update/insert, `import_changes` insert
- **Calls:** `app.health_consent()`

<details><summary>Source</summary>

```sql
DECLARE v_out jsonb; v_problems jsonb;
BEGIN
  DROP TABLE IF EXISTS pg_temp._r;
  CREATE TEMP TABLE _r ON COMMIT DROP AS
    SELECT x.*, s.id AS sid, s.status AS s_status, h.id AS cur_id, to_jsonb(h) AS cur, app.health_consent(s.id) AS consent
    FROM jsonb_to_recordset(p_rows) AS x(n int, admission_no text, blood_group text, height_cm numeric, weight_kg numeric, measured_on date,
      cwsn boolean, impairments text[], disability_certificate boolean, disability_percent int, screening jsonb,
      allergies jsonb, conditions jsonb, medication jsonb)
    LEFT JOIN public.students s ON s.school_id = p_school AND lower(s.admission_no) = lower(x.admission_no)
    LEFT JOIN public.student_health h ON h.student_id = s.id;
  ALTER TABLE pg_temp._r ADD COLUMN withheld boolean;
  UPDATE pg_temp._r SET withheld = NOT consent AND (allergies IS NOT NULL OR conditions IS NOT NULL OR medication IS NOT NULL) WHERE true;
  UPDATE pg_temp._r SET allergies = NULL, conditions = NULL, medication = NULL WHERE withheld;
  ALTER TABLE pg_temp._r ADD COLUMN changed boolean;
  UPDATE pg_temp._r SET changed = cur_id IS NOT NULL AND (
    coalesce(blood_group, cur ->> 'blood_group'), coalesce(height_cm, (cur ->> 'height_cm')::numeric), coalesce(weight_kg, (cur ->> 'weight_kg')::numeric),
    coalesce(measured_on, (cur ->> 'measured_on')::date), coalesce(cwsn, (cur ->> 'cwsn')::boolean), coalesce(to_jsonb(impairments), cur -> 'impairments'),
    coalesce(disability_certificate, (cur ->> 'disability_certificate')::boolean), coalesce(disability_percent, (cur ->> 'disability_percent')::int),
    coalesce(screening, cur -> 'screening'), coalesce(allergies, cur -> 'allergies'), coalesce(conditions, cur -> 'conditions'), coalesce(medication, cur -> 'medication'))
    IS DISTINCT FROM (cur ->> 'blood_group', (cur ->> 'height_cm')::numeric, (cur ->> 'weight_kg')::numeric, (cur ->> 'measured_on')::date,
      (cur ->> 'cwsn')::boolean, cur -> 'impairments', (cur ->> 'disability_certificate')::boolean, (cur ->> 'disability_percent')::int,
      cur -> 'screening', cur -> 'allergies', cur -> 'conditions', cur -> 'medication') WHERE true;
  SELECT coalesce(jsonb_agg(jsonb_build_object('n', n, 'error', e) ORDER BY n), '[]') INTO v_problems FROM (
    SELECT n, CASE
      WHEN sid IS NULL THEN 'No student with admission number ' || admission_no || ' on the register. Import the register first.'
      WHEN s_status = 'cancelled' THEN 'Admission number ' || admission_no || ' was cancelled on the register.'
    END AS e FROM pg_temp._r) p WHERE e IS NOT NULL;
  SELECT jsonb_build_object('added', count(*) FILTER (WHERE cur_id IS NULL), 'updated', count(*) FILTER (WHERE changed),
    'unchanged', count(*) FILTER (WHERE cur_id IS NOT NULL AND NOT changed), 'withheld', count(*) FILTER (WHERE withheld),
    'problems', v_problems) INTO v_out FROM pg_temp._r;
  IF p_dry OR jsonb_array_length(v_problems) > 0 THEN RETURN v_out; END IF;

  PERFORM set_config('sthara.import_job', p_job::text, true);
  INSERT INTO public.import_changes (job_id, school_id, table_name, row_id, before)
    SELECT p_job, p_school, 'student_health', h.id, to_jsonb(h) FROM pg_temp._r JOIN public.student_health h ON h.id = _r.cur_id WHERE _r.changed
    ON CONFLICT (job_id, table_name, row_id) DO NOTHING;
  UPDATE public.student_health h SET blood_group = coalesce(r.blood_group, h.blood_group), height_cm = coalesce(r.height_cm, h.height_cm),
      weight_kg = coalesce(r.weight_kg, h.weight_kg), measured_on = coalesce(r.measured_on, h.measured_on), cwsn = coalesce(r.cwsn, h.cwsn),
      impairments = coalesce(r.impairments, h.impairments), disability_certificate = coalesce(r.disability_certificate, h.disability_certificate),
      disability_percent = coalesce(r.disability_percent, h.disability_percent), screening = coalesce(r.screening, h.screening),
      allergies = coalesce(r.allergies, h.allergies), conditions = coalesce(r.conditions, h.conditions), medication = coalesce(r.medication, h.medication),
      updated_by = p_actor, import_job_id = p_job
    FROM pg_temp._r r WHERE h.id = r.cur_id AND r.changed;
  INSERT INTO public.student_health (student_id, school_id, blood_group, height_cm, weight_kg, measured_on, cwsn, impairments, disability_certificate,
      disability_percent, screening, allergies, conditions, medication, updated_by, import_job_id)
    SELECT sid, p_school, blood_group, height_cm, weight_kg, measured_on, coalesce(cwsn, false), coalesce(impairments, '{}'), disability_certificate,
      disability_percent, coalesce(screening, '{}'), coalesce(allergies, '[]'), coalesce(conditions, '[]'), coalesce(medication, '[]'), p_actor, p_job
    FROM pg_temp._r WHERE cur_id IS NULL;
  RETURN v_out;
END
```

</details>

### fn import_health_events

`import_health_events(p_job uuid, p_school uuid, p_actor uuid, p_rows jsonb, p_dry boolean)` → `jsonb` · plpgsql · security definer · execute: postgres, service_role

- **Touches:** `health_events` select/insert, `students` select
- **Calls:** `app.health_consent()`

<details><summary>Source</summary>

```sql
DECLARE v_out jsonb; v_problems jsonb;
BEGIN
  DROP TABLE IF EXISTS pg_temp._r;
  CREATE TEMP TABLE _r ON COMMIT DROP AS
    SELECT x.*, s.id AS sid, s.status AS s_status, app.health_consent(s.id) AS consent,
      (SELECT e.id FROM public.health_events e WHERE e.student_id = s.id AND e.kind = x.kind AND e.on_date = x.on_date
         AND coalesce(e.data ->> 'vaccine', '') = coalesce(x.data ->> 'vaccine', '') LIMIT 1) AS cur_id
    FROM jsonb_to_recordset(p_rows) AS x(n int, admission_no text, kind text, on_date date, data jsonb, note text)
    LEFT JOIN public.students s ON s.school_id = p_school AND lower(s.admission_no) = lower(x.admission_no);
  SELECT coalesce(jsonb_agg(jsonb_build_object('n', n, 'error', e) ORDER BY n), '[]') INTO v_problems FROM (
    SELECT n, CASE
      WHEN sid IS NULL THEN 'No student with admission number ' || admission_no || ' on the register. Import the register first.'
      WHEN s_status = 'cancelled' THEN 'Admission number ' || admission_no || ' was cancelled on the register.'
    END AS e FROM pg_temp._r) p WHERE e IS NOT NULL;
  SELECT jsonb_build_object('added', count(*) FILTER (WHERE cur_id IS NULL AND consent), 'updated', 0,
    'unchanged', count(*) FILTER (WHERE cur_id IS NOT NULL AND consent), 'withheld', count(*) FILTER (WHERE NOT consent),
    'problems', v_problems) INTO v_out FROM pg_temp._r;
  IF p_dry OR jsonb_array_length(v_problems) > 0 THEN RETURN v_out; END IF;
  PERFORM set_config('sthara.import_job', p_job::text, true);
  INSERT INTO public.health_events (school_id, student_id, kind, on_date, data, note, recorded_by, import_job_id)
    SELECT p_school, sid, kind, on_date, coalesce(data, '{}'), note, p_actor, p_job FROM pg_temp._r WHERE cur_id IS NULL AND consent;
  RETURN v_out;
END
```

</details>

### fn import_house_members

`import_house_members(p_job uuid, p_school uuid, p_actor uuid, p_rows jsonb, p_dry boolean)` → `jsonb` · plpgsql · security definer · execute: postgres, service_role

- **Touches:** `students` select, `houses` select, `house_members` select/update/insert, `import_changes` insert

<details><summary>Source</summary>

```sql
DECLARE v_out jsonb; v_problems jsonb;
BEGIN
  DROP TABLE IF EXISTS pg_temp._r;
  CREATE TEMP TABLE _r ON COMMIT DROP AS
    SELECT x.*, s.id AS sid, s.status AS s_status, h.id AS hid, m.id AS cur_id, m.house_id AS cur_house, m.from_date AS cur_from
    FROM jsonb_to_recordset(p_rows) AS x(n int, admission_no text, house_id uuid, from_date date, reason text)
    LEFT JOIN public.students s ON s.school_id = p_school AND lower(s.admission_no) = lower(x.admission_no)
    LEFT JOIN public.houses h ON h.id = x.house_id AND h.school_id = p_school
    LEFT JOIN public.house_members m ON m.student_id = s.id AND m.to_date IS NULL;
  SELECT coalesce(jsonb_agg(jsonb_build_object('n', n, 'error', e) ORDER BY n), '[]') INTO v_problems FROM (
    SELECT n, CASE
      WHEN sid IS NULL THEN 'No student with admission number ' || admission_no || ' on the register. Import the register first.'
      WHEN s_status = 'cancelled' THEN 'Admission number ' || admission_no || ' was cancelled on the register.'
      WHEN hid IS NULL THEN 'Unknown house.'
      WHEN cur_id IS NOT NULL AND cur_house <> hid AND from_date <= cur_from THEN 'The student is in another house since ' || to_char(cur_from, 'DD-MM-YYYY') || '; the move must be later.'
    END AS e FROM pg_temp._r) p WHERE e IS NOT NULL;
  SELECT jsonb_build_object('added', count(*) FILTER (WHERE cur_id IS NULL OR cur_house <> hid), 'updated', 0,
    'unchanged', count(*) FILTER (WHERE cur_house = hid), 'problems', v_problems) INTO v_out FROM pg_temp._r;
  IF p_dry OR jsonb_array_length(v_problems) > 0 THEN RETURN v_out; END IF;

  PERFORM set_config('sthara.import_job', p_job::text, true);
  INSERT INTO public.import_changes (job_id, school_id, table_name, row_id, before)
    SELECT p_job, p_school, 'house_members', m.id, to_jsonb(m) FROM pg_temp._r JOIN public.house_members m ON m.id = _r.cur_id WHERE _r.cur_house <> _r.hid
    ON CONFLICT (job_id, table_name, row_id) DO NOTHING;
  UPDATE public.house_members m SET to_date = r.from_date - 1, reason = coalesce(m.reason, r.reason)
    FROM pg_temp._r r WHERE m.id = r.cur_id AND r.cur_house <> r.hid;
  INSERT INTO public.house_members (school_id, student_id, house_id, from_date, reason, set_by, import_job_id)
    SELECT p_school, sid, hid, from_date, reason, p_actor, p_job FROM pg_temp._r WHERE cur_id IS NULL OR cur_house <> hid;
  RETURN v_out;
END
```

</details>

### fn import_kirti

`import_kirti(p_job uuid, p_school uuid, p_actor uuid, p_rows jsonb, p_dry boolean)` → `jsonb` · plpgsql · security definer · execute: postgres, service_role

- **Touches:** `kirti_entries` select/update/insert, `house_members` select, `students` select, `import_changes` insert

<details><summary>Source</summary>

```sql
DECLARE v_out jsonb; v_problems jsonb;
BEGIN
  DROP TABLE IF EXISTS pg_temp._r;
  CREATE TEMP TABLE _r ON COMMIT DROP AS
    SELECT x.*, s.id AS sid, s.status AS s_status,
      (SELECT k.id FROM public.kirti_entries k WHERE k.student_id = s.id AND lower(k.title) = lower(x.title) AND k.on_date = x.on_date LIMIT 1) AS cur_id,
      (SELECT m.house_id FROM public.house_members m WHERE m.student_id = s.id AND m.from_date <= x.on_date AND (m.to_date IS NULL OR m.to_date >= x.on_date) LIMIT 1) AS hid
    FROM jsonb_to_recordset(p_rows) AS x(n int, admission_no text, session text, on_date date, title text, category text, level text, position text,
      position_note text, house_points int, notes text)
    LEFT JOIN public.students s ON s.school_id = p_school AND lower(s.admission_no) = lower(x.admission_no);
  ALTER TABLE pg_temp._r ADD COLUMN changed boolean;
  UPDATE pg_temp._r r SET changed = r.cur_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.kirti_entries k WHERE k.id = r.cur_id AND
    (r.category, r.level, r.position, coalesce(r.position_note, k.position_note), coalesce(r.house_points, k.house_points), coalesce(r.notes, k.notes))
    IS DISTINCT FROM (k.category, k.level, k.position, k.position_note, k.house_points, k.notes)) WHERE true;
  SELECT coalesce(jsonb_agg(jsonb_build_object('n', n, 'error', e) ORDER BY n), '[]') INTO v_problems FROM (
    SELECT n, CASE
      WHEN sid IS NULL THEN 'No student with admission number ' || admission_no || ' on the register. Import the register first.'
      WHEN s_status = 'cancelled' THEN 'Admission number ' || admission_no || ' was cancelled on the register.'
      WHEN house_points IS NOT NULL AND hid IS NULL THEN 'House points are given, but the student wasn''t in a house on that day.'
    END AS e FROM pg_temp._r) p WHERE e IS NOT NULL;
  SELECT jsonb_build_object('added', count(*) FILTER (WHERE cur_id IS NULL), 'updated', count(*) FILTER (WHERE changed),
    'unchanged', count(*) FILTER (WHERE cur_id IS NOT NULL AND NOT changed), 'problems', v_problems) INTO v_out FROM pg_temp._r;
  IF p_dry OR jsonb_array_length(v_problems) > 0 THEN RETURN v_out; END IF;

  PERFORM set_config('sthara.import_job', p_job::text, true);
  INSERT INTO public.import_changes (job_id, school_id, table_name, row_id, before)
    SELECT p_job, p_school, 'kirti_entries', k.id, to_jsonb(k) FROM pg_temp._r JOIN public.kirti_entries k ON k.id = _r.cur_id WHERE _r.changed
    ON CONFLICT (job_id, table_name, row_id) DO NOTHING;
  UPDATE public.kirti_entries k SET category = r.category, level = r.level, position = r.position, position_note = coalesce(r.position_note, k.position_note),
      house_points = coalesce(r.house_points, k.house_points), house_id = CASE WHEN coalesce(r.house_points, k.house_points) IS NULL THEN k.house_id ELSE coalesce(r.hid, k.house_id) END,
      notes = coalesce(r.notes, k.notes), import_job_id = p_job
    FROM pg_temp._r r WHERE k.id = r.cur_id AND r.changed;
  INSERT INTO public.kirti_entries (school_id, student_id, session, on_date, title, category, level, position, position_note, house_points, house_id, notes,
      status, recorded_by, approved_by, approved_at, import_job_id)
    SELECT p_school, sid, session, on_date, title, category, level, position, position_note, house_points, CASE WHEN house_points IS NOT NULL THEN hid END, notes,
      'approved', p_actor, p_actor, now(), p_job
    FROM pg_temp._r WHERE cur_id IS NULL;
  RETURN v_out;
END
```

</details>

### fn import_legacy_results

`import_legacy_results(p_job uuid, p_school uuid, p_actor uuid, p_rows jsonb, p_dry boolean)` → `jsonb` · plpgsql · security definer · execute: postgres, service_role

- **Touches:** `legacy_results` select/update/insert, `users` select, `import_changes` insert

<details><summary>Source</summary>

```sql
DECLARE v_out jsonb; v_problems jsonb;
BEGIN
  DROP TABLE IF EXISTS pg_temp._r;
  CREATE TEMP TABLE _r ON COMMIT DROP AS
    SELECT x.*, l.id AS cur_id, l.marks AS cur_marks, l.max_marks AS cur_max, l.grade AS cur_grade, l.code AS cur_code, l.class_name AS cur_class
    FROM jsonb_to_recordset(p_rows) AS x(n int, student_id uuid, session text, class_name text, term text, subject text, marks numeric, max_marks numeric, grade text, code text)
    LEFT JOIN public.legacy_results l ON l.student_id = x.student_id AND l.session = x.session AND l.term = x.term AND l.subject = x.subject;
  SELECT coalesce(jsonb_agg(jsonb_build_object('n', n, 'error', 'That student is not in this school.') ORDER BY n), '[]') INTO v_problems
    FROM pg_temp._r WHERE NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = _r.student_id AND u.school_id = p_school);
  ALTER TABLE pg_temp._r ADD COLUMN changed boolean;
  UPDATE pg_temp._r SET changed = cur_id IS NOT NULL AND (marks, max_marks, grade, code, coalesce(class_name, cur_class))
    IS DISTINCT FROM (cur_marks, cur_max, cur_grade, cur_code, cur_class) WHERE true;
  SELECT jsonb_build_object('added', count(*) FILTER (WHERE cur_id IS NULL), 'updated', count(*) FILTER (WHERE changed),
    'unchanged', count(*) FILTER (WHERE cur_id IS NOT NULL AND NOT changed), 'problems', v_problems) INTO v_out FROM pg_temp._r;
  IF p_dry OR jsonb_array_length(v_problems) > 0 THEN RETURN v_out; END IF;

  PERFORM set_config('sthara.import_job', p_job::text, true);
  INSERT INTO public.import_changes (job_id, school_id, table_name, row_id, before)
    SELECT p_job, p_school, 'legacy_results', l.id, to_jsonb(l) FROM pg_temp._r JOIN public.legacy_results l ON l.id = _r.cur_id WHERE _r.changed
    ON CONFLICT (job_id, table_name, row_id) DO NOTHING;
  UPDATE public.legacy_results l SET marks = r.marks, max_marks = r.max_marks, grade = r.grade, code = r.code,
      class_name = coalesce(r.class_name, l.class_name), import_job_id = p_job
    FROM pg_temp._r r WHERE l.id = r.cur_id AND r.changed;
  INSERT INTO public.legacy_results (school_id, student_id, session, class_name, term, subject, marks, max_marks, grade, code, import_job_id)
    SELECT p_school, student_id, session, class_name, term, subject, marks, max_marks, grade, code, p_job FROM pg_temp._r WHERE cur_id IS NULL;
  RETURN v_out;
END
```

</details>

### fn import_receipt_floor

`import_receipt_floor(p_school uuid, p_floors jsonb)` → `void` · sql · security definer · execute: postgres, service_role

- **Touches:** `doc_counters` insert
- **Reached from routes:** `/api/admin/import`, `/api/admin/import/[id]`, `/api/import/worker`, `/api/ops/schools/[id]/import`, `/api/ops/schools/[id]/import/[jobId]`

<details><summary>Source</summary>

```sql
INSERT INTO public.doc_counters (school_id, kind, session, last_no)
    SELECT p_school, 'receipt', key, value::int FROM jsonb_each_text(p_floors) WHERE key ~ '^\d{4}-\d{2}$' AND value ~ '^\d{1,9}$'
    ON CONFLICT (school_id, kind, session) DO UPDATE SET last_no = greatest(doc_counters.last_no, EXCLUDED.last_no);
```

</details>

### fn import_students

`import_students(p_job uuid, p_school uuid, p_actor uuid, p_rows jsonb, p_dry boolean)` → `jsonb` · plpgsql · security definer · execute: postgres, service_role

- **Touches:** `students` select/update/insert, `import_changes` insert, `student_changes` insert
- **Calls:** `app.admission_floor()`

<details><summary>Source</summary>

```sql
DECLARE v_out jsonb; v_problems jsonb; v_cols text;
BEGIN
  DROP TABLE IF EXISTS pg_temp._r;
  CREATE TEMP TABLE _r ON COMMIT DROP AS
    SELECT x.n, x.admission_no, x.row, s.id AS cur_id, s.status AS cur_status, to_jsonb(s) AS cur
    FROM (SELECT (e ->> 'n')::int AS n, e ->> 'admission_no' AS admission_no, jsonb_strip_nulls(e - 'n' - 'admission_no') AS row
          FROM jsonb_array_elements(p_rows) e) x
    LEFT JOIN public.students s ON s.school_id = p_school AND lower(s.admission_no) = lower(x.admission_no);
  ALTER TABLE pg_temp._r ADD COLUMN changed boolean;
  -- The ciphertext differs on every encryption; the hash says whether the number changed.
  UPDATE pg_temp._r SET changed = cur_id IS NOT NULL AND EXISTS (SELECT 1 FROM jsonb_each(row - 'aadhaar_cipher') p WHERE (cur -> p.key) IS DISTINCT FROM p.value) WHERE true;
  SELECT coalesce(jsonb_agg(jsonb_build_object('n', n, 'error', e) ORDER BY n), '[]') INTO v_problems FROM (
    SELECT n, CASE
      WHEN EXISTS (SELECT 1 FROM jsonb_object_keys(row) k WHERE k NOT IN ('full_name', 'aadhaar_name', 'gender', 'date_of_birth', 'pen', 'apaar_id',
        'aadhaar_cipher', 'aadhaar_last4', 'aadhaar_hash', 'no_aadhaar', 'cbse_reg_no', 'board_roll_no', 'admitted_on', 'admitted_grade', 'previous_school',
        'previous_status', 'previous_class', 'previous_tc_no', 'rte_seat', 'rte_amount', 'medium', 'indian_national', 'mother_tongue', 'social_category',
        'religion', 'minority', 'bpl', 'aay', 'ews', 'family_income', 'address', 'permanent_address', 'permanent_same', 'distance_km', 'family_code'))
        THEN 'The row has a field the register does not hold.'
      WHEN length(trim(admission_no)) NOT BETWEEN 1 AND 30 THEN 'An admission number has up to 30 characters.'
      WHEN cur_status = 'cancelled' THEN 'Admission number ' || admission_no || ' was cancelled on the register and cannot be used again.'
      WHEN cur_id IS NULL AND NOT row ? 'full_name' THEN 'A new register entry needs a full name.'
      WHEN (row ->> 'no_aadhaar')::boolean IS TRUE AND row ? 'aadhaar_last4' THEN 'The row says the student has no Aadhaar but also gives a number.'
      WHEN row ? 'pen' AND EXISTS (SELECT 1 FROM public.students o WHERE o.school_id = p_school AND o.pen = _r.row ->> 'pen' AND o.id IS DISTINCT FROM _r.cur_id)
        THEN 'PEN ' || (row ->> 'pen') || ' is already on another student.'
      WHEN row ? 'pen' AND EXISTS (SELECT 1 FROM pg_temp._r o WHERE o.row ->> 'pen' = _r.row ->> 'pen' AND o.n < _r.n AND lower(o.admission_no) <> lower(_r.admission_no))
        THEN 'PEN ' || (row ->> 'pen') || ' is also on row ' || (SELECT min(o.n) FROM pg_temp._r o WHERE o.row ->> 'pen' = _r.row ->> 'pen') || ' of this file.'
      WHEN row ? 'apaar_id' AND EXISTS (SELECT 1 FROM public.students o WHERE o.school_id = p_school AND o.apaar_id = _r.row ->> 'apaar_id' AND o.id IS DISTINCT FROM _r.cur_id)
        THEN 'APAAR ID ' || (row ->> 'apaar_id') || ' is already on another student.'
      WHEN row ? 'apaar_id' AND EXISTS (SELECT 1 FROM pg_temp._r o WHERE o.row ->> 'apaar_id' = _r.row ->> 'apaar_id' AND o.n < _r.n AND lower(o.admission_no) <> lower(_r.admission_no))
        THEN 'APAAR ID ' || (row ->> 'apaar_id') || ' is also on row ' || (SELECT min(o.n) FROM pg_temp._r o WHERE o.row ->> 'apaar_id' = _r.row ->> 'apaar_id') || ' of this file.'
      WHEN row ? 'aadhaar_hash' AND EXISTS (SELECT 1 FROM public.students o WHERE o.school_id = p_school AND o.aadhaar_hash = _r.row ->> 'aadhaar_hash'
        AND o.status <> 'cancelled' AND o.id IS DISTINCT FROM _r.cur_id)
        THEN 'This Aadhaar number (ending ' || (row ->> 'aadhaar_last4') || ') is already on another student.'
      WHEN row ? 'aadhaar_hash' AND EXISTS (SELECT 1 FROM pg_temp._r o WHERE o.row ->> 'aadhaar_hash' = _r.row ->> 'aadhaar_hash' AND o.n < _r.n AND lower(o.admission_no) <> lower(_r.admission_no))
        THEN 'This Aadhaar number (ending ' || (row ->> 'aadhaar_last4') || ') is also on row '
          || (SELECT min(o.n) FROM pg_temp._r o WHERE o.row ->> 'aadhaar_hash' = _r.row ->> 'aadhaar_hash') || ' of this file.'
    END AS e FROM pg_temp._r) p WHERE e IS NOT NULL;
  SELECT jsonb_build_object('added', count(*) FILTER (WHERE cur_id IS NULL), 'updated', count(*) FILTER (WHERE changed),
    'unchanged', count(*) FILTER (WHERE cur_id IS NOT NULL AND NOT changed), 'problems', v_problems) INTO v_out FROM pg_temp._r;
  IF p_dry OR jsonb_array_length(v_problems) > 0 THEN RETURN v_out; END IF;

  PERFORM set_config('sthara.import_job', p_job::text, true);
  INSERT INTO public.import_changes (job_id, school_id, table_name, row_id, before)
    SELECT p_job, p_school, 'students', s.id, to_jsonb(s) FROM pg_temp._r JOIN public.students s ON s.id = _r.cur_id WHERE _r.changed
    ON CONFLICT (job_id, table_name, row_id) DO NOTHING;
  INSERT INTO public.student_changes (school_id, student_id, field, old_value, new_value, reason, changed_by, changed_by_kind)
    SELECT p_school, r.cur_id, CASE WHEN p.key = 'aadhaar_last4' THEN 'aadhaar' ELSE p.key END,
      left(CASE WHEN p.key = 'aadhaar_last4' THEN 'XXXX XXXX ' || (r.cur ->> p.key) ELSE r.cur ->> p.key END, 400),
      left(CASE WHEN p.key = 'aadhaar_last4' THEN 'XXXX XXXX ' || (p.value #>> '{}') ELSE p.value #>> '{}' END, 400),
      'Bulk import', p_actor, 'import'
    FROM pg_temp._r r, jsonb_each(r.row) p
    WHERE r.changed AND p.key NOT IN ('aadhaar_cipher', 'aadhaar_hash') AND (r.cur -> p.key) IS DISTINCT FROM p.value;
  -- "No Aadhaar" clears any number on file.
  UPDATE pg_temp._r SET row = row || '{"aadhaar_cipher": null, "aadhaar_last4": null, "aadhaar_hash": null}'::jsonb
    WHERE (row ->> 'no_aadhaar')::boolean IS TRUE;
  UPDATE pg_temp._r SET row = row || jsonb_build_object('import_job_id', p_job) WHERE changed;
  -- Each changed row updates the columns it carries (blank cells were dropped and leave what is stored alone).
  FOR v_cols IN SELECT DISTINCT (SELECT string_agg(format('%I', k), ', ' ORDER BY k) FROM jsonb_object_keys(row) k) FROM pg_temp._r WHERE changed LOOP
    EXECUTE format('UPDATE public.students s SET (%s) = (SELECT %s FROM jsonb_populate_record(s, r.row)) FROM pg_temp._r r
      WHERE s.id = r.cur_id AND r.changed AND (SELECT string_agg(format(''%%I'', k), '', '' ORDER BY k) FROM jsonb_object_keys(r.row) k) = $1', v_cols, v_cols)
      USING v_cols;
  END LOOP;
  INSERT INTO public.students SELECT (jsonb_populate_record(NULL::public.students,
      jsonb_build_object('id', gen_random_uuid(), 'school_id', p_school, 'admission_no', trim(r.admission_no), 'status', 'active', 'no_aadhaar', false,
        'rte_seat', false, 'indian_national', true, 'permanent_same', true, 'created_by', p_actor, 'import_job_id', p_job,
        'created_at', now(), 'updated_at', now()) || r.row)).*
    FROM pg_temp._r r WHERE r.cur_id IS NULL;
  PERFORM app.admission_floor(p_school);
  RETURN v_out;
END
```

</details>

### fn import_undo

`import_undo(p_job uuid, p_limit integer DEFAULT 5000)` → `jsonb` · plpgsql · security definer · execute: postgres, service_role

- **Touches:** `import_jobs` select/update, `house_members` delete/select, `import_changes` select/delete, `exam_sheets` select, `family_members` select/update, `fee_payments` select/update, `fee_concession_requests` select, `account_requests` select, `enrolments` select, `emergency_contacts` select, `student_health` select, `health_events` select, `student_documents` select, `certificates` select, `cc_memberships` select, `kirti_entries` select, `discipline_actions` select, `counselling_cases` select, `counselling_referrals` select, `student_change_requests` select, `sibling_links` select, `users` select
- **Calls:** `app.day_closed()`
- **Reached from routes:** `/api/admin/import`, `/api/admin/import/[id]`, `/api/import/worker`, `/api/ops/schools/[id]/import`, `/api/ops/schools/[id]/import/[jobId]`

<details><summary>Source</summary>

```sql
DECLARE
  j public.import_jobs;
  t text;
  v_cols text;
  v_n int;
  v_restored int := 0; v_removed int := 0; v_kept int := 0;
BEGIN
  SELECT * INTO j FROM public.import_jobs WHERE id = p_job FOR UPDATE;
  IF j.id IS NULL OR j.committed_at IS NULL THEN RAISE EXCEPTION 'import % has not been committed', p_job; END IF;
  PERFORM set_config('sthara.import_job', p_job::text, true);

  -- 0. House placements this import opened go first (unless changed since), so the ones it closed can reopen:
  --    a student has one open placement at a time.
  WITH del AS (DELETE FROM public.house_members x WHERE x.import_job_id = p_job AND x.to_date IS NULL AND x.updated_at <= j.committed_at
      AND NOT EXISTS (SELECT 1 FROM public.import_changes i WHERE i.job_id = p_job AND i.table_name = 'house_members' AND i.row_id = x.id)
    RETURNING x.id)
  SELECT count(*) INTO v_n FROM del;
  v_removed := v_removed + v_n;

  -- 1. Overwritten rows: restore the before-image, unless the row changed after the import.
  FOREACH t IN ARRAY ARRAY['attendance', 'exam_marks', 'legacy_results', 'fee_structures', 'fee_invoices', 'admission_applicants', 'students',
    'enrolments', 'family_members', 'student_health', 'emergency_contacts', 'student_documents', 'certificates', 'house_members', 'cc_memberships', 'kirti_entries'] LOOP
    SELECT string_agg(format('%I', attname), ', ' ORDER BY attnum) INTO v_cols FROM pg_attribute
      WHERE attrelid = format('public.%I', t)::regclass AND attnum > 0 AND NOT attisdropped AND attname NOT IN ('id', 'updated_at');
    EXECUTE format($q$
      WITH c AS (SELECT id, row_id, %s AS before FROM public.import_changes i WHERE job_id = $1 AND table_name = %L ORDER BY id LIMIT $2),
      done AS (
        UPDATE public.%I x SET (%s) = (SELECT %s FROM jsonb_populate_record(NULL::public.%I, c.before))
        FROM c WHERE x.id = c.row_id AND x.updated_at <= $3 %s
        RETURNING c.id),
      gone AS (DELETE FROM public.import_changes d USING c WHERE d.id = c.id RETURNING d.id, (d.id IN (SELECT id FROM done)) AS restored)
      SELECT count(*) FILTER (WHERE restored), count(*) FILTER (WHERE NOT restored) FROM gone$q$,
      -- A primary contact the import took over from comes back as primary only after step 2 (one primary per student).
      CASE WHEN t = 'family_members' THEN 'CASE WHEN EXISTS (SELECT 1 FROM public.import_changes m WHERE m.job_id = $1
        AND m.table_name = ''family_primary'' AND m.row_id = i.row_id) THEN i.before || ''{"is_primary": false}'' ELSE i.before END' ELSE 'i.before' END,
      t, t, v_cols, v_cols, t,
      CASE t
        WHEN 'exam_marks' THEN 'AND EXISTS (SELECT 1 FROM public.exam_sheets s WHERE s.id = x.sheet_id AND s.status = ''open'')'
        -- Another open placement since (opened by hand after the import): the closed one stays closed.
        WHEN 'house_members' THEN 'AND NOT ((c.before ->> ''to_date'') IS NULL AND EXISTS (SELECT 1 FROM public.house_members o
          WHERE o.student_id = x.student_id AND o.to_date IS NULL AND o.id <> x.id))'
        -- Someone else made primary since: this member is kept as it is.
        WHEN 'family_members' THEN 'AND NOT ((c.before ->> ''is_primary'')::boolean AND EXISTS (SELECT 1 FROM public.family_members o
          WHERE o.student_id = x.student_id AND o.is_primary AND o.id <> x.id))'
        ELSE '' END)
      INTO v_n, v_kept USING p_job, p_limit, j.committed_at;
    v_restored := v_restored + coalesce(v_n, 0);
    j.kept := j.kept + coalesce(v_kept, 0);
    IF v_n + v_kept >= p_limit THEN
      UPDATE public.import_jobs SET kept = j.kept WHERE id = p_job;
      RETURN jsonb_build_object('done', false, 'restored', v_restored, 'removed', 0);
    END IF;
  END LOOP;

  -- 2. Added rows: remove them (unless changed since, or still referenced), untagging what is kept.
  FOREACH t IN ARRAY ARRAY['attendance', 'exam_marks', 'legacy_results', 'fee_structures', 'health_events', 'student_health', 'student_documents',
    'certificates', 'kirti_entries', 'cc_memberships', 'house_members', 'emergency_contacts', 'family_members', 'enrolments', 'students', 'admission_applicants', 'fee_invoices'] LOOP
    EXECUTE format($q$
      WITH c AS (SELECT id, updated_at FROM public.%I WHERE import_job_id = $1 LIMIT $2),
      keep AS (
        UPDATE public.%I x SET import_job_id = NULL FROM c
        WHERE x.id = c.id AND (c.updated_at > $3 %s)
        RETURNING x.id),
      del AS (DELETE FROM public.%I x USING c WHERE x.id = c.id AND x.id NOT IN (SELECT id FROM keep) RETURNING x.id)
      SELECT (SELECT count(*) FROM del), (SELECT count(*) FROM keep)$q$,
      t, t,
      CASE t
        WHEN 'exam_marks' THEN 'OR NOT EXISTS (SELECT 1 FROM public.exam_sheets s WHERE s.id = x.sheet_id AND s.status = ''open'')'
        -- A receipt (even a voided one) holds its invoice, and a concession request would go with it.
        WHEN 'fee_invoices' THEN 'OR EXISTS (SELECT 1 FROM public.fee_payments p WHERE p.invoice_id = x.id)
          OR EXISTS (SELECT 1 FROM public.fee_concession_requests r WHERE r.invoice_id = x.id)'
        -- An applicant since enrolled, or with a login request, has a life of its own now.
        WHEN 'admission_applicants' THEN 'OR x.student_id IS NOT NULL OR EXISTS (SELECT 1 FROM public.account_requests r WHERE r.applicant_id = x.id)'
        -- A register entry with a login, or with records from anywhere but this import (they would cascade away), stays.
        WHEN 'students' THEN 'OR x.user_id IS NOT NULL
          OR EXISTS (SELECT 1 FROM public.enrolments e WHERE e.student_id = x.id AND e.import_job_id IS DISTINCT FROM $1)
          OR EXISTS (SELECT 1 FROM public.family_members f WHERE f.student_id = x.id AND f.import_job_id IS DISTINCT FROM $1)
          OR EXISTS (SELECT 1 FROM public.emergency_contacts e WHERE e.student_id = x.id AND e.import_job_id IS DISTINCT FROM $1)
          OR EXISTS (SELECT 1 FROM public.student_health h WHERE h.student_id = x.id AND h.import_job_id IS DISTINCT FROM $1)
          OR EXISTS (SELECT 1 FROM public.health_events h WHERE h.student_id = x.id AND h.import_job_id IS DISTINCT FROM $1)
          OR EXISTS (SELECT 1 FROM public.student_documents d WHERE d.student_id = x.id AND d.import_job_id IS DISTINCT FROM $1)
          OR EXISTS (SELECT 1 FROM public.certificates c WHERE c.student_id = x.id AND c.import_job_id IS DISTINCT FROM $1)
          OR EXISTS (SELECT 1 FROM public.house_members h WHERE h.student_id = x.id AND h.import_job_id IS DISTINCT FROM $1)
          OR EXISTS (SELECT 1 FROM public.cc_memberships m WHERE m.student_id = x.id AND m.import_job_id IS DISTINCT FROM $1)
          OR EXISTS (SELECT 1 FROM public.kirti_entries k WHERE k.student_id = x.id AND k.import_job_id IS DISTINCT FROM $1)
          OR EXISTS (SELECT 1 FROM public.discipline_actions a WHERE a.student_id = x.id)
          OR EXISTS (SELECT 1 FROM public.counselling_cases c WHERE c.student_id = x.id)
          OR EXISTS (SELECT 1 FROM public.counselling_referrals r WHERE r.student_id = x.id)
          OR EXISTS (SELECT 1 FROM public.student_change_requests r WHERE r.student_id = x.id)
          OR EXISTS (SELECT 1 FROM public.sibling_links l WHERE (l.a = x.id OR l.b = x.id) AND l.status <> ''suggested'')'
        -- A family member linked to a parent login since stays.
        WHEN 'family_members' THEN 'OR x.user_id IS NOT NULL'
        ELSE '' END,
      t)
      INTO v_n, v_kept USING p_job, p_limit, j.committed_at;
    v_removed := v_removed + coalesce(v_n, 0);
    j.kept := j.kept + coalesce(v_kept, 0);
    IF v_n + v_kept >= p_limit THEN
      UPDATE public.import_jobs SET kept = j.kept WHERE id = p_job;
      RETURN jsonb_build_object('done', false, 'restored', v_restored, 'removed', v_removed);
    END IF;
    -- The primary contacts the import took over from, once the members it added are gone (one primary per student).
    IF t = 'family_members' THEN
      WITH c AS (SELECT id, row_id FROM public.import_changes WHERE job_id = p_job AND table_name = 'family_primary' ORDER BY id LIMIT p_limit),
      done AS (
        UPDATE public.family_members f SET is_primary = true FROM c
        WHERE f.id = c.row_id AND NOT f.is_primary AND f.updated_at <= j.committed_at
          AND NOT EXISTS (SELECT 1 FROM public.family_members o WHERE o.student_id = f.student_id AND o.is_primary)
        RETURNING c.id),
      gone AS (DELETE FROM public.import_changes d USING c WHERE d.id = c.id RETURNING d.id, (d.id IN (SELECT id FROM done)) AS restored)
      SELECT count(*) FILTER (WHERE restored), count(*) FILTER (WHERE NOT restored) INTO v_n, v_kept FROM gone;
      v_restored := v_restored + v_n;
      j.kept := j.kept + v_kept;
      IF v_n + v_kept >= p_limit THEN
        UPDATE public.import_jobs SET kept = j.kept WHERE id = p_job;
        RETURN jsonb_build_object('done', false, 'restored', v_restored, 'removed', v_removed);
      END IF;
      -- Members the import made primary that were kept (changed since) also keep that, so the old primary stays as it is.
    END IF;
    -- Receipts first, so the invoices they belong to can go.
    IF t = 'admission_applicants' THEN
      WITH c AS (SELECT id FROM public.fee_payments WHERE import_job_id = p_job AND voided_at IS NULL LIMIT p_limit),
      kept AS (UPDATE public.fee_payments p SET import_job_id = NULL FROM c WHERE p.id = c.id AND app.day_closed(p.school_id, p.paid_on) RETURNING p.id),
      v AS (UPDATE public.fee_payments p SET voided_at = now(), void_reason = 'import undone',
            voided_by = (SELECT u.id FROM public.users u WHERE u.id = j.undone_by)
            FROM c WHERE p.id = c.id AND p.id NOT IN (SELECT id FROM kept) RETURNING p.id)
      SELECT (SELECT count(*) FROM v), (SELECT count(*) FROM kept) INTO v_n, v_kept;
      v_removed := v_removed + v_n;
      j.kept := j.kept + v_kept;
      IF v_n + v_kept >= p_limit THEN
        UPDATE public.import_jobs SET kept = j.kept WHERE id = p_job;
        RETURN jsonb_build_object('done', false, 'restored', v_restored, 'removed', v_removed);
      END IF;
    END IF;
  END LOOP;

  UPDATE public.import_jobs SET kept = j.kept WHERE id = p_job;
  RETURN jsonb_build_object('done', true, 'restored', v_restored, 'removed', v_removed);
END
```

</details>

### fn log_app_error

`log_app_error(p_fingerprint text, p_source text, p_kind text, p_message text, p_stack text, p_route text, p_method text, p_path text, p_school uuid, p_user uuid, p_user_role text, p_release text, p_environment text, p_user_agent text, p_digest text, p_repeats integer, p_context jsonb)` → `void` · plpgsql · security invoker · execute: postgres, service_role

- **Touches:** `app_error_groups` insert, `app_errors` insert/delete, `schools` select, `users` select

<details><summary>Source</summary>

```sql
DECLARE
  msg text := left(coalesce(nullif(p_message, ''), 'Unknown error'), 2000);
  n integer := greatest(1, least(coalesce(p_repeats, 1), 100000));
BEGIN
  INSERT INTO public.app_error_groups AS g (fingerprint, source, kind, message, route, events, first_seen, last_seen, last_release, last_environment)
  VALUES (p_fingerprint, p_source, p_kind, msg, left(p_route, 300), n, now(), now(), p_release, p_environment)
  ON CONFLICT (fingerprint) DO UPDATE SET
    events = g.events + n,
    last_seen = now(),
    last_release = coalesce(excluded.last_release, g.last_release),
    last_environment = coalesce(excluded.last_environment, g.last_environment),
    regressed_at = CASE WHEN g.status = 'resolved' THEN now() ELSE g.regressed_at END,
    status = CASE WHEN g.status = 'resolved' THEN 'open' ELSE g.status END;
  INSERT INTO public.app_errors (fingerprint, source, kind, message, stack, route, method, path, school_id, user_id, user_role,
                                 release, environment, user_agent, digest, repeats, context)
  VALUES (p_fingerprint, p_source, p_kind, msg, left(p_stack, 8000), left(p_route, 300), left(p_method, 10), left(p_path, 500),
          (SELECT id FROM public.schools WHERE id = p_school), (SELECT id FROM public.users WHERE id = p_user), left(p_user_role, 40),
          left(p_release, 80), left(p_environment, 40), left(p_user_agent, 400), left(p_digest, 120), n, coalesce(p_context, '{}'::jsonb));
  IF random() < 0.02 THEN
    DELETE FROM public.app_errors WHERE at < now() - interval '30 days';
  END IF;
END
```

</details>

### fn ops_ai_usage

`ops_ai_usage(p_from timestamp with time zone, p_to timestamp with time zone)` → `jsonb` · sql · security invoker · execute: postgres, service_role

- **Touches:** `ai_usage` select, `schools` select, `users` select
- **Reached from routes:** `/api/ops/overview`, `/api/ops/usage`

<details><summary>Source</summary>

```sql
WITH u AS (
    SELECT *, input_tokens + output_tokens + thinking_tokens AS tokens
    FROM public.ai_usage WHERE at >= p_from AND at < p_to
  )
  SELECT jsonb_build_object(
    'totals', (SELECT jsonb_build_object(
        'calls', count(*), 'failed', count(*) FILTER (WHERE NOT ok),
        'input', coalesce(sum(input_tokens), 0), 'output', coalesce(sum(output_tokens), 0),
        'thinking', coalesce(sum(thinking_tokens), 0), 'cached', coalesce(sum(cached_tokens), 0),
        'tokens', coalesce(sum(tokens), 0), 'cost', coalesce(sum(cost_usd), 0),
        'unpriced', count(*) FILTER (WHERE cost_usd IS NULL AND ok),
        'avgLatency', round(avg(latency_ms) FILTER (WHERE ok)),
        'users', count(DISTINCT user_id), 'schools', count(DISTINCT school_id)) FROM u),
    'daily', coalesce((SELECT jsonb_agg(d ORDER BY d->>'day') FROM (
        SELECT jsonb_build_object('day', (at AT TIME ZONE 'Asia/Kolkata')::date, 'calls', count(*),
          'tokens', sum(tokens), 'cost', coalesce(sum(cost_usd), 0)) d
        FROM u GROUP BY (at AT TIME ZONE 'Asia/Kolkata')::date) x), '[]'::jsonb),
    'features', coalesce((SELECT jsonb_agg(f ORDER BY (f->>'cost')::numeric DESC, (f->>'tokens')::bigint DESC) FROM (
        SELECT jsonb_build_object('key', feature, 'calls', count(*), 'failed', count(*) FILTER (WHERE NOT ok),
          'input', sum(input_tokens), 'output', sum(output_tokens) + sum(thinking_tokens),
          'tokens', sum(tokens), 'cost', coalesce(sum(cost_usd), 0), 'avgLatency', round(avg(latency_ms) FILTER (WHERE ok))) f
        FROM u GROUP BY feature) x), '[]'::jsonb),
    'schools', coalesce((SELECT jsonb_agg(s ORDER BY (s->>'cost')::numeric DESC) FROM (
        SELECT jsonb_build_object('id', u.school_id, 'name', coalesce(sc.name, CASE WHEN u.school_id IS NULL THEN 'No school (operators)' ELSE 'Deleted school' END),
          'calls', count(*), 'users', count(DISTINCT u.user_id), 'tokens', sum(u.tokens), 'cost', coalesce(sum(u.cost_usd), 0)) s
        FROM u LEFT JOIN public.schools sc ON sc.id = u.school_id GROUP BY u.school_id, sc.name) x), '[]'::jsonb),
    'models', coalesce((SELECT jsonb_agg(m ORDER BY (m->>'cost')::numeric DESC) FROM (
        SELECT jsonb_build_object('model', model, 'calls', count(*), 'input', sum(input_tokens), 'cached', sum(cached_tokens),
          'output', sum(output_tokens), 'thinking', sum(thinking_tokens), 'cost', coalesce(sum(cost_usd), 0)) m
        FROM u GROUP BY model) x), '[]'::jsonb),
    'users', coalesce((SELECT jsonb_agg(p ORDER BY (p->>'cost')::numeric DESC) FROM (
        SELECT jsonb_build_object('id', u.user_id, 'name', coalesce(us.name, us.email, 'Deleted user'), 'role', us.role,
          'school', sc.name, 'calls', count(*), 'tokens', sum(u.tokens), 'cost', coalesce(sum(u.cost_usd), 0)) p
        FROM u LEFT JOIN public.users us ON us.id = u.user_id LEFT JOIN public.schools sc ON sc.id = u.school_id
        WHERE u.user_id IS NOT NULL GROUP BY u.user_id, us.name, us.email, us.role, sc.name
        ORDER BY coalesce(sum(u.cost_usd), 0) DESC LIMIT 25) x), '[]'::jsonb),
    'recent', coalesce((SELECT jsonb_agg(r ORDER BY r->>'at' DESC) FROM (
        SELECT jsonb_build_object('id', u.id, 'at', u.at, 'feature', u.feature, 'model', u.model, 'school', sc.name,
          'user', coalesce(us.name, us.email), 'input', u.input_tokens, 'output', u.output_tokens + u.thinking_tokens,
          'cost', u.cost_usd, 'ok', u.ok, 'latency', u.latency_ms, 'error', u.error) r
        FROM u LEFT JOIN public.users us ON us.id = u.user_id LEFT JOIN public.schools sc ON sc.id = u.school_id
        ORDER BY u.at DESC LIMIT 50) x), '[]'::jsonb)
  );
```

</details>

### fn ops_delete_account

`ops_delete_account(p_school uuid, p_user uuid, p_reason text, p_actor uuid, p_actor_email text)` → `void` · plpgsql · security invoker · execute: postgres, service_role

- **Touches:** `users` select/delete, `fee_invoices` select, `fee_payments` select, `role_grants` select, `settings_changes` insert
- **Reached from routes:** `/api/ops/schools/[id]/people/[userId]`

<details><summary>Source</summary>

```sql
DECLARE
  v_user public.users%ROWTYPE;
BEGIN
  SELECT * INTO v_user FROM public.users WHERE id = p_user AND school_id = p_school FOR UPDATE;
  IF NOT FOUND OR v_user.role = 'superadmin' THEN
    RAISE EXCEPTION 'Account not found in this school' USING ERRCODE = 'P0002';
  END IF;
  IF EXISTS (SELECT 1 FROM public.fee_invoices WHERE student_id = p_user)
     OR EXISTS (SELECT 1 FROM public.fee_payments WHERE student_id = p_user) THEN
    RAISE EXCEPTION 'This student has fee records, which are kept as financial records, so the account can''t be deleted.'
      USING ERRCODE = 'P0001', HINT = 'has_fee_records';
  END IF;
  IF EXISTS (SELECT 1 FROM public.role_grants g WHERE g.user_id = p_user AND g.school_id = p_school AND g.role_key = 'school_admin'
               AND g.revoked_at IS NULL AND (g.expires_on IS NULL OR g.expires_on >= current_date))
     AND NOT EXISTS (SELECT 1 FROM public.role_grants g WHERE g.user_id <> p_user AND g.school_id = p_school AND g.role_key = 'school_admin'
               AND g.revoked_at IS NULL AND (g.expires_on IS NULL OR g.expires_on >= current_date)) THEN
    RAISE EXCEPTION 'This is the school''s only school admin. Give another admin that role first.'
      USING ERRCODE = 'P0001', HINT = 'last_admin';
  END IF;
  INSERT INTO public.settings_changes (actor_id, actor_email, scope, school_id, key, old_value, new_value, reason)
  VALUES (p_actor, p_actor_email, 'school', p_school, 'account.deleted',
    jsonb_build_object('id', v_user.id, 'name', v_user.name, 'email', v_user.email, 'role', v_user.role),
    NULL, p_reason);
  DELETE FROM public.users WHERE id = p_user;
END
```

</details>

### fn ops_delete_school

`ops_delete_school(p_school uuid, p_reason text, p_actor uuid, p_actor_email text)` → `uuid[]` · plpgsql · security invoker · execute: postgres, service_role

- **Touches:** `schools` select/delete, `fee_payments` select, `fee_invoices` select, `users` select/delete, `settings_changes` insert
- **Reached from routes:** `/api/ops/schools/[id]`

<details><summary>Source</summary>

```sql
DECLARE
  v_school public.schools%ROWTYPE;
  v_users uuid[];
BEGIN
  SELECT * INTO v_school FROM public.schools WHERE id = p_school FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'School not found' USING ERRCODE = 'P0002';
  END IF;
  IF EXISTS (SELECT 1 FROM public.fee_payments WHERE school_id = p_school)
     OR EXISTS (SELECT 1 FROM public.fee_invoices WHERE school_id = p_school) THEN
    RAISE EXCEPTION 'This school has fee records, which are kept as financial records. Suspend it instead of deleting it.'
      USING ERRCODE = 'P0001', HINT = 'has_fee_records';
  END IF;
  SELECT coalesce(array_agg(id), '{}') INTO v_users FROM public.users WHERE school_id = p_school AND role <> 'superadmin';

  INSERT INTO public.settings_changes (actor_id, actor_email, scope, school_id, key, old_value, new_value, reason)
  VALUES (p_actor, p_actor_email, 'platform', NULL, 'school.deleted',
    jsonb_build_object('id', v_school.id, 'name', v_school.name, 'code', v_school.settings->>'code',
      'plan', v_school.settings->>'plan', 'accounts', cardinality(v_users), 'created_at', v_school.created_at),
    NULL, p_reason);

  DELETE FROM public.users WHERE id = ANY (v_users);
  DELETE FROM public.schools WHERE id = p_school;
  RETURN v_users;
END
```

</details>

### fn ops_error_stats

`ops_error_stats(p_fingerprints text[], p_since timestamp with time zone)` → `jsonb` · sql · security invoker · execute: postgres, service_role

- **Touches:** `app_errors` select
- **Reached from routes:** `/api/ops/errors`, `/api/ops/overview`

<details><summary>Source</summary>

```sql
WITH e AS (
    SELECT fingerprint, at, repeats, school_id, user_id
    FROM public.app_errors
    WHERE fingerprint = ANY (p_fingerprints) AND at >= least(p_since, now() - interval '24 hours')
  )
  SELECT jsonb_build_object(
    'groups', coalesce((
      SELECT jsonb_object_agg(fp, jsonb_build_object(
        'inRange', (SELECT coalesce(sum(repeats), 0) FROM e WHERE e.fingerprint = fp AND e.at >= p_since),
        'schools', (SELECT count(DISTINCT school_id) FROM e WHERE e.fingerprint = fp AND e.at >= p_since),
        'users',   (SELECT count(DISTINCT user_id) FROM e WHERE e.fingerprint = fp AND e.at >= p_since),
        'hours',   (SELECT jsonb_agg(coalesce(b.n, 0) ORDER BY h)
                    FROM generate_series(0, 23) AS h
                    LEFT JOIN (SELECT 23 - floor(extract(epoch FROM now() - e.at) / 3600)::int AS slot, sum(e.repeats) AS n
                               FROM e WHERE e.fingerprint = fp GROUP BY 1) b ON b.slot = h)))
      FROM unnest(p_fingerprints) AS fp), '{}'::jsonb),
    'schools', (SELECT count(DISTINCT school_id) FROM e WHERE e.at >= p_since)
  );
```

</details>

### fn ops_inspect_find

`ops_inspect_find(p_school uuid, p_id uuid)` → `text[]` · plpgsql · security definer · execute: postgres, service_role

- **Calls:** `app.ops_inspectable()`
- **Reached from routes:** `/api/ops/schools/[id]/inspect`

<details><summary>Source</summary>

```sql
DECLARE
  t text;
  hit boolean;
  out text[] := '{}';
BEGIN
  FOREACH t IN ARRAY app.ops_inspectable() LOOP
    CONTINUE WHEN to_regclass('public.' || quote_ident(t)) IS NULL;
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I WHERE id = $1 AND school_id = $2)', t) INTO hit USING p_id, p_school;
    IF hit THEN out := out || t; END IF;
  END LOOP;
  RETURN out;
END
```

</details>

### fn ops_inspect_list

`ops_inspect_list(p_school uuid, p_table text, p_column text DEFAULT NULL::text, p_value uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 50)` → `jsonb` · plpgsql · security definer · execute: postgres, service_role

- **Calls:** `app.ops_inspectable()`
- **Reached from routes:** `/api/ops/schools/[id]/inspect`

<details><summary>Source</summary>

```sql
DECLARE
  v_out jsonb;
  v_order text;
  v_where text := 'x.school_id = $1';
BEGIN
  IF NOT (p_table = ANY (app.ops_inspectable())) THEN RAISE EXCEPTION 'Table % cannot be inspected', p_table USING ERRCODE = '42501'; END IF;
  IF p_column IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = p_table AND column_name = p_column AND data_type = 'uuid') THEN
      RAISE EXCEPTION 'Column % cannot be filtered on', p_column USING ERRCODE = '42703';
    END IF;
    v_where := v_where || format(' AND x.%I = $2', p_column);
  END IF;
  SELECT CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = p_table AND column_name = 'created_at')
              THEN 'x.created_at DESC NULLS LAST, x.id' ELSE 'x.id' END INTO v_order;
  EXECUTE format('SELECT coalesce(jsonb_agg(to_jsonb(y)), ''[]''::jsonb) FROM (SELECT x.* FROM public.%I x WHERE %s ORDER BY %s LIMIT %s) y',
                 p_table, v_where, v_order, greatest(1, least(coalesce(p_limit, 50), 100)))
    INTO v_out USING p_school, p_value;
  RETURN v_out;
END
```

</details>

### fn ops_inspect_meta

`ops_inspect_meta()` → `jsonb` · sql · security definer · execute: postgres, service_role

- **Calls:** `app.ops_inspect_links()`, `app.ops_inspectable()`
- **Reached from routes:** `/api/ops/schools/[id]/inspect`

<details><summary>Source</summary>

```sql
SELECT coalesce(jsonb_agg(jsonb_build_object(
    'table', t,
    'columns', (SELECT jsonb_agg(jsonb_build_object('name', column_name, 'type', data_type) ORDER BY ordinal_position)
                  FROM information_schema.columns WHERE table_schema = 'public' AND table_name = t),
    'refs', (SELECT coalesce(jsonb_agg(jsonb_build_object('column', l.col, 'table', l.parent)), '[]'::jsonb) FROM app.ops_inspect_links() l WHERE l.child = t),
    'children', (SELECT coalesce(jsonb_agg(jsonb_build_object('table', l.child, 'column', l.col)), '[]'::jsonb) FROM app.ops_inspect_links() l WHERE l.parent = t)
  ) ORDER BY t), '[]'::jsonb)
  FROM unnest(app.ops_inspectable()) t WHERE to_regclass('public.' || quote_ident(t)) IS NOT NULL
```

</details>

### fn ops_inspect_row

`ops_inspect_row(p_school uuid, p_table text, p_id uuid)` → `jsonb` · plpgsql · security definer · execute: postgres, service_role

- **Calls:** `app.ops_inspectable()`, `app.ops_inspect_links()`
- **Reached from routes:** `/api/ops/schools/[id]/inspect`

<details><summary>Source</summary>

```sql
DECLARE
  v_row jsonb;
  v_children jsonb := '[]'::jsonb;
  v_n bigint;
  l record;
BEGIN
  IF NOT (p_table = ANY (app.ops_inspectable())) THEN RAISE EXCEPTION 'Table % cannot be inspected', p_table USING ERRCODE = '42501'; END IF;
  EXECUTE format('SELECT to_jsonb(x) FROM public.%I x WHERE x.id = $1 AND x.school_id = $2', p_table) INTO v_row USING p_id, p_school;
  IF v_row IS NULL THEN RETURN NULL; END IF;
  FOR l IN SELECT child, col FROM app.ops_inspect_links() WHERE parent = p_table ORDER BY child, col LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE %I = $1 AND school_id = $2', l.child, l.col) INTO v_n USING p_id, p_school;
    v_children := v_children || jsonb_build_object('table', l.child, 'column', l.col, 'count', v_n);
  END LOOP;
  RETURN jsonb_build_object('row', v_row, 'children', v_children);
END
```

</details>

### fn ops_jobs

`ops_jobs()` → `jsonb` · plpgsql · security definer · execute: postgres, service_role

- **Reached from routes:** `/api/ops/delivery`

<details><summary>Source</summary>

```sql
DECLARE out jsonb;
BEGIN
  IF to_regclass('cron.job') IS NULL THEN RETURN '[]'::jsonb; END IF;
  EXECUTE $q$
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', j.jobid, 'name', j.jobname, 'schedule', j.schedule, 'active', j.active, 'command', left(j.command, 200),
      'runs', (SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.started DESC), '[]'::jsonb) FROM (
                 SELECT d.status, d.start_time AS started, d.end_time AS ended, left(d.return_message, 300) AS message
                   FROM cron.job_run_details d WHERE d.jobid = j.jobid ORDER BY d.start_time DESC LIMIT 20) r)
    ) ORDER BY j.jobname), '[]'::jsonb) FROM cron.job j
  $q$ INTO out;
  RETURN out;
END
```

</details>

### fn ops_login_check

`ops_login_check(p_school uuid, p_email text)` → `jsonb` · sql · security definer · execute: postgres, service_role

- **Touches:** `users` select
- **Reached from routes:** `/api/ops/schools/[id]/controls`

<details><summary>Source</summary>

```sql
SELECT jsonb_build_object(
    'id', u.id, 'role', u.role,
    'hasLogin', a.id IS NOT NULL,
    'confirmed', a.email_confirmed_at IS NOT NULL,
    'bannedUntil', CASE WHEN a.banned_until > now() THEN a.banned_until END,
    'lastSignIn', a.last_sign_in_at,
    'createdAt', coalesce(a.created_at, u.created_at),
    'left', coalesce((u.metadata ->> 'left')::boolean, false),
    'tempPassword', coalesce((u.metadata ->> 'mustChangePassword')::boolean, false),
    'emailMatches', lower(coalesce(a.email, '')) = lower(coalesce(u.email, '')),
    'hasPassword', coalesce(a.encrypted_password, '') <> '',
    'twoFactor', EXISTS (SELECT 1 FROM auth.mfa_factors f WHERE f.user_id = u.id AND f.status = 'verified')
  )
  FROM public.users u LEFT JOIN auth.users a ON a.id = u.id
  WHERE u.school_id = p_school AND lower(u.email) = lower(trim(p_email))
  LIMIT 1
```

</details>

### fn ops_migrations

`ops_migrations()` → `jsonb` · plpgsql · security definer · execute: postgres, service_role

- **Reached from routes:** `/api/ops/delivery`

<details><summary>Source</summary>

```sql
DECLARE out jsonb;
BEGIN
  IF to_regclass('supabase_migrations.schema_migrations') IS NULL THEN RETURN '[]'::jsonb; END IF;
  EXECUTE $q$
    SELECT coalesce(jsonb_agg(jsonb_build_object('version', version, 'name', name) ORDER BY version DESC), '[]'::jsonb)
      FROM (SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 25) m
  $q$ INTO out;
  RETURN out;
END
```

</details>

### fn ops_norm_class

`ops_norm_class(c text)` → `text` · sql · security invoker · execute: anon, authenticated, postgres, service_role

- **Reached from routes:** `/api/ops/overview`, `/api/ops/schools`, `/api/ops/schools/[id]`, `/api/ops/schools/[id]/controls`
- **Called by SQL:** `ops_school_diagnostics()`, `ops_school_metrics()`

<details><summary>Source</summary>

```sql
SELECT regexp_replace(lower(coalesce(c, '')), 'class|[^a-z0-9]', '', 'g')
```

</details>

### fn ops_platform_health

`ops_platform_health()` → `jsonb` · sql · security definer · execute: postgres, service_role

- **Touches:** `users` select, `superadmins` select, `audit_log` select
- **Reached from routes:** `/api/ops/health`, `/api/ops/overview`

<details><summary>Source</summary>

```sql
SELECT jsonb_build_object(
    'server_version', current_setting('server_version'),
    'rls_off', coalesce((
      SELECT jsonb_agg(c.relname ORDER BY c.relname)
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity), '[]'::jsonb),
    'tables', (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
               WHERE n.nspname = 'public' AND c.relkind = 'r'),
    'anon_writable', coalesce((
      SELECT jsonb_agg(DISTINCT table_name ORDER BY table_name)
      FROM information_schema.role_table_grants
      WHERE table_schema = 'public' AND grantee = 'anon' AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE')), '[]'::jsonb),
    'migrations', coalesce((
      SELECT jsonb_agg(jsonb_build_object('version', version, 'name', name) ORDER BY version)
      FROM supabase_migrations.schema_migrations), '[]'::jsonb),
    'operators', (SELECT count(DISTINCT id) FROM (
        SELECT id FROM public.users WHERE role = 'superadmin'
        UNION SELECT user_id FROM public.superadmins) o),
    'audit_7d', (SELECT count(*) FROM public.audit_log WHERE at > now() - interval '7 days'),
    'audit_last', (SELECT max(at) FROM public.audit_log),
    'db_bytes', pg_database_size(current_database())
  );
```

</details>

### fn ops_registry_counts

`ops_registry_counts(p_school uuid DEFAULT NULL::uuid)` → `TABLE(school_id uuid, counts jsonb)` · sql · security definer · execute: postgres, service_role

- **Touches:** `schools` select, `users` select, `classes` select, `ops_cases` select, `ops_tasks` select, `ops_activities` select, `ops_contacts` select
- **Reached from routes:** `/api/ops/health`, `/api/ops/overview`, `/api/ops/schools`, `/api/ops/schools/[id]`

<details><summary>Source</summary>

```sql
WITH s AS (SELECT id FROM public.schools WHERE p_school IS NULL OR id = p_school),
  people AS (
    SELECT u.school_id, u.role, count(*) AS n, max(a.last_sign_in_at) AS last_sign_in
      FROM public.users u LEFT JOIN auth.users a ON a.id = u.id
     WHERE u.school_id IN (SELECT id FROM s) GROUP BY u.school_id, u.role
  ),
  roles AS (SELECT school_id, jsonb_object_agg(role, n) AS roles, sum(n)::int AS people, max(last_sign_in) AS last_sign_in FROM people GROUP BY school_id),
  cls AS (
    SELECT c.school_id, count(*)::int AS classes,
           count(*) FILTER (WHERE jsonb_typeof(c.metadata -> 'subjects') IS DISTINCT FROM 'array' OR jsonb_array_length(c.metadata -> 'subjects') = 0)::int AS empty
      FROM public.classes c WHERE c.school_id IN (SELECT id FROM s) GROUP BY c.school_id
  ),
  cases AS (
    SELECT c.school_id, count(*)::int AS open,
           count(*) FILTER (WHERE (c.first_responded_at IS NULL AND now() > c.first_response_due) OR now() > c.resolve_due)::int AS late,
           count(*) FILTER (WHERE c.owner_id IS NULL)::int AS unassigned
      FROM public.ops_cases c WHERE c.status NOT IN ('resolved', 'closed') AND c.school_id IN (SELECT id FROM s) GROUP BY c.school_id
  ),
  tasks AS (
    SELECT t.school_id, count(*)::int AS open, count(*) FILTER (WHERE t.due_on < (now() AT TIME ZONE 'Asia/Kolkata')::date)::int AS overdue
      FROM public.ops_tasks t WHERE t.status = 'open' AND t.school_id IN (SELECT id FROM s) GROUP BY t.school_id
  ),
  acts AS (SELECT a.school_id, max(a.happened_at) AS last FROM public.ops_activities a WHERE a.school_id IN (SELECT id FROM s) GROUP BY a.school_id),
  prim AS (SELECT DISTINCT ON (c.school_id) c.school_id, c.name, c.phone, c.email FROM public.ops_contacts c
            WHERE c.active AND c.school_id IN (SELECT id FROM s) ORDER BY c.school_id, c.is_primary DESC, c.decides DESC, c.created_at)
  SELECT s.id, jsonb_build_object(
    'roles', coalesce(r.roles, '{}'::jsonb), 'people', coalesce(r.people, 0), 'lastSignIn', r.last_sign_in,
    'classes', coalesce(cls.classes, 0), 'classesWithoutSubjects', coalesce(cls.empty, 0),
    'openCases', coalesce(cases.open, 0), 'lateCases', coalesce(cases.late, 0), 'unassignedCases', coalesce(cases.unassigned, 0),
    'openTasks', coalesce(tasks.open, 0), 'overdueTasks', coalesce(tasks.overdue, 0),
    'lastActivity', acts.last,
    'contact', CASE WHEN prim.name IS NULL THEN NULL ELSE jsonb_build_object('name', prim.name, 'phone', prim.phone, 'email', prim.email) END
  )
  FROM s
  LEFT JOIN roles r ON r.school_id = s.id
  LEFT JOIN cls ON cls.school_id = s.id
  LEFT JOIN cases ON cases.school_id = s.id
  LEFT JOIN tasks ON tasks.school_id = s.id
  LEFT JOIN acts ON acts.school_id = s.id
  LEFT JOIN prim ON prim.school_id = s.id
```

</details>

### fn ops_rename_class_subject

`ops_rename_class_subject(p_school uuid, p_class text, p_from text, p_to text)` → `jsonb` · plpgsql · security definer · execute: postgres, service_role

- **Touches:** `course_plans` update/select, `syllabus_progress` update/select, `sched_requirements` update/select, `syllabus` update/select, `lesson_plans` update, `assignments` update, `materials` update, `cover_assignments` update, `visit_sessions` update, `situations` update, `tml_scores` update, `users` select, `tutor_sessions` update, `school_threads` update
- **Calls:** `app.norm_class()`, `app.relabel_timetable_subject()`
- **Reached from routes:** `/api/admin/users/assignments`, `/api/ops/requests`, `/api/ops/schools/[id]/classes`, `/api/ops/schools/[id]/people`, `/api/ops/schools/[id]/people/[userId]`, `/api/ops/schools/[id]/subjects`

<details><summary>Source</summary>

```sql
DECLARE
  k text := app.norm_class(p_class);
  f text := lower(trim(p_from));
  out jsonb := '{}'::jsonb;
  n int;
  skipped int := 0;
BEGIN
  IF p_school IS NULL OR k = '' OR f = '' OR coalesce(trim(p_to), '') = '' OR f = lower(trim(p_to)) THEN
    RETURN out;
  END IF;
  UPDATE public.course_plans x SET subject = p_to
   WHERE x.school_id = p_school AND app.norm_class(x.class) = k AND lower(x.subject) = f
     AND NOT EXISTS (SELECT 1 FROM public.course_plans y WHERE y.school_id = x.school_id AND y.class = x.class AND y.subject = p_to AND y.session = x.session);
  GET DIAGNOSTICS n = ROW_COUNT; out := out || jsonb_build_object('course_plans', n);
  skipped := skipped + (SELECT count(*) FROM public.course_plans x WHERE x.school_id = p_school AND app.norm_class(x.class) = k AND lower(x.subject) = f);
  UPDATE public.syllabus_progress x SET subject = p_to
   WHERE x.school_id = p_school AND app.norm_class(x.class) = k AND lower(x.subject) = f
     AND NOT EXISTS (SELECT 1 FROM public.syllabus_progress y WHERE y.school_id = x.school_id AND y.class = x.class AND y.subject = p_to
                     AND y.session = x.session AND y.chapter_key = x.chapter_key AND y.topic IS NOT DISTINCT FROM x.topic);
  GET DIAGNOSTICS n = ROW_COUNT; out := out || jsonb_build_object('syllabus_progress', n);
  skipped := skipped + (SELECT count(*) FROM public.syllabus_progress x WHERE x.school_id = p_school AND app.norm_class(x.class) = k AND lower(x.subject) = f);
  UPDATE public.sched_requirements x SET subject = p_to
   WHERE x.school_id = p_school AND app.norm_class(x.class) = k AND lower(x.subject) = f
     AND NOT EXISTS (SELECT 1 FROM public.sched_requirements y WHERE y.school_id = x.school_id AND y.session = x.session AND y.class_key = x.class_key
                     AND lower(y.subject) = lower(p_to) AND y.group_label IS NOT DISTINCT FROM x.group_label);
  GET DIAGNOSTICS n = ROW_COUNT; out := out || jsonb_build_object('sched_requirements', n);
  skipped := skipped + (SELECT count(*) FROM public.sched_requirements x WHERE x.school_id = p_school AND app.norm_class(x.class) = k AND lower(x.subject) = f);
  UPDATE public.syllabus x SET subject = p_to
   WHERE x.school_id = p_school AND app.norm_class(x.class) = k AND lower(x.subject) = f
     AND NOT EXISTS (SELECT 1 FROM public.syllabus y WHERE y.teacher_id = x.teacher_id AND y.topic = x.topic AND y.month IS NOT DISTINCT FROM x.month AND y.subject = p_to);
  GET DIAGNOSTICS n = ROW_COUNT; out := out || jsonb_build_object('syllabus', n);
  UPDATE public.lesson_plans SET subject = p_to WHERE school_id = p_school AND app.norm_class(class) = k AND lower(subject) = f;
  GET DIAGNOSTICS n = ROW_COUNT; out := out || jsonb_build_object('lesson_plans', n);
  UPDATE public.assignments SET subject = p_to WHERE school_id = p_school AND app.norm_class(class) = k AND lower(subject) = f;
  GET DIAGNOSTICS n = ROW_COUNT; out := out || jsonb_build_object('assignments', n);
  UPDATE public.materials SET subject = p_to WHERE school_id = p_school AND app.norm_class(class) = k AND lower(subject) = f;
  GET DIAGNOSTICS n = ROW_COUNT; out := out || jsonb_build_object('materials', n);
  n := app.relabel_timetable_subject(p_school, k, f, p_to);
  out := out || jsonb_build_object('timetable_slots', n);
  UPDATE public.cover_assignments SET subject = p_to WHERE school_id = p_school AND app.norm_class(class) = k AND lower(subject) = f;
  GET DIAGNOSTICS n = ROW_COUNT; out := out || jsonb_build_object('cover_assignments', n);
  UPDATE public.visit_sessions SET subject = p_to WHERE school_id = p_school AND app.norm_class(class) = k AND lower(subject) = f;
  GET DIAGNOSTICS n = ROW_COUNT; out := out || jsonb_build_object('visit_sessions', n);
  UPDATE public.situations SET subject = p_to WHERE school_id = p_school AND app.norm_class(class_name) = k AND lower(subject) = f;
  GET DIAGNOSTICS n = ROW_COUNT; out := out || jsonb_build_object('situations', n);
  UPDATE public.tml_scores t SET subject = p_to FROM public.users u
   WHERE u.id = t.student_id AND u.school_id = p_school AND u.role = 'student' AND app.norm_class(u.student_class) = k AND lower(t.subject) = f;
  GET DIAGNOSTICS n = ROW_COUNT; out := out || jsonb_build_object('tml_scores', n);
  UPDATE public.tutor_sessions t SET subject = p_to FROM public.users u
   WHERE u.id = t.student_id AND u.school_id = p_school AND u.role = 'student' AND app.norm_class(u.student_class) = k AND lower(t.subject) = f;
  GET DIAGNOSTICS n = ROW_COUNT; out := out || jsonb_build_object('tutor_sessions', n);
  UPDATE public.school_threads t SET subject = p_to FROM public.users u
   WHERE u.id = t.student_id AND u.school_id = p_school AND u.role = 'student' AND app.norm_class(u.student_class) = k AND lower(t.subject) = f;
  GET DIAGNOSTICS n = ROW_COUNT; out := out || jsonb_build_object('school_threads', n);
  RETURN out || jsonb_build_object('skipped', skipped);
END
```

</details>

### fn ops_request_stats

`ops_request_stats(p_since timestamp with time zone, p_school uuid DEFAULT NULL::uuid)` → `jsonb` · sql · security definer · execute: postgres, service_role

- **Touches:** `request_log` select
- **Reached from routes:** `/api/ops/traffic`

<details><summary>Source</summary>

```sql
SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.n DESC), '[]'::jsonb) FROM (
    SELECT method, route, count(*) AS n,
           round(percentile_cont(0.5) WITHIN GROUP (ORDER BY duration_ms))::int AS p50,
           round(percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms))::int AS p95,
           max(duration_ms) AS max, count(DISTINCT user_id) AS users
      FROM public.request_log
     WHERE at >= p_since AND (p_school IS NULL OR school_id = p_school)
     GROUP BY method, route
     ORDER BY count(*) DESC
     LIMIT 200
  ) x
```

</details>

### fn ops_resync_teacher

`ops_resync_teacher(p_teacher uuid)` → `void` · sql · security definer · execute: postgres, service_role

- **Calls:** `app.sync_teacher_assignments()`
- **Reached from routes:** `/api/admin/users/assignments`, `/api/ops/requests`, `/api/ops/schools/[id]/people`, `/api/ops/schools/[id]/people/[userId]`, `/api/ops/schools/[id]/subjects`

<details><summary>Source</summary>

```sql
SELECT app.sync_teacher_assignments(p_teacher)
```

</details>

### fn ops_school_ai

`ops_school_ai(p_school uuid, p_since timestamp with time zone)` → `jsonb` · sql · security definer · execute: postgres, service_role

- **Touches:** `ai_usage` select
- **Reached from routes:** `/api/ops/schools/[id]`

<details><summary>Source</summary>

```sql
SELECT jsonb_build_object(
    'calls', count(*), 'failed', count(*) FILTER (WHERE NOT ok),
    'tokens', coalesce(sum(input_tokens + output_tokens + thinking_tokens), 0),
    'costUsd', coalesce(sum(cost_usd), 0))
  FROM public.ai_usage WHERE school_id = p_school AND at >= p_since
```

</details>

### fn ops_school_diagnostics

`ops_school_diagnostics(p_school uuid)` → `jsonb` · sql · security definer · execute: postgres, service_role

- **Touches:** `users` select, `classes` select, `guardians` select
- **Calls:** `ops_norm_class()`
- **Reached from routes:** `/api/ops/schools/[id]/controls`

<details><summary>Source</summary>

```sql
WITH people AS (
    SELECT u.id, u.role, u.name, u.email, u.student_class, u.teacher_class, u.custom_student_id, u.assignments, u.metadata,
           a.last_sign_in_at, a.banned_until, a.email_confirmed_at, (a.id IS NULL) AS no_login
      FROM public.users u LEFT JOIN auth.users a ON a.id = u.id
     WHERE u.school_id = p_school
  ),
  flagged AS (
    SELECT p.*, coalesce((p.metadata ->> 'left')::boolean, false) AS has_left,
           (p.banned_until IS NOT NULL AND p.banned_until > now()) AS banned
      FROM people p
  ),
  logins AS (
    SELECT role,
           count(*) AS total,
           count(*) FILTER (WHERE has_left) AS left_school,
           count(*) FILTER (WHERE NOT has_left AND last_sign_in_at IS NULL) AS never,
           count(*) FILTER (WHERE NOT has_left AND last_sign_in_at >= now() - interval '7 days') AS week,
           count(*) FILTER (WHERE NOT has_left AND last_sign_in_at >= now() - interval '30 days') AS month,
           count(*) FILTER (WHERE NOT has_left AND banned) AS banned,
           count(*) FILTER (WHERE NOT has_left AND coalesce((metadata ->> 'mustChangePassword')::boolean, false)) AS temp_password,
           count(*) FILTER (WHERE no_login) AS no_login
      FROM flagged GROUP BY role
  ),
  stuck AS (
    SELECT id, role, name, email,
           CASE WHEN no_login THEN 'no_login' WHEN banned THEN 'banned' ELSE 'never' END AS state
      FROM flagged
     WHERE role IN ('admin', 'teacher') AND NOT has_left AND (no_login OR banned OR last_sign_in_at IS NULL)
     ORDER BY role, name LIMIT 50
  ),
  active AS (SELECT * FROM flagged WHERE NOT has_left),
  class_names AS (SELECT public.ops_norm_class(name) AS n FROM public.classes WHERE school_id = p_school),
  checks AS (
    SELECT 'students_no_class' AS key, 'users' AS tbl, array_agg(id) AS ids FROM active WHERE role = 'student' AND coalesce(student_class, '') = ''
    UNION ALL
    SELECT 'students_unknown_class', 'users', array_agg(id) FROM active
     WHERE role = 'student' AND coalesce(student_class, '') <> '' AND public.ops_norm_class(student_class) NOT IN (SELECT n FROM class_names)
    UNION ALL
    SELECT 'teachers_teach_nothing', 'users', array_agg(id) FROM active
     WHERE role = 'teacher' AND coalesce(teacher_class, '') = '' AND (assignments IS NULL OR jsonb_typeof(to_jsonb(assignments)) <> 'array' OR jsonb_array_length(to_jsonb(assignments)) = 0)
    UNION ALL
    SELECT 'parents_no_child', 'users', array_agg(p.id) FROM active p
     WHERE p.role = 'parent' AND NOT EXISTS (SELECT 1 FROM public.guardians g WHERE g.parent_id = p.id)
    UNION ALL
    SELECT 'students_no_verified_parent', 'users', array_agg(s.id) FROM active s
     WHERE s.role = 'student' AND NOT EXISTS (SELECT 1 FROM public.guardians g WHERE g.student_id = s.id AND g.verified)
    UNION ALL
    SELECT 'duplicate_roll_numbers', 'users', array_agg(id) FROM active a
     WHERE a.role = 'student' AND coalesce(a.custom_student_id, '') <> ''
       AND (SELECT count(*) FROM active b WHERE b.role = 'student' AND lower(trim(b.custom_student_id)) = lower(trim(a.custom_student_id))) > 1
    UNION ALL
    SELECT 'family_links_across_schools', 'users', array_agg(DISTINCT s.id) FROM people s
      JOIN public.guardians g ON g.student_id = s.id JOIN public.users par ON par.id = g.parent_id
     WHERE par.school_id IS DISTINCT FROM p_school
    UNION ALL
    SELECT 'classes_no_students', 'classes', array_agg(c.id) FROM public.classes c
     WHERE c.school_id = p_school AND NOT EXISTS (SELECT 1 FROM active s WHERE s.role = 'student' AND public.ops_norm_class(s.student_class) = public.ops_norm_class(c.name))
    UNION ALL
    SELECT 'accounts_no_login', 'users', array_agg(id) FROM flagged WHERE no_login
  )
  SELECT jsonb_build_object(
    'logins', (SELECT coalesce(jsonb_agg(to_jsonb(l) ORDER BY l.role), '[]'::jsonb) FROM logins l),
    'stuck', (SELECT coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) FROM stuck s),
    'checks', (SELECT jsonb_agg(jsonb_build_object('key', key, 'table', tbl, 'count', coalesce(array_length(ids, 1), 0), 'sample', to_jsonb(coalesce(ids[1:5], '{}'::uuid[])))) FROM checks)
  )
```

</details>

### fn ops_school_metrics

`ops_school_metrics(p_school uuid DEFAULT NULL::uuid)` → `TABLE(school_id uuid, metrics jsonb)` · sql · security definer · execute: postgres, service_role

> Platform Manager school health: counts only (adoption by role, per class, data quality, operations). service_role only.

- **Touches:** `schools` select, `users` select, `submissions` select, `tutor_sessions` select, `student_chats` select, `wellness_logs` select, `assignments` select, `lesson_plans` select, `materials` select, `attendance` select, `syllabus_progress` select, `situations` select, `incidents` select, `school_messages` select, `fee_payments` select, `admission_events` select, `consents` select, `audit_log` select, `ai_usage` select, `classes` select, `guardians` select, `fee_invoices` select, `fee_structures` select, `timetable_versions` select, `leave_requests` select, `app_errors` select
- **Calls:** `ops_norm_class()`
- **Reached from routes:** `/api/ops/overview`, `/api/ops/schools`, `/api/ops/schools/[id]`

<details><summary>Source</summary>

```sql
WITH sch AS (
  SELECT s.id FROM public.schools s WHERE p_school IS NULL OR s.id = p_school
),
ppl AS (
  SELECT u.id, u.school_id, u.role, u.student_class, u.custom_student_id, u.assignments, u.metadata,
         a.last_sign_in_at, a.created_at AS auth_created
  FROM public.users u
  JOIN sch ON sch.id = u.school_id
  LEFT JOIN auth.users a ON a.id = u.id
  WHERE u.role IN ('student', 'teacher', 'parent', 'admin')
    AND NOT (coalesce(u.metadata, '{}'::jsonb) ? 'left')
),
acts AS (
  SELECT student_id AS uid, submitted_at AS at FROM public.submissions WHERE submitted_at > now() - interval '56 days'
  UNION ALL SELECT student_id, created_at FROM public.tutor_sessions WHERE created_at > now() - interval '56 days'
  UNION ALL SELECT student_id, created_at FROM public.student_chats WHERE role = 'user' AND created_at > now() - interval '56 days'
  UNION ALL SELECT student_id, created_at FROM public.wellness_logs WHERE created_at > now() - interval '56 days'
  UNION ALL SELECT teacher_id, created_at FROM public.assignments WHERE created_at > now() - interval '56 days'
  UNION ALL SELECT teacher_id, updated_at FROM public.lesson_plans WHERE updated_at > now() - interval '56 days'
  UNION ALL SELECT teacher_id, created_at FROM public.materials WHERE created_at > now() - interval '56 days'
  UNION ALL SELECT marked_by, marked_at FROM public.attendance WHERE marked_at > now() - interval '56 days'
  UNION ALL SELECT updated_by, updated_at FROM public.syllabus_progress WHERE updated_at > now() - interval '56 days'
  UNION ALL SELECT acknowledged_by, acknowledged_at FROM public.situations WHERE acknowledged_at > now() - interval '56 days'
  UNION ALL SELECT logged_by, created_at FROM public.incidents WHERE created_at > now() - interval '56 days'
  UNION ALL SELECT sender_id, created_at FROM public.school_messages WHERE created_at > now() - interval '56 days'
  UNION ALL SELECT recorded_by, recorded_at FROM public.fee_payments WHERE recorded_at > now() - interval '56 days'
  UNION ALL SELECT actor_id, at FROM public.admission_events WHERE at > now() - interval '56 days'
  UNION ALL SELECT granted_by, updated_at FROM public.consents WHERE updated_at > now() - interval '56 days'
  UNION ALL SELECT actor_id, at FROM public.audit_log WHERE at > now() - interval '56 days'
  UNION ALL SELECT user_id, at FROM public.ai_usage WHERE at > now() - interval '56 days'
),
act AS (
  SELECT p.id, p.school_id, p.role, date_trunc('week', a.at) AS wk, max(a.at) AS last_at
  FROM acts a JOIN ppl p ON p.id = a.uid
  GROUP BY 1, 2, 3, 4
),
last_act AS (SELECT id, max(last_at) AS at FROM act GROUP BY id),
roles AS (
  SELECT p.school_id, p.role, jsonb_build_object(
    'total',     count(*),
    'signedIn7',  count(*) FILTER (WHERE p.last_sign_in_at > now() - interval '7 days'),
    'signedIn30', count(*) FILTER (WHERE p.last_sign_in_at > now() - interval '30 days'),
    'active7',    count(*) FILTER (WHERE l.at > now() - interval '7 days'),
    'active30',   count(*) FILTER (WHERE l.at > now() - interval '30 days'),
    'never',      count(*) FILTER (WHERE p.last_sign_in_at IS NULL)
  ) AS m
  FROM ppl p LEFT JOIN last_act l ON l.id = p.id
  GROUP BY 1, 2
),
weekly AS (
  SELECT school_id, jsonb_agg(jsonb_build_object('week', to_char(wk, 'YYYY-MM-DD'), 'role', role, 'active', n) ORDER BY wk, role) AS m
  FROM (SELECT school_id, role, wk, count(DISTINCT id) AS n FROM act GROUP BY 1, 2, 3) w
  GROUP BY 1
),
cls AS (
  SELECT c.school_id, jsonb_agg(jsonb_build_object('name', c.name, 'students', coalesce(x.students, 0), 'active7', coalesce(x.active7, 0)) ORDER BY c.name) AS m
  FROM public.classes c
  JOIN sch ON sch.id = c.school_id
  LEFT JOIN LATERAL (
    SELECT count(*) AS students, count(*) FILTER (WHERE l.at > now() - interval '7 days') AS active7
    FROM ppl p LEFT JOIN last_act l ON l.id = p.id
    WHERE p.school_id = c.school_id AND p.role = 'student'
      AND public.ops_norm_class(p.student_class) = public.ops_norm_class(c.name)
  ) x ON true
  GROUP BY 1
),
verified AS (
  SELECT g.student_id, g.parent_id FROM public.guardians g
  JOIN ppl s ON s.id = g.student_id AND s.role = 'student'
  JOIN ppl pa ON pa.id = g.parent_id AND pa.role = 'parent'
  WHERE g.verified
),
dq AS (
  SELECT p.school_id, jsonb_build_object(
    'studentsNoParent', count(*) FILTER (WHERE p.role = 'student' AND NOT EXISTS (SELECT 1 FROM verified v WHERE v.student_id = p.id)),
    'studentsNoClass',  count(*) FILTER (WHERE p.role = 'student' AND coalesce(trim(p.student_class), '') = ''),
    'studentsNoRoll',   count(*) FILTER (WHERE p.role = 'student' AND coalesce(trim(p.custom_student_id), '') = ''),
    'parentsNoChild',   count(*) FILTER (WHERE p.role = 'parent' AND NOT EXISTS (SELECT 1 FROM verified v WHERE v.parent_id = p.id)),
    'teachersNoAssignments', count(*) FILTER (WHERE p.role = 'teacher' AND jsonb_array_length(CASE WHEN jsonb_typeof(p.assignments) = 'array' THEN p.assignments ELSE '[]'::jsonb END) = 0),
    'staleTempPasswords', count(*) FILTER (WHERE (p.metadata ->> 'mustChangePassword')::boolean IS TRUE AND p.auth_created < now() - interval '14 days')
  ) AS m
  FROM ppl p GROUP BY 1
),
fees AS (
  SELECT i.school_id,
         sum(i.amount - coalesce(i.concession, 0)) AS due,
         count(*) AS invoices,
         coalesce(sum((SELECT sum(fp.amount) FROM public.fee_payments fp WHERE fp.invoice_id = i.id AND fp.voided_at IS NULL)), 0) AS paid
  FROM public.fee_invoices i JOIN sch ON sch.id = i.school_id
  WHERE i.voided_at IS NULL AND i.due_on <= current_date
  GROUP BY 1
),
ops AS (
  SELECT sch.id AS school_id, jsonb_build_object(
    'classCount',        (SELECT count(*) FROM public.classes c WHERE c.school_id = sch.id),
    'attendanceDays14',  (SELECT count(DISTINCT a.day) FROM public.attendance a WHERE a.school_id = sch.id AND a.day > current_date - 14),
    'classesMarked7',    (SELECT count(DISTINCT public.ops_norm_class(a.class_name)) FROM public.attendance a WHERE a.school_id = sch.id AND a.day > current_date - 7),
    'feeStructures',     (SELECT count(*) FROM public.fee_structures f WHERE f.school_id = sch.id),
    'feeDue',            coalesce((SELECT due FROM fees WHERE fees.school_id = sch.id), 0),
    'feeCollected',      coalesce((SELECT paid FROM fees WHERE fees.school_id = sch.id), 0),
    'invoicesDue',       coalesce((SELECT invoices FROM fees WHERE fees.school_id = sch.id), 0),
    'assignments30',     (SELECT count(*) FROM public.assignments x WHERE x.school_id = sch.id AND x.created_at > now() - interval '30 days'),
    'teachersSettingWork30', (SELECT count(DISTINCT x.teacher_id) FROM public.assignments x WHERE x.school_id = sch.id AND x.created_at > now() - interval '30 days'),
    'gradingBacklog',    (SELECT count(*) FROM public.submissions x WHERE x.school_id = sch.id AND x.submitted_at < now() - interval '7 days' AND x.teacher_approved IS NOT TRUE),
    'incidentsOpenOld',  (SELECT count(*) FROM public.incidents x WHERE x.school_id = sch.id AND x.closed_at IS NULL AND x.created_at < now() - interval '14 days'),
    'timetablePublished', EXISTS (SELECT 1 FROM public.timetable_versions t WHERE t.school_id = sch.id AND t.status = 'published'),
    'leavePendingOld',   (SELECT count(*) FROM public.leave_requests x WHERE x.school_id = sch.id AND x.status = 'pending' AND x.created_at < now() - interval '3 days'),
    'errors7',           (SELECT count(*) FROM public.app_errors x WHERE x.school_id = sch.id AND x.at > now() - interval '7 days'),
    'aiCostUsd30',       (SELECT coalesce(sum(x.cost_usd), 0) FROM public.ai_usage x WHERE x.school_id = sch.id AND x.at > now() - interval '30 days')
  ) AS m
  FROM sch
)
SELECT sch.id, jsonb_build_object(
  'at',      now(),
  'roles',   coalesce((SELECT jsonb_object_agg(r.role, r.m) FROM roles r WHERE r.school_id = sch.id), '{}'::jsonb),
  'weekly',  coalesce((SELECT w.m FROM weekly w WHERE w.school_id = sch.id), '[]'::jsonb),
  'classes', coalesce((SELECT c.m FROM cls c WHERE c.school_id = sch.id), '[]'::jsonb),
  'data',    coalesce((SELECT d.m FROM dq d WHERE d.school_id = sch.id), '{}'::jsonb),
  'ops',     (SELECT o.m FROM ops o WHERE o.school_id = sch.id)
)
FROM sch;
```

</details>

### fn ops_set_platform_config

`ops_set_platform_config(p_key text, p_value jsonb, p_reason text, p_actor uuid, p_actor_email text)` → `jsonb` · plpgsql · security definer · execute: postgres, service_role

- **Touches:** `platform_config` select/insert, `settings_changes` insert
- **Reached from routes:** `/api/ops/settings`

<details><summary>Source</summary>

```sql
DECLARE v_old jsonb;
BEGIN
  SELECT value INTO v_old FROM public.platform_config WHERE key = p_key FOR UPDATE;
  INSERT INTO public.platform_config (key, value, updated_by, updated_at)
  VALUES (p_key, p_value, p_actor, now())
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now();
  INSERT INTO public.settings_changes (actor_id, actor_email, scope, key, old_value, new_value, reason)
  VALUES (p_actor, p_actor_email, 'platform', p_key, v_old, p_value, p_reason);
  RETURN jsonb_build_object('old', v_old, 'new', p_value);
END
```

</details>

### fn ops_subject_metrics

`ops_subject_metrics(p_school uuid DEFAULT NULL::uuid)` → `TABLE(school_id uuid, metrics jsonb)` · sql · security definer · execute: postgres, service_role

- **Touches:** `schools` select, `users` select, `class_subjects` select, `classes` select, `students` select, `teacher_subjects` select, `student_subjects` select, `subject_leads` select
- **Calls:** `app.norm_class()`
- **Reached from routes:** `/api/ops/overview`, `/api/ops/schools/[id]`

<details><summary>Source</summary>

```sql
WITH sch AS (SELECT id FROM public.schools WHERE p_school IS NULL OR id = p_school),
  students AS (
    SELECT u.id, u.school_id, u.student_class FROM public.users u JOIN sch ON sch.id = u.school_id
    WHERE u.role = 'student' AND NOT (coalesce(u.metadata, '{}'::jsonb) ? 'left')
  )
  SELECT sch.id, jsonb_build_object(
    'classSubjectsLinked', (SELECT count(*) FROM public.class_subjects cs WHERE cs.school_id = sch.id),
    'classSubjectsUnlinked', (SELECT count(*) FROM public.classes c,
        jsonb_array_elements_text(CASE WHEN jsonb_typeof(c.metadata -> 'subjects') = 'array' THEN c.metadata -> 'subjects' ELSE '[]'::jsonb END) e
      WHERE c.school_id = sch.id AND NOT EXISTS (SELECT 1 FROM public.class_subjects cs WHERE cs.class_id = c.id AND lower(cs.subject_name) = lower(trim(e)))),
    'classesNoSubjects', (SELECT count(*) FROM public.classes c WHERE c.school_id = sch.id
      AND EXISTS (SELECT 1 FROM students s WHERE app.norm_class(s.student_class) = app.norm_class(c.name))
      AND NOT EXISTS (SELECT 1 FROM public.class_subjects cs WHERE cs.class_id = c.id)),
    'classSubjectsNoTeacher', (SELECT count(*) FROM public.class_subjects cs WHERE cs.school_id = sch.id
      AND NOT EXISTS (SELECT 1 FROM public.teacher_subjects ts WHERE ts.class_subject_id = cs.id)),
    'studentsNoSubjects', (SELECT count(*) FROM students s WHERE s.school_id = sch.id
      AND NOT EXISTS (SELECT 1 FROM public.student_subjects ss WHERE ss.student_id = s.id)),
    'seniorNoElectives', (SELECT count(*) FROM students s JOIN public.classes c ON c.school_id = s.school_id AND app.norm_class(c.name) = app.norm_class(s.student_class)
      WHERE s.school_id = sch.id
        AND EXISTS (SELECT 1 FROM public.class_subjects cs WHERE cs.class_id = c.id AND cs.kind = 'elective' AND cs.level IN ('11', '12'))
        AND NOT EXISTS (SELECT 1 FROM public.student_subjects ss JOIN public.class_subjects cs ON cs.id = ss.class_subject_id
                        WHERE ss.student_id = s.id AND ss.source = 'elective')),
    'subjectsNoLead', (SELECT count(DISTINCT cs.subject_key) FROM public.class_subjects cs WHERE cs.school_id = sch.id
      AND NOT EXISTS (SELECT 1 FROM public.subject_leads l WHERE l.school_id = cs.school_id AND l.subject_key = cs.subject_key))
  )
  FROM sch;
```

</details>

### fn ops_tml_stale

`ops_tml_stale(p_since timestamp with time zone DEFAULT (now() - '14 days'::interval))` → `TABLE(school_id uuid, students integer)` · sql · security definer · execute: postgres, service_role

> Platform Manager TML health: students per school whose confirmed work is newer than their latest TML snapshot. service_role only.

- **Touches:** `submission_items` select, `tml_scores` select
- **Reached from routes:** `/api/ops/overview`

<details><summary>Source</summary>

```sql
WITH ev AS (
    SELECT i.school_id, i.student_id, max(i.created_at) AS newest
    FROM public.submission_items i
    WHERE i.teacher_confirmed AND i.created_at >= p_since AND i.created_at < now() - interval '30 minutes'
    GROUP BY 1, 2
  )
  SELECT ev.school_id, count(*)::int
  FROM ev
  LEFT JOIN LATERAL (
    SELECT max(t.computed_at) AS at FROM public.tml_scores t WHERE t.student_id = ev.student_id
  ) snap ON true
  WHERE snap.at IS NULL OR snap.at + interval '30 minutes' < ev.newest
  GROUP BY 1
```

</details>

### fn ops_update_school

`ops_update_school(p_school uuid, p_patch jsonb, p_journal jsonb, p_reason text, p_actor uuid, p_actor_email text, p_expected timestamp with time zone)` → `jsonb` · plpgsql · security definer · execute: postgres, service_role

- **Touches:** `schools` select/update, `settings_changes` insert
- **Reached from routes:** `/api/ops/schools/[id]/controls`, `/api/ops/schools/[id]/settings`

<details><summary>Source</summary>

```sql
DECLARE
  v_row public.schools;
  v_settings jsonb;
  k text;
BEGIN
  SELECT * INTO v_row FROM public.schools WHERE id = p_school FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'school not found' USING ERRCODE = 'P0002'; END IF;
  IF p_expected IS NOT NULL AND v_row.updated_at IS DISTINCT FROM p_expected THEN
    RAISE EXCEPTION 'school changed since it was loaded' USING ERRCODE = '40001';
  END IF;
  v_settings := coalesce(v_row.settings, '{}'::jsonb);
  IF p_patch ? 'settings' THEN
    FOR k IN SELECT jsonb_object_keys(p_patch -> 'settings') LOOP
      IF jsonb_typeof(p_patch -> 'settings' -> k) = 'null'
        THEN v_settings := v_settings - k;
        ELSE v_settings := jsonb_set(v_settings, ARRAY[k], p_patch -> 'settings' -> k, true);
      END IF;
    END LOOP;
  END IF;
  UPDATE public.schools SET
    name = CASE WHEN p_patch ? 'name' THEN p_patch ->> 'name' ELSE name END,
    institution_type = CASE WHEN p_patch ? 'institution_type' THEN p_patch ->> 'institution_type' ELSE institution_type END,
    trial_expires_at = CASE WHEN p_patch ? 'trial_expires_at' THEN (p_patch ->> 'trial_expires_at')::timestamptz ELSE trial_expires_at END,
    settings = v_settings
  WHERE id = p_school
  RETURNING * INTO v_row;
  INSERT INTO public.settings_changes (actor_id, actor_email, scope, school_id, key, old_value, new_value, reason)
  SELECT p_actor, p_actor_email, 'school', p_school, j ->> 'key', j -> 'old', j -> 'new', p_reason
  FROM jsonb_array_elements(coalesce(p_journal, '[]'::jsonb)) j;
  RETURN jsonb_build_object('updated_at', v_row.updated_at);
END
```

</details>

### fn parent_wellness_summary

`parent_wellness_summary(p_student uuid, p_days integer DEFAULT 14)` → `TABLE(checkins bigint, avg_energy numeric, low_days bigint, latest_energy integer, latest_at timestamp with time zone)` · sql · security definer · execute: authenticated, postgres, service_role

- **Touches:** `wellness_logs` select
- **Calls:** `app.is_parent_of()`

<details><summary>Source</summary>

```sql
SELECT count(*), round(avg(w.energy)::numeric, 1), count(*) FILTER (WHERE w.energy <= 2),
         (array_agg(w.energy ORDER BY w.created_at DESC))[1], max(w.created_at)
  FROM public.wellness_logs w
  WHERE app.is_parent_of(p_student)
    AND w.student_id = p_student AND w.note IS NULL AND w.energy IS NOT NULL
    AND w.created_at >= now() - make_interval(days => least(greatest(p_days, 1), 90))
```

</details>

### fn payroll_approve_run

`payroll_approve_run(p_school uuid, p_run uuid, p_by uuid, p_recoveries jsonb)` → `void` · plpgsql · security definer · execute: postgres, service_role

- **Touches:** `pay_runs` select/update, `loan_recoveries` insert/select, `staff_loans` select/update
- **Reached from routes:** `/api/admin/payroll/run`

<details><summary>Source</summary>

```sql
DECLARE r public.pay_runs; x jsonb;
BEGIN
  SELECT * INTO r FROM public.pay_runs WHERE id = p_run AND school_id = p_school FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'payroll: no such run' USING ERRCODE = 'P0001'; END IF;
  IF r.status <> 'submitted' THEN RAISE EXCEPTION 'payroll: run is not awaiting approval' USING ERRCODE = 'P0001'; END IF;
  IF r.submitted_by = p_by THEN RAISE EXCEPTION 'payroll: the person who submitted a run cannot approve it' USING ERRCODE = 'P0001'; END IF;
  FOR x IN SELECT * FROM jsonb_array_elements(coalesce(p_recoveries, '[]'::jsonb)) LOOP
    INSERT INTO public.loan_recoveries (loan_id, run_id, school_id, amount)
    SELECT l.id, p_run, p_school, (x ->> 'amount')::numeric FROM public.staff_loans l
    WHERE l.id = (x ->> 'loan_id')::uuid AND l.school_id = p_school;
  END LOOP;
  UPDATE public.staff_loans l SET status = 'closed', closed_at = now()
  WHERE l.school_id = p_school AND l.status = 'open'
    AND l.principal <= (SELECT coalesce(sum(amount), 0) FROM public.loan_recoveries v WHERE v.loan_id = l.id);
  UPDATE public.pay_runs SET status = 'approved', approved_by = p_by, approved_at = now() WHERE id = p_run;
END
```

</details>

### fn rls_auto_enable

`rls_auto_enable()` → `event_trigger` · plpgsql · security definer · execute: postgres, service_role


<details><summary>Source</summary>

```sql
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
```

</details>

### fn school_attendance_summary

`school_attendance_summary(p_from date, p_to date, p_month_from date)` → `TABLE(bucket text, student_id uuid, class_name text, key text, present bigint, late bigint, absent bigint, excused bigint)` · sql · security definer · execute: authenticated, postgres, service_role

- **Touches:** `attendance` select
- **Calls:** `app.has_perm()`, `app.is_superadmin()`, `app.current_school_id()`

<details><summary>Source</summary>

```sql
WITH who AS (
    SELECT (app.has_perm('attendance.read') OR app.is_superadmin()) AS named,
           (app.has_perm('attendance.read') OR app.has_perm('boardpack.view') OR app.is_superadmin()) AS allowed
  ), a AS (
    SELECT a.student_id, a.class_name, a.day, a.status
    FROM public.attendance a, who
    WHERE who.allowed
      AND a.school_id = app.current_school_id()
      AND a.day BETWEEN greatest(p_from, p_to - 400) AND p_to
  ), s AS (
    SELECT 'student'::text AS bucket, student_id, max(class_name) AS class_name,
           count(*) FILTER (WHERE status = 'present') AS present, count(*) FILTER (WHERE status = 'late') AS late,
           count(*) FILTER (WHERE status = 'absent') AS absent, count(*) FILTER (WHERE status = 'excused') AS excused
    FROM a GROUP BY student_id
    UNION ALL
    SELECT 'student_month', student_id, max(class_name),
           count(*) FILTER (WHERE status = 'present'), count(*) FILTER (WHERE status = 'late'),
           count(*) FILTER (WHERE status = 'absent'), count(*) FILTER (WHERE status = 'excused')
    FROM a WHERE day >= p_month_from GROUP BY student_id
  )
  SELECT s.bucket, CASE WHEN who.named THEN s.student_id END, s.class_name, NULL::text, s.present, s.late, s.absent, s.excused
  FROM s, who
  UNION ALL
  SELECT 'class_week', NULL, class_name, to_char(date_trunc('week', day::timestamp), 'YYYY-MM-DD'),
         count(*) FILTER (WHERE status = 'present'), count(*) FILTER (WHERE status = 'late'),
         count(*) FILTER (WHERE status = 'absent'), count(*) FILTER (WHERE status = 'excused')
  FROM a GROUP BY class_name, date_trunc('week', day::timestamp)
  UNION ALL
  SELECT 'class_day', NULL, class_name, to_char(p_to, 'YYYY-MM-DD'),
         count(*) FILTER (WHERE status = 'present'), count(*) FILTER (WHERE status = 'late'),
         count(*) FILTER (WHERE status = 'absent'), count(*) FILTER (WHERE status = 'excused')
  FROM a WHERE day = p_to GROUP BY class_name
```

</details>

### fn school_wellness_aggregates

`school_wellness_aggregates(p_days integer DEFAULT 14)` → `TABLE(student_class text, students bigint, checkins bigint, avg_energy numeric, low_share numeric)` · sql · security definer · execute: authenticated, postgres, service_role

- **Touches:** `wellness_logs` select, `users` select
- **Calls:** `app.has_perm()`, `app.current_school_id()`

<details><summary>Source</summary>

```sql
SELECT s.student_class, count(DISTINCT w.student_id), count(*), round(avg(w.energy)::numeric, 2),
         round(avg((w.energy <= 2)::int)::numeric, 2)
  FROM public.wellness_logs w
  JOIN public.users s ON s.id = w.student_id
  WHERE app.has_perm('wellness.read')
    AND w.school_id = app.current_school_id()
    AND w.note IS NULL AND w.energy IS NOT NULL
    AND w.created_at >= now() - make_interval(days => least(greatest(p_days, 1), 90))
  GROUP BY s.student_class
  HAVING count(DISTINCT w.student_id) >= 5
```

</details>

### fn school_wellness_report

`school_wellness_report(p_since date)` → `TABLE(bucket text, key text, students bigint, checkins bigint, avg_energy numeric, low_share numeric)` · sql · security definer · execute: authenticated, postgres, service_role

- **Touches:** `wellness_logs` select, `users` select
- **Calls:** `app.grade_of()`, `app.has_perm()`, `app.current_school_id()`
- **Reached from routes:** `/api/staff/ask`, `/api/whatsapp/simulate`, `/api/whatsapp/webhook`

<details><summary>Source</summary>

```sql
WITH w AS (
    SELECT w.student_id, w.energy, w.created_at, app.grade_of(s.student_class) AS grade
    FROM public.wellness_logs w
    JOIN public.users s ON s.id = w.student_id
    WHERE app.has_perm('wellness.read')
      AND w.school_id = app.current_school_id()
      AND w.energy IS NOT NULL
      AND w.created_at >= greatest(p_since, (now() - interval '400 days')::date)
  ), agg AS (
    SELECT 'week'::text AS bucket, to_char(date_trunc('week', created_at), 'YYYY-MM-DD') AS key,
           count(DISTINCT student_id) AS students, count(*) AS checkins,
           avg(energy) AS e, avg((energy <= 2)::int) AS l
    FROM w GROUP BY 2
    UNION ALL
    SELECT 'grade', grade::text, count(DISTINCT student_id), count(*), avg(energy), avg((energy <= 2)::int)
    FROM w WHERE grade IS NOT NULL GROUP BY 2
    UNION ALL
    SELECT 'school', 'all', count(DISTINCT student_id), count(*), avg(energy), avg((energy <= 2)::int) FROM w
    HAVING count(*) > 0
  )
  SELECT bucket, key, students, checkins,
         CASE WHEN students >= 5 THEN round(e::numeric, 2) END,
         CASE WHEN students >= 5 THEN round(l::numeric, 2) END
  FROM agg
```

</details>

### fn set_consent

`set_consent(p_student uuid, p_type text, p_granted boolean, p_policy_version text DEFAULT NULL::text)` → `consents` · plpgsql · security definer · execute: authenticated, postgres, service_role

- **Touches:** `consents` insert, `users` select
- **Calls:** `app.is_parent_of()`

<details><summary>Source</summary>

```sql
DECLARE v public.consents;
BEGIN
  IF NOT app.is_parent_of(p_student) THEN
    RAISE EXCEPTION 'Only a verified parent or guardian can set consent for this student' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.consents (student_id, school_id, consent_type, granted, granted_by, policy_version, granted_at, revoked_at)
  SELECT p_student, u.school_id, p_type, p_granted, auth.uid(), p_policy_version,
         CASE WHEN p_granted THEN now() END, CASE WHEN NOT p_granted THEN now() END
  FROM public.users u WHERE u.id = p_student
  ON CONFLICT (student_id, consent_type) DO UPDATE
    SET granted = EXCLUDED.granted, granted_by = EXCLUDED.granted_by, policy_version = EXCLUDED.policy_version,
        granted_at = CASE WHEN EXCLUDED.granted THEN now() ELSE consents.granted_at END,
        revoked_at = CASE WHEN EXCLUDED.granted THEN NULL ELSE now() END
  RETURNING * INTO v;
  RETURN v;
END
```

</details>

### fn student_attendance_timeline

`student_attendance_timeline(p_school uuid, p_student uuid, p_from date DEFAULT NULL::date, p_to date DEFAULT NULL::date)` → `jsonb` · sql · security invoker · execute: postgres, service_role

- **Touches:** `attendance` select
- **Reached from routes:** `/api/parent/ask`, `/api/timeline`, `/api/whatsapp/simulate`, `/api/whatsapp/webhook`

<details><summary>Source</summary>

```sql
WITH marks AS (
    SELECT day, status, row_number() OVER (ORDER BY day) AS n
    FROM public.attendance
    WHERE school_id = p_school AND student_id = p_student
      AND (p_from IS NULL OR day >= p_from) AND (p_to IS NULL OR day <= p_to)
  ),
  months AS (
    SELECT to_char(day, 'YYYY-MM') AS month,
           count(*) FILTER (WHERE status = 'present') AS present,
           count(*) FILTER (WHERE status = 'absent') AS absent,
           count(*) FILTER (WHERE status = 'late') AS late,
           count(*) FILTER (WHERE status = 'excused') AS excused,
           count(*) AS marked
    FROM marks GROUP BY 1
  ),
  absent AS (
    SELECT day, n - row_number() OVER (ORDER BY day) AS grp FROM marks WHERE status = 'absent'
  ),
  runs AS (
    SELECT min(day) AS from_day, max(day) AS to_day, count(*) AS days FROM absent GROUP BY grp HAVING count(*) >= 3
  )
  SELECT jsonb_build_object(
    'months', coalesce((SELECT jsonb_agg(jsonb_build_object('month', month, 'present', present, 'absent', absent, 'late', late, 'excused', excused, 'marked', marked) ORDER BY month) FROM months), '[]'::jsonb),
    'runs', coalesce((SELECT jsonb_agg(jsonb_build_object('from', from_day, 'to', to_day, 'days', days) ORDER BY from_day) FROM runs), '[]'::jsonb)
  );
```

</details>

### fn student_correct

`student_correct(p_student uuid, p_school uuid, p_actor uuid, p_kind text, p_patch jsonb, p_reason text, p_masked jsonb DEFAULT '{}'::jsonb)` → `integer` · plpgsql · security definer · execute: postgres, service_role

- **Touches:** `students` select/update, `student_changes` insert
- **Calls:** `app.admission_floor()`
- **Reached from routes:** `/api/admin/health`, `/api/admin/students/[id]`, `/api/admin/students/requests`

<details><summary>Source</summary>

```sql
DECLARE
  v_old jsonb; f text; v_n int := 0; v_cols text;
  v_fields text[] := ARRAY['admission_no', 'full_name', 'aadhaar_name', 'gender', 'date_of_birth', 'pen', 'apaar_id', 'aadhaar_cipher',
    'aadhaar_hash', 'aadhaar_last4', 'no_aadhaar', 'cbse_reg_no', 'board_roll_no', 'admitted_on', 'admitted_grade', 'previous_school',
    'previous_status', 'previous_class', 'previous_tc_no', 'rte_seat', 'rte_amount', 'medium', 'indian_national', 'photo_path',
    'mother_tongue', 'social_category', 'religion', 'minority', 'bpl', 'aay', 'ews', 'family_income', 'address', 'permanent_address',
    'permanent_same', 'distance_km', 'family_code'];
BEGIN
  IF length(trim(coalesce(p_reason, ''))) = 0 THEN RAISE EXCEPTION 'A correction needs a reason' USING ERRCODE = '22023'; END IF;
  SELECT to_jsonb(s) INTO v_old FROM public.students s WHERE s.id = p_student AND s.school_id = p_school FOR UPDATE;
  IF v_old IS NULL THEN RAISE EXCEPTION 'Student not found at this school' USING ERRCODE = 'P0002'; END IF;
  IF v_old ->> 'status' = 'cancelled' THEN RAISE EXCEPTION 'A cancelled entry cannot be corrected' USING ERRCODE = '22023'; END IF;
  FOR f IN SELECT jsonb_object_keys(p_patch) LOOP
    IF NOT f = ANY (v_fields) THEN RAISE EXCEPTION 'Field % cannot be corrected', f USING ERRCODE = '22023'; END IF;
    IF (v_old -> f) IS DISTINCT FROM (p_patch -> f) AND f NOT IN ('aadhaar_cipher', 'aadhaar_hash') THEN
      INSERT INTO public.student_changes (school_id, student_id, field, old_value, new_value, reason, changed_by, changed_by_kind)
        VALUES (p_school, p_student, CASE WHEN f = 'aadhaar_last4' THEN 'aadhaar' ELSE f END,
                left(coalesce(p_masked -> 'old' ->> f, v_old ->> f), 400), left(coalesce(p_masked -> 'new' ->> f, p_patch ->> f), 400),
                left(trim(p_reason), 300), p_actor, p_kind);
      v_n := v_n + 1;
    END IF;
  END LOOP;
  IF v_n = 0 THEN RETURN 0; END IF;
  SELECT string_agg(format('%I', k), ', ') INTO v_cols FROM jsonb_object_keys(p_patch) k;
  EXECUTE format('UPDATE public.students s SET (%s) = (SELECT %s FROM jsonb_populate_record(s, $1)) WHERE s.id = $2', v_cols, v_cols)
    USING p_patch, p_student;
  IF p_patch ? 'admission_no' THEN PERFORM app.admission_floor(p_school); END IF;
  RETURN v_n;
END
```

</details>

### fn student_move

`student_move(p_school uuid, p_student uuid, p_class text, p_from date, p_reason text)` → `uuid` · plpgsql · security definer · execute: postgres, service_role

- **Touches:** `students` select
- **Calls:** `app.move_enrolment()`
- **Reached from routes:** `/api/admin/certificates`, `/api/admin/students`, `/api/admin/students/[id]`

<details><summary>Source</summary>

```sql
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.students WHERE id = p_student AND school_id = p_school AND status = 'active') THEN
    RAISE EXCEPTION 'Student not found at this school, or not active' USING ERRCODE = 'P0002';
  END IF;
  RETURN app.move_enrolment(p_student, p_class, p_from, p_reason);
END
```

</details>

### fn student_next_admission_no

`student_next_admission_no(p_school uuid)` → `text` · sql · security definer · execute: postgres, service_role

- **Calls:** `app.next_admission_no()`
- **Reached from routes:** `/api/admin/students`

<details><summary>Source</summary>

```sql
SELECT app.next_admission_no(p_school)
```

</details>

### fn student_promote

`student_promote(p_school uuid, p_session text, p_class text, p_to_class text, p_same_class text, p_actor uuid)` → `jsonb` · plpgsql · security definer · execute: postgres, service_role

- **Touches:** `enrolments` select/update, `students` select/update
- **Calls:** `app.session_ends()`, `app.session_starts()`, `app.norm_class()`, `app.move_enrolment()`
- **Reached from routes:** `/api/admin/students/year`

<details><summary>Source</summary>

```sql
DECLARE
  v_next text := (left(p_session, 4)::int + 1)::text || '-' || lpad(((left(p_session, 4)::int + 2) % 100)::text, 2, '0');
  v_end date := app.session_ends(p_school, p_session);
  v_start date := app.session_starts(p_school, v_next);
  r record; v_up int := 0; v_stay int := 0; v_left int := 0;
BEGIN
  IF EXISTS (SELECT 1 FROM public.enrolments e JOIN public.students s ON s.id = e.student_id
             WHERE e.school_id = p_school AND e.session = p_session AND e.ends_on IS NULL AND s.status = 'active'
               AND app.norm_class(e.class_name) = app.norm_class(p_class) AND e.outcome IS NULL) THEN
    RAISE EXCEPTION 'Some students in % have no final outcome yet', p_class USING ERRCODE = '22023';
  END IF;
  FOR r IN SELECT e.id, e.student_id, e.outcome FROM public.enrolments e JOIN public.students s ON s.id = e.student_id
           WHERE e.school_id = p_school AND e.session = p_session AND e.ends_on IS NULL AND s.status = 'active'
             AND app.norm_class(e.class_name) = app.norm_class(p_class) LOOP
    IF r.outcome IN ('promoted', 'promoted_no_exam') THEN
      UPDATE public.enrolments SET ends_on = greatest(starts_on, v_end), end_reason = 'promoted' WHERE id = r.id;
      PERFORM app.move_enrolment(r.student_id, p_to_class, v_start, NULL);
      v_up := v_up + 1;
    ELSIF r.outcome IN ('detained', 'repeater') THEN
      UPDATE public.enrolments SET ends_on = greatest(starts_on, v_end), end_reason = 'retained' WHERE id = r.id;
      PERFORM app.move_enrolment(r.student_id, coalesce(nullif(trim(p_same_class), ''), p_class), v_start, NULL);
      v_stay := v_stay + 1;
    ELSE
      UPDATE public.enrolments SET ends_on = greatest(starts_on, v_end), end_reason = 'left' WHERE id = r.id;
      UPDATE public.students SET status = 'left', left_on = v_end, leaving_reason = CASE WHEN r.outcome = 'dropout' THEN 'Dropped out' ELSE 'Left at year end' END
        WHERE id = r.student_id;
      v_left := v_left + 1;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('promoted', v_up, 'retained', v_stay, 'left', v_left);
END
```

</details>

### fn student_renumber

`student_renumber(p_school uuid, p_session text, p_class text, p_rule text)` → `integer` · plpgsql · security definer · execute: postgres, service_role

- **Touches:** `enrolments` select/update, `students` select
- **Calls:** `app.norm_class()`
- **Reached from routes:** `/api/admin/students/year`

<details><summary>Source</summary>

```sql
DECLARE v_n int;
BEGIN
  IF p_rule NOT IN ('alphabetical', 'admission') THEN RETURN 0; END IF;
  WITH r AS (
    SELECT e.id, row_number() OVER (ORDER BY CASE WHEN p_rule = 'alphabetical' THEN lower(s.full_name) END,
      CASE WHEN substring(s.admission_no from '(\d+)\s*$') IS NOT NULL THEN substring(s.admission_no from '(\d+)\s*$')::bigint END,
      lower(s.admission_no)) AS n
    FROM public.enrolments e JOIN public.students s ON s.id = e.student_id
    WHERE e.school_id = p_school AND e.session = p_session AND e.ends_on IS NULL AND app.norm_class(e.class_name) = app.norm_class(p_class)
      AND s.status = 'active')
  UPDATE public.enrolments e SET roll_no = r.n::text FROM r WHERE e.id = r.id AND e.roll_no IS DISTINCT FROM r.n::text;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END
```

</details>

### fn student_sync_school

`student_sync_school(p_school uuid)` → `integer` · plpgsql · security definer · execute: postgres, service_role

- **Touches:** `students` select
- **Calls:** `app.sync_student_login()`
- **Reached from routes:** `/api/admin/students/settings`

<details><summary>Source</summary>

```sql
DECLARE r record; v_n int := 0;
BEGIN
  FOR r IN SELECT id FROM public.students WHERE school_id = p_school AND user_id IS NOT NULL LOOP
    PERFORM app.sync_student_login(r.id);
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END
```

</details>

### fn teacher_wellness_feed

`teacher_wellness_feed(p_days integer DEFAULT 14)` → `TABLE(log_id uuid, student_id uuid, student_name text, student_class text, created_at timestamp with time zone, energy integer, at_risk boolean, resolved boolean, shared_note text)` · sql · security definer · execute: authenticated, postgres, service_role

- **Touches:** `wellness_logs` select, `users` select
- **Calls:** `app.teaches_student()`

<details><summary>Source</summary>

```sql
SELECT w.id, w.student_id, s.name, s.student_class, w.created_at, w.energy,
         (w.energy IS NOT NULL AND w.energy <= 2), w.resolved,
         CASE WHEN w.shared THEN w.note END
  FROM public.wellness_logs w
  JOIN public.users s ON s.id = w.student_id
  WHERE w.created_at >= now() - make_interval(days => least(greatest(p_days, 1), 90))
    AND (w.note IS NULL OR w.shared)
    AND app.teaches_student(w.student_id)
  ORDER BY w.created_at DESC
```

</details>

