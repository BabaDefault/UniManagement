import { describe, expect, it } from 'vitest';

import {
  currentWeekNumber,
  DEFAULT_TERM,
  parseLocalDate,
  shortWeekLabel,
  teachingWeekNumbers,
  termPositionForDate,
  toISODate,
  weekEndDate,
  weekLabel,
  weekStartDate,
  type Term,
} from './terms';

const T3: Term = { id: 'test', ...DEFAULT_TERM };

/** Every case below is a real T3 2026 date from the UNSW academic calendar. */
function positionOn(iso: string) {
  return termPositionForDate(parseLocalDate(iso), T3);
}

describe('termPositionForDate', () => {
  it('puts the first teaching day in week 1', () => {
    expect(positionOn('2026-09-14')).toEqual({ kind: 'week', weekNumber: 1, isFlexWeek: false });
  });

  it('keeps the whole of week 1 in week 1, including the weekend', () => {
    expect(positionOn('2026-09-18')).toMatchObject({ weekNumber: 1 });
    expect(positionOn('2026-09-20')).toMatchObject({ weekNumber: 1 });
    expect(positionOn('2026-09-21')).toMatchObject({ weekNumber: 2 });
  });

  it('ends the first teaching block on 16 Oct in week 5', () => {
    expect(positionOn('2026-10-16')).toEqual({ kind: 'week', weekNumber: 5, isFlexWeek: false });
  });

  it('flags 19-25 Oct as week 6, the flexibility week', () => {
    expect(positionOn('2026-10-19')).toEqual({ kind: 'week', weekNumber: 6, isFlexWeek: true });
    expect(positionOn('2026-10-21')).toEqual({ kind: 'week', weekNumber: 6, isFlexWeek: true });
    expect(positionOn('2026-10-25')).toEqual({ kind: 'week', weekNumber: 6, isFlexWeek: true });
  });

  it('resumes teaching in week 7 on 26 Oct', () => {
    expect(positionOn('2026-10-26')).toEqual({ kind: 'week', weekNumber: 7, isFlexWeek: false });
  });

  it('ends the term in week 10 on 20 Nov', () => {
    expect(positionOn('2026-11-20')).toEqual({ kind: 'week', weekNumber: 10, isFlexWeek: false });
  });

  it('reports dates after teaching as after the term', () => {
    // Study period starts 21 Nov; exams run 27 Nov - 10 Dec.
    expect(positionOn('2026-11-23')).toMatchObject({ kind: 'after' });
    expect(positionOn('2026-12-01')).toMatchObject({ kind: 'after' });
  });

  it('reports dates before teaching as before the term', () => {
    // O-Week is 7-11 Sep.
    expect(positionOn('2026-09-09')).toEqual({ kind: 'before', daysUntilStart: 5 });
  });

  it('is unaffected by the time of day', () => {
    const lateNight = new Date(2026, 9, 21, 23, 45);
    expect(termPositionForDate(lateNight, T3)).toMatchObject({ weekNumber: 6, isFlexWeek: true });
  });
});

describe('daylight saving', () => {
  it('runs these tests in Sydney time', () => {
    // Guards the cases below: if the TZ pin in vitest.config.ts stops applying,
    // the DST assertions would pass vacuously in UTC.
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe('Australia/Sydney');
    // AEST before the transition, AEDT after it.
    expect(parseLocalDate('2026-09-14').getTimezoneOffset()).toBe(-600);
    expect(parseLocalDate('2026-10-26').getTimezoneOffset()).toBe(-660);
  });

  it('does not lose a day across the October transition', () => {
    // Sydney moves to AEDT on 4 Oct 2026, so 14 Sep to 26 Oct is 42 days minus
    // an hour of elapsed time. Naive millisecond division floors that to 41 and
    // reports week 6 instead of week 7 — putting teaching inside Flexibility
    // Week for the whole back half of term.
    expect(positionOn('2026-10-26')).toEqual({ kind: 'week', weekNumber: 7, isFlexWeek: false });
    expect(positionOn('2026-11-20')).toMatchObject({ weekNumber: 10 });
    expect(positionOn('2026-11-23')).toMatchObject({ kind: 'after' });
  });

  it('keeps week starts on Mondays after the transition', () => {
    for (const week of [1, 5, 6, 7, 10]) {
      expect(weekStartDate(week, T3).getDay()).toBe(1);
      expect(weekEndDate(week, T3).getDay()).toBe(0);
    }
  });
});

describe('currentWeekNumber', () => {
  it('clamps to week 1 before the term and the last week after it', () => {
    expect(currentWeekNumber(parseLocalDate('2026-09-01'), T3)).toBe(1);
    expect(currentWeekNumber(parseLocalDate('2026-12-25'), T3)).toBe(10);
    expect(currentWeekNumber(parseLocalDate('2026-10-26'), T3)).toBe(7);
  });
});

describe('week boundaries', () => {
  it('starts each week on the Monday and ends on the Sunday', () => {
    expect(toISODate(weekStartDate(1, T3))).toBe('2026-09-14');
    expect(toISODate(weekEndDate(1, T3))).toBe('2026-09-20');
    expect(toISODate(weekStartDate(6, T3))).toBe('2026-10-19');
    expect(toISODate(weekStartDate(10, T3))).toBe('2026-11-16');
    expect(toISODate(weekEndDate(10, T3))).toBe('2026-11-22');
  });
});

describe('week numbering', () => {
  it('does not skip the flexibility week when numbering', () => {
    // Week 6 exists; it just has no teaching. Renumbering 7-10 as 6-9 would
    // put every topic in the wrong week for the back half of term.
    expect(teachingWeekNumbers(T3)).toEqual([1, 2, 3, 4, 5, 7, 8, 9, 10]);
  });

  it('labels the flexibility week by name', () => {
    expect(weekLabel(5, T3)).toBe('Week 5');
    expect(weekLabel(6, T3)).toBe('Flexibility Week');
    expect(shortWeekLabel(6, T3)).toBe('Flex');
    expect(shortWeekLabel(7, T3)).toBe('W7');
  });
});

describe('terms without a flexibility week', () => {
  const semester: Term = { id: 's', code: 'S1 2026', startDate: '2026-02-23', numWeeks: 12, flexWeekNumber: null };

  it('treats every week as a teaching week', () => {
    expect(teachingWeekNumbers(semester)).toHaveLength(12);
    expect(termPositionForDate(parseLocalDate('2026-03-30'), semester)).toMatchObject({
      weekNumber: 6,
      isFlexWeek: false,
    });
  });
});
