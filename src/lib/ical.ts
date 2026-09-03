import ICAL from 'ical.js';

/**
 * Parse a myUNSW timetable feed.
 *
 * Source: myUNSW -> Class Timetable -> "personal iCal link" (top-left). No HTML
 * scraping is needed, and the same link can be subscribed to in Google Calendar.
 *
 * The feed's exact shape is not guaranteed — it may emit one VEVENT per class
 * occurrence, or a weekly RRULE with EXDATEs for Flexibility Week — so both are
 * handled. Recurrence expansion is bounded so a malformed or unbounded RRULE
 * cannot hang the import.
 */

export type ParsedClass = {
  subjectCode: string;
  /** LEC / TUT / LAB / SEM / WEB, when it can be identified. */
  classType: string | null;
  title: string;
  location: string | null;
  startsAt: Date;
  endsAt: Date;
  sourceUid: string | null;
};

export type ParseResult = {
  classes: ParsedClass[];
  /** Distinct course codes found, in first-seen order. */
  subjectCodes: string[];
  /** VEVENTs that produced no usable class, for surfacing in the import preview. */
  skipped: number;
  range: { from: Date; to: Date } | null;
};

/** UNSW course codes are four letters then four digits, e.g. COMP3311. */
const COURSE_CODE = /\b([A-Z]{4}\d{4})\b/;

const TYPE_CODES = ['LEC', 'TUT', 'LAB', 'SEM', 'WEB', 'OTH', 'CLN', 'FLD', 'PRJ', 'WRK'];

const TYPE_WORDS: [RegExp, string][] = [
  [/lecture/i, 'LEC'],
  [/tutorial/i, 'TUT'],
  [/laborator|\blab\b/i, 'LAB'],
  [/seminar/i, 'SEM'],
  [/workshop/i, 'WRK'],
  [/online|web/i, 'WEB'],
];

/** Guard against an unbounded RRULE turning an import into an infinite loop. */
const MAX_OCCURRENCES_PER_EVENT = 400;

export function extractSubjectCode(...fields: (string | null | undefined)[]): string | null {
  for (const field of fields) {
    const match = field?.toUpperCase().match(COURSE_CODE);
    if (match) return match[1];
  }
  return null;
}

export function extractClassType(...fields: (string | null | undefined)[]): string | null {
  for (const field of fields) {
    if (!field) continue;

    // Prefer an explicit abbreviation as its own token, so "LAB" matches but
    // the "LAB" inside "COLLABORATION" does not.
    const tokens = field.toUpperCase().split(/[^A-Z]+/);
    for (const code of TYPE_CODES) {
      if (tokens.includes(code)) return code;
    }
  }

  for (const field of fields) {
    if (!field) continue;
    for (const [pattern, code] of TYPE_WORDS) {
      if (pattern.test(field)) return code;
    }
  }

  return null;
}

export type ParseOptions = {
  /** Occurrences outside this window are dropped. Defaults to a wide range. */
  from?: Date;
  to?: Date;
};

export function parseTimetable(icsText: string, options: ParseOptions = {}): ParseResult {
  const component = new ICAL.Component(ICAL.parse(icsText));

  // Named TZIDs (Australia/Sydney) only resolve if the calendar's own VTIMEZONE
  // definitions are registered first; without this every class can land an hour
  // out across the October daylight-saving change.
  for (const vtimezone of component.getAllSubcomponents('vtimezone')) {
    const tz = new ICAL.Timezone(vtimezone);
    if (!ICAL.TimezoneService.has(tz.tzid)) ICAL.TimezoneService.register(tz);
  }

  const from = options.from ?? new Date(2000, 0, 1);
  const to = options.to ?? new Date(2100, 0, 1);

  const classes: ParsedClass[] = [];
  const subjectCodes: string[] = [];
  let skipped = 0;

  for (const vevent of component.getAllSubcomponents('vevent')) {
    const event = new ICAL.Event(vevent);

    const summary = event.summary ?? '';
    const description = vevent.getFirstPropertyValue('description') as string | null;
    const location = event.location ?? null;

    const subjectCode = extractSubjectCode(summary, description, location);
    if (!subjectCode) {
      skipped += 1;
      continue;
    }

    if (!subjectCodes.includes(subjectCode)) subjectCodes.push(subjectCode);

    const classType = extractClassType(summary, description, location);
    const base = {
      subjectCode,
      classType,
      title: summary.trim() || subjectCode,
      location: location?.trim() || null,
      sourceUid: event.uid ?? null,
    };

    for (const { startsAt, endsAt } of expandOccurrences(event, from, to)) {
      classes.push({ ...base, startsAt, endsAt });
    }
  }

  classes.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());

  return {
    classes,
    subjectCodes,
    skipped,
    range: classes.length > 0 ? { from: classes[0].startsAt, to: classes[classes.length - 1].endsAt } : null,
  };
}

/** `ICAL` is a value, not a TS namespace, so instance types come via InstanceType. */
type ICalEvent = InstanceType<typeof ICAL.Event>;

function expandOccurrences(event: ICalEvent, from: Date, to: Date): { startsAt: Date; endsAt: Date }[] {
  const durationMs = event.endDate.toJSDate().getTime() - event.startDate.toJSDate().getTime();

  if (!event.isRecurring()) {
    const startsAt = event.startDate.toJSDate();
    const endsAt = event.endDate.toJSDate();
    return startsAt >= from && startsAt <= to ? [{ startsAt, endsAt }] : [];
  }

  const occurrences: { startsAt: Date; endsAt: Date }[] = [];
  const iterator = event.iterator();

  for (let i = 0; i < MAX_OCCURRENCES_PER_EVENT; i += 1) {
    const next = iterator.next();
    if (!next) break;

    const startsAt = next.toJSDate();
    if (startsAt > to) break;
    if (startsAt < from) continue;

    // getOccurrenceDetails applies RECURRENCE-ID overrides (a one-off room or
    // time change); fall back to the plain duration if it cannot resolve one.
    let endsAt: Date;
    try {
      endsAt = event.getOccurrenceDetails(next).endDate.toJSDate();
    } catch {
      endsAt = new Date(startsAt.getTime() + durationMs);
    }

    occurrences.push({ startsAt, endsAt });
  }

  return occurrences;
}

/**
 * Identity of a class for upsert purposes. Re-importing after a timetable change
 * must update rows in place rather than doubling every class.
 */
export function classKey(entry: Pick<ParsedClass, 'sourceUid' | 'startsAt' | 'subjectCode'>): string {
  return `${entry.sourceUid ?? entry.subjectCode}@${entry.startsAt.toISOString()}`;
}

export function dedupeClasses(classes: readonly ParsedClass[]): ParsedClass[] {
  const seen = new Map<string, ParsedClass>();
  for (const entry of classes) seen.set(classKey(entry), entry);
  return [...seen.values()].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}
