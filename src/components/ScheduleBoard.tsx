"use client";

import { useState } from "react";
import {
  addDays,
  fmtHours,
  fmtMonthDay,
  fmtMonthYear,
  fmtRatio,
  fmtTimeRange,
  fmtTimeRangeShort,
  fmtWeekday,
  parseISO,
  startOfWeek,
  toISO,
} from "@/lib/dates";
import { ratioHours, rawHours } from "@/lib/schedule";
import { useHydrated } from "@/lib/useHydrated";
import { DOCTOR_COLORS, categoryLabel, type Doctor, type ScheduleData, type Shift } from "@/lib/types";
import { ExportPanel } from "./ExportPanel";
import { ShiftDialog, type DialogState } from "./ShiftDialog";
import { BTN_GHOST, BTN_PRIMARY, FIELD } from "./ui";

const NAV_BTN = "rounded-md border border-black/20 px-3 py-1.5 text-sm dark:border-white/25";
/** Location-filter value meaning "shifts that cover all locations" (Call and AOC). */
const ALL_LOCATIONS = "__all__";

export function ScheduleBoard({ doctors, shifts, locations, shiftTypes }: ScheduleData) {
  const hydrated = useHydrated();
  // Anchored lazily on the client; a placeholder shows until hydrated so the server HTML can't mismatch.
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [view, setView] = useState<"calendar" | "list">("calendar");
  const [locationFilter, setLocationFilter] = useState(""); // "" = all
  const [doctorFilter, setDoctorFilter] = useState(""); // "" = all
  const [dialog, setDialog] = useState<DialogState | null>(null);

  if (!hydrated) {
    return <p className="p-6 text-sm opacity-60">Loading schedule…</p>;
  }

  const monthFrom = toISO(month);
  const monthTo = toISO(new Date(month.getFullYear(), month.getMonth() + 1, 0));
  const todayISO = toISO(new Date());
  const doctorById = new Map(doctors.map((d) => [d.id, d]));
  const locationName = (id: string | null) => (id ? (locations.find((l) => l.id === id)?.name ?? "?") : "All locations");

  // Filter, then group by day (already in time order from the server; sorted again for a stable look).
  const visible = shifts
    .filter((s) => s.date >= monthFrom && s.date <= monthTo)
    .filter((s) => !doctorFilter || s.doctorId === doctorFilter)
    .filter((s) => {
      if (!locationFilter) return true;
      if (locationFilter === ALL_LOCATIONS) return s.kind === "work" && !s.locationId;
      return s.locationId === locationFilter; // time off has no location, so it drops out
    })
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        a.start.localeCompare(b.start) ||
        locationName(a.locationId).localeCompare(locationName(b.locationId)) ||
        a.name.localeCompare(b.name) ||
        (doctorById.get(a.doctorId)?.name ?? "").localeCompare(doctorById.get(b.doctorId)?.name ?? ""),
    );
  const byDate = new Map<string, Shift[]>();
  for (const s of visible) byDate.set(s.date, [...(byDate.get(s.date) ?? []), s]);

  const worked = visible.filter((s) => s.kind === "work");
  const totalRaw = worked.reduce((sum, s) => sum + rawHours(s), 0);
  const totalRatio = worked.reduce((sum, s) => sum + ratioHours(s), 0);
  const filtered = Boolean(locationFilter || doctorFilter);

  // Calendar weeks covering the month, Monday first.
  const gridStart = startOfWeek(month);
  const lastOfMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  // Round the day count: a daylight-saving change makes one day 23 or 25 hours long.
  const weekCount = Math.ceil((Math.round((lastOfMonth.getTime() - gridStart.getTime()) / 86400000) + 1) / 7);
  const weeks = Array.from({ length: weekCount }, (_, w) => Array.from({ length: 7 }, (_, d) => addDays(gridStart, w * 7 + d)));

  const openNew = (date: string) =>
    setDialog({ mode: "new", doctorId: doctorFilter || doctors[0]?.id || "", date });
  const changeMonth = (delta: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + delta, 1));

  // A plain function (not a component) so React doesn't remount every entry on each render.
  function renderEntry(s: Shift, compact: boolean) {
    const doc = doctorById.get(s.doctorId);
    const color = DOCTOR_COLORS[(doc?.color ?? 0) % 6];
    if (s.kind === "time-off") {
      return (
        <button
          key={s.id}
          onClick={() => setDialog({ mode: "edit", shift: s })}
          className="block w-full rounded border border-dashed border-black/30 bg-black/5 px-1.5 py-0.5 text-left text-[11px] leading-tight dark:border-white/30 dark:bg-white/10"
        >
          <span className="font-medium">Time off</span>
          <span className="block">{doc?.name ?? "?"}</span>
        </button>
      );
    }
    return (
      <button
        key={s.id}
        onClick={() => setDialog({ mode: "edit", shift: s })}
        title={`${locationName(s.locationId)} · ${s.name} · ${doc?.name ?? "?"} · ${fmtTimeRange(s.start, s.end)}`}
        className={`block w-full rounded border px-1.5 py-0.5 text-left text-[11px] leading-tight ${color.chip}`}
      >
        <span className="block font-medium">
          {locationName(s.locationId)} · {s.name || "Shift"}
          {s.category !== "regular" && s.category !== "time-off" && (
            <span className="ml-1 rounded bg-black/10 px-1 text-[9px] uppercase dark:bg-white/15">{categoryLabel(s.category)}</span>
          )}
        </span>
        <span className="block">
          {doc?.name ?? "?"} · {compact ? fmtTimeRangeShort(s.start, s.end) : fmtTimeRange(s.start, s.end)}
        </span>
      </button>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button className={NAV_BTN} onClick={() => changeMonth(-1)} aria-label="Previous month">
            ←
          </button>
          <button
            className={NAV_BTN}
            onClick={() => {
              const now = new Date();
              setMonth(new Date(now.getFullYear(), now.getMonth(), 1));
            }}
          >
            Today
          </button>
          <button className={NAV_BTN} onClick={() => changeMonth(1)} aria-label="Next month">
            →
          </button>
          <h1 className="ml-2 text-lg font-semibold">{fmtMonthYear(month)}</h1>
        </div>
        <div className="flex items-center gap-2">
          <ExportPanel />
          <button className={BTN_PRIMARY} disabled={doctors.length === 0} onClick={() => openNew(todayISO >= monthFrom && todayISO <= monthTo ? todayISO : monthFrom)}>
            Add shift
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="mb-1 block font-medium">Location</span>
          <select className={`${FIELD} w-48`} value={locationFilter} onChange={(e) => setLocationFilter(e.target.value)}>
            <option value="">All locations</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
            <option value={ALL_LOCATIONS}>Call / AOC (all locations)</option>
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium">Doctor</span>
          <select className={`${FIELD} w-56`} value={doctorFilter} onChange={(e) => setDoctorFilter(e.target.value)}>
            <option value="">All doctors</option>
            {doctors.map((d: Doctor) => (
              <option key={d.id} value={d.id}>
                {d.name}
                {d.employeeId ? ` (${d.employeeId})` : ""}
              </option>
            ))}
          </select>
        </label>
        {filtered && (
          <button
            className={BTN_GHOST}
            onClick={() => {
              setLocationFilter("");
              setDoctorFilter("");
            }}
          >
            Clear filters
          </button>
        )}
        <div className="ml-auto flex rounded-md border border-black/20 text-sm dark:border-white/25" role="group" aria-label="View">
          {(["calendar", "list"] as const).map((v) => (
            <button
              key={v}
              aria-pressed={view === v}
              onClick={() => setView(v)}
              className={`px-3 py-1.5 font-medium first:rounded-l-md last:rounded-r-md ${view === v ? "bg-foreground text-background" : "hover:bg-black/5 dark:hover:bg-white/10"}`}
            >
              {v === "calendar" ? "Calendar" : "List"}
            </button>
          ))}
        </div>
      </div>

      <p className="text-sm opacity-70">
        {worked.length} {worked.length === 1 ? "shift" : "shifts"}
        {filtered && " match the filters"}
        {worked.length > 0 && ` · ${fmtHours(totalRaw)} raw h · ${fmtHours(totalRatio)} ratio h`}
      </p>

      {doctors.length === 0 ? (
        <p className="rounded-lg border border-dashed border-black/20 p-8 text-center text-sm dark:border-white/25">
          No doctors yet. Add some on the Doctors page to start scheduling.
        </p>
      ) : view === "calendar" ? (
        <div className="overflow-x-auto rounded-lg border border-black/15 dark:border-white/20">
          <div className="grid min-w-[56rem] grid-cols-7">
            {weeks[0].map((d) => (
              <div key={toISO(d)} className="border-b border-black/15 bg-black/[0.03] p-2 text-xs font-medium dark:border-white/20 dark:bg-white/[0.05]">
                {fmtWeekday(d)}
              </div>
            ))}
            {weeks.flat().map((d) => {
              const iso = toISO(d);
              const inMonth = iso >= monthFrom && iso <= monthTo;
              const entries = inMonth ? (byDate.get(iso) ?? []) : [];
              return (
                <div
                  key={iso}
                  className={`group min-h-28 space-y-1 border-b border-l border-black/10 p-1 first:border-l-0 dark:border-white/15 ${inMonth ? "" : "bg-black/[0.03] opacity-40 dark:bg-white/[0.03]"}`}
                >
                  <div className="flex items-center justify-between px-0.5">
                    <span className={`text-xs ${iso === todayISO ? "rounded-full bg-sky-600 px-1.5 font-bold text-white" : "opacity-70"}`}>{d.getDate()}</span>
                    {inMonth && (
                      <button
                        onClick={() => openNew(iso)}
                        aria-label={`Add shift on ${fmtMonthDay(d)}`}
                        className="rounded px-1 text-xs opacity-0 hover:bg-black/5 focus:opacity-100 group-hover:opacity-60 dark:hover:bg-white/10"
                      >
                        +
                      </button>
                    )}
                  </div>
                  {entries.map((s) => renderEntry(s, true))}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {visible.length === 0 && (
            <p className="rounded-lg border border-dashed border-black/20 p-8 text-center text-sm dark:border-white/25">Nothing scheduled{filtered ? " for these filters" : ""} this month.</p>
          )}
          {[...byDate.entries()].map(([iso, list]) => (
            <section key={iso} className="overflow-hidden rounded-lg border border-black/15 dark:border-white/20">
              <h2 className={`flex items-center justify-between px-3 py-1.5 text-sm font-medium ${iso === todayISO ? "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-100" : "bg-black/[0.03] dark:bg-white/[0.05]"}`}>
                <span>
                  {fmtWeekday(parseISO(iso))}, {fmtMonthDay(parseISO(iso))}
                </span>
                <button onClick={() => openNew(iso)} className="text-xs font-normal underline">
                  Add shift
                </button>
              </h2>
              <table className="w-full text-sm">
                <tbody>
                  {list.map((s) => {
                    const doc = doctorById.get(s.doctorId);
                    const color = DOCTOR_COLORS[(doc?.color ?? 0) % 6];
                    return (
                      <tr key={s.id} className="cursor-pointer border-t border-black/10 hover:bg-black/[0.03] dark:border-white/15 dark:hover:bg-white/[0.05]" onClick={() => setDialog({ mode: "edit", shift: s })}>
                        <td className="w-44 p-2">{s.kind === "time-off" ? <span className="opacity-60">-</span> : locationName(s.locationId)}</td>
                        <td className="p-2 font-medium">
                          {s.kind === "time-off" ? "Time off" : s.name || "Shift"}
                          {s.category !== "regular" && s.category !== "time-off" && (
                            <span className="ml-1.5 rounded bg-black/10 px-1 text-[10px] uppercase dark:bg-white/15">{categoryLabel(s.category)}</span>
                          )}
                        </td>
                        <td className="p-2">
                          <span className={`mr-1.5 inline-block h-2 w-2 rounded-full ${color.dot}`} />
                          {doc?.name ?? "?"}
                          {doc?.employeeId && <span className="ml-1 text-xs opacity-60">{doc.employeeId}</span>}
                        </td>
                        <td className="whitespace-nowrap p-2">{s.kind === "time-off" ? "All day" : fmtTimeRange(s.start, s.end)}</td>
                        <td className="whitespace-nowrap p-2 text-right text-xs opacity-70">
                          {s.kind === "work" && `${fmtHours(rawHours(s))}h${s.ratio !== 1 ? ` × ${fmtRatio(s.ratio)} = ${fmtHours(ratioHours(s))}` : ""}`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
          ))}
        </div>
      )}

      {dialog && (
        <ShiftDialog
          key={dialog.mode === "edit" ? dialog.shift.id : `${dialog.doctorId}-${dialog.date}`}
          state={dialog}
          doctors={doctors}
          shifts={shifts}
          locations={locations}
          shiftTypes={shiftTypes}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}
