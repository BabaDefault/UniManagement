import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { Colors } from '@/constants/theme';

SplashScreen.preventAutoHideAsync();

/**
 * No persister and no auth: the device's own storage is the source of truth, so
 * React Query is only ever an in-memory cache over it. Persisting the cache as
 * well would give two copies of the same data that could disagree.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: Infinity,
      retry: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  },
});

export default function RootLayout() {
  const scheme = useColorScheme();

  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  const theme = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider value={theme}>
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.background },
            headerTintColor: colors.text,
            headerShadowVisible: false,
            contentStyle: { backgroundColor: colors.background },
          }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="subject/[id]" options={{ title: '' }} />
          <Stack.Screen name="subject/[id]/week/[week]" options={{ title: '' }} />
        </Stack>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
