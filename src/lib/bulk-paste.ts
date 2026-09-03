/**
 * Bulk entry for a week's topics.
 *
 * Setting up a term is the moment the app is most likely to be abandoned, so
 * a week goes in as one paste from the course outline rather than a few dozen
 * taps:
 *
 *   Functional Dependencies
 *     Definition of FD
 *     Armstrong's axioms
 *   Attribute Closure
 *     Computing X+
 *
 * Unindented lines are topics, indented lines are subtopics under the topic
 * above them.
 */

export type ParsedTopic = {
  title: string;
  subtopics: string[];
};

const BULLET = /^[-*•–—]\s+/;
const NUMBERED = /^\d+[.)]\s+/;

/** Strip list markers people paste in without meaning to. */
function cleanTitle(line: string): string {
  return line.trim().replace(BULLET, '').replace(NUMBERED, '').trim();
}

/** Tabs count as a full indent level; spaces need at least two. */
function isIndented(line: string): boolean {
  const leading = line.slice(0, line.length - line.trimStart().length);
  return leading.includes('\t') || leading.length >= 2;
}

export function parseBulkPaste(input: string): ParsedTopic[] {
  const topics: ParsedTopic[] = [];

  for (const rawLine of input.split(/\r?\n/)) {
    if (rawLine.trim() === '') continue;

    const title = cleanTitle(rawLine);
    if (title === '') continue;

    // An indented line with no topic above it has nothing to attach to, so it
    // is promoted rather than silently dropped. This also makes a flat list of
    // topics paste sensibly.
    if (isIndented(rawLine) && topics.length > 0) {
      topics[topics.length - 1].subtopics.push(title);
    } else {
      topics.push({ title, subtopics: [] });
    }
  }

  // A topic with no subtopics has nothing to track, so it becomes its own
  // single subtopic. Pasting a flat topic list still gives you a usable week.
  for (const topic of topics) {
    if (topic.subtopics.length === 0) topic.subtopics.push(topic.title);
  }

  return topics;
}

export type ExistingTopic = {
  id: string;
  title: string;
  subtopics: { id: string; title: string }[];
};

export type MergePlan = {
  /** Topics that do not exist yet, with all of their subtopics. */
  newTopics: ParsedTopic[];
  /** Subtopics to add to a topic that already exists. */
  newSubtopics: { topicId: string; titles: string[] }[];
  /** Subtopics already present, whose statuses are left untouched. */
  keptCount: number;
};

function normalise(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Work out what a paste would add, matching on title.
 *
 * Re-pasting a corrected outline must never wipe statuses you have already set
 * — losing a term of self-assessment to a stray paste would end use of the app
 * immediately. Nothing here deletes: unrecognised existing rows are left alone,
 * and removals are done by hand.
 */
export function planMerge(existing: readonly ExistingTopic[], parsed: readonly ParsedTopic[]): MergePlan {
  const byTitle = new Map(existing.map((topic) => [normalise(topic.title), topic]));

  const newTopics: ParsedTopic[] = [];
  const pendingByTitle = new Map<string, ParsedTopic>();
  const additionsByTopicId = new Map<string, string[]>();
  /** Subtopic titles already accounted for, per existing topic. */
  const handledByTopicId = new Map<string, Set<string>>();
  let keptCount = 0;

  for (const topic of parsed) {
    const key = normalise(topic.title);
    const match = byTitle.get(key);

    if (match) {
      const present = new Set(match.subtopics.map((sub) => normalise(sub.title)));

      let handled = handledByTopicId.get(match.id);
      if (!handled) {
        handled = new Set<string>();
        handledByTopicId.set(match.id, handled);
      }

      const additions = additionsByTopicId.get(match.id) ?? [];

      for (const subtopic of topic.subtopics) {
        const subKey = normalise(subtopic);
        if (handled.has(subKey)) continue;
        handled.add(subKey);

        if (present.has(subKey)) keptCount += 1;
        else additions.push(subtopic);
      }

      if (additions.length > 0) additionsByTopicId.set(match.id, additions);
      continue;
    }

    // The same topic title can appear more than once in a paste; fold the
    // second occurrence into the first rather than creating a duplicate.
    let pending = pendingByTitle.get(key);
    if (!pending) {
      pending = { title: topic.title, subtopics: [] };
      pendingByTitle.set(key, pending);
      newTopics.push(pending);
    }

    const seen = new Set(pending.subtopics.map(normalise));
    for (const subtopic of topic.subtopics) {
      const subKey = normalise(subtopic);
      if (seen.has(subKey)) continue;
      seen.add(subKey);
      pending.subtopics.push(subtopic);
    }
  }

  const newSubtopics = [...additionsByTopicId].map(([topicId, titles]) => ({ topicId, titles }));

  return { newTopics, newSubtopics, keptCount };
}

export function describeMergePlan(plan: MergePlan): string {
  const added =
    plan.newTopics.reduce((n, topic) => n + topic.subtopics.length, 0) +
    plan.newSubtopics.reduce((n, entry) => n + entry.titles.length, 0);

  const parts: string[] = [];
  if (plan.newTopics.length > 0) {
    parts.push(`${plan.newTopics.length} new topic${plan.newTopics.length === 1 ? '' : 's'}`);
  }
  if (added > 0) parts.push(`${added} new subtopic${added === 1 ? '' : 's'}`);
  if (plan.keptCount > 0) parts.push(`${plan.keptCount} kept as-is`);

  return parts.length > 0 ? parts.join(' · ') : 'Nothing new to add';
}
