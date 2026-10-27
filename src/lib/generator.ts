import { absMinutes, addDays, durationMinutes, parseISO, shiftHours, toISO, trunc2 } from "./dates";
import { mayOverlap, ratioHours, rawHours } from "./schedule";
import type { Doctor, LocationPref, Shift, ShiftType } from "./types";

/**
 * Auto-generates a preliminary schedule for a date range.
 *
 * A "slot" is one shift type on one day, filled by one doctor (a shift listed
 * twice is two slots). Days are filled in order; within a day the scarcest slots
 * go first (AOC, MDOC, Call, regular nights, regular days). For each slot the
 * eligible doctor with the best score wins, where score favours doctors with
 * fewer hours so far and whose location preference percentages are furthest
 * below target.
 *
 * Hard rules, never broken:
 *  - Nocturnists only work night shifts.
 *  - MDOC only by doctors whose MDOC location is that shift's location.
 *  - AOC only by doctors who can be AOC. Anyone can cover Call.
 *  - Overlaps follow mayOverlap(): a regular shift may overlap MDOC, nothing else.
 *  - Time off is never scheduled over.
 *  - Minimum rest between regular/Call/AOC shifts (MDOC is exempt, it overlaps by design).
 *  - Optional cap on raw hours (regular + Call + AOC) for the range.
 */

export interface GenerateOptions {
  /** Inclusive range, YYYY-MM-DD. */
  from: string;
  to: string;
  /** Shift types to fill each day. */
  typeIds: string[];
  /** Minimum hours between the end of one shift and the start of the next. */
  restHours: number;
  /** Max raw hours per doctor in the range (regular + Call + AOC); null = no cap. */
  maxHours: number | null;
  /** How strongly to follow location preferences versus spreading hours evenly. */
  prefStrength: PrefStrength;
  /** Changes tie-breaking so "Regenerate" gives a different draft. */
  seed: number;
  /** Treat previously generated shifts in the range as empty slots. */
  replaceGenerated: boolean;
}

export interface Assignment {
  doctorId: string;
  date: string;
  shiftTypeId: string;
}

export interface UnfilledSlot {
  date: string;
  shiftTypeId: string;
  reason: string;
}

export interface DoctorStat {
  doctorId: string;
  /** Shifts in the range, all categories. */
  shifts: number;
  /** Raw and ratio hours for regular + Call + AOC shifts (MDOC is counted separately). */
  rawHours: number;
  ratioHours: number;
  mdocDays: number;
  aocShifts: number;
  /** Regular shifts per location id. */
  regularByLocation: Record<string, number>;
}

export interface GenerateResult {
  assignments: Assignment[];
  unfilled: UnfilledSlot[];
  /** Slots that needed filling (excludes ones already covered by kept shifts). */
  slotCount: number;
  stats: DoctorStat[];
}

interface Interval {
  from: number;
  to: number;
  category: Shift["category"];
}

interface DoctorState {
  doctor: Doctor;
  intervals: Interval[];
  hours: number;
  ratio: number;
  shifts: number;
  mdoc: number;
  aoc: number;
  regTotal: number;
  regByLoc: Map<string, number>;
}

const restRelevant = (c: Shift["category"]) => c === "regular" || c === "call" || c === "aoc";

/** Lower runs first: the scarcest slots get the pick of the doctors. */
function priority(t: ShiftType): number {
  if (t.category === "aoc") return 0;
  if (t.category === "mdoc") return 1;
  if (t.category === "call") return 2;
  return t.isNight ? 3 : 4;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * How hard the generator pulls toward doctors' location-preference percentages,
 * traded against spreading hours evenly. Weights are in "hours" so they compare
 * with the workload term. (Measured on 30-90 sample doctors: Low ~55pp off target,
 * Medium ~43pp, High ~34pp, with the spread of hours growing as strength rises.)
 */
export type PrefStrength = "low" | "medium" | "high";
export const PREF_STRENGTHS: { value: PrefStrength; label: string; weight: number }[] = [
  { value: "low", label: "Low (even workload first)", weight: 100 },
  { value: "medium", label: "Medium (balanced)", weight: 400 },
  { value: "high", label: "High (match preferences first)", weight: 1000 },
];

// Other score weights, in the same "hours" units.
const OFF_PREF_RATIO = 1.5; // working at a location the doctor gave 0% to costs this x the preference weight
const NON_NOCTURNIST_NIGHT_PENALTY = 80; // keep regular nights for nocturnists when possible
const REST_BONUS_PER_HOUR = 0.2; // slight preference for doctors who have been off longer
const JITTER = 2;

export function generateSchedule(
  doctors: Doctor[],
  existingShifts: Shift[],
  shiftTypes: ShiftType[],
  prefs: LocationPref[],
  options: GenerateOptions,
): GenerateResult {
  const { from, to, restHours, maxHours } = options;
  const restMin = restHours * 60;
  const rng = mulberry32(options.seed);
  const prefWeight = PREF_STRENGTHS.find((p) => p.value === options.prefStrength)?.weight ?? 400;
  const types = shiftTypes.filter((t) => options.typeIds.includes(t.id));

  // Shifts that stay as they are. Generated ones in the range are dropped when replacing.
  const kept = existingShifts.filter(
    (s) => !(options.replaceGenerated && s.generated && s.date >= from && s.date <= to),
  );

  const prefMap = new Map<string, Map<string, number>>();
  for (const p of prefs) {
    if (!prefMap.has(p.doctorId)) prefMap.set(p.doctorId, new Map());
    prefMap.get(p.doctorId)!.set(p.locationId, p.percent / 100);
  }

  const states = new Map<string, DoctorState>(
    doctors.map((d) => [
      d.id,
      { doctor: d, intervals: [], hours: 0, ratio: 0, shifts: 0, mdoc: 0, aoc: 0, regTotal: 0, regByLoc: new Map() },
    ]),
  );

  const countShift = (st: DoctorState, s: Pick<Shift, "category" | "locationId" | "kind" | "start" | "end" | "ratio">) => {
    st.shifts++;
    if (s.category === "mdoc") st.mdoc++;
    else {
      st.hours += rawHours(s);
      st.ratio += ratioHours(s);
      if (s.category === "aoc") st.aoc++;
    }
    if (s.category === "regular" && s.locationId) {
      st.regTotal++;
      st.regByLoc.set(s.locationId, (st.regByLoc.get(s.locationId) ?? 0) + 1);
    }
  };

  const filled = new Set<string>(); // "date|typeId" slots already covered
  for (const s of kept) {
    const st = states.get(s.doctorId);
    if (!st) continue;
    const start = absMinutes(s.date, s.start);
    st.intervals.push({ from: start, to: start + durationMinutes(s.start, s.end), category: s.category });
    if (s.kind === "work" && s.date >= from && s.date <= to) {
      countShift(st, s);
      if (s.shiftTypeId) filled.add(`${s.date}|${s.shiftTypeId}`);
    }
  }

  const baseEligible = (d: Doctor, t: ShiftType): boolean => {
    if (d.isNocturnist && !t.isNight) return false;
    if (t.category === "mdoc") return d.mdocLocationId !== null && d.mdocLocationId === t.locationId;
    if (t.category === "aoc") return d.canAoc;
    return true;
  };

  const isFree = (st: DoctorState, slotFrom: number, slotTo: number, category: Shift["category"]): boolean => {
    for (const iv of st.intervals) {
      const overlaps = iv.from < slotTo && slotFrom < iv.to;
      if (overlaps && !mayOverlap(iv.category, category)) return false;
      // Too close to another working shift (this also catches overlaps between rest-relevant shifts).
      if (restMin > 0 && restRelevant(iv.category) && restRelevant(category)) {
        if (slotFrom < iv.to + restMin && iv.from < slotTo + restMin) return false;
      }
    }
    return true;
  };

  const assignments: Assignment[] = [];
  const unfilled: UnfilledSlot[] = [];
  let slotCount = 0;

  const ordered = [...types].sort((a, b) => priority(a) - priority(b));

  for (let day = parseISO(from); toISO(day) <= to; day = addDays(day, 1)) {
    const date = toISO(day);
    for (const type of ordered) {
      if (filled.has(`${date}|${type.id}`)) continue;
      slotCount++;

      const slotFrom = absMinutes(date, type.start);
      const slotTo = slotFrom + durationMinutes(type.start, type.end);
      const slotHours = shiftHours(type.start, type.end);

      const candidates = doctors.filter((d) => baseEligible(d, type));
      let best: { st: DoctorState; score: number } | null = null;

      for (const d of candidates) {
        const st = states.get(d.id)!;
        if (!isFree(st, slotFrom, slotTo, type.category)) continue;
        if (type.category !== "mdoc" && maxHours !== null && st.hours + slotHours > maxHours) continue;

        let score = type.category === "mdoc" ? st.mdoc * 24 : st.hours + (type.category === "aoc" ? st.aoc * 24 : 0);

        // Location preference (regular shifts only, and only for doctors who set preferences).
        const myPrefs = prefMap.get(d.id);
        if (type.category === "regular" && type.locationId && myPrefs && myPrefs.size > 0) {
          const target = myPrefs.get(type.locationId) ?? 0;
          const share = st.regTotal > 0 ? (st.regByLoc.get(type.locationId) ?? 0) / st.regTotal : 0;
          score -= (target - share) * prefWeight;
          if (target === 0) score += prefWeight * OFF_PREF_RATIO;
        }

        if (type.isNight && type.category === "regular" && !d.isNocturnist) score += NON_NOCTURNIST_NIGHT_PENALTY;

        // Slightly prefer doctors who have been off longer.
        let lastEnd = -Infinity;
        for (const iv of st.intervals) if (restRelevant(iv.category) && iv.to <= slotFrom && iv.to > lastEnd) lastEnd = iv.to;
        if (lastEnd > -Infinity) score -= Math.min((slotFrom - lastEnd) / 60, 48) * REST_BONUS_PER_HOUR;

        score += rng() * JITTER;

        if (!best || score < best.score) best = { st, score };
      }

      if (!best) {
        unfilled.push({
          date,
          shiftTypeId: type.id,
          reason:
            candidates.length === 0
              ? type.category === "mdoc"
                ? "No doctor has this location set as their MDOC location."
                : type.category === "aoc"
                  ? "No doctor is marked as able to be AOC."
                  : "No eligible doctor (nocturnists only work night shifts)."
              : "Every eligible doctor is already working, in rest time, off, or at the hours cap.",
        });
        continue;
      }

      best.st.intervals.push({ from: slotFrom, to: slotTo, category: type.category });
      countShift(best.st, {
        category: type.category,
        locationId: type.locationId,
        kind: "work",
        start: type.start,
        end: type.end,
        ratio: type.ratio,
      });
      assignments.push({ doctorId: best.st.doctor.id, date, shiftTypeId: type.id });
    }
  }

  const stats: DoctorStat[] = doctors.map((d) => {
    const st = states.get(d.id)!;
    return {
      doctorId: d.id,
      shifts: st.shifts,
      rawHours: trunc2(st.hours),
      ratioHours: trunc2(st.ratio),
      mdocDays: st.mdoc,
      aocShifts: st.aoc,
      regularByLocation: Object.fromEntries(st.regByLoc),
    };
  });

  return { assignments, unfilled, slotCount, stats };
}
