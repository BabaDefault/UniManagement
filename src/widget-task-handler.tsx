import type { WidgetTaskHandlerProps } from 'react-native-android-widget';

import { loadWidgetSnapshot, snapshotToEvents } from '@/lib/widget-snapshot';
import { renderTimetableWidget } from '@/widgets/timetable-widget';

/**
 * Runs in a headless JS task whenever Android wants the widget redrawn — on
 * add, on resize, and on the periodic update (floored at 30 minutes by the OS).
 *
 * It reads only the local snapshot, so it never needs a session or a network.
 */
export async function widgetTaskHandler(props: WidgetTaskHandlerProps): Promise<void> {
  if (props.widgetAction === 'WIDGET_DELETED') return;

  // WIDGET_CLICK opens the app via the widget's clickAction; nothing to redraw.
  if (props.widgetAction === 'WIDGET_CLICK') return;

  const events = snapshotToEvents(await loadWidgetSnapshot());
  props.renderWidget(renderTimetableWidget(events, new Date()));
}
