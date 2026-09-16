"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, getToken } from "@/lib/clientApi";
import Icon from "@/components/Icon";
import SearchInput from "@/components/SearchInput";
import Hervorheben, { sucheBegriffe } from "@/components/Hervorheben";
import ConfirmDialog from "@/components/ConfirmDialog";
import SuchSelect from "@/components/SuchSelect";
import PdfViewerModal from "@/components/PdfViewerModal";
import { Feld } from "@/components/KontaktFeld";
import Toggle from "@/components/Toggle";
import ScanAnimation from "@/components/ScanAnimation";
import { useLive } from "@/lib/live";

/**
 * Scannen und Posteingang.
 *
 * Ein Scan landet zuerst im Posteingang – er muss **nicht** sofort zugeordnet werden.
 * Die Liste ist nach **Tagen** gegliedert (Tagesverlauf), Namen lassen sich direkt ändern,
 * und gleiche Namen bzw. inhaltsgleiche Scans werden ausdrücklich gemeldet.
 * Zugeordnet wandert der Scan als Dokument in die Akte des Mitarbeiters (optional in eine Rubrik).
 */

type Scan = {
  id: string; title: string; fileName: string; mimeType: string; size: number; pages: number;
  sha256: string; scannerName: string; scannedAt: string; status: string;
  employeeId: string; groupId: string; documentId: string; note: string;
  warnungen: { name: boolean; inhalt: boolean; bereitsAbgelegt: boolean };
};

type Geraet = { id: string; name: string; host: string; model: string };

function groesse(b: number) {
  if (!b) return "";
  return b < 1024 * 1024 ? `${Math.round(b / 1024)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`;
}

const uhrzeit = (v: string) => new Date(v).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });

/** Tagesüberschrift: „Heute", „Gestern" oder das Datum mit Wochentag. */
function tagLabel(iso: string) {
  const d = new Date(iso);
  const heute = new Date();
  const gestern = new Date(Date.now() - 86400000);
  const gleich = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (gleich(d, heute)) return "Heute";
  if (gleich(d, gestern)) return "Gestern";
  return d.toLocaleDateString("de-DE", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" });
}

const tagKey = (iso: string) => new Date(iso).toDateString();

async function ladeDatei(pfad: string): Promise<{ blob: Blob; name: string }> {
  const token = getToken();
  const res = await fetch(pfad, { headers: token ? { Authorization: `Bearer ${token}` } : {}, cache: "no-store" });
  if (!res.ok) throw new Error(`Datei konnte nicht geladen werden (HTTP ${res.status})`);
  return { blob: await res.blob(), name: decodeURIComponent(res.headers.get("X-Dateiname") || "scan.pdf") };
}

function speichereBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function dateiZuBase64(f: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(new Error("Datei konnte nicht gelesen werden"));
    r.readAsDataURL(f);
  });
}

export default function ScanPage() {
  const [geraete, setGeraete] = useState<Geraet[]>([]);
  const [geraetId, setGeraetId] = useState("");
  const [faehig, setFaehig] = useState<{ model: string; sources: string[]; resolutions: number[]; duplex: boolean } | null>(null);
  const [quelle, setQuelle] = useState<"Platen" | "Feeder">("Platen");
  const [farbe, setFarbe] = useState<"RGB24" | "Grayscale8">("RGB24");
  const [aufloesung, setAufloesung] = useState(200);
  const [duplex, setDuplex] = useState(false);

  const [scans, setScans] = useState<Scan[]>([]);
  const [suche, setSuche] = useState("");
  const [nurOffen, setNurOffen] = useState(true);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState("");
  // Scanner-Verwaltung und Einstellungen liegen in Pop-ups – die Seite zeigt nur das Gerät.
  const [neuerScanner, setNeuerScanner] = useState("");
  const [neuerName, setNeuerName] = useState("");
  const [scannerOffen, setScannerOffen] = useState(false);
  const [bearbeite, setBearbeite] = useState<{ id: string; name: string; host: string; note: string } | null>(null);
  const [scannerLoeschen, setScannerLoeschen] = useState<Geraet | null>(null);
  const [umbenennen, setUmbenennen] = useState<{ id: string; titel: string } | null>(null);
  const [zuordnen, setZuordnen] = useState<{ scan: Scan; employeeId: string; groupId: string } | null>(null);
  const [loeschen, setLoeschen] = useState<Scan | null>(null);
  const [viewer, setViewer] = useState<{ url: string; titel: string } | null>(null);
  const [mitarbeiter, setMitarbeiter] = useState<any[]>([]);
  const [gruppen, setGruppen] = useState<any[]>([]);

  const ladeScans = useCallback(async () => {
    try {
      const d = await api("/api/scan-inbox");
      setScans(d.data || []);
    } catch (e: any) { setMsg("Posteingang: " + e.message); }
  }, []);

  const ladeGeraete = useCallback(async () => {
    try {
      const d = await api("/api/scanners");
      setGeraete(d.data || []);
      if (!geraetId && d.data?.length) setGeraetId(d.data[0].id);
    } catch (e: any) { setMsg("Scanner: " + e.message); }
  }, [geraetId]);

  useEffect(() => { ladeGeraete(); ladeScans(); }, [ladeGeraete, ladeScans]);

  // Neue Scans und Zuordnungen erscheinen in jedem offenen Fenster
  useLive(["ScanDocument", "EmployeeDocument"], ladeScans);
  useLive(["Scanner"], ladeGeraete);
  useLive(["DocumentGroup"], () => { api("/api/doc-groups").then((d) => setGruppen(d.data || [])).catch(() => {}); });
  useEffect(() => {
    api("/api/employees").then((d) => setMitarbeiter(d.data || [])).catch(() => {});
    api("/api/doc-groups").then((d) => setGruppen(d.data || [])).catch(() => {});
  }, []);

  // Fähigkeiten des gewählten Geräts holen (Quellen, Auflösungen, Duplex)
  useEffect(() => {
    if (!geraetId) { setFaehig(null); return; }
    api(`/api/scanners/${geraetId}/capabilities`)
      .then((f) => {
        setFaehig(f);
        if (f.sources?.length && !f.sources.includes(quelle)) setQuelle(f.sources[0]);
        if (f.resolutions?.length && !f.resolutions.includes(aufloesung)) {
          setAufloesung(f.resolutions.includes(200) ? 200 : f.resolutions[0]);
        }
      })
      .catch((e) => { setFaehig(null); setMsg(e.message); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geraetId]);

  async function scannerHinzufuegen() {
    const host = neuerScanner.trim();
    if (!host) return;
    setBusy("scanner");
    try {
      const s = await api("/api/scanners", { method: "POST", body: JSON.stringify({ host, name: neuerName.trim() }) });
      setMsg(`Scanner „${s.name}" eingerichtet.`);
      setNeuerScanner("");
      setNeuerName("");
      setGeraetId(s.id);
      ladeGeraete();
    } catch (e: any) { setMsg("Fehler: " + e.message); }
    finally { setBusy(""); }
  }

  /** Namen, Adresse oder Notiz eines Scanners ändern. */
  async function scannerSpeichern() {
    if (!bearbeite) return;
    try {
      await api(`/api/scanners/${bearbeite.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: bearbeite.name, host: bearbeite.host, note: bearbeite.note }),
      });
      setMsg(`Scanner „${bearbeite.name}" gespeichert.`);
      setBearbeite(null);
      ladeGeraete();
    } catch (e: any) { setMsg("Fehler: " + e.message); }
  }

  async function scannerEntfernen() {
    if (!scannerLoeschen) return;
    try {
      await api(`/api/scanners/${scannerLoeschen.id}`, { method: "DELETE" });
      setMsg(`Scanner „${scannerLoeschen.name}" entfernt – gescannte Dokumente bleiben erhalten.`);
      if (geraetId === scannerLoeschen.id) setGeraetId("");
      ladeGeraete();
    } catch (e: any) { setMsg("Fehler: " + e.message); }
    finally { setScannerLoeschen(null); }
  }

  async function scannen() {
    if (!geraetId) { setMsg("Bitte zuerst einen Scanner einrichten."); return; }
    setBusy("scan");
    setMsg("Scannt… – bei Einzug werden alle eingelegten Seiten geholt.");
    try {
      const d = await api(`/api/scanners/${geraetId}/scan`, {
        method: "POST",
        body: JSON.stringify({ source: quelle, colorMode: farbe, resolution: aufloesung, duplex }),
      });
      setMsg(`Gescannt: „${d.title}" (${d.pages} Seite${d.pages === 1 ? "" : "n"}) – liegt im Posteingang.`);
      ladeScans();
    } catch (e: any) { setMsg("Fehler: " + e.message); }
    finally { setBusy(""); }
  }

  async function hochladen(f: File) {
    setBusy("upload");
    try {
      const base64 = await dateiZuBase64(f);
      await api("/api/scan-inbox", {
        method: "POST",
        body: JSON.stringify({ base64, fileName: f.name, title: f.name.replace(/\.[^.]+$/, ""), scannerName: "Upload" }),
      });
      setMsg(`„${f.name}" liegt im Posteingang.`);
      ladeScans();
    } catch (e: any) { setMsg("Fehler: " + e.message); }
    finally { setBusy(""); }
  }

  async function nameSpeichern() {
    if (!umbenennen) return;
    try {
      await api(`/api/scan-inbox/${umbenennen.id}`, { method: "PATCH", body: JSON.stringify({ title: umbenennen.titel }) });
      setUmbenennen(null);
      ladeScans();
    } catch (e: any) { setMsg("Fehler: " + e.message); }
  }

  async function oeffnen(s: Scan, speichern: boolean) {
    setBusy("open" + s.id);
    try {
      const { blob, name } = await ladeDatei(`/api/scan-inbox/${s.id}/file`);
      if (speichern) speichereBlob(blob, name);
      else setViewer({ url: URL.createObjectURL(blob), titel: `${s.title} · ${s.pages} Seite${s.pages === 1 ? "" : "n"}` });
    } catch (e: any) { setMsg("Fehler: " + e.message); }
    finally { setBusy(""); }
  }

  /** Neue Rubrik anlegen – direkt aus der Auswahl heraus, danach überall nutzbar. */
  async function rubrikAnlegen(name: string) {
    try {
      const g = await api("/api/doc-groups", { method: "POST", body: JSON.stringify({ name }) });
      const d = await api("/api/doc-groups");
      setGruppen(d.data || []);
      setMsg(`Rubrik „${g.name}" angelegt.`);
      return g.id as string;
    } catch (e: any) { setMsg("Fehler: " + e.message); }
  }

  /** Bestehende Rubrik umbenennen (wirkt überall, wo sie verwendet wird). */
  async function rubrikUmbenennen(id: string) {
    const alt = gruppen.find((g: any) => g.id === id);
    const name = window.prompt("Rubrik umbenennen:", alt?.name || "")?.trim();
    if (!name || name === alt?.name) return;
    try {
      await api(`/api/doc-groups/${id}`, { method: "PATCH", body: JSON.stringify({ name }) });
      const d = await api("/api/doc-groups");
      setGruppen(d.data || []);
      setMsg(`Rubrik heißt jetzt „${name}".`);
    } catch (e: any) { setMsg("Fehler: " + e.message); }
  }

  async function zuordnenSpeichern() {
    if (!zuordnen?.employeeId) { setMsg("Bitte einen Mitarbeiter wählen."); return; }
    setBusy("zuordnen");
    try {
      const d = await api(`/api/scan-inbox/${zuordnen.scan.id}/assign`, {
        method: "POST",
        body: JSON.stringify({ employeeId: zuordnen.employeeId, groupId: zuordnen.groupId }),
      });
      const name = mitarbeiter.find((m) => m.id === zuordnen.employeeId)?.name || "";
      setMsg(`In die Akte von ${name} abgelegt: ${d.dokument.fileName}`);
      setZuordnen(null);
      ladeScans();
    } catch (e: any) { setMsg("Fehler: " + e.message); }
    finally { setBusy(""); }
  }

  async function verwerfen() {
    if (!loeschen) return;
    try {
      await api(`/api/scan-inbox/${loeschen.id}`, { method: "DELETE" });
      setMsg("Scan verworfen.");
      ladeScans();
    } catch (e: any) { setMsg("Fehler: " + e.message); }
    finally { setLoeschen(null); }
  }

  // Suche + Filter, danach nach Tagen gruppieren
  const gefiltert = useMemo(() => {
    const teile = sucheBegriffe(suche).map((t) => t.toLowerCase());
    return scans.filter((s) => {
      if (nurOffen && s.status !== "offen") return false;
      if (teile.length === 0) return true;
      const text = [s.title, s.fileName, s.scannerName, s.note].join(" ").toLowerCase();
      return teile.every((t) => text.includes(t));
    });
  }, [scans, suche, nurOffen]);

  const tage = useMemo(() => {
    const map = new Map<string, Scan[]>();
    for (const s of gefiltert) {
      const k = tagKey(s.scannedAt);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(s);
    }
    return [...map.entries()];
  }, [gefiltert]);

  const offeneAnzahl = scans.filter((s) => s.status === "offen").length;
  // Auflösungsstufen des Geräts – Grundlage für den Schieberegler
  const stufen = faehig?.resolutions?.length ? faehig.resolutions : [150, 200, 300, 600];

  return (
    <div>
      <div className="rv-sticky-header" style={{ display: "grid", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, display: "flex", alignItems: "center", gap: 10 }}>
            <Icon name="printer" size={24} /> Scannen
          </h1>
          <button className="btn btn-primary" disabled={!geraetId || busy === "scan"} onClick={scannen}>
            <Icon name="printer" /> {busy === "scan" ? <span>Scannt<span className="scan-punkte" /></span> : "Scannen"}
          </button>
          <label className="btn" style={{ cursor: "pointer" }} title="Vorhandene Datei in den Posteingang legen">
            <Icon name="plus" /> <span className="btn-label">Datei</span>
            <input type="file" style={{ display: "none" }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) hochladen(f); e.target.value = ""; }} />
          </label>
          <span className="muted" style={{ fontSize: 12, marginLeft: "auto" }}>
            {offeneAnzahl} offen · {scans.length} gesamt
          </span>
        </div>
        <SearchInput value={suche} onChange={setSuche} placeholder="Name, Scanner, Notiz…" style={{ width: "100%", maxWidth: 380 }} />
      </div>

      {msg && <div className="card" style={{ padding: "8px 12px", marginBottom: 12, fontSize: 14 }}>{msg}</div>}

      {/* ── Gerät und Einstellungen: alles auf einen Blick, mit Schaltern statt Listen ── */}
      <div className="card" style={{ padding: 14, marginBottom: 12, display: "grid", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 260px", minWidth: 0 }}>
            <label style={{ fontSize: 13, display: "grid", gap: 4 }}>
              <span className="muted" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <Icon name="printer" size={14} /> Scanner
              </span>
              <SuchSelect
                value={geraetId}
                onChange={setGeraetId}
                platzhalter="— kein Scanner eingerichtet —"
                suchePlatzhalter="Scanner suchen…"
                options={geraete.map((g) => ({ value: g.id, label: g.name, hint: g.host }))}
              />
            </label>
          </div>
          <button className="btn" onClick={() => setScannerOffen(true)} title="Scanner hinzufügen oder ändern">
            <Icon name="command" /> <span className="btn-label">Scanner verwalten</span>
          </button>
        </div>

        <div style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "center" }}>
          {/* Vorlage: Flachbett oder Einzug – ein Schalter statt zweier Listeneinträge */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5 }}>
            <span className="muted" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Icon name="file-text" size={14} /> Flachbett
            </span>
            <Toggle
              checked={quelle === "Feeder"}
              disabled={!faehig?.sources?.includes("Feeder")}
              onChange={(an) => setQuelle(an ? "Feeder" : "Platen")}
              label={<span style={{ fontSize: 13.5 }}>Einzug</span>}
            />
          </div>

          {/* Farbe oder Graustufen */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5 }}>
            <span className="muted" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Icon name="image" size={14} /> Graustufen
            </span>
            <Toggle
              checked={farbe === "RGB24"}
              onChange={(an) => setFarbe(an ? "RGB24" : "Grayscale8")}
              label={<span style={{ fontSize: 13.5 }}>Farbe</span>}
            />
          </div>

          {quelle === "Feeder" && faehig?.duplex && (
            <Toggle checked={duplex} onChange={setDuplex}
              label={<span style={{ fontSize: 13.5 }}>Vorder- und Rückseite</span>} />
          )}
        </div>

        {/* Auflösung als Schieberegler über die Stufen, die das Gerät kann */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span className="muted" style={{ fontSize: 13, display: "inline-flex", alignItems: "center", gap: 6, minWidth: 96 }}>
            <Icon name="maximize" size={14} /> Auflösung
          </span>
          <input
            type="range"
            min={0}
            max={Math.max(0, stufen.length - 1)}
            step={1}
            value={Math.max(0, stufen.indexOf(aufloesung))}
            onChange={(e) => setAufloesung(stufen[Number(e.target.value)] ?? stufen[0])}
            style={{ flex: "1 1 220px", maxWidth: 360, accentColor: "var(--accent)" }}
          />
          <span style={{ fontSize: 13.5, fontVariantNumeric: "tabular-nums", minWidth: 70 }}>{aufloesung} dpi</span>
          <span className="muted" style={{ fontSize: 12 }}>
            {aufloesung <= 150 ? "schnell" : aufloesung >= 300 ? "fein, größere Datei" : "guter Mittelweg"}
          </span>
        </div>

        {busy === "scan" ? (
          <div style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
            <ScanAnimation
              text={quelle === "Feeder" ? "Zieht die Seiten ein" : "Scannt die Vorlage"}
              untertext="Läuft im Hintergrund – du kannst hier weiterarbeiten. Das Ergebnis erscheint gleich im Posteingang."
            />
          </div>
        ) : (
          <div className="muted" style={{ fontSize: 12.5 }}>
            {faehig ? `${faehig.model} bereit` : geraetId ? "Scanner antwortet nicht" : "Noch kein Scanner eingerichtet"}
          </div>
        )}
      </div>

      {/* ── Pop-up: Scanner verwalten (anlegen, ändern, entfernen) ── */}
      {scannerOffen && (
        <div onClick={() => setScannerOffen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", display: "grid", placeItems: "center", padding: 16, zIndex: 60 }}>
          <div onClick={(e) => e.stopPropagation()} className="card dm-fenster"
            style={{ width: 560, maxWidth: "94vw", maxHeight: "90vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10 }}>
              <Icon name="printer" size={18} />
              <h2 style={{ fontSize: 17, fontWeight: 700, flex: 1 }}>Scanner verwalten</h2>
              <button className="btn btn-icon" aria-label="Schließen" onClick={() => setScannerOffen(false)}>
                <Icon name="x" />
              </button>
            </div>

            <div style={{ padding: 20, overflowY: "auto", display: "grid", gap: 12 }}>
              {geraete.length === 0 && (
                <div className="muted" style={{ fontSize: 13 }}>Noch kein Scanner eingerichtet.</div>
              )}
              {geraete.map((g) => (
                <div key={g.id} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 10, display: "grid", gap: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <Icon name="printer" size={15} />
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{g.name}</span>
                    <span className="muted" style={{ fontSize: 12.5 }}>{g.host}</span>
                    {g.model && <span className="muted" style={{ fontSize: 12 }}>· {g.model}</span>}
                    <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                      <button className="btn btn-icon" title="Bearbeiten"
                        onClick={() => setBearbeite({ id: g.id, name: g.name, host: g.host, note: (g as any).note || "" })}>
                        <Icon name="pencil" size={14} />
                      </button>
                      <button className="btn btn-icon btn-danger" title="Entfernen" onClick={() => setScannerLoeschen(g)}>
                        <Icon name="trash" size={14} />
                      </button>
                    </div>
                  </div>

                  {bearbeite?.id === g.id && (
                    <div style={{ display: "grid", gap: 8, borderTop: "1px solid var(--border)", paddingTop: 8 }}>
                      <div className="feld-zeile feld-zeile-2">
                        <Feld label="Name" icon="tag" wert={bearbeite.name}
                          setWert={(v) => setBearbeite({ ...bearbeite, name: v })} />
                        <Feld label="IP-Adresse" icon="command" wert={bearbeite.host}
                          setWert={(v) => setBearbeite({ ...bearbeite, host: v })} />
                      </div>
                      <Feld label="Notiz" icon="file-text" wert={bearbeite.note} kopierbar={false}
                        setWert={(v) => setBearbeite({ ...bearbeite, note: v })} />
                      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                        <button className="btn" onClick={() => setBearbeite(null)}>Abbrechen</button>
                        <button className="btn btn-primary" onClick={scannerSpeichern}>
                          <Icon name="save" /> Speichern
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14, display: "grid", gap: 8 }}>
                <div className="muted" style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: ".04em" }}>
                  Neuen Scanner einrichten
                </div>
                <div className="feld-zeile feld-zeile-2">
                  <Feld label="IP-Adresse" icon="command" wert={neuerScanner} autoFocus
                    platzhalter="z. B. 192.168.1.50" setWert={setNeuerScanner} />
                  <Feld label="Name (frei)" icon="tag" wert={neuerName} kopierbar={false}
                    platzhalter="z. B. Büro oben" setWert={setNeuerName} />
                </div>
                <button className="btn btn-primary" style={{ justifySelf: "start" }}
                  disabled={!neuerScanner.trim() || busy === "scanner"} onClick={scannerHinzufuegen}>
                  <Icon name="check" /> {busy === "scanner" ? "Prüft…" : "Prüfen und speichern"}
                </button>
                <span className="muted" style={{ fontSize: 12 }}>
                  Das Gerät wird sofort angesprochen – antwortet es nicht, wird es nicht gespeichert.
                  Ohne eigenen Namen trägt es die Modellbezeichnung.
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Posteingang, nach Tagen ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
        <div className="muted" style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: ".04em" }}>
          Posteingang – Verlauf
        </div>
        <button className="btn" onClick={() => setNurOffen((v) => !v)}
          style={{ background: nurOffen ? "var(--accent)" : undefined, color: nurOffen ? "#fff" : undefined }}>
          {nurOffen ? "nur offene" : "alle anzeigen"}
        </button>
      </div>

      {tage.length === 0 && (
        <div className="card muted" style={{ padding: 16, fontSize: 14 }}>
          Noch nichts gescannt – oben auf „Scannen" tippen. Scans dürfen hier liegen bleiben und
          später zugeordnet werden.
        </div>
      )}

      <div style={{ display: "grid", gap: 14 }}>
        {tage.map(([tag, liste]) => (
          <div key={tag} className="card" style={{ padding: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
              <Icon name="calendar" size={16} />
              <span style={{ fontWeight: 600, fontSize: 14 }}>{tagLabel(liste[0].scannedAt)}</span>
              <span className="muted" style={{ fontSize: 12 }}>
                {liste.length} Dokument{liste.length === 1 ? "" : "e"} ·
                {" "}{liste.reduce((n, s) => n + (s.pages || 1), 0)} Seiten
              </span>
            </div>

            <div style={{ display: "grid", gap: 8 }}>
              {liste.map((s) => (
                <div key={s.id} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 10, display: "grid", gap: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <Icon name="file-text" size={15} />
                    {umbenennen?.id === s.id ? (
                      <input className="input" autoFocus style={{ flex: "1 1 220px", minWidth: 0 }}
                        value={umbenennen.titel}
                        onChange={(e) => setUmbenennen({ ...umbenennen, titel: e.target.value })}
                        onKeyDown={(e) => { if (e.key === "Enter") nameSpeichern(); if (e.key === "Escape") setUmbenennen(null); }} />
                    ) : (
                      <span style={{ fontWeight: 600, fontSize: 14 }}>
                        <Hervorheben text={s.title} suche={suche} />
                      </span>
                    )}
                    {umbenennen?.id === s.id ? (
                      <button className="btn btn-icon" title="Namen speichern" onClick={nameSpeichern}><Icon name="check" /></button>
                    ) : (
                      <button className="btn btn-icon" title="Namen ändern" onClick={() => setUmbenennen({ id: s.id, titel: s.title })}>
                        <Icon name="pencil" size={14} />
                      </button>
                    )}
                    <span className="muted" style={{ fontSize: 12, marginLeft: "auto" }}>
                      {uhrzeit(s.scannedAt)} · {s.pages} S. · {groesse(s.size)}{s.scannerName ? ` · ${s.scannerName}` : ""}
                    </span>
                  </div>

                  {/* Warnungen: gleiche Namen oder gleicher Inhalt */}
                  {(s.warnungen.name || s.warnungen.inhalt || s.warnungen.bereitsAbgelegt) && (
                    <div style={{ display: "grid", gap: 3 }}>
                      {s.warnungen.inhalt && (
                        <span style={{ color: "var(--warn, #c47f17)", fontSize: 12.5, display: "flex", alignItems: "center", gap: 6 }}>
                          <Icon name="alert" size={13} /> Inhaltsgleicher Scan liegt bereits im Posteingang – doppelt gescannt?
                        </span>
                      )}
                      {s.warnungen.bereitsAbgelegt && (
                        <span style={{ color: "var(--warn, #c47f17)", fontSize: 12.5, display: "flex", alignItems: "center", gap: 6 }}>
                          <Icon name="alert" size={13} /> Dieses Dokument liegt inhaltsgleich bereits in einer Mitarbeiterakte.
                        </span>
                      )}
                      {s.warnungen.name && (
                        <span style={{ color: "var(--warn, #c47f17)", fontSize: 12.5, display: "flex", alignItems: "center", gap: 6 }}>
                          <Icon name="alert" size={13} /> Gleicher Name wie ein anderer Scan – zur Unterscheidung umbenennen.
                        </span>
                      )}
                    </div>
                  )}

                  {s.status === "zugeordnet" && (
                    <div className="muted" style={{ fontSize: 12.5, display: "flex", alignItems: "center", gap: 6 }}>
                      <Icon name="check" size={13} />
                      zugeordnet: {mitarbeiter.find((m) => m.id === s.employeeId)?.name || "Mitarbeiter"}
                      {s.groupId ? ` · ${gruppen.find((g) => g.id === s.groupId)?.name || "Rubrik"}` : ""}
                    </div>
                  )}

                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <button className="btn" disabled={busy === "open" + s.id} onClick={() => oeffnen(s, false)}>
                      <Icon name="eye" /> Öffnen
                    </button>
                    <button className="btn" disabled={busy === "open" + s.id} onClick={() => oeffnen(s, true)}>
                      <Icon name="save" /> Speichern
                    </button>
                    {s.status === "offen" && (
                      <button className="btn btn-primary" onClick={() => setZuordnen({ scan: s, employeeId: "", groupId: "" })}>
                        <Icon name="user" /> Mitarbeiter zuordnen
                      </button>
                    )}
                    <button className="btn btn-icon btn-danger" title="Verwerfen" onClick={() => setLoeschen(s)}>
                      <Icon name="trash" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* ── Zuordnen ── */}
      {zuordnen && (
        <div onClick={() => setZuordnen(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", display: "grid", placeItems: "center", padding: 16, zIndex: 60 }}>
          <div onClick={(e) => e.stopPropagation()} className="card dm-fenster"
            style={{ width: 520, maxWidth: "94vw", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10 }}>
              <h2 style={{ fontSize: 17, fontWeight: 700, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                „{zuordnen.scan.title}" zuordnen
              </h2>
              <button className="btn btn-icon" aria-label="Schließen" onClick={() => setZuordnen(null)}><Icon name="x" /></button>
            </div>
            <div style={{ padding: 18, display: "grid", gap: 12 }}>
              <label style={{ fontSize: 13, display: "grid", gap: 4 }}>
                <span className="muted">Mitarbeiter</span>
                <SuchSelect
                  value={zuordnen.employeeId}
                  onChange={(v) => setZuordnen({ ...zuordnen, employeeId: v })}
                  platzhalter="— Mitarbeiter wählen —"
                  suchePlatzhalter="Name oder Personalnummer…"
                  options={mitarbeiter.map((m) => ({ value: m.id, label: m.name, hint: m.employeeNumber || m.email || "" }))}
                />
              </label>
              <label style={{ fontSize: 13, display: "grid", gap: 4 }}>
                <span className="muted">Rubrik in der Akte</span>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <SuchSelect
                      value={zuordnen.groupId}
                      onChange={(v) => setZuordnen({ ...zuordnen, groupId: v })}
                      platzhalter="— ohne Zuordnung —"
                      suchePlatzhalter="Rubrik suchen oder neue eintippen…"
                      options={gruppen.map((g: any) => ({ value: g.id, label: g.name }))}
                      erlaubeNeu
                      neuText="als neue Rubrik anlegen"
                      onNeu={rubrikAnlegen}
                    />
                  </div>
                  {zuordnen.groupId && (
                    <button className="btn btn-icon" title="Rubrik umbenennen"
                      onClick={() => rubrikUmbenennen(zuordnen.groupId)}>
                      <Icon name="pencil" size={14} />
                    </button>
                  )}
                </div>
                <span className="muted" style={{ fontSize: 12 }}>
                  Neue Rubrik einfach eintippen – sie steht danach überall zur Verfügung.
                </span>
              </label>
              <div className="muted" style={{ fontSize: 12, lineHeight: 1.5 }}>
                Der Scan wird als Dokument in die Akte gelegt (Dateiname nach dem üblichen Schema)
                und bleibt hier als erledigt vermerkt.
              </div>
            </div>
            <div style={{ padding: "12px 18px", borderTop: "1px solid var(--border)", display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn" onClick={() => setZuordnen(null)}>Abbrechen</button>
              <button className="btn btn-primary" disabled={busy === "zuordnen"} onClick={zuordnenSpeichern}>
                <Icon name="save" /> {busy === "zuordnen" ? "Legt ab…" : "In die Akte legen"}
              </button>
            </div>
          </div>
        </div>
      )}

      {viewer && (
        <PdfViewerModal
          url={viewer.url}
          titel={viewer.titel}
          onClose={() => { URL.revokeObjectURL(viewer.url); setViewer(null); }}
        />
      )}

      <ConfirmDialog
        open={!!scannerLoeschen}
        title="Scanner entfernen?"
        message={`„${scannerLoeschen?.name || ""}" wird aus der Liste entfernt. Bereits gescannte Dokumente bleiben erhalten.`}
        onConfirm={scannerEntfernen}
        onCancel={() => setScannerLoeschen(null)}
      />
      <ConfirmDialog
        open={!!loeschen}
        title="Scan verwerfen?"
        message={`„${loeschen?.title || ""}" verschwindet aus dem Posteingang.`}
        onConfirm={verwerfen}
        onCancel={() => setLoeschen(null)}
      />
    </div>
  );
}
