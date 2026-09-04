import { requireApiUser, type AuthedUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { sealJson, sealText } from "@/lib/crypto";
import { ALLOWED_MIME, MAX_UPLOAD_BYTES, sniffMime, storeEncrypted } from "@/lib/storage";
import { extractDocument, extractText } from "@/lib/extract";
import { nadiAvailable } from "@/lib/nadi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request): Promise<Response> {
  const ctx = await requireApiUser();
  if (!ctx) return json({ error: "Not signed in." }, 401);

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || file.size === 0) return json({ error: "Choose a file to upload." }, 400);
  if (file.size > MAX_UPLOAD_BYTES) {
    return json({ error: `That file is ${(file.size / 1_048_576).toFixed(1)} MB. The limit is 25 MB.` }, 413);
  }

  const data = Buffer.from(await file.arrayBuffer());
  const mime = sniffMime(data, file.type);
  if (!mime || !ALLOWED_MIME[mime]) {
    return json({ error: "Aayu reads PDFs and photographs. That file is neither." }, 415);
  }

  const storageKey = await storeEncrypted(ctx.user.id, ctx.dek, data);
  const document = await db.document.create({
    data: {
      userId: ctx.user.id,
      filenameEnc: sealText(ctx.dek, file.name.slice(0, 200)),
      mime,
      sizeBytes: data.length,
      storageKey,
      status: nadiAvailable() ? "processing" : "needs_review",
    },
  });
  await audit({
    userId: ctx.user.id,
    action: "document.upload",
    resource: `document:${document.id}`,
    dek: ctx.dek,
    detail: { filename: file.name, bytes: data.length, mime },
  });

  if (!nadiAvailable()) {
    await db.document.update({
      where: { id: document.id },
      data: { status: "failed", errorMessage: "ANTHROPIC_API_KEY is not set, so the document could not be read. The file itself is stored and encrypted." },
    });
    return json({ id: document.id, status: "failed" }, 200);
  }

  // Reading a multi-page report takes a while; the client polls for status
  // rather than holding the upload request open.
  void processDocument(ctx, document.id, data, mime);

  return json({ id: document.id, status: "processing" }, 202);
}

async function processDocument(ctx: AuthedUser, documentId: string, data: Buffer, mime: string): Promise<void> {
  try {
    const [extraction, text] = await Promise.all([
      extractDocument({ data, mime, filename: documentId }),
      extractText({ data, mime }).catch(() => ""),
    ]);

    if (!extraction.ok) {
      await db.document.update({
        where: { id: documentId },
        data: { status: "failed", errorMessage: extraction.error, processedAt: new Date() },
      });
      return;
    }

    await db.document.update({
      where: { id: documentId },
      data: {
        status: "needs_review",
        kind: extraction.result.documentKind,
        extractionEnc: sealJson(ctx.dek, extraction.result),
        textEnc: text ? sealText(ctx.dek, text) : null,
        processedAt: new Date(),
      },
    });
    await audit({
      userId: ctx.user.id,
      action: "document.extract",
      resource: `document:${documentId}`,
      dek: ctx.dek,
      detail: { markers: extraction.result.markers.length, kind: extraction.result.documentKind },
    });
  } catch (error) {
    await db.document.update({
      where: { id: documentId },
      data: {
        status: "failed",
        errorMessage: error instanceof Error ? error.message : "Reading the document failed.",
        processedAt: new Date(),
      },
    });
  }
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
