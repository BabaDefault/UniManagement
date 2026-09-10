# Semester Tracker

A personal UNSW semester dashboard. It answers one question:

> **Where am I in every subject, and what needs work this week?**

Not a study app, not a tutor, not a productivity system. It tracks, per subject
and per week, which subtopics you can actually *do* — and shows your class
timetable, including on an Android home screen widget.

The point is to make the gap between "I understand this" and "I can produce this"
visible in week 3, rather than discovering it in week 12.

**Everything is stored on the device.** No account, no server, no network. Open
the app and it works, offline, forever.

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

## Running it

```bash
npm install
npm run web        # laptop
npm start          # then scan the QR with Expo Go
npm test           # the domain logic test suite
```

No `.env`, no database to provision. Clone and run.

### Expo Go needs your laptop; a real build does not

`npm start` runs a **development server on your laptop**, and Expo Go downloads
the app's code from it over your network. Close the laptop, leave the house, or
drop off the wifi and the app stops loading. Expo Go is for development.

For an app that works 24/7, build a standalone APK. The code is bundled inside
it, so it needs nothing running anywhere:

```bash
npm install -g eas-cli
eas login
eas build --platform android --profile preview
```

The binary is `eas` but the package is `eas-cli`. Do not run `npx eas` — an
unrelated `eas` package exists on npm that ships no executable, so npm fails with
`could not determine executable to run`. Without installing globally, the working
form is `npx eas-cli@latest login`.

Download the APK from the build page and install it. Then long-press the home
screen → Widgets → Semester Tracker → **Timetable**.

No Google Play account and no yearly developer fee are needed to sideload.

**The widget only exists in a real build.** Expo Go does not ship the native
widget module, so the app detects that and carries on without it.

## Where the data lives

On the device, in two `AsyncStorage` keys — the topic tree and the timetable
separately, so tapping a status during a lab doesn't rewrite several hundred
imported classes.

This means:

- **Your phone and your laptop keep completely separate databases.** Nothing
  syncs. What you tap in a Tuesday lab is not on the laptop on Wednesday.
- **Clearing app data, or browser site data, erases it.**

So **Settings → Backup** is the whole safety net. Export writes a JSON file you
can save anywhere; restore replaces everything on that device from it. That file
is also the only bridge between your phone and laptop — export on one, restore on
the other.

The backup format is documented as a stable shape in `src/lib/records.ts`. It is
plain JSON and hand-editable.

## Setting up a term

1. **Today → Create T3 2026.** Prefilled from the UNSW academic calendar: teaching
   14 Sep – 20 Nov, Flexibility Week as week 6. Editable in Settings.
2. **Settings → Subjects.** Add your course codes. (A timetable import also creates
   any it finds automatically.)
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

## Importing your timetable

myUNSW → **Class Timetable** → **"personal iCal link"** (top-left corner).

- **On Android:** paste the link into Settings → Timetable → *Load from link*.
- **On the laptop:** download the `.ics` and use *Choose .ics file*. A browser cannot
  fetch the myUNSW link directly — it is served without CORS headers — so the URL
  option is hidden on web rather than left to fail.

Importing replaces that term's classes. That is safe: classes hold no judgements
of yours, all of that lives on subtopics.

You can also subscribe Google Calendar to the same link, which gets you a stock
calendar widget alongside this app's.

## How it is put together

```
src/lib/          Pure domain logic — all of the test suite lives here
  store.ts        The database as one plain object, and pure changes to it
  local-db.ts     Persistence: AsyncStorage, serialised writes, in-memory copy
  records.ts      The stored/backup shapes (stable — backups depend on them)
  terms.ts        Term weeks, including the Flexibility Week
  progress.ts     Status → percentage rollups
  tree.ts         Deriving every view from one tree
  bulk-paste.ts   Paste parsing and non-destructive merging
  ical.ts         myUNSW feed parsing (RRULE, EXDATE, timezones)
  schedule.ts     Next class, today's classes, formatting
  backup.ts       Export and restore a JSON file
  queries.ts      TanStack Query hooks over the local database
src/app/          Screens (expo-router)
src/widgets/      The Android home screen widget
```

Three decisions worth knowing before changing anything:

**The database is one object, and one query.** A term is a few hundred rows, so
`useDatabase` holds all of it and every screen derives from it. Today, the week
grid and the tracker can therefore never disagree, and a change is one pure
function plus one cache write.

**A change is applied exactly once.** `mutateDatabase` updates its in-memory copy
synchronously and repaints before writing to storage, so tapping feels instant
without an optimistic pass that would double-apply — several of these mint new
ids, and pasting twice would duplicate every topic.

**The widget never touches the database.** The app writes a snapshot of upcoming
classes to a separate key; the widget reads it in a headless task and recomputes
"what's next" itself. So it works with the app force-stopped. Android floors
widget refresh at 30 minutes, so the countdown is deliberately coarse.

*(`expo-sqlite` was the obvious alternative to AsyncStorage and was rejected: web
support is alpha and needs cross-origin isolation headers, which would make the
laptop build fragile and constrain where it can be hosted.)*

## Gotchas encoded in tests

- **Week numbering does not skip.** Week 6 exists; it is just Flexibility Week with
  no teaching. Renumbering 7–10 as 6–9 would misplace every topic after mid-term.
- **Sydney switches to AEDT on the first Sunday of October**, mid-term. Subtracting
  two `Date`s across that boundary loses an hour and floors a 42-day gap to 41,
  reporting week 6 instead of week 7. All term maths uses calendar-day arithmetic;
  `vitest.config.mts` pins `TZ=Australia/Sydney` so the case is actually exercised.
- **A restore drops malformed rows rather than failing**, but refuses a file that
  is not a backup at all — so importing the wrong file tells you, instead of
  quietly wiping the term.
- **`src/lib/__fixtures__/synthetic-timetable.ics` is a stand-in**, not a real
  myUNSW export. Replace it with a real exported feed and keep the assertions —
  the parser is the component most likely to break silently.
