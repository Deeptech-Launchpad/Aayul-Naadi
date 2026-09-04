"use client";

import { useActionState, useState } from "react";
import { updateConsentAction, updateLockAction, type SecurityState } from "@/app/actions/security";
import { CONSENT_LABELS, type ConsentCategories } from "@/lib/types";
import { FormError, SubmitButton } from "./form";
import { Icon } from "./icons";

export function ConsentForm({
  consent,
  consentAt,
}: {
  consent: ConsentCategories;
  consentAt: string | null;
}) {
  const [state, action] = useActionState(updateConsentAction, {} as SecurityState);
  const [values, setValues] = useState<Record<string, boolean>>(
    Object.fromEntries(CONSENT_LABELS.map((item) => [item.key, consent[item.key] === true])),
  );

  return (
    <form action={action} className="stack-sm">
      <FormError message={state.error} />
      {state.message && <div className="notice info"><Icon name="check" />{state.message}</div>}

      <div className="card rows">
        {CONSENT_LABELS.map((item) => (
          <div className="row" key={item.key}>
            <span className="tx">
              <b>{item.title}</b>
              <small>
                {values[item.key]
                  ? consentAt
                    ? `Allowed since ${new Date(consentAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`
                    : "Allowed"
                  : "Not allowed"}
              </small>
            </span>
            <input type="checkbox" name={item.key} checked={values[item.key]} readOnly hidden />
            <button
              type="button"
              className="switch"
              data-on={values[item.key]}
              aria-pressed={values[item.key]}
              aria-label={item.title}
              onClick={() => setValues({ ...values, [item.key]: !values[item.key] })}
            />
          </div>
        ))}
      </div>

      <SubmitButton className="btn ghost md" pendingLabel="Saving…">Save privacy settings</SubmitButton>
      <p className="disclaimer">
        A category switched off is excluded when the record is queried, not filtered out afterwards —
        Nadi never receives it in the first place.
      </p>
    </form>
  );
}

export function LockForm({ hasPin, timeoutSec }: { hasPin: boolean; timeoutSec: number }) {
  const [state, action] = useActionState(updateLockAction, {} as SecurityState);
  const [enabled, setEnabled] = useState(hasPin);

  return (
    <form action={action} className="stack-sm">
      <div className="section-title"><span>App lock</span></div>
      <FormError message={state.error} />
      {state.message && <div className="notice info"><Icon name="check" />{state.message}</div>}

      <div className="card">
        <div className="between">
          <span className="tx grow">
            <b style={{ fontSize: 13.5 }}>Require a PIN when Aayu reopens</b>
            <small style={{ fontSize: 11.5, color: "var(--txt-3)", display: "block", marginTop: 2 }}>
              Fast re-entry after the app has been in the background. It never re-sends your passphrase.
            </small>
          </span>
          <button
            type="button"
            className="switch"
            data-on={enabled}
            aria-pressed={enabled}
            aria-label="App lock"
            onClick={() => setEnabled(!enabled)}
          />
        </div>

        {enabled && (
          <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
            <div className="field grow">
              <label className="label" htmlFor="pin">PIN · 4 to 8 digits</label>
              <input
                id="pin" name="pin" inputMode="numeric" pattern="[0-9]*" maxLength={8}
                className="input mono" placeholder={hasPin ? "Enter a new PIN" : "e.g. 4821"} required={!hasPin}
              />
            </div>
            <div className="field" style={{ width: 130 }}>
              <label className="label" htmlFor="lockTimeoutSec">Lock after</label>
              <select id="lockTimeoutSec" name="lockTimeoutSec" className="input" defaultValue={timeoutSec}>
                <option value={30}>30 seconds</option>
                <option value={120}>2 minutes</option>
                <option value={300}>5 minutes</option>
                <option value={900}>15 minutes</option>
              </select>
            </div>
          </div>
        )}
        {!enabled && hasPin && <input type="hidden" name="pin" value="" />}
      </div>

      <SubmitButton className="btn ghost md" pendingLabel="Saving…">
        {enabled ? "Save app lock" : "Turn app lock off"}
      </SubmitButton>
    </form>
  );
}
