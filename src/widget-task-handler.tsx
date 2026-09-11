import type { WidgetTaskHandlerProps } from 'react-native-android-widget';

import { loadWidgetSnapshot, snapshotToEvents } from '@/lib/widget-snapshot';
import { renderMessageWidget, renderTimetableWidget } from '@/widgets/timetable-widget';

/**
 * Runs in a headless JS task whenever Android wants the widget redrawn — on
 * add, on resize, and on the periodic update (floored at 30 minutes by the OS).
 *
 * It reads only the local snapshot, so it never needs a session or a network.
 *
 * Every path must call renderWidget exactly once. Returning without drawing
 * leaves an empty frame on the home screen that looks identical to the widget
 * being broken, so failures draw a message instead of nothing.
 */
export async function widgetTaskHandler(props: WidgetTaskHandlerProps): Promise<void> {
  // Nothing to draw into, and the click is handled natively by OPEN_APP.
  if (props.widgetAction === 'WIDGET_DELETED' || props.widgetAction === 'WIDGET_CLICK') return;

  try {
    const snapshot = await loadWidgetSnapshot();

    if (snapshot === null) {
      props.renderWidget(renderMessageWidget('Open the app once to set up the widget'));
      return;
    }

    props.renderWidget(renderTimetableWidget(snapshotToEvents(snapshot), new Date()));
  } catch (error) {
    props.renderWidget(renderMessageWidget('Could not load your timetable — open the app'));
    console.warn('Widget render failed', error);
  }
}
