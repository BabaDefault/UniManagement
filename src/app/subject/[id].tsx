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
  const fill = status ? `${STATUS_COLOR[status]}26` : 'transparent';

  return (
    <Link href={{ pathname: '/subject/[id]/week/[week]', params: { id: subjectId, week } }} asChild>
      <Pressable
        style={({ pressed }) => [
          styles.tile,
          {
            backgroundColor: fill,
            borderColor: isCurrent ? colors.tint : colors.border,
            borderWidth: isCurrent ? 2 : StyleSheet.hairlineWidth,
            borderStyle: summary.total === 0 ? 'dashed' : 'solid',
            opacity: pressed ? 0.7 : isFlex ? 0.75 : 1,
          },
        ]}>
        <Caption colour={isFlex ? 'textFaint' : 'text'} style={styles.tileLabel}>
          {label}
        </Caption>
        {summary.total === 0 ? (
          <Caption colour="textFaint" style={styles.tileValue}>
            —
          </Caption>
        ) : (
          <Caption colour="textSecondary" style={styles.tileValue}>
            {formatPercent(summary.fraction)}
          </Caption>
        )}
        {summary.weak > 0 && (
          <View style={[styles.weakDot, { backgroundColor: STATUS_COLOR[summary.byStatus.red > 0 ? 'red' : 'yellow'] }]} />
        )}
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  overall: { marginTop: Spacing.five },
  sectionHeader: { marginTop: Spacing.six, marginBottom: Spacing.three },
  spaceBetween: { justifyContent: 'space-between' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three },
  tile: {
    width: 76,
    height: 68,
    borderRadius: Radius.medium,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.half,
  },
  tileLabel: { fontWeight: '700' },
  tileValue: { fontSize: 12 },
  weakDot: { position: 'absolute', top: 6, right: 6, width: 6, height: 6, borderRadius: 3 },
  legend: { marginTop: Spacing.four },
});
