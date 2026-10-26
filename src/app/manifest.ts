import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "POCKET CFO — Know your numbers. Grow your business.",
    short_name: "POCKET CFO",
    description:
      "Track cash flow, customers, quotes, invoices, tasks and funding readiness for your business.",
    start_url: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#f4f7fb",
    theme_color: "#080f16",
    lang: "en-ZA",
    categories: ["business", "finance", "productivity"],
    icons: [
      {
        src: "/pocket-cfo-icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/pocket-cfo-icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/pocket-cfo-icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
