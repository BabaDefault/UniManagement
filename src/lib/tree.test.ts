import { describe, expect, it } from 'vitest';

import type { Status } from './status';
import {
  sortTree,
  subjectSummary,
  topicsForWeek,
  weakItems,
  weeksWithContent,
  weekSummary,
  type SubjectNode,
} from './tree';

let seq = 0;
function sub(status: Status, title = `sub-${(seq += 1)}`, position = 0) {
  return { id: title, title, status, position };
}

function topic(week: number, title: string, subtopics: ReturnType<typeof sub>[], position = 0) {
  return { id: title, week_number: week, title, position, subtopics };
}

function subject(code: string, topics: ReturnType<typeof topic>[], position = 0): SubjectNode {
  return { id: code, code, name: null, colour: null, position, topics };
}

describe('weekSummary', () => {
  const comp3311 = subject('COMP3311', [
    topic(3, 'Attribute Closure', [sub('red', 'a'), sub('yellow', 'b')]),
    topic(3, 'Candidate Keys', [sub('green', 'c')]),
    topic(7, 'BCNF', [sub('blue', 'd')]),
  ]);

  it('rolls up only the requested week', () => {
    expect(weekSummary(comp3311, 3).total).toBe(3);
    expect(weekSummary(comp3311, 7).total).toBe(1);
    expect(weekSummary(comp3311, 7).fraction).toBe(1);
  });

  it('reports a week with no topics as not set up, not as zero', () => {
    const summary = weekSummary(comp3311, 4);
    expect(summary.fraction).toBeNull();
    expect(summary.total).toBe(0);
  });

  it('weights topics by their subtopic count', () => {
    // Week 3 is red + yellow + green = (0 + 1/3 + 2/3) / 3.
    expect(weekSummary(comp3311, 3).fraction).toBeCloseTo(1 / 3);
  });
});

describe('subjectSummary', () => {
  it('covers every week of the subject', () => {
    const s = subject('COMP1531', [
      topic(1, 'Git', [sub('blue', 'a')]),
      topic(2, 'Testing', [sub('red', 'b')]),
    ]);
    expect(subjectSummary(s).fraction).toBeCloseTo(0.5);
    expect(subjectSummary(s).total).toBe(2);
  });

  it('is not-set-up for a subject with no topics', () => {
    expect(subjectSummary(subject('NEW', [])).fraction).toBeNull();
  });
});

describe('weakItems', () => {
  const subjects = [
    subject('COMP3311', [
      topic(3, 'Attribute Closure', [sub('yellow', 'closure'), sub('green', 'fine')]),
      topic(3, 'Candidate Keys', [sub('red', 'keys')]),
    ]),
    subject('COMP1531', [topic(3, 'Testing', [sub('red', 'pytest')]), topic(4, 'CI', [sub('yellow', 'pipelines')])]),
  ];

  it('lists red before yellow, then breaks ties by week and subject', () => {
    expect(weakItems(subjects).map((item) => item.subtopicTitle)).toEqual([
      // Both red and both week 3, so subject code decides: COMP1531 < COMP3311.
      'pytest',
      'keys',
      // Then the yellows, earliest week first.
      'closure',
      'pipelines',
    ]);
  });

  it('excludes green and blue', () => {
    expect(weakItems(subjects).some((item) => item.subtopicTitle === 'fine')).toBe(false);
  });

  it('can be scoped to one week', () => {
    expect(weakItems(subjects, 3).map((item) => item.subtopicTitle)).toEqual(['pytest', 'keys', 'closure']);
    expect(weakItems(subjects, 4).map((item) => item.subtopicTitle)).toEqual(['pipelines']);
  });

  it('carries enough context to navigate back to the item', () => {
    const [first] = weakItems(subjects, 3);
    expect(first).toMatchObject({
      subjectCode: 'COMP1531',
      topicTitle: 'Testing',
      weekNumber: 3,
      status: 'red',
    });
    expect(first.subjectId).toBeTruthy();
  });
});

describe('sortTree', () => {
  it('orders subjects, then weeks, then position', () => {
    const messy = [
      subject('B', [topic(7, 'later', [sub('red', 'x', 1), sub('green', 'y', 0)]), topic(2, 'earlier', [])], 1),
      subject('A', [], 0),
    ];

    const sorted = sortTree(messy);
    expect(sorted.map((s) => s.code)).toEqual(['A', 'B']);
    expect(sorted[1].topics.map((t) => t.week_number)).toEqual([2, 7]);
    expect(sorted[1].topics[1].subtopics.map((s) => s.title)).toEqual(['y', 'x']);
  });

  it('does not mutate the input', () => {
    const original = [subject('B', [], 1), subject('A', [], 0)];
    sortTree(original);
    expect(original.map((s) => s.code)).toEqual(['B', 'A']);
  });
});

describe('weeksWithContent', () => {
  it('reports which weeks have been set up', () => {
    const s = subject('X', [topic(1, 'a', []), topic(1, 'b', []), topic(5, 'c', [])]);
    expect([...weeksWithContent(s)].sort()).toEqual([1, 5]);
  });
});

describe('topicsForWeek', () => {
  it('returns only that week and preserves order', () => {
    const s = subject('X', [topic(1, 'a', []), topic(2, 'b', []), topic(1, 'c', [], 1)]);
    expect(topicsForWeek(s, 1).map((t) => t.title)).toEqual(['a', 'c']);
  });
});
