"use client";

import { useSyncExternalStore } from "react";

/**
 * False during server render and hydration, true afterwards. Used to hold back
 * UI that depends on the browser's clock or time zone so it can't mismatch the
 * server-rendered HTML. Lives in its own client-only file so server code (the
 * Excel export, server actions) can import lib/schedule.ts without pulling in React.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}
