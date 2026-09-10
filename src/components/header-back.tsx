import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { Body, Spacing, useTheme } from '@/components/ui';

/**
 * A back control that is always there.
 *
 * The stack's own back button only appears when there is history to pop, so
 * reloading the page on a subject or week — or opening its URL directly, which
 * is normal on the web build — left the screen with no way out. This falls back
 * to the parent screen when there is nothing to go back to.
 */
export function HeaderBack({ fallback }: { fallback: Href }) {
  const router = useRouter();
  const colors = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Back"
      hitSlop={12}
      onPress={() => (router.canGoBack() ? router.back() : router.replace(fallback))}
      style={({ pressed }) => [styles.button, { opacity: pressed ? 0.6 : 1 }]}>
      <Ionicons name="chevron-back" size={22} color={colors.tint} />
      <Body style={{ color: colors.tint }}>Back</Body>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.half,
    paddingRight: Spacing.three,
  },
});
