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
  /** For a solver-built draft: its score, what it couldn't place, and its warnings. */
  solver_report?: { score?: { total: number; soft: Record<string, number> }; unplaced?: { cls: string; subject: string; group: string; periods: number; reason: string }[]; warnings?: string[]; stats?: Record<string, number> } | null;
}

export interface Slot {
  id?: string; version_id?: string; class: string; group_label: string; weekday: number; period_no: number;
  subject: string; teacher_id: string | null; room_id: string | null; combined: boolean;
  /** A register member with no login who teaches this lesson (a visiting dance teacher); never set with teacher_id. */
  staff_member_id?: string | null;
  /** Kept where it is when the timetable is re-solved. */
  locked?: boolean;
}

/**
 * Who someone is across accounts and the staff register: a user id as-is, or "s:" + a register id
 * for someone with no login. Used as the key for clashes, load, cover and duties.
 */
export type PersonKey = string;
export const personKey = (userId: string | null | undefined, staffMemberId?: string | null): PersonKey | null =>
  userId || (staffMemberId ? `s:${staffMemberId}` : null);
export const slotPerson = (s: Pick<Slot, 'teacher_id' | 'staff_member_id'>) => personKey(s.teacher_id, s.staff_member_id);
/** A person key back to the two columns every scheduling table stores. */
export const personCols = (k: PersonKey) => (k.startsWith('s:') ? { user_id: null, staff_member_id: k.slice(2) } : { user_id: k, staff_member_id: null });
/** A person key (or '' for nobody) as a lesson's two teacher columns. */
export const slotTeacher = (k: PersonKey | '' | null) => (!k ? { teacher_id: null, staff_member_id: null }
  : k.startsWith('s:') ? { teacher_id: null, staff_member_id: k.slice(2) } : { teacher_id: k, staff_member_id: null });

export type StaffCategory = 'teaching' | 'office' | 'support' | 'assistant';
export const STAFF_CATEGORIES: Record<StaffCategory, string> = {
  teaching: 'Teaching', office: 'Office', support: 'Support staff', assistant: 'Lab, library and IT',
};
export type Employment = 'permanent' | 'contract' | 'visiting';
export const EMPLOYMENT: Record<Employment, string> = { permanent: 'Permanent', contract: 'Contract', visiting: 'Visiting' };
export interface StaffMember {
  id: string; user_id: string | null; name: string; category: StaffCategory; designation: string; wing_id: string | null;
  phone_e164: string | null; employee_code: string | null; joined_on: string | null; active: boolean;
  employment?: Employment; contract_from?: string | null; contract_to?: string | null; whatsapp_opt_in?: boolean;
}

// ── Cover, duties, visiting staff, comp-off (phase 2) ──────────────────────
export interface Absence {
  id: string; user_id: string | null; staff_member_id: string | null; on_date: string; kind: 'absent' | 'release';
  portion: 'full' | 'am' | 'pm' | 'periods'; period_nos: number[]; reason: string | null;
  status: 'reported' | 'confirmed' | 'cancelled'; source: 'office' | 'whatsapp'; created_at: string;
}
export interface Cover {
  id: string; on_date: string; slot_id: string; class: string; period_no: number; subject: string;
  absent_user_id: string | null; absent_staff_member_id: string | null; reason: 'leave' | 'absent' | 'release';
  status: 'assigned' | 'not_needed'; sub_user_id: string | null; sub_staff_member_id: string | null;
  flag_note: string | null; flagged_at: string | null;
}
export type DutyKind = 'gate' | 'bus' | 'lunch' | 'corridor' | 'assembly' | 'event' | 'other';
export const DUTY_KINDS: Record<DutyKind, string> = {
  gate: 'Gate', bus: 'Bus', lunch: 'Lunch', corridor: 'Corridor', assembly: 'Assembly', event: 'Event', other: 'Other',
};
export interface DutyPost { id: string; name: string; kind: DutyKind; weekdays: number[]; starts_at: string; ends_at: string; location: string | null; needed: number; active: boolean }
export interface RosterRow { id: string; post_id: string; weekday: number; user_id: string | null; staff_member_id: string | null }
export interface DatedDuty {
  id: string; on_date: string; starts_at: string; ends_at: string; kind: 'invigilation' | 'event' | 'other'; title: string;
  event_id: string | null; room_id: string | null; user_id: string | null; staff_member_id: string | null; note: string | null;
}
export interface VisitSession { id: string; staff_member_id: string; on_date: string; slot_id: string | null; class: string | null; subject: string | null; status: 'taken' | 'missed'; note: string | null }
export interface CompOff {
  id: string; user_id: string | null; staff_member_id: string | null; days: number; duty_on: string; source: 'roster' | 'duty' | 'cover' | 'other';
  source_id: string | null; note: string; granted_at: string; revoked_at: string | null;
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
  leave: { id: string; staff_id: string | null; staff_member_id?: string | null; leave_type: string; from_date: string; to_date: string; half_day: boolean; status: string }[];
  absences: Absence[];
  covers: Cover[];
  dutyPosts: DutyPost[];
  roster: RosterRow[];
  duties: DatedDuty[];
  visits: VisitSession[];
  compOffs: CompOff[];
  missing: string[];
}
