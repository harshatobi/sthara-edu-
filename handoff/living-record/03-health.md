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
