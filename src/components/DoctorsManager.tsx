"use client";

import { useState, useTransition } from "react";
import {
  addDoctor,
  importDoctors,
  removeDoctor,
  updateDoctor,
  type DoctorInput,
  type ImportResult,
  type PrefInput,
} from "@/app/actions";
import { fmtHours } from "@/lib/dates";
import { DOCTOR_COLORS, type Doctor, type Location, type LocationPref, type Shift } from "@/lib/types";
import { BTN_DANGER, BTN_GHOST, BTN_PRIMARY, ErrorBox, FIELD, Label, Modal, useAction } from "./ui";

const EMPTY: DoctorInput = {
  employeeId: "",
  name: "",
  specialty: "",
  phone: "",
  email: "",
  address: "",
  isNocturnist: false,
};

export function DoctorsManager({
  doctors,
  shifts,
  locations,
  prefs,
}: {
  doctors: Doctor[];
  shifts: Shift[];
  locations: Location[];
  prefs: LocationPref[];
}) {
  const { pending, error, run } = useAction();
  // null = closed, "new" = adding, otherwise the doctor being edited.
  const [dialog, setDialog] = useState<"new" | Doctor | null>(null);
  const [importing, setImporting] = useState(false);

  const prefsFor = (doctorId: string) =>
    prefs
      .filter((p) => p.doctorId === doctorId && p.percent > 0)
      .map((p) => ({ name: locations.find((l) => l.id === p.locationId)?.name ?? "?", percent: p.percent }))
      .sort((a, b) => b.percent - a.percent);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">Doctors</h1>
        <div className="flex gap-2">
          <button className={BTN_GHOST} onClick={() => setImporting(true)}>
            Import from Excel
          </button>
          <button className={BTN_PRIMARY} onClick={() => setDialog("new")}>
            Add doctor
          </button>
        </div>
      </div>

      <ErrorBox message={error} />

      <ul className="divide-y divide-black/10 rounded-lg border border-black/15 dark:divide-white/15 dark:border-white/20">
        {doctors.length === 0 && <li className="p-4 text-sm opacity-60">No doctors yet. Add one, or import a spreadsheet.</li>}
        {doctors.map((d) => {
          const count = shifts.filter((s) => s.doctorId === d.id && s.kind === "work").length;
          const doctorPrefs = prefsFor(d.id);
          return (
            <li key={d.id} className="flex flex-wrap items-start gap-3 p-3">
              <span className={`mt-1.5 h-3 w-3 shrink-0 rounded-full ${DOCTOR_COLORS[d.color % 6].dot}`} />
              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{d.name}</span>
                  <span className="text-xs opacity-60">{d.employeeId ? `ID ${d.employeeId}` : "No ID"}</span>
                  {d.isNocturnist && (
                    <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs text-indigo-900 dark:bg-indigo-950 dark:text-indigo-100">
                      Nocturnist
                    </span>
                  )}
                </div>
                <div className="text-xs opacity-60">{[d.specialty, d.phone, d.email].filter(Boolean).join(" · ")}</div>
                {d.address && <div className="text-xs opacity-60">{d.address}</div>}
                <div className="text-xs opacity-60">
                  {doctorPrefs.length > 0
                    ? doctorPrefs.map((p) => `${p.name} ${fmtHours(p.percent)}%`).join(" · ")
                    : "No location preferences"}
                  {" · "}
                  {count} scheduled {count === 1 ? "shift" : "shifts"}
                </div>
              </div>
              <div className="flex gap-1">
                <button className={BTN_GHOST} onClick={() => setDialog(d)}>
                  Edit
                </button>
                <button
                  className={BTN_DANGER}
                  disabled={pending}
                  onClick={() => {
                    const msg = count ? `Remove ${d.name} and their ${count} scheduled shifts?` : `Remove ${d.name}?`;
                    if (confirm(msg)) run(() => removeDoctor(d.id));
                  }}
                >
                  Remove
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {dialog && (
        <DoctorDialog
          key={dialog === "new" ? "new" : dialog.id}
          doctor={dialog === "new" ? null : dialog}
          locations={locations}
          prefs={dialog === "new" ? [] : prefs.filter((p) => p.doctorId === dialog.id)}
          onClose={() => setDialog(null)}
        />
      )}
      {importing && <ImportDialog onClose={() => setImporting(false)} />}
    </div>
  );
}

function DoctorDialog({
  doctor,
  locations,
  prefs,
  onClose,
}: {
  doctor: Doctor | null;
  locations: Location[];
  prefs: LocationPref[];
  onClose: () => void;
}) {
  const { pending, error, setError, run } = useAction();
  const [form, setForm] = useState<DoctorInput>(
    doctor
      ? {
          employeeId: doctor.employeeId,
          name: doctor.name,
          specialty: doctor.specialty,
          phone: doctor.phone,
          email: doctor.email,
          address: doctor.address,
          isNocturnist: doctor.isNocturnist,
        }
      : EMPTY,
  );
  // Location id -> percent as typed; blank means no preference.
  const [percents, setPercents] = useState<Record<string, string>>(
    Object.fromEntries(prefs.map((p) => [p.locationId, String(p.percent)])),
  );
  const set = <K extends keyof DoctorInput>(key: K, value: DoctorInput[K]) => setForm((f) => ({ ...f, [key]: value }));

  const prefInput: PrefInput = Object.fromEntries(
    Object.entries(percents)
      .map(([id, text]) => [id, Number(text) || 0] as const)
      .filter(([, p]) => p > 0),
  );
  const total = Object.values(prefInput).reduce((a, b) => a + b, 0);
  const totalOk = total === 0 || Math.abs(total - 100) < 0.01;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return setError("Name is required.");
    if (!form.employeeId.trim()) return setError("An ID is required.");
    if (!totalOk) return setError(`Location percentages add up to ${fmtHours(total)}, not 100.`);
    run(() => (doctor ? updateDoctor(doctor.id, form, prefInput) : addDoctor(form, prefInput)), onClose);
  }

  return (
    <Modal title={doctor ? "Edit doctor" : "Add doctor"} onClose={onClose} onSubmit={submit}>
      <div className="grid grid-cols-3 gap-3">
        <Label text="ID">
          <input className={FIELD} value={form.employeeId} onChange={(e) => set("employeeId", e.target.value)} />
        </Label>
        <div className="col-span-2">
          <Label text="Name">
            <input className={FIELD} value={form.name} placeholder="Dr. Sam Rivera" onChange={(e) => set("name", e.target.value)} />
          </Label>
        </div>
      </div>
      <Label text="Specialty">
        <input className={FIELD} value={form.specialty} onChange={(e) => set("specialty", e.target.value)} />
      </Label>
      <div className="grid grid-cols-2 gap-3">
        <Label text="Phone">
          <input type="tel" className={FIELD} value={form.phone} onChange={(e) => set("phone", e.target.value)} />
        </Label>
        <Label text="Email">
          <input type="email" className={FIELD} value={form.email} onChange={(e) => set("email", e.target.value)} />
        </Label>
      </div>
      <Label text="Address">
        <input className={FIELD} value={form.address} onChange={(e) => set("address", e.target.value)} />
      </Label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={form.isNocturnist} onChange={(e) => set("isNocturnist", e.target.checked)} />
        <span className="font-medium">Nocturnist</span>
        <span className="opacity-60">(works night shifts only)</span>
      </label>

      <fieldset className="space-y-2 rounded-md border border-black/15 p-3 dark:border-white/20">
        <legend className="px-1 text-sm font-medium">Location preference (% of shifts)</legend>
        {locations.length === 0 ? (
          <p className="text-xs opacity-60">Add locations on the Setup page first.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-x-3 gap-y-2">
              {locations.map((l) => (
                <label key={l.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate">{l.name}</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    className={`${FIELD} w-20`}
                    value={percents[l.id] ?? ""}
                    onChange={(e) => setPercents((p) => ({ ...p, [l.id]: e.target.value }))}
                    aria-label={`${l.name} percent`}
                  />
                </label>
              ))}
            </div>
            <p className={`text-xs ${totalOk ? "opacity-60" : "text-red-700 dark:text-red-300"}`}>
              Total: {fmtHours(total)}% {total === 0 ? "(no preference)" : totalOk ? "" : "(must add up to 100)"}
            </p>
          </>
        )}
      </fieldset>

      <ErrorBox message={error} />

      <div className="flex justify-end gap-2 pt-1">
        <button type="button" className={BTN_GHOST} onClick={onClose}>
          Cancel
        </button>
        <button type="submit" className={BTN_PRIMARY} disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
    </Modal>
  );
}

function ImportDialog({ onClose }: { onClose: () => void }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ImportResult | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget as HTMLFormElement);
    setResult(null);
    startTransition(async () => setResult(await importDoctors(formData)));
  }

  const summary = result?.summary;

  return (
    <Modal title="Import doctors from Excel" onClose={onClose} onSubmit={submit}>
      <p className="text-sm opacity-80">
        Upload an .xlsx with one row per doctor: ID, Name, Specialty, Phone, Email, Address, Nocturnist, and one &quot;% Location&quot; column per
        location. Existing doctors with the same ID are updated; nothing is deleted.
      </p>
      <a href="/api/doctors-template" download className="inline-block text-sm font-medium underline">
        Download a blank template
      </a>

      <input
        type="file"
        name="file"
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        required
        className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-black/10 file:px-3 file:py-1.5 file:text-sm file:font-medium dark:file:bg-white/15"
      />

      <ErrorBox message={result?.error ?? null} />
      {result?.errors && (
        <div role="alert" className="max-h-48 space-y-1 overflow-y-auto rounded-md bg-red-100 px-3 py-2 text-sm text-red-900 dark:bg-red-950 dark:text-red-100">
          <p className="font-medium">Nothing was imported. Fix these and try again:</p>
          <ul className="list-disc pl-5">
            {result.errors.slice(0, 50).map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
          {result.errors.length > 50 && <p>…and {result.errors.length - 50} more.</p>}
        </div>
      )}
      {summary && (
        <p className="rounded-md bg-emerald-100 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">
          Imported: {summary.created} added, {summary.updated} updated
          {summary.locationsCreated > 0 && `, ${summary.locationsCreated} new ${summary.locationsCreated === 1 ? "location" : "locations"}`}.
        </p>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <button type="button" className={BTN_GHOST} onClick={onClose}>
          {summary ? "Done" : "Cancel"}
        </button>
        <button type="submit" className={BTN_PRIMARY} disabled={pending}>
          {pending ? "Importing…" : "Import"}
        </button>
      </div>
    </Modal>
  );
}
