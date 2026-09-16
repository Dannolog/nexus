"use client";
import { useCallback, useEffect, useState } from "react";
import { api, getToken } from "@/lib/clientApi";
import Icon from "@/components/Icon";
import ConfirmDialog from "@/components/ConfirmDialog";
import PdfViewerModal from "@/components/PdfViewerModal";
import SuchSelect from "@/components/SuchSelect";
import MitarbeiterAkte, { Gruppe } from "@/components/MitarbeiterAkte";
import { useLive } from "@/lib/live";

// ── Dokumentenablage ──
// Links: Vorlagen (z. B. Personalfragebogen) hochladen und versionieren.
// Rechts: je Mitarbeiter Dokumente aus einer Vorlage erzeugen (vorausgefüllt),
// herunterladen/drucken und versioniert ablegen.

type Vorlage = Record<string, any>;
type Dokument = Record<string, any>;

/** Datei-Abruf mit Token; liefert Blob + Dateiname aus dem Header. */
async function ladeDatei(pfad: string): Promise<{ blob: Blob; name: string }> {
  const token = getToken();
  const res = await fetch(pfad, { headers: token ? { Authorization: `Bearer ${token}` } : {}, cache: "no-store" });
  if (!res.ok) throw new Error(`Datei konnte nicht geladen werden (HTTP ${res.status})`);
  const name = decodeURIComponent(res.headers.get("X-Dateiname") || "dokument.pdf");
  return { blob: await res.blob(), name };
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

function blobZuBase64(b: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(new Error("Datei konnte nicht gelesen werden"));
    r.readAsDataURL(b);
  });
}

function dateiZuBase64(f: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(new Error("Datei konnte nicht gelesen werden"));
    r.readAsDataURL(f);
  });
}

function datum(v: any) {
  const d = new Date(v);
  return isNaN(d.getTime()) ? "" : d.toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function groesse(b: number) {
  if (!b) return "";
  return b < 1024 * 1024 ? `${Math.round(b / 1024)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`;
}

export default function DocumentsPage() {
  const [vorlagen, setVorlagen] = useState<Vorlage[]>([]);
  const [mitarbeiter, setMitarbeiter] = useState<any[]>([]);
  const [mandanten, setMandanten] = useState<any[]>([]);
  const [dokumente, setDokumente] = useState<Dokument[]>([]);
  const [empId, setEmpId] = useState("");
  const [orgId, setOrgId] = useState("");
  const [vorlageId, setVorlageId] = useState("");
  // Rubriken der Akte (z. B. „Krankenversicherung") – gelten für alle Mitarbeiter
  const [gruppen, setGruppen] = useState<Gruppe[]>([]);
  const [gruppeId, setGruppeId] = useState("");
  const [vorlagenOffen, setVorlagenOffen] = useState(false);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState("");
  const [loeschen, setLoeschen] = useState<Dokument | null>(null);
  // PDF-Viewer (aus ProjectEye übernommen): zeigt Vorlagen und abgelegte Dokumente
  const [viewer, setViewer] = useState<{ url: string; titel: string; dok?: Dokument; vorlage?: Vorlage } | null>(null);
  const [vorlageLoeschen, setVorlageLoeschen] = useState<Vorlage | null>(null);
  // Einfache Bildansicht für hochgeladene Fotos/Scans (der PDF-Betrachter kann nur PDFs)
  const [bild, setBild] = useState<{ url: string; titel: string } | null>(null);

  const ladeVorlagen = useCallback(async () => {
    try {
      const d = await api("/api/doc-templates");
      setVorlagen(d.data || []);
      if (!vorlageId && d.data?.length) setVorlageId(d.data[0].id);
    } catch (e: any) { setMsg("Vorlagen: " + e.message); }
  }, [vorlageId]);

  const ladeGruppen = useCallback(async () => {
    try {
      const d = await api("/api/doc-groups");
      setGruppen(d.data || []);
    } catch (e: any) { setMsg("Rubriken: " + e.message); }
  }, []);

  const ladeDokumente = useCallback(async (id: string) => {
    if (!id) { setDokumente([]); return; }
    try {
      const d = await api(`/api/employee-documents?employeeId=${id}`);
      setDokumente(d.data || []);
    } catch (e: any) { setMsg("Dokumente: " + e.message); }
  }, []);

  useEffect(() => {
    ladeVorlagen();
    ladeGruppen();
    api("/api/employees").then((d) => setMitarbeiter(d.data || [])).catch(() => {});
    api("/api/organizations").then((d) => {
      setMandanten(d.data || []);
      if (d.data?.length === 1) setOrgId(d.data[0].id);
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { ladeDokumente(empId); }, [empId, ladeDokumente]);

  // Änderungen an Dokumenten, Rubriken oder Vorlagen erreichen alle offenen Fenster
  useLive(["EmployeeDocument", "ScanDocument"], () => ladeDokumente(empId));
  useLive(["DocumentGroup"], ladeGruppen);
  useLive(["DocumentTemplate"], ladeVorlagen);

  // Sprung aus der Mitarbeiterliste: /documents?employee=<id> öffnet dessen Akte direkt
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("employee");
    if (id) setEmpId(id);
  }, []);

  const emp = mitarbeiter.find((m) => m.id === empId);
  const vorlage = vorlagen.find((v) => v.id === vorlageId);

  // ── Vorlagen ──
  async function vorlageHochladen(f: File, ersetzen?: Vorlage) {
    setBusy("upload");
    try {
      const base64 = await dateiZuBase64(f);
      const antwort = await api("/api/doc-templates", {
        method: "POST",
        body: JSON.stringify({
          name: ersetzen?.name || f.name.replace(/\.pdf$/i, "").replace(/[_-]+/g, " "),
          key: ersetzen?.key,
          fileName: f.name,
          base64,
        }),
      });
      setMsg(antwort.ersetzt
        ? `Vorlage „${antwort.name}" ersetzt – jetzt Version ${antwort.version}.`
        : `Vorlage „${antwort.name}" angelegt (${JSON.parse(antwort.formFields || "[]").length} Formularfelder erkannt).`);
      ladeVorlagen();
    } catch (e: any) { setMsg("Fehler: " + e.message); }
    finally { setBusy(""); }
  }

  async function vorlageHerunterladen(v: Vorlage, mitDaten: boolean) {
    setBusy("dl" + v.id);
    try {
      const q = mitDaten && empId ? `?employeeId=${empId}${orgId ? `&orgId=${orgId}` : ""}` : "";
      const { blob, name } = await ladeDatei(`/api/doc-templates/${v.id}/file${q}`);
      speichereBlob(blob, name);
      setMsg(mitDaten ? `Vorausgefüllt heruntergeladen: ${name}` : `Leere Vorlage heruntergeladen: ${name}`);
    } catch (e: any) { setMsg("Fehler: " + e.message); }
    finally { setBusy(""); }
  }

  async function vorlageEntfernen() {
    if (!vorlageLoeschen) return;
    try {
      await api(`/api/doc-templates/${vorlageLoeschen.id}`, { method: "DELETE" });
      setMsg(`Vorlage „${vorlageLoeschen.name}" entfernt (abgelegte Dokumente bleiben erhalten).`);
      ladeVorlagen();
    } catch (e: any) { setMsg("Fehler: " + e.message); }
    finally { setVorlageLoeschen(null); }
  }

  // ── Dokumente je Mitarbeiter ──
  async function ablegen(fill: boolean) {
    if (!empId || !vorlageId) { setMsg("Bitte Mitarbeiter und Vorlage wählen."); return; }
    setBusy("ablegen");
    try {
      const d = await api("/api/employee-documents", {
        method: "POST",
        body: JSON.stringify({ employeeId: empId, groupId: gruppeId, orgId, templateId: vorlageId, fill }),
      });
      setMsg(`Abgelegt als ${d.fileName} (Version ${d.version})${d.filled ? " – vorausgefüllt" : ""}.`);
      ladeDokumente(empId);
    } catch (e: any) { setMsg("Fehler: " + e.message); }
    finally { setBusy(""); }
  }

  async function dokumentHochladen(f: File, groupId?: string) {
    if (!empId) { setMsg("Bitte zuerst einen Mitarbeiter wählen."); return; }
    setBusy("upload-dok");
    try {
      const base64 = await dateiZuBase64(f);
      const d = await api("/api/employee-documents", {
        method: "POST",
        body: JSON.stringify({
          employeeId: empId, groupId: groupId ?? gruppeId, orgId, base64, fileName: f.name,
          title: f.name.replace(/\.[^.]+$/, ""),
          templateKey: vorlage?.key || "upload",
          fill: false,
        }),
      });
      setMsg(`Hochgeladen und abgelegt: ${d.fileName} (Version ${d.version}).`);
      ladeDokumente(empId);
    } catch (e: any) { setMsg("Fehler: " + e.message); }
    finally { setBusy(""); }
  }

  async function dokumentOeffnen(d: Dokument, speichern: boolean) {
    setBusy("dok" + d.id);
    try {
      const { blob, name } = await ladeDatei(`/api/employee-documents/${d.id}/file`);
      const titel = `${d.title || d.templateKey} · v${d.version} · ${name}`;
      if (speichern) speichereBlob(blob, name);
      // Der PDF-Betrachter kann nur PDFs – Bilder (z. B. abfotografierte Nachweise)
      // bekommen eine einfache Bildansicht, alles andere wird heruntergeladen.
      else if (String(d.mimeType || "").startsWith("image/")) setBild({ url: URL.createObjectURL(blob), titel });
      else if (d.mimeType && d.mimeType !== "application/pdf") { speichereBlob(blob, name); setMsg(`${name} heruntergeladen – dieser Dateityp lässt sich nicht in der App anzeigen.`); }
      else setViewer({ url: URL.createObjectURL(blob), titel, dok: d });
    } catch (e: any) { setMsg("Fehler: " + e.message); }
    finally { setBusy(""); }
  }

  /** Vorlage im Viewer ansehen – leer oder mit den Daten des gewählten Mitarbeiters. */
  async function vorlageAnsehen(v: Vorlage, mitDaten: boolean) {
    setBusy("view" + v.id);
    try {
      const q = mitDaten && empId ? `?employeeId=${empId}${orgId ? `&orgId=${orgId}` : ""}` : "";
      const { blob, name } = await ladeDatei(`/api/doc-templates/${v.id}/file${q}`);
      setViewer({ url: URL.createObjectURL(blob), titel: `${v.name} (v${v.version})${mitDaten ? " · vorausgefüllt" : ""} · ${name}`, vorlage: v });
    } catch (e: any) { setMsg("Fehler: " + e.message); }
    finally { setBusy(""); }
  }

  /**
   * Aus dem Viewer heraus gespeicherte Seitenänderungen (umsortiert, Leerseiten,
   * gelöschte oder doppelte Seiten) landen als **neue Version** in der Ablage – die
   * bisherige Fassung bleibt erhalten.
   */
  async function ausViewerSpeichern(blob: Blob, dok?: Dokument, vorlage?: Vorlage) {
    // Zwei Fälle: bereits abgelegtes Dokument → neue Version; oder eine Vorlage, die
    // gerade für den gewählten Mitarbeiter ausgefüllt wurde → erste Ablage.
    const employeeId = dok?.employeeId || empId;
    if (!employeeId) { setMsg("Bitte zuerst einen Mitarbeiter wählen – dann kann das ausgefüllte Formular abgelegt werden."); return; }
    try {
      const base64 = await blobZuBase64(blob);
      const neu = await api("/api/employee-documents", {
        method: "POST",
        body: JSON.stringify({
          employeeId,
          groupId: dok?.groupId ?? gruppeId,
          orgId: dok?.orgId || orgId,
          base64,
          title: dok?.title || vorlage?.name || "Dokument",
          templateKey: dok?.templateKey || vorlage?.key || "upload",
          fill: false,
          note: dok ? `in der App bearbeitet (aus Version ${dok.version})` : "in der App ausgefüllt",
        }),
      });
      setMsg(`Gespeichert als ${neu.fileName} (Version ${neu.version}).`);
      ladeDokumente(employeeId);
      setViewer(null);
    } catch (e: any) { setMsg("Fehler beim Speichern: " + e.message); }
  }

  async function dokumentEntfernen() {
    if (!loeschen) return;
    try {
      await api(`/api/employee-documents/${loeschen.id}`, { method: "DELETE" });
      setMsg("Dokument entfernt.");
      ladeDokumente(empId);
    } catch (e: any) { setMsg("Fehler: " + e.message); }
    finally { setLoeschen(null); }
  }

  const fehlendeStammdaten = emp
    ? [
        !emp.street && "Straße", !emp.zip && "PLZ", !emp.city && "Ort",
        !emp.birthDate && "Geburtsdatum", !emp.email && "E-Mail", !emp.phone && "Telefon",
      ].filter(Boolean)
    : [];

  return (
    <div>
      <div className="vertrag-kopf" style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, display: "flex", alignItems: "center", gap: 10 }}>
          <Icon name="archive" size={24} /> Dokumente
        </h1>
        {/* Vorlagen liegen im Untermenü – auf dem Handy bliebe sonst kein Platz für die Akte */}
        <button className="btn" onClick={() => setVorlagenOffen(true)}>
          <Icon name="file-text" /> Vorlagen{vorlagen.length ? ` (${vorlagen.length})` : ""}
        </button>
      </div>

      {msg && <div className="card" style={{ padding: "8px 12px", marginBottom: 12, fontSize: 14 }}>{msg}</div>}

      <div className="dok-raster">
        {/* ── Mitarbeiter + Ablage ── */}
        <div style={{ display: "grid", gap: 16, alignContent: "start" }}>
          <div className="card" style={{ padding: 14, display: "grid", gap: 12 }}>
            <div className="feld-zeile feld-zeile-2">
              <label style={{ fontSize: 13, display: "grid", gap: 4 }}>
                <span className="muted">Mitarbeiter</span>
                <SuchSelect
                  value={empId}
                  onChange={setEmpId}
                  platzhalter="— Mitarbeiter wählen —"
                  suchePlatzhalter="Name oder Personalnummer…"
                  options={mitarbeiter.map((m) => ({ value: m.id, label: m.name, hint: m.employeeNumber || m.email || "" }))}
                />
              </label>
              <label style={{ fontSize: 13, display: "grid", gap: 4 }}>
                <span className="muted">Firma (Mandant)</span>
                <SuchSelect
                  value={orgId}
                  onChange={setOrgId}
                  platzhalter="— Firma wählen —"
                  suchePlatzhalter="Firma suchen…"
                  options={mandanten.map((o) => ({ value: o.id, label: o.name, hint: [o.zip, o.city].filter(Boolean).join(" ") }))}
                />
              </label>
            </div>

            <label style={{ fontSize: 13, display: "grid", gap: 4 }}>
              <span className="muted">Rubrik in der Akte</span>
              <SuchSelect
                value={gruppeId}
                onChange={setGruppeId}
                platzhalter="— ohne Zuordnung —"
                suchePlatzhalter="Rubrik suchen oder neue eintippen…"
                options={gruppen.map((g) => ({ value: g.id, label: g.name }))}
                erlaubeNeu
                neuText="als neue Rubrik anlegen"
                onNeu={async (name: string) => {
                  try {
                    const g = await api("/api/doc-groups", { method: "POST", body: JSON.stringify({ name }) });
                    setMsg(`Rubrik „${g.name}" angelegt.`);
                    ladeGruppen();
                    return g.id as string;
                  } catch (e: any) { setMsg("Fehler: " + e.message); }
                }}
              />
            </label>

            {emp && fehlendeStammdaten.length > 0 && (
              <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.5 }}>
                Für das Vorausfüllen fehlen bei {emp.name} noch: <b>{fehlendeStammdaten.join(", ")}</b>.
                Diese Felder lassen sich unter „Mitarbeiter" pflegen – der Mitarbeiter kann sie sonst selbst eintragen.
              </div>
            )}

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="btn btn-primary" onClick={() => ablegen(true)} disabled={!empId || !vorlageId || busy === "ablegen"}>
                <Icon name="save" /> {busy === "ablegen" ? "Legt ab…" : "Vorausgefüllt ablegen"}
              </button>
              <button className="btn" onClick={() => ablegen(false)} disabled={!empId || !vorlageId || busy === "ablegen"}
                title="Leere Vorlage beim Mitarbeiter ablegen">
                <Icon name="file-text" /> Leer ablegen
              </button>
              <label className="btn" style={{ cursor: empId ? "pointer" : "default", opacity: empId ? 1 : .5 }}
                title="Ausgefülltes/unterschriebenes Dokument hochladen">
                <Icon name="plus" /> Datei hochladen
                <input type="file" style={{ display: "none" }} disabled={!empId}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) dokumentHochladen(f); e.target.value = ""; }} />
              </label>
              {/* Foto direkt aufnehmen – auf dem Handy öffnet sich die Kamera */}
              <label className="btn" style={{ cursor: empId ? "pointer" : "default", opacity: empId ? 1 : .5 }}
                title="Foto aufnehmen oder Bild aus der Galerie ablegen">
                <Icon name="image" /> Foto / Bild
                <input type="file" accept="image/*" capture="environment" style={{ display: "none" }} disabled={!empId}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) dokumentHochladen(f); e.target.value = ""; }} />
              </label>
            </div>
            <div className="muted" style={{ fontSize: 12, lineHeight: 1.5 }}>
              Dateiname wird automatisch vergeben: <b>Firma_Mitarbeiter_Dokument_Datum_Version.pdf</b><br />
              Zum <b>Ausfüllen in der App</b>: Mitarbeiter wählen, bei der Vorlage auf <b>Ansehen</b> tippen –
              im Betrachter alle Formularfelder ausfüllen oder Text einsetzen und speichern.
            </div>
          </div>

          <MitarbeiterAkte
            empId={empId}
            empName={emp?.name || ""}
            gruppen={gruppen}
            gruppeId={gruppeId}
            setGruppeId={setGruppeId}
            dokumente={dokumente}
            busy={busy}
            neuLadenGruppen={ladeGruppen}
            neuLadenDokumente={() => ladeDokumente(empId)}
            onOeffnen={dokumentOeffnen}
            onHochladen={dokumentHochladen}
            onLoeschen={(d) => setLoeschen(d)}
            melde={setMsg}
          />
        </div>
      </div>

      {/* ── Untermenü: Vorlagen ── */}
      {vorlagenOffen && (
        <div onClick={() => setVorlagenOffen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", display: "grid", placeItems: "center", padding: 16, zIndex: 60 }}>
          <div onClick={(e) => e.stopPropagation()} className="card dm-fenster"
            style={{ width: 620, maxWidth: "94vw", maxHeight: "90vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10 }}>
              <Icon name="file-text" size={18} />
              <h2 style={{ fontSize: 17, fontWeight: 700, flex: 1 }}>Vorlagen</h2>
              <label className="btn" style={{ cursor: "pointer" }}>
                <Icon name="plus" /> <span className="btn-label">Hochladen</span>
                <input type="file" accept="application/pdf" style={{ display: "none" }}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) vorlageHochladen(f); e.target.value = ""; }} />
              </label>
              <button className="btn btn-icon" aria-label="Schließen" onClick={() => setVorlagenOffen(false)}>
                <Icon name="x" />
              </button>
            </div>
            <div style={{ padding: 16, overflowY: "auto", display: "grid", gap: 10 }}>

        <div className="card" style={{ padding: 14, display: "grid", gap: 10, alignContent: "start" }}>
          <div className="muted" style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: ".04em" }}>Vorlagen</div>
          {vorlagen.length === 0 && (
            <div className="muted" style={{ fontSize: 13 }}>
              Noch keine Vorlage. Lade oben ein PDF hoch – Formularfelder werden automatisch erkannt.
            </div>
          )}
          {vorlagen.map((v) => {
            const felder = (() => { try { return JSON.parse(v.formFields || "[]").length; } catch { return 0; } })();
            const zugeordnet = (() => { try { return Object.keys(JSON.parse(v.fieldMap || "{}")).length; } catch { return 0; } })();
            return (
              <div key={v.id} style={{
                border: "1px solid var(--border)", borderRadius: 10, padding: 10,
                background: v.id === vorlageId ? "var(--bg)" : "transparent",
              }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                  <input type="radio" name="vorlage" checked={v.id === vorlageId} onChange={() => setVorlageId(v.id)} />
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{v.name}</span>
                  <span className="muted" style={{ fontSize: 12, marginLeft: "auto", whiteSpace: "nowrap" }}>v{v.version}</span>
                </label>
                <div className="muted" style={{ fontSize: 12, margin: "6px 0 8px" }}>
                  {felder > 0 ? `${felder} Formularfelder, ${zugeordnet} automatisch befüllt` : "keine Formularfelder"}
                  {" · "}{datum(v.updatedAt)}
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <button className="btn" onClick={() => vorlageAnsehen(v, !!empId)} disabled={busy === "view" + v.id}
                    title={empId ? "Im Viewer ansehen (mit den Daten des gewählten Mitarbeiters)" : "Im Viewer ansehen"}>
                    <Icon name="eye" /> Ansehen
                  </button>
                  <button className="btn" onClick={() => vorlageHerunterladen(v, false)} disabled={busy === "dl" + v.id}>
                    <Icon name="save" /> Leer
                  </button>
                  <button className="btn" onClick={() => vorlageHerunterladen(v, true)} disabled={!empId || busy === "dl" + v.id}
                    title={empId ? "Mit den Stammdaten des gewählten Mitarbeiters füllen" : "Erst Mitarbeiter wählen"}>
                    <Icon name="save" /> Vorausgefüllt
                  </button>
                  <label className="btn" style={{ cursor: "pointer" }} title="Vorlage durch neue Fassung ersetzen (Version steigt)">
                    <Icon name="redo" /> Ersetzen
                    <input type="file" accept="application/pdf" style={{ display: "none" }}
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) vorlageHochladen(f, v); e.target.value = ""; }} />
                  </label>
                  <button className="btn btn-icon btn-danger" title="Vorlage entfernen" onClick={() => setVorlageLoeschen(v)}>
                    <Icon name="trash" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
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
        <PdfViewerModal
          url={viewer.url}
          titel={viewer.titel}
          onClose={() => { URL.revokeObjectURL(viewer.url); setViewer(null); }}
          onSavePdf={(blob) => ausViewerSpeichern(blob, viewer.dok, viewer.vorlage)}
        />
      )}

      <ConfirmDialog
        open={!!loeschen}
        title="Dokument entfernen?"
        message={`„${loeschen?.fileName || ""}" wird aus der Ablage entfernt.`}
        onConfirm={dokumentEntfernen}
        onCancel={() => setLoeschen(null)}
      />
      <ConfirmDialog
        open={!!vorlageLoeschen}
        title="Vorlage entfernen?"
        message={`„${vorlageLoeschen?.name || ""}" wird entfernt. Bereits abgelegte Dokumente bleiben erhalten.`}
        onConfirm={vorlageEntfernen}
        onCancel={() => setVorlageLoeschen(null)}
      />
    </div>
  );
}
