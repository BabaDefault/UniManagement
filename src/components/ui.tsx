import { type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, MaxContentWidth, Radius, Spacing, type ThemeColors } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatPercent, summaryStatus, type Summary } from '@/lib/progress';
import { STATUS_COLOR, STATUS_EMOJI, STATUS_LABEL, type Status } from '@/lib/status';

export { useTheme };

// ------------------------------------------------------------------- layout

export function Screen({
  children,
  scroll = true,
  refreshControl,
  /**
   * Pass false on screens rendered under a navigation header — the header has
   * already consumed the top inset, and adding it again double-pads the top.
   */
  insetTop = true,
}: {
  children: ReactNode;
  scroll?: boolean;
  refreshControl?: React.ComponentProps<typeof ScrollView>['refreshControl'];
  insetTop?: boolean;
}) {
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const padding = {
    paddingTop: (insetTop ? insets.top : 0) + Spacing.four,
    paddingBottom: insets.bottom + Spacing.seven,
    paddingHorizontal: Spacing.four,
  };

  if (!scroll) {
    return <View style={[styles.screen, { backgroundColor: colors.background }, padding]}>{children}</View>;
  }

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[styles.scrollContent, padding]}
      keyboardShouldPersistTaps="handled"
      refreshControl={refreshControl}>
      <View style={styles.contentWidth}>{children}</View>
    </ScrollView>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const colors = useTheme();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.backgroundElement, borderColor: colors.border },
        style,
      ]}>
      {children}
    </View>
  );
}

export function Row({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.row, style]}>{children}</View>;
}

export function Divider() {
  const colors = useTheme();
  return <View style={[styles.divider, { backgroundColor: colors.border }]} />;
}

// --------------------------------------------------------------------- text

type TextProps = {
  children: ReactNode;
  colour?: keyof ThemeColors;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
};

export function Title({ children, style }: TextProps) {
  const colors = useTheme();
  return <Text style={[styles.title, { color: colors.text }, style]}>{children}</Text>;
}

export function Heading({ children, style }: TextProps) {
  const colors = useTheme();
  return <Text style={[styles.heading, { color: colors.text }, style]}>{children}</Text>;
}

export function Label({ children, style }: TextProps) {
  const colors = useTheme();
  return <Text style={[styles.label, { color: colors.textFaint }, style]}>{children}</Text>;
}

export function Body({ children, colour = 'text', style, numberOfLines }: TextProps) {
  const colors = useTheme();
  return (
    <Text numberOfLines={numberOfLines} style={[styles.body, { color: colors[colour] }, style]}>
      {children}
    </Text>
  );
}

export function Caption({ children, colour = 'textSecondary', style, numberOfLines }: TextProps) {
  const colors = useTheme();
  return (
    <Text numberOfLines={numberOfLines} style={[styles.caption, { color: colors[colour] }, style]}>
      {children}
    </Text>
  );
}

// ------------------------------------------------------------------ controls

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const colors = useTheme();

  const background =
    variant === 'primary' ? colors.tint : variant === 'danger' ? 'transparent' : colors.backgroundSelected;
  const textColour = variant === 'primary' ? '#FFFFFF' : variant === 'danger' ? colors.danger : colors.text;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: background,
          borderColor: variant === 'danger' ? colors.border : 'transparent',
          borderWidth: variant === 'danger' ? StyleSheet.hairlineWidth : 0,
          opacity: disabled ? 0.45 : pressed ? 0.75 : 1,
        },
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={textColour} size="small" />
      ) : (
        <Text style={[styles.buttonText, { color: textColour }]}>{title}</Text>
      )}
    </Pressable>
  );
}

// ------------------------------------------------------------------- status

export function StatusDot({ status, size = 12 }: { status: Status; size?: number }) {
  return (
    <View
      accessibilityLabel={STATUS_LABEL[status]}
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: STATUS_COLOR[status] }}
    />
  );
}

export function StatusPill({ status }: { status: Status }) {
  return (
    <View style={[styles.pill, { backgroundColor: `${STATUS_COLOR[status]}22` }]}>
      <StatusDot status={status} size={8} />
      <Text style={[styles.pillText, { color: STATUS_COLOR[status] }]}>{STATUS_EMOJI[status]}</Text>
    </View>
  );
}

/**
 * A summary bar. An unset summary renders as a hollow track rather than an empty
 * bar, so "no topics yet" never reads as "0% mastered".
 */
export function ProgressBar({ summary, height = 8 }: { summary: Summary; height?: number }) {
  const colors = useTheme();
  const status = summaryStatus(summary.fraction);

  return (
    <View style={[styles.track, { backgroundColor: colors.backgroundSelected, height, borderRadius: height / 2 }]}>
      {summary.fraction !== null && status && (
        <View
          style={{
            width: `${Math.max(summary.fraction * 100, summary.fraction > 0 ? 3 : 0)}%`,
            height: '100%',
            borderRadius: height / 2,
            backgroundColor: STATUS_COLOR[status],
          }}
        />
      )}
    </View>
  );
}

export function SummaryLine({ summary }: { summary: Summary }) {
  if (summary.total === 0) return <Caption colour="textFaint">No topics yet</Caption>;

  const parts = [`${formatPercent(summary.fraction)}`];
  if (summary.byStatus.red > 0) parts.push(`${STATUS_EMOJI.red} ${summary.byStatus.red}`);
  if (summary.byStatus.yellow > 0) parts.push(`${STATUS_EMOJI.yellow} ${summary.byStatus.yellow}`);
  if (summary.weak === 0) parts.push('all solid');

  return <Caption>{parts.join('  ·  ')}</Caption>;
}

// -------------------------------------------------------------------- states

export function EmptyState({ title, detail, action }: { title: string; detail?: string; action?: ReactNode }) {
  return (
    <Card style={styles.empty}>
      <Body colour="textSecondary" style={styles.emptyTitle}>
        {title}
      </Body>
      {detail && <Caption colour="textFaint" style={styles.emptyDetail}>{detail}</Caption>}
      {action}
    </Card>
  );
}

export function Loading({ label }: { label?: string }) {
  const colors = useTheme();
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={colors.textFaint} />
      {label && <Caption colour="textFaint" style={{ marginTop: Spacing.three }}>{label}</Caption>}
    </View>
  );
}

export function ErrorNote({ error }: { error: unknown }) {
  const colors = useTheme();
  if (!error) return null;
  const message = error instanceof Error ? error.message : String(error);

  return (
    <View style={[styles.errorNote, { borderColor: colors.danger }]}>
      <Caption colour="danger">{message}</Caption>
    </View>
  );
}

export { Colors, Radius, Spacing };

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scrollContent: { alignItems: 'center' },
  contentWidth: { width: '100%', maxWidth: MaxContentWidth },
  card: {
    borderRadius: Radius.large,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  divider: { height: StyleSheet.hairlineWidth, width: '100%' },
  title: { fontSize: 28, fontWeight: '700', letterSpacing: -0.5 },
  heading: { fontSize: 18, fontWeight: '600', letterSpacing: -0.2 },
  label: { fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  body: { fontSize: 15, lineHeight: 21 },
  caption: { fontSize: 13, lineHeight: 18 },
  button: {
    borderRadius: Radius.medium,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.four,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  buttonText: { fontSize: 15, fontWeight: '600' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
    borderRadius: Radius.small,
  },
  pillText: { fontSize: 11, fontWeight: '700' },
  track: { width: '100%', overflow: 'hidden' },
  empty: { alignItems: 'center', paddingVertical: Spacing.five },
  emptyTitle: { textAlign: 'center' },
  emptyDetail: { textAlign: 'center' },
  loading: { paddingVertical: Spacing.seven, alignItems: 'center' },
  errorNote: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.medium,
    padding: Spacing.three,
  },
});
