"use client";

import { useActionState, useState } from "react";
import { logReadingAction, type FormState } from "@/app/actions/record";
import { FormError, SubmitButton } from "./form";
import { Icon } from "./icons";

type Tab = "bp" | "glucose_fasting" | "weight" | "other";

const OTHER_METRICS = [
  { key: "glucose_random", label: "Random glucose", unit: "mg/dL" },
  { key: "spo2", label: "Blood oxygen", unit: "%" },
  { key: "temperature", label: "Temperature", unit: "°C" },
  { key: "pulse", label: "Pulse", unit: "bpm" },
  { key: "waist", label: "Waist", unit: "cm" },
  { key: "steps", label: "Steps", unit: "steps" },
  { key: "sleep_duration", label: "Sleep", unit: "h" },
];

const BP_CONTEXTS = ["Before medication", "After exercise", "Seated, rested 5 min", "Left arm", "Evening"];

export function QuickLog({
  baseline,
}: {
  baseline: { systolic: number | null; diastolic: number | null; glucose: number | null; weight: number | null };
}) {
  const [tab, setTab] = useState<Tab>("bp");
  const [state, action] = useActionState(logReadingAction, {} as FormState);
  const [systolic, setSystolic] = useState("");
  const [diastolic, setDiastolic] = useState("");
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");
  const [otherMetric, setOtherMetric] = useState(OTHER_METRICS[0].key);

  return (
    <form action={action} className="stack">
      <FormError message={state.error} />
      <input type="hidden" name="logType" value={tab === "other" ? otherMetric : tab} />
      <input type="hidden" name="note" value={note} />

      <nav className="seg">
        {(
          [
            ["bp", "Blood pressure"],
            ["glucose_fasting", "Glucose"],
            ["weight", "Weight"],
            ["other", "Other"],
          ] as Array<[Tab, string]>
        ).map(([key, label]) => (
          <button type="button" key={key} data-active={tab === key} onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </nav>

      {tab === "bp" ? (
        <>
          <div style={{ display: "flex", gap: 9, alignItems: "flex-end" }}>
            <div className="field grow">
              <label className="label" htmlFor="systolic">Systolic</label>
              <input
                id="systolic" name="systolic" inputMode="numeric" required autoFocus
                className="input big" placeholder="120"
                value={systolic} onChange={(e) => setSystolic(e.target.value)}
              />
            </div>
            <div className="mono" style={{ fontSize: 22, color: "var(--txt-3)", paddingBottom: 16 }}>/</div>
            <div className="field grow">
              <label className="label" htmlFor="diastolic">Diastolic</label>
              <input
                id="diastolic" name="diastolic" inputMode="numeric" required
                className="input big" placeholder="80"
                value={diastolic} onChange={(e) => setDiastolic(e.target.value)}
              />
            </div>
            <div className="field" style={{ width: 84 }}>
              <label className="label" htmlFor="pulse">Pulse</label>
              <input id="pulse" name="pulse" inputMode="numeric" className="input big" placeholder="—" />
            </div>
          </div>
          <Interpretation
            reading={interpretBp(Number(systolic), Number(diastolic))}
            baselineText={
              baseline.systolic && baseline.diastolic
                ? `Your 7-day average is ${Math.round(baseline.systolic)}/${Math.round(baseline.diastolic)}.`
                : null
            }
          />
          <div className="field">
            <span className="label">Context <span className="opt">· optional</span></span>
            <div className="chips">
              {BP_CONTEXTS.map((option) => (
                <button type="button" key={option} data-active={note === option} onClick={() => setNote(note === option ? "" : option)}>
                  {option}
                </button>
              ))}
            </div>
          </div>
        </>
      ) : (
        <>
          {tab === "other" && (
            <div className="field">
              <label className="label" htmlFor="metric">What are you logging?</label>
              <select id="metric" className="input" value={otherMetric} onChange={(e) => setOtherMetric(e.target.value)}>
                {OTHER_METRICS.map((m) => (
                  <option key={m.key} value={m.key}>{m.label} ({m.unit})</option>
                ))}
              </select>
            </div>
          )}
          <div className="field">
            <label className="label" htmlFor="value">
              {tab === "glucose_fasting" ? "Fasting glucose (mg/dL)" : tab === "weight" ? "Weight (kg)" : "Value"}
            </label>
            <input
              id="value" name="value" inputMode="decimal" required autoFocus
              className="input big"
              placeholder={tab === "glucose_fasting" ? "105" : tab === "weight" ? "74.2" : "0"}
              value={value} onChange={(e) => setValue(e.target.value)}
            />
          </div>
          {tab === "glucose_fasting" && (
            <Interpretation
              reading={interpretGlucose(Number(value))}
              baselineText={baseline.glucose ? `Your 30-day average is ${Math.round(baseline.glucose)} mg/dL.` : null}
            />
          )}
          {tab === "weight" && baseline.weight != null && Number(value) > 0 && (
            <Interpretation
              reading={{
                tone: "ok",
                label: `${Number(value) > baseline.weight ? "+" : ""}${(Number(value) - baseline.weight).toFixed(1)} kg`,
              }}
              baselineText={`Last recorded weight was ${baseline.weight.toFixed(1)} kg.`}
            />
          )}
          <div className="field">
            <label className="label" htmlFor="note">Note <span className="opt">· optional</span></label>
            <input id="note" className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Anything worth remembering" />
          </div>
        </>
      )}

      <div className="field">
        <label className="label" htmlFor="at">When <span className="opt">· defaults to now</span></label>
        <input id="at" name="at" type="datetime-local" className="input mono" />
      </div>

      <SubmitButton pendingLabel="Saving…">
        <Icon name="check" strokeWidth={2} /> Save reading
      </SubmitButton>

      <p className="disclaimer">
        Interpretation is computed locally from published thresholds as you type — nothing is sent
        anywhere to produce it.
      </p>
    </form>
  );
}

function Interpretation({
  reading,
  baselineText,
}: {
  reading: { tone: "ok" | "watch" | "high" | "low"; label: string } | null;
  baselineText: string | null;
}) {
  if (!reading && !baselineText) return null;
  return (
    <div className="card flat" style={{ display: "flex", gap: 10, alignItems: "center" }}>
      {reading && <span className={`pill ${reading.tone} lg`}>{reading.label}</span>}
      {baselineText && <span style={{ fontSize: 12, color: "var(--txt-2)", lineHeight: 1.4 }}>{baselineText}</span>}
    </div>
  );
}

/** Thresholds follow the ACC/AHA blood-pressure categories. */
function interpretBp(systolic: number, diastolic: number) {
  if (!Number.isFinite(systolic) || !Number.isFinite(diastolic) || systolic < 40 || diastolic < 20) return null;
  if (systolic >= 180 || diastolic >= 120) return { tone: "high" as const, label: "Crisis range — seek care" };
  if (systolic >= 140 || diastolic >= 90) return { tone: "high" as const, label: "Stage 2" };
  if (systolic >= 130 || diastolic >= 80) return { tone: "watch" as const, label: "Stage 1" };
  if (systolic >= 120) return { tone: "watch" as const, label: "Elevated" };
  if (systolic < 90 || diastolic < 60) return { tone: "low" as const, label: "Low" };
  return { tone: "ok" as const, label: "Normal" };
}

function interpretGlucose(value: number) {
  if (!Number.isFinite(value) || value <= 0) return null;
  if (value < 70) return { tone: "low" as const, label: "Low" };
  if (value <= 99) return { tone: "ok" as const, label: "Normal fasting" };
  if (value <= 125) return { tone: "watch" as const, label: "Prediabetes range" };
  return { tone: "high" as const, label: "Diabetes range" };
}
