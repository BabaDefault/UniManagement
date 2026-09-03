import type { Status } from './status';

/**
 * Hand-written to match `supabase/schema.sql`.
 *
 * Not generated: the schema is small and stable, and generating would add a CLI
 * + login step to every clone for five tables. If the schema grows, swap this
 * for `supabase gen types typescript`.
 */

type Row<Insert> = Insert & { id: string; user_id: string; created_at: string };

export type TermRow = Row<{
  code: string;
  start_date: string;
  num_weeks: number;
  flex_week_number: number | null;
  is_active: boolean;
}>;

export type SubjectRow = Row<{
  term_id: string;
  code: string;
  name: string | null;
  colour: string | null;
  position: number;
}>;

export type TopicRow = Row<{
  subject_id: string;
  week_number: number;
  title: string;
  position: number;
}>;

export type SubtopicRow = Row<{
  topic_id: string;
  title: string;
  status: Status;
  position: number;
}> & { updated_at: string };

export type ClassRow = Row<{
  term_id: string;
  subject_code: string;
  class_type: string | null;
  title: string | null;
  location: string | null;
  starts_at: string;
  ends_at: string;
  source_uid: string | null;
}>;

type Table<R> = {
  Row: R;
  Insert: Partial<R>;
  Update: Partial<R>;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      terms: Table<TermRow>;
      subjects: Table<SubjectRow>;
      topics: Table<TopicRow>;
      subtopics: Table<SubtopicRow>;
      classes: Table<ClassRow>;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: { subtopic_status: Status };
    CompositeTypes: Record<string, never>;
  };
};
