import { describe, expect, it } from 'vitest';

import type { ClassEvent } from './schedule';
import { upNext } from './schedule';
import { buildSnapshot, snapshotToEvents } from './widget-snapshot';

function event(id: string, day: number, hour: number): ClassEvent {
  return {
    id,
    subjectCode: id,
    classType: 'LEC',
    title: id,
    location: 'Ainsworth 202',
    startsAt: new Date(2026, 8, day, hour, 0),
    endsAt: new Date(2026, 8, day, hour + 1, 0),
  };
}

const events = [event('COMP3311', 15, 9), event('COMP1531', 15, 14), event('COMP2521', 16, 11)];

describe('buildSnapshot', () => {
  it('drops classes that have already finished', () => {
    const snapshot = buildSnapshot(events, new Date(2026, 8, 15, 12, 0));
    expect(snapshot.classes.map((entry) => entry.subjectCode)).toEqual(['COMP1531', 'COMP2521']);
  });

  it('keeps a class that is currently running', () => {
    const snapshot = buildSnapshot(events, new Date(2026, 8, 15, 9, 30));
    expect(snapshot.classes).toHaveLength(3);
  });

  it('orders classes chronologically regardless of input order', () => {
    const snapshot = buildSnapshot([...events].reverse(), new Date(2026, 8, 15, 0, 0));
    expect(snapshot.classes.map((entry) => entry.subjectCode)).toEqual(['COMP3311', 'COMP1531', 'COMP2521']);
  });

  it('caps the payload so stored JSON stays small', () => {
    const many = Array.from({ length: 200 }, (_, i) => event(`C${i}`, 15 + (i % 10), 8));
    expect(buildSnapshot(many, new Date(2026, 8, 1)).classes.length).toBeLessThanOrEqual(80);
  });

  it('is empty when there is nothing left', () => {
    expect(buildSnapshot(events, new Date(2026, 11, 1)).classes).toEqual([]);
  });
});

describe('snapshotToEvents', () => {
  it('round-trips through JSON so the widget sees the same next class', () => {
    // The snapshot crosses a process boundary into the headless task, so the
    // serialised form has to survive JSON intact.
    const now = new Date(2026, 8, 15, 8, 0);
    const snapshot = JSON.parse(JSON.stringify(buildSnapshot(events, now)));
    const restored = snapshotToEvents(snapshot);

    expect(restored).toHaveLength(3);
    expect(restored[0].startsAt).toBeInstanceOf(Date);
    expect(upNext(restored, now)).toMatchObject({ kind: 'next', event: { subjectCode: 'COMP3311' } });
  });

  it('renders an empty timetable rather than throwing on a missing snapshot', () => {
    expect(snapshotToEvents(null)).toEqual([]);
  });

  it('gives every entry a distinct id', () => {
    const restored = snapshotToEvents(buildSnapshot(events, new Date(2026, 8, 15, 0, 0)));
    expect(new Set(restored.map((entry) => entry.id)).size).toBe(restored.length);
  });
});
