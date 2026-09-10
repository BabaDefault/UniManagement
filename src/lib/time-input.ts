/**
 * Parsing the times you type when adding a class.
 *
 * A native time picker would be one more thing to fight on three platforms, and
 * typing "9" or "2pm" is faster than spinning a wheel. So this accepts the
 * handful of shapes a person actually types and rejects the rest clearly.
 */

const PATTERN = /^(\d{1,2})(?::?(\d{2}))?\s*(am|pm|a|p)?$/;

/** Minutes from local midnight, or null if it cannot be read as a time. */
export function parseTimeInput(value: string): number | null {
  const cleaned = value.trim().toLowerCase().replace(/\./g, '');
  if (cleaned === '') return null;

  const match = cleaned.match(PATTERN);
  if (!match) return null;

  const [, rawHour, rawMinute, rawSuffix] = match;
  let hour = Number(rawHour);
  const minute = rawMinute === undefined ? 0 : Number(rawMinute);

  if (!Number.isInteger(hour) || minute > 59) return null;

  const suffix = rawSuffix?.[0];

  if (suffix) {
    // 12-hour clock: 12am is midnight, 12pm is noon.
    if (hour < 1 || hour > 12) return null;
    if (suffix === 'a') hour = hour === 12 ? 0 : hour;
    else hour = hour === 12 ? 12 : hour + 12;
  } else if (hour > 23) {
    return null;
  }

  return hour * 60 + minute;
}

export function formatMinutes(minutes: number): string {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const suffix = hour < 12 ? 'am' : 'pm';
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return minute === 0 ? `${display}${suffix}` : `${display}:${String(minute).padStart(2, '0')}${suffix}`;
}

export function formatMinutesRange(startMinutes: number, endMinutes: number): string {
  return `${formatMinutes(startMinutes)} – ${formatMinutes(endMinutes)}`;
}

/** The form's editable value for a time, so an in-progress "1" is not an error. */
export function timeInputError(value: string): string | null {
  if (value.trim() === '') return 'Required';
  return parseTimeInput(value) === null ? 'Use a time like 9, 9:30 or 2pm' : null;
}

export const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Monday first, the way a university timetable reads. */
export const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

/** The class types UNSW uses, offered as one-tap choices. */
export const CLASS_TYPES = ['LEC', 'TUT', 'LAB', 'SEM', 'WEB'];
