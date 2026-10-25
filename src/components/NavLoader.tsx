"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

/**
 * Lade-Animation beim Seitenwechsel (Register: web.nav-loader, Vorlage clocker `NavLoader`).
 *
 * Ablauf: Klick auf einen internen Link → nach 150 ms erscheint der Nexus-Knoten
 * (Mittelpunkt mit kreisenden Verbindungen) samt Laufbalken oben. Er bleibt stehen,
 * bis die neue Seite da ist UND ihre Daten (/api-GETs) geladen sind – erst dann
 * blendet er weich aus. Schnelle Wechsel blitzen nicht auf.
 *
 * Hintergrund-Abfragen (Versionsprüfung, Live-Ereignisse, Anmeldung) zählen nicht.
 */

const HINTERGRUND = /^\/api\/(version|events|auth)(\/|\?|$)/;
let offeneAbrufe = 0;
const hoerer = new Set<(n: number) => void>();
const melde = () => hoerer.forEach((f) => f(offeneAbrufe));

if (typeof window !== "undefined" && !(window as any).__nexusFetch) {
  (window as any).__nexusFetch = true;
  const original = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    let zaehlt = false;
    try {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, location.href);
      const methode = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
      zaehlt = url.origin === location.origin && url.pathname.startsWith("/api/") && methode === "GET" && !HINTERGRUND.test(url.pathname);
    } catch { /* ungewöhnliche Eingabe → nicht zählen */ }
    if (!zaehlt) return original(input, init);
    offeneAbrufe++; melde();
    return original(input, init).finally(() => { offeneAbrufe = Math.max(0, offeneAbrufe - 1); melde(); });
  };
}

type Phase = "aus" | "wechsel" | "daten" | "weg";

export default function NavLoader() {
  const pathname = usePathname();
  const [phase, setPhase] = useState<Phase>("aus");
  const [sichtbar, setSichtbar] = useState(false);
  const [titel, setTitel] = useState("");
  const zeigeT = useRef<ReturnType<typeof setTimeout> | null>(null);
  const endeT = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notT = useRef<ReturnType<typeof setTimeout> | null>(null);
  const phaseRef = useRef<Phase>("aus");
  phaseRef.current = phase;
  const ersterPfad = useRef(true);

  function ausblenden() {
    [zeigeT, endeT, notT].forEach((r) => { if (r.current) clearTimeout(r.current); r.current = null; });
    setPhase((p) => (p === "aus" ? p : "weg"));
    endeT.current = setTimeout(() => { setPhase("aus"); setSichtbar(false); }, 260);
  }

  // Klicks auf interne Links beobachten (nicht verhindern)
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement | null)?.closest?.("a");
      if (!a || !a.href || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || url.pathname === location.pathname) return;
      if (url.pathname.startsWith("/api/")) return;
      [zeigeT, endeT, notT].forEach((r) => { if (r.current) clearTimeout(r.current); });
      setTitel((a.getAttribute("aria-label") || a.textContent || "").trim().slice(0, 40));
      setPhase("wechsel");
      zeigeT.current = setTimeout(() => setSichtbar(true), 150);
      // Sicherheitsnetz: nie länger als 20 s stehen bleiben
      notT.current = setTimeout(ausblenden, 20000);
    }
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  // Neue Seite ist da → jetzt auf ihre Daten warten
  useEffect(() => {
    if (ersterPfad.current) { ersterPfad.current = false; return; }
    if (phaseRef.current !== "wechsel") return;
    setPhase("daten");
  }, [pathname]);

  // Daten-Phase: ausblenden, sobald 200 ms lang nichts mehr lädt
  useEffect(() => {
    if (phase !== "daten") return;
    let ruhig: ReturnType<typeof setTimeout> | null = null;
    const pruefe = (n: number) => {
      if (ruhig) { clearTimeout(ruhig); ruhig = null; }
      if (n === 0) ruhig = setTimeout(ausblenden, 200);
    };
    hoerer.add(pruefe);
    pruefe(offeneAbrufe);
    return () => { hoerer.delete(pruefe); if (ruhig) clearTimeout(ruhig); };
  }, [phase]);

  if (phase === "aus" || !sichtbar) return null;

  return (
    <div className={`nl-schicht ${phase === "weg" ? "nl-weg" : ""}`} role="status" aria-live="polite">
      <div className="nl-balken" />
      <div className="nl-mitte">
        <svg className="nl-knoten" width="120" height="120" viewBox="0 0 120 120" aria-hidden="true">
          <defs>
            <linearGradient id="nl-g" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#3b82f6" /><stop offset="1" stopColor="#6366f1" />
            </linearGradient>
          </defs>
          <circle className="nl-ring nl-ring-a" cx="60" cy="60" r="50" />
          <circle className="nl-ring nl-ring-b" cx="60" cy="60" r="36" />
          <g className="nl-bahn nl-bahn-a">
            <line x1="60" y1="60" x2="60" y2="10" className="nl-linie" />
            <circle cx="60" cy="10" r="5" fill="url(#nl-g)" />
          </g>
          <g className="nl-bahn nl-bahn-b">
            <line x1="60" y1="60" x2="96" y2="60" className="nl-linie" />
            <circle cx="96" cy="60" r="4" fill="url(#nl-g)" />
          </g>
          <g className="nl-bahn nl-bahn-c">
            <line x1="60" y1="60" x2="25" y2="95" className="nl-linie" />
            <circle cx="25" cy="95" r="4.5" fill="url(#nl-g)" />
          </g>
          <circle className="nl-puls" cx="60" cy="60" r="16" fill="url(#nl-g)" />
          <circle cx="60" cy="60" r="14" fill="url(#nl-g)" />
          <circle cx="60" cy="60" r="5" fill="#fff" />
        </svg>
        <div className="nl-text">
          {titel ? <><span>Lade</span> <b>{titel}</b></> : <span>Wird geladen</span>}
          <span className="nl-punkte"><i /><i /><i /></span>
        </div>
      </div>
    </div>
  );
}
