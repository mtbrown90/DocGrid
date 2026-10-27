import { useSyncExternalStore } from "react";
import { rangesOverlap } from "./dates";
import type { Shift } from "./types";

/** Returns an existing shift that collides with `candidate` for the same doctor. */
export function findConflict(
  shifts: Shift[],
  candidate: Pick<Shift, "doctorId" | "date" | "start" | "end">,
  ignoreId?: string,
): Shift | undefined {
  return shifts.find(
    (s) =>
      s.id !== ignoreId &&
      s.doctorId === candidate.doctorId &&
      s.date === candidate.date &&
      rangesOverlap(s.start, s.end, candidate.start, candidate.end),
  );
}

/** False during server render and hydration, true afterwards. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}
