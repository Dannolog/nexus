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

  return (
    <div className="scan-seite">
      <style>{`
        .scan-seite { display: grid; gap: 14px; }
        .scan-kopf { display: flex; align-items: center; gap: 10px; }
        .scan-kopf h1 { font-size: 24px; font-weight: 700; display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0; }
        .scan-geraet { padding: 16px; display: grid; gap: 14px; }
        .scan-reihe { display: flex; gap: 8px; align-items: stretch; }
        .scan-segment { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; padding: 4px; border-radius: 12px;
                        background: color-mix(in srgb, var(--muted) 12%, transparent); }
        .scan-segment button { border: 0; border-radius: 9px; padding: 10px 8px; font-size: 14px; font-weight: 600; cursor: pointer;
                               background: transparent; color: var(--fg); display: flex; align-items: center; justify-content: center; gap: 6px; }
        .scan-segment button[aria-pressed="true"] { background: var(--card); color: var(--accent); box-shadow: 0 1px 4px rgba(0,0,0,.18); }
        .scan-segment button:disabled { opacity: .45; cursor: not-allowed; }
        .scan-chip { font-size: 11px; padding: 1px 7px; border-radius: 999px; font-weight: 600; }
        .scan-los { width: 100%; justify-content: center; padding: 13px 16px; font-size: 16px; font-weight: 700; border-radius: 12px; }
        .scan-ein { display: grid; gap: 12px; padding: 12px; border-radius: 12px; border: 1px dashed var(--border); }
        .scan-eintrag { border: 1px solid var(--border); border-radius: 12px; padding: 10px; display: grid; gap: 8px; }
        .scan-eintrag-kopf { display: grid; grid-template-columns: auto 1fr; gap: 12px; align-items: start; }
        .scan-titel { font-weight: 600; font-size: 14.5px; overflow-wrap: anywhere; }
        .scan-meta { font-size: 12px; color: var(--muted); margin-top: 2px; }
        .scan-aktionen { display: flex; gap: 6px; flex-wrap: wrap; }
        .scan-aktionen .scan-zuordnen { margin-left: auto; }
        @media (max-width: 768px) {
          .scan-kopf h1 { font-size: 21px; }
          .scan-aktionen { display: grid; grid-template-columns: repeat(4, 1fr) auto; }
          .scan-aktionen .btn { justify-content: center; min-height: 40px; }
          .scan-aktionen .scan-zuordnen { grid-column: 1 / -1; grid-row: 1; margin-left: 0; min-height: 44px; }
        }
      `}</style>

      {/* ── Kopf: Titel + Datei hochladen + Scanner verwalten ── */}
      <div className="scan-kopf">
        <h1><Icon name="printer" size={24} /> Scannen</h1>
        <label className="btn" style={{ cursor: "pointer" }} title="Vorhandene Datei in den Posteingang legen">
          <Icon name="upload" /> <span className="btn-label">Datei hochladen</span>
          <input type="file" accept="application/pdf,image/*" style={{ display: "none" }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) hochladen(f); e.target.value = ""; }} />
        </label>
        <button className="btn" onClick={() => { setDialogMsg(""); setScannerOffen(true); }} title="Scanner hinzufügen oder ändern">
          <Icon name="settings" /> <span className="btn-label">Scanner</span>
        </button>
      </div>

      {msg && (
        <div className="card" style={{ padding: "10px 12px", fontSize: 14, display: "flex", gap: 8, alignItems: "flex-start" }}>
          <Icon name={msg.startsWith("Fehler") ? "alert" : "check"} size={16} />
          <span style={{ flex: 1 }}>{msg}</span>
          <button className="btn btn-icon" aria-label="Meldung schließen" onClick={() => setMsg("")}><Icon name="x" size={14} /></button>
        </div>
      )}

      {/* ── Gerät ── */}
      <div className="card scan-geraet">
        {geraete.length === 0 ? (
          <div style={{ display: "grid", gap: 10, justifyItems: "start" }}>
            <div style={{ fontWeight: 600 }}>Noch kein Scanner eingerichtet</div>
            <div className="muted" style={{ fontSize: 13 }}>Scanner im Netzwerk suchen lassen oder die IP-Adresse eintragen.</div>
            <button className="btn btn-primary" onClick={() => { setDialogMsg(""); setScannerOffen(true); }}>
              <Icon name="plus" /> Scanner hinzufügen
            </button>
          </div>
        ) : (
          <>
            <div style={{ display: "grid", gap: 6 }}>
              <div className="scan-reihe">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <SuchSelect
                    value={geraetId}
                    onChange={setGeraetId}
                    platzhalter="— Scanner wählen —"
                    suchePlatzhalter="Scanner suchen…"
                    options={geraete.map((g) => ({ value: g.id, label: g.name, hint: g.host }))}
                  />
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5 }} className="muted">
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: statusFarbe, flexShrink: 0 }} />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {faehig?.model ? `${faehig.model} · ` : ""}{statusText}
                </span>
              </div>
            </div>

            {/* Vorlage als Umschalter über die volle Breite */}
            <div className="scan-segment" role="group" aria-label="Vorlage">
              <button aria-pressed={quelle === "Platen"} onClick={() => setQuelle("Platen")}>
                <Icon name="file-text" size={15} /> Flachbett
              </button>
              <button aria-pressed={quelle === "Feeder"} disabled={!einzugMoeglich} onClick={() => setQuelle("Feeder")}
                title={einzugMoeglich ? "Über den Einzug scannen" : "Dieses Gerät hat keinen Einzug"}>
                <Icon name="copy" size={15} /> Einzug
                {einzugMoeglich && papier !== null && (
                  <span className="scan-chip" style={{
                    background: papier ? "rgba(22,163,74,.18)" : "rgba(127,127,127,.2)",
                    color: papier ? "#16a34a" : "var(--muted)" }}>
                    {papier ? "Papier" : "leer"}
                  </span>
                )}
              </button>
            </div>

            {/* Einzug-Hinweis direkt am Umschalter */}
            {einzugMoeglich && (einzugFehler || (papier && quelle === "Platen") || (papier === false && quelle === "Feeder")) && busy !== "scan" && (
              <div style={{ fontSize: 13, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap",
                            color: einzugFehler || quelle === "Feeder" ? "var(--warn, #c47f17)" : "var(--muted)" }}>
                <Icon name="alert" size={15} />
                <span style={{ flex: "1 1 200px" }}>
                  {einzugFehler || (quelle === "Feeder" ? "Einzug ist leer – Papier einlegen oder Flachbett wählen." : "Im Einzug liegt Papier – gescannt wird trotzdem vom Flachbett.")}
                </span>
              </div>
            )}

            {/* Einstellungen: Zusammenfassung, aufklappbar */}
            <button className="btn" style={{ justifyContent: "space-between", width: "100%" }} onClick={() => setOptionenOffen((v) => !v)}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <Icon name="settings" size={15} /> Einstellungen
              </span>
              <span className="muted" style={{ fontSize: 12.5 }}>
                {farbe === "RGB24" ? "Farbe" : "Graustufen"} · {aufloesung} dpi{quelle === "Feeder" && duplex ? " · beidseitig" : ""} {optionenOffen ? "▴" : "▾"}
              </span>
            </button>

            {optionenOffen && (
              <div className="scan-ein">
                <div className="scan-segment" role="group" aria-label="Farbe">
                  <button aria-pressed={farbe === "RGB24"} onClick={() => setFarbe("RGB24")}><Icon name="image" size={15} /> Farbe</button>
                  <button aria-pressed={farbe !== "RGB24"} onClick={() => setFarbe("Grayscale8")}>Graustufen</button>
                </div>
                <div style={{ display: "grid", gap: 6 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                    <span className="muted" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Icon name="maximize" size={14} /> Auflösung</span>
                    <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
                      {aufloesung} dpi <span className="muted" style={{ fontWeight: 400 }}>
                        · {aufloesung <= 150 ? "schnell" : aufloesung >= 300 ? "fein" : "Mittelweg"}</span>
                    </span>
                  </div>
                  <input type="range" min={0} max={Math.max(0, stufen.length - 1)} step={1}
                    value={Math.max(0, stufen.indexOf(aufloesung))}
                    onChange={(e) => setAufloesung(stufen[Number(e.target.value)] ?? stufen[0])}
                    style={{ width: "100%", accentColor: "var(--accent)" }} />
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
              <button className="btn btn-primary scan-los" disabled={!geraetId} onClick={scannen}>
                <Icon name="printer" size={18} /> Jetzt scannen
              </button>
            )}
          </>
        )}
      </div>

      {/* ── Pop-up: Scanner verwalten (suchen, anlegen, ändern, entfernen) ── */}
      {scannerOffen && (
        <div onClick={() => setScannerOffen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", display: "grid", placeItems: "center", padding: 16, zIndex: 60 }}>
          <div onClick={(e) => e.stopPropagation()} className="card dm-fenster"
            style={{ width: 560, maxWidth: "94vw", maxHeight: "90vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10 }}>
              <Icon name="printer" size={18} />
              <h2 style={{ fontSize: 17, fontWeight: 700, flex: 1 }}>Scanner</h2>
              <button className="btn btn-icon" aria-label="Schließen" onClick={() => setScannerOffen(false)}>
                <Icon name="x" />
              </button>
            </div>

            <div style={{ padding: 20, overflowY: "auto", display: "grid", gap: 14, flex: 1 }}>
              {dialogMsg && (
                <div style={{ fontSize: 13.5, padding: "9px 12px", borderRadius: 10, display: "flex", gap: 8,
                              background: dialogMsg.startsWith("Fehler") ? "rgba(239,68,68,.10)" : "rgba(22,163,74,.10)",
                              border: `1px solid ${dialogMsg.startsWith("Fehler") ? "rgba(239,68,68,.35)" : "rgba(22,163,74,.35)"}` }}>
                  <Icon name={dialogMsg.startsWith("Fehler") ? "alert" : "check"} size={16} />
                  <span style={{ flex: 1 }}>{dialogMsg}</span>
                </div>
              )}

              {/* Eingerichtete Geräte */}
              {geraete.length > 0 && (
                <div style={{ display: "grid", gap: 8 }}>
                  <div className="muted" style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: ".04em" }}>Eingerichtet</div>
                  {geraete.map((g) => (
                    <div key={g.id} style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 10, display: "grid", gap: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <Icon name="printer" size={18} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 14 }}>{g.name}</div>
                          <div className="muted" style={{ fontSize: 12, overflowWrap: "anywhere" }}>{g.host}{g.model ? ` · ${g.model}` : ""}</div>
                        </div>
                        <button className="btn btn-icon" title="Bearbeiten"
                          onClick={() => setBearbeite({ id: g.id, name: g.name, host: g.host, note: (g as any).note || "" })}>
                          <Icon name="pencil" size={14} />
                        </button>
                        <button className="btn btn-icon btn-danger" title="Entfernen" onClick={() => setScannerLoeschen(g)}>
                          <Icon name="trash" size={14} />
                        </button>
                      </div>
                      {bearbeite?.id === g.id && (
                        <div style={{ display: "grid", gap: 8, borderTop: "1px solid var(--border)", paddingTop: 10 }}>
                          <div className="feld-zeile feld-zeile-2">
                            <Feld label="Name" icon="tag" wert={bearbeite.name}
                              setWert={(v) => setBearbeite({ ...bearbeite, name: v })} />
                            <Feld label="IP-Adresse" icon="command" wert={bearbeite.host}
                              setWert={(v) => setBearbeite({ ...bearbeite, host: v })} />
                          </div>
                          <Feld label="Notiz" icon="file-text" wert={bearbeite.note} kopierbar={false}
                            setWert={(v) => setBearbeite({ ...bearbeite, note: v })} />
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                            <button className="btn" style={{ justifyContent: "center" }} onClick={() => setBearbeite(null)}>Abbrechen</button>
                            <button className="btn btn-primary" style={{ justifyContent: "center" }} onClick={scannerSpeichern}>
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
              <div style={{ display: "grid", gap: 8 }}>
                <div className="muted" style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: ".04em" }}>Neuen Scanner hinzufügen</div>
                <button className="btn" style={{ justifyContent: "center" }} disabled={busy === "suche"} onClick={netzSuchen}>
                  <Icon name="wifi" /> {busy === "suche" ? <span>Sucht im Netzwerk<span className="scan-punkte" /></span> : "Im Netzwerk suchen"}
                </button>
                {gefunden && gefunden.length === 0 && busy !== "suche" && (
                  <div className="muted" style={{ fontSize: 13 }}>Kein Scanner gefunden – IP-Adresse unten von Hand eintragen.</div>
                )}
                {gefunden?.map((f) => (
                  <div key={f.host} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 10,
                                              background: "color-mix(in srgb, var(--accent) 7%, transparent)" }}>
                    <Icon name="printer" size={16} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13.5 }}>{f.model}</div>
                      <div className="muted" style={{ fontSize: 12 }}>{f.host}</div>
                    </div>
                    {f.eingerichtet ? (
                      <span className="muted" style={{ fontSize: 12 }}>eingerichtet</span>
                    ) : (
                      <button className="btn btn-primary" disabled={busy === "scanner"} onClick={() => scannerHinzufuegen(f.host)}>
                        <Icon name="plus" /> Hinzufügen
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Von Hand */}
              <div className="feld-zeile feld-zeile-2">
                <Feld label="IP-Adresse" icon="command" wert={neuerScanner} autoFocus={geraete.length === 0}
                  platzhalter="z. B. 192.168.1.50" setWert={setNeuerScanner} />
                <Feld label="Name (frei)" icon="tag" wert={neuerName} kopierbar={false}
                  platzhalter="z. B. Büro oben" setWert={setNeuerName} />
              </div>
              <span className="muted" style={{ fontSize: 12 }}>
                Das Gerät wird sofort geprüft (erst HTTPS, dann HTTP) – antwortet es nicht, wird es nicht gespeichert.
                Auch möglich: <code>http://IP</code> oder <code>IP:Port</code>. Ohne Namen trägt es die Modellbezeichnung.
              </span>
            </div>

            <div style={{ padding: "12px 20px", borderTop: "1px solid var(--border)", display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn" onClick={() => setScannerOffen(false)}>Schließen</button>
              <button className="btn btn-primary" disabled={!neuerScanner.trim() || busy === "scanner"} onClick={() => scannerHinzufuegen()}>
                <Icon name="check" /> {busy === "scanner" ? "Prüft…" : "Prüfen und hinzufügen"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Posteingang, nach Tagen ── */}
      <div style={{ display: "grid", gap: 10, marginTop: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ fontSize: 17, fontWeight: 700, display: "flex", alignItems: "center", gap: 8, flex: 1 }}>
            <Icon name="archive" size={18} /> Posteingang
          </div>
        </div>
        <div className="scan-segment" role="group" aria-label="Filter" style={{ maxWidth: 420 }}>
          <button aria-pressed={nurOffen} onClick={() => setNurOffen(true)}>Offen · {offeneAnzahl}</button>
          <button aria-pressed={!nurOffen} onClick={() => setNurOffen(false)}>Alle · {scans.length}</button>
        </div>
        <SearchInput value={suche} onChange={setSuche} placeholder="Name, Scanner, Notiz…" style={{ width: "100%", maxWidth: 420 }} />
      </div>

      {tage.length === 0 && (
        <div className="card muted" style={{ padding: 16, fontSize: 14 }}>
          {suche ? "Kein Scan passt zur Suche." : nurOffen ? "Nichts offen – alles zugeordnet." : "Noch nichts gescannt – oben auf „Jetzt scannen“ tippen."}
        </div>
      )}

      <div style={{ display: "grid", gap: 14 }}>
        {tage.map(([tag, liste]) => (
          <div key={tag} style={{ display: "grid", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap", padding: "0 2px" }}>
              <Icon name="calendar" size={14} />
              <span style={{ fontWeight: 600, fontSize: 13.5 }}>{tagLabel(liste[0].scannedAt)}</span>
              <span className="muted" style={{ fontSize: 12 }}>
                {liste.length} Dok. · {liste.reduce((n, s) => n + (s.pages || 1), 0)} S.
              </span>
            </div>

            {liste.map((s) => (
              <div key={s.id} className="card scan-eintrag">
                <div className="scan-eintrag-kopf">
                  {/* Vorschau der ersten Seite – ein Klick öffnet den Scan */}
                  <button type="button" onClick={() => oeffnen(s)} title="Scan öffnen"
                    style={{ border: 0, background: "transparent", padding: 0, cursor: "zoom-in", lineHeight: 0 }}>
                    {s.thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={s.thumb} alt="" style={{ width: 52, height: 68, objectFit: "cover", borderRadius: 8,
                                                         border: "1px solid var(--border)", background: "#fff" }} />
                    ) : (
                      <span style={{ width: 52, height: 68, borderRadius: 8, border: "1px solid var(--border)", display: "grid", placeItems: "center" }}>
                        <Icon name="file-text" size={20} />
                      </span>
                    )}
                  </button>
                  <div style={{ minWidth: 0 }}>
                    {umbenennen?.id === s.id ? (
                      <div style={{ display: "flex", gap: 6 }}>
                        <input className="input" autoFocus style={{ flex: 1, minWidth: 0 }}
                          value={umbenennen.titel}
                          onChange={(e) => setUmbenennen({ ...umbenennen, titel: e.target.value })}
                          onKeyDown={(e) => { if (e.key === "Enter") nameSpeichern(); if (e.key === "Escape") setUmbenennen(null); }} />
                        <button className="btn btn-icon" title="Namen speichern" onClick={nameSpeichern}><Icon name="check" /></button>
                      </div>
                    ) : (
                      <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
                        <span className="scan-titel" style={{ flex: 1 }}><Hervorheben text={s.title} suche={suche} /></span>
                        <button className="btn btn-icon" title="Namen ändern" onClick={() => setUmbenennen({ id: s.id, titel: s.title })}>
                          <Icon name="pencil" size={13} />
                        </button>
                      </div>
                    )}
                    <div className="scan-meta">
                      {uhrzeit(s.scannedAt)} · {s.pages} S. · {groesse(s.size)}
                    </div>
                    {s.scannerName && <div className="scan-meta" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.scannerName}</div>}
                  </div>
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

                {/* Bisherige Ablagen – auch Teilablagen einzelner Seiten */}
                {verlauf(s).map((z, i) => (
                  <div key={i} className="muted" style={{ fontSize: 12.5, display: "flex", alignItems: "center", gap: 6 }}>
                    <Icon name="check" size={13} />
                    {z.seiten && z.von && z.seiten.length < z.von
                      ? `Seite${z.seiten.length === 1 ? "" : "n"} ${z.seiten.join(", ")} von ${z.von} → `
                      : "zugeordnet: "}
                    {z.ziel === "betriebsakte" ? `Betriebsakte ${z.name}` : z.name}
                  </div>
                ))}
                {s.status === "zugeordnet" && verlauf(s).length === 0 && (
                  <div className="muted" style={{ fontSize: 12.5, display: "flex", alignItems: "center", gap: 6 }}>
                    <Icon name="check" size={13} />
                    zugeordnet: {s.orgId
                      ? `Betriebsakte ${[...mandanten, ...akten].find((m) => m.id === s.orgId)?.name || ""}`
                      : mitarbeiter.find((m) => m.id === s.employeeId)?.name || "Mitarbeiter"}
                    {s.groupId ? ` · ${gruppen.find((g) => g.id === s.groupId)?.name || "Rubrik"}` : ""}
                  </div>
                )}

                <div className="scan-aktionen">
                  <button className="btn" title="Öffnen" disabled={busy === "open" + s.id} onClick={() => oeffnen(s)}>
                    <Icon name="eye" /> <span className="btn-label">Öffnen</span>
                  </button>
                  <button className="btn" title="Herunterladen oder Speichern unter – ganz oder einzelne Seiten"
                    onClick={() => setAusgabe({ scan: s, modus: "speichern" })}>
                    <Icon name="download" /> <span className="btn-label">Herunterladen</span>
                  </button>
                  <button className="btn" title="Drucken – ganz oder einzelne Seiten"
                    onClick={() => setAusgabe({ scan: s, modus: "drucken" })}>
                    <Icon name="printer" /> <span className="btn-label">Drucken</span>
                  </button>
                  <button className="btn btn-icon btn-danger" title="Verwerfen" onClick={() => setLoeschen(s)}>
                    <Icon name="trash" />
                  </button>
                  {s.status === "offen" && (
                    <button className="btn btn-primary scan-zuordnen" onClick={() => setZuordnen(s)}
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
