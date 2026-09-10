import { useCallback, useState, type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet } from 'react-native';

import { Body, Button, Heading, Row, Spacing, useTheme } from '@/components/ui';
import { Radius } from '@/constants/theme';

/**
 * A confirmation dialog that actually works everywhere.
 *
 * React Native's `Alert.alert` is a no-op on web — react-native-web ships it as
 * an empty function — so every confirm-before-delete silently did nothing in
 * the browser, making the delete buttons look broken. This is a plain Modal,
 * which both platforms render, and it looks the same on each.
 */

export type ConfirmRequest = {
  title: string;
  message?: string;
  /** Defaults to "Delete". */
  confirmLabel?: string;
  onConfirm: () => void;
};

export function useConfirm(): { confirm: (request: ConfirmRequest) => void; dialog: ReactNode } {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);

  const confirm = useCallback((next: ConfirmRequest) => setRequest(next), []);

  const dialog = (
    <ConfirmDialog
      request={request}
      onDismiss={() => setRequest(null)}
      onConfirm={() => {
        request?.onConfirm();
        setRequest(null);
      }}
    />
  );

  return { confirm, dialog };
}

export function ConfirmDialog({
  request,
  onDismiss,
  onConfirm,
}: {
  request: ConfirmRequest | null;
  onDismiss: () => void;
  onConfirm: () => void;
}) {
  const colors = useTheme();

  return (
    <Modal visible={request !== null} transparent animationType="fade" onRequestClose={onDismiss}>
      <Pressable style={styles.backdrop} onPress={onDismiss}>
        {/* Swallows the press so tapping the card does not dismiss it. */}
        <Pressable
          style={[styles.card, { backgroundColor: colors.backgroundElement, borderColor: colors.border }]}
          onPress={() => {}}>
          <Heading>{request?.title}</Heading>
          {request?.message && <Body colour="textSecondary">{request.message}</Body>}

          <Row style={styles.actions}>
            <Button title="Cancel" variant="secondary" style={styles.action} onPress={onDismiss} />
            <Button
              title={request?.confirmLabel ?? 'Delete'}
              variant="danger"
              style={styles.action}
              onPress={onConfirm}
            />
          </Row>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: '#00000099',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  card: {
    borderRadius: Radius.large,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.four,
    gap: Spacing.three,
    alignSelf: 'center',
    width: '100%',
    maxWidth: 420,
  },
  actions: { gap: Spacing.three, marginTop: Spacing.two },
  action: { flex: 1 },
});
