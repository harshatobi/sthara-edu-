-- Every admin page was slow to fill (~150 requests at ~2s each, 10-15s of skeletons, found 2026-11-06 as the
-- principal): eleven read policies call app.is_parent_of(<student>) once per ROW, even for staff whose earlier
-- branch already allows the row. Same fix as attendance_read (20261107110000): the caller's verified children
-- computed once per query with app.my_child_ids(), as `<student> IN (SELECT app.my_child_ids())`.
--
-- Each policy below is the live policy with only that call replaced. Verified before applying, in rolled-back
-- transactions on live: for 10 users (subject teacher, two class teachers, parent, student, principal, admin,
-- vice principal, finance, another school's teacher) the visible rows of every table (count and id fingerprint)
-- are identical. Summed over the 10 users: tml_scores 2,107 -> 133 ms, submissions 2,875 -> 138 ms,
-- submission_items 2,959 -> 138 ms, student_subjects 1,357 -> 33 ms, fee_invoices 786 -> 24 ms,
-- fee_payments 744 -> 24 ms, consents 733 -> 23 ms, users 124 -> 21 ms.
-- incidents_read and situations_read keep app.teaches_student per row: those tables are small and the
-- set-based form measured slower there.

ALTER POLICY consents_read ON public.consents USING (
  ((student_id = ( SELECT auth.uid() AS uid)) OR (student_id IN ( SELECT app.my_child_ids() AS my_child_ids)) OR (( SELECT app.has_perm('compliance.read'::text) AS has_perm) AND (school_id = ( SELECT app.current_school_id() AS current_school_id))) OR ( SELECT app.is_superadmin() AS is_superadmin))
);
ALTER POLICY engagement_scores_read ON public.engagement_scores USING (
  ((student_id = ( SELECT auth.uid() AS uid)) OR (( SELECT app.sees_learning() AS sees_learning) AND (school_id = ( SELECT app.current_school_id() AS current_school_id))) OR (student_id IN ( SELECT app.my_child_ids() AS my_child_ids)) OR ( SELECT app.is_superadmin() AS is_superadmin))
);
ALTER POLICY fee_invoices_read ON public.fee_invoices USING (
  ((( SELECT app.has_perm('fees.read'::text) AS has_perm) AND (school_id = ( SELECT app.current_school_id() AS current_school_id))) OR (student_id IN ( SELECT app.my_child_ids() AS my_child_ids)) OR ( SELECT app.is_superadmin() AS is_superadmin))
);
ALTER POLICY fee_payments_read ON public.fee_payments USING (
  ((( SELECT app.has_perm('fees.read'::text) AS has_perm) AND (school_id = ( SELECT app.current_school_id() AS current_school_id))) OR (student_id IN ( SELECT app.my_child_ids() AS my_child_ids)) OR ( SELECT app.is_superadmin() AS is_superadmin))
);
ALTER POLICY fee_reminders_read ON public.fee_reminders USING (
  ((( SELECT app.has_perm('fees.read'::text) AS has_perm) AND (school_id = ( SELECT app.current_school_id() AS current_school_id))) OR (student_id IN ( SELECT app.my_child_ids() AS my_child_ids)) OR ( SELECT app.is_superadmin() AS is_superadmin))
);
ALTER POLICY school_threads_read ON public.school_threads USING (
  (((parent_id = ( SELECT auth.uid() AS uid)) AND (student_id IN ( SELECT app.my_child_ids() AS my_child_ids))) OR (staff_id = ( SELECT auth.uid() AS uid)) OR ((school_id = ( SELECT app.current_school_id() AS current_school_id)) AND ( SELECT app.has_perm('messages.office'::text) AS has_perm)) OR ( SELECT app.is_superadmin() AS is_superadmin))
);
ALTER POLICY student_subjects_read ON public.student_subjects USING (
  ((student_id = ( SELECT auth.uid() AS uid)) OR (student_subjects.student_id IN ( SELECT app.my_child_ids() AS my_child_ids)) OR (( SELECT app.is_staff() AS is_staff) AND (school_id = ( SELECT app.current_school_id() AS current_school_id))) OR ( SELECT app.is_superadmin() AS is_superadmin))
);
ALTER POLICY submission_items_read ON public.submission_items USING (
  ((student_id = ( SELECT auth.uid() AS uid)) OR (( SELECT app.sees_learning() AS sees_learning) AND (school_id = ( SELECT app.current_school_id() AS current_school_id))) OR (student_id IN ( SELECT app.my_child_ids() AS my_child_ids)) OR ( SELECT app.is_superadmin() AS is_superadmin))
);
ALTER POLICY submissions_read ON public.submissions USING (
  ((student_id = ( SELECT auth.uid() AS uid)) OR (( SELECT app.sees_learning() AS sees_learning) AND (school_id = ( SELECT app.current_school_id() AS current_school_id))) OR (student_id IN ( SELECT app.my_child_ids() AS my_child_ids)) OR ( SELECT app.is_superadmin() AS is_superadmin))
);
ALTER POLICY tml_scores_read ON public.tml_scores USING (
  ((student_id = ( SELECT auth.uid() AS uid)) OR (( SELECT app.sees_learning() AS sees_learning) AND (school_id = ( SELECT app.current_school_id() AS current_school_id))) OR (student_id IN ( SELECT app.my_child_ids() AS my_child_ids)) OR ( SELECT app.is_superadmin() AS is_superadmin))
);
ALTER POLICY users_read ON public.users USING (
  ((id = ( SELECT auth.uid() AS uid)) OR (( SELECT app.is_staff() AS is_staff) AND (school_id = ( SELECT app.current_school_id() AS current_school_id))) OR (id IN ( SELECT app.my_child_ids() AS my_child_ids)) OR ( SELECT app.is_superadmin() AS is_superadmin))
);
