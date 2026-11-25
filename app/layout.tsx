import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FloodLoop AI — Maharashtra Flood Watch & Safe Route AI",
  description:
    "Mobile-first PWA for Maharashtra waterlogging awareness, crowdsourced flood reporting, and safe route prediction across all 6 regions.",
  manifest: "/manifest.json",
  icons: { icon: "/icon-192.svg", apple: "/icon-192.svg" },
};

export const viewport: Viewport = {
  themeColor: "#071022",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased dark">
      <body className="min-h-full flex flex-col bg-[#071022] text-slate-100">{children}</body>
    </html>
  );
}
