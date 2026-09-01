import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CIC — Cash Integrity Controller",
  description: "Finance-ops dashboard for automated cash reconciliation, exception management, and recovery orchestration.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
