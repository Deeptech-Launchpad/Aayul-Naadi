import { requireApiUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { openText } from "@/lib/crypto";
import { readEncrypted } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Serves the original file, decrypted, only to the session that owns it. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const ctx = await requireApiUser();
  if (!ctx) return new Response("Not signed in.", { status: 401 });

  const { id } = await params;
  const document = await db.document.findFirst({ where: { id, userId: ctx.user.id } });
  if (!document) return new Response("Not found.", { status: 404 });
  if (document.storageKey.startsWith("sample/")) {
    return new Response("This is a sample document with no file behind it.", { status: 404 });
  }

  let data: Buffer;
  try {
    data = await readEncrypted(ctx.dek, document.storageKey);
  } catch {
    return new Response("The stored file could not be read.", { status: 410 });
  }

  await audit({ userId: ctx.user.id, action: "record.read", resource: `document.file:${id}` });

  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": document.mime,
      "Content-Disposition": `inline; filename="${encodeURIComponent(openText(ctx.dek, document.filenameEnc))}"`,
      "Cache-Control": "no-store, private",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
