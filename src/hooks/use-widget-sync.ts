import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';

import type { ClassEvent } from '@/lib/schedule';
import { syncWidget } from '@/lib/widget-bridge';

/**
 * Keeps the home screen widget in step with the app.
 *
 * Writes the snapshot the widget reads and asks Android to redraw now, rather
 * than waiting up to 30 minutes for the next scheduled update.
 *
 * Failures are reported through Settings → Widget rather than thrown: a broken
 * widget must never stop the app rendering, but it must also not vanish
 * silently the way it did when this swallowed errors.
 */
export function useWidgetSync(events: ClassEvent[]): void {
  useEffect(() => {
    if (Platform.OS !== 'android') return;

    let cancelled = false;

    function sync() {
      void syncWidget(events).then((result) => {
        if (!cancelled && !result.ok) console.warn('Widget sync:', result.detail);
      });
    }

    sync();

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') sync();
    });

    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, [events]);
}
