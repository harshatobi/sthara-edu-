/**
 * Dev-only demo records for the student desk, used when there's no live
 * Supabase session (the local __role-cookie bypass — see AuthContext's
 * buildDemoProfile). Content is the Sthara 007 mockup's Ananya Iyer / 10A
 * dataset, but emitted as *database-shaped rows* and run through the same
 * shaping + the real TML engine as live data, so demo numbers are what the
 * engine would actually compute from this evidence — not hand-typed scores.
 *
 * Dates are relative to "now" so the demo never goes stale (mockup dates were
 * fixed to July 2026).
 */
import { blendFinalTml, calculateTopicTml, evidenceTopicName, getTutorDepthScore, normalizeTutorVolume } from '@/lib/tml/engine';

const DAY = 86_400_000;
const at = (days: number) => new Date(Date.now() + days * DAY).toISOString();

export const DEMO_STUDENT = { name: 'Ananya Iyer', id: 'STU1042', cls: '10A', school: 'DPS Vasundhara' };

type Q = { type: 'short' | 'mcq' | 'upload'; prompt: string };
const short = (prompt: string): Q => ({ type: 'short', prompt });
const upload = (prompt: string): Q => ({ type: 'upload', prompt });

/** Posted, not yet submitted. */
const OPEN = [
  { id: 'demo-quad-l2', subject: 'MATHEMATICS', title: 'Quadratic Equations — Level 2', units: ['Quadratic Equations'], type: 'homework', proctored: true, due: 6,
    description: 'Factoring & the quadratic formula. 6 questions.',
    questions: [short('Solve for x: x² − 5x + 6 = 0'), short('Solve for x: 2x² + 9x − 5 = 0'), short('Solve for x: x² − 4x − 12 = 0'),
      short('Find the discriminant of 3x² − 2x + 4 = 0 and state the nature of its roots.'),
      short('A rectangular field has area 84 m² and length 5 m more than its breadth. Find the breadth.'), short('Factorise: 6x² + 11x − 10')] },
  { id: 'demo-periodic', subject: 'SCIENCE', title: 'Periodic Classification', units: ['Periodic Table'], type: 'homework', proctored: true, due: 8,
    description: "Short answers, plus a diagram — we'll grade it straight from your photo.",
    questions: [short('State Mendeleev’s periodic law.'), short('Why did the noble gases not disturb Mendeleev’s table?'),
      short('Explain one limitation of Mendeleev’s classification that Moseley’s work resolved.'),
      upload('Upload a photo of your labelled diagram of the modern periodic table.')] },
  { id: 'demo-nationalism', subject: 'SOCIAL STUDIES', title: 'Nationalism in India — map work', units: ['Nationalism in India'], type: 'homework', proctored: false, due: 11,
    description: 'Map work, upload a photo of your atlas page.',
    questions: [upload('Upload a photo of your atlas page showing the route of the Salt March.'), short('Name three towns the Salt March passed through.')] },
];

const QUAD_AI = [{
  questionNumber: 4, questionText: 'Find the discriminant of x² + 2x + 3 = 0 and solve.', awardedScore: 0, maxScore: 3, isFinalAnswerCorrect: false,
  whatStudentGotRight: 'You identified a, b and c correctly and substituted into the formula cleanly.',
  lostMarksReason: 'You stopped at a negative discriminant and marked "no solution". The roots are complex, not absent.',
  howToFix: 'x = [−2 ± √(4 − 12)] / 2 = [−2 ± √(−8)] / 2\n√(−8) = 2i√2\nx = −1 ± i√2',
}];

/** Graded work — mockup COMPLETED, with the topic each one feeds. */
const GRADED = [
  { subject: 'MATHEMATICS', title: 'Quadratic Equations — Level 1', unit: 'Quadratic Equations', type: 'homework', score: 13, total: 15, ago: 3, ai: QUAD_AI,
    note: 'Checked by Ms. Menon, who agreed with the AI grade. Method was right up to the discriminant step on Q4.' },
  { subject: 'MATHEMATICS', title: 'Trigonometry quiz', unit: 'Trigonometry', type: 'quiz', score: 18, total: 20, ago: 5, note: 'Confident with identities; double-check angle-sum formulas under time pressure.' },
  { subject: 'MATHEMATICS', title: 'Linear Equations Recap', unit: 'Polynomials', type: 'homework', score: 14, total: 15, ago: 9, note: 'Consistent method throughout; one arithmetic slip on Q9.' },
  { subject: 'SCIENCE', title: 'States of Matter worksheet', unit: 'States of Matter', type: 'homework', score: 12, total: 15, ago: 12, note: 'Diagram labelling was excellent; missed the particle-motion explanation for gases.' },
  { subject: 'SCIENCE', title: 'Chemical Reactions quiz', unit: 'Chemical Reactions', type: 'quiz', score: 9, total: 12, ago: 17, note: 'Balancing equations solid; mixed up exothermic and endothermic on two items.' },
  { subject: 'SOCIAL STUDIES', title: 'French Revolution timeline', unit: 'French Revolution', type: 'homework', score: 18, total: 20, ago: 19, note: 'Strong chronological accuracy; minor gap on the causes of the Reign of Terror.' },
  { subject: 'ENGLISH', title: 'Poetry analysis', unit: 'Poetry & Drama', type: 'homework', score: 16, total: 18, ago: 22, note: 'Good use of textual evidence; extend the tone analysis in the conclusion.' },
  { subject: 'HINDI', title: 'Vyakaran worksheet', unit: 'Vyakaran — Grammar', type: 'homework', score: 11, total: 15, ago: 24, note: 'Sandhi rules mostly correct; revise vachan agreement.' },
  { subject: 'MATHEMATICS', title: 'Polynomials worksheet', unit: 'Polynomials', type: 'homework', score: 15, total: 15, ago: 26, note: 'Perfect score. Try the extension problems on synthetic division.' },
  { subject: 'SCIENCE', title: 'Periodic Trends quiz', unit: 'Periodic Table', type: 'quiz', score: 10, total: 12, ago: 29, note: 'Trend direction correct; two questions confused electronegativity with atomic radius.' },
  { subject: 'SOCIAL STUDIES', title: 'Nationalism reading response', unit: 'Nationalism in India', type: 'homework', score: 17, total: 20, ago: 32, note: 'Well-structured argument; cite the textbook page for your Salt March claim.' },
  { subject: 'ENGLISH', title: 'Grammar diagnostic', unit: 'Grammar', type: 'quiz', score: 19, total: 20, ago: 35, note: 'Near perfect; one comma-splice in the final paragraph.' },
  { subject: 'MATHEMATICS', title: 'Triangles — similarity', unit: 'Triangles', type: 'homework', score: 12, total: 15, ago: 39, note: 'Correct criteria used and steps shown clearly; lost marks on the final ratio simplification.' },
];

/** Socratic tutor sessions — the D component. Quadratics needed the answer revealed, which is why that topic sits lowest. */
const TUTOR = [
  { subject: 'MATHEMATICS', topic: 'Quadratic Equations', hint_depth: 3, answer_revealed: true, ago: 2 },
  { subject: 'MATHEMATICS', topic: 'Quadratic Equations', hint_depth: 2, answer_revealed: false, ago: 4 },
  { subject: 'MATHEMATICS', topic: 'Trigonometry', hint_depth: 0, answer_revealed: false, ago: 6 },
  { subject: 'SCIENCE', topic: 'Chemical Reactions', hint_depth: 2, answer_revealed: false, ago: 15 },
  { subject: 'HINDI', topic: 'Vyakaran — Grammar', hint_depth: 1, answer_revealed: false, ago: 20 },
];

/** Engagement inputs to the final blend (engagement_scores row). */
const ENGAGEMENT = { attendance: 94, teacherEngagement: 86, appEngagement: 78 };

export function demoRows() {
  const assignments: any[] = [];
  const submissions: any[] = [];

  for (const a of OPEN) {
    assignments.push({ id: a.id, subject: a.subject, title: a.title, description: a.description, units: a.units, type: a.type,
      proctored: a.proctored, class: '10A', due_date: at(a.due), questions: a.questions });
  }
  GRADED.forEach((g, i) => {
    const id = `demo-graded-${i}`;
    assignments.push({ id, subject: g.subject, title: g.title, description: '', units: [g.unit], type: g.type, proctored: true,
      class: '10A', due_date: at(-g.ago - 1), questions: [] });
    submissions.push({ id: `demo-sub-${i}`, assignment_id: id, score: g.score, max_score: g.total, teacher_approved: true,
      submitted_at: at(-g.ago), feedback: g.note, ai_result: g.ai ? { questions: g.ai } : null });
  });

  const tutor_sessions = TUTOR.map((t, i) => ({ id: `demo-tutor-${i}`, subject: t.subject, topic: t.topic, hint_depth: t.hint_depth,
    answer_revealed: t.answer_revealed, created_at: at(-t.ago) }));

  // Score every topic exactly the way computeStudentTml() would.
  const groups = new Map<string, { subject: string; items: any[] }>();
  const push = (subject: string, topic: string, item: any) => {
    if (!groups.has(topic)) groups.set(topic, { subject, items: [] });
    groups.get(topic)!.items.push(item);
  };
  for (const s of submissions) {
    const a = assignments.find(x => x.id === s.assignment_id);
    push(a.subject, evidenceTopicName(a), { score: s.score, maxScore: s.max_score, componentType: a.type, ageDays: (Date.now() - new Date(s.submitted_at).getTime()) / DAY });
  }
  for (const t of tutor_sessions) {
    push(t.subject, t.topic, { score: getTutorDepthScore(t.hint_depth, t.answer_revealed), maxScore: 100, componentType: 'tutor', ageDays: (Date.now() - new Date(t.created_at).getTime()) / DAY });
  }
  const tutorVolume = normalizeTutorVolume(tutor_sessions.filter(t => Date.now() - new Date(t.created_at).getTime() <= 30 * DAY).length);
  const tml_scores = [...groups.entries()].map(([topic, g]) => {
    const calc = calculateTopicTml(g.items);
    const final = blendFinalTml(calc.academicTml, { ...ENGAGEMENT, tutorVolume });
    return { subject: g.subject, topic_name: topic, score: final ?? 0, confidence_band: calc.confidenceBand, item_count: calc.totalItemCount,
      components: { academicTml: calc.academicTml, ...calc.components }, computed_at: at(-1) };
  });

  return { assignments, submissions, tutor_sessions, tml_scores };
}

/**
 * Offline stand-in for the live tutor (mockup STEPS): a scripted three-step
 * Circles · Tangents session with a regex check per step. Only used when
 * there's no live session to call /api/tutor/session with.
 */
export const DEMO_TUTOR = {
  subject: 'Mathematics',
  topic: 'Circles — Tangents',
  start: 31,
  answer: '12 cm',
  steps: [
    { prompt: 'A tangent is drawn from a point 13 cm from the centre of a circle of radius 5 cm. Before we find its length — what do we know about the angle between a tangent and the radius at the point of contact?',
      accept: /90|right\s*angle|perpendicular/i,
      hint: 'Think about exactly where the tangent touches the circle — there’s one specific angle formed with the radius right at that point.' },
    { prompt: 'So if you draw the radius to the point of contact, what kind of triangle have you just made with the centre, the point of contact, and the external point?',
      accept: /right/i,
      hint: 'You just said that angle is 90°. Three points, one 90° angle between two of the sides — what shape is that?' },
    { prompt: 'You know the radius (5 cm) and the distance from centre to external point (13 cm). Which theorem lets you find the third side? Try it — tell me the number you get and I will check it.',
      accept: /\b12\b/,
      hint: 'Try Pythagoras: hypotenuse² − known side² = unknown side². That’s 13² − 5².' },
  ],
};
