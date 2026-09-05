import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RevoX — Agentic Recovery Intelligence",
  description: "AI-powered agentic platform for automated cash reconciliation, exception management, and intelligent recovery orchestration.",
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
