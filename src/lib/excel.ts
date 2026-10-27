import ExcelJS from "exceljs";
import { fmtTime, fmtWeekday, parseISO } from "./dates";
import { ratioHours, rawHours } from "./schedule";
import type { ScheduleData } from "./types";

/**
 * Doctor import/export workbook format.
 *
 * "Doctors" sheet, header row then one row per doctor:
 *   ID | Name | Specialty | Phone | Email | Address | Nocturnist | % <Location> ...
 * Each "% <Location>" column is that doctor's preferred share of shifts at the
 * location (0-100); a doctor's percentages must add up to 100.
 * Optional "Locations" sheet: one location name per row (column A).
 */

export const DOCTOR_SHEET = "Doctors";
export const LOCATION_SHEET = "Locations";
export const MAX_IMPORT_ROWS = 500;

export interface ParsedDoctor {
  employeeId: string;
  name: string;
  specialty: string;
  phone: string;
  email: string;
  address: string;
  isNocturnist: boolean;
  /** Location name (as written in the file) -> percent. Only non-zero entries. */
  prefs: { location: string; percent: number }[];
}

export interface ParseResult {
  doctors: ParsedDoctor[];
  /** Every location named in the file, de-duplicated case-insensitively. */
  locations: string[];
  /** True when the file has any "% <Location>" column, so blank cells mean "no preference". */
  hasPrefColumns: boolean;
  errors: string[];
}

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const obj = value as unknown as Record<string, unknown>;
  if (Array.isArray(obj.richText)) {
    return (obj.richText as { text: string }[]).map((r) => r.text).join("").trim();
  }
  if (typeof obj.text === "string") return obj.text.trim(); // hyperlink
  if (obj.result !== undefined) return cellText(obj.result as ExcelJS.CellValue); // formula
  return "";
}

function parseYesNo(text: string): boolean | null {
  const t = text.toLowerCase();
  if (["", "no", "n", "false", "0"].includes(t)) return false;
  if (["yes", "y", "true", "1", "x"].includes(t)) return true;
  return null;
}

export async function parseDoctorWorkbook(data: ArrayBuffer): Promise<ParseResult> {
  const result: ParseResult = { doctors: [], locations: [], hasPrefColumns: false, errors: [] };

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(data);
  const sheet = wb.getWorksheet(DOCTOR_SHEET) ?? wb.worksheets[0];
  if (!sheet) {
    result.errors.push("The workbook has no sheets.");
    return result;
  }

  // Header row -> column positions.
  const cols: Record<string, number> = {};
  const prefCols: { col: number; location: string }[] = [];
  const seenPref = new Set<string>();
  sheet.getRow(1).eachCell({ includeEmpty: false }, (cell, col) => {
    const header = cellText(cell.value);
    const pref = header.match(/^%\s*(.+)$/);
    if (pref) {
      const location = pref[1].trim();
      if (seenPref.has(location.toLowerCase())) {
        result.errors.push(`Header "${header}" appears more than once.`);
      } else {
        seenPref.add(location.toLowerCase());
        prefCols.push({ col, location });
      }
    } else {
      cols[header.toLowerCase()] = col;
    }
  });
  for (const required of ["id", "name"]) {
    if (!cols[required]) result.errors.push(`Missing required column "${required === "id" ? "ID" : "Name"}" in row 1.`);
  }
  if (result.errors.length) return result;

  result.hasPrefColumns = prefCols.length > 0;
  const get = (row: ExcelJS.Row, key: string) => (cols[key] ? cellText(row.getCell(cols[key]).value) : "");

  const seenIds = new Set<string>();
  let dataRows = 0;
  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const anyValue = Array.from({ length: sheet.columnCount }, (_, i) => cellText(row.getCell(i + 1).value)).some(Boolean);
    if (!anyValue) continue;
    if (++dataRows > MAX_IMPORT_ROWS) {
      result.errors.push(`Too many rows: the limit is ${MAX_IMPORT_ROWS} doctors per file.`);
      break;
    }

    const where = `Row ${r}`;
    const employeeId = get(row, "id");
    const name = get(row, "name");
    if (!employeeId) result.errors.push(`${where}: ID is required.`);
    if (!name) result.errors.push(`${where}: Name is required.`);
    if (employeeId) {
      if (seenIds.has(employeeId.toLowerCase())) result.errors.push(`${where}: ID "${employeeId}" appears more than once.`);
      seenIds.add(employeeId.toLowerCase());
    }

    const nocturnist = parseYesNo(get(row, "nocturnist"));
    if (nocturnist === null) result.errors.push(`${where}: Nocturnist must be Yes or No.`);

    const prefs: ParsedDoctor["prefs"] = [];
    let total = 0;
    let prefsValid = true;
    for (const { col, location } of prefCols) {
      const raw = cellText(row.getCell(col).value).replace(/%$/, "").trim();
      if (!raw) continue;
      const percent = Number(raw);
      if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
        result.errors.push(`${where}: "% ${location}" must be a number from 0 to 100.`);
        prefsValid = false;
        continue;
      }
      total += percent;
      if (percent > 0) prefs.push({ location, percent });
    }
    if (prefsValid && prefs.length > 0 && Math.abs(total - 100) > 0.01) {
      result.errors.push(`${where}: location percentages add up to ${Math.round(total * 100) / 100}, not 100.`);
    }

    result.doctors.push({
      employeeId,
      name,
      specialty: get(row, "specialty"),
      phone: get(row, "phone"),
      email: get(row, "email"),
      address: get(row, "address"),
      isNocturnist: nocturnist ?? false,
      prefs,
    });
  }

  // Locations: the optional Locations sheet plus every preference column.
  const names: string[] = [];
  const locSheet = wb.getWorksheet(LOCATION_SHEET);
  if (locSheet) {
    for (let r = 1; r <= locSheet.rowCount; r++) {
      const text = cellText(locSheet.getRow(r).getCell(1).value);
      if (text && !(r === 1 && ["name", "location", "locations"].includes(text.toLowerCase()))) names.push(text);
    }
  }
  names.push(...prefCols.map((p) => p.location));
  const seen = new Set<string>();
  for (const n of names) {
    if (!seen.has(n.toLowerCase())) {
      seen.add(n.toLowerCase());
      result.locations.push(n);
    }
  }

  if (dataRows === 0 && result.errors.length === 0) result.errors.push("No doctor rows found under the header.");
  return result;
}

const cents = (n: number) => Math.round(n * 100) / 100; // sums of 2-decimal values, minus float noise

/**
 * Hours report for worked shifts starting between `from` and `to` (inclusive, YYYY-MM-DD).
 * Sheet "Summary": one row per doctor. Sheet "Shifts": one row per worked shift.
 * Time off is not work and is excluded. Overnight shifts count on the day they start.
 */
export async function buildHoursExport(data: ScheduleData, from: string, to: string): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  const doctors = [...data.doctors].sort((a, b) => a.name.localeCompare(b.name) || a.employeeId.localeCompare(b.employeeId));
  const locationName = (id: string | null) => data.locations.find((l) => l.id === id)?.name ?? "";
  const typeById = new Map(data.shiftTypes.map((t) => [t.id, t]));

  const worked = data.shifts.filter((s) => s.kind === "work" && s.date >= from && s.date <= to);

  // Summary ------------------------------------------------------------------
  const summary = wb.addWorksheet("Summary");
  summary.addRow(["ID", "Name", "Shifts worked", "Raw hours", "Ratio hours"]).font = { bold: true };
  let totalShifts = 0;
  let totalRaw = 0;
  let totalRatio = 0;
  for (const d of doctors) {
    const mine = worked.filter((s) => s.doctorId === d.id);
    const raw = cents(mine.reduce((sum, s) => sum + rawHours(s), 0));
    const ratio = cents(mine.reduce((sum, s) => sum + ratioHours(s), 0));
    summary.addRow([d.employeeId, d.name, mine.length, raw, ratio]);
    totalShifts += mine.length;
    totalRaw += raw;
    totalRatio += ratio;
  }
  const totalRow = summary.addRow(["", "Total", totalShifts, cents(totalRaw), cents(totalRatio)]);
  totalRow.font = { bold: true };
  summary.getColumn(4).numFmt = "0.00";
  summary.getColumn(5).numFmt = "0.00";
  [14, 28, 14, 14, 14].forEach((w, i) => (summary.getColumn(i + 1).width = w));
  summary.views = [{ state: "frozen", ySplit: 1 }];

  // Shifts -------------------------------------------------------------------
  const sheet = wb.addWorksheet("Shifts");
  sheet.addRow(["ID", "Name", "Date", "Day", "Shift", "Type", "Location", "Start", "End", "Raw hours", "Ratio", "Ratio hours"]).font = { bold: true };
  const nameOf = new Map(doctors.map((d) => [d.id, d]));
  const ordered = [...worked].sort((a, b) => {
    const da = nameOf.get(a.doctorId);
    const db = nameOf.get(b.doctorId);
    return (
      (da?.name ?? "").localeCompare(db?.name ?? "") ||
      (da?.employeeId ?? "").localeCompare(db?.employeeId ?? "") ||
      a.date.localeCompare(b.date) ||
      a.start.localeCompare(b.start)
    );
  });
  for (const s of ordered) {
    const d = nameOf.get(s.doctorId);
    const type = s.shiftTypeId ? typeById.get(s.shiftTypeId) : undefined;
    const [y, m, day] = s.date.split("-").map(Number);
    sheet.addRow([
      d?.employeeId ?? "",
      d?.name ?? "",
      new Date(Date.UTC(y, m - 1, day)),
      fmtWeekday(parseISO(s.date)),
      s.name,
      [type?.isNight ? "Night" : "", type?.isCall ? "Call" : ""].filter(Boolean).join(", "),
      locationName(s.locationId),
      fmtTime(s.start),
      fmtTime(s.end),
      rawHours(s),
      s.ratio,
      ratioHours(s),
    ]);
  }
  sheet.getColumn(3).numFmt = "yyyy-mm-dd";
  sheet.getColumn(10).numFmt = "0.00";
  sheet.getColumn(11).numFmt = "0.00000";
  sheet.getColumn(12).numFmt = "0.00";
  [12, 26, 12, 7, 18, 12, 18, 10, 10, 11, 10, 12].forEach((w, i) => (sheet.getColumn(i + 1).width = w));
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = { from: "A1", to: "L1" };

  return wb.xlsx.writeBuffer() as Promise<ArrayBuffer>;
}

/** Blank workbook with the right headers (one "% <Location>" column per location). */
export async function buildDoctorTemplate(locationNames: string[]): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();

  const doctors = wb.addWorksheet(DOCTOR_SHEET);
  const headers = ["ID", "Name", "Specialty", "Phone", "Email", "Address", "Nocturnist", ...locationNames.map((n) => `% ${n}`)];
  doctors.addRow(headers).font = { bold: true };
  headers.forEach((h, i) => {
    doctors.getColumn(i + 1).width = Math.max(12, h.length + 4);
  });
  doctors.views = [{ state: "frozen", ySplit: 1 }];

  const locations = wb.addWorksheet(LOCATION_SHEET);
  locations.addRow(["Name"]).font = { bold: true };
  locationNames.forEach((n) => locations.addRow([n]));
  locations.getColumn(1).width = 28;

  const help = wb.addWorksheet("Instructions");
  [
    "How to fill in the Doctors sheet",
    "",
    "ID and Name are required. ID must be unique; an existing doctor with the same ID is updated.",
    "Nocturnist: Yes or No.",
    "Each \"% <Location>\" column is the share of that doctor's shifts they would like at that location.",
    "A doctor's percentages must add up to 100. Leave all of them blank for no preference.",
    "To add a new location, add a column headed \"% Location Name\" (or list it on the Locations sheet).",
    "Importing never deletes doctors; it only adds and updates.",
  ].forEach((line, i) => {
    const row = help.addRow([line]);
    if (i === 0) row.font = { bold: true };
  });
  help.getColumn(1).width = 110;

  return wb.xlsx.writeBuffer() as Promise<ArrayBuffer>;
}
