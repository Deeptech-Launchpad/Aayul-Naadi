import Link from "next/link";
import { redirect } from "next/navigation";
import { requireApiUser } from "@/lib/auth";
import { getAllergies, getConditions, getMedications } from "@/lib/record";
import { StepHeader } from "@/components/steps";
import { ConditionEditor, MedicationEditor, AllergyEditor } from "@/components/health-editors";

export const metadata = { title: "Conditions & medications · Aayu" };

export default async function HealthPage() {
  const ctx = await requireApiUser();
  if (!ctx) redirect("/signin");
  const [conditions, medications, allergies] = await Promise.all([
    getConditions(ctx),
    getMedications(ctx, { active: true }),
    getAllergies(ctx),
  ]);

  return (
    <>
      <StepHeader
        step={3}
        title="Conditions & medications"
        intro="What only you know. Conditions map to ICD-10 codes so that anything imported later merges with what you typed instead of duplicating it."
      />

      <ConditionEditor conditions={conditions.map((c) => ({ id: c.id, name: c.name, icd10: c.icd10, onsetAt: c.onsetAt?.toISOString() ?? null }))} />
      <MedicationEditor medications={medications.map((m) => ({ id: m.id, name: m.name, dose: m.dose, schedule: m.schedule }))} />
      <AllergyEditor allergies={allergies.map((a) => ({ id: a.id, substance: a.substance, reaction: a.reaction, severity: a.severity ?? "unknown" }))} />

      <Link href="/onboarding/family" className="btn">Continue</Link>
      <Link href="/onboarding/connect" className="btn ghost">Skip the rest for now</Link>
    </>
  );
}
