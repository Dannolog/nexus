"use client";
import { useCallback, useEffect, useState } from "react";
import { api, getToken } from "@/lib/clientApi";
import Icon from "@/components/Icon";
import ConfirmDialog from "@/components/ConfirmDialog";
import PdfViewerModal from "@/components/PdfViewerModal";
import SuchSelect from "@/components/SuchSelect";

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
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState("");
  const [loeschen, setLoeschen] = useState<Dokument | null>(null);
  // PDF-Viewer (aus ProjectEye übernommen): zeigt Vorlagen und abgelegte Dokumente
  const [viewer, setViewer] = useState<{ url: string; titel: string; dok?: Dokument; vorlage?: Vorlage } | null>(null);
  const [vorlageLoeschen, setVorlageLoeschen] = useState<Vorlage | null>(null);

  const ladeVorlagen = useCallback(async () => {
    try {
      const d = await api("/api/doc-templates");
      setVorlagen(d.data || []);
      if (!vorlageId && d.data?.length) setVorlageId(d.data[0].id);
    } catch (e: any) { setMsg("Vorlagen: " + e.message); }
  }, [vorlageId]);

  const ladeDokumente = useCallback(async (id: string) => {
    if (!id) { setDokumente([]); return; }
    try {
      const d = await api(`/api/employee-documents?employeeId=${id}`);
      setDokumente(d.data || []);
    } catch (e: any) { setMsg("Dokumente: " + e.message); }
  }, []);

  useEffect(() => {
    ladeVorlagen();
    api("/api/employees").then((d) => setMitarbeiter(d.data || [])).catch(() => {});
    api("/api/organizations").then((d) => {
      setMandanten(d.data || []);
      if (d.data?.length === 1) setOrgId(d.data[0].id);
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { ladeDokumente(empId); }, [empId, ladeDokumente]);

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
        body: JSON.stringify({ employeeId: empId, orgId, templateId: vorlageId, fill }),
      });
      setMsg(`Abgelegt als ${d.fileName} (Version ${d.version})${d.filled ? " – vorausgefüllt" : ""}.`);
      ladeDokumente(empId);
    } catch (e: any) { setMsg("Fehler: " + e.message); }
    finally { setBusy(""); }
  }

  async function dokumentHochladen(f: File) {
    if (!empId) { setMsg("Bitte zuerst einen Mitarbeiter wählen."); return; }
    setBusy("upload-dok");
    try {
      const base64 = await dateiZuBase64(f);
      const d = await api("/api/employee-documents", {
        method: "POST",
        body: JSON.stringify({
          employeeId: empId, orgId, base64, fileName: f.name,
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
      if (speichern) speichereBlob(blob, name);
      else setViewer({ url: URL.createObjectURL(blob), titel: `${d.title || d.templateKey} · v${d.version} · ${name}`, dok: d });
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
      <div className="vertrag-kopf" style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, display: "flex", alignItems: "center", gap: 10 }}>
          <Icon name="archive" size={24} /> Dokumente
        </h1>
        <label className="btn" style={{ cursor: "pointer" }}>
          <Icon name="plus" /> Vorlage hochladen
          <input type="file" accept="application/pdf" style={{ display: "none" }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) vorlageHochladen(f); e.target.value = ""; }} />
        </label>
      </div>

      {msg && <div className="card" style={{ padding: "8px 12px", marginBottom: 12, fontSize: 14 }}>{msg}</div>}

      <div className="contract-grid">
        {/* ── Vorlagen ── */}
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
            </div>
            <div className="muted" style={{ fontSize: 12, lineHeight: 1.5 }}>
              Dateiname wird automatisch vergeben: <b>Firma_Mitarbeiter_Dokument_Datum_Version.pdf</b><br />
              Zum <b>Ausfüllen in der App</b>: Mitarbeiter wählen, bei der Vorlage auf <b>Ansehen</b> tippen –
              im Betrachter alle Formularfelder ausfüllen oder Text einsetzen und speichern.
            </div>
          </div>

          <div className="card" style={{ padding: 14 }}>
            <div className="muted" style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 10 }}>
              Abgelegte Dokumente {emp ? `– ${emp.name}` : ""}
            </div>
            {!empId && <div className="muted" style={{ fontSize: 13 }}>Bitte einen Mitarbeiter wählen.</div>}
            {empId && dokumente.length === 0 && <div className="muted" style={{ fontSize: 13 }}>Noch nichts abgelegt.</div>}
            <div style={{ display: "grid", gap: 8 }}>
              {dokumente.map((d) => (
                <div key={d.id} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 10, display: "grid", gap: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{d.title || d.templateKey}</span>
                    <span className="muted" style={{ fontSize: 12, border: "1px solid var(--border)", borderRadius: 6, padding: "1px 6px" }}>v{d.version}</span>
                    {d.filled && <span className="muted" style={{ fontSize: 12 }}>vorausgefüllt</span>}
                    <span className="muted" style={{ fontSize: 12, marginLeft: "auto" }}>{datum(d.createdAt)}</span>
                  </div>
                  <div className="muted" style={{ fontSize: 12, wordBreak: "break-all" }}>
                    {d.fileName}{d.size ? ` · ${groesse(d.size)}` : ""}
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <button className="btn" onClick={() => dokumentOeffnen(d, false)} disabled={busy === "dok" + d.id}>
                      <Icon name="eye" /> Öffnen
                    </button>
                    <button className="btn" onClick={() => dokumentOeffnen(d, true)} disabled={busy === "dok" + d.id}>
                      <Icon name="save" /> Speichern
                    </button>
                    <button className="btn btn-icon btn-danger" title="Entfernen" onClick={() => setLoeschen(d)}>
                      <Icon name="trash" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {viewer && (
        <PdfViewerModal
          url={viewer.url}
          titel={viewer.titel}
          onClose={() => { URL.revokeObjectURL(viewer.url); setViewer(null); }}
          onSavePdf={(viewer.dok || (viewer.vorlage && empId)) ? (blob) => ausViewerSpeichern(blob, viewer.dok, viewer.vorlage) : undefined}
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
