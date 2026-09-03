// Custom entry point: expo-router's, plus the Android widget's headless task.
//
// The task handler must be registered at module scope so Android can invoke it
// when the app itself is not running — registering it inside a component would
// mean the widget only updates while the app is open.
import 'expo-router/entry';

import { Platform } from 'react-native';

if (Platform.OS === 'android') {
  const { registerWidgetTaskHandler } = require('react-native-android-widget');
  const { widgetTaskHandler } = require('./src/widget-task-handler');

  registerWidgetTaskHandler(widgetTaskHandler);
}
