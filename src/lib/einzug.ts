"use client";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/clientApi";

/**
 * Einzug beobachten: fragt den Scanner alle paar Sekunden, ob Papier im Einzug liegt.
 * Sobald Papier **neu** erkannt wird, ruft der Hook `beiPapier` auf (z. B. um den Einzug
 * vorzuwählen). Danach bleibt die Wahl beim Menschen – Flachbett lässt sich jederzeit
 * wieder einstellen, ohne dass der Hook es zurückdreht.
 */
export function useEinzug(geraetId: string, aktiv: boolean, beiPapier?: () => void) {
  const [papier, setPapier] = useState<boolean | null>(null);   // null = unbekannt
  const [problem, setProblem] = useState("");
  const vorher = useRef<boolean | null>(null);
  const rueckruf = useRef(beiPapier);
  rueckruf.current = beiPapier;

  useEffect(() => {
    vorher.current = null;
    setPapier(null); setProblem("");
    if (!geraetId || !aktiv) return;
    let aus = false;
    let timer: ReturnType<typeof setTimeout>;
    const frage = async () => {
      if (aus) return;
      if (document.visibilityState === "visible") {
        try {
          const st = await api(`/api/scanners/${geraetId}/status`);
          if (aus) return;
          const da = !!st.papierImEinzug;
          setPapier(da);
          setProblem(st.problem || "");
          if (da && vorher.current !== true) rueckruf.current?.();
          vorher.current = da;
        } catch {
          if (!aus) { setPapier(null); setProblem(""); }
        }
      }
      timer = setTimeout(frage, 3000);
    };
    frage();
    const sichtbar = () => { if (document.visibilityState === "visible") { clearTimeout(timer); frage(); } };
    document.addEventListener("visibilitychange", sichtbar);
    return () => { aus = true; clearTimeout(timer); document.removeEventListener("visibilitychange", sichtbar); };
  }, [geraetId, aktiv]);

  return { papier, problem };
}
