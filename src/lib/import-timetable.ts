import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { Platform } from 'react-native';

/**
 * Getting the myUNSW feed into the app.
 *
 * Two paths, because the personal iCal link is served without CORS headers and
 * a browser will refuse to read it:
 *
 *   URL   — native fetch only (Android), no CORS to satisfy.
 *   File  — works everywhere, since the user hands the file over directly.
 *
 * The UI hides the URL option on web rather than letting it fail confusingly.
 */

export const canFetchUrl = Platform.OS !== 'web';

/** Calendar subscription links are handed out as webcal://, which fetch cannot use. */
export function normaliseFeedUrl(url: string): string {
  const trimmed = url.trim();
  if (trimmed.startsWith('webcal://')) return `https://${trimmed.slice('webcal://'.length)}`;
  if (trimmed.startsWith('http://')) return `https://${trimmed.slice('http://'.length)}`;
  return trimmed;
}

export function looksLikeCalendar(text: string): boolean {
  return text.includes('BEGIN:VCALENDAR');
}

export async function fetchFeed(url: string): Promise<string> {
  if (!canFetchUrl) {
    throw new Error('A browser cannot fetch the myUNSW link directly. Download the .ics file and use "Choose file".');
  }

  const response = await fetch(normaliseFeedUrl(url));
  if (!response.ok) {
    throw new Error(`myUNSW returned ${response.status}. Check the link, or download the .ics and import the file.`);
  }

  const text = await response.text();
  if (!looksLikeCalendar(text)) {
    throw new Error('That link did not return a calendar. Copy the "personal iCal link" from myUNSW → Class Timetable.');
  }

  return text;
}

export type PickedFile = { name: string; text: string } | null;

export async function pickFeedFile(): Promise<PickedFile> {
  const result = await DocumentPicker.getDocumentAsync({
    // Some Android file providers report .ics as octet-stream, so the filter is
    // deliberately loose and the content is validated instead.
    type: ['text/calendar', 'application/octet-stream', '*/*'],
    copyToCacheDirectory: true,
    multiple: false,
  });

  if (result.canceled || result.assets.length === 0) return null;

  const asset = result.assets[0];
  const text =
    Platform.OS === 'web' ? await (await fetch(asset.uri)).text() : await new File(asset.uri).text();

  if (!looksLikeCalendar(text)) {
    throw new Error(`"${asset.name}" is not an iCalendar file.`);
  }

  return { name: asset.name, text };
}
