import type { MetadataRoute } from "next";

// POCKET CFO holds private business records, so no page should be indexed.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", disallow: "/" }],
  };
}
