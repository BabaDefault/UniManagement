/**
 * UNSW term structure.
 *
 * A UNSW term is 10 consecutive calendar weeks. Week numbering does NOT skip —
 * week 6 exists, it is just Flexibility Week and has no teaching. Getting this
 * wrong misaligns every topic after mid-term, so it is modelled explicitly and
 * the dates are editable rather than hardcoded.
 *
 * T3 2026 (from the UNSW academic calendar):
 *   Teaching     14 Sep - 20 Nov     (weeks 1-10)
 *   Flexibility  19 Oct - 25 Oct     (week 6)
 *   Study period 21 Nov - 26 Nov
 *   Exams        27 Nov - 10 Dec
 */

export type Term = {
  id: string;
  /** Display name, e.g. "T3 2026". */
  code: string;
  /** ISO date (YYYY-MM-DD) of the Monday that starts week 1. */
  startDate: string;
  /** Calendar weeks in the teaching period, including the flexibility week. */
  numWeeks: number;
  /** Week number that is Flexibility Week, or null for terms without one. */
  flexWeekNumber: number | null;
};

export const DEFAULT_TERM: Omit<Term, 'id'> = {
  code: 'T3 2026',
  startDate: '2026-09-14',
  numWeeks: 10,
  flexWeekNumber: 6,
};

export const MS_PER_DAY = 86_400_000;

/**
 * Parse a YYYY-MM-DD string as local midnight.
 *
 * `new Date('2026-09-14')` parses as UTC midnight, which in Sydney is 10am on
 * the 14th but in UTC-5 is 7pm on the 13th — shifting every week boundary by a
 * day. Everything here is a wall-clock date, so build it component-wise.
 */
export function parseLocalDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Strip the time component, keeping the local calendar day. */
export function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * A date's day index, counted in calendar days rather than elapsed milliseconds.
 *
 * Subtracting two local Dates is NOT safe across a daylight-saving boundary:
 * Sydney moves to AEDT on the first Sunday of October, so 14 Sep to 26 Oct is
 * 42 days minus an hour, and `floor(diff / MS_PER_DAY)` rounds it down to 41.
 * That shifts every week after the transition back by one — putting week 7 in
 * week 6 and teaching weeks inside Flexibility Week, exactly at mid-term.
 *
 * Projecting the local Y/M/D onto UTC removes the offset from the subtraction.
 */
function localDayIndex(date: Date): number {
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / MS_PER_DAY);
}

/** Add days to a local date, staying on the intended calendar day across DST. */
export function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/** Whole calendar days from `from` to `to`. */
export function daysBetween(from: Date, to: Date): number {
  return localDayIndex(to) - localDayIndex(from);
}

export type TermPosition =
  | { kind: 'before'; daysUntilStart: number }
  | { kind: 'week'; weekNumber: number; isFlexWeek: boolean }
  | { kind: 'after'; weeksSinceEnd: number };

/**
 * Where a date falls in the term. Weeks are derived from the start date rather
 * than stored, so correcting the term start date re-labels everything at once.
 */
export function termPositionForDate(date: Date, term: Term): TermPosition {
  const start = parseLocalDate(term.startDate);
  const days = daysBetween(start, date);

  if (days < 0) return { kind: 'before', daysUntilStart: -days };

  const weekNumber = Math.floor(days / 7) + 1;
  if (weekNumber > term.numWeeks) {
    return { kind: 'after', weeksSinceEnd: weekNumber - term.numWeeks };
  }
  return { kind: 'week', weekNumber, isFlexWeek: weekNumber === term.flexWeekNumber };
}

/**
 * The week to open the app on. Before the term starts this is week 1, after it
 * ends the last week — you always land on something rather than an empty state.
 */
export function currentWeekNumber(date: Date, term: Term): number {
  const position = termPositionForDate(date, term);
  if (position.kind === 'before') return 1;
  if (position.kind === 'after') return term.numWeeks;
  return position.weekNumber;
}

export function isFlexWeek(weekNumber: number, term: Term): boolean {
  return weekNumber === term.flexWeekNumber;
}

/** Monday of the given week. */
export function weekStartDate(weekNumber: number, term: Term): Date {
  return addDays(parseLocalDate(term.startDate), (weekNumber - 1) * 7);
}

/** Sunday of the given week. */
export function weekEndDate(weekNumber: number, term: Term): Date {
  return addDays(weekStartDate(weekNumber, term), 6);
}

export function weekNumbers(term: Term): number[] {
  return Array.from({ length: term.numWeeks }, (_, i) => i + 1);
}

/** Teaching weeks only — what you actually have topics for. */
export function teachingWeekNumbers(term: Term): number[] {
  return weekNumbers(term).filter((n) => !isFlexWeek(n, term));
}

export function weekLabel(weekNumber: number, term: Term): string {
  return isFlexWeek(weekNumber, term) ? 'Flexibility Week' : `Week ${weekNumber}`;
}

export function shortWeekLabel(weekNumber: number, term: Term): string {
  return isFlexWeek(weekNumber, term) ? 'Flex' : `W${weekNumber}`;
}
