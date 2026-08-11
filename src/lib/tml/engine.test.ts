import {
  calculateTopicTml,
  getAssistanceModifier,
  getAttemptModifier,
  getRecencyModifier,
  computeItemWeight,
  normalizeComponentType,
  TmlItemInput,
} from './engine';

describe('TML Engine Unit Tests', () => {
  test('Assistance Modifier values match specification', () => {
    expect(getAssistanceModifier(0, false)).toBe(1.00); // unaided
    expect(getAssistanceModifier(1, false)).toBe(0.95); // 1 hint
    expect(getAssistanceModifier(2, false)).toBe(0.85); // multi hints
    expect(getAssistanceModifier(0, true)).toBe(0.70);  // answer revealed
  });

  test('Attempt Modifier values match specification', () => {
    expect(getAttemptModifier(1)).toBe(1.00); // 1st attempt
    expect(getAttemptModifier(2)).toBe(0.95); // 2nd attempt
    expect(getAttemptModifier(3)).toBe(0.90); // 3rd+ attempt
  });

  test('Recency Modifier computes 60-day half-life decay', () => {
    expect(getRecencyModifier(0)).toBeCloseTo(1.0, 4);
    expect(getRecencyModifier(60)).toBeCloseTo(0.5, 4);
    expect(getRecencyModifier(120)).toBeCloseTo(0.25, 4);
  });

  test('Evidence Gate Confidence Bands are set strictly based on item count', () => {
    const makeItems = (count: number): TmlItemInput[] =>
      Array.from({ length: count }, (_, i) => ({
        score: 8,
        maxScore: 10,
        componentType: 'homework',
        ageDays: 5,
        topicName: 'Chemical Reactions',
      }));

    // 0-3 items -> 'insufficient' (topicTml is null)
    const res3 = calculateTopicTml(makeItems(3));
    expect(res3.confidenceBand).toBe('insufficient');
    expect(res3.topicTml).toBeNull();
    expect(res3.totalItemCount).toBe(3);

    // 4-7 items -> 'provisional' (score shown)
    const res5 = calculateTopicTml(makeItems(5));
    expect(res5.confidenceBand).toBe('provisional');
    expect(res5.topicTml).toBe(80.0);
    expect(res5.totalItemCount).toBe(5);

    // 8+ items -> 'firm'
    const res8 = calculateTopicTml(makeItems(8));
    expect(res8.confidenceBand).toBe('firm');
    expect(res8.topicTml).toBe(80.0);
    expect(res8.totalItemCount).toBe(8);
  });

  test('Normalizes component type names accurately', () => {
    expect(normalizeComponentType('assessment')).toBe('assessment');
    expect(normalizeComponentType('midterm test')).toBe('assessment');
    expect(normalizeComponentType('quiz')).toBe('quiz');
    expect(normalizeComponentType('homework')).toBe('homework');
    expect(normalizeComponentType('retention check')).toBe('retention');
    expect(normalizeComponentType('classwork')).toBe('classwork');
  });

  test('Calculates deterministic renormalized component weights without mock data', () => {
    const items: TmlItemInput[] = [
      { score: 9, maxScore: 10, componentType: 'assessment', ageDays: 0, hintsUsed: 0, attemptNumber: 1 },
      { score: 8, maxScore: 10, componentType: 'quiz', ageDays: 0, hintsUsed: 0, attemptNumber: 1 },
      { score: 10, maxScore: 10, componentType: 'homework', ageDays: 0, hintsUsed: 0, attemptNumber: 1 },
      { score: 7, maxScore: 10, componentType: 'homework', ageDays: 0, hintsUsed: 0, attemptNumber: 1 },
      { score: 9, maxScore: 10, componentType: 'retention', ageDays: 0, hintsUsed: 0, attemptNumber: 1 },
      { score: 8, maxScore: 10, componentType: 'classwork', ageDays: 0, hintsUsed: 0, attemptNumber: 1 },
      { score: 9, maxScore: 10, componentType: 'classwork', ageDays: 0, hintsUsed: 0, attemptNumber: 1 },
      { score: 10, maxScore: 10, componentType: 'assessment', ageDays: 0, hintsUsed: 0, attemptNumber: 1 },
    ];

    const result = calculateTopicTml(items);
    expect(result.totalItemCount).toBe(8);
    expect(result.confidenceBand).toBe('firm');
    expect(result.topicTml).toBeGreaterThan(0);
    expect(result.renormalizedWeightsSum).toBe(100); // 45 + 20 + 15 + 15 + 5
  });
});
