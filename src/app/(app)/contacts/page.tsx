"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/clientApi";
import Icon from "@/components/Icon";
import SearchInput from "@/components/SearchInput";
import Hervorheben from "@/components/Hervorheben";
import ConfirmDialog from "@/components/ConfirmDialog";
import SuchSelect from "@/components/SuchSelect";
import { kopiere } from "@/lib/kopieren";

/**
 * Kontaktregister – alle Ansprechpartner aller Apps an einer Stelle.
 *
 * Der Bestand wird zentral hier geführt und beidseitig mit kontor, clocker und ProjectEye
 * abgeglichen (Protokoll: /mnt/devip3/shared/sync/KONTAKTE.md). Bearbeitet wird
 * ausschließlich im Pop-up; ein Klick auf einen Eintrag öffnet die Ansicht des
 * Kontakts samt Firma und deren übrigen Ansprechpartnern.
 *
 * Ein Kontakt braucht **keinen** Kunden: „frei" trägt einen selbst eingetippten Firmen- oder
 * Shopnamen und eine frei wählbare Art (Vertreter, Shop, Handwerker …). Solche Kontakte
 * bleiben in Nexus und werden nicht in die Fachanwendungen geschoben.
 */

type Kontakt = {
  id: string; name: string; role: string; email: string; phone: string; mobile: string; notes: string;
  category: string; ownerKind: string; ownerId: string; ownerName: string; source: string; favorite: boolean;
  version: number; updatedAt: string;
};

/** Übliche Einordnungen für Kontakte ohne Kunden-/Lieferantenstammsatz – frei ergänzbar. */
const ARTEN = ["Vertreter", "Shop", "Handwerker", "Behörde", "Dienstleister", "Privat"];

const ART_LABEL: Record<string, string> = {
  customer: "Kunde", supplier: "Lieferant", organization: "Mandant", frei: "frei",
};

const HERKUNFT: Record<string, string> = { nexus: "Nexus", kontor: "kontor", clocker: "clocker", projecteye: "ProjectEye" };

function leer(): Partial<Kontakt> {
  return { name: "", role: "", email: "", phone: "", mobile: "", notes: "", category: "",
           ownerKind: "frei", ownerId: "", ownerName: "", favorite: false };
}

export default function ContactsPage() {
  const [rows, setRows] = useState<Kontakt[]>([]);
  const [suche, setSuche] = useState("");
  const [art, setArt] = useState("");                       // Filter auf Firmenart
  const [kategorie, setKategorie] = useState("");           // Filter auf Kontaktart (Vertreter, Shop …)
  const [laedt, setLaedt] = useState(true);
  const [msg, setMsg] = useState("");
  const [editor, setEditor] = useState<Partial<Kontakt> | null>(null);
  const [ansicht, setAnsicht] = useState<Kontakt | null>(null);
  const [loeschen, setLoeschen] = useState<Kontakt | null>(null);
  const [firmen, setFirmen] = useState<{ customer: any[]; supplier: any[]; organization: any[] }>({ customer: [], supplier: [], organization: [] });

  const laden = useCallback(async () => {
    setLaedt(true);
    try {
      const d = await api(`/api/contacts?search=${encodeURIComponent(suche)}&take=2000`);
      setRows(d.data || []);
    } catch (e: any) { setMsg("Kontakte: " + e.message); }
    finally { setLaedt(false); }
  }, [suche]);

  useEffect(() => { const t = setTimeout(laden, 200); return () => clearTimeout(t); }, [laden]);

  useEffect(() => {
    Promise.all([
      api("/api/customers").catch(() => ({ data: [] })),
      api("/api/suppliers").catch(() => ({ data: [] })),
      api("/api/organizations").catch(() => ({ data: [] })),
    ]).then(([k, l, o]) => setFirmen({ customer: k.data || [], supplier: l.data || [], organization: o.data || [] }));
  }, []);

  const gefiltert = useMemo(() => {
    let l = art ? rows.filter((r) => r.ownerKind === art) : rows;
    if (kategorie) l = l.filter((r) => (r.category || "") === kategorie);
    return l;
  }, [rows, art, kategorie]);

  // Alle tatsächlich vergebenen Kontaktarten – als Filterleiste unter den Firmenarten
  const kategorien = useMemo(
    () => Array.from(new Set(rows.map((r) => (r.category || "").trim()).filter(Boolean))).sort(),
    [rows]
  );
  const favoriten = gefiltert.filter((r) => r.favorite);

  /** Name der Firma für die Auswahl im Pop-up. */
  const firmenOptionen = (kind: string) =>
    (firmen as any)[kind]?.map((f: any) => ({
      value: f.id,
      label: f.companyName || f.name || f.contactName || "(ohne Namen)",
      hint: [f.city, f.shortCode].filter(Boolean).join(" · "),
    })) || [];

  async function speichern() {
    if (!editor) return;
    const name = String(editor.name || "").trim();
    if (!name) { setMsg("Bitte einen Namen eingeben."); return; }
    try {
      const nutzlast = {
        name, role: editor.role || "", email: editor.email || "", phone: editor.phone || "",
        mobile: editor.mobile || "", notes: editor.notes || "", favorite: !!editor.favorite,
        category: (editor.category || "").trim(),
        ownerKind: editor.ownerKind || "frei", ownerId: editor.ownerId || "",
        // Bei „frei" zählt der eingetippte Firmen-/Shopname (es gibt keinen Stammsatz)
        ownerName: editor.ownerKind === "frei" || !editor.ownerKind ? editor.ownerName || "" : undefined,
      };
      if (editor.id) {
        await api(`/api/contacts/${editor.id}`, { method: "PATCH", body: JSON.stringify(nutzlast) });
        setMsg("Kontakt gespeichert – die Änderung läuft automatisch in kontor und ProjectEye.");
      } else {
        await api("/api/contacts", { method: "POST", body: JSON.stringify(nutzlast) });
        setMsg("Kontakt angelegt – er wird in die anderen Apps übernommen.");
      }
      setEditor(null);
      laden();
    } catch (e: any) { setMsg("Fehler: " + e.message); }
  }

  async function entfernen() {
    if (!loeschen) return;
    try {
      await api(`/api/contacts/${loeschen.id}`, { method: "DELETE" });
      setMsg("Kontakt entfernt – in den anderen Apps wird er beim nächsten Abgleich entfernt.");
      setAnsicht(null);
      laden();
    } catch (e: any) { setMsg("Fehler: " + e.message); }
    finally { setLoeschen(null); }
  }

  /** Schnellauswahl: Stern an/aus – die Markierten stehen oben. */
  async function stern(k: Kontakt) {
    try {
      await api(`/api/contacts/${k.id}`, { method: "PATCH", body: JSON.stringify({ favorite: !k.favorite }) });
      setRows((r) => r.map((x) => (x.id === k.id ? { ...x, favorite: !x.favorite } : x)));
    } catch (e: any) { setMsg("Fehler: " + e.message); }
  }

  async function kopieren(text: string, was: string) {
    if (!text) return;
    setMsg((await kopiere(text)) ? `${was} kopiert.` : `${was} konnte nicht kopiert werden.`);
  }

  /** Alle weiteren Ansprechpartner derselben Firma – für die Firmenansicht im Pop-up. */
  const firmenKontakte = (k: Kontakt) =>
    k.ownerId ? rows.filter((r) => r.ownerId === k.ownerId && r.id !== k.id) : [];

  return (
    <div>
      <div className="rv-sticky-header" style={{ display: "grid", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, display: "flex", alignItems: "center", gap: 10 }}>
            <Icon name="id-card" size={24} /> Kontakte
          </h1>
          <button className="btn btn-primary" onClick={() => setEditor(leer())}
            title="Kontakt anlegen – mit oder ohne Firma (z. B. Vertreter oder Shop)">
            <Icon name="plus" /> Neu
          </button>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {[["", "alle"], ["customer", "Kunden"], ["supplier", "Lieferanten"], ["organization", "Mandanten"], ["frei", "frei"]].map(([w, l]) => (
              <button key={w} className="btn" onClick={() => setArt(w)}
                style={{ background: art === w ? "var(--accent)" : undefined, color: art === w ? "#fff" : undefined }}>
                {l}
              </button>
            ))}
          </div>
          <span className="muted" style={{ fontSize: 12, marginLeft: "auto" }}>
            {laedt ? "lädt…" : `${gefiltert.length} Kontakte`}
          </span>
        </div>
        {kategorien.length > 0 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <span className="muted" style={{ fontSize: 12, alignSelf: "center" }}>Art:</span>
            <button className="btn" onClick={() => setKategorie("")}
              style={{ background: kategorie === "" ? "var(--accent)" : undefined, color: kategorie === "" ? "#fff" : undefined }}>
              alle
            </button>
            {kategorien.map((k) => (
              <button key={k} className="btn" onClick={() => setKategorie(k)}
                style={{ background: kategorie === k ? "var(--accent)" : undefined, color: kategorie === k ? "#fff" : undefined }}>
                {k}
              </button>
            ))}
          </div>
        )}
        <SearchInput value={suche} onChange={setSuche} placeholder="Name, Firma, E-Mail, Telefon, Funktion…"
          style={{ width: "100%", maxWidth: 380 }} />
      </div>

      {msg && <div className="card" style={{ padding: "8px 12px", marginBottom: 12, fontSize: 14 }}>{msg}</div>}

      {/* ── Schnellauswahl ── */}
      {favoriten.length > 0 && (
        <div className="card" style={{ padding: 12, marginBottom: 12 }}>
          <div className="muted" style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 8 }}>
            Schnellauswahl
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {favoriten.map((k) => (
              <button key={k.id} className="btn" onClick={() => setAnsicht(k)} title={k.ownerName || "ohne Firma"}>
                <Icon name="user" size={14} /> {k.name}
                {k.ownerName ? <span className="muted" style={{ fontSize: 12 }}> · {k.ownerName}</span> : null}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Liste (Desktop) ── */}
      <div className="card only-desktop" style={{ overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid var(--border)" }}>
              <th style={{ padding: "10px 12px", width: 1 }}></th>
              <th style={{ padding: "10px 12px" }}>Name</th>
              <th style={{ padding: "10px 12px" }}>Funktion</th>
              <th style={{ padding: "10px 12px" }}>Firma</th>
              <th style={{ padding: "10px 12px" }}>E-Mail</th>
              <th style={{ padding: "10px 12px" }}>Telefon</th>
              <th style={{ padding: "10px 12px" }}>Herkunft</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {gefiltert.map((k) => (
              <tr key={k.id} onClick={() => setAnsicht(k)} style={{ borderBottom: "1px solid var(--border)", cursor: "pointer" }}>
                <td style={{ padding: "6px 8px" }} onClick={(e) => { e.stopPropagation(); stern(k); }}>
                  <button className="btn btn-icon" title={k.favorite ? "Aus der Schnellauswahl nehmen" : "In die Schnellauswahl"}
                    style={{ color: k.favorite ? "var(--accent)" : undefined }}>
                    <Icon name={k.favorite ? "check" : "plus"} size={14} />
                  </button>
                </td>
                <td style={{ padding: "10px 12px", fontWeight: 600 }}><Hervorheben text={k.name} suche={suche} /></td>
                <td style={{ padding: "10px 12px" }}><Hervorheben text={k.role || "–"} suche={suche} /></td>
                <td style={{ padding: "10px 12px" }}>
                  <Hervorheben text={k.ownerName || "–"} suche={suche} />
                  <span className="muted" style={{ fontSize: 11.5 }}>
                    {" "}{k.category ? <Hervorheben text={k.category} suche={suche} /> : ART_LABEL[k.ownerKind] || ""}
                  </span>
                </td>
                <td style={{ padding: "10px 12px" }}><Hervorheben text={k.email || "–"} suche={suche} /></td>
                <td style={{ padding: "10px 12px" }}><Hervorheben text={k.phone || k.mobile || "–"} suche={suche} /></td>
                <td style={{ padding: "10px 12px" }} className="muted">{HERKUNFT[k.source] || k.source}</td>
                <td style={{ padding: "8px 12px", whiteSpace: "nowrap" }} onClick={(e) => e.stopPropagation()}>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button className="btn btn-icon" title="Bearbeiten" onClick={() => setEditor({ ...k })}><Icon name="pencil" /></button>
                    <button className="btn btn-icon btn-danger" title="Entfernen" onClick={() => setLoeschen(k)}><Icon name="trash" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!laedt && gefiltert.length === 0 && (
          <div className="muted" style={{ padding: 16, fontSize: 14 }}>Kein Kontakt passt zur Suche.</div>
        )}
      </div>

      {/* ── Karten (Handy) ── */}
      <div className="only-mobile" style={{ gap: 10 }}>
        {gefiltert.map((k) => (
          <div key={k.id} className="card" onClick={() => setAnsicht(k)} style={{ padding: 14, display: "grid", gap: 6, cursor: "pointer" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontWeight: 600, flex: 1, minWidth: 0 }}><Hervorheben text={k.name} suche={suche} /></span>
              <span className="muted" style={{ fontSize: 12 }}>{ART_LABEL[k.ownerKind] || ""}</span>
            </div>
            {k.ownerName && <div className="muted" style={{ fontSize: 13 }}><Hervorheben text={k.ownerName} suche={suche} /></div>}
            {k.role && <div className="muted" style={{ fontSize: 13 }}>{k.role}</div>}
            {k.email && <div style={{ fontSize: 13, wordBreak: "break-all" }}><Hervorheben text={k.email} suche={suche} /></div>}
            {(k.phone || k.mobile) && <div style={{ fontSize: 13 }}>{k.phone || k.mobile}</div>}
          </div>
        ))}
      </div>

      {/* ── Ansicht: Kontakt + Firma ── */}
      {ansicht && (
        <div onClick={() => setAnsicht(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", display: "grid", placeItems: "center", padding: 16, zIndex: 60 }}>
          <div onClick={(e) => e.stopPropagation()} className="card dm-fenster"
            style={{ width: 560, maxWidth: "94vw", maxHeight: "90vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h2 style={{ fontSize: 18, fontWeight: 700 }}>{ansicht.name}</h2>
                <div className="muted" style={{ fontSize: 12.5 }}>
                  {ansicht.role ? `${ansicht.role} · ` : ""}
                  {ansicht.ownerName || "ohne Firma"} {ansicht.ownerKind !== "frei" ? `(${ART_LABEL[ansicht.ownerKind]})` : ""}
                  {ansicht.category ? ` · ${ansicht.category}` : ""}
                </div>
              </div>
              <button className="btn btn-icon" title={ansicht.favorite ? "Aus der Schnellauswahl" : "In die Schnellauswahl"}
                style={{ color: ansicht.favorite ? "var(--accent)" : undefined }}
                onClick={() => { stern(ansicht); setAnsicht({ ...ansicht, favorite: !ansicht.favorite }); }}>
                <Icon name={ansicht.favorite ? "check" : "plus"} />
              </button>
              <button className="btn btn-icon" aria-label="Schließen" onClick={() => setAnsicht(null)}><Icon name="x" /></button>
            </div>

            <div style={{ padding: 20, overflowY: "auto", display: "grid", gap: 14 }}>
              <div style={{ display: "grid", gap: 8 }}>
                {([["E-Mail", ansicht.email], ["Telefon", ansicht.phone], ["Mobil", ansicht.mobile]] as const).map(([label, wert]) => (
                  <div key={label} style={{ display: "flex", gap: 12, fontSize: 14, alignItems: "center" }}>
                    <span className="muted" style={{ minWidth: 96 }}>{label}</span>
                    <span style={{ flex: 1, minWidth: 0, wordBreak: "break-all" }}>{wert || "–"}</span>
                    {wert && (
                      <button className="btn btn-icon" title={`${label} kopieren`} onClick={() => kopieren(wert, label)}>
                        <Icon name="copy" size={14} />
                      </button>
                    )}
                  </div>
                ))}
                {ansicht.notes && (
                  <div style={{ display: "flex", gap: 12, fontSize: 14 }}>
                    <span className="muted" style={{ minWidth: 96 }}>Notiz</span>
                    <span style={{ flex: 1, whiteSpace: "pre-wrap" }}>{ansicht.notes}</span>
                  </div>
                )}
                <div style={{ display: "flex", gap: 12, fontSize: 12.5 }}>
                  <span className="muted" style={{ minWidth: 96 }}>Herkunft</span>
                  <span className="muted">gepflegt in {HERKUNFT[ansicht.source] || ansicht.source} · wird mit kontor und ProjectEye abgeglichen</span>
                </div>
              </div>

              {/* Firmenansicht: weitere Ansprechpartner derselben Firma */}
              {ansicht.ownerId && (
                <div style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
                  <div className="muted" style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 8 }}>
                    {ansicht.ownerName} – weitere Ansprechpartner
                  </div>
                  {firmenKontakte(ansicht).length === 0 && (
                    <div className="muted" style={{ fontSize: 13 }}>Kein weiterer Ansprechpartner hinterlegt.</div>
                  )}
                  <div style={{ display: "grid", gap: 6 }}>
                    {firmenKontakte(ansicht).map((k) => (
                      <button key={k.id} onClick={() => setAnsicht(k)}
                        style={{ textAlign: "left", padding: "7px 9px", borderRadius: 8, fontSize: 13.5, cursor: "pointer",
                                 border: "1px solid var(--border)", background: "var(--bg)", color: "var(--fg)" }}>
                        <b>{k.name}</b>
                        {k.role ? <span className="muted"> · {k.role}</span> : null}
                        {k.email ? <span className="muted"> · {k.email}</span> : null}
                      </button>
                    ))}
                  </div>
                  <button className="btn" style={{ marginTop: 8 }}
                    onClick={() => setEditor({ ...leer(), ownerKind: ansicht.ownerKind, ownerId: ansicht.ownerId })}>
                    <Icon name="plus" /> Ansprechpartner bei dieser Firma
                  </button>
                </div>
              )}
            </div>

            <div style={{ padding: "12px 20px", borderTop: "1px solid var(--border)", display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn btn-danger" onClick={() => setLoeschen(ansicht)}><Icon name="trash" /> Entfernen</button>
              <button className="btn btn-primary" onClick={() => { setEditor({ ...ansicht }); setAnsicht(null); }}>
                <Icon name="pencil" /> Bearbeiten
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Bearbeiten/Anlegen (immer im Pop-up) ── */}
      {editor && (
        <div onClick={() => setEditor(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", display: "grid", placeItems: "center", padding: 16, zIndex: 65 }}>
          <div onClick={(e) => e.stopPropagation()} className="card dm-fenster"
            style={{ width: 560, maxWidth: "94vw", maxHeight: "90vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10 }}>
              <h2 style={{ fontSize: 17, fontWeight: 700, flex: 1 }}>{editor.id ? "Kontakt bearbeiten" : "Neuer Kontakt"}</h2>
              <button className="btn btn-icon" aria-label="Schließen" onClick={() => setEditor(null)}><Icon name="x" /></button>
            </div>

            <div style={{ padding: 20, overflowY: "auto", display: "grid", gap: 12 }}>
              <label style={{ fontSize: 13, display: "grid", gap: 4 }}>
                <span className="muted">Name</span>
                <input className="input" autoFocus value={editor.name || ""} onChange={(e) => setEditor({ ...editor, name: e.target.value })} />
              </label>
              <label style={{ fontSize: 13, display: "grid", gap: 4 }}>
                <span className="muted">Funktion</span>
                <input className="input" value={editor.role || ""} placeholder="z. B. Einkauf"
                  onChange={(e) => setEditor({ ...editor, role: e.target.value })} />
              </label>

              <label style={{ fontSize: 13, display: "grid", gap: 4 }}>
                <span className="muted">Gehört zu</span>
                <SuchSelect
                  value={editor.ownerKind || "frei"}
                  onChange={(v) => setEditor({ ...editor, ownerKind: v, ownerId: "" })}
                  platzhalter="Art wählen"
                  options={[
                    { value: "frei", label: "frei (keine Firma)" },
                    { value: "customer", label: "Kunde" },
                    { value: "supplier", label: "Lieferant" },
                    { value: "organization", label: "Mandant" },
                  ]}
                />
              </label>
              {editor.ownerKind && editor.ownerKind !== "frei" ? (
                <label style={{ fontSize: 13, display: "grid", gap: 4 }}>
                  <span className="muted">Firma</span>
                  <SuchSelect
                    value={editor.ownerId || ""}
                    onChange={(v) => setEditor({ ...editor, ownerId: v })}
                    platzhalter="— Firma wählen —"
                    suchePlatzhalter="Firma suchen…"
                    options={firmenOptionen(editor.ownerKind)}
                  />
                </label>
              ) : (
                <label style={{ fontSize: 13, display: "grid", gap: 4 }}>
                  <span className="muted">Firma / Shop (frei eingetragen)</span>
                  <input className="input" value={editor.ownerName || ""} placeholder="z. B. Elektro Meier, Vertretung Nord"
                    onChange={(e) => setEditor({ ...editor, ownerName: e.target.value })} />
                  <span className="muted" style={{ fontSize: 12 }}>
                    Kein Kundenstammsatz nötig – der Name steht nur an diesem Kontakt.
                  </span>
                </label>
              )}

              <label style={{ fontSize: 13, display: "grid", gap: 4 }}>
                <span className="muted">Art des Kontakts</span>
                <input className="input" list="kontaktarten" value={editor.category || ""}
                  placeholder="z. B. Vertreter, Shop – frei wählbar"
                  onChange={(e) => setEditor({ ...editor, category: e.target.value })} />
                <datalist id="kontaktarten">
                  {Array.from(new Set([...ARTEN, ...kategorien])).map((k) => <option key={k} value={k} />)}
                </datalist>
              </label>

              <div className="feld-zeile feld-zeile-2">
                <label style={{ fontSize: 13, display: "grid", gap: 4 }}>
                  <span className="muted">E-Mail</span>
                  <input className="input" type="email" value={editor.email || ""} onChange={(e) => setEditor({ ...editor, email: e.target.value })} />
                </label>
                <label style={{ fontSize: 13, display: "grid", gap: 4 }}>
                  <span className="muted">Telefon</span>
                  <input className="input" value={editor.phone || ""} onChange={(e) => setEditor({ ...editor, phone: e.target.value })} />
                </label>
              </div>
              <label style={{ fontSize: 13, display: "grid", gap: 4 }}>
                <span className="muted">Mobil</span>
                <input className="input" value={editor.mobile || ""} onChange={(e) => setEditor({ ...editor, mobile: e.target.value })} />
              </label>
              <label style={{ fontSize: 13, display: "grid", gap: 4 }}>
                <span className="muted">Notiz</span>
                <textarea className="input" rows={4} value={editor.notes || ""} onChange={(e) => setEditor({ ...editor, notes: e.target.value })} />
              </label>
              <label style={{ fontSize: 13.5, display: "flex", alignItems: "center", gap: 8 }}>
                <input type="checkbox" checked={!!editor.favorite} onChange={(e) => setEditor({ ...editor, favorite: e.target.checked })} />
                In die Schnellauswahl aufnehmen
              </label>
              <div className="muted" style={{ fontSize: 12, lineHeight: 1.5 }}>
                Kontakte einer <b>Kundenfirma</b> laufen automatisch nach kontor und clocker, Ansprechpartner von
                <b> Lieferanten</b> nach ProjectEye – und Änderungen von dort kommen hierher zurück.
                <b> Freie</b> Kontakte (Vertreter, Shops) bleiben nur hier.
              </div>
            </div>

            <div style={{ padding: "12px 20px", borderTop: "1px solid var(--border)", display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn" onClick={() => setEditor(null)}>Abbrechen</button>
              <button className="btn btn-primary" onClick={speichern}><Icon name="save" /> Speichern</button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!loeschen}
        title="Kontakt entfernen?"
        message={`„${loeschen?.name || ""}" wird aus dem Register entfernt und beim nächsten Abgleich auch in kontor und ProjectEye.`}
        onConfirm={entfernen}
        onCancel={() => setLoeschen(null)}
      />
    </div>
  );
}
