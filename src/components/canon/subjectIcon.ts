import type { Icon as PhosphorIcon } from '@phosphor-icons/react';
import { AtomIcon as Atom } from '@phosphor-icons/react/dist/ssr/Atom';
import { BookOpenTextIcon as BookOpenText } from '@phosphor-icons/react/dist/ssr/BookOpenText';
import { FlaskIcon as Flask } from '@phosphor-icons/react/dist/ssr/Flask';
import { GlobeHemisphereWestIcon as GlobeHemisphereWest } from '@phosphor-icons/react/dist/ssr/GlobeHemisphereWest';
import { MathOperationsIcon as MathOperations } from '@phosphor-icons/react/dist/ssr/MathOperations';
import { TranslateIcon as Translate } from '@phosphor-icons/react/dist/ssr/Translate';
import { subjectColor, subjectKey } from '@/lib/student/shape';

/** One glyph per subject, used wherever a subject needs a badge (never initials). */
export function subjectIcon(subject: string): PhosphorIcon {
  const k = subjectKey(subject);
  if (k.startsWith('math')) return MathOperations;
  if (k.includes('physics')) return Atom;
  if (k.includes('science') || k.includes('chem') || k.includes('bio')) return Flask;
  if (k.includes('social') || k.includes('history') || k.includes('geog') || k.includes('civics')) return GlobeHemisphereWest;
  if (k.includes('hindi') || k.includes('sanskrit') || k.includes('language') || k.includes('french')) return Translate;
  return BookOpenText; // English and anything else read-based
}

export const subjectBadge = (subject: string) => ({ Icon: subjectIcon(subject), color: subjectColor(subject) });
