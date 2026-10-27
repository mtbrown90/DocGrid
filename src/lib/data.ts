import { createClient } from "@/lib/supabase/server";
import type { ScheduleData, Shift, ShiftCategory, ShiftKind } from "./types";

// Postgres `time` comes back as "09:00:00"; the UI works in "09:00".
const hhmm = (t: string) => t.slice(0, 5);

export async function getScheduleData(): Promise<ScheduleData> {
  const supabase = await createClient();

  const [doctorsRes, shiftsRes, locationsRes, typesRes, prefsRes] = await Promise.all([
    supabase
      .from("doctors")
      .select("id, employee_id, name, specialty, color, phone, email, address, is_nocturnist, mdoc_location_id, can_aoc")
      .order("name"),
    supabase
      .from("shifts")
      .select(
        "id, doctor_id, shift_date, start_time, end_time, kind, category, shift_type_id, location_id, name, ratio, notes, generated",
      )
      .order("shift_date")
      .order("start_time"),
    supabase.from("locations").select("id, name").order("name"),
    supabase
      .from("shift_types")
      .select("id, name, location_id, start_time, end_time, ratio, is_night, category")
      .order("name"),
    supabase.from("doctor_location_prefs").select("doctor_id, location_id, percent"),
  ]);

  for (const [label, res] of [
    ["doctors", doctorsRes],
    ["shifts", shiftsRes],
    ["locations", locationsRes],
    ["shift types", typesRes],
    ["location preferences", prefsRes],
  ] as const) {
    if (res.error) throw new Error(`Could not load ${label}: ${res.error.message}`);
  }

  return {
    doctors: doctorsRes.data!.map((d) => ({
      id: d.id,
      employeeId: d.employee_id ?? "",
      name: d.name,
      specialty: d.specialty,
      color: d.color,
      phone: d.phone,
      email: d.email,
      address: d.address,
      isNocturnist: d.is_nocturnist,
      mdocLocationId: d.mdoc_location_id,
      canAoc: d.can_aoc,
    })),
    shifts: shiftsRes.data!.map((r) => ({
      id: r.id,
      doctorId: r.doctor_id,
      date: r.shift_date,
      start: hhmm(r.start_time),
      end: hhmm(r.end_time),
      kind: r.kind as ShiftKind,
      category: r.category as Shift["category"],
      shiftTypeId: r.shift_type_id,
      locationId: r.location_id,
      name: r.name,
      ratio: Number(r.ratio),
      notes: r.notes,
      generated: r.generated,
    })),
    locations: locationsRes.data!,
    shiftTypes: typesRes.data!.map((t) => ({
      id: t.id,
      name: t.name,
      locationId: t.location_id,
      start: hhmm(t.start_time),
      end: hhmm(t.end_time),
      ratio: Number(t.ratio),
      isNight: t.is_night,
      category: t.category as ShiftCategory,
    })),
    prefs: prefsRes.data!.map((p) => ({
      doctorId: p.doctor_id,
      locationId: p.location_id,
      percent: Number(p.percent),
    })),
  };
}
