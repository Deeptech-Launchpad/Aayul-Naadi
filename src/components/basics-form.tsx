"use client";

import { saveBasicsAction } from "@/app/actions/record";
import { ActionForm, SubmitButton } from "./form";
import type { ProfileData } from "@/lib/types";

export function BasicsForm({ profile, units }: { profile: ProfileData; units: string }) {
  return (
    <ActionForm action={saveBasicsAction}>
      <div className="field">
        <label className="label" htmlFor="displayName">Name</label>
        <input id="displayName" name="displayName" className="input" defaultValue={profile.displayName ?? ""} />
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <div className="field grow">
          <label className="label" htmlFor="dob">Date of birth</label>
          <input id="dob" name="dob" type="date" className="input mono" defaultValue={profile.dob ?? ""} />
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
      <div style={{ display: "flex", gap: 10 }}>
        <div className="field grow">
          <label className="label" htmlFor="heightCm">Height (cm)</label>
          <input id="heightCm" name="heightCm" type="number" step="0.1" className="input mono" defaultValue={profile.heightCm ?? ""} />
        </div>
        <div className="field grow">
          <label className="label" htmlFor="weightKg">Log weight (kg)</label>
          <input id="weightKg" name="weightKg" type="number" step="0.1" className="input mono" placeholder="Adds a reading" />
        </div>
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <div className="field grow">
          <label className="label" htmlFor="bloodType">Blood type</label>
          <select id="bloodType" name="bloodType" className="input" defaultValue={profile.bloodType ?? ""}>
            <option value="">Unknown</option>
            {["O+", "O−", "A+", "A−", "B+", "B−", "AB+", "AB−"].map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="field grow">
          <label className="label" htmlFor="ancestry">Ancestry</label>
          <input id="ancestry" name="ancestry" className="input" defaultValue={profile.ancestry ?? ""} />
        </div>
      </div>
      <div className="field">
        <span className="label">Units</span>
        <div className="seg">
          <label data-active={units === "metric"} style={{ flex: 1, textAlign: "center", padding: "8px 0", cursor: "pointer", fontSize: 12 }}>
            <input type="radio" name="units" value="metric" defaultChecked={units === "metric"} style={{ display: "none" }} />
            Metric
          </label>
          <label data-active={units === "imperial"} style={{ flex: 1, textAlign: "center", padding: "8px 0", cursor: "pointer", fontSize: 12 }}>
            <input type="radio" name="units" value="imperial" defaultChecked={units === "imperial"} style={{ display: "none" }} />
            Imperial
          </label>
        </div>
      </div>
      <SubmitButton className="btn md" pendingLabel="Saving…">Save</SubmitButton>
    </ActionForm>
  );
}
