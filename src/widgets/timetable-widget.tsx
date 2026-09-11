// The React Compiler is on for this app (app.json experiments.reactCompiler), and
// it rewrites components to use memoization hooks. These are not React components
// in the normal sense: react-native-android-widget calls them as plain functions to
// build a RemoteViews tree, so any hook it injects throws
// "Invalid Hook Call detected" and the widget draws nothing at all.
'use no memo';

import { FlexWidget, TextWidget, type ColorProp, type HexColor } from 'react-native-android-widget';

import {
  classesAfterOnSameDay,
  formatCountdown,
  formatDayLabel,
  formatDayWord,
  formatTime,
  upNext,
  type ClassEvent,
} from '@/lib/schedule';

/**
 * The Android home screen widget: what class is next, then what else is on that day.
 *
 * Timetable only — progress lives in the app, where it is edited. Everything is
 * computed from the local snapshot, so this renders with no network and no
 * signed-in session.
 *
 * Note the widget refreshes at most every 30 minutes (Android's floor on
 * updatePeriodMillis), so the countdown is deliberately coarse.
 */

/** The widget renderer takes literal hex colours, not the app's theme objects. */
type Palette = {
  background: HexColor;
  text: HexColor;
  muted: HexColor;
  faint: HexColor;
  accent: HexColor;
  /** The divider. Deliberately weaker than `faint` — a rule should separate, not announce. */
  rule: ColorProp;
};

const LIGHT: Palette = {
  background: '#FFFFFF',
  text: '#11181C',
  muted: '#60646C',
  faint: '#8B8D98',
  accent: '#0B69C7',
  rule: 'rgba(139, 141, 152, 0.3)',
};

const DARK: Palette = {
  background: '#17191C',
  text: '#ECEDEE',
  muted: '#B0B4BA',
  faint: '#7E8289',
  accent: '#5AA9F5',
  rule: 'rgba(126, 130, 137, 0.35)',
};

export function TimetableWidget({
  events,
  now,
  palette,
}: {
  events: ClassEvent[];
  now: Date;
  palette: Palette;
}) {
  // Belt and braces alongside the file-level directive: this one is honoured
  // per-function regardless of how the file-level prologue is treated.
  'use no memo';

  const next = upNext(events, now);
  // Anchored to the featured class's own day, not to today: the widget regularly
  // leads with a class that is several days out, and "what else is on" has to
  // mean that day or the lower half is permanently empty.
  const later = next.kind === 'none' ? [] : classesAfterOnSameDay(events, next.event).slice(0, 2);

  return (
    <FlexWidget
      clickAction="OPEN_APP"
      style={{
        height: 'match_parent',
        width: 'match_parent',
        flexDirection: 'column',
        backgroundColor: palette.background,
        borderRadius: 16,
        padding: 12,
      }}>
      {next.kind === 'none' ? (
        <FlexWidget style={{ flexDirection: 'column' }}>
          <TextWidget text="No classes scheduled" style={{ fontSize: 16, color: palette.muted }} />
          <TextWidget
            text="Import your timetable in the app"
            style={{ fontSize: 13, color: palette.faint, marginTop: 2 }}
          />
        </FlexWidget>
      ) : (
        // match_parent height is what gives the flexible spacer below something to
        // expand into; on a wrap_content column the weight collapses to nothing.
        <FlexWidget style={{ flexDirection: 'column', width: 'match_parent', height: 'match_parent' }}>
          <FlexWidget
            style={{ flexDirection: 'row', width: 'match_parent', justifyContent: 'space-between' }}>
            <TextWidget
              text={next.event.subjectCode}
              style={{ fontSize: 18, fontWeight: '700', color: palette.text }}
            />
            <TextWidget
              text={next.kind === 'now' ? 'NOW' : formatCountdown(now, next.event.startsAt).toUpperCase()}
              style={{ fontSize: 11, fontWeight: '700', color: palette.accent }}
            />
          </FlexWidget>

          <TextWidget
            text={[next.event.classType, formatTime(next.event.startsAt)].filter(Boolean).join(' · ')}
            style={{ fontSize: 14, color: palette.muted, marginTop: 3 }}
          />

          {next.event.location ? (
            <TextWidget
              text={next.event.location}
              maxLines={1}
              style={{ fontSize: 12, color: palette.faint, marginTop: 1 }}
            />
          ) : (
            <FlexWidget style={{ height: 0 }} />
          )}

          {next.kind === 'next' && !isSameDay(next.event.startsAt, now) ? (
            <TextWidget
              text={formatDayLabel(next.event.startsAt, now)}
              style={{ fontSize: 12, color: palette.faint, marginTop: 1 }}
            />
          ) : (
            <FlexWidget style={{ height: 0 }} />
          )}

          {/* Keeps the list below pinned to the bottom edge however tall the user makes it. */}
          <FlexWidget style={{ flex: 1 }} />

          <FlexWidget
            style={{
              height: 1,
              width: 'match_parent',
              backgroundColor: palette.rule,
              marginTop: 8,
              marginBottom: 6,
            }}
          />

          {later.length > 0 ? (
            <FlexWidget style={{ flexDirection: 'column', width: 'match_parent' }}>
              {later.map((event) => (
                <FlexWidget
                  key={event.id}
                  style={{
                    flexDirection: 'row',
                    width: 'match_parent',
                    justifyContent: 'space-between',
                    marginTop: 4,
                  }}>
                  <TextWidget
                    text={`${event.subjectCode}${event.classType ? ` · ${event.classType}` : ''}`}
                    maxLines={1}
                    style={{ fontSize: 13, color: palette.muted }}
                  />
                  <TextWidget text={formatTime(event.startsAt)} style={{ fontSize: 13, color: palette.faint }} />
                </FlexWidget>
              ))}
            </FlexWidget>
          ) : (
            <TextWidget
              text={`Nothing else ${formatDayWord(next.event.startsAt, now)}`}
              maxLines={1}
              style={{ fontSize: 13, color: palette.faint, marginTop: 4 }}
            />
          )}
        </FlexWidget>
      )}
    </FlexWidget>
  );
}

function isSameDay(a: Date, b: Date): boolean {
  return a.toDateString() === b.toDateString();
}

/** Both themes are rendered up front; Android picks per the system setting. */
export function renderTimetableWidget(events: ClassEvent[], now: Date) {
  return {
    light: <TimetableWidget events={events} now={now} palette={LIGHT} />,
    dark: <TimetableWidget events={events} now={now} palette={DARK} />,
  };
}

function MessageWidget({ message, palette }: { message: string; palette: Palette }) {
  'use no memo';

  return (
    <FlexWidget
      clickAction="OPEN_APP"
      style={{
        height: 'match_parent',
        width: 'match_parent',
        flexDirection: 'column',
        justifyContent: 'center',
        backgroundColor: palette.background,
        borderRadius: 16,
        padding: 14,
      }}>
      <TextWidget text="Semester Tracker" style={{ fontSize: 13, fontWeight: '700', color: palette.text }} />
      <TextWidget text={message} style={{ fontSize: 11, color: palette.faint, marginTop: 2 }} />
    </FlexWidget>
  );
}

/**
 * Anything rather than nothing.
 *
 * A widget that draws no tree at all is indistinguishable from one whose task
 * never ran — both are an empty frame on the home screen. Drawing a message
 * proves the handler executed and says what to do next.
 */
export function renderMessageWidget(message: string) {
  return {
    light: <MessageWidget message={message} palette={LIGHT} />,
    dark: <MessageWidget message={message} palette={DARK} />,
  };
}
