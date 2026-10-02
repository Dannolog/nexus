"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { clearSession, tokenLaeuftAb } from "@/lib/clientApi";
import Icon from "@/components/Icon";

/**
 * Wacht über die Anmeldung.
 *
 * Früher sprang die Anwendung bei abgelaufener Sitzung ohne Vorwarnung zur Anmeldung –
 * halb ausgefüllte Formulare waren damit verloren. Jetzt gilt:
 *
 * 1. **Vorwarnung**, bevor das Token abläuft (Standard: 5 Minuten vorher) – mit der
 *    ausdrücklichen Bitte, Angefangenes zu speichern.
 * 2. **Abgelaufen** (Anfrage liefert 401 oder Token-Zeit vorbei): **direkt zur Anmeldung** –
 *    ohne Zwischenfenster (Wunsch Daniel). Die aktuelle Seite wird als `?weiter=` mitgegeben,
 *    nach der Anmeldung geht es dorthin zurück; offene Eingaben sind lokal gesichert
 *    (`src/lib/entwurf.ts`) und werden dann wieder angeboten.
 */

const VORWARNUNG_MS = 5 * 60 * 1000;

export default function SitzungsWaechter() {
  const [restMinuten, setRestMinuten] = useState<number | null>(null);
  const [warnungWeg, setWarnungWeg] = useState(false);
  const unterwegs = useRef(false);

  const anmelden = useCallback(() => {
    if (unterwegs.current) return;   // mehrere 401 gleichzeitig → nur einmal weiterleiten
    unterwegs.current = true;
    const ziel = window.location.pathname + window.location.search;
    clearSession();
    window.location.href = `/login?weiter=${encodeURIComponent(ziel)}`;
  }, []);

  // 401 aus irgendeiner Anfrage → sofort zur Anmeldung
  useEffect(() => {
    window.addEventListener("nexus-sitzung-abgelaufen", anmelden);
    return () => window.removeEventListener("nexus-sitzung-abgelaufen", anmelden);
  }, [anmelden]);

  // Vorwarnung anhand der Laufzeit des Tokens
  useEffect(() => {
    const pruefen = () => {
      const ende = tokenLaeuftAb();
      if (!ende) { setRestMinuten(null); return; }
      const rest = ende - Date.now();
      if (rest <= 0) { anmelden(); return; }
      setRestMinuten(rest <= VORWARNUNG_MS ? Math.max(1, Math.round(rest / 60000)) : null);
    };
    pruefen();
    const t = setInterval(pruefen, 30_000);
    return () => clearInterval(t);
  }, [anmelden]);

  return (
    <>
      {/* Vorwarnung – dezent am oberen Rand, wegklickbar */}
      {restMinuten !== null && !warnungWeg && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, zIndex: 80,
          background: "var(--warn, #c47f17)", color: "#fff",
          padding: "8px 14px", display: "flex", alignItems: "center", gap: 10, fontSize: 13.5,
        }}>
          <Icon name="alert" size={16} />
          <span style={{ flex: 1 }}>
            Die Anmeldung läuft in {restMinuten} Minute{restMinuten === 1 ? "" : "n"} ab –
            bitte Angefangenes jetzt speichern.
          </span>
          <button className="btn" style={{ background: "rgba(255,255,255,.2)", color: "#fff", borderColor: "transparent" }}
            onClick={anmelden}>
            Jetzt neu anmelden
          </button>
          <button className="btn btn-icon" aria-label="Hinweis schließen"
            style={{ background: "transparent", color: "#fff", borderColor: "transparent" }}
            onClick={() => setWarnungWeg(true)}>
            <Icon name="x" size={16} />
          </button>
        </div>
      )}

    </>
  );
}
