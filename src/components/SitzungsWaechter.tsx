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
 * 2. **Meldung statt Rauswurf**, wenn eine Anfrage 401 liefert: Ein Fenster erklärt die Lage
 *    und weist darauf hin, dass offene Eingaben lokal gesichert sind und nach der Anmeldung
 *    wieder angeboten werden. Die Seite bleibt stehen, bis der Mensch auf „Anmelden" tippt –
 *    so lässt sich vorher noch etwas herauskopieren.
 */

const VORWARNUNG_MS = 5 * 60 * 1000;

export default function SitzungsWaechter() {
  const [abgelaufen, setAbgelaufen] = useState(false);
  const [restMinuten, setRestMinuten] = useState<number | null>(null);
  const [warnungWeg, setWarnungWeg] = useState(false);
  const pfadRef = useRef<string>("");

  // 401 aus irgendeiner Anfrage → Fenster zeigen, nicht weiterleiten
  useEffect(() => {
    const melden = () => {
      pfadRef.current = window.location.pathname + window.location.search;
      setAbgelaufen(true);
    };
    window.addEventListener("nexus-sitzung-abgelaufen", melden);
    return () => window.removeEventListener("nexus-sitzung-abgelaufen", melden);
  }, []);

  // Vorwarnung anhand der Laufzeit des Tokens
  useEffect(() => {
    const pruefen = () => {
      const ende = tokenLaeuftAb();
      if (!ende) { setRestMinuten(null); return; }
      const rest = ende - Date.now();
      if (rest <= 0) { setAbgelaufen(true); setRestMinuten(0); return; }
      setRestMinuten(rest <= VORWARNUNG_MS ? Math.max(1, Math.round(rest / 60000)) : null);
    };
    pruefen();
    const t = setInterval(pruefen, 30_000);
    return () => clearInterval(t);
  }, []);

  const anmelden = useCallback(() => {
    const ziel = pfadRef.current || window.location.pathname;
    clearSession();
    window.location.href = `/login?weiter=${encodeURIComponent(ziel)}`;
  }, []);

  return (
    <>
      {/* Vorwarnung – dezent am oberen Rand, wegklickbar */}
      {restMinuten !== null && !abgelaufen && !warnungWeg && (
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

      {/* Abgelaufen – erklärendes Fenster statt stillem Rauswurf */}
      {abgelaufen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", display: "grid", placeItems: "center", padding: 16, zIndex: 90 }}>
          <div className="card dm-fenster" style={{ width: 480, maxWidth: "94vw", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10 }}>
              <Icon name="lock" size={18} />
              <h2 style={{ fontSize: 17, fontWeight: 700 }}>Anmeldung abgelaufen</h2>
            </div>
            <div style={{ padding: 20, display: "grid", gap: 10, fontSize: 14, lineHeight: 1.55 }}>
              <p>
                Die Sitzung ist abgelaufen, deshalb wurde die letzte Aktion <b>nicht gespeichert</b>.
              </p>
              <p className="muted" style={{ fontSize: 13.5 }}>
                Offene Eingaben sind <b>lokal gesichert</b> und werden nach der Anmeldung wieder
                angeboten. Dieses Fenster bleibt stehen, bis du weitergehst – falls du vorher noch
                etwas herauskopieren möchtest.
              </p>
            </div>
            <div style={{ padding: "12px 20px", borderTop: "1px solid var(--border)", display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn" onClick={() => setAbgelaufen(false)}>Fenster schließen</button>
              <button className="btn btn-primary" onClick={anmelden}><Icon name="login" /> Anmelden</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
