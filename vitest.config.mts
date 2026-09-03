import { defineConfig } from 'vitest/config';

/**
 * Tests cover `src/lib` only — the pure domain logic (term weeks, progress
 * rollups, bulk paste, iCal parsing). That is where a silent bug costs a term
 * of tracking data, and it runs without any React Native test harness.
 */
export default defineConfig({
  test: {
    include: ['src/lib/**/*.test.ts'],
    environment: 'node',
    // Pinned so the daylight-saving cases are actually exercised. Sydney moves
    // to AEDT on the first Sunday of October, mid-way through UNSW T3 — the
    // exact window where week numbering can drift by a day.
    env: { TZ: 'Australia/Sydney' },
  },
});
