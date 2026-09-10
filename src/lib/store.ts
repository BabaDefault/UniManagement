import type { MergePlan } from './bulk-paste';
import type { ParsedClass } from './ical';
import type { ClassRecord, SubjectRecord } from './records';
import { STATUSES, type Status } from './status';
import { addDays, teachingWeekNumbers, weekStartDate, type Term } from './terms';

/**
 * The entire app database, as one plain object.
 *
 * Single user, a few hundred rows, and every screen already derives from the
 * whole tree in memory — so there is nothing for a query engine to do here. One
 * object means atomic writes, trivial backups, and pure functions that can be
 * tested without any storage or React at all.
 *
 * Everything in this file is pure: it takes a database and returns a new one.
 * Persistence lives in `local-db.ts`.
 */

export const DATABASE_VERSION = 1;

export type Database = {
  version: number;
  term: Term | null;
  subjects: SubjectRecord[];
  classes: ClassRecord[];
};

export const EMPTY_DATABASE: Database = {
  version: DATABASE_VERSION,
  term: null,
  subjects: [],
  classes: [],
};

// ------------------------------------------------------------------------ ids

let counter = 0;

/**
 * Local-only ids. They never leave this device except in a backup file, so they
 * only need to be unique within one database — the counter guarantees that even
 * when several are minted inside the same millisecond.
 */
export function newId(prefix = 'id'): string {
  counter += 1;
  const time = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${time}${counter.toString(36)}${random}`;
}

// ----------------------------------------------------------------------- term

export function createTerm(db: Database, term: Omit<Term, 'id'>): Database {
  return { ...db, term: { ...term, id: newId('term') } };
}

export function updateTerm(db: Database, term: Term): Database {
  return { ...db, term };
}

// ------------------------------------------------------------------- subjects

export function addSubject(
  db: Database,
  { code, name, position }: { code: string; name?: string | null; position: number },
): Database {
  const subject: SubjectRecord = {
    id: newId('subject'),
    code: code.trim().toUpperCase(),
    name: name?.trim() || null,
    colour: null,
    position,
    topics: [],
  };

  return { ...db, subjects: [...db.subjects, subject] };
}

export function deleteSubject(db: Database, subjectId: string): Database {
  return { ...db, subjects: db.subjects.filter((subject) => subject.id !== subjectId) };
}

/** Add any course codes seen in a timetable import that are not subjects yet. */
export function ensureSubjects(db: Database, codes: readonly string[]): Database {
  const known = new Set(db.subjects.map((subject) => subject.code.toUpperCase()));
  let next = db;

  for (const code of codes) {
    const upper = code.trim().toUpperCase();
    if (upper === '' || known.has(upper)) continue;
    known.add(upper);
    next = addSubject(next, { code: upper, position: next.subjects.length });
  }

  return next;
}

// --------------------------------------------------------------------- topics

function mapSubjects(db: Database, fn: (subject: SubjectRecord) => SubjectRecord): Database {
  return { ...db, subjects: db.subjects.map(fn) };
}

export function setStatus(db: Database, subtopicId: string, status: Status): Database {
  return mapSubjects(db, (subject) => ({
    ...subject,
    topics: subject.topics.map((topic) => ({
      ...topic,
      subtopics: topic.subtopics.map((subtopic) =>
        subtopic.id === subtopicId ? { ...subtopic, status } : subtopic,
      ),
    })),
  }));
}

export function deleteTopic(db: Database, topicId: string): Database {
  return mapSubjects(db, (subject) => ({
    ...subject,
    topics: subject.topics.filter((topic) => topic.id !== topicId),
  }));
}

export function deleteSubtopic(db: Database, subtopicId: string): Database {
  return mapSubjects(db, (subject) => ({
    ...subject,
    topics: subject.topics.map((topic) => ({
      ...topic,
      subtopics: topic.subtopics.filter((subtopic) => subtopic.id !== subtopicId),
    })),
  }));
}

/**
 * Apply a bulk paste. The plan has already worked out what is new; this only
 * adds. Nothing here removes or rewrites an existing subtopic, so a status you
 * have already set survives any number of re-pastes.
 */
export function applyPaste(
  db: Database,
  {
    subjectId,
    weekNumber,
    plan,
    startPosition,
  }: { subjectId: string; weekNumber: number; plan: MergePlan; startPosition: number },
): Database {
  return mapSubjects(db, (subject) => {
    if (subject.id !== subjectId) return subject;

    const topics = subject.topics.map((topic) => {
      const addition = plan.newSubtopics.find((entry) => entry.topicId === topic.id);
      if (!addition) return topic;

      const base = topic.subtopics.reduce((max, sub) => Math.max(max, sub.position), -1) + 1;

      return {
        ...topic,
        subtopics: [
          ...topic.subtopics,
          ...addition.titles.map((title, index) => ({
            id: newId('subtopic'),
            title,
            status: 'red' as Status,
            position: base + index,
          })),
        ],
      };
    });

    const created = plan.newTopics.map((topic, index) => ({
      id: newId('topic'),
      week_number: weekNumber,
      title: topic.title,
      position: startPosition + index,
      subtopics: topic.subtopics.map((title, subIndex) => ({
        id: newId('subtopic'),
        title,
        status: 'red' as Status,
        position: subIndex,
      })),
    }));

    return { ...subject, topics: [...topics, ...created] };
  });
}

// -------------------------------------------------------------------- classes

function sortClasses(classes: ClassRecord[]): ClassRecord[] {
  return classes.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
}

/**
 * Replace the imported half of the timetable, leaving hand-entered classes be.
 *
 * Imported classes are disposable — re-importing is the correct way to pick up a
 * changed enrolment. Classes you typed in are not: they are the ones you
 * actually attend, including your friends' classes that your own timetable has
 * never heard of, and an import must never silently delete them.
 */
export function replaceImportedClasses(db: Database, classes: readonly ParsedClass[]): Database {
  const manual = db.classes.filter((entry) => entry.series_id !== null);

  const imported: ClassRecord[] = classes.map((entry) => ({
    id: newId('class'),
    subject_code: entry.subjectCode,
    class_type: entry.classType,
    title: entry.title,
    location: entry.location,
    starts_at: entry.startsAt.toISOString(),
    ends_at: entry.endsAt.toISOString(),
    source_uid: entry.sourceUid,
    series_id: null,
  }));

  return { ...db, classes: sortClasses([...manual, ...imported]) };
}

/** A class as you describe it: one weekly slot, repeated across the term. */
export type ClassSeriesInput = {
  subjectCode: string;
  classType: string | null;
  location: string | null;
  /** JavaScript weekday, 0 = Sunday. */
  weekday: number;
  /** Minutes from local midnight. */
  startMinutes: number;
  endMinutes: number;
};

/**
 * Build the weekly occurrences of a hand-entered class.
 *
 * Times are constructed from local date components rather than by adding
 * milliseconds, so a 9am class is still 9am after Sydney moves to AEDT in
 * October — adding 7×24h across that boundary would quietly shift it to 10am
 * for the back half of term.
 *
 * Flexibility Week is skipped: there is no teaching that week.
 */
export function classOccurrences(
  input: ClassSeriesInput,
  term: Term,
  seriesId: string,
): ClassRecord[] {
  const records: ClassRecord[] = [];
  const offsetFromMonday = (input.weekday + 6) % 7;

  for (const week of teachingWeekNumbers(term)) {
    const day = addDays(weekStartDate(week, term), offsetFromMonday);

    const startsAt = new Date(
      day.getFullYear(),
      day.getMonth(),
      day.getDate(),
      Math.floor(input.startMinutes / 60),
      input.startMinutes % 60,
    );
    const endsAt = new Date(
      day.getFullYear(),
      day.getMonth(),
      day.getDate(),
      Math.floor(input.endMinutes / 60),
      input.endMinutes % 60,
    );

    records.push({
      id: newId('class'),
      subject_code: input.subjectCode.trim().toUpperCase(),
      class_type: input.classType?.trim().toUpperCase() || null,
      title: [input.subjectCode.trim().toUpperCase(), input.classType?.trim().toUpperCase()]
        .filter(Boolean)
        .join(' '),
      location: input.location?.trim() || null,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      source_uid: null,
      series_id: seriesId,
    });
  }

  return records;
}

export function addClassSeries(db: Database, input: ClassSeriesInput, term: Term): Database {
  const seriesId = newId('series');
  const added = classOccurrences(input, term, seriesId);

  return {
    ...db,
    classes: sortClasses([...db.classes, ...added]),
    // A class you add for a course you have not set up yet should not vanish
    // from Today because there is no matching subject.
    subjects: ensureSubjects(db, [input.subjectCode]).subjects,
  };
}

/** Edit every occurrence of a hand-entered class at once. */
export function updateClassSeries(
  db: Database,
  seriesId: string,
  input: ClassSeriesInput,
  term: Term,
): Database {
  const others = db.classes.filter((entry) => entry.series_id !== seriesId);
  const rebuilt = classOccurrences(input, term, seriesId);

  return {
    ...db,
    classes: sortClasses([...others, ...rebuilt]),
    subjects: ensureSubjects(db, [input.subjectCode]).subjects,
  };
}

/** Remove every occurrence of a hand-entered class. */
export function deleteClassSeries(db: Database, seriesId: string): Database {
  return { ...db, classes: db.classes.filter((entry) => entry.series_id !== seriesId) };
}

/** Remove one occurrence — a single cancelled lecture, say. */
export function deleteClass(db: Database, classId: string): Database {
  return { ...db, classes: db.classes.filter((entry) => entry.id !== classId) };
}

export function clearImportedClasses(db: Database): Database {
  return { ...db, classes: db.classes.filter((entry) => entry.series_id !== null) };
}

// ------------------------------------------------------------ serialisation

export function serialiseDatabase(db: Database): string {
  return JSON.stringify(db, null, 2);
}

function isStatus(value: unknown): value is Status {
  return typeof value === 'string' && (STATUSES as readonly string[]).includes(value);
}

/**
 * Parse a stored or imported database, discarding anything malformed.
 *
 * Backup files are hand-editable and storage can be truncated, so this is
 * deliberately forgiving: a bad subtopic is dropped rather than taking the
 * whole term down with it. It throws only when the input is not a database at
 * all, so an import of the wrong file is reported instead of silently wiping
 * everything.
 */
export function parseDatabase(input: unknown): Database {
  const raw = typeof input === 'string' ? (JSON.parse(input) as unknown) : input;

  if (raw === null || typeof raw !== 'object') {
    throw new Error('That file is not a Semester Tracker backup.');
  }

  const record = raw as Record<string, unknown>;
  if (!('subjects' in record) && !('term' in record)) {
    throw new Error('That file is not a Semester Tracker backup.');
  }

  const term = parseTerm(record.term);
  const subjects = asArray(record.subjects).map(parseSubject).filter(Boolean) as SubjectRecord[];
  const classes = asArray(record.classes).map(parseClass).filter(Boolean) as ClassRecord[];

  return { version: DATABASE_VERSION, term, subjects, classes };
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function num(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function parseTerm(value: unknown): Term | null {
  if (value === null || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;

  const startDate = str(record.startDate);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return null;

  const flex = record.flexWeekNumber;

  return {
    id: str(record.id) || newId('term'),
    code: str(record.code, 'Term'),
    startDate,
    numWeeks: Math.max(1, num(record.numWeeks, 10)),
    flexWeekNumber: typeof flex === 'number' && Number.isFinite(flex) ? flex : null,
  };
}

function parseSubject(value: unknown): SubjectRecord | null {
  if (value === null || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;

  const code = str(record.code).trim();
  if (code === '') return null;

  return {
    id: str(record.id) || newId('subject'),
    code,
    name: typeof record.name === 'string' ? record.name : null,
    colour: typeof record.colour === 'string' ? record.colour : null,
    position: num(record.position),
    topics: asArray(record.topics).map(parseTopic).filter(Boolean) as SubjectRecord['topics'],
  };
}

function parseTopic(value: unknown): SubjectRecord['topics'][number] | null {
  if (value === null || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;

  const title = str(record.title).trim();
  if (title === '') return null;

  return {
    id: str(record.id) || newId('topic'),
    week_number: Math.max(1, num(record.week_number, 1)),
    title,
    position: num(record.position),
    subtopics: asArray(record.subtopics).map(parseSubtopic).filter(Boolean) as SubjectRecord['topics'][number]['subtopics'],
  };
}

function parseSubtopic(value: unknown): SubjectRecord['topics'][number]['subtopics'][number] | null {
  if (value === null || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;

  const title = str(record.title).trim();
  if (title === '') return null;

  return {
    id: str(record.id) || newId('subtopic'),
    title,
    status: isStatus(record.status) ? record.status : 'red',
    position: num(record.position),
  };
}

function parseClass(value: unknown): ClassRecord | null {
  if (value === null || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;

  const startsAt = str(record.starts_at);
  const endsAt = str(record.ends_at);
  const subjectCode = str(record.subject_code).trim();

  // A class with no time is unusable on the Today screen and the widget.
  if (subjectCode === '' || Number.isNaN(Date.parse(startsAt)) || Number.isNaN(Date.parse(endsAt))) {
    return null;
  }

  return {
    id: str(record.id) || newId('class'),
    subject_code: subjectCode,
    class_type: typeof record.class_type === 'string' ? record.class_type : null,
    title: typeof record.title === 'string' ? record.title : null,
    location: typeof record.location === 'string' ? record.location : null,
    starts_at: startsAt,
    ends_at: endsAt,
    source_uid: typeof record.source_uid === 'string' ? record.source_uid : null,
    series_id: typeof record.series_id === 'string' ? record.series_id : null,
  };
}

/**
 * The hand-entered classes, collapsed back into one row per weekly slot.
 *
 * Occurrences are what get stored and rendered on the timetable, but they are
 * not what you think in — you think "COMP3311 lecture, Tuesdays 9 to 11", and
 * that is what the edit and delete controls should act on.
 */
export type ClassSeries = ClassSeriesInput & {
  seriesId: string;
  occurrences: number;
};

export function classSeries(db: Database): ClassSeries[] {
  const bySeries = new Map<string, ClassSeries>();

  for (const entry of db.classes) {
    if (entry.series_id === null) continue;

    const existing = bySeries.get(entry.series_id);
    if (existing) {
      existing.occurrences += 1;
      continue;
    }

    const startsAt = new Date(entry.starts_at);
    const endsAt = new Date(entry.ends_at);

    bySeries.set(entry.series_id, {
      seriesId: entry.series_id,
      subjectCode: entry.subject_code,
      classType: entry.class_type,
      location: entry.location,
      weekday: startsAt.getDay(),
      startMinutes: startsAt.getHours() * 60 + startsAt.getMinutes(),
      endMinutes: endsAt.getHours() * 60 + endsAt.getMinutes(),
      occurrences: 1,
    });
  }

  return [...bySeries.values()].sort((a, b) => {
    // Monday first, matching how a timetable reads.
    const dayA = (a.weekday + 6) % 7;
    const dayB = (b.weekday + 6) % 7;
    if (dayA !== dayB) return dayA - dayB;
    if (a.startMinutes !== b.startMinutes) return a.startMinutes - b.startMinutes;
    return a.subjectCode.localeCompare(b.subjectCode);
  });
}

/** A one-line description of a parsed backup, for the import confirmation. */
export function describeDatabase(db: Database): string {
  const subtopics = db.subjects.reduce(
    (total, subject) => total + subject.topics.reduce((n, topic) => n + topic.subtopics.length, 0),
    0,
  );

  const parts = [
    db.term ? db.term.code : 'no term',
    `${db.subjects.length} subject${db.subjects.length === 1 ? '' : 's'}`,
    `${subtopics} subtopic${subtopics === 1 ? '' : 's'}`,
    `${db.classes.length} class${db.classes.length === 1 ? '' : 'es'}`,
  ];

  return parts.join(' · ');
}
