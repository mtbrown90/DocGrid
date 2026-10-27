"use client";

import Link from "next/link";
import { useState } from "react";
import { deleteGeneratedShifts, saveGeneratedSchedule } from "@/app/actions";
import { fmtHours, fmtMonthDay, fmtTimeRange, parseISO, toISO } from "@/lib/dates";
import { PREF_STRENGTHS, generateSchedule, type GenerateResult, type PrefStrength } from "@/lib/generator";
import { useHydrated } from "@/lib/schedule";
import { categoryLabel, type ScheduleData } from "@/lib/types";
import { BTN_DANGER, BTN_GHOST, BTN_PRIMARY, ErrorBox, FIELD, Label, useAction } from "./ui";

/** A generated draft plus the settings it was made with, so Save uses exactly those. */
interface Draft {
  result: GenerateResult;
  from: string;
  to: string;
  replace: boolean;
}

function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split("-").map(Number);
  return { from: toISO(new Date(y, m - 1, 1)), to: toISO(new Date(y, m, 0)) };
}

export function GeneratorPanel({ doctors, shifts, locations, shiftTypes, prefs }: ScheduleData) {
  const hydrated = useHydrated();
  // Defaults to next month, the usual thing to plan.
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return toISO(new Date(now.getFullYear(), now.getMonth() + 1, 1)).slice(0, 7);
  });
  const [selected, setSelected] = useState<Set<string>>(() => new Set(shiftTypes.map((t) => t.id)));
  const [restHours, setRestHours] = useState("9");
  const [maxHours, setMaxHours] = useState("");
  const [prefStrength, setPrefStrength] = useState<PrefStrength>("medium");
  const [replace, setReplace] = useState(true);
  const [seed, setSeed] = useState(1);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const { pending, error, run, setError } = useAction();

  if (!hydrated) return <p className="p-6 text-sm opacity-60">Loading…</p>;

  const { from, to } = monthRange(month);
  const typeName = (id: string) => shiftTypes.find((t) => t.id === id);
  const locationName = (id: string | null) => (id ? (locations.find((l) => l.id === id)?.name ?? "?") : "All locations");
  const generatedInRange = shifts.filter((s) => s.generated && s.date >= from && s.date <= to).length;

  // Any input change makes an existing preview stale.
  function change<T>(setter: (v: T) => void) {
    return (v: T) => {
      setter(v);
      setDraft(null);
      setMessage(null);
    };
  }

  function generate(nextSeed: number) {
    setError(null);
    setMessage(null);
    const rest = Math.max(0, Number(restHours) || 0);
    const cap = maxHours.trim() === "" ? null : Math.max(0, Number(maxHours) || 0);
    const result = generateSchedule(doctors, shifts, shiftTypes, prefs, {
      from,
      to,
      typeIds: [...selected],
      restHours: rest,
      maxHours: cap,
      prefStrength,
      seed: nextSeed,
      replaceGenerated: replace,
    });
    setSeed(nextSeed);
    setDraft({ result, from, to, replace });
  }

  function save() {
    if (!draft) return;
    const { result } = draft;
    const replacing = draft.replace && generatedInRange > 0;
    const ok = confirm(
      `Save ${result.assignments.length} shifts to the schedule?` +
        (replacing ? `\n\nThis replaces ${generatedInRange} previously generated shifts in this month. Shifts you entered or edited by hand are kept.` : ""),
    );
    if (!ok) return;
    setMessage(null);
    run(
      async () => {
        const res = await saveGeneratedSchedule(draft.from, draft.to, result.assignments, draft.replace);
        if (!res.error) setMessage(`Saved ${res.saved} shifts.`);
        return res;
      },
      () => setDraft(null),
    );
  }

  function removeGenerated() {
    if (!confirm(`Delete the ${generatedInRange} generated shifts in this month? Shifts you entered or edited by hand are kept.`)) return;
    setMessage(null);
    run(async () => {
      const res = await deleteGeneratedShifts(from, to);
      if (!res.error) setMessage(`Deleted ${res.saved} generated shifts.`);
      return res;
    });
  }

  const typeGroups = [
    { key: "all", label: "All locations", types: shiftTypes.filter((t) => !t.locationId) },
    ...locations.map((l) => ({ key: l.id, label: l.name, types: shiftTypes.filter((t) => t.locationId === l.id) })),
  ].filter((g) => g.types.length > 0);

  const toggle = (ids: string[], on: boolean) => {
    const next = new Set(selected);
    ids.forEach((id) => (on ? next.add(id) : next.delete(id)));
    setSelected(next);
    setDraft(null);
    setMessage(null);
  };

  if (doctors.length === 0 || shiftTypes.length === 0) {
    return (
      <div className="space-y-2">
        <h1 className="text-lg font-semibold">Generate a schedule</h1>
        <p className="text-sm opacity-70">
          Add doctors on the Doctors page and shift types on the Setup page first. The generator needs both.
        </p>
      </div>
    );
  }

  const result = draft?.result;
  const filledPct = result && result.slotCount > 0 ? Math.round((100 * result.assignments.length) / result.slotCount) : 100;
  const statByDoctor = new Map(result?.stats.map((s) => [s.doctorId, s]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Generate a schedule</h1>
        <p className="text-sm opacity-70">Builds a preliminary draft for a month. Nothing is saved until you click Save, and you can edit afterwards on the Schedule page.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
        <div className="space-y-4">
          <Label text="Month">
            <input type="month" className={FIELD} value={month} onChange={(e) => change(setMonth)(e.target.value)} />
          </Label>

          <fieldset className="space-y-2 rounded-md border border-black/15 p-3 dark:border-white/20">
            <legend className="px-1 text-sm font-medium">
              Shifts to fill each day ({selected.size} of {shiftTypes.length})
            </legend>
            <div className="flex gap-2 text-xs">
              <button type="button" className="underline" onClick={() => toggle(shiftTypes.map((t) => t.id), true)}>
                Select all
              </button>
              <button type="button" className="underline" onClick={() => toggle(shiftTypes.map((t) => t.id), false)}>
                Select none
              </button>
            </div>
            <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
              {typeGroups.map((g) => (
                <div key={g.key}>
                  <label className="flex items-center gap-2 text-sm font-medium">
                    <input
                      type="checkbox"
                      checked={g.types.every((t) => selected.has(t.id))}
                      onChange={(e) => toggle(g.types.map((t) => t.id), e.target.checked)}
                    />
                    {g.label}
                  </label>
                  <div className="ml-6 space-y-0.5">
                    {g.types.map((t) => (
                      <label key={t.id} className="flex items-center gap-2 text-xs">
                        <input type="checkbox" checked={selected.has(t.id)} onChange={(e) => toggle([t.id], e.target.checked)} />
                        <span>
                          {t.name} <span className="opacity-60">{fmtTimeRange(t.start, t.end)}</span>
                          {t.category !== "regular" && <span className="ml-1 opacity-60">({categoryLabel(t.category)})</span>}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </fieldset>

          <div className="grid grid-cols-2 gap-3">
            <Label text="Rest between shifts (h)">
              <input type="number" min={0} className={FIELD} value={restHours} onChange={(e) => change(setRestHours)(e.target.value)} />
            </Label>
            <Label text="Max hours per doctor">
              <input
                type="number"
                min={0}
                placeholder="No cap"
                className={FIELD}
                value={maxHours}
                onChange={(e) => change(setMaxHours)(e.target.value)}
              />
            </Label>
          </div>

          <Label text="Location preference strength">
            <select className={FIELD} value={prefStrength} onChange={(e) => change(setPrefStrength)(e.target.value as PrefStrength)}>
              {PREF_STRENGTHS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </Label>

          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={replace} onChange={(e) => change(setReplace)(e.target.checked)} />
            <span>
              Replace previously generated shifts in this month
              <span className="block text-xs opacity-60">
                {generatedInRange > 0 ? `${generatedInRange} generated shifts exist in this month.` : "None exist in this month yet."} Shifts entered or
                edited by hand are never replaced.
              </span>
            </span>
          </label>

          <div className="flex flex-wrap gap-2">
            <button className={BTN_PRIMARY} disabled={selected.size === 0} onClick={() => generate(seed)}>
              Generate preview
            </button>
            {generatedInRange > 0 && (
              <button className={BTN_DANGER} disabled={pending} onClick={removeGenerated}>
                Delete generated shifts
              </button>
            )}
          </div>

          <details className="text-xs opacity-80">
            <summary className="cursor-pointer font-medium">Rules the generator follows</summary>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Every selected shift is filled every day, one doctor per listing.</li>
              <li>Nocturnists only work night shifts. Other doctors can too, but nocturnists are preferred.</li>
              <li>MDOC goes only to doctors whose MDOC location matches. AOC only to doctors who can be AOC. Anyone can cover Call.</li>
              <li>No one is double-booked. The only overlap allowed is a regular shift during their MDOC.</li>
              <li>Nobody works over their time off.</li>
              <li>The rest period applies between regular, Call and AOC shifts. MDOC is exempt.</li>
              <li>Hours are spread evenly, nudged by each doctor&apos;s location percentages.</li>
              <li>Shifts already on the schedule stay, and their slots are skipped.</li>
            </ul>
          </details>
        </div>

        <div className="min-w-0 space-y-4">
          <ErrorBox message={error} />
          {message && (
            <p className="rounded-md bg-emerald-100 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">
              {message}{" "}
              <Link href="/" className="font-medium underline">
                View the schedule
              </Link>
            </p>
          )}

          {!result && !message && (
            <p className="rounded-lg border border-dashed border-black/20 p-8 text-center text-sm opacity-70 dark:border-white/25">
              Choose a month and the shifts to fill, then click Generate preview.
            </p>
          )}

          {result && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-black/15 p-3 dark:border-white/20">
                <div className="text-sm">
                  <div className="font-medium">
                    {result.assignments.length} of {result.slotCount} shifts filled ({filledPct}%)
                  </div>
                  <div className={result.unfilled.length > 0 ? "text-amber-700 dark:text-amber-300" : "opacity-60"}>
                    {result.unfilled.length > 0 ? `${result.unfilled.length} could not be filled.` : "Everything is covered."}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button className={BTN_GHOST} onClick={() => generate(seed + 1)}>
                    Regenerate
                  </button>
                  <button className={BTN_PRIMARY} disabled={pending || result.assignments.length === 0} onClick={save}>
                    {pending ? "Saving…" : "Save to schedule"}
                  </button>
                </div>
              </div>

              {result.unfilled.length > 0 && (
                <details className="rounded-lg border border-amber-300 p-3 text-sm dark:border-amber-800" open={result.unfilled.length <= 12}>
                  <summary className="cursor-pointer font-medium">Unfilled shifts ({result.unfilled.length})</summary>
                  <p className="mt-1 text-xs opacity-70">
                    Usually there are not enough doctors for the selected shifts. Add doctors, deselect shifts, or raise the hours cap.
                  </p>
                  <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto text-xs">
                    {result.unfilled.slice(0, 200).map((u, i) => {
                      const t = typeName(u.shiftTypeId);
                      return (
                        <li key={i}>
                          <span className="font-medium">{fmtMonthDay(parseISO(u.date))}</span> · {t?.name} · {locationName(t?.locationId ?? null)}
                          <span className="block pl-3 opacity-70">{u.reason}</span>
                        </li>
                      );
                    })}
                    {result.unfilled.length > 200 && <li>…and {result.unfilled.length - 200} more.</li>}
                  </ul>
                </details>
              )}

              <div className="overflow-x-auto rounded-lg border border-black/15 dark:border-white/20">
                <table className="w-full min-w-[46rem] text-sm">
                  <thead className="bg-black/[0.03] text-left dark:bg-white/[0.05]">
                    <tr>
                      {["Doctor", "Shifts", "Raw h", "Ratio h", "MDOC days", "AOC", "Regular shifts by location (preference)"].map((h) => (
                        <th key={h} className="p-2 font-medium">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {doctors.map((d) => {
                      const s = statByDoctor.get(d.id);
                      if (!s) return null;
                      const myPrefs = prefs.filter((p) => p.doctorId === d.id && p.percent > 0);
                      const total = Object.values(s.regularByLocation).reduce((a, b) => a + b, 0);
                      const split = Object.entries(s.regularByLocation)
                        .sort((a, b) => b[1] - a[1])
                        .map(([loc, n]) => {
                          const want = myPrefs.find((p) => p.locationId === loc);
                          return `${locationName(loc)} ${n}${want ? ` (${fmtHours(want.percent)}%)` : total > 0 ? " (0%)" : ""}`;
                        })
                        .join(" · ");
                      return (
                        <tr key={d.id} className="border-t border-black/10 dark:border-white/15">
                          <td className="p-2">
                            <span className="font-medium">{d.name}</span>
                            <span className="ml-1.5 text-xs opacity-60">{d.employeeId}</span>
                            {d.isNocturnist && <span className="ml-1.5 text-xs opacity-60">nocturnist</span>}
                          </td>
                          <td className="p-2">{s.shifts}</td>
                          <td className="p-2">{fmtHours(s.rawHours)}</td>
                          <td className="p-2">{fmtHours(s.ratioHours)}</td>
                          <td className="p-2">{s.mdocDays}</td>
                          <td className="p-2">{s.aocShifts}</td>
                          <td className="p-2 text-xs">{split || "-"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="text-xs opacity-60">
                Hours count regular, Call and AOC shifts. MDOC is shown as days. The number in brackets is that doctor&apos;s target for the location.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
