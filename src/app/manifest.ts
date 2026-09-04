import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Aayu — personal health intelligence",
    short_name: "Aayu",
    description: "Your labs, records, wearables and documents, read together.",
    start_url: "/today",
    display: "standalone",
    background_color: "#eff4f1",
    theme_color: "#0f6e5c",
    orientation: "portrait",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
