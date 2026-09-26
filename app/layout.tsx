import type { Metadata } from "next";
import { DM_Serif_Display, JetBrains_Mono, Manrope } from "next/font/google";
import "./globals.css";

const display = DM_Serif_Display({ variable: "--font-display", subsets: ["latin"], weight: "400" });
const body = Manrope({ variable: "--font-body", subsets: ["latin"] });
const mono = JetBrains_Mono({ variable: "--font-num", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Jev Poker Tutor",
  description: "Play No-Limit Hold'em against bots while TypeSafe AI's Jev reads opponents and recommends your best move.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable} h-full antialiased`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
