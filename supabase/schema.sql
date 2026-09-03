-- UNSW Semester Tracker schema.
--
-- Run this once in the Supabase SQL editor (Dashboard -> SQL Editor -> New query).
-- It is idempotent, so it is safe to re-run after edits.
--
-- Single user by design: every table carries user_id and RLS restricts rows to
-- the signed-in account. That costs almost nothing now and means the database
-- is not silently world-readable if the anon key ever leaks.

-- ---------------------------------------------------------------- status enum

do $$
begin
  if not exists (select 1 from pg_type where typname = 'subtopic_status') then
    create type subtopic_status as enum ('red', 'yellow', 'green', 'blue');
  end if;
end
$$;

-- --------------------------------------------------------------------- tables

create table if not exists terms (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  code          text not null,
  -- Monday of week 1.
  start_date    date not null,
  -- Calendar weeks in the teaching period, including the flexibility week.
  num_weeks     integer not null default 10 check (num_weeks between 1 and 30),
  -- Which week is Flexibility Week (UNSW T3 2026: week 6). Null for semesters.
  flex_week_number integer check (flex_week_number between 1 and 30),
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

create table if not exists subjects (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  term_id     uuid not null references terms (id) on delete cascade,
  code        text not null,
  name        text,
  colour      text,
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  unique (term_id, code)
);

create table if not exists topics (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  subject_id  uuid not null references subjects (id) on delete cascade,
  week_number integer not null check (week_number between 1 and 30),
  title       text not null,
  position    integer not null default 0,
  created_at  timestamptz not null default now()
);

create table if not exists subtopics (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  topic_id    uuid not null references topics (id) on delete cascade,
  title       text not null,
  status      subtopic_status not null default 'red',
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists classes (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  term_id      uuid not null references terms (id) on delete cascade,
  subject_code text not null,
  -- LEC / TUT / LAB / SEM / WEB, as UNSW abbreviates them.
  class_type   text,
  title        text,
  location     text,
  starts_at    timestamptz not null,
  ends_at      timestamptz not null,
  -- VEVENT UID from the myUNSW feed. Paired with starts_at so re-importing an
  -- updated timetable updates rows in place instead of duplicating them.
  source_uid   text,
  created_at   timestamptz not null default now()
);

create index if not exists topics_subject_week_idx on topics (subject_id, week_number);
create index if not exists subtopics_topic_idx on subtopics (topic_id);
create index if not exists classes_term_start_idx on classes (term_id, starts_at);
create unique index if not exists classes_source_idx on classes (term_id, source_uid, starts_at)
  where source_uid is not null;

-- ------------------------------------------------------------------ updated_at

create or replace function touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists subtopics_touch_updated_at on subtopics;
create trigger subtopics_touch_updated_at
  before update on subtopics
  for each row execute function touch_updated_at();

-- ------------------------------------------------------------------------ RLS

alter table terms     enable row level security;
alter table subjects  enable row level security;
alter table topics    enable row level security;
alter table subtopics enable row level security;
alter table classes   enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['terms', 'subjects', 'topics', 'subtopics', 'classes'] loop
    execute format('drop policy if exists %I on %I', t || '_owner', t);
    execute format(
      'create policy %I on %I for all using (user_id = auth.uid()) with check (user_id = auth.uid())',
      t || '_owner', t
    );
  end loop;
end
$$;
