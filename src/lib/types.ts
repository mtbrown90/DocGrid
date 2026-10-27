export type ShiftKind = "clinic" | "on-call" | "time-off";

export const SHIFT_KINDS: { value: ShiftKind; label: string }[] = [
  { value: "clinic", label: "Clinic" },
  { value: "on-call", label: "On call" },
  { value: "time-off", label: "Time off" },
];

export interface Doctor {
  id: string;
  name: string;
  specialty: string;
  /** Index into the DOCTOR_COLORS palette. */
  color: number;
}

export interface Shift {
  id: string;
  doctorId: string;
  /** Local calendar date, YYYY-MM-DD. */
  date: string;
  /** 24h time, HH:MM. */
  start: string;
  end: string;
  kind: ShiftKind;
  location: string;
  notes: string;
}

export interface ScheduleData {
  doctors: Doctor[];
  shifts: Shift[];
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
