/**
 * Languages Studio materials can be made in: English plus the 12 Indian languages Sthara's curriculum covers.
 * The fonts are the Noto faces CanonShell already loads for each script.
 */
export interface StudioLanguage { code: string; name: string; native: string; script: string }

export const STUDIO_LANGUAGES: StudioLanguage[] = [
  { code: 'en', name: 'English', native: 'English', script: 'Latin' },
  { code: 'hi', name: 'Hindi', native: 'हिन्दी', script: 'Devanagari' },
  { code: 'mr', name: 'Marathi', native: 'मराठी', script: 'Devanagari' },
  { code: 'bn', name: 'Bengali', native: 'বাংলা', script: 'Bengali' },
  { code: 'as', name: 'Assamese', native: 'অসমীয়া', script: 'Bengali' },
  { code: 'gu', name: 'Gujarati', native: 'ગુજરાતી', script: 'Gujarati' },
  { code: 'pa', name: 'Punjabi', native: 'ਪੰਜਾਬੀ', script: 'Gurmukhi' },
  { code: 'or', name: 'Odia', native: 'ଓଡ଼ିଆ', script: 'Oriya' },
  { code: 'ta', name: 'Tamil', native: 'தமிழ்', script: 'Tamil' },
  { code: 'te', name: 'Telugu', native: 'తెలుగు', script: 'Telugu' },
  { code: 'kn', name: 'Kannada', native: 'ಕನ್ನಡ', script: 'Kannada' },
  { code: 'ml', name: 'Malayalam', native: 'മലയാളം', script: 'Malayalam' },
  { code: 'ur', name: 'Urdu', native: 'اردو', script: 'Nastaliq' },
];

export const languageOf = (code: string | null | undefined) => STUDIO_LANGUAGES.find(l => l.code === code) ?? STUDIO_LANGUAGES[0];
export const isLanguage = (code: unknown): code is string => typeof code === 'string' && STUDIO_LANGUAGES.some(l => l.code === code);
/** Urdu reads right to left. */
export const isRtl = (code: string) => code === 'ur';
