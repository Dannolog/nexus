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
import { useLive } from "@/lib/live";
import { useSeitenZustand } from "@/lib/seitenzustand";

/**
 * Betriebsakte: Dokumente je **Mandant**, gegliedert nach Rubriken (z. B. Finanzamt,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ladeGruppen]);

  useEffect(() => { ladeDokumente(orgId); }, [orgId, ladeDokumente]);
  useLive(["OrganizationDocument"], () => ladeDokumente(orgId));
  useLive(["DocumentGroup"], ladeGruppen);

  const mandant = mandanten.find((m) => m.id === orgId);

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
    if (!orgId) { setMsg("Bitte zuerst einen Mandanten wählen."); return; }
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

  return (
    <div>
      <div className="rv-sticky-header" style={{ display: "grid", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, display: "flex", alignItems: "center", gap: 10 }}>
            <Icon name="building" size={24} /> Betriebsakte
          </h1>
          <div style={{ display: "flex", gap: 6 }}>
            {([["rubriken", "Rubriken", "folder"], ["zeitstrahl", "Zeitstrahl", "history"]] as const).map(([wert, text, icon]) => (
              <button key={wert} className="btn" onClick={() => setAnsicht(wert)}
                style={{ background: ansicht === wert ? "var(--accent)" : undefined, color: ansicht === wert ? "#fff" : undefined }}>
                <Icon name={icon} size={14} /> {text}
              </button>
            ))}
          </div>
          <span className="muted" style={{ fontSize: 12, marginLeft: "auto" }}>
            {orgId ? `${dokumente.length} Dokumente` : "Mandant wählen"}
          </span>
        </div>
        <SearchInput value={suche} onChange={setSuche} placeholder="Titel, Dateiname, Notiz…" style={{ width: "100%", maxWidth: 380 }} />
      </div>

      {msg && <div className="card" style={{ padding: "8px 12px", marginBottom: 12, fontSize: 14 }}>{msg}</div>}

      {/* ── Mandant und Ablage ── */}
      <div className="card" style={{ padding: 14, marginBottom: 12, display: "grid", gap: 12 }}>
        <div className="feld-zeile feld-zeile-2">
          <label style={{ fontSize: 13, display: "grid", gap: 4 }}>
            <span className="muted" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Icon name="building" size={14} /> Mandant
            </span>
            <SuchSelect
              value={orgId}
              onChange={setOrgId}
              platzhalter="— Mandant wählen —"
              suchePlatzhalter="Firma suchen…"
              options={mandanten.map((m) => ({ value: m.id, label: m.name, hint: [m.zip, m.city].filter(Boolean).join(" ") }))}
            />
          </label>
          <label style={{ fontSize: 13, display: "grid", gap: 4 }}>
            <span className="muted" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Icon name="tag" size={14} /> Rubrik für neue Ablagen
            </span>
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
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <label className="btn btn-primary" style={{ cursor: orgId ? "pointer" : "default", opacity: orgId ? 1 : .5 }}>
            <Icon name="plus" /> {busy === "upload" ? "Lädt…" : "Datei ablegen"}
            <input type="file" style={{ display: "none" }} disabled={!orgId}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) hochladen(f, zielGruppe); e.target.value = ""; }} />
          </label>
          <label className="btn" style={{ cursor: orgId ? "pointer" : "default", opacity: orgId ? 1 : .5 }}>
            <Icon name="image" /> Foto / Bild
            <input type="file" accept="image/*" capture="environment" style={{ display: "none" }} disabled={!orgId}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) hochladen(f, zielGruppe); e.target.value = ""; }} />
          </label>
          <span className="muted" style={{ fontSize: 12, alignSelf: "center" }}>
            {mandant ? `Ablage für ${mandant.name}` : "Erst einen Mandanten wählen"}
          </span>
        </div>
      </div>

      {!orgId && (
        <div className="card muted" style={{ padding: 16, fontSize: 14 }}>
          Bitte einen Mandanten wählen – dann erscheinen hier dessen Dokumente.
        </div>
      )}

      {/* ── Ansicht: Rubriken ── */}
      {orgId && ansicht === "rubriken" && (
        <div style={{ display: "grid", gap: 12 }}>
          {abschnitte.map((a) => {
            const zugeklappt = zu[a.id];
            return (
              <div key={a.id} className="card" style={{ padding: 0, overflow: "hidden" }}>
                <div className="akte-kopf" style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 10px", background: "var(--bg)", flexWrap: "wrap" }}>
                  <button className="btn btn-icon" title={zugeklappt ? "Aufklappen" : "Zuklappen"}
                    onClick={() => setZu((z) => ({ ...z, [a.id]: !z[a.id] }))}>
                    <span style={{ display: "inline-flex", transform: zugeklappt ? "rotate(-90deg)" : "none", transition: "transform .15s" }}>
                      <Icon name="chevron-down" />
                    </span>
                  </button>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{a.name}</span>
                  <span className="muted" style={{ fontSize: 12 }}>
                    {a.dokumente.length} Dokument{a.dokumente.length === 1 ? "" : "e"}
                  </span>
                  <label className="btn btn-icon" style={{ marginLeft: "auto", cursor: "pointer" }} title="Datei in diese Rubrik ablegen">
                    <Icon name="plus" />
                    <input type="file" style={{ display: "none" }}
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) hochladen(f, a.echt ? a.id : ""); e.target.value = ""; }} />
                  </label>
                </div>

                {!zugeklappt && (
                  <div style={{ padding: 10, display: "grid", gap: 8 }}>
                    {a.dokumente.length === 0 && <div className="muted" style={{ fontSize: 12.5 }}>Noch nichts abgelegt.</div>}
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
        <div className="card" style={{ padding: 16 }}>
          {zeitstrahl.length === 0 && <div className="muted" style={{ fontSize: 14 }}>Noch nichts abgelegt.</div>}
          <div style={{ display: "grid", gap: 18 }}>
            {zeitstrahl.map(({ monat, liste }) => (
              <div key={monat}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <Icon name="calendar" size={16} />
                  <span style={{ fontWeight: 700, fontSize: 14 }}>{monatsName(monat + "-01")}</span>
                  <span className="muted" style={{ fontSize: 12 }}>{liste.length} Eintrag{liste.length === 1 ? "" : "e"}</span>
                </div>
                {/* Zeitstrahl: senkrechte Linie mit Punkten je Dokument */}
                <div style={{ position: "relative", paddingLeft: 22 }}>
                  <span style={{ position: "absolute", left: 6, top: 4, bottom: 4, width: 2, background: "var(--border)" }} />
                  <div style={{ display: "grid", gap: 8 }}>
                    {liste.map((d) => (
                      <div key={d.id} style={{ position: "relative" }}>
                        <span style={{ position: "absolute", left: -21, top: 14, width: 10, height: 10, borderRadius: "50%",
                                       background: "var(--accent)", border: "2px solid var(--card, var(--bg))" }} />
                        <Zeile d={d} suche={suche} busy={busy} rubrik={rubrikName(d.groupId)}
                          onOeffnen={oeffnen} onBearbeiten={setBearbeiten} onLoeschen={setLoeschen} />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Bearbeiten ── */}
      {bearbeiten && (
        <div onClick={() => setBearbeiten(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", display: "grid", placeItems: "center", padding: 16, zIndex: 60 }}>
          <div onClick={(e) => e.stopPropagation()} className="card dm-fenster"
            style={{ width: 520, maxWidth: "94vw", maxHeight: "90vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10 }}>
              <Icon name="file-text" size={18} />
              <h2 style={{ fontSize: 17, fontWeight: 700, flex: 1 }}>Dokument bearbeiten</h2>
              <button className="btn btn-icon" aria-label="Schließen" onClick={() => setBearbeiten(null)}><Icon name="x" /></button>
            </div>
            <div style={{ padding: 20, overflowY: "auto", display: "grid", gap: 12 }}>
              <Feld label="Titel" icon="file-text" wert={bearbeiten.title}
                setWert={(v) => setBearbeiten({ ...bearbeiten, title: v })} />
              <label style={{ fontSize: 13, display: "grid", gap: 4 }}>
                <span className="muted" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <Icon name="calendar" size={14} /> Datum des Schriftstücks
                </span>
                <input className="input" type="date"
                  value={bearbeiten.documentDate ? String(bearbeiten.documentDate).slice(0, 10) : ""}
                  onChange={(e) => setBearbeiten({ ...bearbeiten, documentDate: e.target.value ? new Date(e.target.value).toISOString() : null })} />
                <span className="muted" style={{ fontSize: 12 }}>Bestimmt die Einordnung im Zeitstrahl.</span>
              </label>
              <label style={{ fontSize: 13, display: "grid", gap: 4 }}>
                <span className="muted" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <Icon name="tag" size={14} /> Rubrik
                </span>
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
              <label style={{ fontSize: 13, display: "grid", gap: 4 }}>
                <span className="muted">Notiz</span>
                <textarea className="input" rows={3} value={bearbeiten.note || ""}
                  onChange={(e) => setBearbeiten({ ...bearbeiten, note: e.target.value })} />
              </label>
            </div>
            <div style={{ padding: "12px 20px", borderTop: "1px solid var(--border)", display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn" onClick={() => setBearbeiten(null)}>Abbrechen</button>
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

/** Eine Dokumentzeile – in beiden Ansichten gleich aufgebaut. */
function Zeile({ d, suche, busy, rubrik, onOeffnen, onBearbeiten, onLoeschen }: {
  d: Dokument; suche: string; busy: string; rubrik?: string;
  onOeffnen: (d: Dokument, speichern: boolean) => void;
  onBearbeiten: (d: Dokument) => void;
  onLoeschen: (d: Dokument) => void;
}) {
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 10, display: "grid", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <Icon name={String(d.mimeType || "").startsWith("image/") ? "image" : "file-text"} size={15} />
        <span style={{ fontWeight: 600, fontSize: 14 }}><Hervorheben text={d.title} suche={suche} /></span>
        {d.version > 1 && (
          <span className="muted" style={{ fontSize: 12, border: "1px solid var(--border)", borderRadius: 6, padding: "1px 6px" }}>
            v{d.version}
          </span>
        )}
        {rubrik && <span className="muted" style={{ fontSize: 12 }}>· {rubrik}</span>}
        <span className="muted" style={{ fontSize: 12, marginLeft: "auto" }}>
          {datum(d.documentDate || d.createdAt)}{d.size ? ` · ${groesse(d.size)}` : ""}
        </span>
      </div>
      {d.note && (
        <div className="muted" style={{ fontSize: 12.5, whiteSpace: "pre-wrap", borderLeft: "2px solid var(--border)", paddingLeft: 8 }}>
          <Hervorheben text={d.note} suche={suche} />
        </div>
      )}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <button className="btn" disabled={busy === "dok" + d.id} onClick={() => onOeffnen(d, false)}>
          <Icon name="eye" /> Öffnen
        </button>
        <button className="btn" disabled={busy === "dok" + d.id} onClick={() => onOeffnen(d, true)}>
          <Icon name="save" /> Speichern
        </button>
        <button className="btn btn-icon" title="Bearbeiten" onClick={() => onBearbeiten(d)}><Icon name="pencil" /></button>
        <button className="btn btn-icon btn-danger" title="Entfernen" onClick={() => onLoeschen(d)}><Icon name="trash" /></button>
      </div>
    </div>
  );
}
