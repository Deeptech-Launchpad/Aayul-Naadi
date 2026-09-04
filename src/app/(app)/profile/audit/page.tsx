import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { openJsonSafe } from "@/lib/crypto";
import { AppBar } from "@/components/appbar";
import { Icon } from "@/components/icons";
import { DangerZone } from "@/components/danger-zone";
import { revokeShareLinkAction } from "@/app/actions/share";

export const metadata = { title: "Access log · Aayu" };
export const dynamic = "force-dynamic";

const ACTION_LABEL: Record<string, { title: string; muted?: boolean }> = {
  "auth.signup": { title: "Account created" },
  "auth.signin": { title: "Signed in" },
  "auth.signin_failed": { title: "Failed sign-in attempt" },
  "auth.2fa_passed": { title: "Two-factor passed", muted: true },
  "auth.2fa_failed": { title: "Two-factor failed" },
  "auth.recovery_used": { title: "Recovery code used" },
  "auth.signout": { title: "Signed out", muted: true },
  "auth.session_revoked": { title: "Device revoked" },
  "auth.pin_failed": { title: "Wrong app-lock PIN" },
  "record.read": { title: "Record read", muted: true },
  "record.write": { title: "Record written" },
  "record.delete": { title: "Record deleted" },
  "document.upload": { title: "Document uploaded" },
  "document.extract": { title: "Document read by Nadi" },
  "document.confirm": { title: "Extraction confirmed" },
  "nadi.query": { title: "Nadi read your record" },
  "share.create": { title: "Share link created" },
  "share.view": { title: "Share link opened" },
  "share.revoke": { title: "Share link revoked" },
  "export.create": { title: "Data exported" },
  "settings.change": { title: "Setting changed", muted: true },
};

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ all?: string }>;
}) {
  const ctx = await requireUser();
  const params = await searchParams;
  const showAll = params.all === "1";

  const [events, shareLinks, counts] = await Promise.all([
    db.auditEvent.findMany({
      where: {
        userId: ctx.user.id,
        ...(showAll ? {} : { action: { notIn: ["record.read", "auth.2fa_passed"] } }),
      },
      orderBy: { at: "desc" },
      take: 150,
    }),
    db.shareLink.findMany({
      where: { userId: ctx.user.id, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    }),
    db.auditEvent.count({ where: { userId: ctx.user.id } }),
  ]);

  return (
    <>
      <AppBar
        title="Access log"
        subtitle={`${counts.toLocaleString("en-GB")} entries · every read and write`}
        back="/profile"
      />
      <main className="shell-body">
        <nav className="seg">
          <Link href="/profile/audit" data-active={!showAll}>Notable</Link>
          <Link href="/profile/audit?all=1" data-active={showAll}>Everything</Link>
        </nav>

        <section className="timeline">
          {events.map((event) => {
            const label = ACTION_LABEL[event.action] ?? { title: event.action, muted: true };
            const detail = openJsonSafe<Record<string, unknown> | null>(ctx.dek, event.detailEnc, null);
            return (
              <div className="tev" key={event.id} data-muted={label.muted || event.outcome === "ok" ? undefined : "true"}>
                <div className="d">
                  {event.at.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                </div>
                <b style={{ color: event.outcome === "denied" ? "var(--high)" : undefined }}>{label.title}</b>
                <small>
                  {event.resource}
                  {event.device ? ` · ${event.device}` : ""}
                  {detail ? ` · ${summarise(detail)}` : ""}
                </small>
              </div>
            );
          })}
          {events.length === 0 && <p className="disclaimer">Nothing recorded yet.</p>}
        </section>

        {shareLinks.length > 0 && (
          <>
            <div className="section-title"><span>Active share links</span></div>
            <section className="card rows">
              {shareLinks.map((link) => (
                <div className="row" key={link.id}>
                  <span className="ic w"><Icon name="share" /></span>
                  <span className="tx">
                    <b>Visit-prep note</b>
                    <small>
                      Expires {link.expiresAt.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} ·{" "}
                      {link.views} view{link.views === 1 ? "" : "s"}
                      {link.lastViewAt ? ` · last ${link.lastViewAt.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : ""}
                    </small>
                  </span>
                  <form action={revokeShareLinkAction}>
                    <input type="hidden" name="id" value={link.id} />
                    <button type="submit" className="btn sm ghost">Revoke</button>
                  </form>
                </div>
              ))}
            </section>
          </>
        )}

        <div className="section-title"><span>Your data</span></div>
        <section className="card rows">
          <a href="/api/export?format=json" className="row" download>
            <span className="ic j"><Icon name="download" /></span>
            <span className="tx">
              <b>Export everything as JSON</b>
              <small>Profile, conditions, medications, every reading, document text</small>
            </span>
            <Icon name="chevron" className="chev" strokeWidth={2} />
          </a>
          <a href="/api/export?format=fhir" className="row" download>
            <span className="ic j"><Icon name="download" /></span>
            <span className="tx">
              <b>Export as a FHIR R4 bundle</b>
              <small>Patient, Condition, AllergyIntolerance, MedicationStatement, Observation</small>
            </span>
            <Icon name="chevron" className="chev" strokeWidth={2} />
          </a>
        </section>

        <DangerZone email={ctx.user.email} />

        <p className="disclaimer">
          The log is append-only and written in the same transaction as the action it records, so it
          cannot drift from what actually happened. IP addresses are stored only as a keyed
          fingerprint, never in the clear.
        </p>
      </main>
    </>
  );
}

function summarise(detail: Record<string, unknown>): string {
  return Object.entries(detail)
    .slice(0, 3)
    .map(([key, value]) => `${key} ${typeof value === "string" ? value.slice(0, 40) : JSON.stringify(value)}`)
    .join(", ");
}
