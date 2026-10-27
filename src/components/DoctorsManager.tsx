"use client";

import { useState, useTransition } from "react";
import { addDoctor, removeDoctor, type ActionResult } from "@/app/actions";
import { DOCTOR_COLORS, type Doctor, type Shift } from "@/lib/types";

const FIELD =
  "rounded-md border border-black/20 bg-transparent px-2.5 py-1.5 text-sm dark:border-white/25";

export function DoctorsManager({ doctors, shifts }: { doctors: Doctor[]; shifts: Shift[] }) {
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [error, setError] = useState<string | null>(null);

  function run(action: () => Promise<ActionResult>, onSuccess?: () => void) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) setError(result.error);
      else onSuccess?.();
    });
  }

  function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    run(
      () => addDoctor(name, specialty),
      () => {
        setName("");
        setSpecialty("");
      },
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold">Doctors</h1>

      <form onSubmit={add} className="flex flex-wrap gap-2">
        <input
          className={`${FIELD} min-w-48 flex-1`}
          placeholder="Name, e.g. Dr. Sam Rivera"
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="Doctor name"
        />
        <input
          className={`${FIELD} min-w-48 flex-1`}
          placeholder="Specialty"
          value={specialty}
          onChange={(e) => setSpecialty(e.target.value)}
          aria-label="Specialty"
        />
        <button
          type="submit"
          className="rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background disabled:opacity-40"
          disabled={!name.trim() || pending}
        >
          Add doctor
        </button>
      </form>

      {error && (
        <p role="alert" className="rounded-md bg-red-100 px-3 py-2 text-sm text-red-900 dark:bg-red-950 dark:text-red-100">
          {error}
        </p>
      )}

      <ul className="divide-y divide-black/10 rounded-lg border border-black/15 dark:divide-white/15 dark:border-white/20">
        {doctors.length === 0 && <li className="p-4 text-sm opacity-60">No doctors yet.</li>}
        {doctors.map((d) => {
          const count = shifts.filter((s) => s.doctorId === d.id).length;
          return (
            <li key={d.id} className="flex items-center gap-3 p-3">
              <span className={`h-3 w-3 shrink-0 rounded-full ${DOCTOR_COLORS[d.color % 6].dot}`} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{d.name}</div>
                <div className="text-xs opacity-60">
                  {d.specialty} · {count} scheduled {count === 1 ? "shift" : "shifts"}
                </div>
              </div>
              <button
                disabled={pending}
                className="rounded-md px-2.5 py-1 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50 dark:text-red-300 dark:hover:bg-red-950"
                onClick={() => {
                  const msg = count
                    ? `Remove ${d.name} and their ${count} scheduled shifts?`
                    : `Remove ${d.name}?`;
                  if (confirm(msg)) run(() => removeDoctor(d.id));
                }}
              >
                Remove
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
