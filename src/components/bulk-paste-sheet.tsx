import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { Body, Button, Caption, Divider, ErrorNote, Heading, Label, Row, Spacing, useTheme } from '@/components/ui';
import { Radius } from '@/constants/theme';
import { describeMergePlan, parseBulkPaste, planMerge, type ExistingTopic, type MergePlan } from '@/lib/bulk-paste';

const PLACEHOLDER = `Functional Dependencies
  Definition of FD
  Armstrong's axioms
Attribute Closure
  Computing X+
  Using closure to find keys`;

/**
 * Setting up a term is where this app would get abandoned, so a week goes in as
 * one paste from the course outline. The preview is not decoration: it shows
 * exactly what will be created, and that nothing existing is touched.
 */
export function BulkPasteSheet({
  visible,
  weekLabel,
  existing,
  busy,
  error,
  onCancel,
  onSubmit,
}: {
  visible: boolean;
  weekLabel: string;
  existing: ExistingTopic[];
  busy?: boolean;
  error?: unknown;
  onCancel: () => void;
  onSubmit: (plan: MergePlan) => void;
}) {
  const colors = useTheme();
  const [text, setText] = useState('');

  const { parsed, plan } = useMemo(() => {
    const parsedTopics = parseBulkPaste(text);
    return { parsed: parsedTopics, plan: planMerge(existing, parsedTopics) };
  }, [text, existing]);

  const additions =
    plan.newTopics.reduce((n, topic) => n + topic.subtopics.length, 0) +
    plan.newSubtopics.reduce((n, entry) => n + entry.titles.length, 0);

  function close() {
    setText('');
    onCancel();
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={close}>
      <View style={[styles.backdrop, { backgroundColor: colors.background }]}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.fill}>
          <View style={styles.header}>
            <Heading>Paste topics — {weekLabel}</Heading>
            <Caption colour="textSecondary">
              One topic per line. Indent subtopics with spaces or a tab. New subtopics start red.
            </Caption>
          </View>

          <TextInput
            style={[
              styles.input,
              { color: colors.text, backgroundColor: colors.backgroundElement, borderColor: colors.border },
            ]}
            value={text}
            onChangeText={setText}
            placeholder={PLACEHOLDER}
            placeholderTextColor={colors.textFaint}
            multiline
            autoCapitalize="none"
            autoCorrect={false}
            textAlignVertical="top"
          />

          <ScrollView style={styles.preview} contentContainerStyle={styles.previewContent}>
            {parsed.length === 0 ? (
              <Caption colour="textFaint">Nothing to preview yet.</Caption>
            ) : (
              <>
                <Label>Preview</Label>
                <Caption colour="textSecondary">{describeMergePlan(plan)}</Caption>
                <Divider />
                {plan.newTopics.map((topic) => (
                  <View key={topic.title} style={styles.previewTopic}>
                    <Body>{topic.title}</Body>
                    {topic.subtopics.map((subtopic) => (
                      <Caption key={subtopic} colour="textFaint" style={styles.previewSub}>
                        {subtopic}
                      </Caption>
                    ))}
                  </View>
                ))}
                {plan.newSubtopics.map((entry) => {
                  const topic = existing.find((candidate) => candidate.id === entry.topicId);
                  return (
                    <View key={entry.topicId} style={styles.previewTopic}>
                      <Body colour="textSecondary">{topic?.title} (existing)</Body>
                      {entry.titles.map((title) => (
                        <Caption key={title} colour="textFaint" style={styles.previewSub}>
                          {title}
                        </Caption>
                      ))}
                    </View>
                  );
                })}
                {plan.keptCount > 0 && (
                  <Caption colour="textFaint">
                    {plan.keptCount} already tracked — their statuses are left untouched.
                  </Caption>
                )}
              </>
            )}
          </ScrollView>

          <ErrorNote error={error} />

          <Row style={styles.actions}>
            <Button title="Cancel" variant="secondary" onPress={close} style={styles.action} />
            <Button
              title={additions > 0 ? `Add ${additions}` : 'Add'}
              onPress={() => {
                onSubmit(plan);
                setText('');
              }}
              disabled={additions === 0}
              loading={busy}
              style={styles.action}
            />
          </Row>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, padding: Spacing.four, paddingTop: Spacing.seven },
  fill: { flex: 1, gap: Spacing.three },
  header: { gap: Spacing.two },
  input: {
    minHeight: 150,
    maxHeight: 240,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.medium,
    padding: Spacing.three,
    fontSize: 15,
    lineHeight: 21,
  },
  preview: { flex: 1 },
  previewContent: { gap: Spacing.two, paddingBottom: Spacing.four },
  previewTopic: { gap: Spacing.half },
  previewSub: { paddingLeft: Spacing.four },
  actions: { marginTop: 'auto' },
  action: { flex: 1 },
});
