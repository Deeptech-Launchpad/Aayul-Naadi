import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { currentSession, totpUri } from "@/lib/auth";
import { openText } from "@/lib/crypto";
import { verifyCodeAction } from "@/app/actions/auth";
import { ActionForm, SubmitButton } from "@/components/form";
import { Icon } from "@/components/icons";

export const metadata = { title: "Set up two-factor · Aayu" };

export default async function EnrollPage() {
  const session = await currentSession({ requireTwoFactor: false });
  if (!session) redirect("/signin");
  if (session.user.totpEnabled && (await currentSession())) redirect("/recovery-kit");

  const uri = await totpUri(session.user, session.dek);
  const qr = await QRCode.toDataURL(uri, { margin: 1, width: 480, color: { light: "#ffffff", dark: "#0e211c" } });
  const secret = openText(session.dek, session.user.totpSecretEnc!);

  return (
    <main className="auth-shell">
      <div>
        <div className="label" style={{ marginBottom: 8 }}>Step 1 of 2 · security</div>
        <h1 style={{ fontSize: 26 }}>Set up two-factor</h1>
        <p style={{ fontSize: 13.5, color: "var(--txt-2)", marginTop: 6, lineHeight: 1.55 }}>
          Scan this with any authenticator app — 1Password, Authy, Google Authenticator, your
          password manager. A passphrase alone is one stolen credential away from your whole history,
          so this step is not optional.
        </p>
      </div>

      <div className="card" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qr} alt="Two-factor setup QR code" width={210} height={210} style={{ borderRadius: 12 }} />
        <div style={{ textAlign: "center" }}>
          <div className="label">Or enter this key by hand</div>
          <div className="mono" style={{ fontSize: 13, wordBreak: "break-all", marginTop: 5, color: "var(--txt-2)" }}>
            {secret.match(/.{1,4}/g)?.join(" ")}
          </div>
        </div>
      </div>

      <ActionForm action={verifyCodeAction}>
        <input type="hidden" name="next" value="/recovery-kit" />
        <div className="field">
          <label className="label" htmlFor="code">Enter the six-digit code</label>
          <input
            id="code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9 ]*"
            maxLength={7}
            required
            className="input big"
            placeholder="000000"
          />
        </div>
        <SubmitButton pendingLabel="Checking…">Confirm and continue</SubmitButton>
      </ActionForm>

      <div className="notice info">
        <Icon name="shield" />
        <span>The secret is stored encrypted under your record key — it is never held in plain text on the server.</span>
      </div>
    </main>
  );
}
