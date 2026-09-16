"use client";
import { useEffect, useRef } from "react";
import { getToken } from "@/lib/clientApi";

/**
 * Live-Aktualisierung: Änderungen an den Daten erreichen **alle offenen Fenster**.
 *
 * Eine Verbindung je Fenster (`/api/events`, Server-Sent Events) empfängt die Meldung,
 * welche Tabelle sich geändert hat, und verteilt sie als Ereignis im Browser. Seiten
 * hängen sich mit `useLive` daran und laden ihre Liste neu – gebündelt, damit aus einer
 * Folge von Änderungen ein einziges Neuladen wird.
 */

const EREIGNIS = "nexus-live";
let verbunden = false;

/** Verbindung aufbauen (nur einmal je Fenster) und Meldungen weiterreichen. */
export function starteLive() {
  if (verbunden || typeof window === "undefined") return;
  const token = getToken();
  if (!token) return;
  verbunden = true;

  let quelle: EventSource | null = null;
  let versuch = 0;

  const verbinde = () => {
    quelle = new EventSource(`/api/events?token=${encodeURIComponent(token)}`);
    quelle.addEventListener("aenderung", (e) => {
      try {
        const { tabelle } = JSON.parse((e as MessageEvent).data || "{}");
        window.dispatchEvent(new CustomEvent(EREIGNIS, { detail: { tabelle } }));
      } catch { /* unlesbare Meldung überspringen */ }
    });
    quelle.addEventListener("open", () => { versuch = 0; });
    quelle.onerror = () => {
      quelle?.close();
      // Mit wachsendem Abstand erneut versuchen (höchstens alle 30 s)
      versuch = Math.min(versuch + 1, 6);
      setTimeout(verbinde, Math.min(1000 * 2 ** versuch, 30000));
    };
  };
  verbinde();
}

/**
 * Auf Änderungen an bestimmten Tabellen reagieren.
 *
 * @param tabellen z. B. ["Contact", "ContactChannel"] – leer = jede Änderung
 * @param neuLaden wird gebündelt aufgerufen (400 ms Sammelfenster)
 */
export function useLive(tabellen: string[], neuLaden: () => void) {
  const merker = useRef(neuLaden);
  merker.current = neuLaden;
  const liste = tabellen.join(",");

  useEffect(() => {
    starteLive();
    const gewuenscht = liste ? liste.split(",") : [];
    let timer: ReturnType<typeof setTimeout> | null = null;

    const beiAenderung = (e: Event) => {
      const tabelle = (e as CustomEvent).detail?.tabelle || "";
      if (gewuenscht.length && !gewuenscht.includes(tabelle)) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => merker.current(), 400);
    };

    window.addEventListener(EREIGNIS, beiAenderung);
    return () => {
      window.removeEventListener(EREIGNIS, beiAenderung);
      if (timer) clearTimeout(timer);
    };
  }, [liste]);
}
