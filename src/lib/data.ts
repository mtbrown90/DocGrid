import { createClient } from "@/lib/supabase/server";
import type { Doctor, ScheduleData, Shift, ShiftKind } from "./types";

// Postgres `time` comes back as "09:00:00"; the UI works in "09:00".
const hhmm = (t: string) => t.slice(0, 5);

export async function getScheduleData(): Promise<ScheduleData> {
  const supabase = await createClient();

  const [doctorsRes, shiftsRes] = await Promise.all([
    supabase.from("doctors").select("id, name, specialty, color").order("name"),
    supabase
      .from("shifts")
      .select("id, doctor_id, shift_date, start_time, end_time, kind, location, notes")
      .order("shift_date")
      .order("start_time"),
  ]);

  if (doctorsRes.error) throw new Error(`Could not load doctors: ${doctorsRes.error.message}`);
  if (shiftsRes.error) throw new Error(`Could not load shifts: ${shiftsRes.error.message}`);

  const doctors: Doctor[] = doctorsRes.data;
  const shifts: Shift[] = shiftsRes.data.map((r) => ({
    id: r.id,
    doctorId: r.doctor_id,
    date: r.shift_date,
    start: hhmm(r.start_time),
    end: hhmm(r.end_time),
    kind: r.kind as ShiftKind,
    location: r.location,
    notes: r.notes,
  }));

  return { doctors, shifts };
}
