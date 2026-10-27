import { Suspense } from "react";
import { SetupManager } from "@/components/SetupManager";
import { getScheduleData } from "@/lib/data";

async function Setup() {
  const { locations, shiftTypes } = await getScheduleData();
  return <SetupManager locations={locations} shiftTypes={shiftTypes} />;
}

export default function Page() {
  return (
    <Suspense fallback={<p className="p-6 text-sm opacity-60">Loading setup…</p>}>
      <Setup />
    </Suspense>
  );
}
