export const TEACHER_SCOPE = [
  { classId: '10A', subject: 'Mathematics' },
  { classId: '10B', subject: 'Mathematics' },
  { classId: '9C', subject: 'Mathematics' },
  { classId: '9D', subject: 'Mathematics' },
] as const;
export type ClassId = typeof TEACHER_SCOPE[number]['classId'];
export type TeacherView = 'dash' | 'syl' | 'quiz' | 'ai' | 'heat' | 'mast' | 'feed' | 'well' | 'review';
export const TOPICS = ['Real Numbers', 'Polynomials', 'Linear Equations', 'Quadratics', 'Triangles'];
export const STUDENTS = [
  { id: 's1', name: 'Ananya Iyer', classId: '10A', scores: [88,72,64,41,79], energy: 72 },
  { id: 's2', name: 'Divya Krishnan', classId: '10A', scores: [35,29,24,18,31], energy: 35 },
  { id: 's3', name: 'Vikram Rao', classId: '10B', scores: [94,86,81,72,90], energy: 80 },
  { id: 's4', name: 'Sana Qureshi', classId: '10B', scores: [48,41,37,22,44], energy: 28 },
  { id: 's5', name: 'Meera Nair', classId: '9C', scores: [62,58,49,33,61], energy: 65 },
  { id: 's6', name: 'Aditya Sharma', classId: '9C', scores: [79,74,68,55,71], energy: 76 },
  { id: 's7', name: 'Rahul Menon', classId: '9D', scores: [71,66,59,44,68], energy: 38 },
  { id: 's8', name: 'Arjun Pillai', classId: '9D', scores: [83,77,70,61,80], energy: 83 },
] as const;
export interface DemoTask { id: string; classId: ClassId; title: string; type: 'Homework' | 'Quiz' | 'Remedial'; }
export interface DemoGrade { studentId: string; score: number; status: 'pending' | 'approved'; }
export interface DemoEvent { id: string; at: string; actor: string; classId: ClassId; action: string; before?: number; after?: number; reason?: string; }
export interface TeacherDemo {
  version: 1;
  tasks: DemoTask[];
  grades: DemoGrade[];
  resolved: string[];
  events: DemoEvent[];
}
export const INITIAL_DEMO: TeacherDemo = {
  version: 1,
  tasks: TEACHER_SCOPE.map(({ classId }) => ({ id: `seed-${classId}`, classId, title: 'Algebra practice', type: 'Homework' })),
  grades: STUDENTS.map((s, i) => ({ studentId: s.id, score: 7 + i % 8, status: 'pending' })),
  resolved: [], events: [],
};
export type DemoAction =
  | { type: 'task'; classId: ClassId; title: string; kind: DemoTask['type'] }
  | { type: 'grade'; classId: ClassId; studentId: string; score: number; reason: string }
  | { type: 'resolve'; classId: ClassId; studentId: string }
  | { type: 'note'; classId: ClassId; text: string };
export function isAssignedClass(value: unknown): value is ClassId {
  return TEACHER_SCOPE.some(s => s.classId === value);
}
export function applyDemoAction(state: TeacherDemo, action: DemoAction, actor: string, id: string, at: string): TeacherDemo {
  if (!isAssignedClass(action.classId)) throw new Error('This class is outside your assigned teaching scope.');
  let next = { ...state };
  const event: DemoEvent = { id, at, actor, classId: action.classId, action: '' };
  if (action.type === 'task') {
    if (!action.title.trim()) throw new Error('Enter an assignment title.');
    next = { ...next, tasks: [...state.tasks, { id, classId: action.classId, title: action.title.trim(), type: action.kind }] };
    event.action = `${action.kind} created: ${action.title.trim()}`;
  } else if (action.type === 'grade') {
    const student = STUDENTS.find(s => s.id === action.studentId && s.classId === action.classId);
    const grade = state.grades.find(g => g.studentId === action.studentId);
    if (!student || !grade) throw new Error('Student is outside the selected class.');
    if (!Number.isFinite(action.score) || action.score < 0 || action.score > 15) throw new Error('Score must be between 0 and 15.');
    if (grade.status === 'approved' && !action.reason.trim()) throw new Error('A reason is required to change an approved grade.');
    if (grade.status === 'approved' && grade.score === action.score) throw new Error('Enter a different score to record an amendment.');
    next.grades = state.grades.map(g => g.studentId === action.studentId ? { ...g, score: action.score, status: 'approved' } : g);
    event.action = `${grade.status === 'approved' ? 'Grade amended' : 'Grade approved'}: ${student.name}`;
    event.before = grade.score; event.after = action.score; event.reason = action.reason.trim();
  } else if (action.type === 'resolve') {
    const student = STUDENTS.find(s => s.id === action.studentId && s.classId === action.classId);
    if (!student) throw new Error('Student is outside the selected class.');
    if (state.resolved.includes(student.id)) throw new Error('This check-in has already been reviewed.');
    next.resolved = [...state.resolved, student.id];
    event.action = `Wellness check-in reviewed: ${student.name}`;
  } else {
    if (!action.text.trim()) throw new Error('Enter a note.');
    event.action = action.text.trim();
  }
  return { ...next, events: [event, ...state.events] };
}

/** Treat browser storage as untrusted; malformed records must never break rendering. */
export function parseDemo(raw: string | null): TeacherDemo {
  if (!raw) return INITIAL_DEMO;
  try {
    const d = JSON.parse(raw) as TeacherDemo;
    if (d.version !== 1 || !Array.isArray(d.tasks) || !Array.isArray(d.grades) || !Array.isArray(d.events) || !Array.isArray(d.resolved)) return INITIAL_DEMO;
    if (!d.tasks.every(t => t && typeof t.id === 'string' && isAssignedClass(t.classId) && typeof t.title === 'string' && ['Homework','Quiz','Remedial'].includes(t.type))) return INITIAL_DEMO;
    if (d.grades.length !== STUDENTS.length || new Set(d.grades.map(g => g?.studentId)).size !== STUDENTS.length || !d.grades.every(g => g && STUDENTS.some(s => s.id === g.studentId) && Number.isFinite(g.score) && g.score >= 0 && g.score <= 15 && ['pending','approved'].includes(g.status))) return INITIAL_DEMO;
    if (!d.resolved.every(id => STUDENTS.some(s => s.id === id))) return INITIAL_DEMO;
    if (!d.events.every(e => e && typeof e.id === 'string' && typeof e.actor === 'string' && typeof e.at === 'string' && !Number.isNaN(Date.parse(e.at)) && typeof e.action === 'string' && isAssignedClass(e.classId) && (e.reason === undefined || typeof e.reason === 'string') && (e.before === undefined || Number.isFinite(e.before)) && (e.after === undefined || Number.isFinite(e.after)))) return INITIAL_DEMO;
    return d;
  } catch { return INITIAL_DEMO; }
}
