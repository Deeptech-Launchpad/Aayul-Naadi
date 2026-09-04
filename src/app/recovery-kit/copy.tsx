"use client";

import { useState } from "react";
import { Icon } from "@/components/icons";

export function CopyCodes({ codes }: { codes: string[] }) {
  const [copied, setCopied] = useState(false);
  const text = `Aayu recovery codes — ${new Date().toISOString().slice(0, 10)}\n\n${codes.join("\n")}\n\nEach code works once. Keep these somewhere you can reach without your phone.\n`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  }

  function download() {
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "aayu-recovery-codes.txt";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="btn-row">
      <button type="button" className="btn ghost md" onClick={copy}>
        <Icon name={copied ? "check" : "file"} />
        {copied ? "Copied" : "Copy"}
      </button>
      <button type="button" className="btn ghost md" onClick={download}>
        <Icon name="download" />
        Download
      </button>
      <button type="button" className="btn ghost md" onClick={() => window.print()}>
        <Icon name="file" />
        Print
      </button>
    </div>
  );
}
