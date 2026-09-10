import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { Body, Button, Caption, Divider, ErrorNote, Heading, Label, Row, Spacing, useTheme } from '@/components/ui';
import { Radius } from '@/constants/theme';
import type { ClassSeries, ClassSeriesInput } from '@/lib/store';
import {
  CLASS_TYPES,
  parseTimeInput,
  timeInputError,
  WEEKDAY_NAMES,
  WEEKDAY_ORDER,
} from '@/lib/time-input';

/**
 * Add or edit one weekly class.
 *
 * Deliberately hand-entry rather than a timetable import: the classes that
 * matter are the ones actually attended, which routinely means a friend's
 * tutorial rather than the one on the official enrolment.
 */
export function ClassFormSheet({
  visible,
  initial,
  knownSubjects,
  busy,
  error,
  onCancel,
  onSubmit,
  onDelete,
}: {
  visible: boolean;
  /** Null when adding. */
  initial: ClassSeries | null;
  knownSubjects: string[];
  busy?: boolean;
  error?: unknown;
  onCancel: () => void;
  onSubmit: (input: ClassSeriesInput) => void;
  onDelete?: () => void;
}) {
  const colors = useTheme();

  // Seeded once from `initial`. The caller gives this component a key that
  // changes whenever the sheet opens, which remounts it with fresh state —
  // rather than syncing props into state in an effect, which cascades renders.
  const [subjectCode, setSubjectCode] = useState(initial?.subjectCode ?? '');
  const [classType, setClassType] = useState(initial?.classType ?? '');
  const [weekday, setWeekday] = useState(initial?.weekday ?? 1);
  const [start, setStart] = useState(initial ? minutesToInput(initial.startMinutes) : '');
  const [end, setEnd] = useState(initial ? minutesToInput(initial.endMinutes) : '');
  const [location, setLocation] = useState(initial?.location ?? '');

  const startError = timeInputError(start);
  const endError = timeInputError(end);

  const startMinutes = parseTimeInput(start);
  const endMinutes = parseTimeInput(end);

  const orderError =
    startMinutes !== null && endMinutes !== null && endMinutes <= startMinutes
      ? 'The class has to end after it starts'
      : null;

  const valid = subjectCode.trim() !== '' && !startError && !endError && !orderError;

  const suggestions = useMemo(
    () => knownSubjects.filter((code) => code.toUpperCase() !== subjectCode.trim().toUpperCase()),
    [knownSubjects, subjectCode],
  );

  const inputStyle = [
    styles.input,
    { color: colors.text, backgroundColor: colors.background, borderColor: colors.border },
  ];

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onCancel}>
      <View style={[styles.sheet, { backgroundColor: colors.background }]}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.fill}>
          <Heading>{initial ? 'Edit class' : 'Add a class'}</Heading>
          <Caption colour="textSecondary">
            Repeats every teaching week of the term. Flexibility Week is skipped.
          </Caption>

          <ScrollView style={styles.fill} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            <View style={styles.field}>
              <Label>Course</Label>
              <TextInput
                style={inputStyle}
                value={subjectCode}
                onChangeText={setSubjectCode}
                placeholder="COMP3311"
                placeholderTextColor={colors.textFaint}
                autoCapitalize="characters"
                autoCorrect={false}
              />
              {suggestions.length > 0 && (
                <Row style={styles.chips}>
                  {suggestions.map((code) => (
                    <Chip key={code} label={code} selected={false} onPress={() => setSubjectCode(code)} />
                  ))}
                </Row>
              )}
            </View>

            <View style={styles.field}>
              <Label>Type</Label>
              <Row style={styles.chips}>
                {CLASS_TYPES.map((type) => (
                  <Chip
                    key={type}
                    label={type}
                    selected={classType.trim().toUpperCase() === type}
                    onPress={() => setClassType(classType.trim().toUpperCase() === type ? '' : type)}
                  />
                ))}
              </Row>
            </View>

            <View style={styles.field}>
              <Label>Day</Label>
              <Row style={styles.chips}>
                {WEEKDAY_ORDER.map((day) => (
                  <Chip
                    key={day}
                    label={WEEKDAY_NAMES[day]}
                    selected={weekday === day}
                    onPress={() => setWeekday(day)}
                  />
                ))}
              </Row>
            </View>

            <Row style={styles.timeRow}>
              <View style={[styles.field, styles.flex]}>
                <Label>Starts</Label>
                <TextInput
                  style={inputStyle}
                  value={start}
                  onChangeText={setStart}
                  placeholder="9"
                  placeholderTextColor={colors.textFaint}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
              <View style={[styles.field, styles.flex]}>
                <Label>Ends</Label>
                <TextInput
                  style={inputStyle}
                  value={end}
                  onChangeText={setEnd}
                  placeholder="11"
                  placeholderTextColor={colors.textFaint}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
            </Row>

            {(startError || endError || orderError) && (
              <Caption colour="danger">{orderError ?? startError ?? endError}</Caption>
            )}
            <Caption colour="textFaint">Type it however you like: 9, 9:30, 2pm, 14:30.</Caption>

            <View style={styles.field}>
              <Label>Location</Label>
              <TextInput
                style={inputStyle}
                value={location}
                onChangeText={setLocation}
                placeholder="Ainsworth 202 (optional)"
                placeholderTextColor={colors.textFaint}
              />
            </View>

            {initial && onDelete && (
              <>
                <Divider />
                <Button title="Delete this class" variant="danger" onPress={onDelete} />
                <Caption colour="textFaint">Removes it from every week of the term.</Caption>
              </>
            )}
          </ScrollView>

          <ErrorNote error={error} />

          <Row style={styles.actions}>
            <Button title="Cancel" variant="secondary" style={styles.flex} onPress={onCancel} />
            <Button
              title={initial ? 'Save' : 'Add'}
              style={styles.flex}
              disabled={!valid}
              loading={busy}
              onPress={() =>
                onSubmit({
                  subjectCode: subjectCode.trim(),
                  classType: classType.trim() || null,
                  location: location.trim() || null,
                  weekday,
                  startMinutes: startMinutes!,
                  endMinutes: endMinutes!,
                })
              }
            />
          </Row>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

function minutesToInput(minutes: number): string {
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
}

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const colors = useTheme();

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: selected ? colors.tint : colors.backgroundElement,
          borderColor: selected ? colors.tint : colors.border,
          opacity: pressed ? 0.7 : 1,
        },
      ]}>
      <Body style={[styles.chipText, { color: selected ? '#FFFFFF' : colors.text }]}>{label}</Body>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1, padding: Spacing.four, paddingTop: Spacing.seven, gap: Spacing.two },
  fill: { flex: 1 },
  body: { gap: Spacing.four, paddingVertical: Spacing.four },
  field: { gap: Spacing.two },
  flex: { flex: 1 },
  timeRow: { alignItems: 'flex-start', gap: Spacing.three },
  chips: { flexWrap: 'wrap', gap: Spacing.two },
  chip: {
    borderWidth: 1,
    borderRadius: Radius.small,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    minWidth: 48,
    alignItems: 'center',
  },
  chipText: { fontSize: 13, fontWeight: '600' },
  input: {
    borderWidth: 1,
    borderRadius: Radius.medium,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 15,
    minHeight: 44,
  },
  actions: { gap: Spacing.three },
});
