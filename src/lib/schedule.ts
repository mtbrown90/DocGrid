import { useSyncExternalStore } from "react";
import { absMinutes, durationMinutes, shiftHours, trunc2 } from "./dates";
import type { Shift } from "./types";

function interval(s: Pick<Shift, "date" | "start" | "end">): [number, number] {
  const from = absMinutes(s.date, s.start);
  return [from, from + durationMinutes(s.start, s.end)];
}

/** Returns an existing shift that collides with `candidate` for the same doctor. */
export function findConflict(
  shifts: Shift[],
  candidate: Pick<Shift, "doctorId" | "date" | "start" | "end">,
  ignoreId?: string,
): Shift | undefined {
  const [cFrom, cTo] = interval(candidate);
  return shifts.find((s) => {
    if (s.id === ignoreId || s.doctorId !== candidate.doctorId) return false;
    const [from, to] = interval(s);
    return from < cTo && cFrom < to;
  });
}

/** Actual clock hours worked, truncated to 2 decimals. Time off counts as zero. */
export function rawHours(s: Pick<Shift, "kind" | "start" | "end">): number {
  return s.kind === "time-off" ? 0 : trunc2(shiftHours(s.start, s.end));
}

/** Exact raw hours times the shift's ratio, truncated to 2 decimals. */
export function ratioHours(s: Pick<Shift, "kind" | "start" | "end" | "ratio">): number {
  return s.kind === "time-off" ? 0 : trunc2(shiftHours(s.start, s.end) * s.ratio);
}

/** False during server render and hydration, true afterwards. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}
