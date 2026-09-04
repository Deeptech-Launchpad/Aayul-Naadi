import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { AppBar } from "@/components/appbar";
import { Icon } from "@/components/icons";
import { ConsentForm, LockForm } from "@/components/security-forms";
import { revokeOtherSessionsAction, revokeSessionAction } from "@/app/actions/security";
import type { ConsentCategories } from "@/lib/types";

export const metadata = { title: "Security & privacy · Aayu" };
export const dynamic = "force-dynamic";

export default async function SecurityPage() {
  const ctx = await requireUser();
  const [sessions, codes, failed] = await Promise.all([
    db.session.findMany({
      where: { userId: ctx.user.id, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastSeenAt: "desc" },
    }),
    db.recoveryCode.count({ where: { userId: ctx.user.id, usedAt: null } }),
    db.auditEvent.count({
      where: {
        userId: ctx.user.id,
        action: "auth.signin_failed",
        at: { gte: new Date(Date.now() - 30 * 86_400_000) },
      },
    }),
  ]);

  const consent = (ctx.user.consent ?? {}) as ConsentCategories;
  const everythingOn = ctx.user.totpEnabled && codes > 0;

  return (
    <>
      <AppBar title="Security & privacy" subtitle={`${sessions.length} active device${sessions.length === 1 ? "" : "s"}`} back="/profile" />
      <main className="shell-body">
        <section className={`card ${everythingOn ? "tint" : "warn"}`} style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <Icon name="shield" size={28} />
          <div>
            <b style={{ fontFamily: "var(--f-display)", fontSize: 15 }}>
              {everythingOn ? "Everything is protected" : "One protection is missing"}
            </b>
            <div style={{ fontSize: 12, color: "var(--txt-2)", lineHeight: 1.45, marginTop: 2 }}>
              {ctx.user.totpEnabled ? "2FA on" : "2FA off"} · encryption active ·{" "}
              {codes} recovery code{codes === 1 ? "" : "s"} left ·{" "}
              {failed === 0 ? "no failed sign-ins in 30 days" : `${failed} failed sign-in${failed === 1 ? "" : "s"} in 30 days`}
            </div>
          </div>
        </section>

        <div className="section-title"><span>Access</span></div>
        <section className="card rows">
          <div className="row">
            <span className={`ic ${ctx.user.totpEnabled ? "j" : "h"}`}><Icon name="lock" /></span>
            <span className="tx">
              <b>Two-factor authentication</b>
              <small>{ctx.user.totpEnabled ? "Authenticator app enrolled" : "Not enrolled"}</small>
            </span>
            <Link href="/enroll" className="btn sm ghost">{ctx.user.totpEnabled ? "Re-enrol" : "Set up"}</Link>
          </div>
          <div className="row">
            <span className={`ic ${codes > 2 ? "j" : "w"}`}><Icon name="key" /></span>
            <span className="tx">
              <b>Recovery codes</b>
              <small>{codes} unused. Each works once.</small>
            </span>
            <Link href="/recovery-kit" className="btn sm ghost">New kit</Link>
          </div>
        </section>

        <LockForm hasPin={Boolean(ctx.user.pinHash)} timeoutSec={ctx.user.lockTimeoutSec} />

        <div className="section-title">
          <span>Devices</span>
          {sessions.length > 1 && (
            <form action={revokeOtherSessionsAction}>
              <button type="submit" style={{ background: "none", border: 0, color: "var(--jade)", fontSize: 11, cursor: "pointer" }}>
                Sign out others
              </button>
            </form>
          )}
        </div>
        <section className="card rows">
          {sessions.map((session) => {
            const isCurrent = session.id === ctx.sessionId;
            return (
              <div className="row" key={session.id}>
                <span className="ic j">
                  <Icon name={/iPhone|Android|iPad/.test(session.deviceLabel) ? "phone" : "laptop"} />
                </span>
                <span className="tx">
                  <b>{session.deviceLabel}{isCurrent ? " · this device" : ""}</b>
                  <small>
                    Last active{" "}
                    {session.lastSeenAt.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    {session.twoFactorAt ? " · 2FA passed" : " · awaiting 2FA"}
                  </small>
                </span>
                {isCurrent ? (
                  <span className="pill ok">Current</span>
                ) : (
                  <form action={revokeSessionAction}>
                    <input type="hidden" name="id" value={session.id} />
                    <button type="submit" className="btn sm ghost">Revoke</button>
                  </form>
                )}
              </div>
            );
          })}
        </section>

        <div className="section-title"><span>What Nadi may read</span></div>
        <ConsentForm consent={consent} consentAt={ctx.user.consentAt?.toISOString() ?? null} />

        <div className="section-title"><span>Encryption</span></div>
        <section className="card flat">
          <div className="kv"><span>Health fields &amp; files</span><b style={{ color: "var(--ok)" }}>AES-256-GCM</b></div>
          <div className="kv"><span>Key wrapping</span><b>Per-user data key</b></div>
          <div className="kv"><span>Passphrase hashing</span><b>Argon2id · 64 MiB · t=3</b></div>
          <div className="kv"><span>Session cookies</span><b>httpOnly · SameSite=Strict</b></div>
          <div className="kv"><span>Third-party scripts</span><b>None</b></div>
        </section>
        <p className="disclaimer">
          Your record key is wrapped twice: once with a key derived from your passphrase, and once
          with the server&rsquo;s master key so that background work can run. A stolen database is
          ciphertext without that master key. This is not end-to-end encryption — while the app is
          running it can decrypt your record, and it says so rather than claiming otherwise.
        </p>

        <Link href="/profile/audit" className="btn ghost md">
          <Icon name="record" /> Access log, export &amp; erase
        </Link>
      </main>
    </>
  );
}
