import { buildDoctorTemplate } from "@/lib/excel";
import { createClient } from "@/lib/supabase/server";

// Signed-out requests are redirected to /login by src/proxy.ts before reaching here.
export async function GET() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("locations").select("name").order("name");
  if (error) return new Response(error.message, { status: 500 });

  const file = await buildDoctorTemplate(data.map((l) => l.name));
  return new Response(file, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="docgrid-doctors-template.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}
