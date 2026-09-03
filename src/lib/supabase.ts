import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

import type { Database } from './db-types';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

/**
 * False until `.env` is filled in. The app renders a setup screen rather than
 * crashing on a null client, so a fresh clone is diagnosable instead of blank.
 */
export const isSupabaseConfigured = Boolean(url && anonKey);

export const supabase: SupabaseClient<Database> = createClient<Database>(
  url ?? 'https://unconfigured.supabase.co',
  anonKey ?? 'unconfigured',
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      // Only the web build can receive a session in the URL fragment; leaving
      // this on in React Native makes the client wait on a URL that never comes.
      detectSessionInUrl: Platform.OS === 'web',
    },
  },
);
