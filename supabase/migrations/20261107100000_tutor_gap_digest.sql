-- Critical Gap volume (Moses, 2026-11-06): teachers now get one daily digest per class and subject instead of
-- one feed item per gap. The per-gap items raised by the first sync (dedupe key tutor_gap:<id>[:<teacher>])
-- are closed as replaced, not deleted. Open assignments over the 3-per-student cap are queued by the app on
-- its next sync, so no data change is needed for those.
UPDATE public.situations
   SET acknowledged = true, acknowledged_at = now(), ack_by_name = 'Sthara', ack_note = 'Replaced by the daily Critical Gap digest'
 WHERE type = 'tutor_critical_gap' AND dedupe_key LIKE 'tutor\_gap:%' AND acknowledged_at IS NULL;
