import { Ionicons } from '@expo/vector-icons';
import { Link } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import {
  Body,
  Button,
  Caption,
  Card,
  Divider,
  EmptyState,
  ErrorNote,
  Heading,
  Label,
  Loading,
  ProgressBar,
  Row,
  Screen,
  Spacing,
  StatusDot,
  SummaryLine,
  Title,
  useTheme,
} from '@/components/ui';
import { useNow } from '@/hooks/use-now';
import { useWidgetSync } from '@/hooks/use-widget-sync';
import { formatPercent } from '@/lib/progress';
import { useActiveTerm, useClasses, useCreateTerm, useTree } from '@/lib/queries';
import {
  formatCountdown,
  formatDayLabel,
  formatTime,
  formatTimeRange,
  remainingToday,
  toClassEvents,
  upNext,
} from '@/lib/schedule';
import { STATUS_COLOR } from '@/lib/status';
import { currentWeekNumber, DEFAULT_TERM, isFlexWeek, termPositionForDate, weekLabel } from '@/lib/terms';
import { subjectSummary, weakItems } from '@/lib/tree';

export default function TodayScreen() {
  const now = useNow(60_000);
  const term = useActiveTerm();
  const tree = useTree(term.data?.id);
  const classes = useClasses(term.data?.id);
  const createTerm = useCreateTerm();

  const events = useMemo(() => toClassEvents(classes.data ?? []), [classes.data]);
  const subjects = tree.data ?? [];

  // Keeps the home screen widget in step with whatever the app just loaded.
  useWidgetSync(events);

  if (term.isLoading) return <Screen><Loading /></Screen>;

  if (!term.data) {
    return (
      <Screen>
        <Title>Set up your term</Title>
        <View style={styles.gap} />
        <EmptyState
          title="No term yet"
          detail="Creates UNSW T3 2026 — teaching 14 Sep to 20 Nov, with Flexibility Week as week 6. You can change the dates in Settings."
          action={
            <Button
              title="Create T3 2026"
              onPress={() => createTerm.mutate(DEFAULT_TERM)}
              loading={createTerm.isPending}
              style={styles.emptyAction}
            />
          }
        />
        <ErrorNote error={createTerm.error} />
      </Screen>
    );
  }

  const week = currentWeekNumber(now, term.data);
  const position = termPositionForDate(now, term.data);
  const focus = weakItems(subjects, week);

  const refreshing = tree.isFetching || classes.isFetching;
  const refresh = () => {
    tree.refetch();
    classes.refetch();
  };

  return (
    <Screen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
      <Label>{term.data.code}</Label>
      <Title>{weekLabel(week, term.data)}</Title>
      <Caption colour="textFaint">
        {position.kind === 'before'
          ? `Term starts in ${position.daysUntilStart} days`
          : position.kind === 'after'
            ? 'Teaching has finished — study period'
            : formatDayLabel(now, now)}
      </Caption>

      {isFlexWeek(week, term.data) && (
        <Card style={styles.flexNotice}>
          <Body colour="textSecondary">
            Flexibility Week — no classes. A good week to move red topics from earlier weeks up the scale.
          </Body>
        </Card>
      )}

      <UpNextCard events={events} now={now} hasClasses={events.length > 0} />

      <SectionHeader title="Subjects" />
      {tree.isLoading ? (
        <Loading />
      ) : subjects.length === 0 ? (
        <EmptyState title="No subjects yet" detail="Add your courses in Settings, then paste in each week's topics." />
      ) : (
        <View style={styles.list}>
          {subjects.map((subject) => {
            const overall = subjectSummary(subject);
            return (
              <Link key={subject.id} href={{ pathname: '/subject/[id]', params: { id: subject.id } }} asChild>
                <Pressable>
                  {({ pressed }) => (
                    <Card style={pressed ? styles.pressed : undefined}>
                      <Row style={styles.spaceBetween}>
                        <Heading>{subject.code}</Heading>
                        <Caption colour="textFaint">{formatPercent(overall.fraction)}</Caption>
                      </Row>
                      <ProgressBar summary={overall} />
                      <SummaryLine summary={overall} />
                    </Card>
                  )}
                </Pressable>
              </Link>
            );
          })}
        </View>
      )}

      {subjects.length > 0 && (
        <>
          <SectionHeader title={`Needs work — ${weekLabel(week, term.data).toLowerCase()}`} />
          {focus.length === 0 ? (
            <EmptyState
              title="Nothing marked weak this week"
              detail="Either you are on top of it, or this week's topics have not been entered yet."
            />
          ) : (
            <Card>
              {focus.slice(0, 8).map((item, index) => (
                <View key={item.subtopicId}>
                  {index > 0 && <Divider />}
                  <Link
                    href={{
                      pathname: '/subject/[id]/week/[week]',
                      params: { id: item.subjectId, week: item.weekNumber },
                    }}
                    asChild>
                    <Pressable style={styles.focusRow}>
                      <StatusDot status={item.status} />
                      <View style={styles.focusText}>
                        <Body numberOfLines={1}>{item.subtopicTitle}</Body>
                        <Caption colour="textFaint" numberOfLines={1}>
                          {item.subjectCode} · {item.topicTitle}
                        </Caption>
                      </View>
                    </Pressable>
                  </Link>
                </View>
              ))}
              {focus.length > 8 && (
                <Caption colour="textFaint">+{focus.length - 8} more</Caption>
              )}
            </Card>
          )}
        </>
      )}

      <ErrorNote error={tree.error ?? classes.error} />
    </Screen>
  );
}

function UpNextCard({
  events,
  now,
  hasClasses,
}: {
  events: ReturnType<typeof toClassEvents>;
  now: Date;
  hasClasses: boolean;
}) {
  const colors = useTheme();
  const next = upNext(events, now);
  const rest = remainingToday(events, now);

  if (!hasClasses) {
    return (
      <>
        <SectionHeader title="Up next" />
        <EmptyState
          title="No timetable imported"
          detail="Settings → Import timetable. Grab the personal iCal link from myUNSW → Class Timetable (top-left)."
        />
      </>
    );
  }

  return (
    <>
      <SectionHeader title="Up next" />
      <Card>
        {next.kind === 'none' ? (
          <Body colour="textSecondary">No classes left this term.</Body>
        ) : (
          <>
            <Row style={styles.spaceBetween}>
              <Heading>{next.event.subjectCode}</Heading>
              <View style={[styles.badge, { backgroundColor: colors.backgroundSelected }]}>
                <Caption colour="textSecondary">
                  {next.kind === 'now' ? 'On now' : formatCountdown(now, next.event.startsAt)}
                </Caption>
              </View>
            </Row>
            <Body colour="textSecondary">
              {[next.event.classType, formatTimeRange(next.event)].filter(Boolean).join(' · ')}
            </Body>
            {next.event.location && (
              <Row>
                <Ionicons name="location-outline" size={14} color={colors.textFaint} />
                <Caption colour="textFaint">{next.event.location}</Caption>
              </Row>
            )}
            {next.kind === 'next' && !isToday(next.event.startsAt, now) && (
              <Caption colour="textFaint">{formatDayLabel(next.event.startsAt, now)}</Caption>
            )}
          </>
        )}

        {rest.length > 1 && (
          <>
            <Divider />
            <Label>Also today</Label>
            {rest.slice(1).map((event) => (
              <Row key={event.id} style={styles.spaceBetween}>
                <Body colour="textSecondary">
                  {event.subjectCode}
                  {event.classType ? ` · ${event.classType}` : ''}
                </Body>
                <Caption colour="textFaint">{formatTime(event.startsAt)}</Caption>
              </Row>
            ))}
          </>
        )}
      </Card>
    </>
  );
}

function isToday(date: Date, now: Date): boolean {
  return date.toDateString() === now.toDateString();
}

function SectionHeader({ title }: { title: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Label>{title}</Label>
    </View>
  );
}

const styles = StyleSheet.create({
  gap: { height: Spacing.four },
  sectionHeader: { marginTop: Spacing.six, marginBottom: Spacing.three },
  list: { gap: Spacing.three },
  spaceBetween: { justifyContent: 'space-between' },
  pressed: { opacity: 0.7 },
  focusRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.three },
  focusText: { flex: 1, gap: Spacing.half },
  badge: { paddingHorizontal: Spacing.two, paddingVertical: Spacing.half, borderRadius: 999 },
  flexNotice: { marginTop: Spacing.four, borderColor: STATUS_COLOR.yellow },
  emptyAction: { alignSelf: 'stretch', marginTop: Spacing.three },
});
