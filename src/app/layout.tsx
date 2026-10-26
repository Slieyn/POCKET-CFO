import type { Metadata, Viewport } from "next";
import "./globals.css";

const appOrigin = process.env.APP_ORIGIN ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(appOrigin),
  applicationName: "POCKET CFO",
  title: {
    default: "POCKET CFO — Know your numbers. Grow your business.",
    template: "%s · POCKET CFO",
  },
  description:
    "POCKET CFO is a secure, practical business finance and record-keeping workspace for South African businesses. Track cash flow, customers, quotes, invoices, tasks and funding readiness.",
  keywords: [
    "small business finance",
    "cash flow",
    "invoicing",
    "quotes",
    "South Africa",
    "ZAR",
    "bookkeeping",
    "funding readiness",
    "business calendar",
  ],
  category: "business",
  icons: {
    icon: [
      { url: "/favicon-32.png", type: "image/png", sizes: "32x32" },
      { url: "/pocket-cfo-icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/pocket-cfo-mark.svg", type: "image/svg+xml" },
    ],
    apple: [{ url: "/apple-touch-icon.png", type: "image/png", sizes: "180x180" }],
  },
  openGraph: {
    type: "website",
    locale: "en_ZA",
    siteName: "POCKET CFO",
    title: "POCKET CFO — Know your numbers. Grow your business.",
    description:
      "Know your money, send professional quotes and invoices, plan your week, and build records lenders can follow.",
    images: [
      {
        url: "/pocket-cfo-og.png",
        width: 1200,
        height: 630,
        alt: "POCKET CFO — Know your numbers. Grow your business.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "POCKET CFO — Know your numbers. Grow your business.",
    description:
      "Know your money, send professional quotes and invoices, plan your week, and build records lenders can follow.",
    images: ["/pocket-cfo-og.png"],
  },
  robots: { index: true, follow: true },
  formatDetection: { telephone: false, address: false, email: false },
  appleWebApp: {
    capable: true,
    title: "POCKET CFO",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#080f16",
  colorScheme: "light",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-ZA">
      <body>{children}</body>
    </html>
  );
}
