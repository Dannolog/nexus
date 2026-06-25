import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Nexus — Stammdaten",
  description: "Zentrale Stammdaten-Verwaltung (Kunden, Projekte, Mitarbeiter, User)",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
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
