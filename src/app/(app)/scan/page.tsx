"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, getToken } from "@/lib/clientApi";
import Icon from "@/components/Icon";
import SearchInput from "@/components/SearchInput";
import Hervorheben, { sucheBegriffe } from "@/components/Hervorheben";
import ConfirmDialog from "@/components/ConfirmDialog";
import SuchSelect from "@/components/SuchSelect";
import PdfViewerModal from "@/components/PdfViewerModal";

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
  const [neuerScanner, setNeuerScanner] = useState("");
  const [scannerOffen, setScannerOffen] = useState(false);
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
      const s = await api("/api/scanners", { method: "POST", body: JSON.stringify({ host }) });
      setMsg(`Scanner „${s.name}" eingerichtet.`);
      setNeuerScanner("");
      setScannerOffen(false);
      setGeraetId(s.id);
      ladeGeraete();
    } catch (e: any) { setMsg("Fehler: " + e.message); }
    finally { setBusy(""); }
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

  return (
    <div>
      <div className="rv-sticky-header" style={{ display: "grid", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, display: "flex", alignItems: "center", gap: 10 }}>
            <Icon name="printer" size={24} /> Scannen
          </h1>
          <button className="btn btn-primary" disabled={!geraetId || busy === "scan"} onClick={scannen}>
            <Icon name="printer" /> {busy === "scan" ? "Scannt…" : "Scannen"}
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

      {/* ── Gerät und Einstellungen ── */}
      <div className="card" style={{ padding: 14, marginBottom: 12, display: "grid", gap: 12 }}>
        <div className="feld-zeile feld-zeile-2">
          <label style={{ fontSize: 13, display: "grid", gap: 4 }}>
            <span className="muted">Scanner</span>
            <SuchSelect
              value={geraetId}
              onChange={setGeraetId}
              platzhalter="— kein Scanner eingerichtet —"
              suchePlatzhalter="Scanner suchen…"
              options={geraete.map((g) => ({ value: g.id, label: g.name, hint: g.host }))}
            />
          </label>
          <label style={{ fontSize: 13, display: "grid", gap: 4 }}>
            <span className="muted">Vorlage</span>
            <SuchSelect
              value={quelle}
              onChange={(v) => setQuelle(v as "Platen" | "Feeder")}
              platzhalter="Quelle"
              options={[
                { value: "Platen", label: "Flachbett (Glas)" },
                ...(faehig?.sources?.includes("Feeder") ? [{ value: "Feeder", label: "Einzug (mehrere Seiten)" }] : []),
              ]}
            />
          </label>
        </div>
        <div className="feld-zeile feld-zeile-2">
          <label style={{ fontSize: 13, display: "grid", gap: 4 }}>
            <span className="muted">Farbe</span>
            <SuchSelect
              value={farbe}
              onChange={(v) => setFarbe(v as "RGB24" | "Grayscale8")}
              platzhalter="Farbe"
              options={[{ value: "RGB24", label: "Farbe" }, { value: "Grayscale8", label: "Graustufen" }]}
            />
          </label>
          <label style={{ fontSize: 13, display: "grid", gap: 4 }}>
            <span className="muted">Auflösung</span>
            <SuchSelect
              value={String(aufloesung)}
              onChange={(v) => setAufloesung(Number(v))}
              platzhalter="Auflösung"
              options={(faehig?.resolutions || [150, 200, 300]).map((r) => ({ value: String(r), label: `${r} dpi` }))}
            />
          </label>
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          {quelle === "Feeder" && faehig?.duplex && (
            <label style={{ fontSize: 13.5, display: "flex", alignItems: "center", gap: 8 }}>
              <input type="checkbox" checked={duplex} onChange={(e) => setDuplex(e.target.checked)} />
              Vorder- und Rückseite
            </label>
          )}
          <span className="muted" style={{ fontSize: 12 }}>
            {faehig ? `${faehig.model} bereit` : geraetId ? "Scanner antwortet nicht" : "Noch kein Scanner eingerichtet"}
          </span>
          <button className="btn" style={{ marginLeft: "auto" }} onClick={() => setScannerOffen((v) => !v)}>
            <Icon name="plus" /> Scanner einrichten
          </button>
        </div>
        {scannerOffen && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <input className="input" style={{ flex: "1 1 220px", minWidth: 0 }} autoFocus
              placeholder="IP-Adresse des Scanners, z. B. 192.168.1.50"
              value={neuerScanner}
              onChange={(e) => setNeuerScanner(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") scannerHinzufuegen(); if (e.key === "Escape") setScannerOffen(false); }} />
            <button className="btn btn-primary" disabled={busy === "scanner"} onClick={scannerHinzufuegen}>
              <Icon name="check" /> {busy === "scanner" ? "Prüft…" : "Prüfen und speichern"}
            </button>
          </div>
        )}
      </div>

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
                <SuchSelect
                  value={zuordnen.groupId}
                  onChange={(v) => setZuordnen({ ...zuordnen, groupId: v })}
                  platzhalter="— ohne Zuordnung —"
                  suchePlatzhalter="Rubrik suchen…"
                  options={gruppen.map((g: any) => ({ value: g.id, label: g.name }))}
                />
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
        open={!!loeschen}
        title="Scan verwerfen?"
        message={`„${loeschen?.title || ""}" verschwindet aus dem Posteingang.`}
        onConfirm={verwerfen}
        onCancel={() => setLoeschen(null)}
      />
    </div>
  );
}
