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
import { DateiSymbol } from "@/components/MitarbeiterAkte";
import { useLive } from "@/lib/live";
import { useSeitenZustand } from "@/lib/seitenzustand";
import ScanAnimation from "@/components/ScanAnimation";
import { useEinzug } from "@/lib/einzug";

/**
 * Betriebsakte: Dokumente je **Mandant** oder je **eigener Akte** (frei benannt, z. B. „Fuhrpark"),
 * gegliedert nach Rubriken (z. B. Finanzamt,
 * Versicherungen, Verträge) – wahlweise als **Zeitstrahl**, der den Verlauf über die Jahre zeigt.
 *
 * Aufbau wie die Mitarbeiterakte: Rubriken sind dieselben (`DocumentGroup`), lassen sich hier
 * anlegen und wirken überall. Mehrfach abgelegte Schriftstücke derselben Art bilden Stände
 * (Version 1, 2, …) – ältere bleiben erhalten.
 */

type Dokument = {
  id: string; orgId: string; groupId: string; title: string; fileName: string; mimeType: string;
  size: number; version: number; docKey: string; documentDate: string | null; note: string; createdAt: string;
};

type Gruppe = { id: string; name: string };

function groesse(b: number) {
  if (!b) return "";
  return b < 1024 * 1024 ? `${Math.round(b / 1024)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`;
}

const datum = (v?: string | null) =>
  v ? new Date(v).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }) : "";

const monatsName = (v: string) =>
  new Date(v).toLocaleDateString("de-DE", { month: "long", year: "numeric" });

async function ladeDatei(pfad: string): Promise<{ blob: Blob; name: string }> {
  const token = getToken();
  const res = await fetch(pfad, { headers: token ? { Authorization: `Bearer ${token}` } : {}, cache: "no-store" });
  if (!res.ok) throw new Error(`Datei konnte nicht geladen werden (HTTP ${res.status})`);
  return { blob: await res.blob(), name: decodeURIComponent(res.headers.get("X-Dateiname") || "dokument.pdf") };
}

function speichereBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
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

export default function BetriebsaktePage() {
  // Mandant, Ansicht und Suche bleiben erhalten – auch nach einem Abstecher in ein Dokument
  const [seite, setSeite] = useSeitenZustand("betriebsakte", { ansicht: "rubriken", q: "", org: "" });
  const [mandanten, setMandanten] = useState<any[]>([]);
  // Eigene Akten – stehen in der Auswahl neben den Mandanten
  const [akten, setAkten] = useState<any[]>([]);
  const [akteForm, setAkteForm] = useState<{ id: string; name: string; note: string } | null>(null);
  const [akteLoeschen, setAkteLoeschen] = useState<any | null>(null);
  const orgId = seite.org;
  const setOrgId = (v: string) => setSeite({ org: v });
  const [gruppen, setGruppen] = useState<Gruppe[]>([]);
  const [dokumente, setDokumente] = useState<Dokument[]>([]);
  const ansicht = seite.ansicht as "rubriken" | "zeitstrahl";
  const setAnsicht = (v: "rubriken" | "zeitstrahl") => setSeite({ ansicht: v });
  const suche = seite.q;
  const setSuche = (v: string) => setSeite({ q: v });
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState("");
  const [zu, setZu] = useState<Record<string, boolean>>({});
  const [bearbeiten, setBearbeiten] = useState<Dokument | null>(null);
  const [loeschen, setLoeschen] = useState<Dokument | null>(null);
  const [viewer, setViewer] = useState<{ url: string; titel: string } | null>(null);
  const [bild, setBild] = useState<{ url: string; titel: string } | null>(null);
  const [zielGruppe, setZielGruppe] = useState("");
  // Scanner für „direkt hier einscannen" – dieselbe Geräteliste wie auf der Scan-Seite
  const [geraete, setGeraete] = useState<any[]>([]);
  const [geraetId, setGeraetId] = useState("");
  const [scanQuelle, setScanQuelle] = useState<"Platen" | "Feeder">("Platen");
  // Papier im Einzug erkannt → Einzug vorwählen (Flachbett bleibt per Knopf wählbar)
  const { papier, problem: einzugFehler } = useEinzug(geraetId, !!orgId && busy !== "scan", () => setScanQuelle("Feeder"), () => setScanQuelle("Platen"));
  // Vorlagen (z. B. SEPA-Lastschriftmandat) – werden mit den Firmendaten vorausgefüllt
  const [vorlagen, setVorlagen] = useState<any[]>([]);
  const [vorlagenOffen, setVorlagenOffen] = useState(false);

  const ladeDokumente = useCallback(async (id: string) => {
    if (!id) { setDokumente([]); return; }
    try {
      const d = await api(`/api/organization-documents?orgId=${id}`);
      setDokumente(d.data || []);
    } catch (e: any) { setMsg("Dokumente: " + e.message); }
  }, []);

  const ladeGruppen = useCallback(async () => {
    try {
      const d = await api("/api/doc-groups");
      setGruppen(d.data || []);
    } catch (e: any) { setMsg("Rubriken: " + e.message); }
  }, []);

  useEffect(() => {
    api("/api/organizations").then((d) => {
      setMandanten(d.data || []);
      // Ohne gemerkten Mandanten: bei genau einem Mandanten diesen gleich wählen
      if (!seite.org && d.data?.length === 1) setOrgId(d.data[0].id);
    }).catch(() => {});
    ladeGruppen();
    api("/api/scanners").then((d) => {
      setGeraete(d.data || []);
      if (d.data?.length) setGeraetId(d.data[0].id);
    }).catch(() => {});
    api("/api/doc-templates").then((d) => setVorlagen(d.data || [])).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ladeGruppen]);

  useEffect(() => { ladeDokumente(orgId); }, [orgId, ladeDokumente]);
  useLive(["OrganizationDocument"], () => ladeDokumente(orgId));
  useLive(["DocumentGroup"], ladeGruppen);

  const ladeAkten = useCallback(async () => {
    try {
      const d = await api("/api/dossiers");
      setAkten(d.data || []);
    } catch (e: any) { setMsg("Akten: " + e.message); }
  }, []);
  useEffect(() => { ladeAkten(); }, [ladeAkten]);
  useLive(["Dossier", "OrganizationDocument"], ladeAkten);

  /** Akte anlegen bzw. umbenennen. */
  async function akteSpeichern() {
    if (!akteForm) return;
    const name = akteForm.name.trim();
    if (!name) { setMsg("Bitte einen Namen für die Akte eingeben."); return; }
    try {
      if (akteForm.id) {
        await api(`/api/dossiers/${akteForm.id}`, { method: "PATCH", body: JSON.stringify({ name, note: akteForm.note }) });
        setMsg(`Akte „${name}" gespeichert.`);
      } else {
        const a = await api("/api/dossiers", { method: "POST", body: JSON.stringify({ name, note: akteForm.note }) });
        setOrgId(a.id);
        setMsg(`Akte „${a.name}" angelegt – hier kannst du jetzt Dokumente ablegen.`);
      }
      setAkteForm(null);
      ladeAkten();
    } catch (e: any) { setMsg("Fehler: " + e.message); }
  }

  /** Neue Akte direkt aus der Auswahl heraus (eingetippter Name). */
  async function akteAusAuswahl(name: string) {
    try {
      const a = await api("/api/dossiers", { method: "POST", body: JSON.stringify({ name }) });
      setMsg(`Akte „${a.name}" angelegt.`);
      ladeAkten();
      return a.id as string;
    } catch (e: any) { setMsg("Fehler: " + e.message); }
  }

  async function akteEntfernen() {
    if (!akteLoeschen) return;
    try {
      await api(`/api/dossiers/${akteLoeschen.id}`, { method: "DELETE" });
      setMsg(`Akte „${akteLoeschen.name}" entfernt.`);
      if (orgId === akteLoeschen.id) setOrgId("");
      ladeAkten();
    } catch (e: any) { setMsg("Fehler: " + e.message); }
    finally { setAkteLoeschen(null); }
  }

  const mandant = mandanten.find((m) => m.id === orgId);
  const akte = akten.find((a) => a.id === orgId);
  const ablageName = mandant?.name || akte?.name || "";

  /** Neue Rubrik direkt aus der Auswahl heraus anlegen. */
  async function rubrikAnlegen(name: string) {
    try {
      const g = await api("/api/doc-groups", { method: "POST", body: JSON.stringify({ name }) });
      setMsg(`Rubrik „${g.name}" angelegt.`);
      ladeGruppen();
      return g.id as string;
    } catch (e: any) { setMsg("Fehler: " + e.message); }
  }

  async function hochladen(f: File, groupId: string) {
    if (!orgId) { setMsg("Bitte zuerst einen Mandanten oder eine Akte wählen."); return; }
    setBusy("upload");
    try {
      const base64 = await dateiZuBase64(f);
      const d = await api("/api/organization-documents", {
        method: "POST",
        body: JSON.stringify({
          orgId, groupId, base64, fileName: f.name,
          title: f.name.replace(/\.[^.]+$/, ""),
        }),
      });
      setMsg(`Abgelegt: ${d.fileName}${d.version > 1 ? ` (Version ${d.version})` : ""}.`);
      ladeDokumente(orgId);
    } catch (e: any) { setMsg("Fehler: " + e.message); }
    finally { setBusy(""); }
  }

  /** Dokument aus einer Vorlage erzeugen – vorausgefüllt mit den Daten des Mandanten. */
  async function ausVorlage(templateId: string, name: string) {
    if (!orgId) { setMsg("Bitte zuerst einen Mandanten oder eine Akte wählen."); return; }
    setBusy("vorlage");
    try {
      const d = await api("/api/organization-documents", {
        method: "POST",
        body: JSON.stringify({ orgId, templateId, groupId: zielGruppe, fill: true }),
      });
      setMsg(`${name} ${akte ? "" : "vorausgefüllt "}abgelegt${d.version > 1 ? ` (Version ${d.version})` : ""} – zum Ausfüllen öffnen.`);
      setVorlagenOffen(false);
      ladeDokumente(orgId);
    } catch (e: any) { setMsg("Fehler: " + e.message); }
    finally { setBusy(""); }
  }

  /** Neues Formular als Vorlage hinterlegen (ausfüllbares PDF). */
  async function vorlageHochladen(f: File) {
    setBusy("vorlage-upload");
    try {
      const base64 = await dateiZuBase64(f);
      const t = await api("/api/doc-templates", {
        method: "POST",
        body: JSON.stringify({ name: f.name.replace(/\.pdf$/i, "").replace(/[_-]+/g, " "), fileName: f.name, base64 }),
      });
      setMsg(`Vorlage ${t.name} gespeichert – sie steht jetzt für jeden Mandanten bereit.`);
      api("/api/doc-templates").then((d) => setVorlagen(d.data || [])).catch(() => {});
    } catch (e: any) { setMsg("Fehler: " + e.message); }
    finally { setBusy(""); }
  }

  /**
   * Direkt in die Betriebsakte scannen: Das Ergebnis wandert **ohne Umweg über den
   * Posteingang** in die gewählte Rubrik des Mandanten.
   */
  async function scannen(groupId: string, rubrikName: string) {
    if (!orgId) { setMsg("Bitte zuerst einen Mandanten oder eine Akte wählen."); return; }
    if (!geraetId) { setMsg("Kein Scanner eingerichtet – auf der Seite Scannen lässt sich einer hinzufügen."); return; }
    setBusy("scan");
    setMsg(`Scannt für ${rubrikName || "die Akte"}…`);
    try {
      const d = await api(`/api/scanners/${geraetId}/scan`, {
        method: "POST",
        body: JSON.stringify({
          orgId, groupId,
          source: scanQuelle,
          title: `${rubrikName || "Dokument"} ${new Date().toLocaleDateString("de-DE")}`,
        }),
      });
      setMsg(`Gescannt und abgelegt: ${d.fileName}${d.version > 1 ? ` (Version ${d.version})` : ""}.`);
      ladeDokumente(orgId);
    } catch (e: any) { setMsg("Fehler: " + e.message); }
    finally { setBusy(""); }
  }

  async function oeffnen(d: Dokument, speichern: boolean) {
    setBusy("dok" + d.id);
    try {
      const { blob, name } = await ladeDatei(`/api/organization-documents/${d.id}/file`);
      const titel = `${d.title} · v${d.version} · ${name}`;
      if (speichern) speichereBlob(blob, name);
      else if (String(d.mimeType || "").startsWith("image/")) setBild({ url: URL.createObjectURL(blob), titel });
      else if (d.mimeType && d.mimeType !== "application/pdf") { speichereBlob(blob, name); setMsg(`${name} heruntergeladen – dieser Dateityp lässt sich nicht anzeigen.`); }
      else setViewer({ url: URL.createObjectURL(blob), titel });
    } catch (e: any) { setMsg("Fehler: " + e.message); }
    finally { setBusy(""); }
  }

  async function speichernBearbeitet() {
    if (!bearbeiten) return;
    try {
      await api(`/api/organization-documents/${bearbeiten.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: bearbeiten.title, note: bearbeiten.note,
          groupId: bearbeiten.groupId, documentDate: bearbeiten.documentDate,
        }),
      });
      setMsg("Gespeichert.");
      setBearbeiten(null);
      ladeDokumente(orgId);
    } catch (e: any) { setMsg("Fehler: " + e.message); }
  }

  async function entfernen() {
    if (!loeschen) return;
    try {
      await api(`/api/organization-documents/${loeschen.id}`, { method: "DELETE" });
      setMsg("Dokument entfernt.");
      ladeDokumente(orgId);
    } catch (e: any) { setMsg("Fehler: " + e.message); }
    finally { setLoeschen(null); }
  }

  // Suche über Titel, Dateiname und Notiz
  const gefiltert = useMemo(() => {
    const teile = sucheBegriffe(suche).map((t) => t.toLowerCase());
    if (!teile.length) return dokumente;
    return dokumente.filter((d) => {
      const text = [d.title, d.fileName, d.note].join(" ").toLowerCase();
      return teile.every((t) => text.includes(t));
    });
  }, [dokumente, suche]);

  // Ansicht „Rubriken": je Rubrik ein Abschnitt, Unzugeordnetes am Ende
  const abschnitte = useMemo(() => {
    const bekannt = new Set(gruppen.map((g) => g.id));
    const liste = gruppen.map((g) => ({ id: g.id, name: g.name, echt: true, dokumente: gefiltert.filter((d) => d.groupId === g.id) }));
    const rest = gefiltert.filter((d) => !d.groupId || !bekannt.has(d.groupId));
    if (rest.length) liste.push({ id: "__ohne__", name: "Ohne Zuordnung", echt: false, dokumente: rest });
    return liste.filter((a) => a.dokumente.length > 0 || a.echt);
  }, [gruppen, gefiltert]);

  // Ansicht „Zeitstrahl": nach Monat gruppiert, neueste zuerst
  const zeitstrahl = useMemo(() => {
    const map = new Map<string, Dokument[]>();
    for (const d of gefiltert) {
      const zeit = d.documentDate || d.createdAt;
      const schluessel = new Date(zeit).toISOString().slice(0, 7);
      if (!map.has(schluessel)) map.set(schluessel, []);
      map.get(schluessel)!.push(d);
    }
    return [...map.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([monat, liste]) => ({
        monat,
        liste: liste.sort((a, b) =>
          String(b.documentDate || b.createdAt).localeCompare(String(a.documentDate || a.createdAt))),
      }));
  }, [gefiltert]);

  const rubrikName = (id: string) => gruppen.find((g) => g.id === id)?.name || "";

  const meldungFehler = /^(Fehler|Dokumente:|Rubriken:|Akten:|Bitte|Kein Scanner)/.test(msg);

  return (
    <div>
      <div className="rv-sticky-header" style={{ display: "grid", gap: 10 }}>
        <div className="abl-kopf" style={{ marginBottom: 0 }}>
          <div className="abl-kopf-text">
            <h1 className="seiten-titel">
              <span className="titel-icon"><Icon name="building" size={20} /></span> Betriebsakte
              {orgId && <span className="anzahl">{dokumente.length}</span>}
            </h1>
            <div className="seiten-untertitel">
              {ablageName
                ? <>Ablage für <b style={{ color: "var(--fg)" }}>{ablageName}</b>{akte ? " (eigene Akte)" : ""} – nach Rubriken oder als Zeitstrahl.</>
                : "Firmendokumente je Mandant oder eigener Akte ablegen, scannen und wiederfinden."}
            </div>
          </div>
          <div className="abl-kopf-aktionen">
            <div className="kt-segment" role="tablist" aria-label="Ansicht">
              {([["rubriken", "Rubriken", "folder"], ["zeitstrahl", "Zeitstrahl", "history"]] as const).map(([wert, text, icon]) => (
                <button key={wert} role="tab" aria-selected={ansicht === wert} className={ansicht === wert ? "an" : ""}
                  onClick={() => setAnsicht(wert)}>
                  <Icon name={icon} size={14} /> {text}
                </button>
              ))}
            </div>
          </div>
        </div>
        <SearchInput value={suche} onChange={setSuche} placeholder="Titel, Dateiname, Notiz…" style={{ width: "100%", maxWidth: 380 }} />
      </div>

      {msg && (
        <div className={`hinweis-leiste${meldungFehler ? " fehler" : ""}`}>
          <Icon name={meldungFehler ? "alert" : "check"} size={16} />
          <span style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>{msg}</span>
          <button className="btn btn-icon btn-flach" aria-label="Meldung schließen" onClick={() => setMsg("")}><Icon name="x" size={14} /></button>
        </div>
      )}

      {/* ── Mandant und Ablage ── */}
      <div className="card abl-panel" style={{ marginBottom: 12 }}>
        <div className="feld-zeile feld-zeile-2">
          <label className="abl-label">
            <span><Icon name="building" size={13} /> Mandant oder Akte</span>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <SuchSelect
                  value={orgId}
                  onChange={setOrgId}
                  platzhalter="— Mandant oder Akte wählen —"
                  suchePlatzhalter="Suchen oder neue Akte eintippen…"
                  options={[
                    ...mandanten.map((m) => ({ value: m.id, label: m.name, hint: ["Mandant", [m.zip, m.city].filter(Boolean).join(" ")].filter(Boolean).join(" · ") })),
                    ...akten.map((a) => ({ value: a.id, label: a.name, hint: `eigene Akte · ${a.dokumente || 0} Dok.` })),
                  ]}
                  erlaubeNeu
                  neuText="als neue Akte anlegen"
                  onNeu={akteAusAuswahl}
                />
              </div>
              {akte && (
                <>
                  <button type="button" className="btn btn-icon" title="Akte umbenennen / Notiz" aria-label="Akte bearbeiten"
                    onClick={() => setAkteForm({ id: akte.id, name: akte.name, note: akte.note || "" })}>
                    <Icon name="pencil" size={14} />
                  </button>
                  <button type="button" className="btn btn-icon btn-danger" title="Akte entfernen (nur wenn leer)" aria-label="Akte entfernen"
                    onClick={() => setAkteLoeschen(akte)}>
                    <Icon name="trash" size={14} />
                  </button>
                </>
              )}
              <button type="button" className="btn" title="Eigene Akte anlegen, z. B. „Fuhrpark“ oder „Immobilie Hauptstraße“"
                onClick={() => setAkteForm({ id: "", name: "", note: "" })}>
                <Icon name="plus" size={14} /> <span className="btn-label">Neue Akte</span>
              </button>
            </div>
            {akte?.note && <span className="muted" style={{ fontSize: 12 }}>{akte.note}</span>}
          </label>
          <label className="abl-label">
            <span><Icon name="tag" size={13} /> Rubrik für neue Ablagen</span>
            <SuchSelect
              value={zielGruppe}
              onChange={setZielGruppe}
              platzhalter="— ohne Zuordnung —"
              suchePlatzhalter="Rubrik suchen oder neue eintippen…"
              options={gruppen.map((g) => ({ value: g.id, label: g.name }))}
              erlaubeNeu
              neuText="als neue Rubrik anlegen"
              onNeu={rubrikAnlegen}
            />
          </label>
        </div>
        <div className="abl-werkzeuge">
          <label className="btn btn-primary" style={{ cursor: orgId ? "pointer" : "default", opacity: orgId ? 1 : .5 }}>
            {busy === "upload" ? <span className="speichern-dreh" /> : <Icon name="upload" />} {busy === "upload" ? "Lädt…" : "Datei ablegen"}
            <input type="file" style={{ display: "none" }} disabled={!orgId}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) hochladen(f, zielGruppe); e.target.value = ""; }} />
          </label>
          <label className="btn" style={{ cursor: orgId ? "pointer" : "default", opacity: orgId ? 1 : .5 }}>
            <Icon name="image" /> Foto / Bild
            <input type="file" accept="image/*" capture="environment" style={{ display: "none" }} disabled={!orgId}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) hochladen(f, zielGruppe); e.target.value = ""; }} />
          </label>
          <button className="btn" disabled={!orgId} onClick={() => setVorlagenOffen(true)}
            title="Formular aus einer Vorlage erzeugen – mit den Firmendaten vorausgefüllt">
            <Icon name="file-text" /> Aus Vorlage
          </button>
          <span className="abl-trenner" />
          <button className="btn" disabled={!orgId || !geraetId || busy === "scan"}
            onClick={() => scannen(zielGruppe, gruppen.find((g) => g.id === zielGruppe)?.name || "")}
            title={geraetId ? "Vorlage einlesen und hier ablegen" : "Kein Scanner eingerichtet"}>
            <Icon name="printer" /> {busy === "scan" ? "Scannt…" : "Scannen"}
          </button>
          {geraete.length > 0 && (
            <div className="kt-segment" role="radiogroup" aria-label="Scan-Quelle" title="Zwischen Flachbett und Einzug wechseln">
              {([["Platen", "Flachbett"], ["Feeder", "Einzug"]] as const).map(([wert, text]) => (
                <button key={wert} role="radio" aria-checked={scanQuelle === wert} className={scanQuelle === wert ? "an" : ""}
                  onClick={() => setScanQuelle(wert)}>
                  {text}
                </button>
              ))}
            </div>
          )}
          {geraete.length > 0 && busy !== "scan" && (papier || einzugFehler || (papier === false && scanQuelle === "Feeder")) && (
            <span className={`abl-status ${einzugFehler || !papier ? "warn" : "ok"}`}>
              <Icon name={einzugFehler || !papier ? "alert" : "file-text"} size={14} />
              {einzugFehler || (papier
                ? (scanQuelle === "Feeder" ? "Papier im Einzug erkannt" : "Papier im Einzug – es wird trotzdem vom Flachbett gescannt")
                : "Einzug ist leer – Papier einlegen oder Flachbett wählen")}
            </span>
          )}
          {!ablageName && (
            <span className="abl-status">
              <Icon name="alert" size={14} /> Erst einen Mandanten oder eine Akte wählen
            </span>
          )}
        </div>
      </div>

      {/* ── Vorlagen: Formular erzeugen oder neue Vorlage hinterlegen ── */}
      {vorlagenOffen && (
        <div className="kt-huelle" style={{ zIndex: 60 }} onClick={() => setVorlagenOffen(false)}>
          <div onClick={(e) => e.stopPropagation()} className="card dm-fenster kt-fenster" style={{ width: 560 }}>
            <div className="abl-fenster-kopf">
              <span className="abl-ic"><Icon name="file-text" size={17} /></span>
              <h2>Vorlage verwenden<small>Formular für {ablageName || "die Akte"} erzeugen</small></h2>
              <button className="btn btn-icon btn-flach" aria-label="Schließen" onClick={() => setVorlagenOffen(false)}><Icon name="x" /></button>
            </div>
            <div className="kt-inhalt">
              {vorlagen.length === 0 && (
                <div className="leer-zustand" style={{ padding: "28px 12px" }}>
                  <div className="leer-icon"><Icon name="file-text" size={28} /></div>
                  <div style={{ fontWeight: 650, color: "var(--fg)", fontSize: 15 }}>Noch keine Vorlage</div>
                  <div style={{ fontSize: 13.5, lineHeight: 1.5, maxWidth: 380 }}>
                    Lade unten ein ausfüllbares PDF hoch – etwa das
                    SEPA-Lastschriftmandat. Die Formularfelder werden automatisch erkannt.
                  </div>
                </div>
              )}
              <div className="abl-fenster-liste">
                {vorlagen.map((v) => {
                  const felder = (() => { try { return JSON.parse(v.formFields || "[]").length; } catch { return 0; } })();
                  return (
                    <div key={v.id} className="abl-zeile einzeln drei">
                      <DateiSymbol mime="application/pdf" />
                      <div className="abl-haupt">
                        <div className="abl-titel">
                          <b>{v.name}</b>
                          <span className="abzeichen blau">v{v.version}</span>
                        </div>
                        <div className="abl-meta">
                          <span><Icon name="tasks" size={12} /> {felder ? `${felder} Formularfelder` : "keine Formularfelder"}</span>
                        </div>
                      </div>
                      <button className="btn btn-primary" disabled={busy === "vorlage"}
                        onClick={() => ausVorlage(v.id, v.name)}>
                        {busy === "vorlage" ? <span className="speichern-dreh" /> : <Icon name="save" />} {busy === "vorlage" ? "Legt ab…" : akte ? "Ablegen" : "Vorausgefüllt ablegen"}
                      </button>
                    </div>
                  );
                })}
              </div>
              {akte ? (
                <div className="abl-hinweis">
                  <Icon name="alert" size={15} />
                  <span>Eine eigene Akte hat keine Firmendaten – das Formular wird <b>leer</b> abgelegt und bleibt ausfüllbar.</span>
                </div>
              ) : (
                <div className="abl-hinweis">
                  <Icon name="check" size={15} />
                  <span>
                    Vorausgefüllt werden Firmenname, Anschrift, Steuernummer, USt-IdNr. sowie Ort und Datum.
                    <b> Bankverbindung bleibt leer</b> – IBAN und Kontoinhaber trägst du im geöffneten PDF selbst ein;
                    das Dokument bleibt ausfüllbar.
                  </span>
                </div>
              )}
            </div>
            <div className="kt-fuss">
              <button className="btn" onClick={() => setVorlagenOffen(false)}><Icon name="x" /> Schließen</button>
              <label className="btn" style={{ cursor: "pointer" }} title="Neues Formular als Vorlage hinterlegen">
                {busy === "vorlage-upload" ? <span className="speichern-dreh" style={{ borderColor: "var(--border)", borderTopColor: "var(--accent)" }} /> : <Icon name="upload" />} Neue Vorlage
                <input type="file" accept="application/pdf" style={{ display: "none" }}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) vorlageHochladen(f); e.target.value = ""; }} />
              </label>
            </div>
          </div>
        </div>
      )}

      {busy === "scan" && (
        <div className="card" style={{ padding: 14, marginBottom: 12 }}>
          <ScanAnimation text={scanQuelle === "Feeder" ? "Zieht die Seiten ein" : "Scannt die Vorlage"}
            untertext="Das Ergebnis landet gleich hier in der Akte." />
        </div>
      )}

      {!orgId && (
        <div className="card">
          <div className="leer-zustand">
            <div className="leer-icon"><Icon name="building" size={28} /></div>
            <div style={{ fontWeight: 650, color: "var(--fg)", fontSize: 15 }}>Mandant oder Akte wählen</div>
            <div style={{ fontSize: 13.5, lineHeight: 1.5, maxWidth: 440 }}>
              Bitte oben einen Mandanten oder eine eigene Akte wählen – dann erscheinen hier die Dokumente.
              Eigene Akten (z. B. „Fuhrpark", „Immobilie Hauptstraße") legst du über <b>Neue Akte</b> an.
            </div>
            <button className="btn btn-primary" onClick={() => setAkteForm({ id: "", name: "", note: "" })}>
              <Icon name="plus" /> Neue Akte
            </button>
          </div>
        </div>
      )}

      {/* ── Ansicht: Rubriken ── */}
      {orgId && ansicht === "rubriken" && (
        <div style={{ display: "grid", gap: 12 }}>
          {abschnitte.map((a) => {
            const zugeklappt = zu[a.id];
            return (
              <div key={a.id} className={`abl-rubrik${zugeklappt ? "" : " offen"}${a.echt ? "" : " ohne"}`}>
                <div className="abl-rubrik-kopf akte-kopf">
                  <button className="abl-rubrik-schalter" title={zugeklappt ? "Aufklappen" : "Zuklappen"} aria-expanded={!zugeklappt}
                    onClick={() => setZu((z) => ({ ...z, [a.id]: !z[a.id] }))}>
                    <span className="abl-pfeil"><Icon name="chevron-down" /></span>
                    <span className="abl-rubrik-ic"><Icon name={a.echt ? "folder" : "archive"} size={16} /></span>
                    <span style={{ display: "grid", minWidth: 0 }}>
                      <span className="abl-rubrik-name">{a.name}</span>
                      <span className="abl-rubrik-zahl">{a.dokumente.length} Dokument{a.dokumente.length === 1 ? "" : "e"}</span>
                    </span>
                  </button>
                  <div className="abl-rubrik-werkzeuge">
                    <label className="btn btn-icon" style={{ cursor: "pointer" }} title="Datei in diese Rubrik ablegen" aria-label="Datei ablegen">
                      <Icon name="upload" />
                      <input type="file" style={{ display: "none" }}
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) hochladen(f, a.echt ? a.id : ""); e.target.value = ""; }} />
                    </label>
                    {/* Direkt in diese Rubrik einscannen – ohne Umweg über den Posteingang */}
                    <button className="btn btn-icon" disabled={!geraetId || busy === "scan"}
                      title={geraetId ? `In „${a.name}" scannen` : "Kein Scanner eingerichtet"} aria-label="In diese Rubrik scannen"
                      onClick={() => scannen(a.echt ? a.id : "", a.name)}>
                      <Icon name="printer" />
                    </button>
                  </div>
                </div>

                {!zugeklappt && a.dokumente.length === 0 && (
                  <div className="abl-rubrik-leer"><Icon name="folder" size={15} /> Noch nichts abgelegt – oben über die Symbole ablegen oder scannen.</div>
                )}
                {!zugeklappt && a.dokumente.length > 0 && (
                  <div className="abl-liste">
                    {a.dokumente.map((d) => (
                      <Zeile key={d.id} d={d} suche={suche} busy={busy}
                        onOeffnen={oeffnen} onBearbeiten={setBearbeiten} onLoeschen={setLoeschen} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Ansicht: Zeitstrahl ── */}
      {orgId && ansicht === "zeitstrahl" && (
        <div className="card">
          {zeitstrahl.length === 0 && (
            <div className="leer-zustand">
              <div className="leer-icon"><Icon name="history" size={28} /></div>
              <div style={{ fontWeight: 650, color: "var(--fg)", fontSize: 15 }}>Noch nichts abgelegt</div>
              <div style={{ fontSize: 13.5 }}>Abgelegte Dokumente erscheinen hier nach Monat sortiert.</div>
            </div>
          )}
          {zeitstrahl.length > 0 && (
            <div className="abl-zeit">
              {zeitstrahl.map(({ monat, liste }) => (
                <div key={monat}>
                  <div className="abl-zeit-monat">
                    <span className="abl-rubrik-ic" style={{ background: "var(--accent-weich)", color: "var(--accent)" }}><Icon name="calendar" size={15} /></span>
                    <b>{monatsName(monat + "-01")}</b>
                    <span className="abzeichen">{liste.length} Eintrag{liste.length === 1 ? "" : "e"}</span>
                  </div>
                  {/* Zeitstrahl: senkrechte Linie mit Punkten je Dokument */}
                  <div className="abl-zeit-spur">
                    {liste.map((d) => (
                      <div key={d.id} className="abl-zeit-punkt">
                        <Zeile d={d} suche={suche} busy={busy} rubrik={rubrikName(d.groupId)} einzeln
                          onOeffnen={oeffnen} onBearbeiten={setBearbeiten} onLoeschen={setLoeschen} />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Bearbeiten ── */}
      {bearbeiten && (
        <div className="kt-huelle" style={{ zIndex: 60 }} onClick={() => setBearbeiten(null)}>
          <div onClick={(e) => e.stopPropagation()} className="card dm-fenster kt-fenster" style={{ width: 520 }}>
            <div className="abl-fenster-kopf">
              <span className="abl-ic"><Icon name="pencil" size={17} /></span>
              <h2>Dokument bearbeiten<small>Titel, Datum, Rubrik und Notiz</small></h2>
              <button className="btn btn-icon btn-flach" aria-label="Schließen" onClick={() => setBearbeiten(null)}><Icon name="x" /></button>
            </div>
            <div className="kt-inhalt">
              <Feld label="Titel" icon="file-text" wert={bearbeiten.title}
                setWert={(v) => setBearbeiten({ ...bearbeiten, title: v })} />
              <label className="abl-label">
                <span><Icon name="calendar" size={13} /> Datum des Schriftstücks</span>
                <input className="input" type="date"
                  value={bearbeiten.documentDate ? String(bearbeiten.documentDate).slice(0, 10) : ""}
                  onChange={(e) => setBearbeiten({ ...bearbeiten, documentDate: e.target.value ? new Date(e.target.value).toISOString() : null })} />
                <span className="muted" style={{ fontSize: 12 }}>Bestimmt die Einordnung im Zeitstrahl.</span>
              </label>
              <label className="abl-label">
                <span><Icon name="tag" size={13} /> Rubrik</span>
                <SuchSelect
                  value={bearbeiten.groupId}
                  onChange={(v) => setBearbeiten({ ...bearbeiten, groupId: v })}
                  platzhalter="— ohne Zuordnung —"
                  suchePlatzhalter="Rubrik suchen oder neue eintippen…"
                  options={gruppen.map((g) => ({ value: g.id, label: g.name }))}
                  erlaubeNeu
                  neuText="als neue Rubrik anlegen"
                  onNeu={rubrikAnlegen}
                />
              </label>
              <label className="abl-label">
                <span><Icon name="pencil" size={13} /> Notiz</span>
                <textarea className="input" rows={3} value={bearbeiten.note || ""}
                  onChange={(e) => setBearbeiten({ ...bearbeiten, note: e.target.value })} />
              </label>
            </div>
            <div className="kt-fuss">
              <button className="btn" onClick={() => setBearbeiten(null)}><Icon name="x" /> Abbrechen</button>
              <button className="btn btn-primary" onClick={speichernBearbeitet}><Icon name="save" /> Speichern</button>
            </div>
          </div>
        </div>
      )}

      {bild && (
        <div className="bild-fenster" onClick={() => { URL.revokeObjectURL(bild.url); setBild(null); }}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.75)", display: "grid", gridTemplateRows: "auto 1fr", zIndex: 70 }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "var(--bg)", borderBottom: "1px solid var(--border)" }}>
            <span style={{ fontSize: 14, fontWeight: 600, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{bild.titel}</span>
            <button className="btn btn-icon" aria-label="Schließen" onClick={() => { URL.revokeObjectURL(bild.url); setBild(null); }}><Icon name="x" /></button>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={bild.url} alt={bild.titel} style={{ width: "100%", height: "100%", objectFit: "contain", padding: 12 }} />
        </div>
      )}

      {viewer && (
        <PdfViewerModal url={viewer.url} titel={viewer.titel}
          onClose={() => { URL.revokeObjectURL(viewer.url); setViewer(null); }} />
      )}

      {/* ── Eigene Akte anlegen / bearbeiten ── */}
      {akteForm && (
        <div className="kt-huelle" style={{ zIndex: 60 }} onClick={() => setAkteForm(null)}>
          <div onClick={(e) => e.stopPropagation()} className="card dm-fenster kt-fenster" style={{ width: 480 }}>
            <div className="abl-fenster-kopf">
              <span className="abl-ic"><Icon name="folder" size={17} /></span>
              <h2>{akteForm.id ? "Akte bearbeiten" : "Neue Akte"}<small>Eigene Ablage neben den Mandanten</small></h2>
              <button className="btn btn-icon btn-flach" aria-label="Schließen" onClick={() => setAkteForm(null)}><Icon name="x" /></button>
            </div>
            <div className="kt-inhalt">
              <Feld label="Name der Akte" icon="folder" wert={akteForm.name} autoFocus
                setWert={(v) => setAkteForm({ ...akteForm, name: v })} platzhalter="z. B. Fuhrpark, Immobilie Hauptstraße" />
              <Feld label="Notiz (optional)" icon="pencil" wert={akteForm.note}
                setWert={(v) => setAkteForm({ ...akteForm, note: v })} platzhalter="Wofür ist die Akte?" />
              <div className="abl-hinweis">
                <Icon name="alert" size={15} />
                <span>
                  Eigene Akten stehen in der Auswahl neben den Mandanten und haben dieselben Rubriken,
                  Zeitstrahl, Scannen und Ablage. Auch Scans aus dem Posteingang lassen sich hierher zuordnen.
                </span>
              </div>
            </div>
            <div className="kt-fuss">
              <button className="btn" onClick={() => setAkteForm(null)}><Icon name="x" /> Abbrechen</button>
              <button className="btn btn-primary" onClick={akteSpeichern}>
                <Icon name="save" /> {akteForm.id ? "Speichern" : "Akte anlegen"}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!akteLoeschen}
        title="Akte entfernen?"
        message={`„${akteLoeschen?.name || ""}" wird entfernt. Das geht nur, wenn die Akte leer ist.`}
        onConfirm={akteEntfernen}
        onCancel={() => setAkteLoeschen(null)}
      />
      <ConfirmDialog
        open={!!loeschen}
        title="Dokument entfernen?"
        message={`„${loeschen?.title || ""}" wird aus der Betriebsakte entfernt.`}
        onConfirm={entfernen}
        onCancel={() => setLoeschen(null)}
      />
    </div>
  );
}

/** Eine Dokumentzeile – in beiden Ansichten gleich aufgebaut (am Handy als Karte). */
function Zeile({ d, suche, busy, rubrik, einzeln, onOeffnen, onBearbeiten, onLoeschen }: {
  d: Dokument; suche: string; busy: string; rubrik?: string; einzeln?: boolean;
  onOeffnen: (d: Dokument, speichern: boolean) => void;
  onBearbeiten: (d: Dokument) => void;
  onLoeschen: (d: Dokument) => void;
}) {
  return (
    <div className={`abl-zeile drei${einzeln ? " einzeln" : ""}`}>
      <DateiSymbol mime={d.mimeType} name={d.fileName} />
      <div className="abl-haupt">
        <div className="abl-titel">
          <b><Hervorheben text={d.title} suche={suche} /></b>
          {d.version > 1 && <span className="abzeichen blau" title="Version">v{d.version}</span>}
          {rubrik && <span className="abzeichen"><Icon name="folder" size={11} /> {rubrik}</span>}
        </div>
        <div className="abl-meta">
          <span><Icon name="calendar" size={12} /> {datum(d.documentDate || d.createdAt)}</span>
          {d.size ? <span>{groesse(d.size)}</span> : null}
        </div>
        {d.note && (
          <div className="abl-notiz-text">
            <Hervorheben text={d.note} suche={suche} />
          </div>
        )}
      </div>
      <div className="abl-aktionen">
        <button className="abl-haupt-aktion" disabled={busy === "dok" + d.id} onClick={() => onOeffnen(d, false)} title="Dokument öffnen">
          <Icon name="eye" /> Öffnen
        </button>
        <button disabled={busy === "dok" + d.id} onClick={() => onOeffnen(d, true)} title="Herunterladen / speichern" aria-label="Speichern">
          <Icon name="download" />
        </button>
        <button title="Bearbeiten" aria-label="Bearbeiten" onClick={() => onBearbeiten(d)}><Icon name="pencil" /></button>
        <button className="abl-weg" title="Entfernen" aria-label="Entfernen" onClick={() => onLoeschen(d)}><Icon name="trash" /></button>
      </div>
    </div>
  );
}
