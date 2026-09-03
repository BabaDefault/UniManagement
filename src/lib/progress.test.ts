import { describe, expect, it } from 'vitest';

import { combine, formatPercent, summarise, summaryStatus } from './progress';

describe('summarise', () => {
  it('distinguishes an empty week from a failing one', () => {
    // null means "not set up yet". Rendering it as 0% would tell Jason he is
    // failing a week he simply has not entered topics for.
    const empty = summarise([]);
    expect(empty.fraction).toBeNull();
    expect(empty.total).toBe(0);
    expect(formatPercent(empty.fraction)).toBe('—');

    const failing = summarise(['red', 'red']);
    expect(failing.fraction).toBe(0);
    expect(formatPercent(failing.fraction)).toBe('0%');
  });

  it('scores the scale from red at 0 to blue at 1', () => {
    expect(summarise(['red']).fraction).toBe(0);
    expect(summarise(['yellow']).fraction).toBeCloseTo(1 / 3);
    expect(summarise(['green']).fraction).toBeCloseTo(2 / 3);
    expect(summarise(['blue']).fraction).toBe(1);
  });

  it('averages a mixed set', () => {
    expect(summarise(['red', 'blue']).fraction).toBeCloseTo(0.5);
    expect(summarise(['red', 'yellow', 'green', 'blue']).fraction).toBeCloseTo(0.5);
  });

  it('counts statuses and flags weak items', () => {
    const summary = summarise(['red', 'red', 'yellow', 'green', 'blue']);

    expect(summary.total).toBe(5);
    expect(summary.byStatus).toEqual({ red: 2, yellow: 1, green: 1, blue: 1 });
    expect(summary.weak).toBe(3);
  });
});

describe('combine', () => {
  it('weights children by subtopic count, not equally', () => {
    // A topic with nine red subtopics must not be cancelled out by one topic
    // with a single blue subtopic.
    const big = summarise(['red', 'red', 'red', 'red', 'red', 'red', 'red', 'red', 'red']);
    const small = summarise(['blue']);

    expect(combine([big, small]).fraction).toBeCloseTo(0.1);
    expect(combine([big, small]).total).toBe(10);
  });

  it('ignores empty children', () => {
    expect(combine([summarise([]), summarise(['green'])]).fraction).toBeCloseTo(2 / 3);
  });

  it('is null when every child is empty', () => {
    expect(combine([summarise([]), summarise([])]).fraction).toBeNull();
  });

  it('matches summarising the flattened statuses directly', () => {
    const combined = combine([summarise(['red', 'yellow']), summarise(['green', 'blue', 'blue'])]);
    expect(combined.fraction).toBeCloseTo(summarise(['red', 'yellow', 'green', 'blue', 'blue']).fraction!);
  });
});

describe('summaryStatus', () => {
  it('maps a rolled-up fraction back onto the scale', () => {
    expect(summaryStatus(null)).toBeNull();
    expect(summaryStatus(0)).toBe('red');
    expect(summaryStatus(1 / 3)).toBe('yellow');
    expect(summaryStatus(2 / 3)).toBe('green');
    expect(summaryStatus(1)).toBe('blue');
  });
});
