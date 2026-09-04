import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { openJsonSafe, shareKey, tokenDigest } from "@/lib/crypto";
import { audit } from "@/lib/audit";
import { BrandMark } from "@/components/icons";

export const dynamic = "force-dynamic";
export const metadata = { title: "Shared health note", robots: { index: false, follow: false } };

type Payload = {
  summary: string;
  questions: string[];
  createdAt: string;
};

/**
 * The one page in Aayu that is reachable without signing in. It is read-only,
 * expires, is revocable, and its payload is encrypted under a key derived from
 * the link itself.
 */
export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const link = await db.shareLink.findUnique({ where: { tokenHash: tokenDigest(token) } });
  if (!link) notFound();

  if (link.revokedAt) return <Expired reason="This link was revoked by the person who created it." />;
  if (link.expiresAt < new Date()) return <Expired reason="This link has expired. Links last seven days." />;

  const payload = openJsonSafe<Payload | null>(shareKey(token), link.payloadEnc, null);
  if (!payload) return <Expired reason="This note could not be opened." />;

  await db.shareLink.update({
    where: { id: link.id },
    data: { views: { increment: 1 }, lastViewAt: new Date() },
  });
  await audit({ userId: link.userId, action: "share.view", resource: `share:${link.id}` });

  return (
    <main className="auth-shell" style={{ maxWidth: 620, justifyContent: "flex-start", paddingTop: 36 }}>
      <div className="brand">
        <BrandMark size={36} />
        <div>
          <div className="word" style={{ fontSize: 21 }}>aayu<span>.</span></div>
          <div className="tag">Shared health note · read only</div>
        </div>
      </div>

      <div className="notice info">
        <span>
          Prepared {new Date(payload.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}.
          This link expires {link.expiresAt.toLocaleDateString("en-GB", { day: "numeric", month: "long" })} and can be
          revoked at any time by the person who shared it.
        </span>
      </div>

      <section className="card">
        <div className="card-title"><span>Summary</span></div>
        <p className="card-body" style={{ fontSize: 14.5 }}>{payload.summary}</p>
      </section>

      {payload.questions.length > 0 && (
        <section className="card rows">
          <div className="card-title" style={{ padding: "12px 0 4px" }}><span>Questions to discuss</span></div>
          {payload.questions.map((question, i) => (
            <div className="row" key={i}>
              <span className="ic j mono" style={{ fontSize: 12, fontWeight: 600 }}>{i + 1}</span>
              <span className="tx"><b style={{ fontWeight: 500 }}>{question}</b></span>
            </div>
          ))}
        </section>
      )}

      <p className="disclaimer">
        Prepared from a personal health record by Aayu. It summarises what the record contains and
        is not a clinical document, a diagnosis, or a substitute for examination.
      </p>
    </main>
  );
}

function Expired({ reason }: { reason: string }) {
  return (
    <main className="auth-shell" style={{ maxWidth: 460, textAlign: "center", alignItems: "center" }}>
      <BrandMark size={40} />
      <h1 style={{ fontSize: 22 }}>This link is no longer available</h1>
      <p style={{ fontSize: 13.5, color: "var(--txt-2)" }}>{reason}</p>
    </main>
  );
}
