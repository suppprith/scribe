import type { Metadata } from "next";
import type { ReactNode } from "react";
import { DM_Mono, DM_Sans } from "next/font/google";
import { AppNav } from "@/components/AppNav";
import "./globals.css";

const dmSans = DM_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-dm-sans",
});

const dmMono = DM_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
  variable: "--font-dm-mono",
});

export const metadata: Metadata = {
  title: "scribe",
  description: "Self-hosted meeting-intelligence dashboard for Discord.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${dmSans.variable} ${dmMono.variable}`}>
      <body>
        <div className="flex min-h-screen flex-col">
          <AppNav />
          <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-10">{children}</main>
          <footer className="border-t border-border/70">
            <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-2 px-5 py-6 text-xs text-muted sm:flex-row">
              <span>Self-hosted meeting intelligence for Discord.</span>
              <span className="font-mono tracking-tight">scribe</span>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
