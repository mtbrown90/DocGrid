"use client";

import { useState } from "react";
import {
  addDays,
  fmtHours,
  fmtMonthDay,
  fmtRatio,
  fmtTimeRange,
  fmtWeekday,
  fmtWeekRange,
  startOfWeek,
  toISO,
  weekDays,
} from "@/lib/dates";
import { ratioHours, rawHours, useHydrated } from "@/lib/schedule";
import { DOCTOR_COLORS, categoryLabel, type ScheduleData } from "@/lib/types";
import { ExportPanel } from "./ExportPanel";
import { ShiftDialog, type DialogState } from "./ShiftDialog";
import { BTN_PRIMARY } from "./ui";

const NAV_BTN = "rounded-md border border-black/20 px-3 py-1.5 text-sm dark:border-white/25";

export function ScheduleBoard({ doctors, shifts, locations, shiftTypes }: ScheduleData) {
  const hydrated = useHydrated();
  // Anchor is set lazily on the client; the board renders a placeholder until hydrated.
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [dialog, setDialog] = useState<DialogState | null>(null);

  if (!hydrated) {
    return <p className="p-6 text-sm opacity-60">Loading schedule…</p>;
  }

  const days = weekDays(weekStart);
  const dayISOs = days.map(toISO);
  const todayISO = toISO(new Date());
  const locationName = (id: string | null) => (id ? (locations.find((l) => l.id === id)?.name ?? "") : "All locations");

  // Doctors working a regular shift each day (call, AOC and MDOC don't count); zero means a coverage gap.
  const coverage = dayISOs.map(
    (iso) => new Set(shifts.filter((s) => s.date === iso && s.category === "regular").map((s) => s.doctorId)).size,
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button className={NAV_BTN} onClick={() => setWeekStart(addDays(weekStart, -7))} aria-label="Previous week">
            ←
          </button>
          <button className={NAV_BTN} onClick={() => setWeekStart(startOfWeek(new Date()))}>
            Today
          </button>
          <button className={NAV_BTN} onClick={() => setWeekStart(addDays(weekStart, 7))} aria-label="Next week">
            →
          </button>
          <h1 className="ml-2 text-lg font-semibold">{fmtWeekRange(weekStart)}</h1>
        </div>
        <div className="flex items-center gap-2">
          <ExportPanel />
          <button
            className={BTN_PRIMARY}
            disabled={doctors.length === 0}
            onClick={() => setDialog({ mode: "new", doctorId: doctors[0].id, date: todayISO })}
          >
            Add shift
          </button>
        </div>
      </div>

      {doctors.length === 0 ? (
        <p className="rounded-lg border border-dashed border-black/20 p-8 text-center text-sm dark:border-white/25">
          No doctors yet. Add some on the Doctors page to start scheduling.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-black/15 dark:border-white/20">
          <table className="w-full min-w-[60rem] table-fixed border-collapse text-sm">
            <thead>
              <tr className="bg-black/[0.03] dark:bg-white/[0.05]">
                <th className="w-48 border-b border-black/15 p-2 text-left font-medium dark:border-white/20">Doctor</th>
                {days.map((d, i) => {
                  const isToday = dayISOs[i] === todayISO;
                  return (
                    <th key={dayISOs[i]} className="border-b border-l border-black/15 p-2 text-left font-medium dark:border-white/20">
                      <div className={isToday ? "font-bold text-sky-700 dark:text-sky-300" : ""}>
                        {fmtWeekday(d)} {fmtMonthDay(d)}
                      </div>
                      <div className={`text-xs font-normal ${coverage[i] === 0 ? "text-red-700 dark:text-red-300" : "opacity-60"}`}>
                        {coverage[i] === 0 ? "No coverage" : `${coverage[i]} working`}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {doctors.map((doc) => {
                const weekShifts = shifts.filter((s) => s.doctorId === doc.id && dayISOs.includes(s.date));
                const weekRaw = weekShifts.reduce((sum, s) => sum + rawHours(s), 0);
                const weekRatio = weekShifts.reduce((sum, s) => sum + ratioHours(s), 0);
                return (
                  <tr key={doc.id}>
                    <th className="border-b border-black/10 p-2 text-left align-top font-normal dark:border-white/15">
                      <div className="flex items-center gap-2">
                        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${DOCTOR_COLORS[doc.color % 6].dot}`} />
                        <span className="truncate font-medium">{doc.name}</span>
                      </div>
                      <div className="pl-[1.125rem] text-xs opacity-60">
                        {doc.employeeId && `${doc.employeeId} · `}
                        {doc.isNocturnist ? "Nocturnist" : doc.specialty}
                      </div>
                      <div className="pl-[1.125rem] text-xs opacity-60">
                        Week: {fmtHours(weekRaw)} raw · {fmtHours(weekRatio)} ratio
                      </div>
                    </th>
                    {days.map((d, i) => {
                      const iso = dayISOs[i];
                      const cell = weekShifts.filter((s) => s.date === iso).sort((a, b) => a.start.localeCompare(b.start));
                      return (
                        <td key={iso} className="group border-b border-l border-black/10 p-1 align-top dark:border-white/15">
                          <div className="space-y-1">
                            {cell.map((s) => (
                              <button
                                key={s.id}
                                onClick={() => setDialog({ mode: "edit", shift: s })}
                                className={`block w-full rounded border px-1.5 py-1 text-left text-xs ${
                                  s.kind === "time-off"
                                    ? "border-dashed border-black/30 bg-black/5 dark:border-white/30 dark:bg-white/10"
                                    : DOCTOR_COLORS[doc.color % 6].chip
                                }`}
                              >
                                {s.kind === "time-off" ? (
                                  <span className="font-medium">Time off</span>
                                ) : (
                                  <>
                                    <span className="block truncate font-medium">
                                      {s.name || "Shift"}
                                      {s.category !== "regular" && s.category !== "time-off" && (
                                        <span className="ml-1 rounded bg-black/10 px-1 text-[10px] uppercase dark:bg-white/15">
                                          {categoryLabel(s.category)}
                                        </span>
                                      )}
                                    </span>
                                    <span className="block">{fmtTimeRange(s.start, s.end)}</span>
                                    <span className="block truncate opacity-75">
                                      {[locationName(s.locationId), `${fmtHours(rawHours(s))}h`, s.ratio !== 1 ? `×${fmtRatio(s.ratio)}` : ""]
                                        .filter(Boolean)
                                        .join(" · ")}
                                    </span>
                                  </>
                                )}
                              </button>
                            ))}
                            <button
                              onClick={() => setDialog({ mode: "new", doctorId: doc.id, date: iso })}
                              aria-label={`Add shift for ${doc.name} on ${fmtMonthDay(d)}`}
                              className="w-full rounded py-0.5 text-xs opacity-0 hover:bg-black/5 focus:opacity-100 group-hover:opacity-50 dark:hover:bg-white/10"
                            >
                              +
                            </button>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
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
