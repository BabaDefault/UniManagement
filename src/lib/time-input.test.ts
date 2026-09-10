import { describe, expect, it } from 'vitest';

import { formatMinutes, formatMinutesRange, parseTimeInput, timeInputError } from './time-input';

describe('parseTimeInput', () => {
  it('reads a bare hour', () => {
    expect(parseTimeInput('9')).toBe(9 * 60);
    expect(parseTimeInput('14')).toBe(14 * 60);
    expect(parseTimeInput('0')).toBe(0);
  });

  it('reads hours and minutes, with or without the colon', () => {
    expect(parseTimeInput('9:30')).toBe(9 * 60 + 30);
    expect(parseTimeInput('0930')).toBe(9 * 60 + 30);
    expect(parseTimeInput('14:05')).toBe(14 * 60 + 5);
  });

  it('reads am and pm', () => {
    expect(parseTimeInput('9am')).toBe(9 * 60);
    expect(parseTimeInput('2pm')).toBe(14 * 60);
    expect(parseTimeInput('2:30 pm')).toBe(14 * 60 + 30);
    expect(parseTimeInput('9 AM')).toBe(9 * 60);
    expect(parseTimeInput('9a')).toBe(9 * 60);
    expect(parseTimeInput('9p')).toBe(21 * 60);
    expect(parseTimeInput('9 p.m.')).toBe(21 * 60);
  });

  it('handles the two times people get wrong', () => {
    expect(parseTimeInput('12am')).toBe(0);
    expect(parseTimeInput('12pm')).toBe(12 * 60);
  });

  it('rejects impossible times', () => {
    expect(parseTimeInput('25')).toBeNull();
    expect(parseTimeInput('9:75')).toBeNull();
    expect(parseTimeInput('13pm')).toBeNull();
    expect(parseTimeInput('0am')).toBeNull();
  });

  it('rejects anything that is not a time', () => {
    expect(parseTimeInput('')).toBeNull();
    expect(parseTimeInput('   ')).toBeNull();
    expect(parseTimeInput('lunch')).toBeNull();
    expect(parseTimeInput('9-11')).toBeNull();
  });
});

describe('formatMinutes', () => {
  it('writes times the way a timetable reads', () => {
    expect(formatMinutes(9 * 60)).toBe('9am');
    expect(formatMinutes(14 * 60 + 30)).toBe('2:30pm');
    expect(formatMinutes(12 * 60)).toBe('12pm');
    expect(formatMinutes(0)).toBe('12am');
    expect(formatMinutesRange(9 * 60, 11 * 60)).toBe('9am – 11am');
  });

  it('round-trips whatever it prints', () => {
    for (const minutes of [0, 1, 9 * 60, 12 * 60, 13 * 60 + 5, 23 * 60 + 59]) {
      expect(parseTimeInput(formatMinutes(minutes))).toBe(minutes);
    }
  });
});

describe('timeInputError', () => {
  it('explains what to type instead of just refusing', () => {
    expect(timeInputError('9')).toBeNull();
    expect(timeInputError('')).toBe('Required');
    expect(timeInputError('nope')).toMatch(/9:30/);
  });
});
