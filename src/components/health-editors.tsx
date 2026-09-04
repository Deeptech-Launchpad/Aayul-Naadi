"use client";

import { useActionState, useState } from "react";
import {
  addAllergyAction,
  addConditionAction,
  addMedicationAction,
  removeAllergyAction,
  removeConditionAction,
  stopMedicationAction,
  type FormState,
} from "@/app/actions/record";
import { CONDITION_OPTIONS, COMMON_ALLERGENS, MEDICATION_SUGGESTIONS } from "@/lib/conditions";
import { SubmitButton, FormError } from "./form";
import { Icon } from "./icons";

/**
 * The three list editors used both in onboarding and in the profile. Each is
 * add-one-at-a-time so a half-finished entry can never overwrite a good one.
 */

function Header({ title, count, children }: { title: string; count: number; children?: React.ReactNode }) {
  return (
    <div className="section-title">
      <span>{title} {count > 0 && <span className="muted">· {count}</span>}</span>
      {children}
    </div>
  );
}

export function ConditionEditor({
  conditions,
}: {
  conditions: Array<{ id: string; name: string; icd10?: string; onsetAt: string | null }>;
}) {
  const [open, setOpen] = useState(conditions.length === 0);
  const [state, action] = useActionState(addConditionAction, {} as FormState);

  return (
    <section className="stack-sm">
      <Header title="Conditions" count={conditions.length}>
        <button type="button" onClick={() => setOpen(!open)} style={{ background: "none", border: 0, color: "var(--jade)", fontSize: 12, cursor: "pointer" }}>
          {open ? "Close" : "Add"}
        </button>
      </Header>

      {conditions.length > 0 && (
        <div className="card rows">
          {conditions.map((c) => (
            <div className="row" key={c.id}>
              <span className="ic w"><Icon name="drop" /></span>
              <span className="tx">
                <b>{c.name}</b>
                <small>
                  {c.onsetAt ? `Since ${new Date(c.onsetAt).getFullYear()}` : "Onset not recorded"}
                  {c.icd10 ? ` · ICD-10 ${c.icd10}` : ""}
                </small>
              </span>
              <form action={removeConditionAction}>
                <input type="hidden" name="id" value={c.id} />
                <button type="submit" className="icon-btn" aria-label={`Remove ${c.name}`}><Icon name="trash" size={15} /></button>
              </form>
            </div>
          ))}
        </div>
      )}

      {open && (
        <form action={action} className="card stack-sm">
          <FormError message={state.error} />
          <div className="field">
            <label className="label" htmlFor="condition-name">Condition</label>
            <input id="condition-name" name="name" list="condition-options" className="input" placeholder="Start typing…" required />
            <datalist id="condition-options">
              {CONDITION_OPTIONS.map((c) => <option key={c.tag} value={c.name} />)}
            </datalist>
          </div>
          <div className="field">
            <label className="label" htmlFor="condition-onset">Since <span className="opt">· optional</span></label>
            <input id="condition-onset" name="onsetAt" type="date" className="input mono" />
          </div>
          <SubmitButton className="btn ghost md" pendingLabel="Adding…">Add condition</SubmitButton>
          {state.message && <p className="disclaimer">{state.message}</p>}
        </form>
      )}
    </section>
  );
}

export function MedicationEditor({
  medications,
}: {
  medications: Array<{ id: string; name: string; dose?: string; schedule: string[] }>;
}) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(addMedicationAction, {} as FormState);
  const [preset, setPreset] = useState<(typeof MEDICATION_SUGGESTIONS)[number] | null>(null);

  return (
    <section className="stack-sm">
      <Header title="Medications" count={medications.length}>
        <button type="button" onClick={() => setOpen(!open)} style={{ background: "none", border: 0, color: "var(--jade)", fontSize: 12, cursor: "pointer" }}>
          {open ? "Close" : "Add"}
        </button>
      </Header>

      {medications.length > 0 && (
        <div className="card rows">
          {medications.map((m) => (
            <div className="row" key={m.id}>
              <span className="ic j"><Icon name="pill" /></span>
              <span className="tx">
                <b>{m.name}{m.dose ? ` ${m.dose}` : ""}</b>
                <small>{m.schedule.length ? m.schedule.join(", ") : "As needed"}</small>
              </span>
              <form action={stopMedicationAction}>
                <input type="hidden" name="id" value={m.id} />
                <button type="submit" className="icon-btn" aria-label={`Stop ${m.name}`}><Icon name="x" size={15} /></button>
              </form>
            </div>
          ))}
        </div>
      )}

      {open && (
        <form action={action} className="card stack-sm">
          <FormError message={state.error} />
          <div className="chips">
            {MEDICATION_SUGGESTIONS.slice(0, 6).map((s) => (
              <button type="button" key={s.name} onClick={() => setPreset(s)} data-active={preset?.name === s.name}>
                {s.name}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <div className="field grow">
              <label className="label" htmlFor="med-name">Name</label>
              <input id="med-name" name="name" className="input" defaultValue={preset?.name ?? ""} key={`n-${preset?.name}`} required placeholder="Metformin" />
            </div>
            <div className="field" style={{ width: 110 }}>
              <label className="label" htmlFor="med-dose">Dose</label>
              <input id="med-dose" name="dose" className="input" defaultValue={preset?.dose ?? ""} key={`d-${preset?.name}`} placeholder="500 mg" />
            </div>
          </div>
          <div className="field">
            <label className="label" htmlFor="med-schedule">Times <span className="opt">· comma separated, 24h</span></label>
            <input id="med-schedule" name="schedule" className="input mono" defaultValue={preset?.schedule.join(", ") ?? ""} key={`s-${preset?.name}`} placeholder="08:00, 20:00" />
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <div className="field grow">
              <label className="label" htmlFor="med-purpose">What it is for</label>
              <input id="med-purpose" name="purpose" className="input" defaultValue={preset?.purpose ?? ""} key={`p-${preset?.name}`} />
            </div>
            <div className="field" style={{ width: 110 }}>
              <label className="label" htmlFor="med-qty">Pills left</label>
              <input id="med-qty" name="quantityRemaining" type="number" inputMode="numeric" className="input mono" placeholder="30" />
            </div>
          </div>
          <SubmitButton className="btn ghost md" pendingLabel="Adding…">Add medication</SubmitButton>
        </form>
      )}
    </section>
  );
}

export function AllergyEditor({
  allergies,
}: {
  allergies: Array<{ id: string; substance: string; reaction?: string; severity: string }>;
}) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(addAllergyAction, {} as FormState);

  return (
    <section className="stack-sm">
      <Header title="Allergies" count={allergies.length}>
        <button type="button" onClick={() => setOpen(!open)} style={{ background: "none", border: 0, color: "var(--jade)", fontSize: 12, cursor: "pointer" }}>
          {open ? "Close" : "Add"}
        </button>
      </Header>

      {allergies.length > 0 && (
        <div className="card rows">
          {allergies.map((a) => (
            <div className="row" key={a.id}>
              <span className="ic h"><Icon name="alert" /></span>
              <span className="tx">
                <b>{a.substance}</b>
                <small>{a.reaction || "Reaction not recorded"}</small>
              </span>
              <span className={`pill ${a.severity === "severe" ? "high" : a.severity === "moderate" ? "watch" : ""}`}>{a.severity}</span>
              <form action={removeAllergyAction}>
                <input type="hidden" name="id" value={a.id} />
                <button type="submit" className="icon-btn" aria-label={`Remove ${a.substance}`}><Icon name="trash" size={15} /></button>
              </form>
            </div>
          ))}
        </div>
      )}

      {open && (
        <form action={action} className="card stack-sm">
          <FormError message={state.error} />
          <div className="field">
            <label className="label" htmlFor="allergy-substance">Allergic to</label>
            <input id="allergy-substance" name="substance" list="allergen-options" className="input" required placeholder="Penicillin" />
            <datalist id="allergen-options">
              {COMMON_ALLERGENS.map((a) => <option key={a} value={a} />)}
            </datalist>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <div className="field grow">
              <label className="label" htmlFor="allergy-reaction">Reaction</label>
              <input id="allergy-reaction" name="reaction" className="input" placeholder="Rash" />
            </div>
            <div className="field" style={{ width: 130 }}>
              <label className="label" htmlFor="allergy-severity">Severity</label>
              <select id="allergy-severity" name="severity" className="input" defaultValue="moderate">
                <option value="mild">Mild</option>
                <option value="moderate">Moderate</option>
                <option value="severe">Severe</option>
                <option value="unknown">Unknown</option>
              </select>
            </div>
          </div>
          <SubmitButton className="btn ghost md" pendingLabel="Adding…">Add allergy</SubmitButton>
        </form>
      )}
    </section>
  );
}
