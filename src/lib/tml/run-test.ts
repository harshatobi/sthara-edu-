import {
  calculateTopicTml,
  getAssistanceModifier,
  getAttemptModifier,
  getRecencyModifier,
  computeItemWeight,
  normalizeComponentType,
  TmlItemInput,
} from './engine';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`[TEST FAILED] ${message}`);
  }
}

console.log('--- STARTING TML PIPELINE VERIFICATION TESTS ---');

// Test 1: Assistance Modifiers
assert(getAssistanceModifier(0, false) === 1.00, 'Unaided modifier should be 1.00');
assert(getAssistanceModifier(1, false) === 0.95, '1 hint modifier should be 0.95');
assert(getAssistanceModifier(2, false) === 0.85, 'Multi hint modifier should be 0.85');
assert(getAssistanceModifier(0, true) === 0.70, 'Answer revealed modifier should be 0.70');
console.log('✓ Test 1 Passed: Assistance Modifiers verified');

// Test 2: Attempt Modifiers
assert(getAttemptModifier(1) === 1.00, '1st attempt modifier should be 1.00');
assert(getAttemptModifier(2) === 0.95, '2nd attempt modifier should be 0.95');
assert(getAttemptModifier(3) === 0.90, '3rd attempt modifier should be 0.90');
console.log('✓ Test 2 Passed: Attempt Modifiers verified');

// Test 3: Recency Modifier (60-day half life decay)
assert(Math.abs(getRecencyModifier(0) - 1.0) < 0.0001, 'Day 0 recency weight should be 1.0');
assert(Math.abs(getRecencyModifier(60) - 0.5) < 0.0001, 'Day 60 recency weight should be 0.5');
assert(Math.abs(getRecencyModifier(120) - 0.25) < 0.0001, 'Day 120 recency weight should be 0.25');
console.log('✓ Test 3 Passed: Recency Bayesian Decay verified');

// Test 4: Strict Evidence Gate Confidence Bands
const makeItems = (count: number): TmlItemInput[] =>
  Array.from({ length: count }, () => ({
    score: 8,
    maxScore: 10,
    componentType: 'homework',
    ageDays: 2,
    topicName: 'Thermodynamics',
  }));

const gate3 = calculateTopicTml(makeItems(3));
assert(gate3.confidenceBand === 'insufficient', '3 items must be insufficient');
assert(gate3.topicTml === null, 'insufficient topicTml must be null');

const gate4 = calculateTopicTml(makeItems(4));
assert(gate4.confidenceBand === 'provisional', '4 items must be provisional');
assert(gate4.topicTml === 80.0, '4 items with 8/10 score should be 80.0');

const gate8 = calculateTopicTml(makeItems(8));
assert(gate8.confidenceBand === 'firm', '8 items must be firm');
assert(gate8.topicTml === 80.0, '8 items with 8/10 score should be 80.0');
console.log('✓ Test 4 Passed: Strict Evidence Gate Confidence Bands (0-3, 4-7, 8+) verified');

// Test 5: Component Type Normalization
assert(normalizeComponentType('assessment') === 'assessment', 'assessment normalized');
assert(normalizeComponentType('midterm test') === 'assessment', 'midterm test normalized');
assert(normalizeComponentType('quiz') === 'quiz', 'quiz normalized');
assert(normalizeComponentType('homework') === 'homework', 'homework normalized');
assert(normalizeComponentType('retention') === 'retention', 'retention normalized');
assert(normalizeComponentType('classwork') === 'classwork', 'classwork normalized');
console.log('✓ Test 5 Passed: Component Type Normalization verified');

// Test 6: Deterministic Renormalized Weight Sum & Scoring
const mixedItems: TmlItemInput[] = [
  { score: 10, maxScore: 10, componentType: 'assessment', ageDays: 0 },
  { score: 8, maxScore: 10, componentType: 'quiz', ageDays: 0 },
  { score: 9, maxScore: 10, componentType: 'homework', ageDays: 0 },
  { score: 7, maxScore: 10, componentType: 'homework', ageDays: 0 },
];
const mixedRes = calculateTopicTml(mixedItems);
assert(mixedRes.totalItemCount === 4, '4 mixed items count');
assert(mixedRes.confidenceBand === 'provisional', '4 items provisional');
assert(mixedRes.renormalizedWeightsSum === 80, 'Sum of assessment (45) + quiz (20) + homework (15) = 80');
assert(typeof mixedRes.topicTml === 'number', 'topicTml is numeric');
console.log('✓ Test 6 Passed: Deterministic Renormalization verified');

console.log('--- ALL TML PIPELINE VERIFICATION TESTS PASSED SUCCESSFULLY! ---');
