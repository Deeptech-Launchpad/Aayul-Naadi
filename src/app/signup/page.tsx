import Link from "next/link";
import { redirect } from "next/navigation";
import { currentSession } from "@/lib/auth";
import { env } from "@/lib/env";
import { signUpAction } from "@/app/actions/auth";
import { ActionForm, SubmitButton } from "@/components/form";
import { BrandMark, Icon } from "@/components/icons";

export const metadata = { title: "Create your record · Aayu" };

export default async function SignUpPage() {
  if (await currentSession()) redirect("/today");
  const mode = env.signupMode;

  if (mode === "closed") {
    return (
      <main className="auth-shell" style={{ maxWidth: 420, textAlign: "center", alignItems: "center" }}>
        <BrandMark />
        <h1 style={{ fontSize: 24 }}>Not accepting new accounts</h1>
        <p style={{ fontSize: 13.5, color: "var(--txt-2)" }}>
          This instance is closed to new registrations. If you already have an account, sign in.
        </p>
        <Link href="/signin" className="btn">Sign in</Link>
      </main>
    );
  }

  return (
    <main className="auth-shell">
      <div className="brand">
        <BrandMark />
        <div>
          <div className="word">aayu<span>.</span></div>
          <div className="tag">Continuous personal health intelligence</div>
        </div>
      </div>

      <div>
        <h1 style={{ fontSize: 26 }}>Create your record</h1>
        <p style={{ fontSize: 13.5, color: "var(--txt-2)", marginTop: 6, lineHeight: 1.55 }}>
          One account, one person, one record. The next three screens set up two-factor
          authentication and your recovery kit before anything else happens.
        </p>
      </div>

      <ActionForm action={signUpAction}>
        {mode === "invite" && (
          <div className="field">
            <label className="label" htmlFor="invite">Invite code</label>
            <input id="invite" name="invite" required className="input mono" autoComplete="off" placeholder="From whoever invited you" />
          </div>
        )}
        <div className="field">
          <label className="label" htmlFor="email">Email</label>
          <input id="email" name="email" type="email" autoComplete="username" required className="input" placeholder="you@example.com" />
        </div>
        <div className="field">
          <label className="label" htmlFor="passphrase">Passphrase</label>
          <input id="passphrase" name="passphrase" type="password" autoComplete="new-password" required minLength={12} className="input" placeholder="At least 12 characters" />
        </div>
        <div className="field">
          <label className="label" htmlFor="confirm">Passphrase again</label>
          <input id="confirm" name="confirm" type="password" autoComplete="new-password" required minLength={12} className="input" />
        </div>
        <SubmitButton pendingLabel="Creating…">Create account</SubmitButton>
      </ActionForm>

      <div className="notice warn">
        <Icon name="alert" />
        <span>
          <b>Choose a passphrase you will not lose.</b> A short sentence you can remember beats a
          short scramble you cannot. It is one of the two keys to your data.
        </span>
      </div>

      <div style={{ textAlign: "center", fontSize: 13, color: "var(--txt-3)" }}>
        Already have a record? <Link href="/signin" style={{ fontWeight: 600 }}>Sign in</Link>
      </div>
    </main>
  );
}
