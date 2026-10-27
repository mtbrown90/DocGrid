"use client";

import { useState } from "react";
import { addShifts, removeShift, updateShift } from "@/app/actions";
import { addDays, fmtHours, fmtMonthDay, fmtRatio, fmtTimeRange, parseISO, shiftHours, toISO } from "@/lib/dates";
import { findConflict } from "@/lib/schedule";
import type { Doctor, Location, Shift, ShiftType } from "@/lib/types";
import { BTN_DANGER, BTN_GHOST, BTN_PRIMARY, ErrorBox, FIELD, Label, Modal, useAction } from "./ui";

export type DialogState =
  | { mode: "new"; doctorId: string; date: string }
  | { mode: "edit"; shift: Shift };

const TIME_OFF = "time-off";
const KEEP = "keep";

export function ShiftDialog({
  state,
  doctors,
  shifts,
  locations,
  shiftTypes,
  onClose,
}: {
  state: DialogState;
  doctors: Doctor[];
  shifts: Shift[];
  locations: Location[];
  shiftTypes: ShiftType[];
  onClose: () => void;
}) {
  const { pending, error, setError, run } = useAction();
  const editing = state.mode === "edit" ? state.shift : null;

  // A work shift whose type was deleted keeps its own copy of name/times/ratio.
  const orphaned = editing && editing.kind === "work" && !shiftTypes.some((t) => t.id === editing.shiftTypeId);

  const [doctorId, setDoctorId] = useState(editing?.doctorId ?? (state.mode === "new" ? state.doctorId : ""));
  const [date, setDate] = useState(editing?.date ?? (state.mode === "new" ? state.date : ""));
  const [typeId, setTypeId] = useState(
    editing ? (editing.kind === "time-off" ? TIME_OFF : orphaned ? KEEP : (editing.shiftTypeId ?? "")) : (shiftTypes[0]?.id ?? TIME_OFF),
  );
  const [notes, setNotes] = useState(editing?.notes ?? "");
  const [repeatWeeks, setRepeatWeeks] = useState(0);

  const locationName = (id: string | null) => locations.find((l) => l.id === id)?.name ?? "";
  const chosenType = shiftTypes.find((t) => t.id === typeId);

  /** Fields copied onto the shift from whatever was chosen. */
  function template(): Pick<Shift, "start" | "end" | "kind" | "shiftTypeId" | "locationId" | "name" | "ratio"> | null {
    if (typeId === TIME_OFF) {
      return { start: "00:00", end: "23:59", kind: "time-off", shiftTypeId: null, locationId: null, name: "Time off", ratio: 0 };
    }
    if (typeId === KEEP && editing) {
      const { start, end, kind, shiftTypeId, locationId, name, ratio } = editing;
      return { start, end, kind, shiftTypeId, locationId, name, ratio };
    }
    if (!chosenType) return null;
    return {
      start: chosenType.start,
      end: chosenType.end,
      kind: "work",
      shiftTypeId: chosenType.id,
      locationId: chosenType.locationId,
      name: chosenType.name,
      ratio: chosenType.ratio,
    };
  }

  const preview = template();
  const previewRaw = preview && preview.kind === "work" ? shiftHours(preview.start, preview.end) : 0;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!doctorId || !date) return setError("Choose a doctor and a date.");
    if (!preview) return setError("Choose a shift type, or time off.");

    const base = { doctorId, notes: notes.trim(), ...preview };

    if (editing) {
      const clash = findConflict(shifts, { ...base, date }, editing.id);
      if (clash) return setError(conflictMessage(clash, doctors));
      return run(() => updateShift(editing.id, { ...base, date }), onClose);
    }

    const drafts = Array.from({ length: repeatWeeks + 1 }, (_, i) => ({
      ...base,
      date: toISO(addDays(parseISO(date), i * 7)),
    }));
    for (const draft of drafts) {
      const clash = findConflict(shifts, { ...draft, doctorId });
      if (clash) return setError(conflictMessage(clash, doctors));
    }
    run(() => addShifts(drafts), onClose);
  }

  return (
    <Modal title={editing ? "Edit shift" : "Add shift"} onClose={onClose} onSubmit={submit}>
      <Label text="Doctor">
        <select className={FIELD} value={doctorId} onChange={(e) => setDoctorId(e.target.value)}>
          {doctors.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
              {d.employeeId ? ` (${d.employeeId})` : ""}
            </option>
          ))}
        </select>
      </Label>

      <div className="grid grid-cols-2 gap-3">
        <Label text="Date">
          <input type="date" className={FIELD} value={date} onChange={(e) => setDate(e.target.value)} />
        </Label>
        <Label text="Shift">
          <select className={FIELD} value={typeId} onChange={(e) => setTypeId(e.target.value)}>
            {orphaned && editing && (
              <option value={KEEP}>{editing.name} (no longer a shift type)</option>
            )}
            {shiftTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} · {locationName(t.locationId)}
              </option>
            ))}
            <option value={TIME_OFF}>Time off</option>
          </select>
        </Label>
      </div>

      {shiftTypes.length === 0 && (
        <p className="text-xs opacity-60">
          No shift types yet. Create them on the Setup page to schedule real shifts.
        </p>
      )}

      {preview && preview.kind === "work" && (
        <p className="rounded-md bg-black/5 px-3 py-2 text-sm dark:bg-white/10">
          {fmtTimeRange(preview.start, preview.end)} · {fmtHours(previewRaw)} raw h × {fmtRatio(preview.ratio)} ={" "}
          <strong>{fmtHours(previewRaw * preview.ratio)} ratio h</strong>
        </p>
      )}

      <Label text="Notes">
        <input className={FIELD} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Label>

      {!editing && (
        <Label text="Repeat weekly for additional weeks">
          <input
            type="number"
            min={0}
            max={12}
            className={FIELD}
            value={repeatWeeks}
            onChange={(e) => setRepeatWeeks(Math.min(12, Math.max(0, Number(e.target.value) || 0)))}
          />
        </Label>
      )}

      <ErrorBox message={error} />

      <div className="flex items-center justify-between pt-1">
        {editing ? (
          <button type="button" className={BTN_DANGER} disabled={pending} onClick={() => run(() => removeShift(editing.id), onClose)}>
            Delete
          </button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <button type="button" className={BTN_GHOST} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={BTN_PRIMARY} disabled={pending}>
            {pending ? "Saving…" : editing ? "Save" : "Add"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function conflictMessage(clash: Shift, doctors: Doctor[]): string {
  const who = doctors.find((d) => d.id === clash.doctorId)?.name ?? "This doctor";
  const what = clash.kind === "time-off" ? "has time off" : `is already scheduled ${fmtTimeRange(clash.start, clash.end)}`;
  return `${who} ${what} on ${fmtMonthDay(parseISO(clash.date))}.`;
}
