/**
 * What each Studio type looks like, shown before the teacher spends a
 * request. Hand-written, real CBSE content (Class 9 Science, "Cell" unless
 * noted) so the preview is honest about format and quality; the teacher's own
 * version is generated on their chapter, for their class.
 */
import type { Artifact, StudioKind } from './copilot';

export const SAMPLE_CONTEXT = 'Class 9 Science · Cell';

export const SAMPLES: Record<StudioKind, Artifact> = {
  worksheet: {
    kind: 'questions', purpose: 'worksheet', title: 'Cell: structure and function — practice', chapter: 'Cell',
    notes: 'Award step marks in Q3: 1 for naming the organelle, 1 for its function.',
    questions: [
      { type: 'mcq', questionText: 'Which organelle is called the powerhouse of the cell?', options: ['Ribosome', 'Mitochondrion', 'Golgi body', 'Lysosome'], answer: 1, marks: 1, level: 'EASY', why: 'Mitochondria release energy from food as ATP.' },
      { type: 'mcq', questionText: 'A cell placed in a concentrated salt solution will:', options: ['Swell', 'Burst', 'Shrink', 'Stay the same'], answer: 2, marks: 1, level: 'MEDIUM', why: 'Water leaves the cell by osmosis into the more concentrated solution.' },
      { type: 'short', questionText: 'Name the organelle that packages and dispatches proteins, and describe what it does.', marks: 2, level: 'MEDIUM', why: 'Golgi apparatus (1): modifies, stores and packages materials, sends them to where they are needed (1).' },
      { type: 'short', questionText: 'Why are lysosomes called "suicide bags"?', marks: 2, level: 'HARD', why: 'They hold digestive enzymes (1); if the cell is damaged they burst and digest the cell itself (1).' },
    ],
  },
  quiz: {
    kind: 'questions', purpose: 'quiz', title: 'Cell — 5-minute check', chapter: 'Cell', notes: '',
    questions: [
      { type: 'mcq', questionText: 'Who first saw cells, in a slice of cork?', options: ['Leeuwenhoek', 'Robert Hooke', 'Robert Brown', 'Purkinje'], answer: 1, marks: 1, level: 'EASY', why: 'Hooke, 1665, with a self-made microscope.' },
      { type: 'mcq', questionText: 'Which of these is found in plant cells but not animal cells?', options: ['Cell membrane', 'Mitochondria', 'Cell wall', 'Nucleus'], answer: 2, marks: 1, level: 'EASY', why: 'The cellulose cell wall gives plant cells their rigid shape.' },
      { type: 'mcq', questionText: 'Prokaryotic cells lack:', options: ['A cell membrane', 'Ribosomes', 'A nuclear membrane', 'Genetic material'], answer: 2, marks: 1, level: 'MEDIUM', why: 'Their DNA sits in a nucleoid region with no membrane around it.' },
    ],
  },
  remedial: {
    kind: 'questions', purpose: 'remedial', title: 'Cell: back to basics', chapter: 'Cell',
    notes: 'Builds from recall to reasoning. Let students use the hint before you step in.',
    questions: [
      { type: 'mcq', questionText: 'The basic unit of life is the:', options: ['Atom', 'Cell', 'Tissue', 'Organ'], answer: 1, marks: 1, level: 'EASY', why: 'Hint: every living thing is made of at least one of these.' },
      { type: 'short', questionText: 'Draw a simple animal cell and label: cell membrane, cytoplasm, nucleus.', marks: 3, level: 'EASY', why: 'Hint: start with the outer boundary, then fill the inside.' },
      { type: 'short', questionText: 'In one sentence each, say what the nucleus and the cell membrane do.', marks: 2, level: 'MEDIUM', why: 'Nucleus controls the cell and holds DNA; membrane controls what enters and leaves.' },
    ],
  },
  exit_tickets: {
    kind: 'questions', purpose: 'exit_tickets', title: 'Exit ticket: Osmosis', chapter: 'Cell', notes: '',
    questions: [
      { type: 'mcq', questionText: 'Osmosis is the movement of:', options: ['Salt through a membrane', 'Water through a selectively permeable membrane', 'Any particle from high to low', 'Gas into a cell'], answer: 1, marks: 1, level: 'EASY' },
      { type: 'mcq', questionText: 'Raisins placed in water swell because water moves:', options: ['Out of the raisin', 'Into the raisin', 'Both ways equally', 'Not at all'], answer: 1, marks: 1, level: 'MEDIUM' },
      { type: 'mcq', questionText: 'Which is NOT an example of osmosis?', options: ['Roots absorbing water', 'Perfume spreading in a room', 'Raisins swelling', 'Salted cucumber losing water'], answer: 1, marks: 1, level: 'MEDIUM' },
    ],
  },
  lesson: {
    kind: 'lesson', title: 'Plant and animal cells: spot the difference', chapter: 'Cell', topics: ['Plant and animal cells'], durationMin: 40,
    objectives: ['Students will be able to name three differences between plant and animal cells.', 'Students will be able to explain why plant cells need a cell wall.'],
    successCriteria: ['I can label a plant cell and an animal cell.', 'I can explain one difference in my own words.'],
    priorKnowledge: 'Cell as the basic unit of life; nucleus, cytoplasm, cell membrane.',
    materials: [{ label: 'Onion peel and cheek-cell slides (or NCERT Fig 5.3, 5.4)' }, { label: 'Chart paper for a Venn diagram' }],
    stages: [
      { name: 'Starter', minutes: 5, teacher: 'Show a leaf and a drop of blood: "Both are made of cells. What could be different?"', students: 'Pair-share two guesses; three pairs report back.' },
      { name: 'Teach & model', minutes: 12, teacher: 'Draw both cells side by side; label cell wall, vacuole and chloroplast; link each to a job.', students: 'Copy and label; mark the three plant-only parts.' },
      { name: 'Practice', minutes: 17, teacher: 'Circulate while groups build a Venn diagram; probe "why" for each difference.', students: 'Groups of four complete the Venn and write one "because" sentence each.' },
      { name: 'Exit check', minutes: 6, teacher: 'Pose the exit question; collect answers.', students: 'Answer on a slip: "Why would a plant wilt without its vacuole?"' },
    ],
    differentiation: { support: 'Give a partly labelled diagram and a word bank.', stretch: 'Ask why red blood cells have no nucleus.' },
    checkForUnderstanding: '"Why would a plant wilt without its vacuole?" Expected: the vacuole holds water that keeps the cell firm (turgid).',
  },
  explain: {
    kind: 'document', title: 'Osmosis, three ways', audience: 'teacher',
    markdown: '**Concrete.** Put a raisin in water overnight. It swells: water moved *into* it, where there was less water and more sugar.\n\n**Visual.** Draw a U-tube with a membrane in the middle, pure water on the left and sugar water on the right. Arrows show water crossing to the right until the levels differ.\n\n**Abstract.** Osmosis is the net movement of water through a selectively permeable membrane from a region of higher water concentration to lower water concentration.\n\n*Check:* "Why does a salted cucumber go soft?"',
  },
  discussion: {
    kind: 'document', title: 'Discussion: are all cells alike?', audience: 'teacher',
    markdown: '1. **If every organism is made of cells, why don’t we all look the same?** *Follow up:* "What would change first: the cells, or how they’re arranged?"\n2. **A bacterium has no nucleus. Is it still "alive"? Convince me.**\n3. **Which organelle could a cell survive without for a day? Which not even for a minute?**\n4. **Why might a muscle cell have more mitochondria than a skin cell?**',
  },
  rubric: {
    kind: 'rubric', title: 'Diagram of a cell — rubric',
    criteria: [
      { name: 'Accuracy of structures', levels: [{ label: 'Exceeds', descriptor: 'All structures correct, in proportion', points: 4 }, { label: 'Meets', descriptor: 'Structures correct, minor proportion errors', points: 3 }, { label: 'Approaching', descriptor: 'One or two structures missing or wrong', points: 2 }, { label: 'Beginning', descriptor: 'Several structures missing', points: 1 }] },
      { name: 'Labelling', levels: [{ label: 'Exceeds', descriptor: 'All labels correct, with a function note', points: 4 }, { label: 'Meets', descriptor: 'All labels correct', points: 3 }, { label: 'Approaching', descriptor: 'Some labels wrong', points: 2 }, { label: 'Beginning', descriptor: 'Few or no labels', points: 1 }] },
      { name: 'Neatness', levels: [{ label: 'Exceeds', descriptor: 'Clean lines, ruled label lines', points: 4 }, { label: 'Meets', descriptor: 'Clear and readable', points: 3 }, { label: 'Approaching', descriptor: 'Hard to read in places', points: 2 }, { label: 'Beginning', descriptor: 'Hard to read', points: 1 }] },
    ],
  },
  answer_key: {
    kind: 'document', title: 'Marking scheme — Unit test, Q1 to Q3', audience: 'teacher',
    markdown: '| Q | Answer | Marks |\n|---|---|---|\n| 1 | (b) Mitochondrion | 1 |\n| 2 | Golgi apparatus — packages and dispatches materials | 1 + 1 |\n| 3 | Diffusion: any particles, high to low. Osmosis: water only, through a selectively permeable membrane. | 1 + 1 + 1 |\n\n*Accept* "semi-permeable" for "selectively permeable". *Do not accept* "water moves to the salty side" without the membrane.',
  },
  parent_note: {
    kind: 'document', title: 'Note to Aarav’s parents', audience: 'parent',
    markdown: 'Dear Mr and Mrs Sharma,\n\nAarav has a real curiosity for Science. He asked the best question in class this week about why onion cells look like bricks.\n\nHe has missed the last two homework tasks on Cells, and his quiz score (45%) tells me the ideas haven’t quite settled yet.\n\n**One thing that would help at home:** ask him to explain one part of a cell to you in two minutes, three evenings this week.\n\nWarm regards,\nPriya Menon',
  },
};
