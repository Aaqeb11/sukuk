import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import type { ReactElement, ReactNode } from "react";
import { IBM_Plex_Mono, IBM_Plex_Sans, Space_Grotesk } from "next/font/google";

import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["500", "700"],
});

const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

const DESCRIPTION =
  "Own a slice of a real building and earn your share of its rent, with no interest and no promised return. Sukuk tokenizes income-producing assets on Solana: owners list and raise, investors hold units and get paid pro-rata. A proof of concept on devnet.";

export const metadata: Metadata = {
  metadataBase: new URL("https://sukukinvest.xyz"),
  title: "Sukuk — own a slice of a building, earn its rent",
  description: DESCRIPTION,
  openGraph: {
    title: "Sukuk — own a slice of a building, earn its rent",
    description: DESCRIPTION,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Sukuk — own a slice of a building, earn its rent",
    description: DESCRIPTION,
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body
        className={`${spaceGrotesk.variable} ${plexSans.variable} ${plexMono.variable} font-sans antialiased`}
      >
        {children}
        <Analytics />
      </body>
    </html>
  );
}
