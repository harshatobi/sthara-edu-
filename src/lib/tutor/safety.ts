/**
 * Shared input/output safety filter for the AI tutor routes (school use, ages 10–18).
 */
/* ── Foul language word list ── */
const FOUL_WORDS = [
  'fuck', 'shit', 'damn', 'bitch', 'ass', 'bastard', 'crap', 'piss',
  'cock', 'dick', 'pussy', 'cunt', 'asshole', 'motherfucker', 'wtf',
  'hell', 'sex', 'nude', 'porn', 'bullshit', 'whore', 'slut',
  'madarchod', 'bsdk', 'bhosdi', 'chutiya', 'randi', 'lund', 'gaand',
  'harami', 'mc', 'bc', 'sala', 'saala', 'maryadaga',
];

export function containsFoulLanguage(text: string): boolean {
  // Normalize: lowercase, replace non-alphanumeric with spaces
  const lower = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
  return FOUL_WORDS.some(word => {
    // ONLY use word-boundary regex — never plain includes()
    // because includes('ass') would false-positive on 'class', 'mass', 'surpass', etc.
    const regex = new RegExp(`\\b${word}\\b`, 'i');
    return regex.test(lower);
  });
}
