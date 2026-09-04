import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { openJsonSafe, openText } from "@/lib/crypto";
import { AppBar } from "@/components/appbar";
import { SubNav } from "@/components/subnav";
import { Uploader } from "@/components/uploader";
import { Icon } from "@/components/icons";
import type { ExtractionResult } from "@/lib/types";

export const metadata = { title: "Documents · Aayu" };
export const dynamic = "force-dynamic";

const STATUS: Record<string, { pill: string; label: string; icon: "check" | "alert" | "clock" | "x" }> = {
  confirmed: { pill: "ok", label: "Confirmed", icon: "check" },
  needs_review: { pill: "watch", label: "Review", icon: "alert" },
  processing: { pill: "jade", label: "Reading", icon: "clock" },
  uploaded: { pill: "", label: "Queued", icon: "clock" },
  failed: { pill: "high", label: "Failed", icon: "x" },
};

export default async function DocumentsPage() {
  const ctx = await requireUser();
  const documents = await db.document.findMany({
    where: { userId: ctx.user.id },
    orderBy: { uploadedAt: "desc" },
    take: 100,
  });

  const markerCount = documents.reduce((total, doc) => {
    const extraction = openJsonSafe<ExtractionResult | null>(ctx.dek, doc.extractionEnc, null);
    return total + (extraction?.markers.length ?? 0);
  }, 0);

  const processing = documents.filter((d) => d.status === "processing").length;

  return (
    <>
      <AppBar
        title="Documents"
        subtitle={`${documents.length} file${documents.length === 1 ? "" : "s"} · ${markerCount} markers extracted`}
      />
      <main className="shell-body">
        <SubNav
          items={[
            { href: "/record", label: "Timeline" },
            { href: "/record/labs", label: "Labs" },
            { href: "/record/documents", label: "Documents" },
            { href: "/record/sources", label: "Sources" },
          ]}
        />

        <Uploader pollForProcessing={processing > 0} />

        {documents.length > 0 && (
          <>
            <div className="section-title"><span>Library</span></div>
            <section className="card rows">
              {documents.map((doc) => {
                const extraction = openJsonSafe<ExtractionResult | null>(ctx.dek, doc.extractionEnc, null);
                const status = STATUS[doc.status] ?? STATUS.uploaded;
                const unaccepted = extraction?.markers.filter((m) => !m.accepted).length ?? 0;

                return (
                  <Link href={`/record/documents/${doc.id}`} className="row" key={doc.id}>
                    <span className={`ic ${doc.status === "confirmed" ? "j" : doc.status === "failed" ? "h" : "w"}`}>
                      <Icon name={doc.mime === "application/pdf" ? "file" : "camera"} />
                    </span>
                    <span className="tx">
                      <b>{openText(ctx.dek, doc.filenameEnc)}</b>
                      <small>
                        {doc.uploadedAt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                        {extraction ? ` · ${extraction.markers.length} markers` : ""}
                        {unaccepted ? ` · ${unaccepted} need your eye` : ""}
                        {doc.status === "failed" && doc.errorMessage ? ` · ${doc.errorMessage.slice(0, 60)}` : ""}
                      </small>
                    </span>
                    <span className={`pill ${status.pill}`}>{status.label}</span>
                  </Link>
                );
              })}
            </section>
          </>
        )}

        <p className="disclaimer">
          Files are encrypted before they are written to disk and the original is always kept beside
          the values read from it. Nothing is saved into your record until you confirm it.
        </p>
      </main>
    </>
  );
}
