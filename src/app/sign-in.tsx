import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, TextInput, View } from 'react-native';

import {
  Body,
  Button,
  Caption,
  Card,
  ErrorNote,
  Heading,
  Screen,
  Spacing,
  Title,
  useTheme,
} from '@/components/ui';
import { Radius } from '@/constants/theme';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

/**
 * Email + password rather than a magic link: one personal account, and no deep
 * link handling to get right across an Android build and a web build.
 */
export default function SignInScreen() {
  const colors = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (!isSupabaseConfigured) return <SetupNeeded />;

  async function submit() {
    setBusy(true);
    setError(null);
    setNotice(null);

    const credentials = { email: email.trim(), password };
    const { data, error: authError } =
      mode === 'sign-in'
        ? await supabase.auth.signInWithPassword(credentials)
        : await supabase.auth.signUp(credentials);

    setBusy(false);

    if (authError) {
      setError(authError.message);
      return;
    }

    // With email confirmation on, sign-up returns a user but no session.
    if (mode === 'sign-up' && !data.session) {
      setNotice('Account created. Confirm your email address, then sign in.');
      setMode('sign-in');
    }
  }

  const inputStyle = [
    styles.input,
    { color: colors.text, backgroundColor: colors.backgroundElement, borderColor: colors.border },
  ];

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.fill}>
      <Screen>
        <View style={styles.header}>
          <Title>Semester Tracker</Title>
          <Body colour="textSecondary">
            Where am I in every subject, and what needs work this week?
          </Body>
        </View>

        <Card>
          <Heading>{mode === 'sign-in' ? 'Sign in' : 'Create your account'}</Heading>

          <TextInput
            style={inputStyle}
            value={email}
            onChangeText={setEmail}
            placeholder="Email"
            placeholderTextColor={colors.textFaint}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            inputMode="email"
          />
          <TextInput
            style={inputStyle}
            value={password}
            onChangeText={setPassword}
            placeholder="Password"
            placeholderTextColor={colors.textFaint}
            autoCapitalize="none"
            secureTextEntry
            onSubmitEditing={submit}
          />

          {notice && <Caption colour="textSecondary">{notice}</Caption>}
          <ErrorNote error={error} />

          <Button
            title={mode === 'sign-in' ? 'Sign in' : 'Create account'}
            onPress={submit}
            loading={busy}
            disabled={!email.trim() || password.length === 0}
          />
          <Button
            title={mode === 'sign-in' ? 'No account yet? Create one' : 'Already have an account? Sign in'}
            variant="secondary"
            onPress={() => {
              setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in');
              setError(null);
              setNotice(null);
            }}
          />
        </Card>
      </Screen>
    </KeyboardAvoidingView>
  );
}

function SetupNeeded() {
  return (
    <Screen>
      <View style={styles.header}>
        <Title>Almost there</Title>
      </View>
      <Card>
        <Heading>Supabase is not configured</Heading>
        <Body colour="textSecondary">
          Copy `.env.example` to `.env`, paste your project URL and anon key, run
          `supabase/schema.sql` in the Supabase SQL editor, then restart the dev server.
        </Body>
        <Caption colour="textFaint">
          Env vars must be named EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY — Expo only
          exposes variables with the EXPO_PUBLIC_ prefix to the app.
        </Caption>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: { gap: Spacing.two, marginBottom: Spacing.five },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.medium,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 16,
    minHeight: 46,
  },
});
