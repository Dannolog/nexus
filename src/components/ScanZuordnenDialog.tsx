"use client";
import { useEffect, useMemo, useState } from "react";
import Icon from "./Icon";
import SuchSelect from "./SuchSelect";
import { Feld } from "./KontaktFeld";
import { SeitenWahl, usePdfSeiten, vorschauDataUrl } from "./SeitenWahl";
import { seitenText } from "@/lib/pdfAusgabe";
import { api } from "@/lib/clientApi";

/**
 * Scan zuordnen – in die **Mitarbeiterakte** oder die **Betriebsakte** (Mandant oder eigene Akte).
 * Wahlweise nur bestimmte Seiten; bei einer Teilauswahl wird gefragt, was mit dem Rest passiert:
 *  - restliche Seiten im Posteingang behalten (der Scan schrumpft auf den Rest),
 *  - den ganzen Scan im Posteingang behalten (für weitere Aktionen),
 *  - restliche Seiten löschen.
 */

type Rest = "behalten" | "alles" | "loeschen";
type Ziel = "mitarbeiter" | "betriebsakte";

export default function ScanZuordnenDialog({
  scan, ladeBlob, mitarbeiter, gruppen, mandanten, akten,
  onRubrikNeu, onRubrikUmbenennen, onAkteNeu, onFertig, onClose,
}: {
  scan: { id: string; title: string; pages: number };
  ladeBlob: () => Promise<Blob>;
  mitarbeiter: any[];
  gruppen: { id: string; name: string }[];
  mandanten: any[];
  akten: { id: string; name: string; dokumente?: number }[];
  onRubrikNeu: (name: string) => Promise<string | void>;
  onRubrikUmbenennen: (id: string) => void;
  onAkteNeu: (name: string) => Promise<string | void>;
  onFertig: (meldung: string) => void;
  onClose: () => void;
}) {
  const { bytes, anzahl, vorschau, fehler: ladeFehler, original } = usePdfSeiten(ladeBlob);
  const [ziel, setZiel] = useState<Ziel>("mitarbeiter");
  const [employeeId, setEmployeeId] = useState("");
  const [orgId, setOrgId] = useState("");
  const [groupId, setGroupId] = useState("");
  const [titel, setTitel] = useState(scan.title);
  const [auswahl, setAuswahl] = useState<number[]>([]);
  const [seitenFehler, setSeitenFehler] = useState("");
  const [rest, setRest] = useState<Rest>("behalten");
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState("");

  useEffect(() => { if (anzahl) setAuswahl(Array.from({ length: anzahl }, (_, i) => i)); }, [anzahl]);

  useEffect(() => {
    const bei = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) { e.stopPropagation(); onClose(); } };
    window.addEventListener("keydown", bei, true);
    return () => window.removeEventListener("keydown", bei, true);
  }, [onClose, busy]);

  // Nur PDFs lassen sich aufteilen; Bilder und andere Dateien gehen immer ganz
  const teilbar = !!bytes && !original && anzahl > 1;
  const teil = teilbar && auswahl.length > 0 && auswahl.length < anzahl;
  const restSeiten = useMemo(
    () => (teil ? Array.from({ length: anzahl }, (_, i) => i).filter((i) => !auswahl.includes(i)) : []),
    [teil, anzahl, auswahl],
  );

  const ablageOptionen = useMemo(() => [
    ...mandanten.map((m) => ({ value: m.id, label: m.name, hint: ["Mandant", [m.zip, m.city].filter(Boolean).join(" ")].filter(Boolean).join(" · ") })),
    ...akten.map((a) => ({ value: a.id, label: a.name, hint: "eigene Akte" })),
  ], [mandanten, akten]);

  const zielGewaehlt = ziel === "mitarbeiter" ? !!employeeId : !!orgId;
  const bereit = zielGewaehlt && !seitenFehler && !ladeFehler && (original || (anzahl > 0 && auswahl.length > 0)) && !busy;

  async function ablegen() {
    if (!zielGewaehlt) { setFehler(ziel === "mitarbeiter" ? "Bitte einen Mitarbeiter wählen." : "Bitte einen Mandanten oder eine Akte wählen."); return; }
    setBusy(true); setFehler("");
    try {
      let thumb = "";
      if (teil && rest === "behalten" && bytes) {
        try { thumb = await vorschauDataUrl(bytes, restSeiten[0]); } catch { /* Vorschau ist nur Beiwerk */ }
      }
      const d = await api(`/api/scan-inbox/${scan.id}/assign`, {
        method: "POST",
        body: JSON.stringify({
          ziel, employeeId, orgId, groupId, title: titel.trim() || scan.title,
          seiten: teil ? auswahl : undefined,
          rest: teil ? rest : undefined,
          thumb: thumb || undefined,
        }),
      });
      const wohin = ziel === "mitarbeiter" ? `in die Akte von ${d.zielName}` : `in die Betriebsakte „${d.zielName}"`;
      const seiten = d.rest ? `${d.seiten} von ${d.von} Seiten ` : "";
      const danach = d.rest === "behalten"
        ? ` – ${d.restSeiten} Seite${d.restSeiten === 1 ? "" : "n"} bleiben im Posteingang.`
        : d.rest === "alles" ? " – der ganze Scan bleibt im Posteingang."
        : d.rest === "loeschen" ? " – restliche Seiten verworfen." : ".";
      onFertig(`${seiten}${wohin} abgelegt: ${d.dokument.fileName}${danach}`);
    } catch (e: any) { setFehler("Fehler: " + e.message); }
    finally { setBusy(false); }
  }

  const restKarte = (wert: Rest, ueberschrift: string, text: string, icon: string) => (
    <button key={wert} type="button" onClick={() => setRest(wert)}
      style={{
        all: "unset", cursor: "pointer", display: "flex", gap: 10, alignItems: "flex-start", padding: "10px 12px", borderRadius: 10,
        border: `2px solid ${rest === wert ? (wert === "loeschen" ? "var(--danger, #dc2626)" : "var(--accent, #3b82f6)") : "var(--border)"}`,
        background: rest === wert ? (wert === "loeschen" ? "rgba(220,38,38,.07)" : "rgba(59,130,246,.07)") : "transparent",
      }}>
      <span style={{ width: 18, height: 18, borderRadius: "50%", flexShrink: 0, marginTop: 1, display: "grid", placeItems: "center",
                     border: `2px solid ${rest === wert ? "currentColor" : "var(--border)"}` }}>
        {rest === wert && <span style={{ width: 8, height: 8, borderRadius: "50%", background: "currentColor" }} />}
      </span>
      <span style={{ display: "grid", gap: 2 }}>
        <span style={{ fontWeight: 600, fontSize: 14, display: "inline-flex", alignItems: "center", gap: 6 }}>
          <Icon name={icon} size={14} /> {ueberschrift}
        </span>
        <span className="muted" style={{ fontSize: 12.5 }}>{text}</span>
      </span>
    </button>
  );

  const knopfText = busy ? "Legt ab…"
    : teil && rest === "loeschen" ? "Ablegen, Rest löschen"
    : teil ? `${auswahl.length} Seite${auswahl.length === 1 ? "" : "n"} ablegen`
    : "In die Akte legen";

  return (
    <div onClick={() => !busy && onClose()}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", display: "grid", placeItems: "center", padding: 16, zIndex: 60 }}>
      <div onClick={(e) => e.stopPropagation()} className="card dm-fenster"
        style={{ width: 640, maxWidth: "94vw", maxHeight: "92vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10 }}>
          <Icon name="folder" size={18} />
          <h2 style={{ fontSize: 17, fontWeight: 700, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            „{scan.title}" zuordnen
          </h2>
          <button className="btn btn-icon" aria-label="Schließen" disabled={busy} onClick={onClose}><Icon name="x" /></button>
        </div>

        <div style={{ padding: 18, display: "grid", gap: 14, overflowY: "auto", flex: 1, minHeight: 0 }}>
          {/* Ziel: Mitarbeiter- oder Betriebsakte */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            {([["mitarbeiter", "Mitarbeiterakte", "user"], ["betriebsakte", "Betriebsakte", "building"]] as const).map(([wert, text, icon]) => (
              <button key={wert} type="button" className="btn" onClick={() => { setZiel(wert); setFehler(""); }}
                style={{ justifyContent: "center", background: ziel === wert ? "var(--accent)" : undefined, color: ziel === wert ? "#fff" : undefined }}>
                <Icon name={icon} size={15} /> {text}
              </button>
            ))}
          </div>

          {ziel === "mitarbeiter" ? (
            <label style={{ fontSize: 13, display: "grid", gap: 4 }}>
              <span className="muted" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Icon name="user" size={14} /> Mitarbeiter</span>
              <SuchSelect
                value={employeeId}
                onChange={setEmployeeId}
                platzhalter="— Mitarbeiter wählen —"
                suchePlatzhalter="Name oder Personalnummer…"
                options={mitarbeiter.map((m) => ({ value: m.id, label: m.name, hint: m.employeeNumber || m.email || "" }))}
              />
            </label>
          ) : (
            <label style={{ fontSize: 13, display: "grid", gap: 4 }}>
              <span className="muted" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Icon name="building" size={14} /> Mandant oder Akte</span>
              <SuchSelect
                value={orgId}
                onChange={setOrgId}
                platzhalter="— Mandant oder Akte wählen —"
                suchePlatzhalter="Suchen oder neue Akte eintippen…"
                options={ablageOptionen}
                erlaubeNeu
                neuText="als neue Akte anlegen"
                onNeu={onAkteNeu}
              />
            </label>
          )}

          <label style={{ fontSize: 13, display: "grid", gap: 4 }}>
            <span className="muted" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Icon name="tag" size={14} /> Rubrik</span>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <SuchSelect
                  value={groupId}
                  onChange={setGroupId}
                  platzhalter="— ohne Zuordnung —"
                  suchePlatzhalter="Rubrik suchen oder neue eintippen…"
                  options={gruppen.map((g) => ({ value: g.id, label: g.name }))}
                  erlaubeNeu
                  neuText="als neue Rubrik anlegen"
                  onNeu={onRubrikNeu}
                />
              </div>
              {groupId && (
                <button type="button" className="btn btn-icon" title="Rubrik umbenennen" onClick={() => onRubrikUmbenennen(groupId)}>
                  <Icon name="pencil" size={14} />
                </button>
              )}
            </div>
          </label>

          <Feld label="Titel des Dokuments" icon="file-text" wert={titel} setWert={setTitel} platzhalter={scan.title} kopierbar={false} />

          {/* Seiten */}
          {original ? (
            <div className="muted" style={{ fontSize: 13 }}>Diese Datei wird vollständig abgelegt.</div>
          ) : !bytes || !anzahl ? (
            <div className="muted" style={{ fontSize: 13 }}>{ladeFehler || "Seiten werden geladen …"}</div>
          ) : teilbar ? (
            <SeitenWahl anzahl={anzahl} vorschau={vorschau} auswahl={auswahl} onChange={setAuswahl} onFehler={setSeitenFehler} />
          ) : null}

          {/* Was passiert mit den übrigen Seiten? */}
          {teil && (
            <div style={{ display: "grid", gap: 8 }}>
              <span className="muted" style={{ fontSize: 13, display: "inline-flex", alignItems: "center", gap: 6 }}>
                <Icon name="archive" size={14} /> Restliche Seiten ({seitenText(restSeiten)})
              </span>
              {restKarte("behalten", "Rest im Posteingang behalten",
                `Seite${restSeiten.length === 1 ? "" : "n"} ${seitenText(restSeiten)} bleiben als offener Scan liegen – für weitere Zuordnungen.`, "archive")}
              {restKarte("alles", "Ganzen Scan im Posteingang behalten",
                "Alle Seiten bleiben unverändert im Posteingang – z. B. um sie noch anderweitig abzulegen.", "copy")}
              {restKarte("loeschen", "Restliche Seiten löschen",
                "Nur die gewählten Seiten werden abgelegt, der Rest wird verworfen. Der Scan gilt danach als erledigt.", "trash")}
            </div>
          )}

          {!teil && (
            <div className="muted" style={{ fontSize: 12, lineHeight: 1.5 }}>
              Der Scan wird als Dokument in die Akte gelegt und bleibt hier als erledigt vermerkt.
            </div>
          )}

          {fehler && (
            <div style={{ color: "var(--danger, #dc2626)", fontSize: 13, display: "flex", gap: 6, alignItems: "center" }}>
              <Icon name="alert" size={14} /> {fehler}
            </div>
          )}
        </div>

        <div style={{ padding: "12px 18px", borderTop: "1px solid var(--border)", display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button className="btn" disabled={busy} onClick={onClose}><Icon name="x" /> Abbrechen</button>
          <button className={teil && rest === "loeschen" ? "btn btn-danger" : "btn btn-primary"} disabled={!bereit} onClick={ablegen}>
            <Icon name="save" /> {knopfText}
          </button>
        </div>
      </div>
    </div>
  );
}
