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
  "Halal financing on Solana for any asset that earns income: real estate, aircraft, solar, equipment. Owners raise capital without interest and buy it back over time; investors share in what the asset actually earns.";

export const metadata: Metadata = {
  metadataBase: new URL("https://sukukinvest.xyz"),
  title: "Sukuk — raise capital without interest, share in what assets earn",
  description: DESCRIPTION,
  openGraph: {
    title: "Sukuk — raise capital without interest, share in what assets earn",
    description: DESCRIPTION,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Sukuk — raise capital without interest, share in what assets earn",
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
