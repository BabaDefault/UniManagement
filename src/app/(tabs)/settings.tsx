import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';

import {
  Body,
  Button,
  Caption,
  Card,
  Divider,
  ErrorNote,
  Heading,
  Label,
  Loading,
  Row,
  Screen,
  Spacing,
  Title,
  useTheme,
} from '@/components/ui';
import { Radius } from '@/constants/theme';
import { exportDatabase, pickBackup, type PickedBackup } from '@/lib/backup';
import { canFetchUrl, fetchFeed, pickFeedFile } from '@/lib/import-timetable';
import { dedupeClasses, parseTimetable, type ParsedClass } from '@/lib/ical';
import {
  useActiveTerm,
  useAddSubject,
  useClasses,
  useDatabaseSnapshot,
  useDeleteSubject,
  useImportClasses,
  useRestoreBackup,
  useTree,
  useUpdateTerm,
} from '@/lib/queries';
import { STATUS_COLOR } from '@/lib/status';
import { describeDatabase } from '@/lib/store';
import { addDays, DEFAULT_TERM, parseLocalDate, weekEndDate, type Term } from '@/lib/terms';

export default function SettingsScreen() {
  const term = useActiveTerm();
  const tree = useTree(term.data?.id);
  const classes = useClasses(term.data?.id);

  if (!term.data) return <Screen><Loading /></Screen>;

  return (
    <Screen>
      <Title>Settings</Title>

      <TermCard term={term.data} />
      <SubjectsCard termId={term.data.id} subjects={tree.data ?? []} />
      <ImportCard term={term.data} importedCount={classes.data?.length ?? 0} />

      <BackupCard />
    </Screen>
  );
}

// --------------------------------------------------------------------- backup

/**
 * Everything lives on this device only, so this card is the entire safety net:
 * the backup against a reinstall, and the only bridge between phone and laptop.
 */
function BackupCard() {
  const snapshot = useDatabaseSnapshot();
  const restore = useRestoreBackup();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState<PickedBackup | null>(null);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card style={styles.card}>
      <Heading>Backup</Heading>
      <Caption colour="textSecondary">
        Your data is stored on this device only. Nothing syncs — export a file to back it up, or to move
        your progress between your phone and your laptop.
      </Caption>
      {snapshot.data && <Caption colour="textFaint">{describeDatabase(snapshot.data)}</Caption>}

      <Button
        title="Export backup"
        variant="secondary"
        loading={busy}
        disabled={!snapshot.data}
        onPress={() =>
          run(async () => {
            const result = await exportDatabase(snapshot.data!);
            setNotice(
              result.shared
                ? `Exported ${result.name}.`
                : `Saved ${result.name} to the app's storage — no share targets available.`,
            );
          })
        }
      />

      <Button
        title="Restore from file"
        variant="secondary"
        loading={busy}
        onPress={() =>
          run(async () => {
            const picked = await pickBackup();
            if (picked) setPending(picked);
          })
        }
      />

      {notice && <Caption colour="textSecondary">{notice}</Caption>}
      <ErrorNote error={error ?? restore.error} />

      {pending && (
        <View style={[styles.preview, { borderColor: STATUS_COLOR.red }]}>
          <Label>Replace everything?</Label>
          <Body>{describeDatabase(pending.database)}</Body>
          <Caption colour="textFaint">
            From {pending.name}. This overwrites the term, subjects, every status and the timetable on
            this device. It cannot be undone.
          </Caption>
          <Row style={styles.fieldRow}>
            <Button title="Cancel" variant="secondary" style={styles.flex} onPress={() => setPending(null)} />
            <Button
              title="Replace"
              style={styles.flex}
              loading={restore.isPending}
              onPress={() =>
                restore.mutate(pending.database, {
                  onSuccess: () => {
                    setPending(null);
                    setNotice(`Restored from ${pending.name}.`);
                  },
                })
              }
            />
          </Row>
        </View>
      )}
    </Card>
  );
}

// ----------------------------------------------------------------------- term

function TermCard({ term }: { term: Term }) {
  const colors = useTheme();
  const update = useUpdateTerm();

  const [code, setCode] = useState(term.code);
  const [startDate, setStartDate] = useState(term.startDate);
  const [numWeeks, setNumWeeks] = useState(String(term.numWeeks));
  const [flexWeek, setFlexWeek] = useState(term.flexWeekNumber === null ? '' : String(term.flexWeekNumber));

  const parsedWeeks = Number(numWeeks);
  const parsedFlex = flexWeek.trim() === '' ? null : Number(flexWeek);
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(startDate) && !Number.isNaN(parseLocalDate(startDate).getTime());
  const startsOnMonday = validDate && parseLocalDate(startDate).getDay() === 1;
  const valid =
    validDate &&
    Number.isInteger(parsedWeeks) &&
    parsedWeeks > 0 &&
    (parsedFlex === null || (Number.isInteger(parsedFlex) && parsedFlex >= 1 && parsedFlex <= parsedWeeks));

  const dirty =
    code !== term.code ||
    startDate !== term.startDate ||
    parsedWeeks !== term.numWeeks ||
    parsedFlex !== term.flexWeekNumber;

  const lastDay = valid ? weekEndDate(parsedWeeks, { ...term, startDate, numWeeks: parsedWeeks }) : null;

  const inputStyle = [
    styles.input,
    { color: colors.text, backgroundColor: colors.background, borderColor: colors.border },
  ];

  return (
    <Card style={styles.card}>
      <Heading>Term</Heading>
      <Caption colour="textSecondary">
        Week numbers are worked out from the start date, so correcting it re-labels every topic at once.
      </Caption>

      <Field label="Name">
        <TextInput style={inputStyle} value={code} onChangeText={setCode} autoCapitalize="characters" />
      </Field>

      <Field label="First Monday (YYYY-MM-DD)">
        <TextInput
          style={inputStyle}
          value={startDate}
          onChangeText={setStartDate}
          autoCapitalize="none"
          keyboardType="numbers-and-punctuation"
          placeholder={DEFAULT_TERM.startDate}
          placeholderTextColor={colors.textFaint}
        />
      </Field>

      <Row style={styles.fieldRow}>
        <Field label="Weeks" style={styles.flex}>
          <TextInput style={inputStyle} value={numWeeks} onChangeText={setNumWeeks} keyboardType="number-pad" />
        </Field>
        <Field label="Flexibility week" style={styles.flex}>
          <TextInput
            style={inputStyle}
            value={flexWeek}
            onChangeText={setFlexWeek}
            keyboardType="number-pad"
            placeholder="none"
            placeholderTextColor={colors.textFaint}
          />
        </Field>
      </Row>

      {!validDate && <Caption colour="danger">Use the YYYY-MM-DD format, e.g. {DEFAULT_TERM.startDate}.</Caption>}
      {validDate && !startsOnMonday && (
        <Caption colour="danger">
          That date is not a Monday. UNSW weeks start on Monday, so week boundaries will be offset.
        </Caption>
      )}
      {lastDay && (
        <Caption colour="textFaint">
          Week {parsedWeeks} ends {lastDay.toDateString()}
          {parsedFlex ? ` · week ${parsedFlex} is Flexibility Week` : ''}
        </Caption>
      )}

      <ErrorNote error={update.error} />

      <Button
        title={dirty ? 'Save term' : 'Saved'}
        disabled={!valid || !dirty}
        loading={update.isPending}
        onPress={() =>
          update.mutate({
            ...term,
            code: code.trim(),
            startDate,
            numWeeks: parsedWeeks,
            flexWeekNumber: parsedFlex,
          })
        }
      />
    </Card>
  );
}

// ------------------------------------------------------------------- subjects

function SubjectsCard({
  termId,
  subjects,
}: {
  termId: string;
  subjects: { id: string; code: string; name: string | null }[];
}) {
  const colors = useTheme();
  const add = useAddSubject(termId);
  const remove = useDeleteSubject(termId);

  const [code, setCode] = useState('');
  const [name, setName] = useState('');

  const duplicate = subjects.some((subject) => subject.code === code.trim().toUpperCase());

  return (
    <Card style={styles.card}>
      <Heading>Subjects</Heading>

      {subjects.length === 0 ? (
        <Caption colour="textFaint">No subjects yet. Add your courses for this term.</Caption>
      ) : (
        <View>
          {subjects.map((subject, index) => (
            <View key={subject.id}>
              {index > 0 && <Divider />}
              <Row style={styles.subjectRow}>
                <View style={styles.flex}>
                  <Body>{subject.code}</Body>
                  {subject.name && <Caption colour="textFaint">{subject.name}</Caption>}
                </View>
                <Pressable
                  hitSlop={12}
                  onPress={() =>
                    Alert.alert(
                      `Delete ${subject.code}?`,
                      'Every topic and status for this subject is deleted too. This cannot be undone.',
                      [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Delete', style: 'destructive', onPress: () => remove.mutate(subject.id) },
                      ],
                    )
                  }>
                  <Ionicons name="trash-outline" size={16} color={colors.danger} />
                </Pressable>
              </Row>
            </View>
          ))}
        </View>
      )}

      <Divider />

      <Row style={styles.fieldRow}>
        <TextInput
          style={[
            styles.input,
            styles.flex,
            { color: colors.text, backgroundColor: colors.background, borderColor: colors.border },
          ]}
          value={code}
          onChangeText={setCode}
          placeholder="COMP3311"
          placeholderTextColor={colors.textFaint}
          autoCapitalize="characters"
          autoCorrect={false}
        />
        <TextInput
          style={[
            styles.input,
            styles.flexWide,
            { color: colors.text, backgroundColor: colors.background, borderColor: colors.border },
          ]}
          value={name}
          onChangeText={setName}
          placeholder="Database Systems (optional)"
          placeholderTextColor={colors.textFaint}
        />
      </Row>

      {duplicate && <Caption colour="danger">That course is already in this term.</Caption>}
      <ErrorNote error={add.error ?? remove.error} />

      <Button
        title="Add subject"
        disabled={code.trim().length === 0 || duplicate}
        loading={add.isPending}
        onPress={() =>
          add.mutate(
            { code, name, position: subjects.length },
            {
              onSuccess: () => {
                setCode('');
                setName('');
              },
            },
          )
        }
      />
    </Card>
  );
}

// --------------------------------------------------------------------- import

function ImportCard({ term, importedCount }: { term: Term; importedCount: number }) {
  const colors = useTheme();
  const importClasses = useImportClasses(term.id);

  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [preview, setPreview] = useState<{ classes: ParsedClass[]; codes: string[]; source: string } | null>(null);

  // A generous window around the term so nothing is silently dropped if the
  // term dates are slightly off.
  const from = addDays(parseLocalDate(term.startDate), -21);
  const to = addDays(weekEndDate(term.numWeeks, term), 42);

  async function load(read: () => Promise<{ text: string; source: string } | null>) {
    setBusy(true);
    setError(null);
    try {
      const loaded = await read();
      if (!loaded) return;

      const result = parseTimetable(loaded.text, { from, to });
      if (result.classes.length === 0) {
        throw new Error('No classes found in that calendar. Check it covers this term.');
      }

      setPreview({
        classes: dedupeClasses(result.classes),
        codes: result.subjectCodes,
        source: loaded.source,
      });
    } catch (caught) {
      setError(caught);
      setPreview(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card style={styles.card}>
      <Heading>Timetable</Heading>
      <Caption colour="textSecondary">
        myUNSW → Class Timetable → &quot;personal iCal link&quot; (top-left). Importing replaces this term&apos;s
        classes.
      </Caption>
      {importedCount > 0 && <Caption colour="textFaint">{importedCount} classes imported.</Caption>}

      {canFetchUrl && (
        <>
          <Field label="Paste the iCal link">
            <TextInput
              style={[
                styles.input,
                { color: colors.text, backgroundColor: colors.background, borderColor: colors.border },
              ]}
              value={url}
              onChangeText={setUrl}
              placeholder="https://my.unsw.edu.au/..."
              placeholderTextColor={colors.textFaint}
              autoCapitalize="none"
              autoCorrect={false}
              inputMode="url"
            />
          </Field>
          <Button
            title="Load from link"
            variant="secondary"
            disabled={url.trim().length === 0}
            loading={busy}
            onPress={() => load(async () => ({ text: await fetchFeed(url), source: 'link' }))}
          />
        </>
      )}

      <Button
        title="Choose .ics file"
        variant="secondary"
        loading={busy}
        onPress={() =>
          load(async () => {
            const picked = await pickFeedFile();
            return picked ? { text: picked.text, source: picked.name } : null;
          })
        }
      />

      {!canFetchUrl && (
        <Caption colour="textFaint">
          A browser cannot fetch the myUNSW link directly (no CORS headers). Download the .ics and choose the file, or
          import from the phone.
        </Caption>
      )}

      <ErrorNote error={error ?? importClasses.error} />

      {preview && (
        <View style={[styles.preview, { borderColor: colors.border }]}>
          <Label>Ready to import</Label>
          <Body>
            {preview.classes.length} classes · {preview.codes.join(', ')}
          </Body>
          <Caption colour="textFaint">
            {preview.classes[0].startsAt.toDateString()} → {preview.classes[preview.classes.length - 1].startsAt.toDateString()} (from {preview.source})
          </Caption>
          <Row style={styles.fieldRow}>
            <Button title="Cancel" variant="secondary" style={styles.flex} onPress={() => setPreview(null)} />
            <Button
              title="Import"
              style={styles.flex}
              loading={importClasses.isPending}
              onPress={() =>
                importClasses.mutate(preview.classes, {
                  onSuccess: () => {
                    setPreview(null);
                    setUrl('');
                  },
                })
              }
            />
          </Row>
        </View>
      )}
    </Card>
  );
}

function Field({
  label,
  children,
  style,
}: {
  label: string;
  children: React.ReactNode;
  style?: object;
}) {
  return (
    <View style={[styles.field, style]}>
      <Label>{label}</Label>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: Spacing.five },
  field: { gap: Spacing.two },
  fieldRow: { alignItems: 'flex-end', gap: Spacing.three },
  flex: { flex: 1 },
  flexWide: { flex: 1.6 },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.medium,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 15,
    minHeight: 44,
  },
  subjectRow: { paddingVertical: Spacing.three },
  preview: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.medium,
    padding: Spacing.three,
    gap: Spacing.two,
  },
});
