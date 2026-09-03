/**
 * The four-level mastery scale. This is the whole point of the app: it separates
 * "I understand this" from "I can produce this", which is the gap that only shows
 * up in week 12 otherwise.
 */
export const STATUSES = ['red', 'yellow', 'green', 'blue'] as const;

export type Status = (typeof STATUSES)[number];

export const STATUS_LABEL: Record<Status, string> = {
  red: "Don't understand",
  yellow: "Understand, can't apply",
  green: 'Can do independently',
  blue: 'Can do under exam conditions',
};

/** Short form, for tight spaces like the week grid. */
export const STATUS_SHORT: Record<Status, string> = {
  red: 'Lost',
  yellow: 'Shaky',
  green: 'Solid',
  blue: 'Exam-ready',
};

export const STATUS_EMOJI: Record<Status, string> = {
  red: '🔴',
  yellow: '🟡',
  green: '🟢',
  blue: '🔵',
};

export const STATUS_COLOR: Record<Status, string> = {
  red: '#E5484D',
  yellow: '#FFB224',
  green: '#30A46C',
  blue: '#0091FF',
};

/** Contribution of each status to a progress fraction. */
export const STATUS_WEIGHT: Record<Status, number> = {
  red: 0,
  yellow: 1 / 3,
  green: 2 / 3,
  blue: 1,
};

/** Anything below `green` needs work and should surface on the Today screen. */
export function isWeak(status: Status): boolean {
  return status === 'red' || status === 'yellow';
}

/** Tapping a subtopic walks the scale and wraps back to red. */
export function nextStatus(status: Status): Status {
  return STATUSES[(STATUSES.indexOf(status) + 1) % STATUSES.length];
}
