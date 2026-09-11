"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/clientApi";
import Icon from "@/components/Icon";
import ConfirmDialog from "@/components/ConfirmDialog";
import SuchSelect from "@/components/SuchSelect";

/**
 * Mitarbeiterakte: Dokumente und Notizen, gegliedert nach **Rubriken**
 * (z. B. „Krankenversicherung"). Rubriken gelten für alle Mitarbeiter gleich –
 * einmal angelegt, überall nutzbar; was keiner Rubrik zugeordnet ist, landet
 * sichtbar unter „Ohne Zuordnung".
 *
 * Dokumente kommen aus `/api/employee-documents` (die Seite lädt sie, weil sie
 * dort auch aus Vorlagen erzeugt werden), Notizen verwaltet diese Komponente selbst.
 */

export type Gruppe = { id: string; name: string; sort: number; color?: string };
type Dokument = Record<string, any>;
type Notiz = { id: string; groupId: string; title: string; text: string; author: string; createdAt: string };

const OHNE = "__ohne__";

function datum(v: any) {
  const d = new Date(v);
  return isNaN(d.getTime()) ? "" : d.toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function groesse(b: number) {
  if (!b) return "";
  return b < 1024 * 1024 ? `${Math.round(b / 1024)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`;
}

export default function MitarbeiterAkte({
  empId, empName, gruppen, gruppeId, setGruppeId, dokumente, busy,
  neuLadenGruppen, neuLadenDokumente, onOeffnen, onHochladen, onLoeschen, melde,
}: {
  empId: string;
  empName: string;
  gruppen: Gruppe[];
  gruppeId: string;
  setGruppeId: (id: string) => void;
  dokumente: Dokument[];
  busy: string;
  neuLadenGruppen: () => void;
  neuLadenDokumente: () => void;
  onOeffnen: (d: Dokument, speichern: boolean) => void;
  onHochladen: (f: File, groupId: string) => void;
  onLoeschen: (d: Dokument) => void;
  melde: (text: string) => void;
}) {
  const [notizen, setNotizen] = useState<Notiz[]>([]);
  const [zu, setZu] = useState<Record<string, boolean>>({});           // eingeklappte Rubriken
  const [notizEditor, setNotizEditor] = useState<{ id?: string; groupId: string; title: string; text: string } | null>(null);
  const [notizLoeschen, setNotizLoeschen] = useState<Notiz | null>(null);
  const [neueRubrik, setNeueRubrik] = useState("");
  const [rubrikOffen, setRubrikOffen] = useState(false);
  const [rubrikLoeschen, setRubrikLoeschen] = useState<Gruppe | null>(null);
  const [dokNotiz, setDokNotiz] = useState<{ id: string; titel: string; note: string } | null>(null);

  const ladeNotizen = useCallback(async () => {
    if (!empId) { setNotizen([]); return; }
    try {
      const d = await api(`/api/employee-notes?employeeId=${empId}`);
      setNotizen(d.data || []);
    } catch (e: any) { melde("Notizen: " + e.message); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empId]);

  useEffect(() => { ladeNotizen(); }, [ladeNotizen]);

  // Rubriken samt Inhalt – „Ohne Zuordnung" nur, wenn dort wirklich etwas liegt
  const abschnitte = useMemo(() => {
    const bekannt = new Set(gruppen.map((g) => g.id));
    const inOhne = (v: any) => !v.groupId || !bekannt.has(v.groupId);
    const liste = gruppen.map((g) => ({
      id: g.id,
      name: g.name,
      echt: true,
      dokumente: dokumente.filter((d) => d.groupId === g.id),
      notizen: notizen.filter((n) => n.groupId === g.id),
    }));
    const restDok = dokumente.filter(inOhne);
    const restNot = notizen.filter(inOhne);
    if (restDok.length || restNot.length) {
      liste.push({ id: OHNE, name: "Ohne Zuordnung", echt: false, dokumente: restDok, notizen: restNot });
    }
    return liste;
  }, [gruppen, dokumente, notizen]);

  async function rubrikAnlegen() {
    const name = neueRubrik.trim();
    if (!name) return;
    try {
      const g = await api("/api/doc-groups", { method: "POST", body: JSON.stringify({ name }) });
      melde(`Rubrik „${g.name}" angelegt.`);
      setNeueRubrik("");
      setRubrikOffen(false);
      neuLadenGruppen();
    } catch (e: any) { melde("Fehler: " + e.message); }
  }

  async function rubrikUmbenennen(g: Gruppe) {
    const name = window.prompt("Rubrik umbenennen:", g.name)?.trim();
    if (!name || name === g.name) return;
    try {
      await api(`/api/doc-groups/${g.id}`, { method: "PATCH", body: JSON.stringify({ name }) });
      melde(`Rubrik heißt jetzt „${name}".`);
      neuLadenGruppen();
    } catch (e: any) { melde("Fehler: " + e.message); }
  }

  async function rubrikEntfernen() {
    if (!rubrikLoeschen) return;
    try {
      await api(`/api/doc-groups/${rubrikLoeschen.id}`, { method: "DELETE" });
      melde(`Rubrik „${rubrikLoeschen.name}" entfernt – die Inhalte stehen jetzt unter „Ohne Zuordnung".`);
      if (gruppeId === rubrikLoeschen.id) setGruppeId("");
      neuLadenGruppen();
      neuLadenDokumente();
      ladeNotizen();
    } catch (e: any) { melde("Fehler: " + e.message); }
    finally { setRubrikLoeschen(null); }
  }

  async function notizSpeichern() {
    if (!notizEditor) return;
    const { id, groupId, title, text } = notizEditor;
    if (!text.trim()) { melde("Bitte einen Text eingeben."); return; }
    try {
      if (id) {
        await api(`/api/employee-notes/${id}`, { method: "PATCH", body: JSON.stringify({ title, text, groupId }) });
        melde("Notiz geändert.");
      } else {
        await api("/api/employee-notes", { method: "POST", body: JSON.stringify({ employeeId: empId, groupId, title, text }) });
        melde("Notiz abgelegt.");
      }
      setNotizEditor(null);
      ladeNotizen();
    } catch (e: any) { melde("Fehler: " + e.message); }
  }

  async function notizEntfernen() {
    if (!notizLoeschen) return;
    try {
      await api(`/api/employee-notes/${notizLoeschen.id}`, { method: "DELETE" });
      melde("Notiz entfernt.");
      ladeNotizen();
    } catch (e: any) { melde("Fehler: " + e.message); }
    finally { setNotizLoeschen(null); }
  }

  /** Dokument in eine andere Rubrik einsortieren. */
  async function dokumentVerschieben(d: Dokument, neueGruppe: string) {
    try {
      await api(`/api/employee-documents/${d.id}`, { method: "PATCH", body: JSON.stringify({ groupId: neueGruppe === OHNE ? "" : neueGruppe }) });
      neuLadenDokumente();
    } catch (e: any) { melde("Fehler: " + e.message); }
  }

  async function dokNotizSpeichern() {
    if (!dokNotiz) return;
    try {
      await api(`/api/employee-documents/${dokNotiz.id}`, { method: "PATCH", body: JSON.stringify({ note: dokNotiz.note }) });
      melde("Notiz am Dokument gespeichert.");
      setDokNotiz(null);
      neuLadenDokumente();
    } catch (e: any) { melde("Fehler: " + e.message); }
  }

  const rubrikOptionen = [
    ...gruppen.map((g) => ({ value: g.id, label: g.name })),
    { value: OHNE, label: "Ohne Zuordnung" },
  ];

  if (!empId) {
    return (
      <div className="card" style={{ padding: 14 }}>
        <div className="muted" style={{ fontSize: 13 }}>Bitte einen Mitarbeiter wählen – dann erscheint hier die Akte.</div>
      </div>
    );
  }

  return (
    <div className="card" style={{ padding: 14, display: "grid", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <div className="muted" style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: ".04em" }}>
          Akte {empName ? `– ${empName}` : ""}
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button className="btn" onClick={() => setNotizEditor({ groupId: gruppeId, title: "", text: "" })}>
            <Icon name="file-text" /> <span className="btn-label">Notiz</span>
          </button>
          <button className="btn" onClick={() => setRubrikOffen((v) => !v)} title="Neue Rubrik anlegen">
            <Icon name="plus" /> <span className="btn-label">Rubrik</span>
          </button>
        </div>
      </div>

      {rubrikOffen && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <input className="input" style={{ flex: "1 1 200px", minWidth: 0 }} autoFocus
            placeholder="Name der Rubrik, z. B. Krankenversicherung"
            value={neueRubrik}
            onChange={(e) => setNeueRubrik(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") rubrikAnlegen(); if (e.key === "Escape") { setRubrikOffen(false); setNeueRubrik(""); } }} />
          <button className="btn btn-primary" onClick={rubrikAnlegen}><Icon name="check" /> Anlegen</button>
        </div>
      )}

      {abschnitte.length === 0 && (
        <div className="muted" style={{ fontSize: 13 }}>Noch keine Rubrik – oben eine anlegen, dann Dokumente und Notizen einsortieren.</div>
      )}

      {abschnitte.map((a) => {
        const zugeklappt = zu[a.id];
        const anzahl = a.dokumente.length + a.notizen.length;
        return (
          <div key={a.id} style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 10px", background: "var(--bg)", flexWrap: "wrap" }}>
              <button className="btn btn-icon" title={zugeklappt ? "Aufklappen" : "Zuklappen"}
                onClick={() => setZu((z) => ({ ...z, [a.id]: !z[a.id] }))}>
                <span style={{ display: "inline-flex", transform: zugeklappt ? "rotate(-90deg)" : "none", transition: "transform .15s" }}>
                  <Icon name="chevron-down" />
                </span>
              </button>
              <span style={{ fontWeight: 600, fontSize: 14 }}>{a.name}</span>
              <span className="muted" style={{ fontSize: 12 }}>
                {a.dokumente.length} Dokument{a.dokumente.length === 1 ? "" : "e"}
                {a.notizen.length ? ` · ${a.notizen.length} Notiz${a.notizen.length === 1 ? "" : "en"}` : ""}
              </span>
              <div style={{ marginLeft: "auto", display: "flex", gap: 6, flexWrap: "wrap" }}>
                <label className="btn btn-icon" style={{ cursor: "pointer" }} title="Datei in diese Rubrik hochladen">
                  <Icon name="plus" />
                  <input type="file" style={{ display: "none" }}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) onHochladen(f, a.echt ? a.id : ""); e.target.value = ""; }} />
                </label>
                <button className="btn btn-icon" title="Notiz in dieser Rubrik ablegen"
                  onClick={() => setNotizEditor({ groupId: a.echt ? a.id : "", title: "", text: "" })}>
                  <Icon name="file-text" />
                </button>
                {a.echt && (
                  <>
                    <button className="btn btn-icon" title="Rubrik umbenennen"
                      onClick={() => rubrikUmbenennen(gruppen.find((g) => g.id === a.id)!)}>
                      <Icon name="pencil" />
                    </button>
                    <button className="btn btn-icon btn-danger" title="Rubrik entfernen (Inhalte bleiben erhalten)"
                      onClick={() => setRubrikLoeschen(gruppen.find((g) => g.id === a.id)!)}>
                      <Icon name="trash" />
                    </button>
                  </>
                )}
              </div>
            </div>

            {!zugeklappt && (
              <div style={{ padding: 10, display: "grid", gap: 8 }}>
                {anzahl === 0 && <div className="muted" style={{ fontSize: 12.5 }}>Noch nichts abgelegt.</div>}

                {a.notizen.map((n) => (
                  <div key={n.id} style={{ border: "1px dashed var(--border)", borderRadius: 10, padding: 10, display: "grid", gap: 6 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <Icon name="file-text" size={14} />
                      <span style={{ fontWeight: 600, fontSize: 13.5 }}>{n.title || "Notiz"}</span>
                      <span className="muted" style={{ fontSize: 12, marginLeft: "auto" }}>
                        {n.author ? `${n.author} · ` : ""}{datum(n.createdAt)}
                      </span>
                    </div>
                    <div style={{ fontSize: 13.5, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{n.text}</div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button className="btn btn-icon" title="Notiz bearbeiten"
                        onClick={() => setNotizEditor({ id: n.id, groupId: n.groupId, title: n.title, text: n.text })}>
                        <Icon name="pencil" />
                      </button>
                      <button className="btn btn-icon btn-danger" title="Notiz entfernen" onClick={() => setNotizLoeschen(n)}>
                        <Icon name="trash" />
                      </button>
                    </div>
                  </div>
                ))}

                {a.dokumente.map((d) => (
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
                    {d.note && (
                      <div className="muted" style={{ fontSize: 12.5, whiteSpace: "pre-wrap", borderLeft: "2px solid var(--border)", paddingLeft: 8 }}>
                        {d.note}
                      </div>
                    )}
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                      <button className="btn" onClick={() => onOeffnen(d, false)} disabled={busy === "dok" + d.id}>
                        <Icon name="eye" /> Öffnen
                      </button>
                      <button className="btn" onClick={() => onOeffnen(d, true)} disabled={busy === "dok" + d.id}>
                        <Icon name="save" /> Speichern
                      </button>
                      <button className="btn btn-icon" title="Notiz am Dokument"
                        onClick={() => setDokNotiz({ id: d.id, titel: d.title || d.fileName, note: d.note || "" })}>
                        <Icon name="file-text" />
                      </button>
                      <div style={{ minWidth: 180, flex: "0 1 220px" }} title="In eine andere Rubrik einsortieren">
                        <SuchSelect
                          value={d.groupId && gruppen.some((g) => g.id === d.groupId) ? d.groupId : OHNE}
                          onChange={(v: string) => dokumentVerschieben(d, v)}
                          platzhalter="Rubrik"
                          suchePlatzhalter="Rubrik suchen…"
                          options={rubrikOptionen}
                        />
                      </div>
                      <button className="btn btn-icon btn-danger" title="Dokument entfernen" onClick={() => onLoeschen(d)}>
                        <Icon name="trash" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* ── Notiz anlegen/bearbeiten ── */}
      {notizEditor && (
        <div onClick={() => setNotizEditor(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", display: "grid", placeItems: "center", padding: 16, zIndex: 60 }}>
          <div onClick={(e) => e.stopPropagation()} className="card dm-fenster"
            style={{ width: 560, maxWidth: "94vw", maxHeight: "90vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10 }}>
              <h2 style={{ fontSize: 17, fontWeight: 700, flex: 1 }}>{notizEditor.id ? "Notiz bearbeiten" : "Neue Notiz"}</h2>
              <button className="btn btn-icon" aria-label="Schließen" onClick={() => setNotizEditor(null)}><Icon name="x" /></button>
            </div>
            <div style={{ padding: 18, display: "grid", gap: 12, overflowY: "auto" }}>
              <label style={{ fontSize: 13, display: "grid", gap: 4 }}>
                <span className="muted">Überschrift (optional)</span>
                <input className="input" value={notizEditor.title} autoFocus
                  onChange={(e) => setNotizEditor({ ...notizEditor, title: e.target.value })} />
              </label>
              <label style={{ fontSize: 13, display: "grid", gap: 4 }}>
                <span className="muted">Rubrik</span>
                <SuchSelect
                  value={notizEditor.groupId || OHNE}
                  onChange={(v: string) => setNotizEditor({ ...notizEditor, groupId: v === OHNE ? "" : v })}
                  platzhalter="Rubrik"
                  suchePlatzhalter="Rubrik suchen…"
                  options={rubrikOptionen}
                />
              </label>
              <label style={{ fontSize: 13, display: "grid", gap: 4 }}>
                <span className="muted">Notiz</span>
                <textarea className="input" rows={7} value={notizEditor.text}
                  onChange={(e) => setNotizEditor({ ...notizEditor, text: e.target.value })} />
              </label>
            </div>
            <div style={{ padding: "12px 18px", borderTop: "1px solid var(--border)", display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn" onClick={() => setNotizEditor(null)}>Abbrechen</button>
              <button className="btn btn-primary" onClick={notizSpeichern}><Icon name="save" /> Speichern</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Notiz am Dokument ── */}
      {dokNotiz && (
        <div onClick={() => setDokNotiz(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", display: "grid", placeItems: "center", padding: 16, zIndex: 60 }}>
          <div onClick={(e) => e.stopPropagation()} className="card dm-fenster"
            style={{ width: 520, maxWidth: "94vw", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                Notiz zu „{dokNotiz.titel}"
              </h2>
              <button className="btn btn-icon" aria-label="Schließen" onClick={() => setDokNotiz(null)}><Icon name="x" /></button>
            </div>
            <div style={{ padding: 18 }}>
              <textarea className="input" rows={6} autoFocus value={dokNotiz.note}
                onChange={(e) => setDokNotiz({ ...dokNotiz, note: e.target.value })} />
            </div>
            <div style={{ padding: "12px 18px", borderTop: "1px solid var(--border)", display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn" onClick={() => setDokNotiz(null)}>Abbrechen</button>
              <button className="btn btn-primary" onClick={dokNotizSpeichern}><Icon name="save" /> Speichern</button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!notizLoeschen}
        title="Notiz entfernen?"
        message={`„${notizLoeschen?.title || notizLoeschen?.text?.slice(0, 60) || ""}" wird aus der Akte entfernt.`}
        onConfirm={notizEntfernen}
        onCancel={() => setNotizLoeschen(null)}
      />
      <ConfirmDialog
        open={!!rubrikLoeschen}
        title="Rubrik entfernen?"
        message={`„${rubrikLoeschen?.name || ""}" wird entfernt. Dokumente und Notizen bleiben erhalten und stehen danach unter „Ohne Zuordnung".`}
        onConfirm={rubrikEntfernen}
        onCancel={() => setRubrikLoeschen(null)}
      />
    </div>
  );
}
