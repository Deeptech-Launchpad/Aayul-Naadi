import { requireUser } from "@/lib/auth";
import { getSeries } from "@/lib/record";
import { AppBar } from "@/components/appbar";
import { QuickLog } from "@/components/quick-log";

export const metadata = { title: "Log a reading · Aayu" };
export const dynamic = "force-dynamic";

export default async function LogPage() {
  const ctx = await requireUser();

  // Recent context so the interpretation line can say what is usual for you.
  const [systolic, diastolic, glucose, weight] = await Promise.all([
    getSeries(ctx, "bp_systolic", { from: new Date(Date.now() - 7 * 86_400_000) }),
    getSeries(ctx, "bp_diastolic", { from: new Date(Date.now() - 7 * 86_400_000) }),
    getSeries(ctx, "glucose_fasting", { from: new Date(Date.now() - 30 * 86_400_000) }),
    getSeries(ctx, "weight", { from: new Date(Date.now() - 90 * 86_400_000) }),
  ]);

  return (
    <>
      <AppBar title="Log a reading" subtitle="Three taps from open to saved" back="/today" />
      <main className="shell-body">
        <QuickLog
          baseline={{
            systolic: systolic.stats.mean,
            diastolic: diastolic.stats.mean,
            glucose: glucose.stats.mean,
            weight: weight.stats.latest?.value ?? null,
          }}
        />
      </main>
    </>
  );
}
