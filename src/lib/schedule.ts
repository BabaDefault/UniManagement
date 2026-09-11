import type { ClassRecord } from './records';
import { addDays, startOfLocalDay } from './terms';

/** A class occurrence with real Dates, shared by the Today screen and the widget. */
export type ClassEvent = {
  id: string;
  subjectCode: string;
  classType: string | null;
  title: string;
  location: string | null;
  startsAt: Date;
  endsAt: Date;
  /** Set for hand-entered classes; null for imported ones. Drives editability. */
  seriesId: string | null;
};

export function toClassEvents(rows: readonly ClassRecord[]): ClassEvent[] {
  return rows
    .map((row) => ({
      id: row.id,
      subjectCode: row.subject_code,
      classType: row.class_type,
      title: row.title ?? row.subject_code,
      location: row.location,
      startsAt: new Date(row.starts_at),
      endsAt: new Date(row.ends_at),
      seriesId: row.series_id ?? null,
    }))
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}

export function isSameLocalDay(a: Date, b: Date): boolean {
  return startOfLocalDay(a).getTime() === startOfLocalDay(b).getTime();
}

export function classesOnDay(events: readonly ClassEvent[], day: Date): ClassEvent[] {
  return events.filter((event) => isSameLocalDay(event.startsAt, day));
}

/** Classes today that have not finished yet. */
export function remainingToday(events: readonly ClassEvent[], now: Date): ClassEvent[] {
  return classesOnDay(events, now).filter((event) => event.endsAt > now);
}

/**
 * Classes on the same local day as `event`, starting after it.
 *
 * The widget leads with a class that may be days away, so "what else is on"
 * has to be anchored to that class's day rather than to today.
 */
export function classesAfterOnSameDay(events: readonly ClassEvent[], event: ClassEvent): ClassEvent[] {
  return classesOnDay(events, event.startsAt).filter((other) => other.startsAt > event.startsAt);
}

export type UpNext =
  | { kind: 'now'; event: ClassEvent }
  | { kind: 'next'; event: ClassEvent }
  | { kind: 'none' };

/**
 * What the widget leads with. A class in progress outranks the one after it —
 * "COMP3311 now" is more useful than "COMP1531 in 2h" while you are sitting in
 * the lecture.
 */
export function upNext(events: readonly ClassEvent[], now: Date): UpNext {
  const ongoing = events.find((event) => event.startsAt <= now && event.endsAt > now);
  if (ongoing) return { kind: 'now', event: ongoing };

  const next = events.find((event) => event.startsAt > now);
  return next ? { kind: 'next', event: next } : { kind: 'none' };
}

/** Classes within the given week window, for the timetable screen. */
export function classesBetween(events: readonly ClassEvent[], from: Date, to: Date): ClassEvent[] {
  const start = startOfLocalDay(from);
  const end = addDays(startOfLocalDay(to), 1);
  return events.filter((event) => event.startsAt >= start && event.startsAt < end);
}

/** Group a set of classes by local day, in chronological order. */
export function groupByDay(events: readonly ClassEvent[]): { day: Date; events: ClassEvent[] }[] {
  const groups = new Map<number, { day: Date; events: ClassEvent[] }>();

  for (const event of events) {
    const day = startOfLocalDay(event.startsAt);
    const key = day.getTime();
    const group = groups.get(key) ?? { day, events: [] };
    group.events.push(event);
    groups.set(key, group);
  }

  return [...groups.values()].sort((a, b) => a.day.getTime() - b.day.getTime());
}

// ------------------------------------------------------------------ formatting

export function formatTime(date: Date): string {
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const suffix = hours < 12 ? 'am' : 'pm';
  const display = hours % 12 === 0 ? 12 : hours % 12;
  return minutes === 0 ? `${display}${suffix}` : `${display}:${String(minutes).padStart(2, '0')}${suffix}`;
}

export function formatTimeRange(event: ClassEvent): string {
  return `${formatTime(event.startsAt)} – ${formatTime(event.endsAt)}`;
}

/**
 * Relative time for the "next class" line. Deliberately coarse — the widget only
 * refreshes every half hour, so minute-accurate text would routinely be wrong.
 */
export function formatCountdown(from: Date, to: Date): string {
  const minutes = Math.round((to.getTime() - from.getTime()) / 60_000);

  if (minutes <= 0) return 'now';
  if (minutes < 60) return `in ${minutes} min`;

  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours < 24) return remainder === 0 ? `in ${hours}h` : `in ${hours}h ${remainder}m`;

  const days = Math.round(hours / 24);
  return days === 1 ? 'tomorrow' : `in ${days} days`;
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatDayLabel(day: Date, now: Date): string {
  if (isSameLocalDay(day, now)) return 'Today';
  if (isSameLocalDay(day, addDays(startOfLocalDay(now), 1))) return 'Tomorrow';
  return `${WEEKDAYS[day.getDay()]} ${day.getDate()} ${MONTHS[day.getMonth()]}`;
}

/** "today" / "tomorrow" / "Monday" — the lowercase form that reads inside a sentence. */
export function formatDayWord(day: Date, now: Date): string {
  if (isSameLocalDay(day, now)) return 'today';
  if (isSameLocalDay(day, addDays(startOfLocalDay(now), 1))) return 'tomorrow';
  return WEEKDAYS[day.getDay()];
}

export function formatShortDay(day: Date): string {
  return `${WEEKDAYS[day.getDay()].slice(0, 3)} ${day.getDate()} ${MONTHS[day.getMonth()]}`;
}
