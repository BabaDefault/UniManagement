import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import {
  Body,
  Caption,
  Card,
  Divider,
  EmptyState,
  Label,
  Loading,
  Row,
  Screen,
  Spacing,
  Title,
  useTheme,
} from '@/components/ui';
import { useNow } from '@/hooks/use-now';
import { useActiveTerm, useClasses } from '@/lib/queries';
import {
  classesBetween,
  formatDayLabel,
  formatTimeRange,
  groupByDay,
  toClassEvents,
} from '@/lib/schedule';
import { currentWeekNumber, isFlexWeek, weekEndDate, weekLabel, weekStartDate } from '@/lib/terms';

export default function TimetableScreen() {
  const now = useNow(300_000);
  const term = useActiveTerm();
  const classes = useClasses(term.data?.id);

  const [offset, setOffset] = useState(0);
  const events = useMemo(() => toClassEvents(classes.data ?? []), [classes.data]);

  if (!term.data) return <Screen><EmptyState title="No term set up yet" /></Screen>;
  if (classes.isLoading) return <Screen><Loading /></Screen>;

  const week = Math.min(Math.max(currentWeekNumber(now, term.data) + offset, 1), term.data.numWeeks);
  const from = weekStartDate(week, term.data);
  const to = weekEndDate(week, term.data);
  const days = groupByDay(classesBetween(events, from, to));

  return (
    <Screen>
      <Label>{term.data.code}</Label>
      <Row style={styles.header}>
        <Title>{weekLabel(week, term.data)}</Title>
        <Row>
          <StepButton icon="chevron-back" disabled={week <= 1} onPress={() => setOffset(offset - 1)} />
          <StepButton
            icon="chevron-forward"
            disabled={week >= term.data.numWeeks}
            onPress={() => setOffset(offset + 1)}
          />
        </Row>
      </Row>
      <Caption colour="textFaint">
        {from.getDate()} {from.toLocaleDateString(undefined, { month: 'short' })} –{' '}
        {to.getDate()} {to.toLocaleDateString(undefined, { month: 'short' })}
      </Caption>

      {events.length === 0 ? (
        <View style={styles.empty}>
          <EmptyState
            title="No timetable imported"
            detail="Settings → Import timetable. The personal iCal link is in myUNSW → Class Timetable, top-left."
          />
        </View>
      ) : days.length === 0 ? (
        <View style={styles.empty}>
          <EmptyState
            title={isFlexWeek(week, term.data) ? 'Flexibility Week — no classes' : 'No classes this week'}
          />
        </View>
      ) : (
        <View style={styles.list}>
          {days.map((group) => (
            <Card key={group.day.toISOString()}>
              <Label>{formatDayLabel(group.day, now)}</Label>
              {group.events.map((event, index) => (
                <View key={event.id}>
                  {index > 0 && <Divider />}
                  <View style={styles.classRow}>
                    <View style={styles.classText}>
                      <Body>
                        {event.subjectCode}
                        {event.classType ? ` · ${event.classType}` : ''}
                      </Body>
                      {event.location && (
                        <Caption colour="textFaint" numberOfLines={1}>
                          {event.location}
                        </Caption>
                      )}
                    </View>
                    <Caption colour="textSecondary">{formatTimeRange(event)}</Caption>
                  </View>
                </View>
              ))}
            </Card>
          ))}
        </View>
      )}

      {offset !== 0 && (
        <Pressable onPress={() => setOffset(0)} style={styles.reset}>
          <Caption colour="textSecondary">Back to this week</Caption>
        </Pressable>
      )}
    </Screen>
  );
}

function StepButton({
  icon,
  onPress,
  disabled,
}: {
  icon: 'chevron-back' | 'chevron-forward';
  onPress: () => void;
  disabled?: boolean;
}) {
  const colors = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      style={({ pressed }) => [
        styles.step,
        { backgroundColor: colors.backgroundSelected, opacity: disabled ? 0.3 : pressed ? 0.6 : 1 },
      ]}>
      <Ionicons name={icon} size={18} color={colors.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { justifyContent: 'space-between' },
  list: { marginTop: Spacing.five, gap: Spacing.three },
  empty: { marginTop: Spacing.five },
  classRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.two },
  classText: { flex: 1, gap: Spacing.half },
  step: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  reset: { alignSelf: 'center', marginTop: Spacing.five, padding: Spacing.two },
});
