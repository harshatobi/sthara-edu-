/**
 * Canonical color per Phosphor icon, keyed by the icon's component name.
 * One source of truth so the same feature (e.g. "Brain" for AI) always
 * activates to the same color everywhere it appears in the app, instead of
 * drifting file to file. Used with <InteractiveIcon /> — see
 * src/components/ui/InteractiveIcon.tsx.
 */
export const ICON_COLORS: Record<string, string> = {
  // Navigation / feature areas
  SquaresFour: '#6366F1',        // indigo — dashboard
  Lightning: '#EAB308',          // yellow — syllabus / energy / explanations
  ClipboardText: '#14B8A6',      // teal — quiz
  Brain: '#EC799F',              // soft rose — AI brain
  Fire: '#F97316',               // orange — heat map
  ChartLineUp: '#3B82F6',        // blue — mastery / analytics / reports
  Bell: '#F59E0B',               // amber — notifications / situational feed
  Heart: '#F43F5E',              // rose — wellness
  SignOut: '#64748B',            // slate — neutral, deliberately unexciting
  UsersThree: '#06B6D4',         // cyan — people / groups
  Warning: '#EF4444',            // red — alerts / negative status
  NotePencil: '#7C3AED',         // violet — review / needs action
  BookOpen: '#10B981',           // emerald — classes / reading
  CheckSquare: '#22C55E',        // green — completed
  Check: '#22C55E',              // green — success
  CheckCircle: '#22C55E',        // green — positive status
  XCircle: '#EF4444',            // red — negative status
  PaperPlaneTilt: '#0EA5E9',     // sky — send / post
  Copy: '#64748B',               // slate — utility action
  DownloadSimple: '#0EA5E9',     // sky — export
  Sparkle: '#D946EF',            // fuchsia — AI-generated / regenerate
  ShieldCheck: '#059669',        // emerald (dark) — admin / security / DPDP
  CalendarBlank: '#0891B2',      // cyan (dark) — schedule / staff
  House: '#0EA5E9',              // sky — home / family
  ChatCircleDots: '#14B8A6',     // teal — messages
  Hourglass: '#F59E0B',          // amber — pending
  Target: '#F97316',             // orange — goals / pending tasks
  Trophy: '#F59E0B',             // amber — achievement
  FileText: '#3B82F6',           // blue — documents / homework
  ChalkboardTeacher: '#3B82F6',  // blue — teacher role
  BatteryLow: '#3B82F6',
  BatteryMedium: '#F59E0B',
  BatteryHigh: '#F59E0B',
  BatteryFull: '#10B981',
  Rocket: '#F59E0B',
  CurrencyInr: '#16A34A',        // green — money / fees
  Key: '#CA8A04',                // amber (dark) — roles & access
  DotsThreeCircle: '#64748B',    // slate — "More" overflow menu
  GearSix: '#64748B',            // slate — settings
  WhatsappLogo: '#25D366',       // WhatsApp green — the parent WhatsApp channel
  ChatsCircle: '#7C5CFC',        // violet — Ask the School OS
  EnvelopeSimple: '#0EA5E9',     // sky — messages with the school
  ListChecks: '#3B82F6',         // blue — schoolwork
  Receipt: '#16A34A',            // green — fee receipts
};

export function iconColor(name: keyof typeof ICON_COLORS | string, fallback = '#93A7C4'): string {
  return ICON_COLORS[name] ?? fallback;
}

/**
 * Looks up a color for a Phosphor icon *component reference* directly —
 * Phosphor sets each component's `displayName` to e.g. "BrainIcon", so this
 * strips the trailing "Icon" and looks it up in ICON_COLORS. Use this when
 * you have the component itself (e.g. from a `[key, label, Icon]` tuple)
 * rather than its name as a string.
 */
export function colorForIcon(Icon: { displayName?: string }, fallback = '#93A7C4'): string {
  const name = Icon.displayName?.replace(/Icon$/, '');
  return (name && ICON_COLORS[name]) || fallback;
}
