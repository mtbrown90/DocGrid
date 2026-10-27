import { Suspense } from "react";
import { GeneratorPanel } from "@/components/GeneratorPanel";
import { getScheduleData } from "@/lib/data";

async function Generate() {
  return <GeneratorPanel {...(await getScheduleData())} />;
}

export default function Page() {
  return (
    <Suspense fallback={<p className="p-6 text-sm opacity-60">Loading…</p>}>
      <Generate />
    </Suspense>
  );
}
