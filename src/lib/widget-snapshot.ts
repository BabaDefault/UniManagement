import AsyncStorage from '@react-native-async-storage/async-storage';

import type { ClassEvent } from './schedule';

/**
 * The widget's data source.
 *
 * The widget runs as a headless task with no session and no network guarantee,
 * so it never reads the database directly. The app writes a small snapshot of upcoming
 * classes to shared storage, and the widget recomputes "what's next" from that
 * at each refresh. Result: the widget is correct on campus wifi, in a tunnel,
 * or with the app force-stopped.
 */

const KEY = 'widget:timetable:v1';

/** Enough to cover a fortnight of classes without bloating the stored payload. */
const MAX_ENTRIES = 80;

export type SnapshotClass = {
  subjectCode: string;
  classType: string | null;
  location: string | null;
  startsAt: string;
  endsAt: string;
};

export type WidgetSnapshot = {
  updatedAt: string;
  classes: SnapshotClass[];
};

/** Pure: what the snapshot should contain given the classes and the time. */
export function buildSnapshot(events: readonly ClassEvent[], now: Date): WidgetSnapshot {
  // Keep classes that have not finished yet; a past timetable is dead weight.
  const upcoming = events
    .filter((event) => event.endsAt >= now)
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
    .slice(0, MAX_ENTRIES)
    .map(
      (event): SnapshotClass => ({
        subjectCode: event.subjectCode,
        classType: event.classType,
        location: event.location,
        startsAt: event.startsAt.toISOString(),
        endsAt: event.endsAt.toISOString(),
      }),
    );

  return { updatedAt: now.toISOString(), classes: upcoming };
}

export async function saveWidgetSnapshot(events: readonly ClassEvent[], now = new Date()): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(buildSnapshot(events, now)));
}

export async function loadWidgetSnapshot(): Promise<WidgetSnapshot | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as WidgetSnapshot;
    return Array.isArray(parsed.classes) ? parsed : null;
  } catch {
    // A corrupt snapshot must not crash the headless task — render the empty
    // state instead and let the next app launch rewrite it.
    return null;
  }
}

export function snapshotToEvents(snapshot: WidgetSnapshot | null): ClassEvent[] {
  if (!snapshot) return [];

  return snapshot.classes.map((entry, index) => ({
    id: `${entry.subjectCode}-${index}`,
    subjectCode: entry.subjectCode,
    classType: entry.classType,
    title: entry.subjectCode,
    location: entry.location,
    startsAt: new Date(entry.startsAt),
    endsAt: new Date(entry.endsAt),
    // The widget only displays classes; where they came from is the app's concern.
    seriesId: null,
  }));
}
