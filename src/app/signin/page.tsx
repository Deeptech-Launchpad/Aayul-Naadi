import Link from "next/link";
import { redirect } from "next/navigation";
import { currentSession } from "@/lib/auth";
import { demoSignInAction, signInAction } from "@/app/actions/auth";
import { env } from "@/lib/env";
import { ActionForm, SubmitButton } from "@/components/form";
import { BrandMark, Icon } from "@/components/icons";

export const metadata = { title: "Sign in · Aayu" };

export default async function SignInPage() {
  if (await currentSession()) redirect("/today");

  return (
    <main className="auth-shell">
      <div style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
        <BrandMark />
        <div>
          <h1 style={{ fontSize: 27 }}>Welcome back</h1>
          <p style={{ fontSize: 13.5, color: "var(--txt-2)", marginTop: 6, lineHeight: 1.5 }}>
            Your record is encrypted. Your passphrase is one of the two keys that opens it.
          </p>
        </div>
      </div>

      <ActionForm action={signInAction}>
        <div className="field">
          <label className="label" htmlFor="email">Email</label>
          <input id="email" name="email" type="email" autoComplete="username" required className="input" placeholder="you@example.com" />
        </div>
        <div className="field">
          <label className="label" htmlFor="passphrase">Passphrase</label>
          <input id="passphrase" name="passphrase" type="password" autoComplete="current-password" required className="input" placeholder="At least 12 characters" />
        </div>
        <SubmitButton pendingLabel="Unlocking…">Unlock</SubmitButton>
      </ActionForm>

      {env.demoEmail && (
        <div className="stack" style={{ gap: 9 }}>
          <div className="rule-or"><span>or</span></div>
          <ActionForm action={demoSignInAction}>
            <SubmitButton className="btn ghost" pendingLabel="Opening the demo…">
              Look around the demo
            </SubmitButton>
          </ActionForm>
          <p style={{ textAlign: "center", fontSize: 12.5, color: "var(--txt-3)", lineHeight: 1.5 }}>
            A sample record on a shared account — no passphrase, no authenticator code.
            Every reading in it is invented.
          </p>
        </div>
      )}

      <div style={{ textAlign: "center", fontSize: 13, color: "var(--txt-3)" }}>
        No account yet? <Link href="/signup" style={{ fontWeight: 600 }}>Create one</Link>
      </div>

      <div className="notice info">
        <Icon name="shield" />
        <span>
          Health data is encrypted at rest with AES-256-GCM. Six failed attempts locks the account for
          fifteen minutes, and every attempt is written to your access log.
        </span>
      </div>
    </main>
  );
}
