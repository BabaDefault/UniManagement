import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ClassFormSheet } from '@/components/class-form-sheet';
import {
  Body,
  Button,
  Caption,
  Card,
  Divider,
  EmptyState,
  ErrorNote,
  Label,
  Loading,
  Row,
  Screen,
  Spacing,
  Title,
  useTheme,
} from '@/components/ui';
import { useNow } from '@/hooks/use-now';
import {
  useActiveTerm,
  useAddClassSeries,
  useClasses,
  useClassSeries,
  useDeleteClassSeries,
  useTree,
  useUpdateClassSeries,
} from '@/lib/queries';
import {
  classesBetween,
  formatDayLabel,
  formatTimeRange,
  groupByDay,
  toClassEvents,
} from '@/lib/schedule';
import type { ClassSeries } from '@/lib/store';
import { currentWeekNumber, isFlexWeek, weekEndDate, weekLabel, weekStartDate } from '@/lib/terms';

export default function TimetableScreen() {
  const now = useNow(300_000);
  const term = useActiveTerm();
  const classes = useClasses();
  const series = useClassSeries();
  const tree = useTree();

  const addSeries = useAddClassSeries(term.data);
  const updateSeries = useUpdateClassSeries(term.data);
  const deleteSeries = useDeleteClassSeries();

  const [offset, setOffset] = useState(0);
  const [editing, setEditing] = useState<ClassSeries | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const events = useMemo(() => toClassEvents(classes.data ?? []), [classes.data]);
  const seriesById = useMemo(
    () => new Map(series.data.map((entry) => [entry.seriesId, entry])),
    [series.data],
  );

  if (!term.data) return <Screen><EmptyState title="No term set up yet" detail="Create your term on the Today tab first." /></Screen>;
  if (classes.isLoading) return <Screen><Loading /></Screen>;

  const week = Math.min(Math.max(currentWeekNumber(now, term.data) + offset, 1), term.data.numWeeks);
  const from = weekStartDate(week, term.data);
  const to = weekEndDate(week, term.data);
  const days = groupByDay(classesBetween(events, from, to));

  const knownSubjects = (tree.data ?? []).map((subject) => subject.code);

  function openAdd() {
    setEditing(null);
    setSheetOpen(true);
  }

  function openEdit(seriesId: string) {
    const found = seriesById.get(seriesId);
    if (!found) return;
    setEditing(found);
    setSheetOpen(true);
  }

  return (
    <>
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

        <Button title="Add a class" onPress={openAdd} style={styles.add} />

        {events.length === 0 ? (
          <View style={styles.empty}>
            <EmptyState
              title="No classes yet"
              detail="Add the classes you actually go to — including a friend's tutorial if that's the one you attend. Each repeats every teaching week."
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
                    <ClassRow
                      subjectCode={event.subjectCode}
                      classType={event.classType}
                      location={event.location}
                      time={formatTimeRange(event)}
                      editable={event.seriesId !== null}
                      onPress={() => event.seriesId && openEdit(event.seriesId)}
                    />
                  </View>
                ))}
              </Card>
            ))}
          </View>
        )}

        <ErrorNote error={addSeries.error ?? updateSeries.error ?? deleteSeries.error} />

        {offset !== 0 && (
          <Pressable onPress={() => setOffset(0)} style={styles.reset}>
            <Caption colour="textSecondary">Back to this week</Caption>
          </Pressable>
        )}
      </Screen>

      <ClassFormSheet
        // Remount per open, so the form is seeded fresh from the class being edited.
        key={sheetOpen ? (editing?.seriesId ?? "new") : "closed"}
        visible={sheetOpen}
        initial={editing}
        knownSubjects={knownSubjects}
        busy={addSeries.isPending || updateSeries.isPending}
        error={addSeries.error ?? updateSeries.error}
        onCancel={() => setSheetOpen(false)}
        onSubmit={(input) => {
          const done = { onSuccess: () => setSheetOpen(false) };
          if (editing) updateSeries.mutate({ seriesId: editing.seriesId, input }, done);
          else addSeries.mutate(input, done);
        }}
        onDelete={
          editing
            ? () => {
                const target = editing;
                setSheetOpen(false);
                deleteSeries.mutate(target.seriesId);
              }
            : undefined
        }
      />
    </>
  );
}

function ClassRow({
  subjectCode,
  classType,
  location,
  time,
  editable,
  onPress,
}: {
  subjectCode: string;
  classType: string | null;
  location: string | null;
  time: string;
  editable: boolean;
  onPress: () => void;
}) {
  const colors = useTheme();

  return (
    <Pressable
      disabled={!editable}
      onPress={onPress}
      style={({ pressed }) => [styles.classRow, { opacity: pressed && editable ? 0.6 : 1 }]}>
      <View style={styles.classText}>
        <Body>
          {subjectCode}
          {classType ? ` · ${classType}` : ''}
        </Body>
        {location && (
          <Caption colour="textFaint" numberOfLines={1}>
            {location}
          </Caption>
        )}
      </View>
      <Caption colour="textSecondary">{time}</Caption>
      {editable ? (
        <Ionicons name="chevron-forward" size={14} color={colors.textFaint} />
      ) : (
        <View style={styles.iconSpacer} />
      )}
    </Pressable>
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
  add: { marginTop: Spacing.four },
  list: { marginTop: Spacing.five, gap: Spacing.three },
  empty: { marginTop: Spacing.five },
  classRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.three },
  classText: { flex: 1, gap: Spacing.half },
  iconSpacer: { width: 14 },
  step: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  reset: { alignSelf: 'center', marginTop: Spacing.five, padding: Spacing.two },
});
