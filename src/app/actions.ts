"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { parseDoctorWorkbook, type ParsedDoctor } from "@/lib/excel";
import { createClient } from "@/lib/supabase/server";
import type { Doctor, Shift, ShiftType } from "@/lib/types";

export type ActionResult = { error?: string };

type ShiftDraft = Omit<Shift, "id" | "generated">;
export type DoctorInput = Omit<Doctor, "id" | "color">;
export type ShiftTypeInput = Omit<ShiftType, "id">;

function fail(error: { code?: string; message: string }): ActionResult {
  switch (error.code) {
    case "23P01": // exclusion_violation from shifts_no_overlap
      return { error: "That overlaps another shift for this doctor." };
    case "23505": // unique_violation
      return { error: "That ID or name is already in use." };
    case "23503": // foreign_key_violation
    case "23001": // restrict_violation
      return { error: "This is still in use. Remove the things that use it first." };
    default:
      return { error: error.message };
  }
}

function done(): ActionResult {
  revalidatePath("/", "layout");
  return {};
}

// Shifts ----------------------------------------------------------------------

const shiftRow = (s: ShiftDraft) => ({
  doctor_id: s.doctorId,
  shift_date: s.date,
  start_time: s.start,
  end_time: s.end,
  kind: s.kind,
  category: s.category,
  shift_type_id: s.shiftTypeId,
  location_id: s.locationId,
  name: s.name,
  ratio: s.ratio,
  notes: s.notes,
});

export async function addShifts(drafts: ShiftDraft[]): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("shifts").insert(drafts.map(shiftRow));
  return error ? fail(error) : done();
}

export async function updateShift(id: string, draft: ShiftDraft): Promise<ActionResult> {
  const supabase = await createClient();
  // Editing a generated shift by hand "locks" it: it is no longer replaced by a regeneration.
  const { error } = await supabase.from("shifts").update({ ...shiftRow(draft), generated: false }).eq("id", id);
  return error ? fail(error) : done();
}

export async function removeShift(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("shifts").delete().eq("id", id);
  return error ? fail(error) : done();
}

// Auto-generated schedules ------------------------------------------------------

export type GeneratedAssignment = { doctorId: string; date: string; shiftTypeId: string };
export type SaveGeneratedResult = ActionResult & { saved?: number };

const ISO_DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const MAX_GENERATED = 5000;

/**
 * Saves a generated draft all-or-nothing. Only ids go over the wire; the name,
 * times, ratio and category are read from the shift types here, so the client
 * can't hand us different numbers. With `replace`, previously generated shifts
 * in the range are removed in the same transaction.
 */
export async function saveGeneratedSchedule(
  from: string,
  to: string,
  assignments: GeneratedAssignment[],
  replace: boolean,
): Promise<SaveGeneratedResult> {
  if (!ISO_DATE.test(from) || !ISO_DATE.test(to) || from > to) return { error: "Invalid date range." };
  if (assignments.length > MAX_GENERATED) return { error: `Too many shifts in one save (limit ${MAX_GENERATED}).` };
  if (assignments.some((a) => !ISO_DATE.test(a.date) || a.date < from || a.date > to)) {
    return { error: "A shift falls outside the date range." };
  }

  const supabase = await createClient();
  const typeIds = [...new Set(assignments.map((a) => a.shiftTypeId))];
  const { data: types, error: typeError } = typeIds.length
    ? await supabase.from("shift_types").select("id, name, location_id, start_time, end_time, ratio, category").in("id", typeIds)
    : { data: [], error: null };
  if (typeError) return fail(typeError);
  const byId = new Map(types!.map((t) => [t.id as string, t]));

  const rows = [];
  for (const a of assignments) {
    const t = byId.get(a.shiftTypeId);
    if (!t) return { error: "A shift type used by this draft no longer exists. Generate again." };
    rows.push({
      doctor_id: a.doctorId,
      shift_date: a.date,
      start_time: t.start_time,
      end_time: t.end_time,
      category: t.category,
      shift_type_id: t.id,
      location_id: t.location_id,
      name: t.name,
      ratio: t.ratio,
    });
  }

  const { data, error } = await supabase.rpc("replace_generated_shifts", {
    p_from: from,
    p_to: to,
    p_replace: replace,
    p_rows: rows,
  });
  if (error) {
    if (error.code === "PGRST202") return { error: "The database is missing migration 0009. Run it in the Supabase SQL editor first." };
    if (error.code === "23P01") {
      return { error: "The schedule changed since you generated this draft and a shift now conflicts. Nothing was saved. Generate again." };
    }
    return fail(error);
  }
  revalidatePath("/", "layout");
  return { saved: Number(data) };
}

/** Deletes shifts created by the generator in the range. Shifts entered or edited by hand are kept. */
export async function deleteGeneratedShifts(from: string, to: string): Promise<SaveGeneratedResult> {
  if (!ISO_DATE.test(from) || !ISO_DATE.test(to) || from > to) return { error: "Invalid date range." };
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("shifts")
    .delete({ count: "exact" })
    .eq("generated", true)
    .gte("shift_date", from)
    .lte("shift_date", to);
  if (error) return fail(error);
  revalidatePath("/", "layout");
  return { saved: count ?? 0 };
}

// Doctors ---------------------------------------------------------------------

const doctorRow = (d: DoctorInput) => ({
  employee_id: d.employeeId.trim() || null,
  name: d.name.trim(),
  specialty: d.specialty.trim() || "General",
  phone: d.phone.trim(),
  email: d.email.trim(),
  address: d.address.trim(),
  is_nocturnist: d.isNocturnist,
  mdoc_location_id: d.mdocLocationId,
  can_aoc: d.canAoc,
});

/** Location id -> percent. Zero or missing means no preference for that location. */
export type PrefInput = Record<string, number>;

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function replacePrefs(supabase: Supabase, doctorId: string, prefs: PrefInput) {
  const { error: delError } = await supabase.from("doctor_location_prefs").delete().eq("doctor_id", doctorId);
  if (delError) return delError;
  const rows = Object.entries(prefs)
    .filter(([, percent]) => percent > 0)
    .map(([location_id, percent]) => ({ doctor_id: doctorId, location_id, percent }));
  if (rows.length === 0) return null;
  const { error } = await supabase.from("doctor_location_prefs").insert(rows);
  return error;
}

function prefsProblem(prefs: PrefInput): string | null {
  const values = Object.values(prefs).filter((p) => p > 0);
  if (values.some((p) => p > 100)) return "A location percentage can't be more than 100.";
  const total = values.reduce((a, b) => a + b, 0);
  return values.length > 0 && Math.abs(total - 100) > 0.01
    ? `Location percentages add up to ${Math.round(total * 100) / 100}, not 100.`
    : null;
}

export async function addDoctor(input: DoctorInput, prefs: PrefInput): Promise<ActionResult> {
  const problem = prefsProblem(prefs);
  if (problem) return { error: problem };

  const supabase = await createClient();
  const { count, error: countError } = await supabase
    .from("doctors")
    .select("id", { count: "exact", head: true });
  if (countError) return fail(countError);

  const { data, error } = await supabase
    .from("doctors")
    .insert({ ...doctorRow(input), color: (count ?? 0) % 6 })
    .select("id")
    .single();
  if (error) return fail(error);

  const prefError = await replacePrefs(supabase, data.id, prefs);
  return prefError ? fail(prefError) : done();
}

export async function updateDoctor(id: string, input: DoctorInput, prefs: PrefInput): Promise<ActionResult> {
  const problem = prefsProblem(prefs);
  if (problem) return { error: problem };

  const supabase = await createClient();
  const { error } = await supabase.from("doctors").update(doctorRow(input)).eq("id", id);
  if (error) return fail(error);

  const prefError = await replacePrefs(supabase, id, prefs);
  return prefError ? fail(prefError) : done();
}

// Excel import ------------------------------------------------------------------

export type ImportResult = {
  /** A single problem with the request or the file as a whole. */
  error?: string;
  /** Per-row problems; when present, nothing was imported. */
  errors?: string[];
  summary?: { created: number; updated: number; locationsCreated: number };
};

const MAX_UPLOAD_BYTES = 1_000_000;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export async function importDoctors(formData: FormData): Promise<ImportResult> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose an .xlsx file first." };
  if (!file.name.toLowerCase().endsWith(".xlsx")) {
    return { error: "Only .xlsx files are supported. In Excel, use Save As → Excel Workbook." };
  }
  if (file.size > MAX_UPLOAD_BYTES) return { error: "That file is too large (limit 1 MB)." };

  let parsed;
  try {
    parsed = await parseDoctorWorkbook(await file.arrayBuffer());
  } catch {
    return { error: "Couldn't read that file. Is it a valid .xlsx workbook?" };
  }
  if (parsed.errors.length > 0) return { errors: parsed.errors };

  const supabase = await createClient();

  // 1. Locations: create any the file mentions that don't exist yet.
  const { data: existingLocations, error: locError } = await supabase.from("locations").select("id, name");
  if (locError) return { error: locError.message };
  const locationIds = new Map(existingLocations.map((l) => [l.name.toLowerCase(), l.id as string]));

  // MDOC locations must name a location that exists or is listed in the file;
  // a typo should be reported, not silently create a new location.
  const known = new Set([...locationIds.keys(), ...parsed.locations.map((n) => n.toLowerCase())]);
  const unknown = parsed.doctors
    .filter((d) => d.mdocLocation && !known.has(d.mdocLocation.toLowerCase()))
    .map((d) => `Doctor ${d.employeeId}: MDOC Location "${d.mdocLocation}" is not a known location.`);
  if (unknown.length > 0) return { errors: unknown };

  const missing = parsed.locations.filter((n) => !locationIds.has(n.toLowerCase()));
  if (missing.length > 0) {
    const { data: created, error } = await supabase.from("locations").insert(missing.map((name) => ({ name }))).select("id, name");
    if (error) return { error: error.message };
    for (const l of created) locationIds.set(l.name.toLowerCase(), l.id);
  }

  // 2. Doctors: update the ones whose ID already exists, insert the rest.
  const { data: existingDoctors, error: docError } = await supabase.from("doctors").select("id, employee_id");
  if (docError) return { error: docError.message };
  const doctorIds = new Map(
    existingDoctors.filter((d) => d.employee_id).map((d) => [String(d.employee_id).toLowerCase(), d.id as string]),
  );

  let nextColor = existingDoctors.length;
  const toInsert: { parsed: ParsedDoctor; row: ReturnType<typeof doctorRow> & { color: number } }[] = [];
  let updated = 0;
  const finalIds = new Map<string, string>(); // lowercase employee id -> doctor uuid

  for (const d of parsed.doctors) {
    const row = doctorRow({
      employeeId: d.employeeId,
      name: d.name,
      specialty: d.specialty,
      phone: d.phone,
      email: d.email,
      address: d.address,
      isNocturnist: d.isNocturnist,
      mdocLocationId: d.mdocLocation ? (locationIds.get(d.mdocLocation.toLowerCase()) ?? null) : null,
      canAoc: d.canAoc,
    });
    const existingId = doctorIds.get(d.employeeId.toLowerCase());
    if (existingId) {
      // Leave MDOC location / AOC alone when the file doesn't have those columns.
      const { mdoc_location_id, can_aoc, ...rest } = row;
      const patch = {
        ...rest,
        ...(parsed.hasMdocColumn && { mdoc_location_id }),
        ...(parsed.hasAocColumn && { can_aoc }),
      };
      const { error } = await supabase.from("doctors").update(patch).eq("id", existingId);
      if (error) return { error: `Stopped at ${d.employeeId}: ${fail(error).error}` };
      finalIds.set(d.employeeId.toLowerCase(), existingId);
      updated++;
    } else {
      toInsert.push({ parsed: d, row: { ...row, color: nextColor++ % 6 } });
    }
  }

  for (const batch of chunk(toInsert, 100)) {
    const { data, error } = await supabase.from("doctors").insert(batch.map((b) => b.row)).select("id, employee_id");
    if (error) return { error: `Some doctors were not imported: ${fail(error).error}` };
    for (const d of data) finalIds.set(String(d.employee_id).toLowerCase(), d.id);
  }

  // 3. Preferences: only touched when the file has "% <Location>" columns.
  if (parsed.hasPrefColumns) {
    const ids = [...finalIds.values()];
    for (const batch of chunk(ids, 50)) {
      const { error } = await supabase.from("doctor_location_prefs").delete().in("doctor_id", batch);
      if (error) return { error: `Doctors were saved but preferences were not: ${error.message}` };
    }
    const rows = parsed.doctors.flatMap((d) =>
      d.prefs.map((p) => ({
        doctor_id: finalIds.get(d.employeeId.toLowerCase())!,
        location_id: locationIds.get(p.location.toLowerCase())!,
        percent: p.percent,
      })),
    );
    for (const batch of chunk(rows, 200)) {
      const { error } = await supabase.from("doctor_location_prefs").insert(batch);
      if (error) return { error: `Doctors were saved but preferences were not: ${error.message}` };
    }
  }

  revalidatePath("/", "layout");
  return { summary: { created: toInsert.length, updated, locationsCreated: missing.length } };
}

export async function removeDoctor(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("doctors").delete().eq("id", id);
  return error ? fail(error) : done();
}

// Locations -------------------------------------------------------------------

export async function addLocation(name: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("locations").insert({ name: name.trim() });
  return error ? fail(error) : done();
}

export async function renameLocation(id: string, name: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("locations").update({ name: name.trim() }).eq("id", id);
  return error ? fail(error) : done();
}

export async function removeLocation(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("locations").delete().eq("id", id);
  return error ? fail(error) : done();
}

// Shift types -----------------------------------------------------------------

const shiftTypeRow = (t: ShiftTypeInput) => ({
  name: t.name.trim(),
  location_id: t.locationId,
  start_time: t.start,
  end_time: t.end,
  ratio: t.ratio,
  is_night: t.isNight,
  category: t.category,
});

export async function addShiftType(input: ShiftTypeInput): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("shift_types").insert(shiftTypeRow(input));
  return error ? fail(error) : done();
}

export async function updateShiftType(id: string, input: ShiftTypeInput): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("shift_types").update(shiftTypeRow(input)).eq("id", id);
  return error ? fail(error) : done();
}

/** Copies a shift type as "<name> (2)", "(3)", ... so a shift can be listed twice. */
export async function duplicateShiftType(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: source, error } = await supabase
    .from("shift_types")
    .select("name, location_id, start_time, end_time, ratio, is_night, category")
    .eq("id", id)
    .single();
  if (error) return fail(error);

  const { data: siblings, error: listError } = await supabase.from("shift_types").select("name");
  if (listError) return fail(listError);
  const taken = new Set(siblings.map((s) => s.name.toLowerCase()));
  const base = source.name.replace(/\s*\(\d+\)$/, "");
  let n = 2;
  while (taken.has(`${base} (${n})`.toLowerCase())) n++;

  const { error: insertError } = await supabase.from("shift_types").insert({ ...source, name: `${base} (${n})` });
  return insertError ? fail(insertError) : done();
}

export async function removeShiftType(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("shift_types").delete().eq("id", id);
  return error ? fail(error) : done();
}

// Auth ------------------------------------------------------------------------

export async function signIn(
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
  });
  if (error) return { error: error.message };
  redirect("/");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
