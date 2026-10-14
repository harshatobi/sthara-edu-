import type { ScriptDef } from './types';

export const scripts: ScriptDef[] = [
  { n: '01', title: 'Import an existing timetable and publish it', role: 'Academic coordinator', perm: 'schedule.academic', priority: 'Critical', type: 'Positive', req: ['01', '02', '03'], uat: true,
    pre: 'Bells set; teachers have logins; an aSc XML (or .xlsx) export of the school’s timetable.', data: 'aSc export with one double period and one combined lesson',
    steps: [
      ['Timetable › Import; choose the file.', 'Every teacher is matched to an account or listed to pick ("Every teacher matched an account." when all match); rooms to create are listed.'],
      ['Try a 9 MB file, and an old .xls.', '"That file is over 8 MB…" / "That is the old Excel format. Save it as .xlsx or CSV…"'],
      ['Finish the import.', '"Imported N lessons"; LESSONS A WEEK, CLASHES, TEACHERS TIMETABLED, NO TEACHER tiles.'],
      ['Publish with CLASHES above 0.', '"Fix N clashes…"; each clash names who and where.'],
      ['Fix the clashes; Publish from next Monday.', 'Published; teachers are told; a date in the past is refused ("A timetable takes effect today or later…").'],
    ] },
  { n: '02', title: 'Edit a published timetable safely', role: 'Academic coordinator', priority: 'High', type: 'Negative', req: ['03', '04'],
    pre: 'A published timetable.',
    steps: [
      ['Click a period of the published timetable.', '"This timetable is published. Copy it to a new draft to change it."'],
      ['Delete it.', '"A published timetable is kept for the record. Retire it instead."'],
      ['Copy to draft; drag a lesson onto another period.', '"Periods swapped".'],
      ['Lock a period; open it.', 'Shown as locked.'],
      ['Publish the draft; Retire the old one.', 'Old version retired; past days keep the lessons they had.'],
    ] },
  { n: '03', title: 'Auto-build a week from requirements', role: 'Academic coordinator', perm: 'schedule.academic', priority: 'Critical', type: 'Positive', req: ['06', '07', '08'], uat: true,
    pre: 'Sections, teachers and bells exist; a timetable in force.', data: 'Class teacher in period 1; spread subjects on',
    steps: [
      ['Auto-build › Fill from the timetable.', 'What each section needs is filled: subject, teacher, a week, doubles.'],
      ['Teacher rules: set a teacher Target 70.', '"Target 0-60 a week; caps 1-12 a day, 1-60 a week, 1-12 in a row."'],
      ['Set most a week 4 and most a day 6.', '"The weekly cap is below the daily cap."'],
      ['Set sensible rules; "Not in: Sat; Wed 1,2"; solve.', 'LESSONS PLACED, CLASH CHECK clean, SCORE; the class teacher takes period 1 where possible; no lesson on Saturday or Wed P1–2 for that teacher.'],
      ['Read "Not placed".', 'Each unplaced lesson has a reason; "Place these by hand … or re-solve".'],
      ['Save as a draft.', '"Saved as a draft: N lessons"; open it in Timetable, check and publish.'],
    ] },
  { n: '04', title: 'Re-solve keeps locked and uncovered lessons', role: 'Academic coordinator', priority: 'High', type: 'Regression', req: ['04', '07'],
    pre: 'A draft with a locked combined lesson (10-A + 10-B) and one lesson not on the requirements sheet.',
    steps: [
      ['Re-solve unlocked lessons.', 'The combined lesson stays in both sections and is not duplicated (99e7dfe).'],
      ['Check the lesson not on the sheet.', 'Kept, and the result says so; CHANGED counts any removed lessons.'],
    ] },
];
