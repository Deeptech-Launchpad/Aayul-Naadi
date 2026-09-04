import Link from "next/link";
import { redirect } from "next/navigation";
import { countRecoveryCodes, currentSession, generateRecoveryCodes } from "@/lib/auth";
import { SubmitButton } from "@/components/form";
import { Icon } from "@/components/icons";
import { CopyCodes } from "./copy";

export const metadata = { title: "Your recovery kit · Aayu" };

export default async function RecoveryKitPage({
  searchParams,
}: {
  searchParams: Promise<{ generated?: string }>;
}) {
  const session = await currentSession();
  if (!session) redirect("/signin");
  const params = await searchParams;
  const remaining = await countRecoveryCodes(session.user.id);

  async function create(): Promise<void> {
    "use server";
    const active = await currentSession();
    if (!active) redirect("/signin");
    const codes = await generateRecoveryCodes(active.user.id);
    // Plaintext exists for this one render and nowhere else.
    redirect(`/recovery-kit?generated=${encodeURIComponent(codes.join(","))}`);
  }

  const codes = params.generated ? params.generated.split(",") : null;
  const nextHref = session.user.onboardedAt ? "/profile/security" : "/onboarding";

  return (
    <main className="auth-shell">
      <div>
        <h1 style={{ fontSize: 26 }}>Your recovery kit</h1>
        <p style={{ fontSize: 13.5, color: "var(--txt-2)", marginTop: 6, lineHeight: 1.55 }}>
          Ten single-use codes that get you back in if you lose your authenticator. Shown once —
          only their hashes are stored.
        </p>
      </div>

      <div className="notice warn">
        <Icon name="alert" />
        <span>
          If you lose <b>both</b> your passphrase and these codes, your record cannot be decrypted by
          anyone, including whoever runs this server. That is the point — but it means this page matters.
        </span>
      </div>

      {codes ? (
        <>
          <div className="card">
            <div className="card-title"><span>10 single-use codes</span><span>{new Date().toISOString().slice(0, 10)}</span></div>
            <div className="code-grid" style={{ marginTop: 12 }}>
              {codes.map((code) => <div key={code}>{code}</div>)}
            </div>
          </div>
          <CopyCodes codes={codes} />
          <Link href={nextHref} className="btn">I have saved these codes</Link>
        </>
      ) : (
        <>
          {remaining > 0 && (
            <div className="notice info">
              <Icon name="key" />
              <span>You already have {remaining} unused code{remaining === 1 ? "" : "s"}. Creating a new kit invalidates all of them.</span>
            </div>
          )}
          <form action={create} className="stack">
            <SubmitButton pendingLabel="Creating…">
              {remaining > 0 ? "Create a new recovery kit" : "Create my recovery kit"}
            </SubmitButton>
          </form>
          {remaining > 0 && <Link href={nextHref} className="btn ghost">Keep my existing codes</Link>}
        </>
      )}
    </main>
  );
}
