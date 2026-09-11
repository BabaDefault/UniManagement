import { Platform } from 'react-native';

import type { ClassEvent } from './schedule';
import { loadWidgetSnapshot, saveWidgetSnapshot } from './widget-snapshot';

/**
 * The one place that talks to the home screen widget.
 *
 * Every call reports what happened instead of failing quietly. The widget
 * previously had empty catch blocks around it, so when it broke it produced a
 * blank rectangle and no signal anywhere — impossible to diagnose without a
 * USB cable and the Android SDK.
 */

/** Must match the widget `name` in app.json's react-native-android-widget config. */
export const WIDGET_NAME = 'Timetable';

export type WidgetResult = { ok: boolean; detail: string };

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Imported lazily and separately: both of these pull in the native widget
 * module at module scope, which does not exist on web or in Expo Go and throws
 * on import there.
 */
async function loadWidgetModules() {
  const [library, renderer] = await Promise.all([
    import('react-native-android-widget'),
    import('@/widgets/timetable-widget'),
  ]);
  return { library, renderer };
}

/** Write the snapshot the widget reads, then ask Android to redraw now. */
export async function syncWidget(events: readonly ClassEvent[]): Promise<WidgetResult> {
  if (Platform.OS !== 'android') {
    return { ok: false, detail: 'Home screen widgets are Android only.' };
  }

  try {
    await saveWidgetSnapshot(events);
  } catch (error) {
    return { ok: false, detail: `Could not save the widget data: ${message(error)}` };
  }

  let modules: Awaited<ReturnType<typeof loadWidgetModules>>;
  try {
    modules = await loadWidgetModules();
  } catch (error) {
    return {
      ok: false,
      detail: `The native widget module is missing from this build: ${message(error)}`,
    };
  }

  try {
    let drawn = 0;

    await modules.library.requestWidgetUpdate({
      widgetName: WIDGET_NAME,
      renderWidget: () => {
        drawn += 1;
        return modules.renderer.renderTimetableWidget([...events], new Date());
      },
      widgetNotFound: () => {},
    });

    return drawn > 0
      ? { ok: true, detail: `Redrew ${drawn} widget${drawn === 1 ? '' : 's'}.` }
      : { ok: true, detail: 'No widget on your home screen yet. Add one, then refresh.' };
  } catch (error) {
    return { ok: false, detail: `Drawing the widget failed: ${message(error)}` };
  }
}

/** A readable account of every step, for when the widget misbehaves. */
export async function widgetDiagnostics(): Promise<string[]> {
  const lines: string[] = [`Platform: ${Platform.OS}`];

  if (Platform.OS !== 'android') {
    lines.push('Widgets only exist on Android.');
    return lines;
  }

  try {
    const snapshot = await loadWidgetSnapshot();
    lines.push(
      snapshot === null
        ? 'Snapshot: none written yet'
        : `Snapshot: ${snapshot.classes.length} upcoming classes, saved ${new Date(snapshot.updatedAt).toLocaleString()}`,
    );
  } catch (error) {
    lines.push(`Snapshot: failed to read — ${message(error)}`);
  }

  try {
    const { library } = await loadWidgetModules();
    lines.push('Native module: loaded');

    try {
      const info = await library.getWidgetInfo(WIDGET_NAME);
      lines.push(`Widgets on home screen: ${info.length}`);
      info.forEach((w, i) => lines.push(`  #${i + 1} id ${w.widgetId}, ${w.width}x${w.height}dp`));
    } catch (error) {
      lines.push(`getWidgetInfo failed: ${message(error)}`);
    }
  } catch (error) {
    lines.push(`Native module: NOT AVAILABLE — ${message(error)}`);
  }

  return lines;
}
