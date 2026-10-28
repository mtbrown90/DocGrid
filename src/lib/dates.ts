/** Date helpers. Dates are local calendar days stored as YYYY-MM-DD strings. */

const pad = (n: number) => String(n).padStart(2, "0");

export function toISO(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseISO(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(d: Date, n: number): Date {
  const next = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  next.setDate(next.getDate() + n);
  return next;
}

/** Monday of the week containing `d`. */
export function startOfWeek(d: Date): Date {
  const offset = (d.getDay() + 6) % 7;
  return addDays(d, -offset);
}

export function weekDays(weekStart: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

export function fmtWeekday(d: Date): string {
  return d.toLocaleDateString("en-US", { weekday: "short" });
}

export function fmtMonthDay(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function fmtWeekRange(weekStart: Date): string {
  const end = addDays(weekStart, 6);
  const sameYear = weekStart.getFullYear() === end.getFullYear();
  const startLabel = weekStart.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: sameYear ? undefined : "numeric",
  });
  const endLabel = end.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return `${startLabel} – ${endLabel}`;
}

export function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

/** "13:30" -> "1:30 PM" */
export function fmtTime(t: string): string {
  const [h, m] = t.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${pad(m)} ${suffix}`;
}

export function fmtTimeRange(start: string, end: string): string {
  return `${fmtTime(start)}–${fmtTime(end)}`;
}

/** Compact time for tight spaces: "07:00" -> "7a", "19:30" -> "7:30p". */
export function fmtTimeShort(t: string): string {
  const [h, m] = t.split(":").map(Number);
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}${m ? `:${pad(m)}` : ""}${h >= 12 ? "p" : "a"}`;
}

export function fmtTimeRangeShort(start: string, end: string): string {
  return `${fmtTimeShort(start)}–${fmtTimeShort(end)}`;
}

export function fmtMonthYear(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

/** Length of a shift in minutes; end <= start means it ends the next day. */
export function durationMinutes(start: string, end: string): number {
  const s = timeToMinutes(start);
  const e = timeToMinutes(end);
  return e > s ? e - s : e + 1440 - s;
}

export function shiftHours(start: string, end: string): number {
  return durationMinutes(start, end) / 60;
}

/** Minutes since the Unix epoch for a local date + time, ignoring DST shifts. */
export function absMinutes(date: string, time: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 60000 + timeToMinutes(time);
}

/** A ratio multiplier, up to 5 decimals, no trailing zeros: 0.92345 -> "0.92345", 1.5 -> "1.5". */
export function fmtRatio(r: number): string {
  return String(Math.round(r * 100000) / 100000);
}

/**
 * Truncates (never rounds) to 2 decimals: 7.3876 -> 7.38, 7.389 -> 7.38.
 * The tiny epsilon stops float noise from dropping a cent, e.g. 4.35 * 100 = 434.99999999999994.
 */
export function trunc2(n: number): number {
  return Math.trunc(n * 100 + 1e-9) / 100;
}

/** Hours for display: truncated to 2 decimals, no trailing zeros ("12", "13.5", "7.38"). */
export function fmtHours(h: number): string {
  return String(trunc2(h));
}
