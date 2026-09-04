"use client";

import { saveLifestyleAction } from "@/app/actions/record";
import { ActionForm, SubmitButton } from "./form";
import type { ProfileData } from "@/lib/types";

export function LifestyleForm({ profile, next }: { profile: ProfileData; next?: string }) {
  const lifestyle = profile.lifestyle ?? {};
  const goals = profile.goals ?? {};

  return (
    <ActionForm action={saveLifestyleAction}>
      {next && <input type="hidden" name="next" value={next} />}

      <div className="section-title"><span>Lifestyle</span></div>
      <div style={{ display: "flex", gap: 10 }}>
        <div className="field grow">
          <label className="label" htmlFor="smoking">Smoking</label>
          <select id="smoking" name="smoking" className="input" defaultValue={lifestyle.smoking ?? "never"}>
            <option value="never">Never</option>
            <option value="former">Used to</option>
            <option value="current">Currently</option>
          </select>
        </div>
        <div className="field grow">
          <label className="label" htmlFor="alcohol">Alcohol</label>
          <select id="alcohol" name="alcohol" className="input" defaultValue={lifestyle.alcohol ?? "none"}>
            <option value="none">None</option>
            <option value="occasional">Occasional</option>
            <option value="weekly">Weekly</option>
            <option value="daily">Daily</option>
          </select>
        </div>
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <div className="field grow">
          <label className="label" htmlFor="diet">Diet</label>
          <input id="diet" name="diet" className="input" defaultValue={lifestyle.diet ?? ""} placeholder="Vegetarian, low carb…" />
        </div>
        <div className="field" style={{ width: 130 }}>
          <label className="label" htmlFor="activityPerWeek">Workouts / week</label>
          <input id="activityPerWeek" name="activityPerWeek" type="number" inputMode="numeric" className="input mono" defaultValue={lifestyle.activityPerWeek ?? ""} placeholder="3" />
        </div>
      </div>

      <div className="section-title"><span>Goals</span></div>
      <div style={{ display: "flex", gap: 10 }}>
        <div className="field grow">
          <label className="label" htmlFor="goalSleep">Sleep (h)</label>
          <input id="goalSleep" name="goalSleep" type="number" step="0.5" inputMode="decimal" className="input mono" defaultValue={goals.sleepHours ?? ""} placeholder="7.5" />
        </div>
        <div className="field grow">
          <label className="label" htmlFor="goalSteps">Steps / day</label>
          <input id="goalSteps" name="goalSteps" type="number" inputMode="numeric" className="input mono" defaultValue={goals.steps ?? ""} placeholder="10000" />
        </div>
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <div className="field grow">
          <label className="label" htmlFor="goalHba1c">HbA1c target (%)</label>
          <input id="goalHba1c" name="goalHba1c" type="number" step="0.1" inputMode="decimal" className="input mono" defaultValue={goals.hba1c ?? ""} placeholder="6.0" />
        </div>
        <div className="field grow">
          <label className="label" htmlFor="goalWeight">Weight target (kg)</label>
          <input id="goalWeight" name="goalWeight" type="number" step="0.1" inputMode="decimal" className="input mono" defaultValue={goals.weightKg ?? ""} placeholder="72" />
        </div>
      </div>
      <div className="field">
        <label className="label" htmlFor="goalNotes">What you want from Aayu <span className="opt">· optional</span></label>
        <textarea id="goalNotes" name="goalNotes" className="input" defaultValue={goals.notes ?? ""} placeholder="Keep my A1c under control without adding another medication." />
      </div>

      <SubmitButton pendingLabel="Saving…">{next ? "Continue" : "Save"}</SubmitButton>
    </ActionForm>
  );
}
