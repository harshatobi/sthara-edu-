/**
 * Board-exam paper designs, one per subject, taken from CBSE's official
 * Sample Question Papers for 2026-27 (cbseacademic.nic.in, SQP 2026-27; CBSE
 * states there is no change in design from 2025-26). A design fixes what a
 * real paper fixes: sections, the type and marks of every question number,
 * how many internal choices each section has, and which units each section draws on. (Which question numbers
 * carry a choice follows the SQP where it says so, otherwise the count is kept and the position chosen here.) Content
 * is written fresh for each paper; nothing here copies CBSE's questions.
 */

export type QType =
  | 'mcq' | 'assertion_reason' | 'vsa' | 'sa' | 'la' | 'case' | 'map'
  | 'passage' | 'grammar' | 'writing' | 'extract' | 'lit_short' | 'lit_long';

/**
 * either:   two full alternatives (A or B), the student answers one
 * subpart:  a case/source question whose 2-mark sub-part has an alternative
 * any:      answer `attempt` of `of` parts (English literature, grammar)
 */
export type Choice = { kind: 'either' } | { kind: 'subpart' } | { kind: 'any'; attempt: number; of: number };

export interface Slot {
  q: number;
  type: QType;
  marks: number;
  choice?: Choice;
  /** Case-based sub-part marks, in order (they sum to `marks`). */
  parts?: number[];
  /** Unit codes this question draws on; defaults to the section's. */
  units?: string[];
  /** What the question is (shown to the model and on the blueprint). */
  note?: string;
}

export interface Section { id: string; title: string; units?: string[]; slots: Slot[] }

export interface PaperDesign {
  key: string;
  cls: 10 | 12;
  /** The curriculum subject this design is for (official name). */
  subject: string;
  /** Shown when one subject has two papers (Maths Standard / Basic). */
  variant?: string;
  code: string;
  maxMarks: number;
  minutes: number;
  source: string;
  instructions: string[];
  sections: Section[];
}

const SQP10 = 'https://cbseacademic.nic.in/SQP_CLASSX_2026-27.html';
const SQP12 = 'https://cbseacademic.nic.in/SQP_CLASSXII_2026-27.html';

/** Consecutive slots of one type. */
function run(from: number, to: number, type: QType, marks: number, extra: Partial<Slot> = {}): Slot[] {
  return Array.from({ length: to - from + 1 }, (_, i) => ({ q: from + i, type, marks, ...extra }));
}
const either: Choice = { kind: 'either' };
const subpart: Choice = { kind: 'subpart' };
/** Puts an internal choice on the given question numbers. */
const choose = (slots: Slot[], qs: number[], c: Choice = either) => slots.map(s => (qs.includes(s.q) ? { ...s, choice: c } : s));

// ── Class 10 ────────────────────────────────────────────────────────────────

const science10: PaperDesign = {
  key: '10-science', cls: 10, subject: 'Science', code: '086', maxMarks: 80, minutes: 180, source: SQP10,
  instructions: [
    'This paper has 39 questions in three sections: Section A is Biology, Section B is Chemistry and Section C is Physics.',
    'All questions are compulsory. Some questions have an internal choice; attempt only one of the alternatives.',
    'Questions with a figure have a separate version for visually impaired candidates.',
  ],
  sections: [
    { id: 'A', title: 'Biology', units: ['II', 'V'], slots: choose([
      ...run(1, 7, 'mcq', 1), ...run(8, 9, 'assertion_reason', 1), ...run(10, 12, 'vsa', 2), ...run(13, 14, 'sa', 3),
      { q: 15, type: 'case', marks: 4, parts: [1, 1, 2], choice: subpart }, { q: 16, type: 'la', marks: 5 },
    ], [11, 16]) },
    { id: 'B', title: 'Chemistry', units: ['I'], slots: choose([
      ...run(17, 23, 'mcq', 1), { q: 24, type: 'assertion_reason', marks: 1 }, { q: 25, type: 'vsa', marks: 2 }, ...run(26, 27, 'sa', 3),
      { q: 28, type: 'case', marks: 4, parts: [1, 1, 2], choice: subpart }, { q: 29, type: 'la', marks: 5 },
    ], [26, 29]) },
    { id: 'C', title: 'Physics', units: ['III', 'IV'], slots: choose([
      ...run(30, 31, 'mcq', 1), { q: 32, type: 'assertion_reason', marks: 1 }, ...run(33, 34, 'vsa', 2), ...run(35, 37, 'sa', 3),
      { q: 38, type: 'case', marks: 4, parts: [1, 1, 2], choice: subpart }, { q: 39, type: 'la', marks: 5 },
    ], [34, 39]) },
  ],
};

function maths10(variant: 'Standard' | 'Basic', code: string): PaperDesign {
  return {
    key: `10-maths-${variant.toLowerCase()}`, cls: 10, subject: 'Mathematics', variant, code, maxMarks: 80, minutes: 180, source: SQP10,
    instructions: [
      'This paper has 38 compulsory questions in five sections, A to E.',
      'Section A: questions 1–18 are multiple choice and 19–20 are assertion–reason, 1 mark each. Section B: 2 marks each. Section C: 3 marks each. Section D: 5 marks each. Section E: three case studies of 4 marks each.',
      'There is no overall choice. Internal choices are given in 2 questions each of Sections B, C and D, and in the 2-mark sub-part of every case study.',
      'Draw neat figures wherever required. Take π = 22/7 unless stated. Calculators are not allowed.',
    ],
    sections: [
      { id: 'A', title: 'Section A', slots: [...run(1, 18, 'mcq', 1), ...run(19, 20, 'assertion_reason', 1)] },
      { id: 'B', title: 'Section B', slots: choose(run(21, 25, 'vsa', 2), [22, 24]) },
      { id: 'C', title: 'Section C', slots: choose(run(26, 31, 'sa', 3), [27, 30]) },
      { id: 'D', title: 'Section D', slots: choose(run(32, 35, 'la', 5), [33, 35]) },
      { id: 'E', title: 'Section E', slots: run(36, 38, 'case', 4, { parts: [1, 1, 2], choice: subpart }) },
    ],
  };
}

const social10: PaperDesign = {
  key: '10-social-science', cls: 10, subject: 'Social Science', code: '087', maxMarks: 80, minutes: 180, source: SQP10,
  instructions: [
    'This paper has 38 compulsory questions in four sections of 20 marks each: History, Geography, Political Science and Economics.',
    'Very short answers carry 2 marks (up to 40 words), short answers 3 marks (up to 60 words), long answers 5 marks (up to 120 words) and case-based questions 4 marks (three sub-questions, up to 100 words).',
    'The map questions carry 5 marks in all: question 9 in History (2 marks) and question 19 in Geography (3 marks).',
    'There is no overall choice; some questions have an internal choice. Visually impaired candidates answer the separate questions given in place of maps and pictures.',
  ],
  sections: [
    { id: 'A', title: 'History', units: ['History'], slots: [
      ...run(1, 4, 'mcq', 1), { q: 5, type: 'vsa', marks: 2 }, { q: 6, type: 'sa', marks: 3, choice: either }, { q: 7, type: 'la', marks: 5, choice: either },
      { q: 8, type: 'case', marks: 4, parts: [1, 1, 2] }, { q: 9, type: 'map', marks: 2, note: 'Locate and label two places from the History map list on an outline map of India.' },
    ] },
    { id: 'B', title: 'Geography', units: ['Geography'], slots: [
      ...run(10, 15, 'mcq', 1), { q: 16, type: 'vsa', marks: 2 }, { q: 17, type: 'la', marks: 5, choice: either },
      { q: 18, type: 'case', marks: 4, parts: [1, 1, 2] }, { q: 19, type: 'map', marks: 3, note: 'Locate and label three features from the Geography map list on an outline map of India.' },
    ] },
    { id: 'C', title: 'Political Science', units: ['Political Science'], slots: [
      ...run(20, 23, 'mcq', 1), ...run(24, 25, 'vsa', 2), { q: 26, type: 'sa', marks: 3 }, { q: 27, type: 'la', marks: 5, choice: either },
      { q: 28, type: 'case', marks: 4, parts: [1, 1, 2] },
    ] },
    { id: 'D', title: 'Economics', units: ['Economics'], slots: [
      ...run(29, 33, 'mcq', 1), { q: 34, type: 'assertion_reason', marks: 1 }, ...run(35, 37, 'sa', 3), { q: 38, type: 'la', marks: 5, choice: either },
    ] },
  ],
};

const english10: PaperDesign = {
  key: '10-english-ll', cls: 10, subject: 'English Language and Literature', code: '184', maxMarks: 80, minutes: 180, source: SQP10,
  instructions: [
    'This paper has 11 compulsory questions in three sections: A Reading Skills, B Grammar and Writing Skills, C Literature.',
    'Follow the instructions for each question, including where you answer only some of the parts given.',
  ],
  sections: [
    { id: 'A', title: 'Reading Skills', units: ['A'], slots: [
      { q: 1, type: 'passage', marks: 10, note: 'Discursive passage of about 400–450 words with 10 marks of questions (MCQ, very short and short answers).' },
      { q: 2, type: 'passage', marks: 10, note: 'Factual or case-based passage of about 300–350 words, possibly with a table or chart, 10 marks of questions.' },
    ] },
    { id: 'B', title: 'Grammar and Writing Skills', slots: [
      { q: 3, type: 'grammar', marks: 10, units: ['B1'], choice: { kind: 'any', attempt: 10, of: 12 }, note: 'Twelve 1-mark grammar tasks in context (tenses, modals, subject–verb agreement, reported speech, determiners); attempt any ten.' },
      { q: 4, type: 'writing', marks: 5, units: ['B2'], choice: either, note: 'Formal letter (complaint or enquiry), about 120 words; A or B.' },
      { q: 5, type: 'writing', marks: 5, units: ['B2'], choice: either, note: 'Analytical paragraph on a chart, table or cue, about 120 words; A or B.' },
    ] },
    { id: 'C', title: 'Literature', slots: [
      { q: 6, type: 'extract', marks: 5, units: ['C1'], choice: either, note: 'Poetry extract from First Flight with 5 marks of questions; extract A or B.' },
      { q: 7, type: 'extract', marks: 5, units: ['C1'], choice: either, note: 'Prose extract from First Flight with 5 marks of questions; extract A or B.' },
      { q: 8, type: 'lit_short', marks: 12, units: ['C1'], choice: { kind: 'any', attempt: 4, of: 5 }, note: 'Five short questions of 3 marks on First Flight, about 40–50 words each; attempt any four.' },
      { q: 9, type: 'lit_short', marks: 6, units: ['C2'], choice: { kind: 'any', attempt: 2, of: 3 }, note: 'Three short questions of 3 marks on Footprints without Feet, about 40–50 words each; attempt any two.' },
      { q: 10, type: 'lit_long', marks: 6, units: ['C1'], choice: either, note: 'Long answer on First Flight, about 100–120 words; one of two.' },
      { q: 11, type: 'lit_long', marks: 6, units: ['C2'], choice: either, note: 'Long answer on Footprints without Feet, about 100–120 words; one of two.' },
    ] },
  ],
};

// ── Class 12 ────────────────────────────────────────────────────────────────

function science12(subject: 'Physics' | 'Chemistry' | 'Biology', code: string, choices: { B: number[]; C: number[]; Dsub: boolean; E: number[]; caseParts: number[] }, extra: string[]): PaperDesign {
  return {
    key: `12-${subject.toLowerCase()}`, cls: 12, subject, code, maxMarks: 70, minutes: 180, source: SQP12,
    instructions: [
      'This paper has 33 compulsory questions in five sections, A to E.',
      'Section A: 16 questions of 1 mark (12 multiple choice and 4 assertion–reason). Section B: 5 questions of 2 marks. Section C: 7 questions of 3 marks. Section D: 2 case-based questions of 4 marks. Section E: 3 long-answer questions of 5 marks.',
      'There is no overall choice; some questions have an internal choice. Visually impaired candidates answer the separate questions given in place of those with figures.',
      ...extra,
    ],
    sections: [
      { id: 'A', title: 'Section A', slots: [...run(1, 12, 'mcq', 1), ...run(13, 16, 'assertion_reason', 1)] },
      { id: 'B', title: 'Section B', slots: choose(run(17, 21, 'vsa', 2), choices.B) },
      { id: 'C', title: 'Section C', slots: choose(run(22, 28, 'sa', 3), choices.C) },
      { id: 'D', title: 'Section D', slots: run(29, 30, 'case', 4, { parts: choices.caseParts, ...(choices.Dsub ? { choice: subpart } : {}) }) },
      { id: 'E', title: 'Section E', slots: choose(run(31, 33, 'la', 5), choices.E) },
    ],
  };
}

const maths12: PaperDesign = {
  key: '12-maths', cls: 12, subject: 'Mathematics', code: '041', maxMarks: 80, minutes: 180, source: SQP12,
  instructions: [
    'This paper has 38 compulsory questions in five sections, A to E.',
    'Section A: questions 1–18 are multiple choice and 19–20 are assertion–reason, 1 mark each. Section B: 2 marks each. Section C: 3 marks each. Section D: 5 marks each. Section E: three case studies of 4 marks each.',
    'There is no overall choice. Internal choices are given in 2 questions of Section B, 3 of Section C, 2 of Section D and one sub-part each in 2 questions of Section E.',
    'Draw neat figures wherever required. Take π = 22/7 unless stated. Calculators are not allowed.',
  ],
  sections: [
    { id: 'A', title: 'Section A', slots: [...run(1, 18, 'mcq', 1), ...run(19, 20, 'assertion_reason', 1)] },
    { id: 'B', title: 'Section B', slots: choose(run(21, 25, 'vsa', 2), [22, 24]) },
    { id: 'C', title: 'Section C', slots: choose(run(26, 31, 'sa', 3), [27, 29, 31]) },
    { id: 'D', title: 'Section D', slots: choose(run(32, 35, 'la', 5), [33, 35]) },
    { id: 'E', title: 'Section E', slots: [
      { q: 36, type: 'case', marks: 4, parts: [1, 1, 2], choice: subpart }, { q: 37, type: 'case', marks: 4, parts: [1, 1, 2], choice: subpart },
      { q: 38, type: 'case', marks: 4, parts: [2, 2] },
    ] },
  ],
};

export const DESIGNS: PaperDesign[] = [
  science10, maths10('Standard', '041'), maths10('Basic', '241'), social10, english10,
  science12('Physics', '042', { B: [18, 20], C: [25], Dsub: false, E: [31, 32, 33], caseParts: [1, 1, 1, 1] }, [
    'Calculators are not allowed. Use the constants given where needed: c = 3 × 10⁸ m/s, mₑ = 9.1 × 10⁻³¹ kg, e = 1.6 × 10⁻¹⁹ C, μ₀ = 4π × 10⁻⁷ T m A⁻¹, h = 6.63 × 10⁻³⁴ J s, ε₀ = 8.854 × 10⁻¹² C² N⁻¹ m⁻².',
  ]),
  science12('Chemistry', '043', { B: [19], C: [26], Dsub: true, E: [31, 32, 33], caseParts: [1, 1, 2] }, ['Log tables and calculators are not allowed.']),
  maths12,
  science12('Biology', '044', { B: [18, 19, 21], C: [], Dsub: true, E: [31, 32, 33], caseParts: [1, 1, 2] }, ['Draw neat, labelled diagrams wherever needed.']),
];

/** Every slot, in question order. */
export const slotsOf = (d: PaperDesign) => d.sections.flatMap(s => s.slots.map(slot => ({ ...slot, section: s.id, units: slot.units ?? s.units })));

/** Marks the paper is out of, from its slots (each question counts once, whatever its choices). */
export const designMarks = (d: PaperDesign) => slotsOf(d).reduce((n, s) => n + s.marks, 0);

/** The designs for a class and subject (two for Class 10 Mathematics). */
export function designsFor(cls: string, subject: string): PaperDesign[] {
  const n = Number(/\d{1,2}/.exec(cls)?.[0]);
  const norm = (x: string) => x.toLowerCase().replace(/[^a-z]/g, '');
  return DESIGNS.filter(d => d.cls === n && norm(d.subject) === norm(subject));
}

export const designByKey = (key: unknown) => (typeof key === 'string' && DESIGNS.find(d => d.key === key)) || null;
