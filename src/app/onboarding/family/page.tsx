import Link from "next/link";
import { redirect } from "next/navigation";
import { requireApiUser } from "@/lib/auth";
import { getProfile } from "@/lib/record";
import { StepHeader } from "@/components/steps";
import { FamilyEditor } from "@/components/family-editor";
import { LifestyleForm } from "@/components/lifestyle-form";

export const metadata = { title: "Family & lifestyle · Aayu" };

export default async function FamilyPage() {
  const ctx = await requireApiUser();
  if (!ctx) redirect("/signin");
  const profile = await getProfile(ctx);

  return (
    <>
      <StepHeader
        step={4}
        title="Family & lifestyle"
        intro="Family history changes when some screenings start — a parent with colorectal cancer moves your first colonoscopy a decade earlier. Lifestyle and goals give Nadi something to reason against."
      />
      <FamilyEditor history={profile.familyHistory ?? []} />
      <LifestyleForm profile={profile} next="/onboarding/connect" />
    </>
  );
}
