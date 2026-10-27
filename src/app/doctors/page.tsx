import { Suspense } from "react";
import { DoctorsManager } from "@/components/DoctorsManager";
import { getScheduleData } from "@/lib/data";

async function Doctors() {
  const { doctors, shifts } = await getScheduleData();
  return <DoctorsManager doctors={doctors} shifts={shifts} />;
}

export default function Page() {
  return (
    <Suspense fallback={<p className="p-6 text-sm opacity-60">Loading doctors…</p>}>
      <Doctors />
    </Suspense>
  );
}
