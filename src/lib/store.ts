import type { MergePlan } from './bulk-paste';
import type { ParsedClass } from './ical';
import type { ClassRecord, SubjectRecord } from './records';
import { STATUSES, type Status } from './status';
import type { Term } from './terms';

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

/**
 * Replace the timetable outright.
 *
 * Classes carry no judgement of yours — everything you set lives on subtopics —
 * so replacing is both safe and trivially correct, and it drops classes you are
 * no longer enrolled in, which merging would leave behind.
 */
export function replaceClasses(db: Database, classes: readonly ParsedClass[]): Database {
  const records: ClassRecord[] = classes.map((entry) => ({
    id: newId('class'),
    subject_code: entry.subjectCode,
    class_type: entry.classType,
    title: entry.title,
    location: entry.location,
    starts_at: entry.startsAt.toISOString(),
    ends_at: entry.endsAt.toISOString(),
    source_uid: entry.sourceUid,
  }));

  records.sort((a, b) => a.starts_at.localeCompare(b.starts_at));

  return { ...db, classes: records };
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
  };
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
