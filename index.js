// Custom entry point: expo-router's, plus the Android widget's headless task.
//
// The task handler must be registered at module scope so Android can invoke it
// when the app itself is not running — registering it inside a component would
// mean the widget only updates while the app is open.
import 'expo-router/entry';

import { Platform } from 'react-native';

if (Platform.OS === 'android') {
  try {
    const { registerWidgetTaskHandler } = require('react-native-android-widget');
    const { widgetTaskHandler } = require('./src/widget-task-handler');

    registerWidgetTaskHandler(widgetTaskHandler);
  } catch (error) {
    // Expo Go does not contain this library's native module, so requiring it
    // there throws and would take the whole app down at startup. The widget
    // simply does not exist in Expo Go; everything else should still run.
    console.warn(
      'Home screen widget unavailable — this build has no native widget module (expected in Expo Go).',
      error,
    );
  }
}
