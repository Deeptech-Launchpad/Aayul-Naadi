import { headers } from "next/headers";
import { fingerprint } from "./crypto";

/** Coarse device label from the user agent — enough to recognise your own devices. */
export function deviceLabel(userAgent: string | null): string {
  if (!userAgent) return "Unknown device";
  const ua = userAgent;
  const platform = /iPhone/.test(ua)
    ? "iPhone"
    : /iPad/.test(ua)
      ? "iPad"
      : /Android/.test(ua)
        ? "Android"
        : /Macintosh/.test(ua)
          ? "Mac"
          : /Windows/.test(ua)
            ? "Windows"
            : /Linux/.test(ua)
              ? "Linux"
              : "Device";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Chrome\//.test(ua)
      ? "Chrome"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Safari\//.test(ua)
          ? "Safari"
          : "Browser";
  return `${platform} · ${browser}`;
}

export async function requestContext(): Promise<{ device: string; ipHash: string }> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  const ip = (forwarded ? forwarded.split(",")[0] : h.get("x-real-ip")) ?? "unknown";
  return {
    device: deviceLabel(h.get("user-agent")),
    // IP addresses are never stored in the clear — only a keyed fingerprint,
    // which is enough to tell "same place as usual" from "somewhere new".
    ipHash: fingerprint(ip.trim()),
  };
}
