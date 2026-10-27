"use client";

import { useState } from "react";
import {
  addDays,
  fmtMonthDay,
  fmtTime,
  fmtWeekday,
  fmtWeekRange,
  startOfWeek,
  toISO,
  weekDays,
} from "@/lib/dates";
import { useHydrated } from "@/lib/schedule";
import { DOCTOR_COLORS, type Doctor, type Shift } from "@/lib/types";
import { ShiftDialog, type DialogState } from "./ShiftDialog";

export function ScheduleBoard({ doctors, shifts }: { doctors: Doctor[]; shifts: Shift[] }) {
  const hydrated = useHydrated();
  // Anchor is set lazily on the client; the board renders a placeholder until hydrated.
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [dialog, setDialog] = useState<DialogState | null>(null);

  if (!hydrated) {
    return <p className="p-6 text-sm opacity-60">Loading schedule…</p>;
  }

  const days = weekDays(weekStart);
  const todayISO = toISO(new Date());

  // Doctors working a clinic shift each day; zero means a coverage gap.
  const coverage = days.map((d) => {
    const iso = toISO(d);
    return new Set(shifts.filter((s) => s.date === iso && s.kind === "clinic").map((s) => s.doctorId)).size;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            className="rounded-md border border-black/20 px-3 py-1.5 text-sm dark:border-white/25"
            onClick={() => setWeekStart(addDays(weekStart, -7))}
            aria-label="Previous week"
          >
            ←
          </button>
          <button
            className="rounded-md border border-black/20 px-3 py-1.5 text-sm dark:border-white/25"
            onClick={() => setWeekStart(startOfWeek(new Date()))}
          >
            Today
          </button>
          <button
            className="rounded-md border border-black/20 px-3 py-1.5 text-sm dark:border-white/25"
            onClick={() => setWeekStart(addDays(weekStart, 7))}
            aria-label="Next week"
          >
            →
          </button>
          <h1 className="ml-2 text-lg font-semibold">{fmtWeekRange(weekStart)}</h1>
        </div>
        <button
          className="rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background disabled:opacity-40"
          disabled={doctors.length === 0}
          onClick={() => setDialog({ mode: "new", doctorId: doctors[0].id, date: todayISO })}
        >
          Add shift
        </button>
      </div>

      {doctors.length === 0 ? (
        <p className="rounded-lg border border-dashed border-black/20 p-8 text-center text-sm dark:border-white/25">
          No doctors yet. Add some on the Doctors page to start scheduling.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-black/15 dark:border-white/20">
          <table className="w-full min-w-[56rem] table-fixed border-collapse text-sm">
            <thead>
              <tr className="bg-black/[0.03] dark:bg-white/[0.05]">
                <th className="w-44 border-b border-black/15 p-2 text-left font-medium dark:border-white/20">
                  Doctor
                </th>
                {days.map((d, i) => {
                  const isToday = toISO(d) === todayISO;
                  return (
                    <th
                      key={toISO(d)}
                      className="border-b border-l border-black/15 p-2 text-left font-medium dark:border-white/20"
                    >
                      <div className={isToday ? "font-bold text-sky-700 dark:text-sky-300" : ""}>
                        {fmtWeekday(d)} {fmtMonthDay(d)}
                      </div>
                      <div
                        className={`text-xs font-normal ${
                          coverage[i] === 0 ? "text-red-700 dark:text-red-300" : "opacity-60"
                        }`}
                      >
                        {coverage[i] === 0 ? "No clinic coverage" : `${coverage[i]} in clinic`}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {doctors.map((doc) => (
                <tr key={doc.id}>
                  <th className="border-b border-black/10 p-2 text-left align-top font-normal dark:border-white/15">
                    <div className="flex items-center gap-2">
                      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${DOCTOR_COLORS[doc.color % 6].dot}`} />
                      <span className="font-medium">{doc.name}</span>
                    </div>
                    <div className="pl-[1.125rem] text-xs opacity-60">{doc.specialty}</div>
                  </th>
                  {days.map((d) => {
                    const iso = toISO(d);
                    const cell = shifts
                      .filter((s) => s.doctorId === doc.id && s.date === iso)
                      .sort((a, b) => a.start.localeCompare(b.start));
                    return (
                      <td
                        key={iso}
                        className="group border-b border-l border-black/10 p-1 align-top dark:border-white/15"
                      >
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
                                  <span className="font-medium">
                                    {fmtTime(s.start)}–{fmtTime(s.end)}
                                  </span>
                                  <span className="block truncate opacity-75">
                                    {s.kind === "on-call" ? "On call" : ""}
                                    {s.kind === "on-call" && s.location ? " · " : ""}
                                    {s.location}
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
              ))}
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
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}
