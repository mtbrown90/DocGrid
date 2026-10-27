"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Shift } from "@/lib/types";

export type ActionResult = { error?: string };

type ShiftDraft = Omit<Shift, "id">;

function fail(error: { code?: string; message: string }): ActionResult {
  // 23P01 = exclusion_violation from the shifts_no_overlap constraint.
  if (error.code === "23P01") return { error: "That overlaps another shift for this doctor." };
  return { error: error.message };
}

function done(): ActionResult {
  revalidatePath("/", "layout");
  return {};
}

const toRow = (s: ShiftDraft) => ({
  doctor_id: s.doctorId,
  shift_date: s.date,
  start_time: s.start,
  end_time: s.end,
  kind: s.kind,
  location: s.location,
  notes: s.notes,
});

export async function addShifts(drafts: ShiftDraft[]): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("shifts").insert(drafts.map(toRow));
  return error ? fail(error) : done();
}

export async function updateShift(id: string, draft: ShiftDraft): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("shifts").update(toRow(draft)).eq("id", id);
  return error ? fail(error) : done();
}

export async function removeShift(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("shifts").delete().eq("id", id);
  return error ? fail(error) : done();
}

export async function addDoctor(name: string, specialty: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { count, error: countError } = await supabase
    .from("doctors")
    .select("id", { count: "exact", head: true });
  if (countError) return fail(countError);

  const { error } = await supabase.from("doctors").insert({
    name: name.trim(),
    specialty: specialty.trim() || "General",
    color: (count ?? 0) % 6,
  });
  return error ? fail(error) : done();
}

export async function removeDoctor(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("doctors").delete().eq("id", id);
  return error ? fail(error) : done();
}

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
