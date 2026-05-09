import type { Metadata } from "next";
import {
  ClerkProvider,
} from "@clerk/nextjs";
import "./globals.css";
import { Navbar } from "./navbar";
import { Providers } from "@/components/providers";

export const metadata: Metadata = {
  title: "Insurge — Tracking Intelligence",
  description: "Diagnose issues with GA4 ecommerce tracking, Meta Pixel, and Google Ads conversion tracking.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;0,9..144,700;0,9..144,800;1,9..144,400;1,9..144,500&family=Geist:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-bg text-text">
        <ClerkProvider>
          <Providers>
            <Navbar />
            {children}
          </Providers>
        </ClerkProvider>
      </body>
    </html>
  );
}
