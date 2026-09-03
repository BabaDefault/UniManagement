import { describe, expect, it } from 'vitest';

import { parseBulkPaste, planMerge, type ExistingTopic } from './bulk-paste';

describe('parseBulkPaste', () => {
  it('reads indented lines as subtopics of the topic above', () => {
    expect(
      parseBulkPaste(
        [
          'Functional Dependencies',
          '  Definition of FD',
          "  Armstrong's axioms",
          'Attribute Closure',
          '  Computing X+',
        ].join('\n'),
      ),
    ).toEqual([
      { title: 'Functional Dependencies', subtopics: ['Definition of FD', "Armstrong's axioms"] },
      { title: 'Attribute Closure', subtopics: ['Computing X+'] },
    ]);
  });

  it('treats tabs as indentation', () => {
    expect(parseBulkPaste('Topic\n\tSub one\n\tSub two')).toEqual([
      { title: 'Topic', subtopics: ['Sub one', 'Sub two'] },
    ]);
  });

  it('does not treat a single leading space as indentation', () => {
    // A stray space at the start of a pasted line is a typo, not a nesting level.
    expect(parseBulkPaste('Topic A\n Topic B')).toEqual([
      { title: 'Topic A', subtopics: ['Topic A'] },
      { title: 'Topic B', subtopics: ['Topic B'] },
    ]);
  });

  it('strips bullets and numbering', () => {
    expect(parseBulkPaste('- Topic\n  * Sub one\n  1. Sub two\n  • Sub three')).toEqual([
      { title: 'Topic', subtopics: ['Sub one', 'Sub two', 'Sub three'] },
    ]);
  });

  it('ignores blank lines and trailing whitespace', () => {
    expect(parseBulkPaste('\n\nTopic  \n\n  Sub  \n\n')).toEqual([
      { title: 'Topic', subtopics: ['Sub'] },
    ]);
  });

  it('promotes an indented line that has no topic above it', () => {
    expect(parseBulkPaste('  Orphan\nTopic\n  Sub')).toEqual([
      { title: 'Orphan', subtopics: ['Orphan'] },
      { title: 'Topic', subtopics: ['Sub'] },
    ]);
  });

  it('gives a topic with no subtopics one of its own so it stays trackable', () => {
    expect(parseBulkPaste('Recursion\nSorting\nBig-O')).toEqual([
      { title: 'Recursion', subtopics: ['Recursion'] },
      { title: 'Sorting', subtopics: ['Sorting'] },
      { title: 'Big-O', subtopics: ['Big-O'] },
    ]);
  });

  it('returns nothing for empty input', () => {
    expect(parseBulkPaste('')).toEqual([]);
    expect(parseBulkPaste('   \n\n  ')).toEqual([]);
  });

  it('handles Windows line endings', () => {
    expect(parseBulkPaste('Topic\r\n  Sub')).toEqual([{ title: 'Topic', subtopics: ['Sub'] }]);
  });
});

describe('planMerge', () => {
  const existing: ExistingTopic[] = [
    {
      id: 'topic-1',
      title: 'Attribute Closure',
      subtopics: [
        { id: 'sub-1', title: 'Computing X+' },
        { id: 'sub-2', title: 'Using closure to find keys' },
      ],
    },
  ];

  it('adds only what is missing and keeps existing statuses', () => {
    // The whole point: re-pasting a corrected outline must not wipe a term of
    // self-assessment.
    const plan = planMerge(
      existing,
      parseBulkPaste(
        ['Attribute Closure', '  Computing X+', '  Using closure to find keys', '  Closure of a set'].join('\n'),
      ),
    );

    expect(plan.newTopics).toEqual([]);
    expect(plan.newSubtopics).toEqual([{ topicId: 'topic-1', titles: ['Closure of a set'] }]);
    expect(plan.keptCount).toBe(2);
  });

  it('is a no-op when the same text is pasted twice', () => {
    const parsed = parseBulkPaste('Attribute Closure\n  Computing X+\n  Using closure to find keys');
    const plan = planMerge(existing, parsed);

    expect(plan.newTopics).toEqual([]);
    expect(plan.newSubtopics).toEqual([]);
    expect(plan.keptCount).toBe(2);
  });

  it('matches titles ignoring case and spacing', () => {
    const plan = planMerge(existing, parseBulkPaste('attribute   closure\n  COMPUTING X+'));

    expect(plan.newTopics).toEqual([]);
    expect(plan.newSubtopics).toEqual([]);
    expect(plan.keptCount).toBe(1);
  });

  it('creates topics that do not exist yet', () => {
    const plan = planMerge(existing, parseBulkPaste('Normalisation\n  BCNF\n  3NF'));

    expect(plan.newTopics).toEqual([{ title: 'Normalisation', subtopics: ['BCNF', '3NF'] }]);
    expect(plan.newSubtopics).toEqual([]);
    expect(plan.keptCount).toBe(0);
  });

  it('never removes existing rows that are absent from the paste', () => {
    const plan = planMerge(existing, parseBulkPaste('Attribute Closure\n  Computing X+'));

    // 'Using closure to find keys' is missing from the paste and stays put.
    expect(plan).not.toHaveProperty('removals');
    expect(plan.newSubtopics).toEqual([]);
  });

  it('deduplicates repeated subtopics within a single paste', () => {
    const plan = planMerge([], parseBulkPaste('Topic\n  Same\n  Same'));

    expect(plan.newTopics).toEqual([{ title: 'Topic', subtopics: ['Same'] }]);
  });

  it('folds a topic title repeated in one paste into a single topic', () => {
    const plan = planMerge([], parseBulkPaste('Sorting\n  Merge sort\nSorting\n  Quick sort'));

    expect(plan.newTopics).toEqual([{ title: 'Sorting', subtopics: ['Merge sort', 'Quick sort'] }]);
  });

  it('counts an existing subtopic once even if the paste repeats it', () => {
    const plan = planMerge(existing, parseBulkPaste('Attribute Closure\n  Computing X+\n  Computing X+'));

    expect(plan.keptCount).toBe(1);
    expect(plan.newSubtopics).toEqual([]);
  });
});
