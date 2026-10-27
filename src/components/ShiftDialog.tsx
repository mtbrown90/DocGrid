"use client";

import { useState, useTransition } from "react";
import { addShifts, removeShift, updateShift, type ActionResult } from "@/app/actions";
import { addDays, fmtMonthDay, fmtTime, parseISO, timeToMinutes, toISO } from "@/lib/dates";
import { findConflict } from "@/lib/schedule";
import { SHIFT_KINDS, type Doctor, type Shift, type ShiftKind } from "@/lib/types";

export type DialogState =
  | { mode: "new"; doctorId: string; date: string }
  | { mode: "edit"; shift: Shift };

const FIELD =
  "w-full rounded-md border border-black/20 bg-transparent px-2.5 py-1.5 text-sm dark:border-white/25";

export function ShiftDialog({
  state,
  doctors,
  shifts,
  onClose,
}: {
  state: DialogState;
  doctors: Doctor[];
  shifts: Shift[];
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const editing = state.mode === "edit" ? state.shift : null;

  const [doctorId, setDoctorId] = useState(editing?.doctorId ?? (state.mode === "new" ? state.doctorId : ""));
  const [date, setDate] = useState(editing?.date ?? (state.mode === "new" ? state.date : ""));
  const [kind, setKind] = useState<ShiftKind>(editing?.kind ?? "clinic");
  const [start, setStart] = useState(editing?.start ?? "09:00");
  const [end, setEnd] = useState(editing?.end ?? "17:00");
  const [location, setLocation] = useState(editing?.location ?? "");
  const [notes, setNotes] = useState(editing?.notes ?? "");
  const [repeatWeeks, setRepeatWeeks] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const allDay = kind === "time-off";

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const s = allDay ? "00:00" : start;
    const en = allDay ? "23:59" : end;
    if (!doctorId || !date) return setError("Choose a doctor and a date.");
    if (timeToMinutes(en) <= timeToMinutes(s)) return setError("End time must be after start time.");

    const base = { doctorId, kind, start: s, end: en, location: location.trim(), notes: notes.trim() };

    if (editing) {
      const clash = findConflict(shifts, { ...base, date }, editing.id);
      if (clash) return setError(conflictMessage(clash, doctors));
      return run(() => updateShift(editing.id, { ...base, date }));
    }

    const drafts = Array.from({ length: repeatWeeks + 1 }, (_, i) => ({
      ...base,
      date: toISO(addDays(parseISO(date), i * 7)),
    }));
    for (const draft of drafts) {
      const clash = findConflict(shifts, draft);
      if (clash) return setError(conflictMessage(clash, doctors));
    }
    run(() => addShifts(drafts));
  }

  function run(action: () => Promise<ActionResult>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) setError(result.error);
      else onClose();
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="shift-dialog-title"
        onSubmit={submit}
        className="max-h-full w-full max-w-md space-y-3 overflow-y-auto rounded-xl bg-background p-5 shadow-xl"
      >
        <h2 id="shift-dialog-title" className="text-lg font-semibold">
          {editing ? "Edit shift" : "Add shift"}
        </h2>

        <label className="block text-sm">
          <span className="mb-1 block font-medium">Doctor</span>
          <select className={FIELD} value={doctorId} onChange={(e) => setDoctorId(e.target.value)}>
            {doctors.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} · {d.specialty}
              </option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Date</span>
            <input type="date" className={FIELD} value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Type</span>
            <select className={FIELD} value={kind} onChange={(e) => setKind(e.target.value as ShiftKind)}>
              {SHIFT_KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {!allDay && (
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Start</span>
              <input type="time" className={FIELD} value={start} onChange={(e) => setStart(e.target.value)} />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">End</span>
              <input type="time" className={FIELD} value={end} onChange={(e) => setEnd(e.target.value)} />
            </label>
          </div>
        )}

        {!allDay && (
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Location</span>
            <input
              className={FIELD}
              value={location}
              placeholder="e.g. Main Clinic"
              onChange={(e) => setLocation(e.target.value)}
            />
          </label>
        )}

        <label className="block text-sm">
          <span className="mb-1 block font-medium">Notes</span>
          <input className={FIELD} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>

        {!editing && (
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Repeat weekly for additional weeks</span>
            <input
              type="number"
              min={0}
              max={12}
              className={FIELD}
              value={repeatWeeks}
              onChange={(e) => setRepeatWeeks(Math.min(12, Math.max(0, Number(e.target.value) || 0)))}
            />
          </label>
        )}

        {error && (
          <p role="alert" className="rounded-md bg-red-100 px-3 py-2 text-sm text-red-900 dark:bg-red-950 dark:text-red-100">
            {error}
          </p>
        )}

        <div className="flex items-center justify-between pt-1">
          {editing ? (
            <button
              type="button"
              className="rounded-md px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950"
              disabled={pending}
              onClick={() => run(() => removeShift(editing.id))}
            >
              Delete
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button
              type="button"
              className="rounded-md px-3 py-1.5 text-sm font-medium hover:bg-black/5 dark:hover:bg-white/10"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending}
              className="rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background disabled:opacity-50"
            >
              {pending ? "Saving…" : editing ? "Save" : "Add"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

function conflictMessage(clash: Shift, doctors: { id: string; name: string }[]): string {
  const who = doctors.find((d) => d.id === clash.doctorId)?.name ?? "This doctor";
  const what = clash.kind === "time-off" ? "has time off" : `is already scheduled ${fmtTime(clash.start)}–${fmtTime(clash.end)}`;
  return `${who} ${what} on ${fmtMonthDay(parseISO(clash.date))}.`;
}
