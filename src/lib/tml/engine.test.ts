// NOTE: no test runner (jest/vitest) is installed in this project — these
// assertions are kept in sync with the pure functions for documentation, but
// `run-test.ts` (plain Node assertions, runnable via `npx tsx`) is the one
// that actually executes today. Wire up a real runner before trusting this
// file to gate anything.
import {
  calculateTopicTml,
  getRecencyWeight,
  normalizeComponentType,
  getTutorDepthScore,
  blendFinalTml,
  normalizeTutorVolume,
  mapMasteryBand,
  TmlEvidenceItem,
} from './engine';

describe('TML Engine Unit Tests (2026-09-21 spec)', () => {
  test('Recency weight applies a 14-day half-life', () => {
    expect(getRecencyWeight(0)).toBeCloseTo(1.0, 4);
    expect(getRecencyWeight(14)).toBeCloseTo(0.5, 4);
    expect(getRecencyWeight(28)).toBeCloseTo(0.25, 4);
  });

  test('Component types normalize into homework/quiz/tutor', () => {
    expect(normalizeComponentType('quiz')).toBe('quiz');
    expect(normalizeComponentType('assessment')).toBe('quiz');
    expect(normalizeComponentType('midterm test')).toBe('quiz');
    expect(normalizeComponentType('retention check')).toBe('quiz');
    expect(normalizeComponentType('homework')).toBe('homework');
    expect(normalizeComponentType('classwork')).toBe('homework');
    expect(normalizeComponentType('tutor')).toBe('tutor');
  });

  test('Tutor depth score is the inverse of hints needed', () => {
    expect(getTutorDepthScore(0, false)).toBe(100);
    expect(getTutorDepthScore(1, false)).toBe(60);
    expect(getTutorDepthScore(2, false)).toBe(30);
    expect(getTutorDepthScore(0, true)).toBe(10);
  });

  test('Confidence factor follows N/5, capped at 1.0', () => {
    const makeItems = (count: number): TmlEvidenceItem[] =>
      Array.from({ length: count }, () => ({ score: 8, maxScore: 10, componentType: 'homework', ageDays: 0 }));

    expect(calculateTopicTml(makeItems(1)).confidenceBand).toBe('insufficient');
    expect(calculateTopicTml(makeItems(3)).confidenceBand).toBe('provisional');
    const firm = calculateTopicTml(makeItems(5));
    expect(firm.confidenceBand).toBe('firm');
    expect(firm.confidence).toBe(1.0);
    expect(calculateTopicTml(makeItems(10)).confidence).toBe(1.0);
  });

  test('Integrity violation applies a 0.85x confidence penalty and can demote the band', () => {
    const makeItems = (count: number): TmlEvidenceItem[] =>
      Array.from({ length: count }, () => ({ score: 8, maxScore: 10, componentType: 'homework', ageDays: 0 }));
    const penalized = calculateTopicTml(makeItems(5), { hadIntegrityViolation: true });
    expect(penalized.confidence).toBeCloseTo(0.85, 4);
    expect(penalized.confidenceBand).toBe('provisional');
  });

  test('Academic composite blends 0.40 homework + 0.40 quiz + 0.20 tutor, renormalized when sparse', () => {
    const allThree: TmlEvidenceItem[] = [
      { score: 80, maxScore: 100, componentType: 'homework', ageDays: 0 },
      { score: 90, maxScore: 100, componentType: 'quiz', ageDays: 0 },
      { score: 100, maxScore: 100, componentType: 'tutor', ageDays: 0 },
    ];
    const full = calculateTopicTml(allThree);
    expect(full.academicTml).toBeCloseTo(0.40 * 80 + 0.40 * 90 + 0.20 * 100, 1);

    const homeworkOnly = calculateTopicTml([{ score: 80, maxScore: 100, componentType: 'homework', ageDays: 0 }]);
    expect(homeworkOnly.academicTml).toBe(80);
  });

  test('Final blend combines academic score with student-level engagement signals', () => {
    const blended = blendFinalTml(80, { teacherEngagement: 90, attendance: 95, appEngagement: 70, tutorVolume: 50 });
    const expected = 0.70 * 80 + 0.10 * 90 + 0.10 * 95 + 0.05 * 70 + 0.05 * 50;
    expect(blended).toBeCloseTo(Math.round(expected * 10) / 10, 1);
    expect(blendFinalTml(null, {})).toBeNull();
  });

  test('Tutor volume normalizes session count against a 10-session ceiling', () => {
    expect(normalizeTutorVolume(0)).toBe(0);
    expect(normalizeTutorVolume(5)).toBe(50);
    expect(normalizeTutorVolume(20)).toBe(100);
  });

  test('Mastery bands map to the exact spec thresholds and colors', () => {
    expect(mapMasteryBand(95)).toEqual(expect.objectContaining({ band: 'Exemplary', color: '#10B981' }));
    expect(mapMasteryBand(80)).toEqual(expect.objectContaining({ band: 'Proficient', color: '#34D399' }));
    expect(mapMasteryBand(60)).toEqual(expect.objectContaining({ band: 'Developing', color: '#F5B60B' }));
    expect(mapMasteryBand(40)).toEqual(expect.objectContaining({ band: 'Critical Gap', color: '#F98A4B' }));
    expect(mapMasteryBand(20)).toEqual(expect.objectContaining({ band: 'Severe Need', color: '#E11D48' }));
    expect(mapMasteryBand(null)).toBeNull();
  });
});
