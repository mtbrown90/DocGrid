export type ShiftKind = "work" | "time-off";

/**
 * What a shift type is. Regular shifts (Day, Night...) belong to a location;
 * Call and AOC cover all locations; MDOC is a 24-hour shift per location that a
 * doctor can work regular shifts during.
 */
export type ShiftCategory = "regular" | "call" | "aoc" | "mdoc";

export const SHIFT_CATEGORIES: { value: ShiftCategory; label: string }[] = [
  { value: "regular", label: "Regular" },
  { value: "call", label: "Call" },
  { value: "aoc", label: "AOC" },
  { value: "mdoc", label: "MDOC" },
];

export const categoryLabel = (c: ShiftCategory | "time-off") =>
  c === "time-off" ? "Time off" : (SHIFT_CATEGORIES.find((x) => x.value === c)?.label ?? c);

export interface Location {
  id: string;
  name: string;
}

/** A reusable named shift at a location. end <= start means it runs overnight. */
export interface ShiftType {
  id: string;
  name: string;
  /** Null means "all locations"; only allowed for Call and AOC shifts. */
  locationId: string | null;
  /** Same start and end time means a full 24 hours. */
  start: string;
  end: string;
  /** Multiplier applied to raw hours to get ratio hours. */
  ratio: number;
  isNight: boolean;
  category: ShiftCategory;
}

export interface Doctor {
  id: string;
  /** Staff-assigned ID, unique across doctors. */
  employeeId: string;
  name: string;
  specialty: string;
  /** Index into the DOCTOR_COLORS palette. */
  color: number;
  phone: string;
  email: string;
  address: string;
  isNocturnist: boolean;
  /** The one location this doctor can be MDOC for; null if they are never MDOC. */
  mdocLocationId: string | null;
  /** Whether this doctor can be scheduled as AOC. (Any doctor can cover Call.) */
  canAoc: boolean;
}

export interface Shift {
  id: string;
  doctorId: string;
  /** Local calendar date the shift starts on, YYYY-MM-DD. */
  date: string;
  /** 24h time, HH:MM. If end <= start the shift ends the next day. */
  start: string;
  end: string;
  kind: ShiftKind;
  /** Copied from the shift type when scheduled; "time-off" for time off. */
  category: ShiftCategory | "time-off";
  /** Null for time off, or when the shift type was later deleted. */
  shiftTypeId: string | null;
  locationId: string | null;
  /** Copied from the shift type when scheduled, so later edits don't rewrite history. */
  name: string;
  ratio: number;
  notes: string;
  /** Created by the auto-generator and not edited by hand since. */
  generated: boolean;
}

/** A doctor's preferred share (0-100) of their shifts at one location. */
export interface LocationPref {
  doctorId: string;
  locationId: string;
  percent: number;
}

export interface ScheduleData {
  doctors: Doctor[];
  shifts: Shift[];
  locations: Location[];
  shiftTypes: ShiftType[];
  prefs: LocationPref[];
}

// Static class names so Tailwind can see them at build time.
export const DOCTOR_COLORS = [
  { chip: "bg-sky-100 text-sky-900 border-sky-300 dark:bg-sky-950 dark:text-sky-100 dark:border-sky-800", dot: "bg-sky-500" },
  { chip: "bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-100 dark:border-emerald-800", dot: "bg-emerald-500" },
  { chip: "bg-violet-100 text-violet-900 border-violet-300 dark:bg-violet-950 dark:text-violet-100 dark:border-violet-800", dot: "bg-violet-500" },
  { chip: "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950 dark:text-amber-100 dark:border-amber-800", dot: "bg-amber-500" },
  { chip: "bg-rose-100 text-rose-900 border-rose-300 dark:bg-rose-950 dark:text-rose-100 dark:border-rose-800", dot: "bg-rose-500" },
  { chip: "bg-teal-100 text-teal-900 border-teal-300 dark:bg-teal-950 dark:text-teal-100 dark:border-teal-800", dot: "bg-teal-500" },
] as const;
