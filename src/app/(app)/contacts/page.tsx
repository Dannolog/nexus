"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/clientApi";
import Icon from "@/components/Icon";
import SearchInput from "@/components/SearchInput";
import Hervorheben from "@/components/Hervorheben";
import ConfirmDialog from "@/components/ConfirmDialog";
import SuchSelect from "@/components/SuchSelect";
import { kopiere } from "@/lib/kopieren";
import { Feld, KopierKnopf } from "@/components/KontaktFeld";
import { entwurfSpeichern, entwurfLesen, entwurfLoeschen, seitdem } from "@/lib/entwurf";
import { useLive } from "@/lib/live";
import { useSeitenZustand } from "@/lib/seitenzustand";

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

type Kanal = { id?: string; kind: string; value: string; label?: string };

type Kontakt = {
  id: string; name: string; firstName: string; lastName: string;
  role: string; email: string; phone: string; mobile: string; notes: string;
  channels?: Kanal[];
  category: string; ownerKind: string; ownerId: string; ownerName: string; source: string; favorite: boolean;
  version: number; updatedAt: string;
  // Private Angaben – bleiben in Nexus und werden nie in die Fachanwendungen gespiegelt
  privatePhone: string; privateMobile: string; privateEmail: string;
  privateStreet: string; privateZip: string; privateCity: string; privateNotes: string;
  birthday: string | null;
};

/** Übliche Einordnungen für Kontakte ohne Kunden-/Lieferantenstammsatz – frei ergänzbar. */
const ARTEN = ["Vertreter", "Shop", "Handwerker", "Behörde", "Dienstleister", "Privat"];

/** Kommunikationswege: Beschriftung und Symbol je Art. */
const KANAL: Record<string, { label: string; icon: string; typ: string }> = {
  email: { label: "E-Mail", icon: "mail", typ: "email" },
  phone: { label: "Telefon", icon: "phone", typ: "tel" },
  mobile: { label: "Mobil", icon: "smartphone", typ: "tel" },
  fax: { label: "Fax", icon: "printer", typ: "tel" },
  web: { label: "Webseite", icon: "command", typ: "text" },
};

/** Entwurfsschlüssel je Kontakt – ein neuer Kontakt hat einen eigenen. */
const entwurfsSchluessel = (id?: string) => `kontakt:${id || "neu"}`;

const ART_LABEL: Record<string, string> = {
  customer: "Kunde", supplier: "Lieferant", organization: "Mandant", frei: "frei",
};

const HERKUNFT: Record<string, string> = { nexus: "Nexus", kontor: "kontor", clocker: "clocker", projecteye: "ProjectEye" };

function leer(): Partial<Kontakt> {
  return { name: "", firstName: "", lastName: "", channels: [{ kind: "email", value: "", label: "" }],
           role: "", email: "", phone: "", mobile: "", notes: "", category: "",
           ownerKind: "frei", ownerId: "", ownerName: "", favorite: false,
           privatePhone: "", privateMobile: "", privateEmail: "",
           privateStreet: "", privateZip: "", privateCity: "", privateNotes: "", birthday: null };
}

/** Hat der Kontakt überhaupt private Angaben? (Steuert den Hinweis in der Ansicht.) */
function hatPrivates(k: Partial<Kontakt>) {
  return !!(k.privatePhone || k.privateMobile || k.privateEmail || k.privateStreet ||
    k.privateZip || k.privateCity || k.privateNotes || k.birthday);
}

const datum = (v?: string | null) => {
  if (!v) return "";
  const d = new Date(v);
  return isNaN(d.getTime()) ? "" : d.toLocaleDateString("de-DE");
};

export default function ContactsPage() {
  const [rows, setRows] = useState<Kontakt[]>([]);
  // Suche und Filter bleiben erhalten (Adresszeile + Rückkehr auf die Seite)
  const [seite, setSeite] = useSeitenZustand("kontakte", { q: "", art: "", kategorie: "" });
  const suche = seite.q;
  const setSuche = (v: string) => setSeite({ q: v });
  const art = seite.art;                                    // Filter auf Firmenart
  const setArt = (v: string) => setSeite({ art: v });
  const kategorie = seite.kategorie;                        // Filter auf Kontaktart (Vertreter, Shop …)
  const setKategorie = (v: string) => setSeite({ kategorie: v });
  const [laedt, setLaedt] = useState(true);
  const [msg, setMsg] = useState("");
  const [editor, setEditor] = useState<Partial<Kontakt> | null>(null);
  const [ansicht, setAnsicht] = useState<Kontakt | null>(null);
  const [loeschen, setLoeschen] = useState<Kontakt | null>(null);
  const [firmen, setFirmen] = useState<{ customer: any[]; supplier: any[]; organization: any[] }>({ customer: [], supplier: [], organization: [] });
  // Private Angaben sind bewusst zugeklappt – sie werden erst auf Klick sichtbar
  const [privatOffen, setPrivatOffen] = useState(false);
  // Nicht gespeicherter Entwurf, der beim Öffnen gefunden wurde
  const [entwurfFrage, setEntwurfFrage] = useState<{ vorhanden: Partial<Kontakt>; zeit: number; original: Partial<Kontakt> } | null>(null);

  const laden = useCallback(async () => {
    setLaedt(true);
    try {
      const d = await api(`/api/contacts?search=${encodeURIComponent(suche)}&take=2000`);
      setRows(d.data || []);
    } catch (e: any) { setMsg("Kontakte: " + e.message); }
    finally { setLaedt(false); }
  }, [suche]);

  useEffect(() => { const t = setTimeout(laden, 200); return () => clearTimeout(t); }, [laden]);

  // Änderungen aus anderen Fenstern, anderen Sitzungen oder dem Abgleich sofort übernehmen
  useLive(["Contact", "ContactChannel", "Customer", "Supplier", "Organization"], laden);

  // Offenes Formular laufend sichern – geht die Sitzung verloren, ist nichts weg.
  useEffect(() => {
    if (!editor) return;
    const t = setTimeout(() => entwurfSpeichern(entwurfsSchluessel(editor.id), editor), 600);
    return () => clearTimeout(t);
  }, [editor]);

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
    const vorname = String(editor.firstName || "").trim();
    const nachname = String(editor.lastName || "").trim();
    const name = [vorname, nachname].filter(Boolean).join(" ") || String(editor.name || "").trim();
    if (!name) { setMsg("Bitte mindestens einen Nachnamen eingeben."); return; }
    try {
      const kanaele = (editor.channels || []).filter((k) => String(k.value || "").trim());
      const nutzlast = {
        name, firstName: vorname, lastName: nachname,
        channels: kanaele.map((k) => ({ kind: k.kind, value: String(k.value).trim(), label: k.label || "" })),
        role: editor.role || "", notes: editor.notes || "", favorite: !!editor.favorite,
        category: (editor.category || "").trim(),
        ownerKind: editor.ownerKind || "frei", ownerId: editor.ownerId || "",
        // Bei „frei" zählt der eingetippte Firmen-/Shopname (es gibt keinen Stammsatz)
        ownerName: editor.ownerKind === "frei" || !editor.ownerKind ? editor.ownerName || "" : undefined,
        // Private Angaben – bleiben in Nexus
        privatePhone: editor.privatePhone || "", privateMobile: editor.privateMobile || "",
        privateEmail: editor.privateEmail || "", privateStreet: editor.privateStreet || "",
        privateZip: editor.privateZip || "", privateCity: editor.privateCity || "",
        privateNotes: editor.privateNotes || "", birthday: editor.birthday || null,
      };
      if (editor.id) {
        await api(`/api/contacts/${editor.id}`, { method: "PATCH", body: JSON.stringify(nutzlast) });
        setMsg("Kontakt gespeichert – die Änderung läuft automatisch in kontor, clocker und ProjectEye.");
      } else {
        await api("/api/contacts", { method: "POST", body: JSON.stringify(nutzlast) });
        setMsg("Kontakt angelegt – er wird in die anderen Apps übernommen.");
      }
      entwurfLoeschen(entwurfsSchluessel(editor.id));   // gespeichert → Entwurf weg
      setEditor(null);
      laden();
    } catch (e: any) {
      // Bei abgelaufener Sitzung übernimmt der Sitzungswächter die Meldung – die Eingaben
      // bleiben hier stehen und liegen zusätzlich als Entwurf im Browser.
      if (e?.name === "SitzungAbgelaufenError") {
        setMsg("Nicht gespeichert: die Anmeldung ist abgelaufen. Deine Eingaben bleiben erhalten – nach dem Anmelden erneut speichern.");
        return;
      }
      setMsg("Fehler: " + e.message);
    }
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
  /** Öffnet Ansicht oder Pop-up und klappt die privaten Angaben dabei wieder zu. */
  function zeige(k: Kontakt | null) { setPrivatOffen(false); setAnsicht(k); }
  function bearbeite(k: Partial<Kontakt> | null) {
    setPrivatOffen(false);
    if (k) {
      // Liegt ein nicht gespeicherter Entwurf vor (z. B. nach abgelaufener Sitzung)? Anbieten.
      const e = entwurfLesen<Partial<Kontakt>>(entwurfsSchluessel(k.id));
      if (e) { setEntwurfFrage({ vorhanden: e.daten, zeit: e.zeit, original: k }); return; }
      if (!k.channels || k.channels.length === 0) {
        k = { ...k, channels: [
          ...(k.email ? [{ kind: "email", value: k.email, label: "" }] : []),
          ...(k.phone ? [{ kind: "phone", value: k.phone, label: "" }] : []),
          ...(k.mobile ? [{ kind: "mobile", value: k.mobile, label: "" }] : []),
        ] };
        if (!k.channels!.length) k = { ...k, channels: [{ kind: "email", value: "", label: "" }] };
      }
    }
    setEditor(k);
  }

  /** Editor schließen – der Entwurf bleibt liegen, solange etwas eingetragen ist. */
  function editorSchliessen() {
    if (editor) {
      const etwasDrin = [editor.firstName, editor.lastName, editor.notes, editor.role, editor.ownerName]
        .some((v) => String(v || "").trim()) || (editor.channels || []).some((k) => String(k.value || "").trim());
      if (etwasDrin) {
        entwurfSpeichern(entwurfsSchluessel(editor.id), editor);
        setMsg("Nicht gespeichert – die Eingaben liegen als Entwurf bereit und werden beim nächsten Öffnen angeboten.");
      } else {
        entwurfLoeschen(entwurfsSchluessel(editor.id));
      }
    }
    setEditor(null);
  }

  /** Kommunikationswege bearbeiten. */
  function kanalSetzen(i: number, teil: Partial<Kanal>) {
    if (!editor) return;
    const liste = [...(editor.channels || [])];
    liste[i] = { ...liste[i], ...teil };
    setEditor({ ...editor, channels: liste });
  }
  function kanalHinzu(kind: string) {
    if (!editor) return;
    setEditor({ ...editor, channels: [...(editor.channels || []), { kind, value: "", label: "" }] });
  }
  function kanalWeg(i: number) {
    if (!editor) return;
    setEditor({ ...editor, channels: (editor.channels || []).filter((_, n) => n !== i) });
  }

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

  /** Wie viele **zusätzliche** Einträge gibt es je Art (über den Hauptwert hinaus)? */
  const weitere = (k: Kontakt, art: string) =>
    Math.max(0, (k.channels || []).filter((c) => c.kind === art && c.value).length - 1);

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
          <button className="btn btn-primary" onClick={() => bearbeite(leer())}
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
              <button key={k.id} className="btn" onClick={() => zeige(k)} title={k.ownerName || "ohne Firma"}>
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
              {([["user", "Name"], ["tag", "Funktion"], ["building", "Firma"], ["mail", "E-Mail"],
                 ["phone", "Telefon"], ["archive", "Herkunft"]] as const).map(([icon, label]) => (
                <th key={label} style={{ padding: "10px 12px" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <Icon name={icon} size={14} /> {label}
                  </span>
                </th>
              ))}
              <th></th>
            </tr>
          </thead>
          <tbody>
            {gefiltert.map((k) => (
              <tr key={k.id} onClick={() => zeige(k)} style={{ borderBottom: "1px solid var(--border)", cursor: "pointer" }}>
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
                <td style={{ padding: "10px 12px" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <Hervorheben text={k.email || "–"} suche={suche} />
                    <KopierKnopf wert={k.email} was="E-Mail" klein />
                    {weitere(k, "email") > 0 && (
                      <span className="muted" style={{ fontSize: 11.5 }}>+{weitere(k, "email")}</span>
                    )}
                  </span>
                </td>
                <td style={{ padding: "10px 12px" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <Hervorheben text={k.phone || k.mobile || "–"} suche={suche} />
                    <KopierKnopf wert={k.phone || k.mobile} was="Nummer" klein />
                    {weitere(k, "phone") + weitere(k, "mobile") > 0 && (
                      <span className="muted" style={{ fontSize: 11.5 }}>+{weitere(k, "phone") + weitere(k, "mobile")}</span>
                    )}
                  </span>
                </td>
                <td style={{ padding: "10px 12px" }} className="muted">{HERKUNFT[k.source] || k.source}</td>
                <td style={{ padding: "8px 12px", whiteSpace: "nowrap" }} onClick={(e) => e.stopPropagation()}>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button className="btn btn-icon" title="Bearbeiten" onClick={() => bearbeite({ ...k })}><Icon name="pencil" /></button>
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
          <div key={k.id} className="card" onClick={() => zeige(k)} style={{ padding: 14, display: "grid", gap: 6, cursor: "pointer" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontWeight: 600, flex: 1, minWidth: 0 }}><Hervorheben text={k.name} suche={suche} /></span>
              <span className="muted" style={{ fontSize: 12 }}>{ART_LABEL[k.ownerKind] || ""}</span>
            </div>
            {k.ownerName && <div className="muted" style={{ fontSize: 13 }}><Hervorheben text={k.ownerName} suche={suche} /></div>}
            {k.role && <div className="muted" style={{ fontSize: 13 }}>{k.role}</div>}
            {k.email && (
              <div style={{ fontSize: 13, wordBreak: "break-all", display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ flex: 1, minWidth: 0 }}><Hervorheben text={k.email} suche={suche} /></span>
                <KopierKnopf wert={k.email} was="E-Mail" klein />
              </div>
            )}
            {(k.phone || k.mobile) && (
              <div style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ flex: 1, minWidth: 0 }}>{k.phone || k.mobile}</span>
                <KopierKnopf wert={k.phone || k.mobile} was="Nummer" klein />
              </div>
            )}
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
                {/* Alle hinterlegten Wege – mehrere E-Mails und Nummern inklusive */}
                {((ansicht.channels || []).length
                  ? (ansicht.channels || []).filter((c) => c.value)
                  : ([
                      ...(ansicht.email ? [{ kind: "email", value: ansicht.email, label: "" }] : []),
                      ...(ansicht.phone ? [{ kind: "phone", value: ansicht.phone, label: "" }] : []),
                      ...(ansicht.mobile ? [{ kind: "mobile", value: ansicht.mobile, label: "" }] : []),
                    ] as Kanal[])
                ).map((c, i) => (
                  <div key={c.id || i} style={{ display: "flex", gap: 12, fontSize: 14, alignItems: "center" }}>
                    <span className="muted" style={{ minWidth: 96, display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <Icon name={KANAL[c.kind]?.icon || "mail"} size={14} /> {KANAL[c.kind]?.label || c.kind}
                    </span>
                    <span style={{ flex: 1, minWidth: 0, wordBreak: "break-all" }}>
                      <Hervorheben text={c.value} suche={suche} />
                      {c.label && <span className="muted" style={{ fontSize: 12 }}> · {c.label}</span>}
                    </span>
                    <KopierKnopf wert={c.value} was={KANAL[c.kind]?.label || "Wert"} />
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

              {/* Private Angaben – zugeklappt, damit sie nicht beiläufig mitgelesen werden */}
              <div style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
                <button className="btn" onClick={() => setPrivatOffen((v) => !v)}>
                  <Icon name="lock" /> Private Angaben
                  <span className="muted" style={{ fontSize: 12 }}>
                    {hatPrivates(ansicht) ? (privatOffen ? " · ausblenden" : " · anzeigen") : " · nichts hinterlegt"}
                  </span>
                </button>
                {privatOffen && (
                  <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                    {([["Telefon privat", ansicht.privatePhone, "phone"],
                       ["Mobil privat", ansicht.privateMobile, "smartphone"],
                       ["E-Mail privat", ansicht.privateEmail, "mail"]] as const).map(([label, wert, icon]) => (
                      <div key={label} style={{ display: "flex", gap: 12, fontSize: 14, alignItems: "center" }}>
                        <span className="muted" style={{ minWidth: 120, display: "flex", alignItems: "center", gap: 6 }}>
                          <Icon name={icon} size={14} /> {label}
                        </span>
                        <span style={{ flex: 1, minWidth: 0, wordBreak: "break-all" }}>{wert || "–"}</span>
                        {wert && (
                          <button className="btn btn-icon" title={`${label} kopieren`} onClick={() => kopieren(wert, label)}>
                            <Icon name="copy" size={14} />
                          </button>
                        )}
                      </div>
                    ))}
                    <div style={{ display: "flex", gap: 12, fontSize: 14 }}>
                      <span className="muted" style={{ minWidth: 120, display: "flex", alignItems: "center", gap: 6 }}>
                        <Icon name="home" size={14} /> Privatanschrift
                      </span>
                      <span style={{ flex: 1 }}>
                        {[ansicht.privateStreet, [ansicht.privateZip, ansicht.privateCity].filter(Boolean).join(" ")]
                          .filter(Boolean).join(", ") || "–"}
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: 12, fontSize: 14 }}>
                      <span className="muted" style={{ minWidth: 120, display: "flex", alignItems: "center", gap: 6 }}>
                        <Icon name="calendar" size={14} /> Geburtstag
                      </span>
                      <span style={{ flex: 1 }}>{datum(ansicht.birthday) || "–"}</span>
                    </div>
                    {ansicht.privateNotes && (
                      <div style={{ display: "flex", gap: 12, fontSize: 14 }}>
                        <span className="muted" style={{ minWidth: 120 }}>Notiz privat</span>
                        <span style={{ flex: 1, whiteSpace: "pre-wrap" }}>{ansicht.privateNotes}</span>
                      </div>
                    )}
                    <div className="muted" style={{ fontSize: 12 }}>
                      Private Angaben bleiben ausschließlich in Nexus – sie werden nicht nach kontor,
                      clocker oder ProjectEye übertragen.
                    </div>
                  </div>
                )}
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
                      <button key={k.id} onClick={() => zeige(k)}
                        style={{ textAlign: "left", padding: "7px 9px", borderRadius: 8, fontSize: 13.5, cursor: "pointer",
                                 border: "1px solid var(--border)", background: "var(--bg)", color: "var(--fg)" }}>
                        <b>{k.name}</b>
                        {k.role ? <span className="muted"> · {k.role}</span> : null}
                        {k.email ? <span className="muted"> · {k.email}</span> : null}
                      </button>
                    ))}
                  </div>
                  <button className="btn" style={{ marginTop: 8 }}
                    onClick={() => bearbeite({ ...leer(), ownerKind: ansicht.ownerKind, ownerId: ansicht.ownerId })}>
                    <Icon name="plus" /> Ansprechpartner bei dieser Firma
                  </button>
                </div>
              )}
            </div>

            <div style={{ padding: "12px 20px", borderTop: "1px solid var(--border)", display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn btn-danger" onClick={() => setLoeschen(ansicht)}><Icon name="trash" /> Entfernen</button>
              <button className="btn btn-primary" onClick={() => { bearbeite({ ...ansicht }); setAnsicht(null); }}>
                <Icon name="pencil" /> Bearbeiten
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Bearbeiten/Anlegen (immer im Pop-up) ── */}
      {editor && (
        <div onClick={editorSchliessen}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", display: "grid", placeItems: "center", padding: 16, zIndex: 65 }}>
          <div onClick={(e) => e.stopPropagation()} className="card dm-fenster"
            style={{ width: 620, maxWidth: "94vw", maxHeight: "90vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10 }}>
              <Icon name="id-card" size={18} />
              <h2 style={{ fontSize: 17, fontWeight: 700, flex: 1 }}>{editor.id ? "Kontakt bearbeiten" : "Neuer Kontakt"}</h2>
              <button className="btn btn-icon" aria-label="Schließen" onClick={editorSchliessen}><Icon name="x" /></button>
            </div>

            <div style={{ padding: 20, overflowY: "auto", display: "grid", gap: 18 }}>
              {/* ── Person ── */}
              <section style={{ display: "grid", gap: 10 }}>
                <div className="muted" style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: ".04em",
                                                display: "flex", alignItems: "center", gap: 6 }}>
                  <Icon name="user" size={14} /> Person
                </div>
                <div className="feld-zeile feld-zeile-2">
                  <Feld label="Vorname" icon="user" wert={editor.firstName || ""} autoFocus
                    setWert={(v) => setEditor({ ...editor, firstName: v })} />
                  <Feld label="Nachname" icon="user" wert={editor.lastName || ""}
                    setWert={(v) => setEditor({ ...editor, lastName: v })} />
                </div>
                <Feld label="Funktion" icon="tag" wert={editor.role || ""} platzhalter="z. B. Einkauf"
                  setWert={(v) => setEditor({ ...editor, role: v })} />
              </section>

              {/* ── Firma ── */}
              <section style={{ display: "grid", gap: 10, borderTop: "1px solid var(--border)", paddingTop: 14 }}>
                <div className="muted" style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: ".04em",
                                                display: "flex", alignItems: "center", gap: 6 }}>
                  <Icon name="building" size={14} /> Firma
                </div>
                <label style={{ fontSize: 13, display: "grid", gap: 4 }}>
                  <span className="muted" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <Icon name="tag" size={14} /> Gehört zu
                  </span>
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
                    <span className="muted" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <Icon name="building" size={14} /> Firma
                    </span>
                    <SuchSelect
                      value={editor.ownerId || ""}
                      onChange={(v) => setEditor({ ...editor, ownerId: v })}
                      platzhalter="— Firma wählen —"
                      suchePlatzhalter="Firma suchen…"
                      options={firmenOptionen(editor.ownerKind)}
                    />
                  </label>
                ) : (
                  <Feld label="Firma / Shop (frei eingetragen)" icon="building" wert={editor.ownerName || ""}
                    platzhalter="z. B. Elektro Meier, Vertretung Nord"
                    hinweis="Kein Kundenstammsatz nötig – der Name steht nur an diesem Kontakt."
                    setWert={(v) => setEditor({ ...editor, ownerName: v })} />
                )}
                <label style={{ fontSize: 13, display: "grid", gap: 4 }}>
                  <span className="muted" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <Icon name="tag" size={14} /> Art des Kontakts
                  </span>
                  <input className="input" list="kontaktarten" value={editor.category || ""}
                    placeholder="z. B. Vertreter, Shop – frei wählbar"
                    onChange={(e) => setEditor({ ...editor, category: e.target.value })} />
                  <datalist id="kontaktarten">
                    {Array.from(new Set([...ARTEN, ...kategorien])).map((k) => <option key={k} value={k} />)}
                  </datalist>
                </label>
              </section>

              {/* ── Erreichbarkeit: beliebig viele E-Mails, Nummern, Webseiten ── */}
              <section style={{ display: "grid", gap: 10, borderTop: "1px solid var(--border)", paddingTop: 14 }}>
                <div className="muted" style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: ".04em",
                                                display: "flex", alignItems: "center", gap: 6 }}>
                  <Icon name="mail" size={14} /> Erreichbarkeit
                </div>

                {(editor.channels || []).map((k, i) => (
                  <div key={i} style={{ display: "flex", gap: 6, alignItems: "flex-end", flexWrap: "wrap" }}>
                    <div style={{ width: 150, flexShrink: 0 }}>
                      <label style={{ fontSize: 13, display: "grid", gap: 4 }}>
                        <span className="muted" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                          <Icon name={KANAL[k.kind]?.icon || "mail"} size={14} /> Art
                        </span>
                        <SuchSelect
                          value={k.kind}
                          onChange={(v) => kanalSetzen(i, { kind: v })}
                          platzhalter="Art"
                          options={Object.entries(KANAL).map(([wert, d]) => ({ value: wert, label: d.label }))}
                        />
                      </label>
                    </div>
                    <div style={{ flex: "2 1 220px", minWidth: 0 }}>
                      <Feld label={KANAL[k.kind]?.label || "Wert"} icon={KANAL[k.kind]?.icon}
                        typ={KANAL[k.kind]?.typ || "text"} wert={k.value}
                        setWert={(v) => kanalSetzen(i, { value: v })} />
                    </div>
                    <div style={{ flex: "1 1 130px", minWidth: 0 }}>
                      <Feld label="Bezeichnung" wert={k.label || ""} kopierbar={false}
                        platzhalter="Zentrale, privat…" setWert={(v) => kanalSetzen(i, { label: v })} />
                    </div>
                    <button type="button" className="btn btn-icon btn-danger" title="Zeile entfernen"
                      style={{ marginBottom: 1 }} onClick={() => kanalWeg(i)}>
                      <Icon name="trash" size={14} />
                    </button>
                  </div>
                ))}

                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {Object.entries(KANAL).map(([wert, d]) => (
                    <button key={wert} type="button" className="btn" onClick={() => kanalHinzu(wert)}>
                      <Icon name="plus" size={14} /> {d.label}
                    </button>
                  ))}
                </div>
                <div className="muted" style={{ fontSize: 12, lineHeight: 1.5 }}>
                  Beliebig viele Einträge je Art möglich. Der <b>erste</b> Eintrag je Art gilt als Hauptwert –
                  nur er geht in den Abgleich mit kontor, clocker und ProjectEye.
                </div>
              </section>

              {/* ── Notiz und Schnellauswahl ── */}
              <section style={{ display: "grid", gap: 10, borderTop: "1px solid var(--border)", paddingTop: 14 }}>
                <label style={{ fontSize: 13, display: "grid", gap: 4 }}>
                  <span className="muted" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <Icon name="file-text" size={14} /> Notiz
                  </span>
                  <textarea className="input" rows={3} value={editor.notes || ""}
                    onChange={(e) => setEditor({ ...editor, notes: e.target.value })} />
                </label>
                <label style={{ fontSize: 13.5, display: "flex", alignItems: "center", gap: 8 }}>
                  <input type="checkbox" checked={!!editor.favorite}
                    onChange={(e) => setEditor({ ...editor, favorite: e.target.checked })} />
                  In die Schnellauswahl aufnehmen
                </label>
              </section>

              {/* ── Private Angaben – zugeklappt; bleiben ausschließlich in Nexus ── */}
              <section style={{ borderTop: "1px solid var(--border)", paddingTop: 14, display: "grid", gap: 10 }}>
                <button type="button" className="btn" onClick={() => setPrivatOffen((v) => !v)} style={{ justifySelf: "start" }}>
                  <Icon name="lock" /> Private Angaben {privatOffen ? "ausblenden" : "hinterlegen"}
                </button>
                {privatOffen && (
                  <>
                    <div className="feld-zeile feld-zeile-2">
                      <Feld label="Telefon privat" icon="phone" typ="tel" wert={editor.privatePhone || ""}
                        setWert={(v) => setEditor({ ...editor, privatePhone: v })} />
                      <Feld label="Mobil privat" icon="smartphone" typ="tel" wert={editor.privateMobile || ""}
                        setWert={(v) => setEditor({ ...editor, privateMobile: v })} />
                    </div>
                    <Feld label="E-Mail privat" icon="mail" typ="email" wert={editor.privateEmail || ""}
                      setWert={(v) => setEditor({ ...editor, privateEmail: v })} />
                    <Feld label="Straße und Hausnummer (privat)" icon="home" wert={editor.privateStreet || ""}
                      setWert={(v) => setEditor({ ...editor, privateStreet: v })} />
                    <div className="feld-zeile feld-zeile-2">
                      <Feld label="PLZ" icon="home" wert={editor.privateZip || ""}
                        setWert={(v) => setEditor({ ...editor, privateZip: v })} />
                      <Feld label="Ort" icon="home" wert={editor.privateCity || ""}
                        setWert={(v) => setEditor({ ...editor, privateCity: v })} />
                    </div>
                    <label style={{ fontSize: 13, display: "grid", gap: 4 }}>
                      <span className="muted" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <Icon name="calendar" size={14} /> Geburtstag
                      </span>
                      <input className="input" type="date" value={editor.birthday ? String(editor.birthday).slice(0, 10) : ""}
                        onChange={(e) => setEditor({ ...editor, birthday: e.target.value ? new Date(e.target.value).toISOString() : null })} />
                    </label>
                    <label style={{ fontSize: 13, display: "grid", gap: 4 }}>
                      <span className="muted">Notiz privat</span>
                      <textarea className="input" rows={3} value={editor.privateNotes || ""}
                        onChange={(e) => setEditor({ ...editor, privateNotes: e.target.value })} />
                    </label>
                    <div className="muted" style={{ fontSize: 12, lineHeight: 1.5 }}>
                      Diese Angaben bleiben <b>ausschließlich in Nexus</b> – der Abgleich überträgt nur die
                      geschäftlichen Felder.
                    </div>
                  </>
                )}
              </section>
            </div>

            <div style={{ padding: "12px 20px", borderTop: "1px solid var(--border)", display: "flex", gap: 8,
                          justifyContent: "flex-end", alignItems: "center", flexWrap: "wrap" }}>
              <span className="muted" style={{ fontSize: 12, marginRight: "auto" }}>
                Eingaben werden laufend als Entwurf gesichert.
              </span>
              <button className="btn" onClick={editorSchliessen}>Abbrechen</button>
              <button className="btn btn-primary" onClick={speichern}><Icon name="save" /> Speichern</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Gefundener Entwurf: weitermachen oder verwerfen ── */}
      {entwurfFrage && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", display: "grid", placeItems: "center", padding: 16, zIndex: 70 }}>
          <div className="card dm-fenster" style={{ width: 460, maxWidth: "94vw", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10 }}>
              <Icon name="file-text" size={18} />
              <h2 style={{ fontSize: 17, fontWeight: 700 }}>Nicht gespeicherter Entwurf</h2>
            </div>
            <div style={{ padding: 20, fontSize: 14, lineHeight: 1.55 }}>
              Von diesem Kontakt liegt ein Entwurf {seitdem(entwurfFrage.zeit)} im Browser – etwa, weil die
              Anmeldung abgelaufen war. Weitermachen oder mit dem gespeicherten Stand beginnen?
            </div>
            <div style={{ padding: "12px 20px", borderTop: "1px solid var(--border)", display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
              <button className="btn btn-danger" onClick={() => {
                entwurfLoeschen(entwurfsSchluessel(entwurfFrage.original.id));
                setEditor(entwurfFrage.original);
                setEntwurfFrage(null);
              }}>
                <Icon name="trash" /> Entwurf verwerfen
              </button>
              <button className="btn btn-primary" onClick={() => { setEditor(entwurfFrage.vorhanden); setEntwurfFrage(null); }}>
                <Icon name="redo" /> Entwurf weiterbearbeiten
              </button>
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
