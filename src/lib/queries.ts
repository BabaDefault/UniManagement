import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { useMemo } from 'react';

import type { MergePlan } from './bulk-paste';
import type { ParsedClass } from './ical';
import { loadDatabase, mutateDatabase, replaceDatabase } from './local-db';
import type { ClassRecord } from './records';
import type { Status } from './status';
import * as store from './store';
import type { Database } from './store';
import { DEFAULT_TERM, type Term } from './terms';
import { sortTree, type SubjectNode } from './tree';

/**
 * Hooks over the on-device database.
 *
 * There is one query — the whole database — and every view is derived from it.
 * That is what keeps Today, the week grid and the tracker from ever disagreeing,
 * and it makes a change a single pure function plus one cache write.
 *
 * The `termId` arguments are vestigial: with one local database there is only
 * ever one term. They are kept so the screens read the same either way.
 */

export const DB_KEY: QueryKey = ['database'];

function useDatabase() {
  return useQuery({
    queryKey: DB_KEY,
    queryFn: loadDatabase,
    // Local storage is the only writer, and every mutation updates the cache
    // directly, so there is nothing to go stale.
    staleTime: Infinity,
    gcTime: Infinity,
  });
}

/**
 * Apply a pure change, repaint immediately, then persist.
 *
 * The change is deliberately applied once and only once — several of these
 * mint new ids, so an optimistic pass followed by a real one would duplicate
 * every topic a paste creates.
 */
function useDatabaseMutation<Variables>(change: (db: Database, variables: Variables) => Database) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (variables: Variables) =>
      mutateDatabase(
        (db) => change(db, variables),
        (next) => client.setQueryData(DB_KEY, next),
      ),
    onSuccess: (next) => client.setQueryData(DB_KEY, next),
  });
}

/** The whole database, for backup and restore. */
export function useDatabaseSnapshot() {
  return useDatabase();
}

// ----------------------------------------------------------------------- term

export function useActiveTerm() {
  const query = useDatabase();
  return { ...query, data: query.data?.term ?? null };
}

export function useCreateTerm() {
  return useDatabaseMutation<Omit<Term, 'id'>>((db, term) => store.createTerm(db, term ?? DEFAULT_TERM));
}

export function useUpdateTerm() {
  return useDatabaseMutation<Term>((db, term) => store.updateTerm(db, term));
}

// ----------------------------------------------------------------------- tree

export function useTree(_termId?: string | undefined) {
  const query = useDatabase();

  // Memoised on the database object, which only changes when something is
  // actually written. Without this, every render would hand back a new array
  // and re-trigger anything keyed on it — including the widget sync effect.
  const data = useMemo<SubjectNode[] | undefined>(
    () => (query.data ? sortTree(query.data.subjects) : undefined),
    [query.data],
  );

  return { ...query, data };
}

export function useSetStatus(_termId?: string) {
  return useDatabaseMutation<{ subtopicId: string; status: Status }>((db, { subtopicId, status }) =>
    store.setStatus(db, subtopicId, status),
  );
}

// --------------------------------------------------------------------- topics

export function useApplyPaste(_termId?: string) {
  return useDatabaseMutation<{
    subjectId: string;
    weekNumber: number;
    plan: MergePlan;
    startPosition: number;
  }>((db, variables) => store.applyPaste(db, variables));
}

export function useDeleteTopic(_termId?: string) {
  return useDatabaseMutation<string>((db, topicId) => store.deleteTopic(db, topicId));
}

export function useDeleteSubtopic(_termId?: string) {
  return useDatabaseMutation<string>((db, subtopicId) => store.deleteSubtopic(db, subtopicId));
}

// ------------------------------------------------------------------- subjects

export function useAddSubject(_termId?: string) {
  return useDatabaseMutation<{ code: string; name?: string; position: number }>((db, variables) =>
    store.addSubject(db, variables),
  );
}

export function useDeleteSubject(_termId?: string) {
  return useDatabaseMutation<string>((db, subjectId) => store.deleteSubject(db, subjectId));
}

// -------------------------------------------------------------------- classes

export function useClasses(_termId?: string | undefined) {
  const query = useDatabase();
  const data: ClassRecord[] | undefined = query.data?.classes;
  return { ...query, data };
}

/**
 * Import a timetable, creating any subjects the feed mentions that do not exist
 * yet — otherwise the classes would show on Today with nothing to track against.
 */
export function useImportClasses(_termId?: string) {
  return useDatabaseMutation<readonly ParsedClass[]>((db, classes) => {
    const codes = [...new Set(classes.map((entry) => entry.subjectCode))];
    return store.replaceClasses(store.ensureSubjects(db, codes), classes);
  });
}

// --------------------------------------------------------------------- backup

export function useRestoreBackup() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (database: Database) => replaceDatabase(database),
    onSuccess: (next) => client.setQueryData(DB_KEY, next),
  });
}
