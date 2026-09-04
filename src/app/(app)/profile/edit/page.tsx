import { requireUser } from "@/lib/auth";
import { getAllergies, getConditions, getMedications, getProfile } from "@/lib/record";
import { AppBar } from "@/components/appbar";
import { BasicsForm } from "@/components/basics-form";
import { LifestyleForm } from "@/components/lifestyle-form";
import { ConditionEditor, MedicationEditor, AllergyEditor } from "@/components/health-editors";
import { FamilyEditor } from "@/components/family-editor";

export const metadata = { title: "Edit profile · Aayu" };
export const dynamic = "force-dynamic";

export default async function EditProfilePage() {
  const ctx = await requireUser();
  const [profile, conditions, medications, allergies] = await Promise.all([
    getProfile(ctx),
    getConditions(ctx),
    getMedications(ctx, { active: true }),
    getAllergies(ctx),
  ]);

  return (
    <>
      <AppBar title="Your record" subtitle="What only you know" back="/profile" />
      <main className="shell-body">
        <div className="section-title"><span>Personal &amp; biometrics</span></div>
        <BasicsForm profile={profile} units={ctx.user.units} />

        <ConditionEditor
          conditions={conditions.map((c) => ({ id: c.id, name: c.name, icd10: c.icd10, onsetAt: c.onsetAt?.toISOString() ?? null }))}
        />
        <MedicationEditor medications={medications.map((m) => ({ id: m.id, name: m.name, dose: m.dose, schedule: m.schedule }))} />
        <AllergyEditor allergies={allergies.map((a) => ({ id: a.id, substance: a.substance, reaction: a.reaction, severity: a.severity ?? "unknown" }))} />
        <FamilyEditor history={profile.familyHistory ?? []} />

        <div className="section-title"><span>Lifestyle &amp; goals</span></div>
        <LifestyleForm profile={profile} />
      </main>
    </>
  );
}
