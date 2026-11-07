import type { ReactNode } from 'react';
import { GraduationCapIcon as GraduationCap } from '@phosphor-icons/react/dist/ssr/GraduationCap';
import { CalendarCheckIcon as CalendarCheck } from '@phosphor-icons/react/dist/ssr/CalendarCheck';
import { ExamIcon as Exam } from '@phosphor-icons/react/dist/ssr/Exam';
import { ChartLineUpIcon as ChartLineUp } from '@phosphor-icons/react/dist/ssr/ChartLineUp';
import { NotebookIcon as Notebook } from '@phosphor-icons/react/dist/ssr/Notebook';
import { CurrencyInrIcon as CurrencyInr } from '@phosphor-icons/react/dist/ssr/CurrencyInr';
import { TrophyIcon as Trophy } from '@phosphor-icons/react/dist/ssr/Trophy';
import { CertificateIcon as Certificate } from '@phosphor-icons/react/dist/ssr/Certificate';
import { FileTextIcon as FileText } from '@phosphor-icons/react/dist/ssr/FileText';
import { FirstAidKitIcon as FirstAidKit } from '@phosphor-icons/react/dist/ssr/FirstAidKit';
import { GavelIcon as Gavel } from '@phosphor-icons/react/dist/ssr/Gavel';
import { WarningCircleIcon as WarningCircle } from '@phosphor-icons/react/dist/ssr/WarningCircle';
import { HandHeartIcon as HandHeart } from '@phosphor-icons/react/dist/ssr/HandHeart';
import { SmileyIcon as Smiley } from '@phosphor-icons/react/dist/ssr/Smiley';
import { SignInIcon as SignIn } from '@phosphor-icons/react/dist/ssr/SignIn';
import { BrainIcon as Brain } from '@phosphor-icons/react/dist/ssr/Brain';
import type { Source } from '@/lib/timeline/rules';

const ic = (n: ReactNode) => n;
export const ICON: Record<Source, ReactNode> = {
  enrolment: ic(<GraduationCap size={16} weight="duotone" />), before: ic(<SignIn size={16} weight="duotone" />), attendance: ic(<CalendarCheck size={16} weight="duotone" />),
  results: ic(<Exam size={16} weight="duotone" />), tml: ic(<ChartLineUp size={16} weight="duotone" />), homework: ic(<Notebook size={16} weight="duotone" />),
  fees: ic(<CurrencyInr size={16} weight="duotone" />), kirti: ic(<Trophy size={16} weight="duotone" />), certificates: ic(<Certificate size={16} weight="duotone" />),
  documents: ic(<FileText size={16} weight="duotone" />), health: ic(<FirstAidKit size={16} weight="duotone" />), discipline: ic(<Gavel size={16} weight="duotone" />),
  incidents: ic(<WarningCircle size={16} weight="duotone" />), counselling: ic(<HandHeart size={16} weight="duotone" />), wellness: ic(<Smiley size={16} weight="duotone" />),
  tutor: ic(<Brain size={16} weight="duotone" />),
};
/** Which milestone speaks for a month on the river when there are several. */
export const PIN_ORDER: Source[] = ['enrolment', 'results', 'kirti', 'certificates', 'tml', 'tutor', 'attendance'];

