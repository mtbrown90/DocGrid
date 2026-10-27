"use client";

import { useState } from "react";
import { toISO } from "@/lib/dates";
import { BTN_GHOST, FIELD, Label } from "./ui";

/** Dropdown to download the worked-hours workbook for a date range. */
export function ExportPanel() {
  // Defaults to the current calendar month.
  const [from, setFrom] = useState(() => {
    const now = new Date();
    return toISO(new Date(now.getFullYear(), now.getMonth(), 1));
  });
  const [to, setTo] = useState(() => {
    const now = new Date();
    return toISO(new Date(now.getFullYear(), now.getMonth() + 1, 0));
  });
  const valid = Boolean(from) && Boolean(to) && from <= to;

  return (
    <details className="relative">
      <summary className={`${BTN_GHOST} cursor-pointer list-none border border-black/20 dark:border-white/25`}>Export to Excel</summary>
      <div className="absolute right-0 z-20 mt-2 w-72 space-y-3 rounded-lg border border-black/15 bg-background p-4 shadow-lg dark:border-white/20">
        <p className="text-xs opacity-70">
          Worked shifts, dates, raw hours and ratio hours by doctor name and ID. Time off is not included. Overnight shifts count on the day they start.
        </p>
        <Label text="From">
          <input type="date" className={FIELD} value={from} onChange={(e) => setFrom(e.target.value)} />
        </Label>
        <Label text="To">
          <input type="date" className={FIELD} value={to} onChange={(e) => setTo(e.target.value)} />
        </Label>
        {valid ? (
          <a
            href={`/api/export?from=${from}&to=${to}`}
            download
            className="block rounded-md bg-foreground px-3 py-1.5 text-center text-sm font-medium text-background"
          >
            Download .xlsx
          </a>
        ) : (
          <p className="text-xs text-red-700 dark:text-red-300">Pick a start date that is on or before the end date.</p>
        )}
      </div>
    </details>
  );
}
