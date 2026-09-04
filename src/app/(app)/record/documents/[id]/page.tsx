import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { openJsonSafe, openText } from "@/lib/crypto";
import { AppBar } from "@/components/appbar";
import { Icon } from "@/components/icons";
import { ExtractionReview } from "@/components/extraction-review";
import { deleteDocumentAction } from "@/app/actions/documents";
import { REVIEW_THRESHOLD } from "@/lib/extract";
import type { ExtractionResult } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireUser();
  const { id } = await params;

  const document = await db.document.findFirst({ where: { id, userId: ctx.user.id } });
  if (!document) notFound();

  const filename = openText(ctx.dek, document.filenameEnc);
  const extraction = openJsonSafe<ExtractionResult | null>(ctx.dek, document.extractionEnc, null);
  const text = document.textEnc ? openText(ctx.dek, document.textEnc) : null;
  const hasFile = !document.storageKey.startsWith("sample/");

  return (
    <>
      <AppBar
        title={document.status === "needs_review" ? `Confirm ${extraction?.markers.length ?? 0} markers` : filename}
        subtitle={
          extraction?.panelName
            ? `${extraction.panelName} · ${document.uploadedAt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`
            : document.uploadedAt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
        }
        back="/record/documents"
      />

      <main className="shell-body">
        <section className="card flat" style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <span className="ic j" style={{ width: 40, height: 40, borderRadius: 11, background: "var(--jade-mist)", color: "var(--jade)", display: "grid", placeItems: "center", flex: "none" }}>
            <Icon name={document.mime === "application/pdf" ? "file" : "camera"} size={19} />
          </span>
          <div className="grow">
            <b style={{ fontSize: 13 }}>{filename}</b>
            <div style={{ fontSize: 11, color: "var(--txt-3)" }}>
              {(document.sizeBytes / 1024).toFixed(0)} KB · {document.mime}
              {extraction?.labName ? ` · ${extraction.labName}` : ""}
            </div>
          </div>
          {hasFile && (
            <Link href={`/api/documents/${document.id}/file`} target="_blank" className="btn sm ghost">
              <Icon name="eye" size={14} /> View
            </Link>
          )}
        </section>

        {document.status === "processing" && (
          <div className="notice info">
            <Icon name="clock" />
            <span>Nadi is reading this document. Come back in a moment — the page updates itself.</span>
          </div>
        )}

        {document.status === "failed" && (
          <div className="notice error">
            <Icon name="alert" />
            <span>
              <b>This document could not be read.</b> {document.errorMessage ?? "No reason was recorded."} The
              file itself is stored and encrypted, and you can still view it above.
            </span>
          </div>
        )}

        {extraction && document.status === "needs_review" && (
          <ExtractionReview
            documentId={document.id}
            extraction={extraction}
            threshold={REVIEW_THRESHOLD}
          />
        )}

        {extraction && document.status === "confirmed" && (
          <>
            <div className="section-title"><span>Saved into your record</span></div>
            <section className="card rows">
              {extraction.markers.filter((m) => m.accepted).map((marker, i) => (
                <div className="row" key={i}>
                  <span className="tx">
                    <b>{marker.name}</b>
                    <small>{marker.refText ?? (marker.refLow != null || marker.refHigh != null ? `ref ${marker.refLow ?? "–"}–${marker.refHigh ?? "–"}` : "no reference range")}</small>
                  </span>
                  <span className="val">{marker.value}<small>{marker.unit}</small></span>
                </div>
              ))}
            </section>
            {extraction.markers.some((m) => !m.accepted) && (
              <p className="disclaimer">
                {extraction.markers.filter((m) => !m.accepted).length} marker(s) from this document
                were not saved, because you left them unticked.
              </p>
            )}
          </>
        )}

        {extraction?.impression && (
          <>
            <div className="section-title"><span>Impression</span></div>
            <section className="card"><p className="card-body">{extraction.impression}</p></section>
          </>
        )}

        {text && (
          <details className="card">
            <summary style={{ cursor: "pointer", fontSize: 13.5, fontWeight: 600 }}>
              Transcribed text · searchable by Nadi
            </summary>
            <pre
              className="mono"
              style={{ fontSize: 11, whiteSpace: "pre-wrap", color: "var(--txt-2)", marginTop: 12, lineHeight: 1.6 }}
            >
              {text}
            </pre>
          </details>
        )}

        <form action={deleteDocumentAction}>
          <input type="hidden" name="id" value={document.id} />
          <button type="submit" className="btn danger md">
            <Icon name="trash" /> Delete this document and its results
          </button>
        </form>
      </main>
    </>
  );
}
