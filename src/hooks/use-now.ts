import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

/**
 * A clock that ticks on an interval and re-reads immediately when the app comes
 * back to the foreground — otherwise "next class in 20 min" stays frozen at
 * whatever it said when the phone was locked.
 */
export function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), intervalMs);

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') setNow(new Date());
    });

    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, [intervalMs]);

  return now;
}
