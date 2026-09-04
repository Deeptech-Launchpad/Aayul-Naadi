import { requireApiUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/record";
import { saveBasicsAction } from "@/app/actions/record";
import { ActionForm, SubmitButton } from "@/components/form";
import { StepHeader } from "@/components/steps";

export const metadata = { title: "About you · Aayu" };

export default async function BasicsPage() {
  const ctx = await requireApiUser();
  if (!ctx) redirect("/signin");
  const profile = await getProfile(ctx);

  return (
    <>
      <StepHeader
        step={2}
        title="About you"
        intro="Date of birth and sex at birth decide which reference ranges and which screening rules apply to you. That is the only reason they are asked."
      />

      <ActionForm action={saveBasicsAction}>
        <input type="hidden" name="next" value="/onboarding/health" />

        <div className="field">
          <label className="label" htmlFor="displayName">Name <span className="opt">· only shown to you</span></label>
          <input id="displayName" name="displayName" className="input" defaultValue={profile.displayName ?? ""} placeholder="What should Aayu call you?" />
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <div className="field grow">
            <label className="label" htmlFor="dob">Date of birth</label>
            <input id="dob" name="dob" type="date" required className="input mono" defaultValue={profile.dob ?? ""} />
          </div>
          <div className="field grow">
            <label className="label" htmlFor="sexAtBirth">Sex at birth</label>
            <select id="sexAtBirth" name="sexAtBirth" className="input" defaultValue={profile.sexAtBirth ?? ""}>
              <option value="">Choose…</option>
              <option value="female">Female</option>
              <option value="male">Male</option>
              <option value="intersex">Intersex</option>
              <option value="unspecified">Prefer not to say</option>
            </select>
          </div>
        </div>

        <div className="field">
          <label className="label" htmlFor="gender">Gender identity <span className="opt">· optional</span></label>
          <input id="gender" name="gender" className="input" defaultValue={profile.gender ?? ""} placeholder="Optional" />
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <div className="field grow">
            <label className="label" htmlFor="heightCm">Height (cm)</label>
            <input id="heightCm" name="heightCm" type="number" inputMode="decimal" step="0.1" className="input mono" defaultValue={profile.heightCm ?? ""} placeholder="175" />
          </div>
          <div className="field grow">
            <label className="label" htmlFor="weightKg">Weight (kg)</label>
            <input id="weightKg" name="weightKg" type="number" inputMode="decimal" step="0.1" className="input mono" placeholder="74.2" />
          </div>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <div className="field grow">
            <label className="label" htmlFor="bloodType">Blood type</label>
            <select id="bloodType" name="bloodType" className="input" defaultValue={profile.bloodType ?? ""}>
              <option value="">Unknown</option>
              {["O+", "O−", "A+", "A−", "B+", "B−", "AB+", "AB−"].map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div className="field grow">
            <label className="label" htmlFor="ancestry">Ancestry <span className="opt">· optional</span></label>
            <input id="ancestry" name="ancestry" className="input" defaultValue={profile.ancestry ?? ""} placeholder="e.g. South Asian" />
          </div>
        </div>

        <div className="field">
          <span className="label">Units</span>
          <div className="seg">
            <label data-active={ctx.user.units === "metric"} style={{ flex: 1, textAlign: "center", padding: "8px 0", cursor: "pointer" }}>
              <input type="radio" name="units" value="metric" defaultChecked={ctx.user.units === "metric"} style={{ display: "none" }} />
              Metric
            </label>
            <label data-active={ctx.user.units === "imperial"} style={{ flex: 1, textAlign: "center", padding: "8px 0", cursor: "pointer" }}>
              <input type="radio" name="units" value="imperial" defaultChecked={ctx.user.units === "imperial"} style={{ display: "none" }} />
              Imperial
            </label>
          </div>
        </div>

        <p className="disclaimer">
          Ancestry changes some reference intervals and some risk calculations. Leave it blank if you
          would rather not say — nothing else depends on it.
        </p>

        <SubmitButton pendingLabel="Saving…">Continue</SubmitButton>
      </ActionForm>
    </>
  );
}
