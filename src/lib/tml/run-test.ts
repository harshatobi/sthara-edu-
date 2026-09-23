import {
  getRecencyWeight,
  normalizeComponentType,
  getTutorDepthScore,
  calculateTopicTml,
  blendFinalTml,
  normalizeTutorVolume,
  mapMasteryBand,
  TmlEvidenceItem,
} from './engine';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`[TEST FAILED] ${message}`);
  }
}

console.log('--- STARTING TML ENGINE VERIFICATION TESTS (2026-09-21 spec) ---');

// Test 1: Recency decay — 14-day half-life
assert(Math.abs(getRecencyWeight(0) - 1.0) < 0.0001, 'Day 0 recency weight should be 1.0');
assert(Math.abs(getRecencyWeight(14) - 0.5) < 0.0001, 'Day 14 recency weight should be 0.5 (half-life)');
assert(Math.abs(getRecencyWeight(28) - 0.25) < 0.0001, 'Day 28 recency weight should be 0.25');
console.log('✓ Test 1 Passed: 14-day half-life exponential decay verified');

// Test 2: Component normalization — quiz absorbs assessment/test/midterm/retention
assert(normalizeComponentType('quiz') === 'quiz', 'quiz -> quiz');
assert(normalizeComponentType('assessment') === 'quiz', 'assessment -> quiz');
assert(normalizeComponentType('midterm test') === 'quiz', 'midterm test -> quiz');
assert(normalizeComponentType('retention check') === 'quiz', 'retention -> quiz');
assert(normalizeComponentType('homework') === 'homework', 'homework -> homework');
assert(normalizeComponentType('classwork') === 'homework', 'classwork -> homework');
assert(normalizeComponentType('tutor') === 'tutor', 'tutor -> tutor');
console.log('✓ Test 2 Passed: Component normalization verified');

// Test 3: Tutor depth score — inverse of hints needed
assert(getTutorDepthScore(0, false) === 100, 'Unaided session should score 100');
assert(getTutorDepthScore(1, false) === 60, '1-hint session should score 60');
assert(getTutorDepthScore(2, false) === 30, 'Multi-hint session should score 30');
assert(getTutorDepthScore(0, true) === 10, 'Answer-revealed session should score 10');
console.log('✓ Test 3 Passed: Tutor depth scoring verified');

// Test 4: Confidence bands — N/5 formula, not raw item-count bands
const makeItems = (count: number, type: string = 'homework'): TmlEvidenceItem[] =>
  Array.from({ length: count }, () => ({ score: 8, maxScore: 10, componentType: type, ageDays: 0 }));

const gate1 = calculateTopicTml(makeItems(1));
assert(gate1.confidenceBand === 'insufficient', '1 item (C=0.2) must be insufficient');
assert(gate1.confidence === 0.2, '1 item should give confidence 0.2');

const gate3 = calculateTopicTml(makeItems(3));
assert(gate3.confidenceBand === 'provisional', '3 items (C=0.6) must be provisional');

const gate5 = calculateTopicTml(makeItems(5));
assert(gate5.confidenceBand === 'firm', '5 items (C=1.0) must be firm');
assert(gate5.confidence === 1.0, '5 items should give confidence 1.0');

const gate10 = calculateTopicTml(makeItems(10));
assert(gate10.confidence === 1.0, 'confidence should cap at 1.0 beyond 5 items');
console.log('✓ Test 4 Passed: N/5 confidence factor and bands verified');

// Test 5: Integrity penalty demotes confidence band
const penalized = calculateTopicTml(makeItems(5), { hadIntegrityViolation: true });
assert(Math.abs(penalized.confidence - 0.85) < 0.0001, '5 items + violation should give confidence 0.85');
assert(penalized.confidenceBand === 'provisional', 'integrity violation should demote firm -> provisional');
console.log('✓ Test 5 Passed: Integrity penalty (0.85x) verified');

// Test 6: Academic composite weights (0.40/0.40/0.20), renormalized when sparse
const allThree: TmlEvidenceItem[] = [
  { score: 80, maxScore: 100, componentType: 'homework', ageDays: 0 },
  { score: 90, maxScore: 100, componentType: 'quiz', ageDays: 0 },
  { score: 100, maxScore: 100, componentType: 'tutor', ageDays: 0 },
];
const fullComposite = calculateTopicTml(allThree);
const expected = 0.40 * 80 + 0.40 * 90 + 0.20 * 100;
assert(Math.abs((fullComposite.academicTml ?? 0) - expected) < 0.05, `Full composite should be ~${expected}, got ${fullComposite.academicTml}`);

const homeworkOnly = calculateTopicTml([{ score: 80, maxScore: 100, componentType: 'homework', ageDays: 0 }]);
assert(homeworkOnly.academicTml === 80, `Homework-only topic should renormalize to just the homework score (80), got ${homeworkOnly.academicTml}`);
console.log('✓ Test 6 Passed: Academic composite (0.40H + 0.40Q + 0.20D) with renormalization verified');

// Test 7: Final blend — 0.70 academic + engagement terms
const blended = blendFinalTml(80, { teacherEngagement: 90, attendance: 95, appEngagement: 70, tutorVolume: 50 });
const expectedBlend = 0.70 * 80 + 0.10 * 90 + 0.10 * 95 + 0.05 * 70 + 0.05 * 50;
assert(Math.abs((blended ?? 0) - Math.round(expectedBlend * 10) / 10) < 0.05, `Blend should be ~${expectedBlend}, got ${blended}`);
assert(blendFinalTml(null, {}) === null, 'null academic score should propagate as null final score');
console.log('✓ Test 7 Passed: Final engagement blend (0.70/0.10/0.10/0.05/0.05) verified');

// Test 8: Tutor volume normalization
assert(normalizeTutorVolume(0) === 0, '0 sessions -> 0');
assert(normalizeTutorVolume(5) === 50, '5 of 10 ceiling -> 50');
assert(normalizeTutorVolume(20) === 100, '20 sessions capped at 100');
console.log('✓ Test 8 Passed: Tutor volume normalization verified');

// Test 9: Mastery band mapping — exact spec thresholds and colors
assert(mapMasteryBand(95)?.band === 'Exemplary' && mapMasteryBand(95)?.color === '#10B981', '95% -> Exemplary/#10B981');
assert(mapMasteryBand(80)?.band === 'Proficient' && mapMasteryBand(80)?.color === '#34D399', '80% -> Proficient/#34D399');
assert(mapMasteryBand(60)?.band === 'Developing' && mapMasteryBand(60)?.color === '#F5B60B', '60% -> Developing/#F5B60B');
assert(mapMasteryBand(40)?.band === 'Critical Gap' && mapMasteryBand(40)?.color === '#F98A4B', '40% -> Critical Gap/#F98A4B');
assert(mapMasteryBand(20)?.band === 'Severe Need' && mapMasteryBand(20)?.color === '#E11D48', '20% -> Severe Need/#E11D48');
assert(mapMasteryBand(null) === null, 'null score -> null band');
console.log('✓ Test 9 Passed: Mastery bands & colors verified');

console.log('--- ALL TML ENGINE VERIFICATION TESTS PASSED SUCCESSFULLY! ---');
