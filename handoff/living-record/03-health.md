# 03 — Health record

## Goal

A student's health information that staff need to keep them safe, with strict access control.

## What exists today

- Nothing for health. `wellness_logs (mood, energy, note, shared, resolved)` covers student-reported wellbeing
  check-ins, not medical data. Keep the two separate unless Moses says otherwise.
- The admin "Wellness" page (`src/components/admin/WellnessPage.tsx`) is a CBSE wellness *filing* that fills
  sections from live data. Ask whether health data should feed it.

## Decided with Moses

- The health record is in the first version.

**2026-10-21 (asked in session; UDISE+ fields from the 01 round 2 split):**
- **Fields.** UDISE+: blood group, height and weight, CWSN (children with special needs) with impairment type,
  disability certificate and percentage, and SLD / ASD / ADHD screening. Also: allergies (food, drug, other) with
  severity and what to do, chronic conditions with an emergency plan, regular medication (dose, timing, whether the
  school gives it), vaccinations with dates, and annual check-ups (vision, hearing, dental, height / weight / BMI,
  doctor's remarks).
- **Shape: both** a current health card (kept up to date, with history) and dated entries (each check-up, each
  vaccination) that build a timeline.
- **A new office role, Health officer** (school nurse or doctor), keeps the full record with the principal and the
  school admin; every view of the full record is audited. The registrar sees the UDISE+ disability fields. Class
  teachers and subject teachers of the class see **only allergies and alerts**.
- **Alerts:** a small alert next to the student in the teacher's attendance register and class lists, showing the
  allergy or condition and what to do. Nothing else of the record.
- **Parents** see the health card on the portal and propose changes; the health officer approves (same flow as 02).
- **Consent:** a new `health_record` consent type. The UDISE+ fields are kept regardless (statutory duty); allergies,
  conditions, medication, vaccinations and check-ups need the parent's consent, asked on the portal. Without it those
  sections stay empty and say consent is needed.
- **Retention:** UDISE+ fields stay with the register. The rest is deleted a set time after the student leaves
  (default 1 year, set by the school) unless the parent asks to keep it or a legal hold applies. Deletion is logged.
- **Import:** UDISE+ fields load for everyone; the rest loads only for students whose parent has given health consent
  in Sthara (others are listed as skipped, not failed).

## Still open (ask Moses before building)

- Which fields: blood group, allergies, chronic conditions, medication, vaccinations, height and weight, vision,
  dental, annual check-up results? Does the school have a health card format?
- Is it one current record, or a dated log of check-ups (or both)?
- Who sees what: class teacher (allergies only?), school nurse or doctor (a role that doesn't exist yet?), office,
  principal, parents?
- Should an allergy or condition show as an alert somewhere: attendance register, trips, the canteen?
- Can parents enter or update it?
- Consent: does health data need its own consent entry in `consents`?
- Retention: what happens to it when the student leaves?

**Bulk import (on 09's mechanism)**
- Published format: **Health records**. The columns follow the field answers above. Confirm them with Moses.
- Is importing health data allowed at all without fresh consent in Sthara?
- One current record per student, or dated check-up rows too?

## Done means

Answers recorded. The import format is published, with a template, and works for the tenant admin and for ops. Table with RLS and server-side permission checks, writes audited, and the data visible only to
the agreed roles. Tests that a role without access gets nothing back. All checks pass.
