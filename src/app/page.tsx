import { Suspense } from "react";
import { ScheduleBoard } from "@/components/ScheduleBoard";
import { getScheduleData } from "@/lib/data";

async function Board() {
  const { doctors, shifts } = await getScheduleData();
  return <ScheduleBoard doctors={doctors} shifts={shifts} />;
}

export default function Page() {
  return (
    <Suspense fallback={<p className="p-6 text-sm opacity-60">Loading schedule…</p>}>
      <Board />
    </Suspense>
  );
}
