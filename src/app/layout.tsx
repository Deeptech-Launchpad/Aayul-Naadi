import type { Metadata, Viewport } from "next";
import { body, display, mono } from "@/lib/fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "Aayu",
  description: "Your health record, read together.",
  applicationName: "Aayu",
  appleWebApp: { capable: true, title: "Aayu", statusBarStyle: "default" },
  manifest: "/manifest.webmanifest",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#eff4f1" },
    { media: "(prefers-color-scheme: dark)", color: "#070e0c" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
