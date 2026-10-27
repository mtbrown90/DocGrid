import { Suspense } from "react";
import { DoctorsManager } from "@/components/DoctorsManager";
import { getScheduleData } from "@/lib/data";

async function Doctors() {
  const { doctors, shifts, locations, prefs } = await getScheduleData();
  return <DoctorsManager doctors={doctors} shifts={shifts} locations={locations} prefs={prefs} />;
}

export default function Page() {
  return (
    <Suspense fallback={<p className="p-6 text-sm opacity-60">Loading doctors…</p>}>
      <Doctors />
    </Suspense>
  );
}
