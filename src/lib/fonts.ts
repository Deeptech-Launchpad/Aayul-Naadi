import localFont from "next/font/local";

/**
 * Fonts are vendored rather than fetched at build time: the app's CSP allows
 * no external origins, and a build must not depend on reaching Google.
 */

export const display = localFont({
  src: [{ path: "../fonts/BricolageGrotesque-400_800.woff2", weight: "400 800", style: "normal" }],
  variable: "--font-display",
  display: "swap",
  fallback: ["Trebuchet MS", "system-ui", "sans-serif"],
});

export const body = localFont({
  src: [{ path: "../fonts/IBMPlexSans.woff2", weight: "100 700", style: "normal" }],
  variable: "--font-body",
  display: "swap",
  fallback: ["-apple-system", "BlinkMacSystemFont", "Segoe UI", "system-ui", "sans-serif"],
});

export const mono = localFont({
  src: [
    { path: "../fonts/IBMPlexMono-400.woff2", weight: "400", style: "normal" },
    { path: "../fonts/IBMPlexMono-500.woff2", weight: "500", style: "normal" },
    { path: "../fonts/IBMPlexMono-600.woff2", weight: "600", style: "normal" },
  ],
  variable: "--font-mono",
  display: "swap",
  fallback: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
});
