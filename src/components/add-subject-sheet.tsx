import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, StyleSheet, TextInput, View } from 'react-native';

import { Body, Button, Caption, ErrorNote, Heading, Label, Row, Spacing, useTheme } from '@/components/ui';
import { Radius } from '@/constants/theme';

/**
 * Adding a subject, from wherever you happen to be.
 *
 * This used to live only in Settings, which put three taps between "I have a new
 * course" and being able to track it. Setting up is the moment the app is most
 * likely to be abandoned, so it belongs on the screen you already open.
 */
export function AddSubjectSheet({
  visible,
  existingCodes,
  busy,
  error,
  onCancel,
  onSubmit,
}: {
  visible: boolean;
  existingCodes: string[];
  busy?: boolean;
  error?: unknown;
  onCancel: () => void;
  onSubmit: (input: { code: string; name: string }) => void;
}) {
  const colors = useTheme();
  // The caller keys this component on whether it is open, so each open gets a
  // fresh mount and therefore empty fields — no effect syncing props to state.
  const [code, setCode] = useState('');
  const [name, setName] = useState('');

  const trimmed = code.trim().toUpperCase();
  const duplicate = existingCodes.some((existing) => existing.toUpperCase() === trimmed);
  const valid = trimmed !== '' && !duplicate;

  const inputStyle = [
    styles.input,
    { color: colors.text, backgroundColor: colors.background, borderColor: colors.border },
  ];

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onCancel}>
      <View style={[styles.sheet, { backgroundColor: colors.background }]}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.fill}>
          <Heading>Add a subject</Heading>
          <Caption colour="textSecondary">
            Add the course now; you can paste in each week&apos;s topics as you go.
          </Caption>

          <View style={styles.field}>
            <Label>Course code</Label>
            <TextInput
              style={inputStyle}
              value={code}
              onChangeText={setCode}
              placeholder="COMP3311"
              placeholderTextColor={colors.textFaint}
              autoCapitalize="characters"
              autoCorrect={false}
              autoFocus
            />
          </View>

          <View style={styles.field}>
            <Label>Name</Label>
            <TextInput
              style={inputStyle}
              value={name}
              onChangeText={setName}
              placeholder="Database Systems (optional)"
              placeholderTextColor={colors.textFaint}
              onSubmitEditing={() => valid && onSubmit({ code, name })}
            />
          </View>

          {duplicate && <Body colour="danger">{trimmed} is already in this term.</Body>}
          <ErrorNote error={error} />

          <Row style={styles.actions}>
            <Button title="Cancel" variant="secondary" style={styles.flex} onPress={onCancel} />
            <Button
              title="Add"
              style={styles.flex}
              disabled={!valid}
              loading={busy}
              onPress={() => onSubmit({ code, name })}
            />
          </Row>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1, padding: Spacing.four, paddingTop: Spacing.seven },
  fill: { flex: 1, gap: Spacing.four },
  field: { gap: Spacing.two },
  flex: { flex: 1 },
  actions: { marginTop: 'auto', gap: Spacing.three },
  input: {
    borderWidth: 1,
    borderRadius: Radius.medium,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 16,
    minHeight: 46,
  },
});
