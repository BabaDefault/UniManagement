// Custom entry point: the Android widget's headless task, then expo-router's app.
//
// Order matters. Android runs this same bundle to draw the widget, with no
// Activity and often with the app not running at all. If booting the router
// throws or stalls in that context, anything after it never executes — so the
// task handler is registered FIRST, before the app is started.
//
// `require` rather than `import` for the router entry precisely because ES
// imports are hoisted: written as an import it would run before this block no
// matter where it sat in the file.
import { Platform } from 'react-native';

if (Platform.OS === 'android') {
  try {
    const { registerWidgetTaskHandler } = require('react-native-android-widget');
    const { widgetTaskHandler } = require('./src/widget-task-handler');

    registerWidgetTaskHandler(widgetTaskHandler);
  } catch (error) {
    // Expo Go has no native widget module, so requiring it there throws and
    // would take the whole app down at startup. The widget simply does not
    // exist in Expo Go; everything else should still run.
    console.warn('Home screen widget unavailable — no native widget module in this build.', error);
  }
}

require('expo-router/entry');
