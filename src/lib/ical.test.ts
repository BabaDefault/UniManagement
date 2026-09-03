import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  classKey,
  dedupeClasses,
  extractClassType,
  extractSubjectCode,
  parseTimetable,
  type ParsedClass,
} from './ical';
import { DEFAULT_TERM, parseLocalDate, type Term } from './terms';
import { termPositionForDate } from './terms';

/**
 * This fixture is a stand-in, not a real myUNSW export — it covers the shapes
 * the feed might use (weekly RRULE with an EXDATE, standalone VEVENTs, a
 * non-class all-day event, named-timezone DTSTARTs across the DST change).
 *
 * REPLACE IT with a real exported feed as soon as one is available, and keep
 * these assertions. The parser is the component most likely to break silently.
 */
const ics = readFileSync(join(__dirname, '__fixtures__', 'synthetic-timetable.ics'), 'utf8');

const T3: Term = { id: 'test', ...DEFAULT_TERM };

function localTime(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

describe('parseTimetable', () => {
  const result = parseTimetable(ics);
  const lectures = result.classes.filter((entry) => entry.classType === 'LEC');

  it('finds every course code and ignores non-class events', () => {
    expect(result.subjectCodes.sort()).toEqual(['COMP1531', 'COMP3311']);
    // The Labour Day all-day event carries no course code.
    expect(result.skipped).toBe(1);
  });

  it('expands a weekly RRULE into one class per week', () => {
    // COUNT=10 with a single EXDATE.
    expect(lectures).toHaveLength(9);
  });

  it('honours the EXDATE that removes Flexibility Week', () => {
    for (const entry of result.classes) {
      const position = termPositionForDate(entry.startsAt, T3);
      expect(position).toMatchObject({ isFlexWeek: false });
    }

    const weeks = lectures.map((entry) => {
      const position = termPositionForDate(entry.startsAt, T3);
      return position.kind === 'week' ? position.weekNumber : null;
    });
    expect(weeks).toEqual([1, 2, 3, 4, 5, 7, 8, 9, 10]);
  });

  it('keeps 9am classes at 9am on both sides of the daylight-saving change', () => {
    // Sydney moves to AEDT on 4 Oct 2026. If the calendar's VTIMEZONE is not
    // registered, ical.js cannot resolve TZID=Australia/Sydney and every class
    // after the transition drifts by an hour.
    const september = lectures.find((entry) => entry.startsAt.getMonth() === 8);
    const november = lectures.find((entry) => entry.startsAt.getMonth() === 10);

    expect(localTime(september!.startsAt)).toBe('09:00');
    expect(localTime(november!.startsAt)).toBe('09:00');
    expect(localTime(november!.endsAt)).toBe('11:00');
  });

  it('reads type, location and title off each event', () => {
    const tutorial = result.classes.find((entry) => entry.classType === 'TUT');
    expect(tutorial).toMatchObject({
      subjectCode: 'COMP3311',
      title: 'COMP3311 Tutorial',
      location: 'Civil Engineering 101',
    });

    const lab = result.classes.find((entry) => entry.classType === 'LAB');
    expect(lab).toMatchObject({ subjectCode: 'COMP1531', location: 'Online' });
  });

  it('returns classes in chronological order with a covering range', () => {
    const times = result.classes.map((entry) => entry.startsAt.getTime());
    expect([...times].sort((a, b) => a - b)).toEqual(times);
    expect(result.range!.from).toEqual(result.classes[0].startsAt);
  });

  it('respects a date window', () => {
    const windowed = parseTimetable(ics, {
      from: parseLocalDate('2026-10-01'),
      to: parseLocalDate('2026-10-31'),
    });
    for (const entry of windowed.classes) {
      expect(entry.startsAt.getMonth()).toBe(9);
    }
    expect(windowed.classes.length).toBeGreaterThan(0);
  });

  it('is stable across repeated parses, so re-importing is idempotent', () => {
    const again = parseTimetable(ics);
    expect(again.classes.map(classKey)).toEqual(result.classes.map(classKey));
    expect(dedupeClasses([...result.classes, ...again.classes])).toHaveLength(result.classes.length);
  });
});

describe('extractSubjectCode', () => {
  it('finds a UNSW course code anywhere in the text', () => {
    expect(extractSubjectCode('COMP3311 LEC (A)')).toBe('COMP3311');
    expect(extractSubjectCode('Lecture', 'Course: MATH1131 Calculus')).toBe('MATH1131');
    expect(extractSubjectCode(null, undefined, 'comp1511 tut')).toBe('COMP1511');
  });

  it('returns null when there is no course code', () => {
    expect(extractSubjectCode('Public Holiday')).toBeNull();
    expect(extractSubjectCode('COMP123', 'ABCD12345')).toBeNull();
  });
});

describe('extractClassType', () => {
  it('reads UNSW abbreviations as whole tokens', () => {
    expect(extractClassType('COMP3311 LEC (A)')).toBe('LEC');
    expect(extractClassType('COMP3311-TUT-H14A')).toBe('TUT');
    expect(extractClassType('COMP1531 WEB')).toBe('WEB');
  });

  it('falls back to the spelled-out word', () => {
    expect(extractClassType('COMP3311 Tutorial')).toBe('TUT');
    expect(extractClassType('COMP1531 Laboratory')).toBe('LAB');
    expect(extractClassType('Seminar for COMP9900')).toBe('SEM');
  });

  it('does not match an abbreviation buried inside a word', () => {
    expect(extractClassType('COLLABORATION SESSION')).toBeNull();
  });

  it('returns null when the type is unknown', () => {
    expect(extractClassType('COMP3311')).toBeNull();
  });
});

describe('dedupeClasses', () => {
  const base: ParsedClass = {
    subjectCode: 'COMP3311',
    classType: 'LEC',
    title: 'COMP3311 LEC',
    location: 'Ainsworth 202',
    startsAt: new Date(2026, 8, 15, 9, 0),
    endsAt: new Date(2026, 8, 15, 11, 0),
    sourceUid: 'uid-1',
  };

  it('collapses the same occurrence imported twice', () => {
    expect(dedupeClasses([base, { ...base, location: 'Moved to Quad G040' }])).toHaveLength(1);
  });

  it('keeps the later version when a class is re-imported with changes', () => {
    const [kept] = dedupeClasses([base, { ...base, location: 'Quad G040' }]);
    expect(kept.location).toBe('Quad G040');
  });

  it('keeps separate occurrences of the same recurring event', () => {
    const nextWeek = { ...base, startsAt: new Date(2026, 8, 22, 9, 0), endsAt: new Date(2026, 8, 22, 11, 0) };
    expect(dedupeClasses([base, nextWeek])).toHaveLength(2);
  });
});
