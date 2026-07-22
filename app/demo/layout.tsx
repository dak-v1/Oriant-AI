import { Bricolage_Grotesque, Instrument_Sans, Space_Mono } from "next/font/google";

// Margo demo app fonts — loaded only on /demo routes.
const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-bricolage",
});

const instrumentSans = Instrument_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-instrument-sans",
  style: ["normal", "italic"],
});

const spaceMono = Space_Mono({
  subsets: ["latin"],
  weight: ["400", "700"],
  display: "swap",
  variable: "--font-space-mono",
});

export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${bricolage.variable} ${instrumentSans.variable} ${spaceMono.variable}`}>
      {children}
    </div>
  );
}
