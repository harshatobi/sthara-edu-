/**
 * Shared input/output safety filter for the AI tutor (school use, ages 10-18).
 * Both checks run before any model is called.
 */

/*
 * Foul language. Words that are also syllabus vocabulary are not on the list:
 * "sex" (Biology: sex determination, reproduction), "hell" and "damn" (English
 * literature), "BC" (History dates) and "MC" (Roman numerals, "MCQ" notes).
 */
const FOUL_WORDS = [
  'fuck', 'shit', 'bitch', 'ass', 'bastard', 'crap', 'piss',
  'cock', 'dick', 'pussy', 'cunt', 'asshole', 'motherfucker', 'wtf',
  'nude', 'porn', 'bullshit', 'whore', 'slut',
  'madarchod', 'bsdk', 'bhosdi', 'chutiya', 'randi', 'lund', 'gaand',
  'harami', 'sala', 'saala', 'maryadaga',
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

/*
 * Safety cues: self-harm, abuse, bullying. Deliberately about the student
 * ("I", "me", "my"), so syllabus text about the same subjects doesn't trip it
 * ("the poet contemplates death", "child labour laws"). English, Hinglish and
 * Telugu-in-Latin-script. The classifier is a second net for what this misses.
 */
const SAFETY_PATTERNS: RegExp[] = [
  // self-harm
  /\b(i|im|i am|i'm)\s+(want|wanna|going|gonna|plan(ning)?|thinking( about)?)\s+(to\s+)?(die|kill myself|end (it|my life)|hurt myself|cut myself|suicide)\b/,
  /\b(kill|hurt|cut|harm)\s+myself\b/,
  /\b(end|ending)\s+my\s+life\b/,
  /\bsuicid(e|al)\b.*\b(i|me|my)\b|\b(i|me|my)\b.*\bsuicid(e|al)\b/,
  /\b(don'?t|do not|dont)\s+want\s+to\s+(live|be alive|exist)\b/,
  /\bno\s+(reason|point)\s+(to|in)\s+(live|living)\b/,
  /\b(marna|mar\s*jana|marjana)\s+(hai|chahta|chahti|chahiye)\b|\bmar\s*jaun(ga|gi)\b|\bkhud\s*ko\s+(maar|khatam|nuksan)\b|\bjeena\s+nahi\s+(hai|chahta|chahti)\b/,
  /\bchachipo(vali|thanu|tha)\b|\bnaaku\s+bratakalani\s+ledu\b/,
  // abuse
  /\b(he|she|they|someone|my (uncle|father|dad|mother|mom|step ?father|step ?mother|teacher|brother|cousin|tutor|neighbou?r))\s+(touches|touched|hits|hit|beats|beat|hurts|hurt|abuses|abused)\s+me\b/,
  /\b(i am|i'm|im)\s+(being\s+)?(abused|molested|beaten)\b/,
  /\b(touch(es|ed)?\s+me\s+(there|inappropriately|wrongly))\b/,
  // bullying and threats
  /\b(i am|i'm|im)\s+being\s+bullied\b|\b(they|everyone|classmates?)\s+(bully|bullies|bullied)\s+me\b/,
  /\b(threaten(s|ed)?\s+(to\s+)?(kill|hurt|beat)\s+me)\b/,
  /\b(scared|afraid)\s+to\s+go\s+(home|to school)\b/,
];

/** True when the message reads like the student is at risk. Never answered by the AI. */
export function safetySignals(text: string): boolean {
  const t = ` ${text.toLowerCase().replace(/[’]/g, "'").replace(/[^a-z0-9'\s]/g, ' ').replace(/\s+/g, ' ')} `;
  return SAFETY_PATTERNS.some(p => p.test(t));
}
