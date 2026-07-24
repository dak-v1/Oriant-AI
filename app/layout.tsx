import type { Metadata } from "next";
import { Manrope, Instrument_Serif } from "next/font/google";
import "./globals.css";

// Oriant.ai landing: Manrope (interface/body) + Instrument Serif (editorial accent)
const manrope = Manrope({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-manrope",
});

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-instrument-serif",
});

export const metadata: Metadata = {
  title: "Oriant.ai - Your AI Operations Consultant",
  description:
    "Learn how your business works, identify high-value AI opportunities, and plan a customised AI workforce with human approval built in.",
  openGraph: {
    title: "Oriant.ai - From business discovery to a working AI workforce",
    description:
      "Discover, plan, approve, deploy, and manage an AI workforce designed around your business.",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${manrope.variable} ${instrumentSerif.variable}`}>
      <body>{children}</body>
    </html>
  );
}
