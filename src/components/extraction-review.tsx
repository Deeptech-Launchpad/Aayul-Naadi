"use client";

import { useActionState, useState } from "react";
import { confirmExtractionAction, type DocState } from "@/app/actions/documents";
import { METRICS } from "@/lib/metrics";
import { FormError, SubmitButton } from "./form";
import { Icon } from "./icons";
import type { ExtractionResult } from "@/lib/types";

/**
 * Nothing reaches the record unseen. Markers Claude was unsure of, or could not
 * map onto a known marker, are promoted to the top with the verbatim line it
 * read them from, so a misread digit is caught by a person rather than a model.
 */
export function ExtractionReview({
  documentId,
  extraction,
  threshold,
}: {
  documentId: string;
  extraction: ExtractionResult;
  threshold: number;
}) {
  const [state, action] = useActionState(confirmExtractionAction, {} as DocState);
  const [accepted, setAccepted] = useState<boolean[]>(
    extraction.markers.map((m) => m.accepted !== false && m.confidence >= threshold && m.metric !== null),
  );

  const needsEye = extraction.markers
    .map((marker, index) => ({ marker, index }))
    .filter(({ marker }) => marker.confidence < threshold || marker.metric === null);
  const clean = extraction.markers
    .map((marker, index) => ({ marker, index }))
    .filter(({ marker }) => marker.confidence >= threshold && marker.metric !== null);

  const acceptedCount = accepted.filter(Boolean).length;

  return (
    <form action={action} className="stack">
      <FormError message={state.error} />
      <input type="hidden" name="documentId" value={documentId} />

      <div style={{ display: "flex", gap: 10 }}>
        <div className="field grow">
          <label className="label" htmlFor="panelName">Panel name</label>
          <input id="panelName" name="panelName" className="input" defaultValue={extraction.panelName ?? "Imported results"} />
        </div>
        <div className="field" style={{ width: 150 }}>
          <label className="label" htmlFor="collectedAt">Collected</label>
          <input
            id="collectedAt" name="collectedAt" type="date" className="input mono"
            defaultValue={extraction.collectedAt ?? ""}
          />
        </div>
      </div>

      {needsEye.length > 0 && (
        <>
          <div className="section-title">
            <span>Needs your eye</span>
            <span className="pill watch">{needsEye.length}</span>
          </div>
          {needsEye.map(({ marker, index }) => (
            <section className="card" key={index} style={{ borderColor: "var(--watch)" }}>
              <div className="between" style={{ alignItems: "flex-start" }}>
                <div className="grow">
                  <b style={{ fontSize: 13.5 }}>{marker.name}</b>
                  <div style={{ fontSize: 11, color: "var(--txt-3)", marginTop: 2 }}>
                    Read as “{marker.value} {marker.unit}” · confidence {Math.round(marker.confidence * 100)}%
                    {marker.metric === null ? " · not a marker Aayu tracks" : ""}
                  </div>
                </div>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, flex: "none" }}>
                  <input
                    type="checkbox"
                    name={`accept-${index}`}
                    checked={accepted[index]}
                    onChange={(e) => setAccepted(accepted.map((v, i) => (i === index ? e.target.checked : v)))}
                    style={{ width: 18, height: 18, accentColor: "var(--jade)" }}
                  />
                  Save
                </label>
              </div>

              <div className="card flat mono" style={{ marginTop: 9, padding: "8px 10px", fontSize: 10.5, color: "var(--txt-2)", lineHeight: 1.5 }}>
                “{marker.sourceText}”
              </div>

              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <input
                  name={`value-${index}`}
                  defaultValue={marker.value}
                  className="input mono"
                  style={{ height: 40, flex: 1 }}
                  aria-label={`Value for ${marker.name}`}
                />
                <select
                  name={`metric-${index}`}
                  defaultValue={marker.metric ?? ""}
                  className="input"
                  style={{ height: 40, flex: 1.4 }}
                  aria-label={`Marker for ${marker.name}`}
                >
                  <option value="">Not tracked</option>
                  {METRICS.filter((m) => m.category === "lab" || m.category === "vital").map((m) => (
                    <option key={m.key} value={m.key}>{m.label}</option>
                  ))}
                </select>
              </div>
            </section>
          ))}
        </>
      )}

      {clean.length > 0 && (
        <>
          <div className="section-title">
            <span>Read cleanly</span>
            <span className="pill ok">{clean.length}</span>
          </div>
          <section className="card rows">
            {clean.map(({ marker, index }) => (
              <label className="row" key={index} style={{ cursor: "pointer" }}>
                <input
                  type="checkbox"
                  name={`accept-${index}`}
                  checked={accepted[index]}
                  onChange={(e) => setAccepted(accepted.map((v, i) => (i === index ? e.target.checked : v)))}
                  style={{ width: 18, height: 18, accentColor: "var(--jade)", flex: "none" }}
                />
                <input type="hidden" name={`value-${index}`} value={marker.value} />
                <input type="hidden" name={`metric-${index}`} value={marker.metric ?? ""} />
                <span className="tx">
                  <b>{marker.name}</b>
                  <small>
                    {marker.refText ??
                      (marker.refLow != null || marker.refHigh != null
                        ? `ref ${marker.refLow ?? "–"}–${marker.refHigh ?? "–"}`
                        : "no reference range printed")}
                  </small>
                </span>
                <span className="val">
                  {marker.value}
                  <small>{marker.unit}</small>
                </span>
              </label>
            ))}
          </section>
        </>
      )}

      {extraction.notes && (
        <div className="notice info">
          <Icon name="file" />
          <span>{extraction.notes}</span>
        </div>
      )}

      <SubmitButton pendingLabel="Saving…">
        <Icon name="check" strokeWidth={2} />
        Save {acceptedCount} of {extraction.markers.length} markers
      </SubmitButton>

      <p className="disclaimer">
        Values are transcribed, never interpreted — Claude reports what is printed and the app
        decides what is in or out of range. Correct anything that looks wrong before saving.
      </p>
    </form>
  );
}
