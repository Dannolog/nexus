"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, getToken } from "@/lib/clientApi";
import Icon from "@/components/Icon";
import SearchInput from "@/components/SearchInput";
import Hervorheben, { sucheBegriffe } from "@/components/Hervorheben";
import ConfirmDialog from "@/components/ConfirmDialog";
import SuchSelect from "@/components/SuchSelect";
import PdfViewerModal from "@/components/PdfViewerModal";
import PdfAusgabeDialog from "@/components/PdfAusgabeDialog";
import ScanZuordnenDialog from "@/components/ScanZuordnenDialog";
import { Feld } from "@/components/KontaktFeld";
import Toggle from "@/components/Toggle";
import ScanAnimation from "@/components/ScanAnimation";
import { useLive } from "@/lib/live";
import { useSeitenZustand } from "@/lib/seitenzustand";
import { useEinzug } from "@/lib/einzug";

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
  sha256: string; thumb?: string; scannerName: string; scannedAt: string; status: string;
  employeeId: string; groupId: string; documentId: string; orgId: string; zuordnungen: string; note: string;
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

type Ablage = { ziel: string; name: string; seiten?: number[]; von?: number };
/** Verlauf der Ablagen eines Scans (welche Seiten wohin). */
function verlauf(s: Scan): Ablage[] {
  try { return JSON.parse(s.zuordnungen || "[]"); } catch { return []; }
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
  // Suche und Filter überdauern den Seitenwechsel
  const [seite, setSeite] = useSeitenZustand<{ q: string; alle: boolean }>("scan", { q: "", alle: false });
  const suche = seite.q;
  const setSuche = (v: string) => setSeite({ q: v });
  const nurOffen = !seite.alle;
  const setNurOffen = (v: boolean | ((b: boolean) => boolean)) =>
    setSeite({ alle: !(typeof v === "function" ? v(nurOffen) : v) });
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState("");
  // Scanner-Verwaltung und Einstellungen liegen in Pop-ups – die Seite zeigt nur das Gerät.
  const [neuerScanner, setNeuerScanner] = useState("");
  const [neuerName, setNeuerName] = useState("");
  const [scannerOffen, setScannerOffen] = useState(false);
  const [bearbeite, setBearbeite] = useState<{ id: string; name: string; host: string; note: string } | null>(null);
  const [scannerLoeschen, setScannerLoeschen] = useState<Geraet | null>(null);
  const [optionenOffen, setOptionenOffen] = useState(false);
  const [dialogMsg, setDialogMsg] = useState("");
  const [gefunden, setGefunden] = useState<{ host: string; ip: string; model: string; eingerichtet: string }[] | null>(null);
  const [umbenennen, setUmbenennen] = useState<{ id: string; titel: string } | null>(null);
  const [zuordnen, setZuordnen] = useState<Scan | null>(null);
  const [mandanten, setMandanten] = useState<any[]>([]);
  const [akten, setAkten] = useState<any[]>([]);
  const [loeschen, setLoeschen] = useState<Scan | null>(null);
  const [viewer, setViewer] = useState<{ url: string; titel: string; dateiname: string } | null>(null);
  const [ausgabe, setAusgabe] = useState<{ scan: Scan; modus: "speichern" | "drucken" } | null>(null);
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
  const ladeAblagen = useCallback(() => {
    api("/api/organizations").then((d) => setMandanten(d.data || [])).catch(() => {});
    api("/api/dossiers").then((d) => setAkten(d.data || [])).catch(() => {});
  }, []);
  useLive(["Organization", "Dossier"], ladeAblagen);
  useEffect(() => {
    ladeAblagen();
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

  // Einzug beobachten: neu eingelegtes Papier wählt den Einzug vor – Flachbett bleibt wählbar
  const einzugMoeglich = !!faehig?.sources?.includes("Feeder");
  const { papier, problem: einzugFehler } = useEinzug(geraetId, einzugMoeglich && busy !== "scan", () => setQuelle("Feeder"), () => setQuelle("Platen"));

  /** Scanner anlegen – aus dem Eingabefeld oder aus einem Suchtreffer. Meldungen erscheinen im Fenster. */
  async function scannerHinzufuegen(adresse?: string) {
    const host = (adresse ?? neuerScanner).trim();
    if (!host) return;
    setBusy("scanner");
    setDialogMsg("");
    try {
      const s = await api("/api/scanners", { method: "POST", body: JSON.stringify({ host, name: adresse ? "" : neuerName.trim() }) });
      setDialogMsg(`Scanner „${s.name}" eingerichtet (${s.host}).`);
      setMsg(`Scanner „${s.name}" eingerichtet.`);
      if (!adresse) { setNeuerScanner(""); setNeuerName(""); }
      setGefunden((g) => g?.map((f) => f.host === host ? { ...f, eingerichtet: s.name } : f) ?? null);
      setGeraetId(s.id);
      ladeGeraete();
    } catch (e: any) { setDialogMsg("Fehler: " + e.message); }
    finally { setBusy(""); }
  }

  /** Lokales Netz nach Scannern durchsuchen (dauert bis ~20 s). */
  async function netzSuchen() {
    setBusy("suche");
    setDialogMsg("");
    setGefunden(null);
    try {
      const d = await api("/api/scanners/suche");
      setGefunden(d.data || []);
    } catch (e: any) { setDialogMsg("Fehler: " + e.message); }
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
      setDialogMsg(`Scanner „${bearbeite.name}" gespeichert.`);
      setBearbeite(null);
      ladeGeraete();
    } catch (e: any) { setDialogMsg("Fehler: " + e.message); }
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

  async function oeffnen(s: Scan) {
    setBusy("open" + s.id);
    try {
      const { blob, name } = await ladeDatei(`/api/scan-inbox/${s.id}/file`);
      setViewer({ url: URL.createObjectURL(blob), titel: `${s.title} · ${s.pages} Seite${s.pages === 1 ? "" : "n"}`, dateiname: name });
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

  /** Neue eigene Akte (Betriebsakte) direkt aus der Auswahl heraus anlegen. */
  async function akteAnlegen(name: string) {
    try {
      const a = await api("/api/dossiers", { method: "POST", body: JSON.stringify({ name }) });
      ladeAblagen();
      setAkten((alt) => [...alt, a]);
      setMsg(`Akte „${a.name}" angelegt.`);
      return a.id as string;
    } catch (e: any) { setMsg("Fehler: " + e.message); }
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

  const bereit = !!faehig;
  const statusText = busy === "scan" ? "scannt gerade" : faehig ? "bereit" : geraetId ? "antwortet nicht" : "kein Scanner eingerichtet";
  const statusFarbe = busy === "scan" ? "var(--accent)" : bereit ? "#16a34a" : geraetId ? "#ef4444" : "var(--muted)";

  const statusAbzeichen = busy === "scan" ? "blau" : bereit ? "gruen" : geraetId ? "rot" : "";

  /** Knopf „Datei hochladen" – im Kopf und im leeren Posteingang. */
  const hochladenKnopf = (klasse: string, beschriftung: React.ReactNode) => (
    <label className={klasse} style={{ cursor: busy === "upload" ? "progress" : "pointer" }} title="Vorhandene Datei (PDF oder Bild) in den Posteingang legen">
      {busy === "upload" ? <span className="speichern-dreh" /> : <Icon name="upload" />} {beschriftung}
      <input type="file" accept="application/pdf,image/*" style={{ display: "none" }}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) hochladen(f); e.target.value = ""; }} />
    </label>
  );

  const scannerFensterAuf = () => { setDialogMsg(""); setScannerOffen(true); };

  return (
    <div className="scan-seite" style={{ display: "grid", gap: 14 }}>
      {/* ── Kopf: Titel + Scanner verwalten + Datei hochladen ── */}
      <div className="rv-sticky-header sca-kopf">
        <div className="sca-kopf-text">
          <h1 className="seiten-titel">
            <span className="titel-icon"><Icon name="printer" size={20} /></span>
            Scannen
            {offeneAnzahl > 0 && <span className="anzahl" title="Offene Scans im Posteingang">{offeneAnzahl}</span>}
          </h1>
          <div className="seiten-untertitel">Scannen oder Datei hochladen – danach im Posteingang der passenden Akte zuordnen.</div>
        </div>
        <div className="sca-kopf-knoepfe">
          <button className="btn" onClick={scannerFensterAuf} title="Scanner hinzufügen oder ändern">
            <Icon name="settings" /> <span className="btn-label">Scanner</span>
          </button>
          {hochladenKnopf("btn btn-primary", <span className="btn-label">Datei hochladen</span>)}
        </div>
      </div>

      {msg && (
        <div className={"hinweis-leiste" + (msg.startsWith("Fehler") || /^(Posteingang|Scanner):/.test(msg) ? " fehler" : "")}
          style={{ marginBottom: 0 }}>
          <Icon name={msg.startsWith("Fehler") ? "alert" : "check"} size={16} />
          <span style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>{msg}</span>
          <button className="btn btn-icon btn-flach" aria-label="Meldung schließen" onClick={() => setMsg("")}><Icon name="x" size={14} /></button>
        </div>
      )}

      <div className="sca-raster">
        {/* ── Gerät ── */}
        <div className="sca-seitenleiste">
          <div className="card sca-karte">
            <div className="sca-karten-titel">
              <span className="sca-ic"><Icon name="printer" size={16} /></span>
              <span>Scanner</span>
              {geraete.length > 0 && <span className={"abzeichen " + statusAbzeichen}>{statusText}</span>}
            </div>

            {geraete.length === 0 ? (
              <div className="leer-zustand" style={{ padding: "18px 8px" }}>
                <span className="leer-icon"><Icon name="wifi" size={26} /></span>
                <div style={{ fontWeight: 650, color: "var(--fg)" }}>Noch kein Scanner eingerichtet</div>
                <div style={{ fontSize: 13 }}>Scanner im Netzwerk suchen lassen oder die IP-Adresse eintragen.
                  Dateien lassen sich auch ohne Scanner hochladen.</div>
                <button className="btn btn-primary" onClick={scannerFensterAuf}>
                  <Icon name="plus" /> Scanner hinzufügen
                </button>
              </div>
            ) : (
              <>
                <div style={{ display: "grid", gap: 6 }}>
                  <SuchSelect
                    value={geraetId}
                    onChange={setGeraetId}
                    platzhalter="— Scanner wählen —"
                    suchePlatzhalter="Scanner suchen…"
                    options={geraete.map((g) => ({ value: g.id, label: g.name, hint: g.host }))}
                  />
                  <div className="sca-status">
                    <i style={{ background: statusFarbe }} />
                    <span>{faehig?.model ? `${faehig.model} · ` : ""}{statusText}</span>
                  </div>
                </div>

                {/* Vorlage als Umschalter über die volle Breite */}
                <div style={{ display: "grid", gap: 6 }}>
                  <div className="sektion-titel"><Icon name="file-text" size={13} /> Vorlage</div>
                  <div className="sca-segment" role="group" aria-label="Vorlage">
                    <button aria-pressed={quelle === "Platen"} onClick={() => setQuelle("Platen")}>
                      <Icon name="file-text" size={15} /> Flachbett
                    </button>
                    <button aria-pressed={quelle === "Feeder"} disabled={!einzugMoeglich} onClick={() => setQuelle("Feeder")}
                      title={einzugMoeglich ? "Über den Einzug scannen" : "Dieses Gerät hat keinen Einzug"}>
                      <Icon name="copy" size={15} /> Einzug
                      {einzugMoeglich && papier !== null && (
                        <span className="sca-chip" style={{
                          background: papier ? "rgba(22,163,74,.18)" : "rgba(127,127,127,.2)",
                          color: papier ? "#16a34a" : "var(--muted)" }}>
                          {papier ? "Papier" : "leer"}
                        </span>
                      )}
                    </button>
                  </div>
                </div>

                {/* Einzug-Hinweis direkt am Umschalter */}
                {einzugMoeglich && (einzugFehler || (papier && quelle === "Platen") || (papier === false && quelle === "Feeder")) && busy !== "scan" && (
                  <div className="sca-warnzeile"
                    style={{ color: einzugFehler || quelle === "Feeder" ? "var(--warn, #c47f17)" : "var(--muted)" }}>
                    <Icon name="alert" size={15} />
                    <span style={{ flex: "1 1 200px" }}>
                      {einzugFehler || (quelle === "Feeder" ? "Einzug ist leer – Papier einlegen oder Flachbett wählen." : "Im Einzug liegt Papier – gescannt wird trotzdem vom Flachbett.")}
                    </span>
                  </div>
                )}

                {/* Einstellungen: Zusammenfassung, aufklappbar */}
                <button className="btn sca-aufklapp" aria-expanded={optionenOffen} onClick={() => setOptionenOffen((v) => !v)}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                    <Icon name="settings" size={15} /> Einstellungen
                  </span>
                  <span className="muted" style={{ fontSize: 12.5, display: "inline-flex", alignItems: "center", gap: 6 }}>
                    {farbe === "RGB24" ? "Farbe" : "Graustufen"} · {aufloesung} dpi{quelle === "Feeder" && duplex ? " · beidseitig" : ""}
                    <span style={{ display: "inline-flex", transform: optionenOffen ? "rotate(180deg)" : undefined, transition: "transform .15s" }}>
                      <Icon name="chevron-down" size={14} />
                    </span>
                  </span>
                </button>

                {optionenOffen && (
                  <div className="sca-ein">
                    <div style={{ display: "grid", gap: 6 }}>
                      <div className="sektion-titel"><Icon name="image" size={13} /> Farbe</div>
                      <div className="sca-segment" role="group" aria-label="Farbe">
                        <button aria-pressed={farbe === "RGB24"} onClick={() => setFarbe("RGB24")}><Icon name="image" size={15} /> Farbe</button>
                        <button aria-pressed={farbe !== "RGB24"} onClick={() => setFarbe("Grayscale8")}><Icon name="moon" size={15} /> Graustufen</button>
                      </div>
                    </div>
                    <div style={{ display: "grid", gap: 6 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13 }}>
                        <span className="sektion-titel"><Icon name="maximize" size={13} /> Auflösung</span>
                        <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
                          {aufloesung} dpi <span className="muted" style={{ fontWeight: 400 }}>
                            · {aufloesung <= 150 ? "schnell" : aufloesung >= 300 ? "fein" : "Mittelweg"}</span>
                        </span>
                      </div>
                      <input type="range" min={0} max={Math.max(0, stufen.length - 1)} step={1}
                        value={Math.max(0, stufen.indexOf(aufloesung))}
                        onChange={(e) => setAufloesung(stufen[Number(e.target.value)] ?? stufen[0])}
                        style={{ width: "100%", accentColor: "var(--accent)" }} />
                      <div className="sca-hinweis">Höhere Auflösung = schärfer, aber größere Datei und längere Scanzeit.</div>
                    </div>
                    {quelle === "Feeder" && faehig?.duplex && (
                      <Toggle checked={duplex} onChange={setDuplex} label={<span style={{ fontSize: 13.5 }}>Vorder- und Rückseite</span>} />
                    )}
                  </div>
                )}

                {busy === "scan" ? (
                  <ScanAnimation
                    text={quelle === "Feeder" ? "Zieht die Seiten ein" : "Scannt die Vorlage"}
                    untertext="Läuft im Hintergrund – du kannst hier weiterarbeiten. Das Ergebnis erscheint gleich im Posteingang."
                  />
                ) : (
                  <button className="btn btn-primary sca-los" disabled={!geraetId} onClick={scannen}>
                    <Icon name="printer" size={18} /> Jetzt scannen
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* ── Posteingang, nach Tagen ── */}
        <div className="sca-eingang">
          <div className="sca-karten-titel" style={{ fontSize: 17 }}>
            <span className="sca-ic"><Icon name="archive" size={16} /></span>
            <span>Posteingang
              <span className="muted" style={{ fontSize: 12.5, fontWeight: 500, marginLeft: 8 }}>
                Hier liegen Scans, bis sie zugeordnet sind.
              </span>
            </span>
          </div>
          <div className="sca-werkzeug">
            <div className="sca-segment" role="group" aria-label="Filter">
              <button aria-pressed={nurOffen} onClick={() => setNurOffen(true)}><Icon name="tasks" size={14} /> Offen · {offeneAnzahl}</button>
              <button aria-pressed={!nurOffen} onClick={() => setNurOffen(false)}><Icon name="archive" size={14} /> Alle · {scans.length}</button>
            </div>
            <SearchInput value={suche} onChange={setSuche} placeholder="Name, Scanner, Notiz…" style={{ width: "100%" }} />
          </div>

          {tage.length === 0 && (
            <div className="card leer-zustand">
              <span className="leer-icon"><Icon name={suche ? "search" : nurOffen ? "check" : "archive"} size={28} /></span>
              <div style={{ fontWeight: 650, color: "var(--fg)" }}>
                {suche ? "Kein Scan passt zur Suche." : nurOffen ? "Nichts offen – alles zugeordnet." : "Noch nichts gescannt."}
              </div>
              <div style={{ fontSize: 13 }}>
                {suche ? "Suchbegriff ändern oder leeren." : nurOffen ? "Neue Scans erscheinen hier automatisch."
                  : "Links auf „Jetzt scannen“ tippen oder eine vorhandene Datei hochladen."}
              </div>
              {suche ? (
                <button className="btn" onClick={() => setSuche("")}><Icon name="x" /> Suche leeren</button>
              ) : nurOffen && scans.length > 0 ? (
                <button className="btn" onClick={() => setNurOffen(false)}><Icon name="archive" /> Alle anzeigen</button>
              ) : (
                hochladenKnopf("btn", "Datei hochladen")
              )}
            </div>
          )}

          {tage.map(([tag, liste]) => (
            <div key={tag} style={{ display: "grid", gap: 8 }}>
              <div className="sca-tag">
                <Icon name="calendar" size={14} />
                <span>{tagLabel(liste[0].scannedAt)}</span>
                <small>{liste.length} Dok. · {liste.reduce((n, s) => n + (s.pages || 1), 0)} S.</small>
              </div>

              {liste.map((s) => (
                <div key={s.id} className="card sca-eintrag">
                  {/* Vorschau der ersten Seite – ein Klick öffnet den Scan */}
                  <button type="button" className="sca-vorschau" onClick={() => oeffnen(s)} title="Scan öffnen">
                    {s.thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={s.thumb} alt="" />
                    ) : (
                      <span><Icon name="file-text" size={20} /></span>
                    )}
                  </button>

                  <div className="sca-info">
                    {umbenennen?.id === s.id ? (
                      <div style={{ display: "flex", gap: 6 }}>
                        <input className="input" autoFocus style={{ flex: 1, minWidth: 0 }}
                          value={umbenennen.titel}
                          onChange={(e) => setUmbenennen({ ...umbenennen, titel: e.target.value })}
                          onKeyDown={(e) => { if (e.key === "Enter") nameSpeichern(); if (e.key === "Escape") setUmbenennen(null); }} />
                        <button className="btn btn-icon" title="Abbrechen" aria-label="Abbrechen" onClick={() => setUmbenennen(null)}><Icon name="x" /></button>
                        <button className="btn btn-icon btn-primary" title="Namen speichern" aria-label="Namen speichern" onClick={nameSpeichern}><Icon name="check" /></button>
                      </div>
                    ) : (
                      <div className="sca-titelzeile">
                        <span className="sca-titel"><Hervorheben text={s.title} suche={suche} /></span>
                        <button className="btn btn-icon btn-flach" title="Namen ändern" aria-label="Namen ändern" onClick={() => setUmbenennen({ id: s.id, titel: s.title })}>
                          <Icon name="pencil" size={13} />
                        </button>
                      </div>
                    )}
                    <div className="sca-meta">
                      <span className={"abzeichen " + (s.status === "offen" ? "blau" : "gruen")}>
                        <Icon name={s.status === "offen" ? "tasks" : "check"} size={11} /> {s.status === "offen" ? "offen" : "zugeordnet"}
                      </span>
                      <span>{uhrzeit(s.scannedAt)}</span><span className="sca-trenner">·</span>
                      <span>{s.pages} S.</span>
                      {groesse(s.size) && <><span className="sca-trenner">·</span><span>{groesse(s.size)}</span></>}
                      {s.scannerName && <><span className="sca-trenner">·</span>
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 220 }}>{s.scannerName}</span></>}
                    </div>

                    {/* Warnungen: gleiche Namen oder gleicher Inhalt */}
                    {(s.warnungen.name || s.warnungen.inhalt || s.warnungen.bereitsAbgelegt) && (
                      <div className="sca-abzeichen">
                        {s.warnungen.inhalt && (
                          <span className="abzeichen gelb"><Icon name="alert" size={12} /> Inhaltsgleicher Scan liegt bereits im Posteingang – doppelt gescannt?</span>
                        )}
                        {s.warnungen.bereitsAbgelegt && (
                          <span className="abzeichen gelb"><Icon name="alert" size={12} /> Dieses Dokument liegt inhaltsgleich bereits in einer Mitarbeiterakte.</span>
                        )}
                        {s.warnungen.name && (
                          <span className="abzeichen gelb"><Icon name="alert" size={12} /> Gleicher Name wie ein anderer Scan – zur Unterscheidung umbenennen.</span>
                        )}
                      </div>
                    )}

                    {/* Bisherige Ablagen – auch Teilablagen einzelner Seiten */}
                    {verlauf(s).map((z, i) => (
                      <div key={i} className="sca-verlauf">
                        <Icon name="folder" size={13} />
                        <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>
                          {z.seiten && z.von && z.seiten.length < z.von
                            ? `Seite${z.seiten.length === 1 ? "" : "n"} ${z.seiten.join(", ")} von ${z.von} → `
                            : "zugeordnet: "}
                          {z.ziel === "betriebsakte" ? `Betriebsakte ${z.name}` : z.name}
                        </span>
                      </div>
                    ))}
                    {s.status === "zugeordnet" && verlauf(s).length === 0 && (
                      <div className="sca-verlauf">
                        <Icon name="folder" size={13} />
                        <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>
                          zugeordnet: {s.orgId
                            ? `Betriebsakte ${[...mandanten, ...akten].find((m) => m.id === s.orgId)?.name || ""}`
                            : mitarbeiter.find((m) => m.id === s.employeeId)?.name || "Mitarbeiter"}
                          {s.groupId ? ` · ${gruppen.find((g) => g.id === s.groupId)?.name || "Rubrik"}` : ""}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="sca-aktionen">
                    <button className="btn btn-icon" title="Öffnen" aria-label="Öffnen" disabled={busy === "open" + s.id} onClick={() => oeffnen(s)}>
                      {busy === "open" + s.id ? <span className="speichern-dreh" /> : <Icon name="eye" />}
                    </button>
                    <button className="btn btn-icon" title="Herunterladen oder Speichern unter – ganz oder einzelne Seiten" aria-label="Herunterladen"
                      onClick={() => setAusgabe({ scan: s, modus: "speichern" })}>
                      <Icon name="download" />
                    </button>
                    <button className="btn btn-icon" title="Drucken – ganz oder einzelne Seiten" aria-label="Drucken"
                      onClick={() => setAusgabe({ scan: s, modus: "drucken" })}>
                      <Icon name="printer" />
                    </button>
                    <button className="btn btn-icon btn-danger" title="Verwerfen" aria-label="Verwerfen" onClick={() => setLoeschen(s)}>
                      <Icon name="trash" />
                    </button>
                    {s.status === "offen" && (
                      <button className="btn btn-primary sca-zuordnen" onClick={() => setZuordnen(s)}
                        title="In die Mitarbeiter- oder Betriebsakte legen – ganz oder nur bestimmte Seiten">
                        <Icon name="folder" /> Zuordnen
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* ── Pop-up: Scanner verwalten (suchen, anlegen, ändern, entfernen) ── */}
      {scannerOffen && (
        <div className="kt-huelle" style={{ zIndex: 60 }} onClick={() => setScannerOffen(false)}>
          <div onClick={(e) => e.stopPropagation()} className="card kt-fenster dm-fenster" style={{ width: 580 }}>
            <div className="sca-fenster-kopf">
              <span className="sca-ic"><Icon name="printer" size={16} /></span>
              <div>
                <h2>Scanner verwalten</h2>
                <div className="sca-unter">Geräte im Netzwerk finden, hinzufügen, umbenennen oder entfernen.</div>
              </div>
              <button className="btn btn-icon btn-flach" aria-label="Schließen" onClick={() => setScannerOffen(false)}>
                <Icon name="x" />
              </button>
            </div>

            <div className="kt-inhalt" style={{ flex: 1 }}>
              {dialogMsg && (
                <div className={"sca-meldung" + (dialogMsg.startsWith("Fehler") ? " fehler" : "")}>
                  <Icon name={dialogMsg.startsWith("Fehler") ? "alert" : "check"} size={16} />
                  <span style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>{dialogMsg}</span>
                </div>
              )}

              {/* Eingerichtete Geräte */}
              {geraete.length > 0 && (
                <div className="kt-abschnitt">
                  <div className="kt-abschnitt-titel">
                    <span className="ic"><Icon name="check" size={15} /></span> Eingerichtet
                    <small>{geraete.length} Gerät{geraete.length === 1 ? "" : "e"}</small>
                  </div>
                  {geraete.map((g) => (
                    <div key={g.id} className="sca-geraet">
                      <div className="sca-geraet-zeile">
                        <Icon name="printer" size={18} />
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 14 }}>{g.name}</div>
                          <div className="muted" style={{ fontSize: 12, overflowWrap: "anywhere" }}>{g.host}{g.model ? ` · ${g.model}` : ""}</div>
                        </div>
                        <button className="btn btn-icon" title="Bearbeiten" aria-label="Bearbeiten"
                          onClick={() => setBearbeite({ id: g.id, name: g.name, host: g.host, note: (g as any).note || "" })}>
                          <Icon name="pencil" size={14} />
                        </button>
                        <button className="btn btn-icon btn-danger" title="Entfernen" aria-label="Entfernen" onClick={() => setScannerLoeschen(g)}>
                          <Icon name="trash" size={14} />
                        </button>
                      </div>
                      {bearbeite?.id === g.id && (
                        <div style={{ display: "grid", gap: 10, borderTop: "1px solid var(--border)", paddingTop: 10 }}>
                          <div className="feld-zeile feld-zeile-2">
                            <Feld label="Name" icon="tag" wert={bearbeite.name}
                              setWert={(v) => setBearbeite({ ...bearbeite, name: v })} />
                            <Feld label="IP-Adresse" icon="command" wert={bearbeite.host}
                              setWert={(v) => setBearbeite({ ...bearbeite, host: v })} />
                          </div>
                          <Feld label="Notiz" icon="file-text" wert={bearbeite.note} kopierbar={false}
                            setWert={(v) => setBearbeite({ ...bearbeite, note: v })} />
                          <div className="sca-knopfpaar">
                            <button className="btn" onClick={() => setBearbeite(null)}><Icon name="x" /> Abbrechen</button>
                            <button className="btn btn-primary" onClick={scannerSpeichern}>
                              <Icon name="save" /> Speichern
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Im Netzwerk suchen */}
              <div className="kt-abschnitt">
                <div className="kt-abschnitt-titel">
                  <span className="ic"><Icon name="wifi" size={15} /></span> Im Netzwerk suchen
                </div>
                <div className="sca-hinweis">Findet Scanner im lokalen Netz automatisch – das dauert bis zu 20 Sekunden.</div>
                <button className="btn" style={{ justifyContent: "center", minHeight: 42 }} disabled={busy === "suche"} onClick={netzSuchen}>
                  {busy === "suche" ? <><span className="speichern-dreh" /> <span>Sucht im Netzwerk<span className="scan-punkte" /></span></>
                    : <><Icon name="search" /> Jetzt suchen</>}
                </button>
                {gefunden && gefunden.length === 0 && busy !== "suche" && (
                  <div className="sca-hinweis">Kein Scanner gefunden – IP-Adresse unten von Hand eintragen.</div>
                )}
                {gefunden?.map((f) => (
                  <div key={f.host} className="sca-treffer">
                    <Icon name="printer" size={16} />
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13.5 }}>{f.model}</div>
                      <div className="muted" style={{ fontSize: 12 }}>{f.host}</div>
                    </div>
                    {f.eingerichtet ? (
                      <span className="abzeichen gruen"><Icon name="check" size={11} /> eingerichtet</span>
                    ) : (
                      <button className="btn btn-primary" disabled={busy === "scanner"} onClick={() => scannerHinzufuegen(f.host)}>
                        <Icon name="plus" /> Hinzufügen
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Von Hand */}
              <div className="kt-abschnitt">
                <div className="kt-abschnitt-titel">
                  <span className="ic"><Icon name="command" size={15} /></span> Von Hand eintragen
                </div>
                <div className="feld-zeile feld-zeile-2">
                  <Feld label="IP-Adresse" icon="command" wert={neuerScanner} autoFocus={geraete.length === 0}
                    platzhalter="z. B. 192.168.1.50" setWert={setNeuerScanner} />
                  <Feld label="Name (frei)" icon="tag" wert={neuerName} kopierbar={false}
                    platzhalter="z. B. Büro oben" setWert={setNeuerName} />
                </div>
                <span className="sca-hinweis">
                  Das Gerät wird sofort geprüft (erst HTTPS, dann HTTP) – antwortet es nicht, wird es nicht gespeichert.
                  Auch möglich: <code>http://IP</code> oder <code>IP:Port</code>. Ohne Namen trägt es die Modellbezeichnung.
                </span>
              </div>
            </div>

            <div className="kt-fuss">
              <button className="btn sca-fuss-links" onClick={() => setScannerOffen(false)}><Icon name="x" /> Schließen</button>
              <button className="btn btn-primary" disabled={!neuerScanner.trim() || busy === "scanner"} onClick={() => scannerHinzufuegen()}>
                {busy === "scanner" ? <><span className="speichern-dreh" /> Prüft…</> : <><Icon name="check" /> Prüfen und hinzufügen</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Zuordnen ── */}
      {zuordnen && (
        <ScanZuordnenDialog
          key={zuordnen.id}
          scan={zuordnen}
          ladeBlob={() => ladeDatei(`/api/scan-inbox/${zuordnen.id}/file`).then((d) => d.blob)}
          mitarbeiter={mitarbeiter}
          gruppen={gruppen}
          mandanten={mandanten}
          akten={akten}
          onRubrikNeu={rubrikAnlegen}
          onRubrikUmbenennen={rubrikUmbenennen}
          onAkteNeu={akteAnlegen}
          onFertig={(m) => { setMsg(m); setZuordnen(null); ladeScans(); }}
          onClose={() => setZuordnen(null)}
        />
      )}

      {viewer && (
        <PdfViewerModal
          url={viewer.url}
          titel={viewer.titel}
          dateiname={viewer.dateiname}
          onClose={() => { URL.revokeObjectURL(viewer.url); setViewer(null); }}
        />
      )}

      {ausgabe && (
        <PdfAusgabeDialog
          key={ausgabe.scan.id + ausgabe.modus}
          quelle={() => ladeDatei(`/api/scan-inbox/${ausgabe.scan.id}/file`).then((d) => d.blob)}
          dateiname={ausgabe.scan.fileName || `${ausgabe.scan.title}.pdf`}
          titel={ausgabe.scan.title}
          modus={ausgabe.modus}
          onClose={() => setAusgabe(null)}
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
