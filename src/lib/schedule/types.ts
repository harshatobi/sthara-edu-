/** Rows and shapes for scheduling (bells, calendar, rooms, timetable, staff register). Mirrors 20260927100000_scheduling.sql. */

export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7; // ISO: 1 = Monday
export const WEEKDAYS: Weekday[] = [1, 2, 3, 4, 5, 6, 7];
export const DAY_NAMES = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const DAY_SHORT = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export interface Wing { id: string; name: string; grade_from: number; grade_to: number }

export type PeriodKind = 'period' | 'break' | 'lunch' | 'assembly' | 'other';
export interface BellPeriod { id?: string; seq: number; label: string; kind: PeriodKind; period_no: number | null; starts_at: string; ends_at: string }
export interface BellSchedule {
  id: string; name: string; wing_id: string | null; kind: 'regular' | 'variant'; weekdays: number[];
  periods: BellPeriod[];
}

export type RoomKind = 'classroom' | 'lab' | 'hall' | 'library' | 'ground' | 'other';
export interface Room { id: string; name: string; kind: RoomKind; capacity: number | null; home_class: string | null; active: boolean }

export type EventKind = 'holiday' | 'exam' | 'ptm' | 'meeting' | 'event' | 'other';
export type StaffScope = 'all' | 'teaching' | 'office' | 'none';
export interface AcademicEvent {
  id: string; title: string; kind: EventKind; starts_on: string; ends_on: string; wing_ids: string[] | null;
  bell_schedule_id: string | null; suspends_classes: boolean; staff_scope: StaffScope;
  starts_at: string | null; ends_at: string | null; notes: string | null;
}

export type VersionStatus = 'draft' | 'published' | 'archived';
export interface TimetableVersion {
  id: string; session: string; name: string; status: VersionStatus; effective_from: string | null;
  source: 'manual' | 'import' | 'copy' | 'solver'; notes: string | null; published_at: string | null; created_at: string;
}

export interface Slot {
  id?: string; version_id?: string; class: string; group_label: string; weekday: number; period_no: number;
  subject: string; teacher_id: string | null; room_id: string | null; combined: boolean;
}

export type StaffCategory = 'teaching' | 'office' | 'support' | 'assistant';
export const STAFF_CATEGORIES: Record<StaffCategory, string> = {
  teaching: 'Teaching', office: 'Office', support: 'Support staff', assistant: 'Lab, library and IT',
};
export interface StaffMember {
  id: string; user_id: string | null; name: string; category: StaffCategory; designation: string; wing_id: string | null;
  phone_e164: string | null; employee_code: string | null; joined_on: string | null; active: boolean;
}

export const EVENT_KINDS: Record<EventKind, string> = {
  holiday: 'Holiday', exam: 'Exams', ptm: 'Parent-teacher meeting', meeting: 'Staff meeting', event: 'School event', other: 'Other',
};
export const ROOM_KINDS: Record<RoomKind, string> = {
  classroom: 'Classroom', lab: 'Lab', hall: 'Hall', library: 'Library', ground: 'Ground', other: 'Other',
};
export const PERIOD_KINDS: Record<PeriodKind, string> = {
  period: 'Period', break: 'Break', lunch: 'Lunch', assembly: 'Assembly', other: 'Other',
};

/** Everything scheduling needs for one school, as loaded (RLS decides drafts and the register). */
export interface ScheduleRows {
  schoolName: string;
  wings: Wing[];
  bells: BellSchedule[];
  rooms: Room[];
  events: AcademicEvent[];
  versions: TimetableVersion[];
  slots: Slot[];
  staff: StaffMember[];
  /** Teacher and office accounts: id, name, role, email, scope source columns. */
  people: { id: string; name: string; role: 'teacher' | 'admin'; email: string | null; assignments?: unknown; teacher_class?: string | null; teacher_subject?: string | null }[];
  /** Section names seen on students (display form). */
  studentClasses: string[];
  /** Approved leave, own or (for the office) the school's. */
  leave: { id: string; staff_id: string; leave_type: string; from_date: string; to_date: string; half_day: boolean; status: string }[];
  missing: string[];
}
