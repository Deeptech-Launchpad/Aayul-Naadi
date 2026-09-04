"use client";

import { useActionState, useRef, useState } from "react";
import { importFileAction, loadSampleAction, type ImportState } from "@/app/actions/data";
import { FormError, SubmitButton } from "./form";
import { Icon } from "./icons";

/**
 * Import is the connector that always works. Provider APIs come and go; an
 * export file parses offline, so it is the primary path rather than the
 * fallback.
 */
export function ConnectPanel({ compact = false }: { compact?: boolean }) {
  const [importState, importAction] = useActionState(importFileAction, {} as ImportState);
  const [sampleState, sampleAction] = useActionState(loadSampleAction, {} as ImportState);
  const [filename, setFilename] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="stack">
      <form action={importAction} className="stack-sm">
        <FormError message={importState.error} />
        {importState.message && (
          <div className="notice info"><Icon name="check" />{importState.message}</div>
        )}

        <div className="dropzone">
          <Icon name="upload" size={28} />
          <div style={{ fontSize: 13.5, fontWeight: 600 }}>Import an export file</div>
          <small>
            Apple Health <span className="mono">export.zip</span>, a FHIR R4 bundle
            (<span className="mono">.json</span>), or a CSV of readings.
            <br />
            Parsed on your own server — nothing is sent anywhere.
          </small>
          <input
            ref={inputRef}
            type="file"
            name="file"
            accept=".zip,.xml,.json,.csv,.tsv,application/json,text/csv"
            style={{ display: "none" }}
            onChange={(event) => setFilename(event.target.files?.[0]?.name ?? null)}
          />
          <div className="btn-row" style={{ width: "100%", marginTop: 4 }}>
            <button type="button" className="btn ghost md" onClick={() => inputRef.current?.click()}>
              {filename ? "Choose another" : "Choose file"}
            </button>
            <SubmitButton className="btn md" pendingLabel="Importing…">Import</SubmitButton>
          </div>
          {filename && <small className="mono" style={{ color: "var(--jade)" }}>{filename}</small>}
        </div>
      </form>

      {!compact && (
        <>
          <div className="section-title"><span>Or start with a sample record</span></div>
          <form action={sampleAction} className="stack-sm">
            <FormError message={sampleState.error} />
            {sampleState.message && (
              <div className="notice info"><Icon name="check" />{sampleState.message}</div>
            )}
            <div className="card">
              <div className="card-title"><span>Sample record</span><span>180 days</span></div>
              <p className="card-body">
                A constructed record for a 52-year-old with type 2 diabetes and hypertension — six
                months of wearables, three lab panels, three medications and three documents. Every
                screen fills up so you can judge the app properly before trusting it with your own labs.
              </p>
              <div style={{ marginTop: 12 }}>
                <SubmitButton className="btn ghost md" pendingLabel="Loading…">Load sample record</SubmitButton>
              </div>
            </div>
          </form>
        </>
      )}

      <div className="section-title"><span>Provider connections</span></div>
      <div className="card rows">
        {[
          { icon: "flask" as const, title: "Health system records", detail: "SMART on FHIR · needs an aggregator account" },
          { icon: "clock" as const, title: "Apple Health", detail: "Use the export file above — iOS has no server API" },
          { icon: "activity" as const, title: "Fitbit", detail: "OAuth app registration required" },
        ].map((item) => (
          <div className="row" key={item.title}>
            <span className="ic"><Icon name={item.icon} /></span>
            <span className="tx">
              <b>{item.title}</b>
              <small>{item.detail}</small>
            </span>
            <span className="pill">Set up needed</span>
          </div>
        ))}
      </div>
      <p className="disclaimer">
        Live provider sync needs credentials this app cannot create for you — an aggregator account
        for SMART on FHIR, a developer app for Fitbit. The import path above needs none of that and
        brings in the same data.
      </p>
    </div>
  );
}
