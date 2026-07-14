import "./globals.css";
import type { Metadata, Viewport } from "next";
import { Space_Grotesk, Inter } from "next/font/google";

// Moderne Schriften (wie im Schaltplan-Editor 2.0): Space Grotesk = Display/Titel,
// Inter = Fließtext. Selbst gehostet über next/font → offline- und druckfest.
const display = Space_Grotesk({ subsets: ["latin"], variable: "--font-display", display: "swap" });
const sans = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });

export const metadata: Metadata = {
  title: "Nexus — Stammdaten",
  description: "Zentrale Stammdaten-Verwaltung (Kunden, Projekte, Mitarbeiter, User)",
  applicationName: "Nexus",
  appleWebApp: {
    capable: true,
    title: "Nexus",
    statusBarStyle: "black-translucent",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1115" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" className={`${display.variable} ${sans.variable}`}>
      <body>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.theme==='dark'||(!('theme'in localStorage)&&matchMedia('(prefers-color-scheme:dark)').matches))document.documentElement.classList.add('dark')}catch(e){}`,
          }}
        />
        {children}
      </body>
    </html>
  );
}
