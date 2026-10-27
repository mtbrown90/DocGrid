import { NextRequest } from "next/server";
import { getScheduleData } from "@/lib/data";
import { buildHoursExport } from "@/lib/excel";

const ISO_DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

// Signed-out requests are redirected to /login by src/proxy.ts before reaching here.
export async function GET(request: NextRequest) {
  const from = request.nextUrl.searchParams.get("from") ?? "";
  const to = request.nextUrl.searchParams.get("to") ?? "";
  if (!ISO_DATE.test(from) || !ISO_DATE.test(to)) {
    return new Response("Provide from and to as YYYY-MM-DD.", { status: 400 });
  }
  if (from > to) return new Response("'from' must not be after 'to'.", { status: 400 });

  let file: ArrayBuffer;
  try {
    file = await buildHoursExport(await getScheduleData(), from, to);
  } catch (e) {
    return new Response(e instanceof Error ? e.message : "Export failed.", { status: 500 });
  }

  return new Response(file, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="docgrid-hours-${from}-to-${to}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
