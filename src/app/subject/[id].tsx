import { Link, Stack, useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import {
  Body,
  Caption,
  Card,
  EmptyState,
  Heading,
  Label,
  Loading,
  ProgressBar,
  Row,
  Screen,
  Spacing,
  SummaryLine,
  Title,
  useTheme,
} from '@/components/ui';
import { Radius } from '@/constants/theme';
import { useNow } from '@/hooks/use-now';
import { formatPercent, summaryStatus } from '@/lib/progress';
import { useActiveTerm, useTree } from '@/lib/queries';
import { STATUS_COLOR } from '@/lib/status';
import { currentWeekNumber, isFlexWeek, shortWeekLabel, weekNumbers } from '@/lib/terms';
import { findSubject, subjectSummary, weekSummary } from '@/lib/tree';

export default function SubjectScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const now = useNow(300_000);
  const term = useActiveTerm();
  const tree = useTree(term.data?.id);

  const subject = findSubject(tree.data ?? [], id);

  if (tree.isLoading || !term.data) return <Screen insetTop={false}><Loading /></Screen>;

  if (!subject) {
    return (
      <Screen insetTop={false}>
        <EmptyState title="Subject not found" detail="It may have been deleted on another device." />
      </Screen>
    );
  }

  const overall = subjectSummary(subject);
  const thisWeek = currentWeekNumber(now, term.data);

  return (
    <>
      <Stack.Screen options={{ title: subject.code }} />
      <Screen insetTop={false}>
        <Label>{term.data.code}</Label>
        <Title>{subject.code}</Title>
        {subject.name && <Body colour="textSecondary">{subject.name}</Body>}

        <Card style={styles.overall}>
          <Row style={styles.spaceBetween}>
            <Heading>Overall</Heading>
            <Heading>{formatPercent(overall.fraction)}</Heading>
          </Row>
          <ProgressBar summary={overall} height={10} />
          <SummaryLine summary={overall} />
        </Card>

        <View style={styles.sectionHeader}>
          <Label>Weeks</Label>
        </View>

        <View style={styles.grid}>
          {weekNumbers(term.data).map((week) => (
            <WeekTile
              key={week}
              subjectId={subject.id}
              week={week}
              label={shortWeekLabel(week, term.data!)}
              isFlex={isFlexWeek(week, term.data!)}
              isCurrent={week === thisWeek}
              summary={weekSummary(subject, week)}
            />
          ))}
        </View>

        <Caption colour="textFaint" style={styles.legend}>
          A hollow tile means that week has no topics yet — not that you are at zero. Tap a week to add them.
        </Caption>
      </Screen>
    </>
  );
}

function WeekTile({
  subjectId,
  week,
  label,
  isFlex,
  isCurrent,
  summary,
}: {
  subjectId: string;
  week: number;
  label: string;
  isFlex: boolean;
  isCurrent: boolean;
  summary: ReturnType<typeof weekSummary>;
}) {
  const colors = useTheme();
  const status = summaryStatus(summary.fraction);
  const empty = summary.total === 0;

  return (
    <Link href={{ pathname: '/subject/[id]/week/[week]', params: { id: subjectId, week } }} asChild>
      <Pressable style={({ pressed }) => [styles.tileTouch, { opacity: pressed ? 0.65 : 1 }]}>
        {/*
          The box lives on this inner View rather than on the Pressable: Link's
          asChild clones the Pressable, and its style did not survive that on
          web, which left the tiles as bare floating text.
        */}
        <View
          style={[
            styles.tile,
            {
              backgroundColor: status ? `${STATUS_COLOR[status]}2E` : 'transparent',
              borderColor: isCurrent ? colors.tint : empty ? colors.border : `${STATUS_COLOR[status!]}88`,
              borderWidth: isCurrent ? 2 : 1,
              borderStyle: empty ? 'dashed' : 'solid',
            },
          ]}>
          <Caption colour={isFlex ? 'textFaint' : 'text'} style={styles.tileLabel}>
            {label}
          </Caption>

          <Caption colour={empty ? 'textFaint' : 'textSecondary'} style={styles.tileValue}>
            {empty ? '—' : formatPercent(summary.fraction)}
          </Caption>

          {/*
            A fixed-height strip, so the weak marker cannot shift the label or
            collide with it the way an absolutely positioned dot did.
          */}
          <View style={styles.markerRow}>
            {summary.weak > 0 && (
              <View
                style={[
                  styles.weakMarker,
                  { backgroundColor: STATUS_COLOR[summary.byStatus.red > 0 ? 'red' : 'yellow'] },
                ]}
              />
            )}
          </View>
        </View>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  overall: { marginTop: Spacing.five },
  sectionHeader: { marginTop: Spacing.six, marginBottom: Spacing.three },
  spaceBetween: { justifyContent: 'space-between' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three },
  tileTouch: { width: 76, height: 72 },
  tile: {
    flex: 1,
    borderRadius: Radius.medium,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.half,
    paddingVertical: Spacing.two,
  },
  tileLabel: { fontWeight: '700' },
  tileValue: { fontSize: 12 },
  markerRow: { height: 4, justifyContent: 'center' },
  weakMarker: { width: 16, height: 3, borderRadius: 2 },
  legend: { marginTop: Spacing.four },
});
