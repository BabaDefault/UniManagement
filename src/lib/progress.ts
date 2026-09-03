import { isWeak, STATUS_WEIGHT, STATUSES, type Status } from './status';

export type Summary = {
  /** Number of subtopics rolled up. */
  total: number;
  byStatus: Record<Status, number>;
  /**
   * 0-1 mastery, or null when there is nothing to measure.
   *
   * null means "not set up yet" and must render differently from 0 — an empty
   * week is not the same as a week you are failing, and conflating them makes
   * the dashboard lie during week 1.
   */
  fraction: number | null;
  /** Subtopics at red or yellow. */
  weak: number;
};

export const EMPTY_SUMMARY: Summary = {
  total: 0,
  byStatus: { red: 0, yellow: 0, green: 0, blue: 0 },
  fraction: null,
  weak: 0,
};

export function summarise(statuses: readonly Status[]): Summary {
  if (statuses.length === 0) return EMPTY_SUMMARY;

  const byStatus: Record<Status, number> = { red: 0, yellow: 0, green: 0, blue: 0 };
  let weightSum = 0;
  let weak = 0;

  for (const status of statuses) {
    byStatus[status] += 1;
    weightSum += STATUS_WEIGHT[status];
    if (isWeak(status)) weak += 1;
  }

  return {
    total: statuses.length,
    byStatus,
    fraction: weightSum / statuses.length,
    weak,
  };
}

/**
 * Combine child summaries, weighting by subtopic count so a topic with 10
 * subtopics counts for more than one with a single subtopic.
 */
export function combine(summaries: readonly Summary[]): Summary {
  const statuses: Status[] = [];
  for (const summary of summaries) {
    for (const status of STATUSES) {
      for (let i = 0; i < summary.byStatus[status]; i += 1) statuses.push(status);
    }
  }
  return summarise(statuses);
}

export function formatPercent(fraction: number | null): string {
  return fraction === null ? '—' : `${Math.round(fraction * 100)}%`;
}

/**
 * The colour a rolled-up bar takes. Thresholds sit at the midpoints between
 * adjacent status weights (0, 1/3, 2/3, 1).
 */
export function summaryStatus(fraction: number | null): Status | null {
  if (fraction === null) return null;
  if (fraction < 1 / 6) return 'red';
  if (fraction < 1 / 2) return 'yellow';
  if (fraction < 5 / 6) return 'green';
  return 'blue';
}
