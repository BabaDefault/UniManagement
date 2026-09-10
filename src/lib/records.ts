import type { Status } from './status';

/**
 * The shapes that get persisted to disk and written into a backup file.
 *
 * These are a stored format, not internal state: renaming a field here breaks
 * every backup a user has already exported, so treat them as stable and
 * migrate explicitly (see `DATABASE_VERSION` in `store.ts`) rather than
 * renaming in place.
 */

export type ClassRecord = {
  id: string;
  subject_code: string;
  /** LEC / TUT / LAB / SEM / WEB, as UNSW abbreviates them. */
  class_type: string | null;
  title: string | null;
  location: string | null;
  /** ISO timestamps. */
  starts_at: string;
  ends_at: string;
  /** VEVENT UID from the myUNSW feed, when the import could find one. */
  source_uid: string | null;
  /**
   * Set when you added this class by hand. Every weekly occurrence of the same
   * class shares one series id, so "delete this class" can mean the whole term
   * rather than one Tuesday.
   *
   * Null means it came from a timetable import. That distinction is what lets a
   * re-import replace the imported classes without touching the ones you
   * entered — which matter more, since they are the classes you actually go to.
   */
  series_id: string | null;
};

export type SubtopicRecord = {
  id: string;
  title: string;
  status: Status;
  position: number;
};

export type TopicRecord = {
  id: string;
  week_number: number;
  title: string;
  position: number;
  subtopics: SubtopicRecord[];
};

export type SubjectRecord = {
  id: string;
  code: string;
  name: string | null;
  colour: string | null;
  position: number;
  topics: TopicRecord[];
};
