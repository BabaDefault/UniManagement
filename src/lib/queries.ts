import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import type { Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';

import type { MergePlan } from './bulk-paste';
import type { ClassRow, TermRow } from './db-types';
import type { ParsedClass } from './ical';
import type { Status } from './status';
import { supabase } from './supabase';
import { DEFAULT_TERM, type Term } from './terms';
import { sortTree, type SubjectNode } from './tree';

export const treeKey = (termId: string): QueryKey => ['tree', termId];
export const classesKey = (termId: string): QueryKey => ['classes', termId];
export const termKey: QueryKey = ['active-term'];

function unwrap<T>({ data, error }: { data: T | null; error: { message: string } | null }): T {
  if (error) throw new Error(error.message);
  return data as T;
}

// ------------------------------------------------------------------- session

export function useSession(): { session: Session | null; loading: boolean } {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setLoading(false);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  return { session, loading };
}

// ---------------------------------------------------------------------- term

function toTerm(row: TermRow): Term {
  return {
    id: row.id,
    code: row.code,
    startDate: row.start_date,
    numWeeks: row.num_weeks,
    flexWeekNumber: row.flex_week_number,
  };
}

export function useActiveTerm() {
  return useQuery({
    queryKey: termKey,
    queryFn: async (): Promise<Term | null> => {
      const rows = unwrap(
        await supabase
          .from('terms')
          .select('*')
          .eq('is_active', true)
          .order('created_at', { ascending: false })
          .limit(1),
      );
      return rows.length > 0 ? toTerm(rows[0]) : null;
    },
  });
}

/**
 * First-run setup. Deliberately an explicit action rather than something the
 * term query creates on a cache miss, so a slow network cannot produce two
 * terms from one launch.
 */
export function useCreateTerm() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: async (term: Omit<Term, 'id'> = DEFAULT_TERM): Promise<Term> => {
      const rows = unwrap(
        await supabase
          .from('terms')
          .insert({
            code: term.code,
            start_date: term.startDate,
            num_weeks: term.numWeeks,
            flex_week_number: term.flexWeekNumber,
            is_active: true,
          })
          .select(),
      );
      return toTerm(rows[0]);
    },
    onSuccess: (term) => client.setQueryData(termKey, term),
  });
}

export function useUpdateTerm() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: async (term: Term): Promise<Term> => {
      const rows = unwrap(
        await supabase
          .from('terms')
          .update({
            code: term.code,
            start_date: term.startDate,
            num_weeks: term.numWeeks,
            flex_week_number: term.flexWeekNumber,
          })
          .eq('id', term.id)
          .select(),
      );
      return toTerm(rows[0]);
    },
    onSuccess: (term) => client.setQueryData(termKey, term),
  });
}

// ---------------------------------------------------------------------- tree

const TREE_SELECT =
  'id, code, name, colour, position, topics(id, week_number, title, position, subtopics(id, title, status, position))';

/**
 * The entire term in one request.
 *
 * A term tops out around a few hundred rows, so fetching it whole and deriving
 * every screen from it keeps Today, the week grid and the tracker consistent,
 * and makes an optimistic status change a single cache edit.
 */
export function useTree(termId: string | undefined) {
  return useQuery({
    queryKey: treeKey(termId ?? 'none'),
    enabled: Boolean(termId),
    queryFn: async (): Promise<SubjectNode[]> => {
      const rows = unwrap(await supabase.from('subjects').select(TREE_SELECT).eq('term_id', termId!));
      return sortTree(rows as unknown as SubjectNode[]);
    },
  });
}

function mapSubtopics(
  subjects: SubjectNode[] | undefined,
  fn: (subtopic: SubjectNode['topics'][number]['subtopics'][number]) => SubjectNode['topics'][number]['subtopics'][number],
): SubjectNode[] | undefined {
  return subjects?.map((subject) => ({
    ...subject,
    topics: subject.topics.map((topic) => ({ ...topic, subtopics: topic.subtopics.map(fn) })),
  }));
}

/**
 * Status changes apply instantly and reconcile in the background — this is
 * tapped repeatedly during a lab, and a spinner per tap would make it unusable.
 */
export function useSetStatus(termId: string) {
  const client = useQueryClient();
  const key = treeKey(termId);

  return useMutation({
    mutationFn: async ({ subtopicId, status }: { subtopicId: string; status: Status }) => {
      unwrap(await supabase.from('subtopics').update({ status }).eq('id', subtopicId).select());
    },
    onMutate: async ({ subtopicId, status }) => {
      await client.cancelQueries({ queryKey: key });
      const previous = client.getQueryData<SubjectNode[]>(key);

      client.setQueryData<SubjectNode[]>(key, (old) =>
        mapSubtopics(old, (subtopic) => (subtopic.id === subtopicId ? { ...subtopic, status } : subtopic)),
      );

      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) client.setQueryData(key, context.previous);
    },
    onSettled: () => client.invalidateQueries({ queryKey: key }),
  });
}

// -------------------------------------------------------------------- topics

export function useApplyPaste(termId: string) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: async ({
      subjectId,
      weekNumber,
      plan,
      startPosition,
    }: {
      subjectId: string;
      weekNumber: number;
      plan: MergePlan;
      startPosition: number;
    }) => {
      if (plan.newTopics.length > 0) {
        const inserted = unwrap(
          await supabase
            .from('topics')
            .insert(
              plan.newTopics.map((topic, index) => ({
                subject_id: subjectId,
                week_number: weekNumber,
                title: topic.title,
                position: startPosition + index,
              })),
            )
            .select(),
        );

        // Match inserted rows back to their parsed topics by title; insert order
        // is not guaranteed to come back unchanged.
        const byTitle = new Map(inserted.map((row) => [row.title, row.id]));
        const subtopicRows = plan.newTopics.flatMap((topic) =>
          topic.subtopics.map((title, index) => ({
            topic_id: byTitle.get(topic.title)!,
            title,
            position: index,
          })),
        );

        if (subtopicRows.length > 0) unwrap(await supabase.from('subtopics').insert(subtopicRows).select());
      }

      for (const addition of plan.newSubtopics) {
        const existing = unwrap(
          await supabase.from('subtopics').select('position').eq('topic_id', addition.topicId),
        );
        const base = existing.reduce((max, row) => Math.max(max, row.position), -1) + 1;

        unwrap(
          await supabase
            .from('subtopics')
            .insert(addition.titles.map((title, index) => ({ topic_id: addition.topicId, title, position: base + index })))
            .select(),
        );
      }
    },
    onSuccess: () => client.invalidateQueries({ queryKey: treeKey(termId) }),
  });
}

export function useDeleteTopic(termId: string) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: async (topicId: string) => {
      unwrap(await supabase.from('topics').delete().eq('id', topicId).select());
    },
    onSuccess: () => client.invalidateQueries({ queryKey: treeKey(termId) }),
  });
}

export function useDeleteSubtopic(termId: string) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: async (subtopicId: string) => {
      unwrap(await supabase.from('subtopics').delete().eq('id', subtopicId).select());
    },
    onSuccess: () => client.invalidateQueries({ queryKey: treeKey(termId) }),
  });
}

// ------------------------------------------------------------------ subjects

export function useAddSubject(termId: string) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: async ({ code, name, position }: { code: string; name?: string; position: number }) => {
      unwrap(
        await supabase
          .from('subjects')
          .insert({ term_id: termId, code: code.trim().toUpperCase(), name: name?.trim() || null, position })
          .select(),
      );
    },
    onSuccess: () => client.invalidateQueries({ queryKey: treeKey(termId) }),
  });
}

export function useDeleteSubject(termId: string) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: async (subjectId: string) => {
      unwrap(await supabase.from('subjects').delete().eq('id', subjectId).select());
    },
    onSuccess: () => client.invalidateQueries({ queryKey: treeKey(termId) }),
  });
}

// ------------------------------------------------------------------- classes

export function useClasses(termId: string | undefined) {
  return useQuery({
    queryKey: classesKey(termId ?? 'none'),
    enabled: Boolean(termId),
    queryFn: async (): Promise<ClassRow[]> =>
      unwrap(
        await supabase.from('classes').select('*').eq('term_id', termId!).order('starts_at', { ascending: true }),
      ),
  });
}

/**
 * Timetable import replaces the term's classes outright.
 *
 * Classes hold no user-entered state — every judgement lives on subtopics — so
 * replacing is both safe and trivially correct, and it handles dropped classes
 * that an upsert would leave orphaned.
 */
export function useImportClasses(termId: string) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: async (classes: readonly ParsedClass[]) => {
      unwrap(await supabase.from('classes').delete().eq('term_id', termId).select('id'));

      if (classes.length === 0) return;

      const rows = classes.map((entry) => ({
        term_id: termId,
        subject_code: entry.subjectCode,
        class_type: entry.classType,
        title: entry.title,
        location: entry.location,
        starts_at: entry.startsAt.toISOString(),
        ends_at: entry.endsAt.toISOString(),
        source_uid: entry.sourceUid,
      }));

      // Chunked so a full-term import stays under the request size limit.
      for (let i = 0; i < rows.length; i += 200) {
        unwrap(await supabase.from('classes').insert(rows.slice(i, i + 200)).select('id'));
      }
    },
    onSuccess: () => {
      client.invalidateQueries({ queryKey: classesKey(termId) });
      client.invalidateQueries({ queryKey: treeKey(termId) });
    },
  });
}
