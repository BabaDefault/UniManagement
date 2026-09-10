import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { BulkPasteSheet } from '@/components/bulk-paste-sheet';
import { useConfirm } from '@/components/confirm-dialog';
import { HeaderBack } from '@/components/header-back';
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
  StatusLegend,
  SummaryLine,
  Title,
  useTheme,
} from '@/components/ui';
import { Radius } from '@/constants/theme';
import type { ExistingTopic } from '@/lib/bulk-paste';
import {
  useActiveTerm,
  useApplyPaste,
  useDeleteSubtopic,
  useDeleteTopic,
  useSetStatus,
  useTree,
} from '@/lib/queries';
import { nextStatus, STATUS_COLOR, STATUS_LABEL, STATUSES, type Status } from '@/lib/status';
import { isFlexWeek, weekLabel } from '@/lib/terms';
import { findSubject, topicsForWeek, topicSummary, weekSummary, type SubtopicNode } from '@/lib/tree';

export default function WeekScreen() {
  const { id, week } = useLocalSearchParams<{ id: string; week: string }>();
  const weekNumber = Number(week);

  const term = useActiveTerm();
  const tree = useTree(term.data?.id);
  const termId = term.data?.id ?? '';

  const setStatus = useSetStatus(termId);
  const applyPaste = useApplyPaste(termId);
  const deleteTopic = useDeleteTopic(termId);
  const deleteSubtopic = useDeleteSubtopic(termId);

  const [pasteOpen, setPasteOpen] = useState(false);
  const [picking, setPicking] = useState<SubtopicNode | null>(null);
  const { confirm, dialog } = useConfirm();

  const subject = findSubject(tree.data ?? [], id);

  if (tree.isLoading || !term.data) return <Screen insetTop={false}><Loading /></Screen>;
  if (!subject) return <Screen insetTop={false}><EmptyState title="Subject not found" /></Screen>;

  const topics = topicsForWeek(subject, weekNumber);
  const summary = weekSummary(subject, weekNumber);
  const label = weekLabel(weekNumber, term.data);

  const existing: ExistingTopic[] = topics.map((topic) => ({
    id: topic.id,
    title: topic.title,
    subtopics: topic.subtopics.map((subtopic) => ({ id: subtopic.id, title: subtopic.title })),
  }));

  function confirmDelete(title: string, what: string, onConfirm: () => void) {
    confirm({
      title: `Delete ${what}?`,
      message: `"${title}" and everything under it. This cannot be undone.`,
      onConfirm,
    });
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: `${subject.code} · ${label}`,
          headerLeft: () => <HeaderBack fallback={{ pathname: '/subject/[id]', params: { id } }} />,
        }}
      />
      <Screen insetTop={false}>
        <Label>{subject.code}</Label>
        <Title>{label}</Title>

        {isFlexWeek(weekNumber, term.data) && (
          <Caption colour="textFaint">No teaching this week — use it to clear red topics from earlier weeks.</Caption>
        )}

        {summary.total > 0 && (
          <Card style={styles.summary}>
            <ProgressBar summary={summary} height={10} />
            <SummaryLine summary={summary} />
          </Card>
        )}

        {topics.length === 0 ? (
          <View style={styles.emptyWrap}>
            <EmptyState
              title="No topics for this week yet"
              detail="Paste the week's topics from your course outline. Indent subtopics under each topic."
              action={<Button title="Paste topics" onPress={() => setPasteOpen(true)} style={styles.emptyAction} />}
            />
          </View>
        ) : (
          <View style={styles.list}>
            {topics.map((topic) => {
              const topicRollup = topicSummary(topic);
              return (
                <Card key={topic.id}>
                  <Row style={styles.spaceBetween}>
                    <View style={styles.topicHeading}>
                      <Heading>{topic.title}</Heading>
                    </View>
                    <Pressable
                      hitSlop={12}
                      onPress={() => confirmDelete(topic.title, 'this topic', () => deleteTopic.mutate(topic.id))}>
                      <Ionicons name="trash-outline" size={16} color={STATUS_COLOR.red} />
                    </Pressable>
                  </Row>

                  <ProgressBar summary={topicRollup} height={6} />

                  <View>
                    {topic.subtopics.map((subtopic, index) => (
                      <View key={subtopic.id}>
                        {index > 0 && <Divider />}
                        <SubtopicRow
                          subtopic={subtopic}
                          onCycle={() =>
                            setStatus.mutate({ subtopicId: subtopic.id, status: nextStatus(subtopic.status) })
                          }
                          onLongPress={() => setPicking(subtopic)}
                        />
                      </View>
                    ))}
                  </View>
                </Card>
              );
            })}

            <Button title="Paste more topics" variant="secondary" onPress={() => setPasteOpen(true)} />
          </View>
        )}

        <Caption colour="textFaint" style={styles.hint}>
          Tap to move a subtopic up the scale, long-press to pick a level or delete it.
        </Caption>

        <StatusLegend />

        <ErrorNote error={setStatus.error ?? applyPaste.error ?? deleteTopic.error ?? deleteSubtopic.error} />
      </Screen>

      <BulkPasteSheet
        visible={pasteOpen}
        weekLabel={label}
        existing={existing}
        busy={applyPaste.isPending}
        error={applyPaste.error}
        onCancel={() => setPasteOpen(false)}
        onSubmit={(plan) => {
          applyPaste.mutate(
            { subjectId: subject.id, weekNumber, plan, startPosition: topics.length },
            { onSuccess: () => setPasteOpen(false) },
          );
        }}
      />

      <StatusPicker
        subtopic={picking}
        onDismiss={() => setPicking(null)}
        onPick={(status) => {
          if (picking) setStatus.mutate({ subtopicId: picking.id, status });
          setPicking(null);
        }}
        onDelete={() => {
          const target = picking;
          setPicking(null);
          if (target) confirmDelete(target.title, 'this subtopic', () => deleteSubtopic.mutate(target.id));
        }}
      />

      {dialog}
    </>
  );
}

function SubtopicRow({
  subtopic,
  onCycle,
  onLongPress,
}: {
  subtopic: SubtopicNode;
  onCycle: () => void;
  onLongPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${subtopic.title}. ${STATUS_LABEL[subtopic.status]}. Tap to change.`}
      onPress={onCycle}
      onLongPress={onLongPress}
      style={({ pressed }) => [styles.subtopicRow, { opacity: pressed ? 0.6 : 1 }]}>
      {/*
        Just the dot and the name. The status is carried by colour alone here;
        the wording still reaches screen readers via accessibilityLabel above,
        and long-pressing opens the picker where every level is named.
      */}
      <StatusDot status={subtopic.status} size={14} />
      <Body style={styles.subtopicTitle}>{subtopic.title}</Body>
    </Pressable>
  );
}

function StatusPicker({
  subtopic,
  onDismiss,
  onPick,
  onDelete,
}: {
  subtopic: SubtopicNode | null;
  onDismiss: () => void;
  onPick: (status: Status) => void;
  onDelete: () => void;
}) {
  const colors = useTheme();

  return (
    <Modal visible={Boolean(subtopic)} transparent animationType="fade" onRequestClose={onDismiss}>
      <Pressable style={styles.pickerBackdrop} onPress={onDismiss}>
        <Pressable
          style={[styles.picker, { backgroundColor: colors.backgroundElement, borderColor: colors.border }]}>
          <Heading>{subtopic?.title}</Heading>

          {STATUSES.map((status) => (
            <Pressable
              key={status}
              onPress={() => onPick(status)}
              style={({ pressed }) => [
                styles.pickerRow,
                {
                  backgroundColor:
                    subtopic?.status === status ? `${STATUS_COLOR[status]}22` : pressed ? colors.backgroundSelected : 'transparent',
                },
              ]}>
              <StatusDot status={status} size={14} />
              <Body>{STATUS_LABEL[status]}</Body>
            </Pressable>
          ))}

          <Divider />
          <Button title="Delete subtopic" variant="danger" onPress={onDelete} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  summary: { marginTop: Spacing.four },
  emptyWrap: { marginTop: Spacing.five },
  emptyAction: { alignSelf: 'stretch', marginTop: Spacing.three },
  list: { marginTop: Spacing.five, gap: Spacing.three },
  spaceBetween: { justifyContent: 'space-between' },
  topicHeading: { flex: 1, gap: Spacing.half },
  subtopicRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.three },
  subtopicTitle: { flex: 1 },
  hint: { marginTop: Spacing.four },
  pickerBackdrop: { flex: 1, backgroundColor: '#00000080', justifyContent: 'center', padding: Spacing.four },
  picker: {
    borderRadius: Radius.large,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.four,
    gap: Spacing.two,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radius.medium,
  },
});
