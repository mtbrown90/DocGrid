import { Suspense } from "react";
import { ScheduleBoard } from "@/components/ScheduleBoard";
import { getScheduleData } from "@/lib/data";

async function Board() {
  return <ScheduleBoard {...(await getScheduleData())} />;
}

export default function Page() {
  return (
    <Suspense fallback={<p className="p-6 text-sm opacity-60">Loading schedule…</p>}>
      <Board />
    </Suspense>
  );
}
