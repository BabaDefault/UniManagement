import { describe, expect, it } from 'vitest';

import { parseBulkPaste, planMerge, type ExistingTopic } from './bulk-paste';
import type { ParsedClass } from './ical';
import {
  addClassSeries,
  addSubject,
  applyPaste,
  classSeries,
  createTerm,
  deleteClass,
  deleteClassSeries,
  deleteSubject,
  deleteSubtopic,
  deleteTopic,
  describeDatabase,
  EMPTY_DATABASE,
  ensureSubjects,
  newId,
  parseDatabase,
  replaceImportedClasses,
  serialiseDatabase,
  setStatus,
  updateClassSeries,
  updateTerm,
  type Database,
} from './store';
import { DEFAULT_TERM, termPositionForDate } from './terms';

function seeded(): Database {
  let db = createTerm(EMPTY_DATABASE, DEFAULT_TERM);
  db = addSubject(db, { code: 'comp3311', name: ' Database Systems ', position: 0 });

  const subjectId = db.subjects[0].id;
  const plan = planMerge([], parseBulkPaste('Attribute Closure\n  Computing X+\n  Finding keys'));

  return applyPaste(db, { subjectId, weekNumber: 3, plan, startPosition: 0 });
}

function subtopics(db: Database) {
  return db.subjects.flatMap((s) => s.topics.flatMap((t) => t.subtopics));
}

describe('newId', () => {
  it('does not collide, even within the same millisecond', () => {
    const ids = Array.from({ length: 1000 }, () => newId('x'));
    expect(new Set(ids).size).toBe(1000);
  });
});

describe('terms and subjects', () => {
  it('creates a term with an id', () => {
    const db = createTerm(EMPTY_DATABASE, DEFAULT_TERM);
    expect(db.term).toMatchObject({ code: 'T3 2026', startDate: '2026-09-14', flexWeekNumber: 6 });
    expect(db.term!.id).toBeTruthy();
  });

  it('normalises a subject code and trims the name', () => {
    const db = addSubject(EMPTY_DATABASE, { code: '  comp3311 ', name: ' Database Systems ', position: 0 });
    expect(db.subjects[0]).toMatchObject({ code: 'COMP3311', name: 'Database Systems', topics: [] });
  });

  it('stores an empty name as null rather than an empty string', () => {
    expect(addSubject(EMPTY_DATABASE, { code: 'X', name: '   ', position: 0 }).subjects[0].name).toBeNull();
  });

  it('deletes a subject and everything under it', () => {
    const db = seeded();
    expect(deleteSubject(db, db.subjects[0].id).subjects).toEqual([]);
  });

  it('replaces the term without touching subjects', () => {
    const db = seeded();
    const next = updateTerm(db, { ...db.term!, code: 'T1 2027' });
    expect(next.term!.code).toBe('T1 2027');
    expect(next.subjects).toBe(db.subjects);
  });
});

describe('ensureSubjects', () => {
  it('adds only codes that are missing, ignoring case', () => {
    const db = addSubject(EMPTY_DATABASE, { code: 'COMP3311', position: 0 });
    const next = ensureSubjects(db, ['comp3311', 'COMP1531', 'COMP1531']);

    expect(next.subjects.map((s) => s.code)).toEqual(['COMP3311', 'COMP1531']);
  });

  it('returns the same database when there is nothing to add', () => {
    const db = addSubject(EMPTY_DATABASE, { code: 'COMP3311', position: 0 });
    expect(ensureSubjects(db, ['COMP3311'])).toBe(db);
  });
});

describe('setStatus', () => {
  it('changes only the targeted subtopic', () => {
    const db = seeded();
    const target = subtopics(db)[0];
    const next = setStatus(db, target.id, 'blue');

    expect(subtopics(next).find((s) => s.id === target.id)!.status).toBe('blue');
    expect(subtopics(next).filter((s) => s.id !== target.id).every((s) => s.status === 'red')).toBe(true);
  });

  it('does not mutate the database it was given', () => {
    const db = seeded();
    const target = subtopics(db)[0];
    setStatus(db, target.id, 'green');

    expect(subtopics(db).find((s) => s.id === target.id)!.status).toBe('red');
  });

  it('is a no-op for an unknown id', () => {
    const db = seeded();
    expect(subtopics(setStatus(db, 'nope', 'blue')).every((s) => s.status === 'red')).toBe(true);
  });
});

describe('applyPaste', () => {
  it('creates topics with their subtopics, all starting red', () => {
    const db = seeded();
    const topic = db.subjects[0].topics[0];

    expect(topic).toMatchObject({ title: 'Attribute Closure', week_number: 3, position: 0 });
    expect(topic.subtopics.map((s) => s.title)).toEqual(['Computing X+', 'Finding keys']);
    expect(topic.subtopics.every((s) => s.status === 'red')).toBe(true);
  });

  it('adds new subtopics to an existing topic without disturbing set statuses', () => {
    // The behaviour the whole bulk-paste design exists to protect: re-pasting a
    // corrected outline must never cost a term of self-assessment.
    let db = seeded();
    const solid = subtopics(db)[0];
    db = setStatus(db, solid.id, 'blue');

    const subject = db.subjects[0];
    const existing: ExistingTopic[] = subject.topics.map((topic) => ({
      id: topic.id,
      title: topic.title,
      subtopics: topic.subtopics.map((s) => ({ id: s.id, title: s.title })),
    }));

    const plan = planMerge(
      existing,
      parseBulkPaste('Attribute Closure\n  Computing X+\n  Finding keys\n  Closure of a set'),
    );

    const next = applyPaste(db, {
      subjectId: subject.id,
      weekNumber: 3,
      plan,
      startPosition: subject.topics.length,
    });

    const titles = next.subjects[0].topics[0].subtopics.map((s) => s.title);
    expect(titles).toEqual(['Computing X+', 'Finding keys', 'Closure of a set']);
    expect(next.subjects[0].topics).toHaveLength(1);
    expect(subtopics(next).find((s) => s.id === solid.id)!.status).toBe('blue');
  });

  it('continues subtopic positions rather than restarting at zero', () => {
    let db = seeded();
    const subject = db.subjects[0];
    const existing: ExistingTopic[] = subject.topics.map((topic) => ({
      id: topic.id,
      title: topic.title,
      subtopics: topic.subtopics.map((s) => ({ id: s.id, title: s.title })),
    }));

    db = applyPaste(db, {
      subjectId: subject.id,
      weekNumber: 3,
      plan: planMerge(existing, parseBulkPaste('Attribute Closure\n  Third item')),
      startPosition: 1,
    });

    expect(db.subjects[0].topics[0].subtopics.map((s) => s.position)).toEqual([0, 1, 2]);
  });

  it('leaves other subjects alone', () => {
    let db = seeded();
    db = addSubject(db, { code: 'COMP1531', position: 1 });
    const before = db.subjects[1];

    const next = applyPaste(db, {
      subjectId: db.subjects[0].id,
      weekNumber: 5,
      plan: planMerge([], parseBulkPaste('New Topic')),
      startPosition: 1,
    });

    expect(next.subjects[1]).toBe(before);
  });

  it('gives every created row a distinct id', () => {
    const db = seeded();
    const ids = [
      ...db.subjects.map((s) => s.id),
      ...db.subjects.flatMap((s) => s.topics.map((t) => t.id)),
      ...subtopics(db).map((s) => s.id),
    ];
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('deletes', () => {
  it('removes a topic and its subtopics', () => {
    const db = seeded();
    const next = deleteTopic(db, db.subjects[0].topics[0].id);

    expect(next.subjects[0].topics).toEqual([]);
    expect(subtopics(next)).toEqual([]);
  });

  it('removes a single subtopic', () => {
    const db = seeded();
    const next = deleteSubtopic(db, subtopics(db)[0].id);

    expect(next.subjects[0].topics[0].subtopics.map((s) => s.title)).toEqual(['Finding keys']);
  });
});

function parsed(code: string, day: number): ParsedClass {
  return {
    subjectCode: code,
    classType: 'LEC',
    title: `${code} LEC`,
    location: 'Ainsworth 202',
    startsAt: new Date(2026, 8, day, 9, 0),
    endsAt: new Date(2026, 8, day, 11, 0),
    sourceUid: `${code}-uid`,
  };
}

const TERM = { id: 'term', ...DEFAULT_TERM };

/** Tuesday 9-11am, the shape of a typical lecture slot. */
const TUESDAY_LECTURE = {
  subjectCode: 'COMP3311',
  classType: 'LEC',
  location: 'Ainsworth 202',
  weekday: 2,
  startMinutes: 9 * 60,
  endMinutes: 11 * 60,
};

describe('replaceImportedClasses', () => {
  it('replaces imported classes, so ones you dropped disappear', () => {
    let db = replaceImportedClasses(EMPTY_DATABASE, [parsed('COMP3311', 15), parsed('COMP1531', 16)]);
    expect(db.classes).toHaveLength(2);

    db = replaceImportedClasses(db, [parsed('COMP3311', 15)]);
    expect(db.classes.map((c) => c.subject_code)).toEqual(['COMP3311']);
  });

  it('never deletes a class you entered by hand', () => {
    // The classes actually attended matter more than the enrolment, so an
    // import must not quietly wipe them.
    let db = addClassSeries(EMPTY_DATABASE, TUESDAY_LECTURE, TERM);
    const manualCount = db.classes.length;

    db = replaceImportedClasses(db, [parsed('COMP1531', 16)]);
    expect(db.classes.filter((c) => c.series_id !== null)).toHaveLength(manualCount);

    db = replaceImportedClasses(db, []);
    expect(db.classes).toHaveLength(manualCount);
  });

  it('stores classes in chronological order', () => {
    const db = replaceImportedClasses(EMPTY_DATABASE, [parsed('B', 20), parsed('A', 15)]);
    expect(db.classes.map((c) => c.subject_code)).toEqual(['A', 'B']);
  });

  it('marks imported classes as having no series', () => {
    const db = replaceImportedClasses(EMPTY_DATABASE, [parsed('COMP3311', 15)]);
    expect(db.classes[0].series_id).toBeNull();
  });

  it('leaves subjects untouched', () => {
    const db = seeded();
    expect(replaceImportedClasses(db, [parsed('COMP3311', 15)]).subjects).toBe(db.subjects);
  });

  it('accepts an empty timetable', () => {
    expect(replaceImportedClasses(seeded(), []).classes).toEqual([]);
  });
});

describe('hand-entered classes', () => {
  it('repeats across every teaching week and skips Flexibility Week', () => {
    const db = addClassSeries(EMPTY_DATABASE, TUESDAY_LECTURE, TERM);

    // 10 calendar weeks minus week 6.
    expect(db.classes).toHaveLength(9);

    const weeks = db.classes.map((entry) => {
      const position = termPositionForDate(new Date(entry.starts_at), TERM);
      return position.kind === 'week' ? position.weekNumber : null;
    });
    expect(weeks).toEqual([1, 2, 3, 4, 5, 7, 8, 9, 10]);
  });

  it('keeps a 9am class at 9am after the October daylight-saving change', () => {
    // Building occurrences by adding 7x24h would silently shift the back half
    // of term to 10am once Sydney moves to AEDT.
    const db = addClassSeries(EMPTY_DATABASE, TUESDAY_LECTURE, TERM);

    for (const entry of db.classes) {
      const start = new Date(entry.starts_at);
      const end = new Date(entry.ends_at);
      expect(start.getHours()).toBe(9);
      expect(end.getHours()).toBe(11);
      expect(start.getDay()).toBe(2);
    }
  });

  it('creates the subject if it does not exist yet', () => {
    const db = addClassSeries(EMPTY_DATABASE, TUESDAY_LECTURE, TERM);
    expect(db.subjects.map((s) => s.code)).toEqual(['COMP3311']);
  });

  it('normalises the course code and type', () => {
    const db = addClassSeries(EMPTY_DATABASE, { ...TUESDAY_LECTURE, subjectCode: ' comp3311 ', classType: 'lec' }, TERM);
    expect(db.classes[0]).toMatchObject({ subject_code: 'COMP3311', class_type: 'LEC' });
  });

  it('collapses back into one row per weekly slot', () => {
    let db = addClassSeries(EMPTY_DATABASE, TUESDAY_LECTURE, TERM);
    db = addClassSeries(db, { ...TUESDAY_LECTURE, weekday: 4, startMinutes: 14 * 60, endMinutes: 15 * 60 }, TERM);

    const series = classSeries(db);
    expect(series).toHaveLength(2);
    expect(series.map((s) => s.weekday)).toEqual([2, 4]);
    expect(series[0]).toMatchObject({ subjectCode: 'COMP3311', startMinutes: 9 * 60, occurrences: 9 });
  });

  it('edits every occurrence at once', () => {
    let db = addClassSeries(EMPTY_DATABASE, TUESDAY_LECTURE, TERM);
    const seriesId = classSeries(db)[0].seriesId;

    db = updateClassSeries(db, seriesId, { ...TUESDAY_LECTURE, weekday: 3, location: 'Quad G040' }, TERM);

    expect(db.classes).toHaveLength(9);
    expect(db.classes.every((c) => new Date(c.starts_at).getDay() === 3)).toBe(true);
    expect(db.classes.every((c) => c.location === 'Quad G040')).toBe(true);
    expect(classSeries(db)).toHaveLength(1);
  });

  it('deletes the whole series', () => {
    let db = addClassSeries(EMPTY_DATABASE, TUESDAY_LECTURE, TERM);
    db = addClassSeries(db, { ...TUESDAY_LECTURE, subjectCode: 'COMP1531', weekday: 3 }, TERM);

    db = deleteClassSeries(db, classSeries(db)[0].seriesId);

    expect(classSeries(db)).toHaveLength(1);
    expect(classSeries(db)[0].subjectCode).toBe('COMP1531');
  });

  it('deletes a single occurrence, for one cancelled class', () => {
    let db = addClassSeries(EMPTY_DATABASE, TUESDAY_LECTURE, TERM);
    db = deleteClass(db, db.classes[0].id);

    expect(db.classes).toHaveLength(8);
    expect(classSeries(db)[0].occurrences).toBe(8);
  });

  it('survives a backup round trip', () => {
    const db = addClassSeries(EMPTY_DATABASE, TUESDAY_LECTURE, TERM);
    const restored = parseDatabase(serialiseDatabase(db));

    expect(restored.classes).toHaveLength(9);
    expect(classSeries(restored)).toHaveLength(1);
    expect(classSeries(restored)[0]).toMatchObject({ subjectCode: 'COMP3311', startMinutes: 9 * 60 });
  });
});

describe('parseDatabase', () => {
  it('round-trips a serialised database', () => {
    const db = replaceImportedClasses(seeded(), []);
    const restored = parseDatabase(serialiseDatabase(db));

    expect(restored.term).toEqual(db.term);
    expect(restored.subjects).toEqual(db.subjects);
  });

  it('preserves statuses through a round trip', () => {
    let db = seeded();
    db = setStatus(db, subtopics(db)[0].id, 'blue');

    const restored = parseDatabase(serialiseDatabase(db));
    expect(subtopics(restored).map((s) => s.status)).toEqual(['blue', 'red']);
  });

  it('rejects a file that is not a backup', () => {
    expect(() => parseDatabase('{"hello":"world"}')).toThrow(/not a Semester Tracker backup/);
    expect(() => parseDatabase('[]')).toThrow(/not a Semester Tracker backup/);
    expect(() => parseDatabase('null')).toThrow(/not a Semester Tracker backup/);
  });

  it('drops malformed rows instead of failing the whole restore', () => {
    const restored = parseDatabase({
      term: { id: 't', code: 'T3 2026', startDate: '2026-09-14', numWeeks: 10, flexWeekNumber: 6 },
      subjects: [
        null,
        { code: '' },
        {
          id: 's1',
          code: 'COMP3311',
          topics: [{ id: 't1', title: 'Topic', week_number: 3, subtopics: [{ id: 'x', title: 'Sub' }, { title: '' }] }],
        },
      ],
      classes: [{ subject_code: 'COMP3311', starts_at: 'not-a-date', ends_at: 'nope' }],
    });

    expect(restored.subjects).toHaveLength(1);
    expect(subtopics(restored).map((s) => s.title)).toEqual(['Sub']);
    // A subtopic with no recorded status is the most conservative thing to
    // restore as red, not as mastered.
    expect(subtopics(restored)[0].status).toBe('red');
    expect(restored.classes).toEqual([]);
  });

  it('discards a term with an unusable start date', () => {
    expect(parseDatabase({ term: { code: 'X', startDate: 'yesterday' }, subjects: [] }).term).toBeNull();
  });

  it('accepts a backup with no term yet', () => {
    expect(parseDatabase({ term: null, subjects: [], classes: [] })).toMatchObject({ term: null });
  });
});

describe('describeDatabase', () => {
  it('summarises what a restore would bring in', () => {
    expect(describeDatabase(seeded())).toBe('T3 2026 · 1 subject · 2 subtopics · 0 classes');
    expect(describeDatabase(EMPTY_DATABASE)).toBe('no term · 0 subjects · 0 subtopics · 0 classes');
  });
});
