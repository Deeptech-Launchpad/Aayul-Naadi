"use client";

import { useActionState, useState } from "react";
import { addFamilyHistoryAction, type FormState } from "@/app/actions/record";
import { FAMILY_CONDITIONS, FAMILY_RELATIONS } from "@/lib/conditions";
import { FormError, SubmitButton } from "./form";
import { Icon } from "./icons";
import type { ProfileData } from "@/lib/types";

export function FamilyEditor({ history }: { history: NonNullable<ProfileData["familyHistory"]> }) {
  const [state, action] = useActionState(addFamilyHistoryAction, {} as FormState);
  const [relation, setRelation] = useState(FAMILY_RELATIONS[0]);
  const recorded = new Set(history.map((h) => h.relation));

  return (
    <section className="stack-sm">
      <div className="section-title">
        <span>Family history {history.length > 0 && <span className="muted">· {history.length} recorded</span>}</span>
      </div>

      {history.length > 0 && (
        <div className="card rows">
          {history.map((entry) => (
            <div className="row" key={entry.relation}>
              <span className="ic j"><Icon name="user" /></span>
              <span className="tx">
                <b>{entry.relation}</b>
                <small>{entry.conditions.join(", ")}{entry.ageAtOnset ? ` · from age ${entry.ageAtOnset}` : ""}</small>
              </span>
            </div>
          ))}
        </div>
      )}

      <form action={action} className="card stack-sm">
        <FormError message={state.error} />
        <div className="field">
          <span className="label">Relative</span>
          <div className="chips">
            {FAMILY_RELATIONS.map((r) => (
              <button type="button" key={r} data-active={relation === r} onClick={() => setRelation(r)}>
                {r}{recorded.has(r) ? " ✓" : ""}
              </button>
            ))}
          </div>
          <input type="hidden" name="relation" value={relation} />
        </div>

        <div className="field">
          <span className="label">Conditions</span>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "7px 12px", marginTop: 4 }}>
            {FAMILY_CONDITIONS.map((condition) => (
              <label key={condition} style={{ display: "flex", gap: 7, alignItems: "center", fontSize: 12.5 }}>
                <input type="checkbox" name="conditions" value={condition} style={{ accentColor: "var(--jade)", width: 16, height: 16 }} />
                {condition}
              </label>
            ))}
          </div>
        </div>

        <div className="field">
          <label className="label" htmlFor="family-age">Age at diagnosis <span className="opt">· optional</span></label>
          <input id="family-age" name="ageAtOnset" type="number" inputMode="numeric" className="input mono" placeholder="52" />
        </div>

        <SubmitButton className="btn ghost md" pendingLabel="Saving…">Save {relation.toLowerCase()}</SubmitButton>
        {state.message && <p className="disclaimer">{state.message}</p>}
      </form>
    </section>
  );
}
