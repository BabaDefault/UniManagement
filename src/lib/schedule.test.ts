import { describe, expect, it } from 'vitest';

import {
  classesAfterOnSameDay,
  classesBetween,
  formatCountdown,
  formatDayLabel,
  formatDayWord,
  formatTime,
  formatTimeRange,
  groupByDay,
  remainingToday,
  toClassEvents,
  upNext,
  type ClassEvent,
} from './schedule';

function event(id: string, start: [number, number, number, number, number], hours = 1): ClassEvent {
  const [y, m, d, hh, mm] = start;
  const startsAt = new Date(y, m, d, hh, mm);
  return {
    id,
    subjectCode: id.split('-')[0],
    classType: 'LEC',
    title: id,
    location: 'Ainsworth 202',
    startsAt,
    endsAt: new Date(y, m, d, hh + hours, mm),
    seriesId: null,
  };
}

// Tuesday 15 Sep 2026, week 1 of T3.
const lecture = event('COMP3311-lec', [2026, 8, 15, 9, 0], 2);
const tutorial = event('COMP1531-tut', [2026, 8, 15, 14, 0]);
const nextDay = event('COMP3311-lab', [2026, 8, 16, 11, 0]);
const events = [lecture, tutorial, nextDay];

describe('upNext', () => {
  it('leads with a class that is in progress', () => {
    // Sitting in the 9-11am lecture: "COMP3311 now" beats "COMP1531 in 4h".
    expect(upNext(events, new Date(2026, 8, 15, 9, 30))).toEqual({ kind: 'now', event: lecture });
  });

  it('moves on the moment a class ends', () => {
    expect(upNext(events, new Date(2026, 8, 15, 11, 0))).toEqual({ kind: 'next', event: tutorial });
  });

  it('rolls over to the next day once today is done', () => {
    expect(upNext(events, new Date(2026, 8, 15, 20, 0))).toEqual({ kind: 'next', event: nextDay });
  });

  it('reports none when the term is over', () => {
    expect(upNext(events, new Date(2026, 11, 25, 9, 0))).toEqual({ kind: 'none' });
  });

  it('reports none for an empty timetable', () => {
    expect(upNext([], new Date())).toEqual({ kind: 'none' });
  });
});

describe('remainingToday', () => {
  it('drops classes that have already finished', () => {
    expect(remainingToday(events, new Date(2026, 8, 15, 11, 30)).map((e) => e.id)).toEqual(['COMP1531-tut']);
  });

  it('keeps a class that is currently running', () => {
    expect(remainingToday(events, new Date(2026, 8, 15, 10, 0)).map((e) => e.id)).toEqual([
      'COMP3311-lec',
      'COMP1531-tut',
    ]);
  });

  it('excludes other days', () => {
    expect(remainingToday(events, new Date(2026, 8, 15, 0, 0))).toHaveLength(2);
  });

  it('is empty on a day with no classes', () => {
    expect(remainingToday(events, new Date(2026, 8, 19, 9, 0))).toEqual([]);
  });
});

describe('classesAfterOnSameDay', () => {
  it('lists what follows on the featured class own day, not on today', () => {
    // The widget is looking at Tuesday from the previous Friday. Anchoring to
    // "today" would return nothing and leave half the widget blank.
    expect(classesAfterOnSameDay(events, lecture).map((e) => e.id)).toEqual(['COMP1531-tut']);
  });

  it('excludes the featured class and everything on later days', () => {
    expect(classesAfterOnSameDay(events, tutorial)).toEqual([]);
    expect(classesAfterOnSameDay(events, nextDay)).toEqual([]);
  });
});

describe('toClassEvents', () => {
  it('parses rows and sorts them chronologically', () => {
    const rows = [
      { id: 'b', starts_at: '2026-09-16T01:00:00Z', ends_at: '2026-09-16T02:00:00Z', subject_code: 'COMP1531' },
      { id: 'a', starts_at: '2026-09-14T23:00:00Z', ends_at: '2026-09-15T01:00:00Z', subject_code: 'COMP3311' },
    ];

    const parsed = toClassEvents(rows as never);
    expect(parsed.map((e) => e.id)).toEqual(['a', 'b']);
    expect(parsed[0].startsAt).toBeInstanceOf(Date);
  });

  it('falls back to the course code when a row has no title', () => {
    const rows = [{ id: 'a', starts_at: '2026-09-15T00:00:00Z', ends_at: '2026-09-15T01:00:00Z', subject_code: 'COMP3311', title: null }];
    expect(toClassEvents(rows as never)[0].title).toBe('COMP3311');
  });
});

describe('groupByDay and classesBetween', () => {
  it('groups by local day in order', () => {
    const groups = groupByDay(events);
    expect(groups).toHaveLength(2);
    expect(groups[0].events.map((e) => e.id)).toEqual(['COMP3311-lec', 'COMP1531-tut']);
    expect(groups[1].events.map((e) => e.id)).toEqual(['COMP3311-lab']);
  });

  it('includes both endpoints of the window', () => {
    const window = classesBetween(events, new Date(2026, 8, 15), new Date(2026, 8, 16));
    expect(window).toHaveLength(3);

    const oneDay = classesBetween(events, new Date(2026, 8, 15), new Date(2026, 8, 15));
    expect(oneDay).toHaveLength(2);
  });
});

describe('formatting', () => {
  it('writes times the way a timetable reads', () => {
    expect(formatTime(new Date(2026, 8, 15, 9, 0))).toBe('9am');
    expect(formatTime(new Date(2026, 8, 15, 14, 30))).toBe('2:30pm');
    expect(formatTime(new Date(2026, 8, 15, 12, 0))).toBe('12pm');
    expect(formatTime(new Date(2026, 8, 15, 0, 15))).toBe('12:15am');
    expect(formatTimeRange(lecture)).toBe('9am – 11am');
  });

  it('keeps the countdown coarse enough to survive a 30-minute refresh', () => {
    const now = new Date(2026, 8, 15, 8, 0);
    expect(formatCountdown(now, new Date(2026, 8, 15, 8, 45))).toBe('in 45 min');
    expect(formatCountdown(now, new Date(2026, 8, 15, 11, 0))).toBe('in 3h');
    expect(formatCountdown(now, new Date(2026, 8, 15, 10, 30))).toBe('in 2h 30m');
    expect(formatCountdown(now, new Date(2026, 8, 16, 9, 0))).toBe('tomorrow');
    expect(formatCountdown(now, new Date(2026, 8, 18, 9, 0))).toBe('in 3 days');
    expect(formatCountdown(now, now)).toBe('now');
  });

  it('names days relative to today', () => {
    const now = new Date(2026, 8, 15, 8, 0);
    expect(formatDayLabel(new Date(2026, 8, 15), now)).toBe('Today');
    expect(formatDayLabel(new Date(2026, 8, 16), now)).toBe('Tomorrow');
    expect(formatDayLabel(new Date(2026, 8, 18), now)).toBe('Friday 18 Sep');
  });

  it('names days in the lowercase form that reads inside a sentence', () => {
    const now = new Date(2026, 8, 15, 8, 0);
    expect(formatDayWord(new Date(2026, 8, 15), now)).toBe('today');
    expect(formatDayWord(new Date(2026, 8, 16), now)).toBe('tomorrow');
    expect(formatDayWord(new Date(2026, 8, 18), now)).toBe('Friday');
  });
});
