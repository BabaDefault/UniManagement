import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';

import type { ClassEvent } from '@/lib/schedule';
import { saveWidgetSnapshot } from '@/lib/widget-snapshot';

/**
 * Keeps the home screen widget in step with the app.
 *
 * Writes the local snapshot the widget reads, then asks Android to redraw now
 * rather than waiting up to 30 minutes for the next scheduled update — so an
 * import or a timetable change shows on the home screen immediately.
 *
 * The widget module is imported lazily inside the Android branch: it is a
 * native module, and pulling it into the web bundle would break the laptop build.
 */
export function useWidgetSync(events: ClassEvent[]): void {
  useEffect(() => {
    if (Platform.OS !== 'android') return;

    let cancelled = false;

    async function sync() {
      try {
        await saveWidgetSnapshot(events);
        if (cancelled) return;

        const { requestWidgetUpdate } = await import('react-native-android-widget');
        const { renderTimetableWidget } = await import('@/widgets/timetable-widget');

        await requestWidgetUpdate({
          widgetName: 'Timetable',
          renderWidget: () => renderTimetableWidget(events, new Date()),
          // Nothing to do if the widget is not on the home screen.
          widgetNotFound: () => {},
        });
      } catch {
        // A widget failure must never take the app down with it.
      }
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
