# Semester Tracker

A personal UNSW semester dashboard. It answers one question:

> **Where am I in every subject, and what needs work this week?**

Not a study app, not a tutor, not a productivity system. It tracks, per subject
and per week, which subtopics you can actually *do* — and shows your class
timetable, including on an Android home screen widget.

The point is to make the gap between "I understand this" and "I can produce this"
visible in week 3, rather than discovering it in week 12.

## The status scale

Every subtopic carries one of four levels, which **you** set — the app never
guesses at your understanding:

| | Meaning |
|---|---|
| 🔴 | Don't understand |
| 🟡 | Understand, but can't reliably apply |
| 🟢 | Can do independently |
| 🔵 | Can do under exam conditions |

Progress rolls up subtopic → topic → week → subject. A week with no topics shows
as `—`, never as 0%: not set up is not the same as failing.

## Setup

### 1. Supabase

1. Create a free project at [supabase.com](https://supabase.com).
2. Open **SQL Editor → New query**, paste all of [`supabase/schema.sql`](supabase/schema.sql), and run it.
   It is idempotent, so re-running after edits is safe.
3. Copy `.env.example` to `.env` and fill in:

   ```
   EXPO_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJ...
   ```

   Project Settings → Data API for the URL, → API Keys for the anon key. The anon
   key is public by design; row level security is what keeps the data private, so
   never put the `service_role` key here.

4. Start the app and create your account on first launch (email + password).

### 2. Run it

```bash
npm run web        # laptop
npm start          # then scan the QR with Expo Go for the UI
npm test           # the domain logic test suite
```

**Expo Go cannot run the widget** — it needs a native build. Everything else works in it.

### 3. Import your timetable

myUNSW → **Class Timetable** → **"personal iCal link"** (top-left corner).

- **On Android:** paste the link into Settings → Timetable → *Load from link*.
- **On the laptop:** download the `.ics` and use *Choose .ics file*. A browser cannot
  fetch the myUNSW link directly — it is served without CORS headers — so the URL
  option is hidden on web rather than left to fail.

Importing replaces this term's classes. That is safe: classes hold no judgements
of yours, all of that lives on subtopics.

You can also subscribe Google Calendar to the same link, which gets you a stock
calendar widget alongside this app's.

### 4. Build the Android APK

```bash
npx eas login
npx eas build --platform android --profile preview
```

Download the APK from the build page and install it. Then long-press the home
screen → Widgets → Semester Tracker → **Timetable**.

No Google Play account and no Apple-style yearly fee are needed to sideload.

## Setting up a term

1. **Today → Create T3 2026.** Prefilled from the UNSW academic calendar: teaching
   14 Sep – 20 Nov, Flexibility Week as week 6. Editable in Settings.
2. **Settings → Subjects.** Add your course codes.
3. **Subject → a week → Paste topics.** Paste from the course outline: unindented
   lines are topics, indented lines are subtopics.

   ```
   Functional Dependencies
     Definition of FD
     Armstrong's axioms
   Attribute Closure
     Computing X+
   ```

   Re-pasting a corrected outline **never wipes statuses you have already set** —
   it only adds what is missing.

Then during the week: tap a subtopic to move it up the scale. Long-press to pick
a level directly or delete it.

## How it is put together

```
src/lib/          Pure domain logic — all of the test suite lives here
  terms.ts        Term weeks, including the Flexibility Week
  progress.ts     Status → percentage rollups
  tree.ts         Deriving every view from one fetched tree
  bulk-paste.ts   Paste parsing and non-destructive merging
  ical.ts         myUNSW feed parsing (RRULE, EXDATE, timezones)
  schedule.ts     Next class, today's classes, formatting
  queries.ts      TanStack Query hooks over Supabase
src/app/          Screens (expo-router)
src/widgets/      The Android home screen widget
supabase/         schema.sql
```

Two decisions worth knowing before changing anything:

**The whole term is fetched as one tree.** A term is a few hundred rows, so
`useTree` pulls it in a single query and every screen derives from it. Today, the
week grid and the tracker can therefore never disagree, and a status change is one
optimistic cache edit.

**The widget never touches the network.** The app writes a snapshot of upcoming
classes to local storage; the widget reads it in a headless task and recomputes
"what's next" itself. So it is correct on campus wifi, offline, and with the app
force-stopped. Android floors widget refresh at 30 minutes, so the countdown is
deliberately coarse.

## Gotchas encoded in tests

- **Week numbering does not skip.** Week 6 exists; it is just Flexibility Week with
  no teaching. Renumbering 7–10 as 6–9 would misplace every topic after mid-term.
- **Sydney switches to AEDT on the first Sunday of October**, mid-term. Subtracting
  two `Date`s across that boundary loses an hour and floors a 42-day gap to 41,
  reporting week 6 instead of week 7. All term maths uses calendar-day arithmetic;
  `vitest.config.mts` pins `TZ=Australia/Sydney` so the case is actually exercised.
- **`src/lib/__fixtures__/synthetic-timetable.ics` is a stand-in**, not a real
  myUNSW export. Replace it with a real exported feed and keep the assertions —
  the parser is the component most likely to break silently.
