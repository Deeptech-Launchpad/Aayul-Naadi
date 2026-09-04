import { redirect } from "next/navigation";
import { requireApiUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { StepHeader } from "@/components/steps";
import { ConnectPanel } from "@/components/connect-panel";
import { finishOnboardingAction } from "@/app/actions/data";
import { SubmitButton } from "@/components/form";

export const metadata = { title: "Connect your data · Aayu" };

export default async function ConnectPage() {
  const ctx = await requireApiUser();
  if (!ctx) redirect("/signin");
  const observations = await db.observation.count({ where: { userId: ctx.user.id } });

  return (
    <>
      <StepHeader
        step={5}
        title="Connect your data"
        intro="Each source you add makes every answer sharper. Nothing here blocks you — a record with just a profile is still a usable record."
      />

      <ConnectPanel />

      <form action={finishOnboardingAction}>
        <SubmitButton pendingLabel="Finishing…">
          {observations > 0 ? "Go to Today" : "Skip for now and go to Today"}
        </SubmitButton>
      </form>
    </>
  );
}
