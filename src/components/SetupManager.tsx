"use client";

import { useState } from "react";
import {
  addLocation,
  addShiftType,
  duplicateShiftType,
  removeLocation,
  removeShiftType,
  renameLocation,
  updateShiftType,
  type ShiftTypeInput,
} from "@/app/actions";
import { fmtHours, fmtRatio, fmtTimeRange, shiftHours } from "@/lib/dates";
import { SHIFT_CATEGORIES, categoryLabel, type Location, type ShiftCategory, type ShiftType } from "@/lib/types";
import { BTN_DANGER, BTN_GHOST, BTN_PRIMARY, ErrorBox, FIELD, Label, Modal, useAction } from "./ui";

export function SetupManager({ locations, shiftTypes }: { locations: Location[]; shiftTypes: ShiftType[] }) {
  return (
    <div className="space-y-10">
      <LocationsSection locations={locations} shiftTypes={shiftTypes} />
      <ShiftTypesSection locations={locations} shiftTypes={shiftTypes} />
    </div>
  );
}

function LocationsSection({ locations, shiftTypes }: { locations: Location[]; shiftTypes: ShiftType[] }) {
  const { pending, error, run } = useAction();
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  return (
    <section className="space-y-3">
      <h1 className="text-lg font-semibold">Locations</h1>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) run(() => addLocation(name), () => setName(""));
        }}
      >
        <input className={`${FIELD} max-w-xs`} placeholder="e.g. Memorial Hospital" value={name} onChange={(e) => setName(e.target.value)} aria-label="New location name" />
        <button type="submit" className={BTN_PRIMARY} disabled={!name.trim() || pending}>
          Add location
        </button>
      </form>

      <ErrorBox message={error} />

      <ul className="divide-y divide-black/10 rounded-lg border border-black/15 dark:divide-white/15 dark:border-white/20">
        {locations.length === 0 && <li className="p-4 text-sm opacity-60">No locations yet. Add one to start creating shift types.</li>}
        {locations.map((l) => {
          const uses = shiftTypes.filter((t) => t.locationId === l.id).length;
          return (
            <li key={l.id} className="flex items-center gap-3 p-3">
              {editingId === l.id ? (
                <form
                  className="flex flex-1 gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (editName.trim()) run(() => renameLocation(l.id, editName), () => setEditingId(null));
                  }}
                >
                  <input className={`${FIELD} max-w-xs`} value={editName} onChange={(e) => setEditName(e.target.value)} autoFocus aria-label="Location name" />
                  <button type="submit" className={BTN_PRIMARY} disabled={pending}>
                    Save
                  </button>
                  <button type="button" className={BTN_GHOST} onClick={() => setEditingId(null)}>
                    Cancel
                  </button>
                </form>
              ) : (
                <>
                  <div className="flex-1">
                    <span className="font-medium">{l.name}</span>
                    <span className="ml-2 text-xs opacity-60">
                      {uses} shift {uses === 1 ? "type" : "types"}
                    </span>
                  </div>
                  <button
                    className={BTN_GHOST}
                    onClick={() => {
                      setEditingId(l.id);
                      setEditName(l.name);
                    }}
                  >
                    Rename
                  </button>
                  <button
                    className={BTN_DANGER}
                    disabled={pending}
                    onClick={() => confirm(`Delete ${l.name}?`) && run(() => removeLocation(l.id))}
                  >
                    Delete
                  </button>
                </>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function ShiftTypesSection({ locations, shiftTypes }: { locations: Location[]; shiftTypes: ShiftType[] }) {
  const { pending, error, run } = useAction();
  const [dialog, setDialog] = useState<"new" | ShiftType | null>(null);
  const locationName = (id: string | null) => (id ? (locations.find((l) => l.id === id)?.name ?? "?") : "All locations");

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Shift types</h2>
        <button className={BTN_PRIMARY} disabled={locations.length === 0} onClick={() => setDialog("new")}>
          Add shift type
        </button>
      </div>
      <p className="text-sm opacity-70">
        A shift type is a named shift at a location, filled by one doctor. Ratio hours = raw hours × ratio, so a 12-hour night shift with ratio 1.5
        counts as 18 ratio hours. To run a shift with two doctors, click Duplicate to list it twice.
      </p>

      <ErrorBox message={error} />

      <div className="overflow-x-auto rounded-lg border border-black/15 dark:border-white/20">
        <table className="w-full min-w-[44rem] text-sm">
          <thead className="bg-black/[0.03] text-left dark:bg-white/[0.05]">
            <tr>
              {["Name", "Location", "Time", "Raw h", "Ratio", "Ratio h", ""].map((h) => (
                <th key={h} className="p-2 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shiftTypes.length === 0 && (
              <tr>
                <td colSpan={7} className="p-4 opacity-60">
                  No shift types yet.
                </td>
              </tr>
            )}
            {shiftTypes.map((t) => {
              const raw = shiftHours(t.start, t.end);
              return (
                <tr key={t.id} className="border-t border-black/10 dark:border-white/15">
                  <td className="p-2 font-medium">
                    {t.name}
                    {t.isNight && <span className="ml-1.5 rounded-full bg-indigo-100 px-1.5 py-0.5 text-xs text-indigo-900 dark:bg-indigo-950 dark:text-indigo-100">Night</span>}
                    {t.category !== "regular" && (
                      <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-100">
                        {categoryLabel(t.category)}
                      </span>
                    )}
                  </td>
                  <td className="p-2">{locationName(t.locationId)}</td>
                  <td className="p-2 whitespace-nowrap">{fmtTimeRange(t.start, t.end)}</td>
                  <td className="p-2">{fmtHours(raw)}</td>
                  <td className="p-2">×{fmtRatio(t.ratio)}</td>
                  <td className="p-2">{fmtHours(raw * t.ratio)}</td>
                  <td className="p-2 text-right whitespace-nowrap">
                    <button className={BTN_GHOST} onClick={() => setDialog(t)}>
                      Edit
                    </button>
                    <button className={BTN_GHOST} disabled={pending} onClick={() => run(() => duplicateShiftType(t.id))}>
                      Duplicate
                    </button>
                    <button
                      className={BTN_DANGER}
                      disabled={pending}
                      onClick={() =>
                        confirm(`Delete ${t.name}? Shifts already scheduled keep their times and ratio.`) &&
                        run(() => removeShiftType(t.id))
                      }
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {dialog && (
        <ShiftTypeDialog
          key={dialog === "new" ? "new" : dialog.id}
          shiftType={dialog === "new" ? null : dialog}
          locations={locations}
          onClose={() => setDialog(null)}
        />
      )}
    </section>
  );
}

function ShiftTypeDialog({
  shiftType,
  locations,
  onClose,
}: {
  shiftType: ShiftType | null;
  locations: Location[];
  onClose: () => void;
}) {
  const { pending, error, setError, run } = useAction();
  const [form, setForm] = useState<ShiftTypeInput>(
    shiftType
      ? { ...shiftType }
      : {
          name: "",
          locationId: locations[0]?.id ?? null,
          start: "07:00",
          end: "19:00",
          ratio: 1,
          isNight: false,
          category: "regular",
        },
  );
  const set = <K extends keyof ShiftTypeInput>(key: K, value: ShiftTypeInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  // Equal start and end means a full 24 hours.
  const raw = form.start && form.end ? shiftHours(form.start, form.end) : 0;
  const overnight = form.end <= form.start;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return setError("Name is required.");
    if (!form.locationId && form.category !== "call" && form.category !== "aoc") {
      return setError("Choose a location. Only Call and AOC shifts can cover all locations.");
    }
    if (!form.start || !form.end) return setError("Enter a start and end time.");
    run(() => (shiftType ? updateShiftType(shiftType.id, form) : addShiftType(form)), onClose);
  }

  return (
    <Modal title={shiftType ? "Edit shift type" : "Add shift type"} onClose={onClose} onSubmit={submit}>
      <div className="grid grid-cols-2 gap-3">
        <Label text="Name">
          <input className={FIELD} value={form.name} placeholder="Day, Night, Swing…" onChange={(e) => set("name", e.target.value)} />
        </Label>
        <Label text="Location">
          <select className={FIELD} value={form.locationId ?? ""} onChange={(e) => set("locationId", e.target.value || null)}>
            <option value="">All locations (Call/AOC only)</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </Label>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Label text="Start">
          <input type="time" className={FIELD} value={form.start} onChange={(e) => set("start", e.target.value)} />
        </Label>
        <Label text="End">
          <input type="time" className={FIELD} value={form.end} onChange={(e) => set("end", e.target.value)} />
        </Label>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Label text="Ratio (multiplier)">
          <input
            type="number"
            min={0}
            max={999}
            step="any"
            placeholder="e.g. 0.92345"
            className={FIELD}
            value={form.ratio}
            onChange={(e) => set("ratio", Math.min(999, Math.max(0, Math.round((Number(e.target.value) || 0) * 100000) / 100000)))}
          />
        </Label>
        <Label text="Category">
          <select className={FIELD} value={form.category} onChange={(e) => set("category", e.target.value as ShiftCategory)}>
            {SHIFT_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </Label>
      </div>
      <p className="text-xs opacity-60">
        {form.category === "regular" && "A regular shift at one location. It can overlap the doctor's MDOC shift, but nothing else."}
        {form.category === "call" && "Call shifts can cover all locations. No other shift can overlap a doctor's Call shift."}
        {form.category === "aoc" && "AOC can cover all locations. No other shift can overlap a doctor's AOC shift."}
        {form.category === "mdoc" && "MDOC is a 24-hour shift at one location. A doctor can work regular shifts while being MDOC."}
      </p>
      <p className="rounded-md bg-black/5 px-3 py-2 text-sm dark:bg-white/10">
        {fmtHours(raw)} raw h × {fmtRatio(form.ratio)} = <strong>{fmtHours(raw * form.ratio)} ratio h</strong>
        {form.start === form.end ? (
          <span className="opacity-70"> · same start and end = 24 hours, ends next day</span>
        ) : (
          overnight && <span className="opacity-70"> · ends next day</span>
        )}
      </p>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={form.isNight} onChange={(e) => set("isNight", e.target.checked)} />
        <span className="font-medium">Night shift</span>
        <span className="opacity-60">(nocturnists work only these)</span>
      </label>

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
