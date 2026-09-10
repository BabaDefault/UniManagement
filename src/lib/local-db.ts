import AsyncStorage from '@react-native-async-storage/async-storage';

import { DATABASE_VERSION, EMPTY_DATABASE, parseDatabase, type Database } from './store';

/**
 * On-device persistence. There is no server and no account — this file is the
 * whole backend.
 *
 * Stored in two keys rather than one so that tapping a subtopic during a lab
 * rewrites only the topic tree, not the several hundred imported classes
 * sitting beside it.
 *
 * AsyncStorage rather than SQLite deliberately: the database is a few hundred
 * rows that every screen already loads whole, and `expo-sqlite` on web is still
 * alpha and needs cross-origin isolation headers, which would make the laptop
 * build fragile and constrain where it can be hosted.
 */

const KEY_CORE = 'semester-tracker:core:v1';
const KEY_CLASSES = 'semester-tracker:classes:v1';

/**
 * The authoritative in-memory copy.
 *
 * Mutations read from this synchronously, so two taps in the same tick cannot
 * both start from the same stale snapshot and lose one of the edits.
 */
let cache: Database | null = null;
let lastPersisted: Database | null = null;

/** Writes are chained so they land in the order they were made. */
let writeChain: Promise<unknown> = Promise.resolve();

export async function loadDatabase(): Promise<Database> {
  if (cache) return cache;

  const [core, classes] = await Promise.all([
    AsyncStorage.getItem(KEY_CORE),
    AsyncStorage.getItem(KEY_CLASSES),
  ]);

  let loaded = EMPTY_DATABASE;

  try {
    const parsedCore = core ? (JSON.parse(core) as Record<string, unknown>) : {};
    const parsedClasses = classes ? (JSON.parse(classes) as unknown) : [];
    loaded = parseDatabase({ ...parsedCore, classes: parsedClasses });
  } catch {
    // Corrupt or half-written storage must not brick the app. Start empty; the
    // next write replaces the bad value.
    loaded = EMPTY_DATABASE;
  }

  cache = loaded;
  lastPersisted = loaded;
  return loaded;
}

async function persist(next: Database): Promise<void> {
  const previous = lastPersisted;
  const writes: Promise<void>[] = [];

  if (!previous || previous.term !== next.term || previous.subjects !== next.subjects) {
    writes.push(
      AsyncStorage.setItem(
        KEY_CORE,
        JSON.stringify({ version: DATABASE_VERSION, term: next.term, subjects: next.subjects }),
      ),
    );
  }

  if (!previous || previous.classes !== next.classes) {
    writes.push(AsyncStorage.setItem(KEY_CLASSES, JSON.stringify(next.classes)));
  }

  await Promise.all(writes);
  lastPersisted = next;
}

/**
 * Apply a pure change to the database and save it.
 *
 * The in-memory copy updates before the await, so a rapid sequence of taps each
 * builds on the previous one rather than on whatever was last read from disk.
 */
export async function mutateDatabase(
  change: (db: Database) => Database,
  /**
   * Called synchronously once the new database exists, before it is written.
   * Lets the UI repaint on the same frame as the tap instead of waiting on
   * storage — the change is already authoritative in memory by then.
   */
  onApplied?: (next: Database) => void,
): Promise<Database> {
  const base = cache ?? (await loadDatabase());
  const next = change(base);
  cache = next;
  onApplied?.(next);

  writeChain = writeChain.then(() => persist(next));
  await writeChain;

  return next;
}

/** Replace everything, for restoring a backup. */
export async function replaceDatabase(next: Database): Promise<Database> {
  return mutateDatabase(() => next);
}

/** Testing and sign-out-equivalent: forget the in-memory copy. */
export function resetCache(): void {
  cache = null;
  lastPersisted = null;
}
