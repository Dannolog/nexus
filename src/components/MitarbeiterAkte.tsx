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

/**
 * Dateisymbol wie in einer Dateiverwaltung: farbige Kachel je Dateityp (PDF, Bild, sonstige)
 * mit kleinem Kürzel. Wird auch in der Dokumente-Seite und der Betriebsakte genutzt.
 */
export function DateiSymbol({ mime, name }: { mime?: string; name?: string }) {
  const m = String(mime || "");
  const endung = (String(name || "").match(/\.([a-z0-9]{1,5})$/i)?.[1] || "").toUpperCase();
  const bild = m.startsWith("image/");
  const pdf = m === "application/pdf" || (!m && endung === "PDF") || (!m && !endung);
  const kuerzel = pdf ? "PDF" : bild ? (endung || "BILD") : (endung || "DATEI");
  return (
    <span className={`abl-datei${pdf ? " pdf" : bild ? " bild" : ""}`} aria-hidden="true">
      <Icon name={bild ? "image" : "file-text"} size={18} />
      <span className="abl-datei-typ">{kuerzel.slice(0, 4)}</span>
    </span>
  );
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

  /** Rubrik direkt aus einer Auswahlliste heraus anlegen – danach überall nutzbar. */
  async function rubrikAusAuswahl(name: string) {
    try {
      const g = await api("/api/doc-groups", { method: "POST", body: JSON.stringify({ name }) });
      melde(`Rubrik „${g.name}" angelegt.`);
      neuLadenGruppen();
      return g.id as string;
    } catch (e: any) { melde("Fehler: " + e.message); }
  }

  const rubrikOptionen = [
    ...gruppen.map((g) => ({ value: g.id, label: g.name })),
    { value: OHNE, label: "Ohne Zuordnung" },
  ];

  if (!empId) {
    return (
      <div className="card">
        <div className="leer-zustand">
          <div className="leer-icon"><Icon name="folder" size={28} /></div>
          <div style={{ fontWeight: 650, color: "var(--fg)", fontSize: 15 }}>Noch keine Akte geöffnet</div>
          <div style={{ fontSize: 13.5, maxWidth: 420, lineHeight: 1.5 }}>
            Oben einen Mitarbeiter wählen – dann erscheint hier seine Akte mit allen Rubriken, Dokumenten und Notizen.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="abl-akte">
      {/* ── Kopf der Akte ── */}
      <div className="card">
        <div className="abl-akte-kopf">
          <span className="abl-akte-ic"><Icon name="folder" size={20} /></span>
          <div style={{ minWidth: 0, flex: "1 1 180px" }}>
            <div className="sektion-titel"><Icon name="user" size={12} /> Mitarbeiterakte</div>
            <h2>{empName || "Mitarbeiter"}</h2>
          </div>
          <div className="abl-kopf-aktionen">
            <button className="btn" onClick={() => setNotizEditor({ groupId: gruppeId, title: "", text: "" })} title="Notiz in der Akte ablegen">
              <Icon name="pencil" /> <span className="btn-label">Notiz</span>
            </button>
            <button className="btn btn-primary" onClick={() => setRubrikOffen((v) => !v)} title="Neue Rubrik anlegen">
              <Icon name="plus" /> <span className="btn-label">Rubrik</span>
            </button>
          </div>
        </div>

        {rubrikOffen && (
          <div className="abl-neu-rubrik">
            <input className="input" style={{ flex: "1 1 200px", minWidth: 0 }} autoFocus
              placeholder="Name der Rubrik, z. B. Krankenversicherung"
              value={neueRubrik}
              onChange={(e) => setNeueRubrik(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") rubrikAnlegen(); if (e.key === "Escape") { setRubrikOffen(false); setNeueRubrik(""); } }} />
            <button className="btn" onClick={() => { setRubrikOffen(false); setNeueRubrik(""); }}><Icon name="x" /> Abbrechen</button>
            <button className="btn btn-primary" onClick={rubrikAnlegen}><Icon name="check" /> Anlegen</button>
          </div>
        )}
      </div>

      {abschnitte.length === 0 && (
        <div className="card">
          <div className="leer-zustand">
            <div className="leer-icon"><Icon name="folder" size={28} /></div>
            <div style={{ fontWeight: 650, color: "var(--fg)", fontSize: 15 }}>Noch keine Rubrik</div>
            <div style={{ fontSize: 13.5, maxWidth: 420, lineHeight: 1.5 }}>
              Rubriken gliedern die Akte, z. B. „Krankenversicherung" oder „Verträge". Sie gelten für alle Mitarbeiter.
            </div>
            <button className="btn btn-primary" onClick={() => setRubrikOffen(true)}><Icon name="plus" /> Rubrik anlegen</button>
          </div>
        </div>
      )}

      {abschnitte.map((a) => {
        const zugeklappt = zu[a.id];
        const anzahl = a.dokumente.length + a.notizen.length;
        return (
          <div key={a.id} className={`abl-rubrik${zugeklappt ? "" : " offen"}${a.echt ? "" : " ohne"}`}>
            <div className="abl-rubrik-kopf akte-kopf">
              <button className="abl-rubrik-schalter" title={zugeklappt ? "Aufklappen" : "Zuklappen"} aria-expanded={!zugeklappt}
                onClick={() => setZu((z) => ({ ...z, [a.id]: !z[a.id] }))}>
                <span className="abl-pfeil"><Icon name="chevron-down" /></span>
                <span className="abl-rubrik-ic"><Icon name={a.echt ? "folder" : "archive"} size={16} /></span>
                <span style={{ display: "grid", minWidth: 0 }}>
                  <span className="abl-rubrik-name">{a.name}</span>
                  <span className="abl-rubrik-zahl">
                    {a.dokumente.length} Dokument{a.dokumente.length === 1 ? "" : "e"}
                    {a.notizen.length ? ` · ${a.notizen.length} Notiz${a.notizen.length === 1 ? "" : "en"}` : ""}
                  </span>
                </span>
              </button>
              <div className="abl-rubrik-werkzeuge">
                <label className="btn btn-icon" style={{ cursor: "pointer" }} title="Datei in diese Rubrik hochladen" aria-label="Datei hochladen">
                  <Icon name="upload" />
                  <input type="file" style={{ display: "none" }}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) onHochladen(f, a.echt ? a.id : ""); e.target.value = ""; }} />
                </label>
                {/* Foto aufnehmen oder Bild aus der Galerie – auf dem Handy öffnet sich direkt die Kamera */}
                <label className="btn btn-icon" style={{ cursor: "pointer" }} title="Foto aufnehmen oder Bild wählen" aria-label="Foto oder Bild">
                  <Icon name="image" />
                  <input type="file" accept="image/*" capture="environment" style={{ display: "none" }}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) onHochladen(f, a.echt ? a.id : ""); e.target.value = ""; }} />
                </label>
                <button className="btn btn-icon" title="Notiz in dieser Rubrik ablegen" aria-label="Notiz ablegen"
                  onClick={() => setNotizEditor({ groupId: a.echt ? a.id : "", title: "", text: "" })}>
                  <Icon name="file-text" />
                </button>
                {a.echt && (
                  <>
                    <button className="btn btn-icon" title="Rubrik umbenennen" aria-label="Rubrik umbenennen"
                      onClick={() => rubrikUmbenennen(gruppen.find((g) => g.id === a.id)!)}>
                      <Icon name="pencil" />
                    </button>
                    <button className="btn btn-icon btn-danger" title="Rubrik entfernen (Inhalte bleiben erhalten)" aria-label="Rubrik entfernen"
                      onClick={() => setRubrikLoeschen(gruppen.find((g) => g.id === a.id)!)}>
                      <Icon name="trash" />
                    </button>
                  </>
                )}
              </div>
            </div>

            {!zugeklappt && anzahl === 0 && (
              <div className="abl-rubrik-leer"><Icon name="folder" size={15} /> Noch nichts abgelegt – oben über die Symbole hochladen, fotografieren oder eine Notiz schreiben.</div>
            )}

            {!zugeklappt && anzahl > 0 && (
              <div className="abl-liste">
                {a.notizen.map((n) => (
                  <div key={n.id} className="abl-notiz">
                    <span className="abl-datei"><Icon name="pencil" size={17} /></span>
                    <div className="abl-haupt">
                      <div className="abl-titel">
                        <b>{n.title || "Notiz"}</b>
                        <span className="abzeichen gelb">Notiz</span>
                      </div>
                      <div className="abl-meta">
                        {n.author && <span><Icon name="user" size={12} /> {n.author}</span>}
                        <span><Icon name="calendar" size={12} /> {datum(n.createdAt)}</span>
                      </div>
                      <div className="abl-notiz-inhalt">{n.text}</div>
                    </div>
                    <div className="abl-aktionen">
                      <button title="Notiz bearbeiten" aria-label="Notiz bearbeiten"
                        onClick={() => setNotizEditor({ id: n.id, groupId: n.groupId, title: n.title, text: n.text })}>
                        <Icon name="pencil" />
                      </button>
                      <button className="abl-weg" title="Notiz entfernen" aria-label="Notiz entfernen" onClick={() => setNotizLoeschen(n)}>
                        <Icon name="trash" />
                      </button>
                    </div>
                  </div>
                ))}

                {a.dokumente.map((d) => (
                  <div key={d.id} className="abl-zeile">
                    <DateiSymbol mime={d.mimeType} name={d.fileName} />
                    <div className="abl-haupt">
                      <div className="abl-titel">
                        <b>{d.title || d.templateKey}</b>
                        <span className="abzeichen blau" title="Version">v{d.version}</span>
                        {d.filled && <span className="abzeichen gruen"><Icon name="check" size={11} /> vorausgefüllt</span>}
                      </div>
                      <div className="abl-meta">
                        <span><Icon name="calendar" size={12} /> {datum(d.createdAt)}</span>
                        {d.size ? <span>{groesse(d.size)}</span> : null}
                        <span className="abl-dateiname" title={d.fileName}>{d.fileName}</span>
                      </div>
                      {d.note && <div className="abl-notiz-text">{d.note}</div>}
                    </div>
                    <div className="abl-verschieben" title="In eine andere Rubrik einsortieren">
                      <SuchSelect
                        value={d.groupId && gruppen.some((g) => g.id === d.groupId) ? d.groupId : OHNE}
                        onChange={(v: string) => dokumentVerschieben(d, v)}
                        platzhalter="Rubrik"
                        suchePlatzhalter="Rubrik suchen oder neue eintippen…"
                        options={rubrikOptionen}
                        erlaubeNeu
                        neuText="als neue Rubrik anlegen"
                        onNeu={rubrikAusAuswahl}
                      />
                    </div>
                    <div className="abl-aktionen akte-knoepfe">
                      <button className="abl-haupt-aktion" onClick={() => onOeffnen(d, false)} disabled={busy === "dok" + d.id} title="Dokument öffnen">
                        <Icon name="eye" /> Öffnen
                      </button>
                      <button onClick={() => onOeffnen(d, true)} disabled={busy === "dok" + d.id} title="Herunterladen / speichern" aria-label="Speichern">
                        <Icon name="download" />
                      </button>
                      <button title="Notiz am Dokument" aria-label="Notiz am Dokument"
                        onClick={() => setDokNotiz({ id: d.id, titel: d.title || d.fileName, note: d.note || "" })}>
                        <Icon name="file-text" />
                      </button>
                      <button className="abl-weg" title="Dokument entfernen" aria-label="Dokument entfernen" onClick={() => onLoeschen(d)}>
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
        <div className="kt-huelle" style={{ zIndex: 60 }} onClick={() => setNotizEditor(null)}>
          <div onClick={(e) => e.stopPropagation()} className="card dm-fenster kt-fenster" style={{ width: 560 }}>
            <div className="abl-fenster-kopf">
              <span className="abl-ic"><Icon name="pencil" size={17} /></span>
              <h2>{notizEditor.id ? "Notiz bearbeiten" : "Neue Notiz"}<small>Freier Text in der Akte, z. B. Absprachen oder Hinweise</small></h2>
              <button className="btn btn-icon btn-flach" aria-label="Schließen" onClick={() => setNotizEditor(null)}><Icon name="x" /></button>
            </div>
            <div className="kt-inhalt">
              <label className="abl-label">
                <span><Icon name="tag" size={13} /> Überschrift (optional)</span>
                <input className="input" value={notizEditor.title} autoFocus
                  onChange={(e) => setNotizEditor({ ...notizEditor, title: e.target.value })} />
              </label>
              <label className="abl-label">
                <span><Icon name="folder" size={13} /> Rubrik</span>
                <SuchSelect
                  value={notizEditor.groupId || OHNE}
                  onChange={(v: string) => setNotizEditor({ ...notizEditor, groupId: v === OHNE ? "" : v })}
                  platzhalter="Rubrik"
                  suchePlatzhalter="Rubrik suchen oder neue eintippen…"
                  options={rubrikOptionen}
                  erlaubeNeu
                  neuText="als neue Rubrik anlegen"
                  onNeu={rubrikAusAuswahl}
                />
              </label>
              <label className="abl-label">
                <span><Icon name="file-text" size={13} /> Notiz</span>
                <textarea className="input" rows={7} value={notizEditor.text}
                  onChange={(e) => setNotizEditor({ ...notizEditor, text: e.target.value })} />
              </label>
            </div>
            <div className="kt-fuss">
              <button className="btn" onClick={() => setNotizEditor(null)}><Icon name="x" /> Abbrechen</button>
              <button className="btn btn-primary" onClick={notizSpeichern}><Icon name="save" /> Speichern</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Notiz am Dokument ── */}
      {dokNotiz && (
        <div className="kt-huelle" style={{ zIndex: 60 }} onClick={() => setDokNotiz(null)}>
          <div onClick={(e) => e.stopPropagation()} className="card dm-fenster kt-fenster" style={{ width: 520 }}>
            <div className="abl-fenster-kopf">
              <span className="abl-ic"><Icon name="file-text" size={17} /></span>
              <h2>Notiz zum Dokument<small style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{dokNotiz.titel}</small></h2>
              <button className="btn btn-icon btn-flach" aria-label="Schließen" onClick={() => setDokNotiz(null)}><Icon name="x" /></button>
            </div>
            <div className="kt-inhalt">
              <label className="abl-label">
                <span><Icon name="pencil" size={13} /> Notiz</span>
                <textarea className="input" rows={6} autoFocus value={dokNotiz.note}
                  onChange={(e) => setDokNotiz({ ...dokNotiz, note: e.target.value })} />
              </label>
            </div>
            <div className="kt-fuss">
              <button className="btn" onClick={() => setDokNotiz(null)}><Icon name="x" /> Abbrechen</button>
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
