"use client";

import { useActionState, useState } from "react";
import { deleteAccountAction, type SecurityState } from "@/app/actions/security";
import { clearRecordAction, type ImportState } from "@/app/actions/data";
import { FormError, SubmitButton } from "./form";
import { Icon } from "./icons";

export function DangerZone({ email }: { email: string }) {
  const [clearState, clearAction] = useActionState(clearRecordAction, {} as ImportState);
  const [deleteState, deleteAction] = useActionState(deleteAccountAction, {} as SecurityState);
  const [open, setOpen] = useState(false);

  return (
    <div className="stack-sm">
      <div className="section-title"><span>Permanent</span></div>

      {!open ? (
        <button type="button" className="btn ghost md" onClick={() => setOpen(true)}>
          <Icon name="trash" /> Clear or delete my data
        </button>
      ) : (
        <>
          <form action={clearAction} className="card stack-sm">
            <FormError message={clearState.error} />
            {clearState.message && <div className="notice info"><Icon name="check" />{clearState.message}</div>}
            <b style={{ fontFamily: "var(--f-display)", fontSize: 14.5 }}>Clear the health record</b>
            <p className="card-body" style={{ marginTop: 0 }}>
              Deletes every reading, lab panel, document, medication and conversation. Your account,
              its passphrase and its security settings stay — this is the button to press before you
              replace the sample record with your own data.
            </p>
            <div className="field">
              <label className="label" htmlFor="clear-confirm">Type CLEAR to confirm</label>
              <input id="clear-confirm" name="confirm" className="input mono" placeholder="CLEAR" autoComplete="off" />
            </div>
            <SubmitButton className="btn danger md" pendingLabel="Clearing…">Clear the record</SubmitButton>
          </form>

          <form action={deleteAction} className="card danger stack-sm">
            <FormError message={deleteState.error} />
            <b style={{ fontFamily: "var(--f-display)", fontSize: 14.5, color: "var(--high)" }}>Delete the account</b>
            <p className="card-body" style={{ marginTop: 0 }}>
              Erases everything above <em>and</em> the account itself — sessions, recovery codes,
              uploaded files, and the audit log. Nothing is recoverable, by you or by anyone running
              this server.
            </p>
            <div className="field">
              <label className="label" htmlFor="delete-confirm">Type your email to confirm</label>
              <input id="delete-confirm" name="confirm" className="input mono" placeholder={email} autoComplete="off" />
            </div>
            <SubmitButton className="btn danger md" pendingLabel="Deleting…">Delete everything</SubmitButton>
          </form>
        </>
      )}
    </div>
  );
}
