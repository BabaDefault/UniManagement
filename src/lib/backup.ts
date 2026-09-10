import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import { parseDatabase, serialiseDatabase, type Database } from './store';

/**
 * Backup and restore.
 *
 * With no server, this file is the only thing standing between a term of
 * self-assessment and a reinstalled app — and it doubles as the bridge between
 * your phone and your laptop, which now keep entirely separate databases.
 */

function backupName(now = new Date()): string {
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');

  return `semester-tracker-${stamp}.json`;
}

export type ExportResult = { name: string; shared: boolean };

export async function exportDatabase(db: Database): Promise<ExportResult> {
  const json = serialiseDatabase(db);
  const name = backupName();

  if (Platform.OS === 'web') {
    // The artifact sandbox blocks script-driven downloads, but a plain browser
    // does not; this is the only way to hand the file over without a server.
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = name;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);

    return { name, shared: true };
  }

  const file = new File(Paths.cache, name);
  if (file.exists) file.delete();
  file.create();
  file.write(json);

  if (!(await Sharing.isAvailableAsync())) {
    // Nothing to share to. The file still exists, so say where it went rather
    // than reporting a failure.
    return { name, shared: false };
  }

  await Sharing.shareAsync(file.uri, {
    mimeType: 'application/json',
    dialogTitle: 'Save your Semester Tracker backup',
    UTI: 'public.json',
  });

  return { name, shared: true };
}

export type PickedBackup = { name: string; database: Database };

/** Returns null when the picker was dismissed. Throws if the file is not a backup. */
export async function pickBackup(): Promise<PickedBackup | null> {
  const result = await DocumentPicker.getDocumentAsync({
    // Android file providers frequently report .json as octet-stream, so the
    // filter stays loose and the content is validated instead.
    type: ['application/json', 'text/plain', 'application/octet-stream', '*/*'],
    copyToCacheDirectory: true,
    multiple: false,
  });

  if (result.canceled || result.assets.length === 0) return null;

  const asset = result.assets[0];
  const text =
    Platform.OS === 'web' ? await (await fetch(asset.uri)).text() : await new File(asset.uri).text();

  return { name: asset.name, database: parseDatabase(text) };
}
