import { combine, EMPTY_SUMMARY, summarise, type Summary } from './progress';
import { isWeak, type Status } from './status';

/**
 * The whole term is one small tree (a few hundred rows at most), so it is
 * fetched in a single query and every view is derived from it in memory. That
 * keeps the Today screen, the week grid and the tracker perfectly consistent
 * with each other and makes optimistic updates a one-line cache edit.
 */

export type SubtopicNode = {
  id: string;
  title: string;
  status: Status;
  position: number;
};

export type TopicNode = {
  id: string;
  week_number: number;
  title: string;
  position: number;
  subtopics: SubtopicNode[];
};

export type SubjectNode = {
  id: string;
  code: string;
  name: string | null;
  colour: string | null;
  position: number;
  topics: TopicNode[];
};

function byPosition<T extends { position: number; title?: string; code?: string }>(a: T, b: T): number {
  if (a.position !== b.position) return a.position - b.position;
  return (a.title ?? a.code ?? '').localeCompare(b.title ?? b.code ?? '');
}

/** Nested selects come back in arbitrary order; impose a stable one. */
export function sortTree(subjects: readonly SubjectNode[]): SubjectNode[] {
  return [...subjects].sort(byPosition).map((subject) => ({
    ...subject,
    topics: [...subject.topics]
      .sort((a, b) => (a.week_number !== b.week_number ? a.week_number - b.week_number : byPosition(a, b)))
      .map((topic) => ({ ...topic, subtopics: [...topic.subtopics].sort(byPosition) })),
  }));
}

export function topicsForWeek(subject: SubjectNode, weekNumber: number): TopicNode[] {
  return subject.topics.filter((topic) => topic.week_number === weekNumber);
}

export function topicSummary(topic: TopicNode): Summary {
  return summarise(topic.subtopics.map((sub) => sub.status));
}

export function weekSummary(subject: SubjectNode, weekNumber: number): Summary {
  const topics = topicsForWeek(subject, weekNumber);
  if (topics.length === 0) return EMPTY_SUMMARY;
  return combine(topics.map(topicSummary));
}

export function subjectSummary(subject: SubjectNode): Summary {
  if (subject.topics.length === 0) return EMPTY_SUMMARY;
  return combine(subject.topics.map(topicSummary));
}

export function termSummary(subjects: readonly SubjectNode[]): Summary {
  return combine(subjects.map(subjectSummary));
}

export type WeakItem = {
  subjectId: string;
  subjectCode: string;
  weekNumber: number;
  topicTitle: string;
  subtopicId: string;
  subtopicTitle: string;
  status: Status;
};

/**
 * The "what should I work on" list. Red before yellow, because the point is to
 * surface the things that will not fix themselves.
 */
export function weakItems(subjects: readonly SubjectNode[], weekNumber?: number): WeakItem[] {
  const items: WeakItem[] = [];

  for (const subject of subjects) {
    for (const topic of subject.topics) {
      if (weekNumber !== undefined && topic.week_number !== weekNumber) continue;

      for (const subtopic of topic.subtopics) {
        if (!isWeak(subtopic.status)) continue;
        items.push({
          subjectId: subject.id,
          subjectCode: subject.code,
          weekNumber: topic.week_number,
          topicTitle: topic.title,
          subtopicId: subtopic.id,
          subtopicTitle: subtopic.title,
          status: subtopic.status,
        });
      }
    }
  }

  return items.sort((a, b) => {
    if (a.status !== b.status) return a.status === 'red' ? -1 : 1;
    if (a.weekNumber !== b.weekNumber) return a.weekNumber - b.weekNumber;
    return a.subjectCode.localeCompare(b.subjectCode);
  });
}

/** Weeks that have any topics at all — used to render "not set up" distinctly. */
export function weeksWithContent(subject: SubjectNode): Set<number> {
  return new Set(subject.topics.map((topic) => topic.week_number));
}

export function findSubject(subjects: readonly SubjectNode[], id: string): SubjectNode | undefined {
  return subjects.find((subject) => subject.id === id);
}
