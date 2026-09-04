import { redirect } from "next/navigation";
import { currentSession } from "@/lib/auth";
import { recoveryCodeAction, verifyCodeAction } from "@/app/actions/auth";
import { ActionForm, SubmitButton } from "@/components/form";
import { Icon } from "@/components/icons";

export const metadata = { title: "Verify it's you · Aayu" };

export default async function VerifyPage() {
  const partial = await currentSession({ requireTwoFactor: false });
  if (!partial) redirect("/signin");
  if (!partial.user.totpEnabled) redirect("/enroll");
  if (await currentSession()) redirect("/today");

  return (
    <main className="auth-shell">
      <div>
        <div className="label" style={{ marginBottom: 8 }}>Step 2 of 2</div>
        <h1 style={{ fontSize: 26 }}>Verify it&rsquo;s you</h1>
        <p style={{ fontSize: 13.5, color: "var(--txt-2)", marginTop: 6 }}>
          Enter the six-digit code from your authenticator app.
        </p>
      </div>

      <ActionForm action={verifyCodeAction}>
        <input type="hidden" name="next" value="/today" />
        <input
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9 ]*"
          maxLength={7}
          required
          autoFocus
          className="input big"
          placeholder="000000"
          aria-label="Six-digit code"
        />
        <SubmitButton pendingLabel="Verifying…">Verify</SubmitButton>
      </ActionForm>

      <details className="card">
        <summary style={{ cursor: "pointer", fontSize: 13.5, fontWeight: 600 }}>
          Lost your authenticator?
        </summary>
        <p style={{ fontSize: 12.5, color: "var(--txt-2)", margin: "10px 0", lineHeight: 1.5 }}>
          Use one of the ten codes from your recovery kit. Each works once, and using one takes you
          straight to your security settings so you can enrol a new authenticator.
        </p>
        <ActionForm action={recoveryCodeAction}>
          <input name="code" required className="input mono" placeholder="XXXX-XXXX" aria-label="Recovery code" />
          <SubmitButton className="btn ghost" pendingLabel="Checking…">Use recovery code</SubmitButton>
        </ActionForm>
      </details>

      <div className="notice info">
        <Icon name="lock" />
        <span>Codes change every 30 seconds. If yours keeps failing, check that your phone&rsquo;s clock is set automatically.</span>
      </div>
    </main>
  );
}
