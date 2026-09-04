"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "./icons";

export function Uploader({ pollForProcessing = false }: { pollForProcessing?: boolean }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<"idle" | "uploading" | "reading" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  // While a document is being read, refresh so its status lands without a tap.
  useEffect(() => {
    if (!pollForProcessing && status !== "reading") return;
    const timer = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(timer);
  }, [pollForProcessing, status, router]);

  async function upload(file: File) {
    setStatus("uploading");
    setMessage(`Uploading ${file.name}…`);

    const body = new FormData();
    body.set("file", file);

    try {
      const response = await fetch("/api/documents/upload", { method: "POST", body });
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        setStatus("error");
        setMessage(result.error ?? "The upload failed.");
        return;
      }
      if (result.status === "failed") {
        setStatus("error");
        setMessage("The file was stored, but it could not be read. Open it from the library to see why.");
        router.refresh();
        return;
      }
      setStatus("reading");
      setMessage("Nadi is reading the document. This takes about half a minute for a multi-page report.");
      router.refresh();
    } catch {
      setStatus("error");
      setMessage("The upload did not reach the server.");
    }
  }

  return (
    <div className="stack-sm">
      <div className="dropzone">
        <Icon name="upload" size={28} />
        <div style={{ fontSize: 13.5, fontWeight: 600 }}>Add a document</div>
        <small>
          Photograph a lab report, or choose a PDF or image. 25 MB max.
          <br />
          Claude reads it and proposes the markers — you confirm before anything is saved.
        </small>
        <div className="btn-row" style={{ width: "100%", marginTop: 4 }}>
          <button type="button" className="btn md" onClick={() => cameraRef.current?.click()} disabled={status === "uploading"}>
            <Icon name="camera" /> Take photo
          </button>
          <button type="button" className="btn ghost md" onClick={() => fileRef.current?.click()} disabled={status === "uploading"}>
            Choose file
          </button>
        </div>
        <input
          ref={cameraRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }}
        />
        <input
          ref={fileRef} type="file" accept="application/pdf,image/png,image/jpeg,image/webp,image/heic" style={{ display: "none" }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }}
        />
      </div>

      {message && (
        <div className={`notice ${status === "error" ? "error" : "info"}`}>
          <Icon name={status === "error" ? "alert" : status === "reading" ? "sparkle" : "upload"} />
          <span>{message}</span>
        </div>
      )}
    </div>
  );
}
