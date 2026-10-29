"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, getToken } from "@/lib/clientApi";
import Icon from "@/components/Icon";
import SearchInput from "@/components/SearchInput";
import BuchstabenLeiste from "@/components/BuchstabenLeiste";
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

/** Gleichbleibender Farbton je Name – jeder Kontakt behält seine Avatarfarbe. */
function farbton(s: string) {
  let h = 0;
  for (const c of String(s || "")) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

/** Initialen aus Vor- und Nachname (sonst aus dem Anzeigenamen). */
function initialen(k: Partial<Kontakt>) {
  const v = String(k.firstName || "").trim(), n = String(k.lastName || "").trim();
  if (v || n) return ((v[0] || "") + (n[0] || "")).toUpperCase();
  const t = String(k.name || k.ownerName || "?").trim().split(/\s+/);
  return ((t[0]?.[0] || "?") + (t.length > 1 ? t[t.length - 1][0] : "")).toUpperCase();
}

function Avatar({ k, groesse }: { k: Partial<Kontakt>; groesse?: "gross" | "klein" }) {
  const name = String(k.name || [k.firstName, k.lastName].filter(Boolean).join(" ") || "");
  return (
    <span className={`kt-avatar${groesse ? " " + groesse : ""}`} style={{ ["--h" as any]: farbton(name) }} aria-hidden>
      {name ? initialen(k) : <Icon name="user" size={groesse === "gross" ? 30 : 18} />}
    </span>
  );
}

/** Wählbare Links: Nummer → tel: (am Handy öffnet sich direkt das Telefon), Webseite mit https. */
const telLink = (v: string) => "tel:" + String(v || "").replace(/[^\d+]/g, "");
const webLink = (v: string) => (/^https?:\/\//i.test(v) ? v : "https://" + v);
const wegLink = (c: Kanal) =>
  c.kind === "email" ? `mailto:${c.value}` : c.kind === "web" ? webLink(c.value) : c.kind === "fax" ? "" : telLink(c.value);

/** Alle hinterlegten Wege – ältere Datensätze ohne Liste aus den Einzelfeldern. */
function wegeVon(k: Kontakt): Kanal[] {
  if ((k.channels || []).length) return (k.channels || []).filter((c) => c.value);
  return [
    ...(k.email ? [{ kind: "email", value: k.email, label: "" }] : []),
    ...(k.phone ? [{ kind: "phone", value: k.phone, label: "" }] : []),
    ...(k.mobile ? [{ kind: "mobile", value: k.mobile, label: "" }] : []),
  ];
}

/** Anfangsbuchstabe für die A–Z-Gruppen (Nachname zuerst). */
function buchstabe(k: Kontakt) {
  const z = String(k.lastName || k.name || "").trim().charAt(0).toUpperCase();
  const u = ({ Ä: "A", Ö: "O", Ü: "U" } as Record<string, string>)[z] || z;
  return /[A-Z]/.test(u) ? u : "#";
}
const sortSchluessel = (k: Kontakt) => `${k.lastName || k.name || ""} ${k.firstName || ""}`.trim();

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
  // Visitenkarten und andere Bilder des angezeigten Kontakts
  const [bilder, setBilder] = useState<any[]>([]);
  const [grossbild, setGrossbild] = useState<{ id: string; titel: string; url: string } | null>(null);
  const [geraete, setGeraete] = useState<any[]>([]);
  const [scanLaeuft, setScanLaeuft] = useState(false);
  // Speichern-Rückmeldung im Fenster (Kreisel, Fehler im Dialog statt dahinter)
  const [speichert, setSpeichert] = useState(false);
  const [dialogFehler, setDialogFehler] = useState("");

  // Meldungen verschwinden nach ein paar Sekunden von selbst
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(""), 5000);
    return () => clearTimeout(t);
  }, [msg]);

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

  // Scanner einmalig laden – für „Visitenkarte einscannen"
  useEffect(() => {
    api("/api/scanners").then((d) => setGeraete(d.data || [])).catch(() => {});
  }, []);

  // Bilder des gerade angesehenen Kontakts
  const ladeBilder = useCallback(async (id?: string) => {
    if (!id) { setBilder([]); return; }
    try {
      const d = await api(`/api/contact-images?contactId=${id}`);
      setBilder(d.data || []);
    } catch { setBilder([]); }
  }, []);

  useEffect(() => { ladeBilder(ansicht?.id); }, [ansicht?.id, ladeBilder]);

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
    return [...l].sort((a, b) => sortSchluessel(a).localeCompare(sortSchluessel(b), "de", { sensitivity: "base" }));
  }, [rows, art, kategorie]);

  // A–Z-Gruppen für die Kartenansicht
  const gruppen = useMemo(() => {
    const m = new Map<string, Kontakt[]>();
    for (const k of gefiltert) {
      const b = buchstabe(k);
      if (!m.has(b)) m.set(b, []);
      m.get(b)!.push(k);
    }
    return [...m.entries()].sort(([a], [b]) => (a === "#" ? 1 : b === "#" ? -1 : a.localeCompare(b)));
  }, [gefiltert]);

  // Anzahl je Firmenart für die Filterleiste
  const anzahl = useMemo(() => {
    const z: Record<string, number> = { "": rows.length };
    for (const r of rows) z[r.ownerKind] = (z[r.ownerKind] || 0) + 1;
    return z;
  }, [rows]);

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
    if (!editor || speichert) return;
    const vorname = String(editor.firstName || "").trim();
    const nachname = String(editor.lastName || "").trim();
    const name = [vorname, nachname].filter(Boolean).join(" ") || String(editor.name || "").trim();
    if (!name) { setDialogFehler("Bitte mindestens einen Nachnamen eingeben."); return; }
    setSpeichert(true);
    setDialogFehler("");
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
        setDialogFehler("Nicht gespeichert: die Anmeldung ist abgelaufen. Deine Eingaben bleiben erhalten – nach dem Anmelden erneut speichern.");
        return;
      }
      setDialogFehler(e.message || "Speichern fehlgeschlagen");
    } finally {
      setSpeichert(false);
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
    setDialogFehler("");
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

  /** Bild (Visitenkarte, Foto) beim Kontakt hinterlegen. */
  async function bildHochladen(f: File) {
    if (!ansicht) return;
    try {
      const base64: string = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(String(r.result));
        r.onerror = () => rej(new Error("Datei konnte nicht gelesen werden"));
        r.readAsDataURL(f);
      });
      await api("/api/contact-images", {
        method: "POST",
        body: JSON.stringify({ contactId: ansicht.id, base64, title: f.name.replace(/\.[^.]+$/, "") }),
      });
      setMsg("Bild hinterlegt.");
      ladeBilder(ansicht.id);
    } catch (e: any) { setMsg("Fehler: " + e.message); }
  }

  /** Visitenkarte direkt einscannen – die eingelesene Seite wird als Bild hinterlegt. */
  async function visitenkarteScannen() {
    if (!ansicht) return;
    if (!geraete.length) { setMsg("Kein Scanner eingerichtet – auf der Seite Scannen lässt sich einer hinzufügen."); return; }
    setScanLaeuft(true);
    setMsg("Visitenkarte wird eingelesen…");
    try {
      await api(`/api/scanners/${geraete[0].id}/scan`, {
        method: "POST",
        body: JSON.stringify({ contactId: ansicht.id, source: "Platen", resolution: 300 }),
      });
      setMsg("Visitenkarte hinterlegt.");
      ladeBilder(ansicht.id);
    } catch (e: any) { setMsg("Fehler: " + e.message); }
    finally { setScanLaeuft(false); }
  }

  async function bildEntfernen(id: string) {
    try {
      await api(`/api/contact-images/${id}`, { method: "DELETE" });
      ladeBilder(ansicht?.id);
    } catch (e: any) { setMsg("Fehler: " + e.message); }
  }

  /** Bild in voller Größe holen – die API verlangt ein Token, deshalb über fetch. */
  async function bildLaden(id: string): Promise<string> {
    const token = getToken();
    const res = await fetch(`/api/contact-images/${id}/file`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!res.ok) throw new Error(`Bild konnte nicht geladen werden (HTTP ${res.status})`);
    return URL.createObjectURL(await res.blob());
  }

  async function grossAnsehen(id: string, titel: string) {
    try {
      setGrossbild({ id, titel, url: await bildLaden(id) });
    } catch (e: any) { setMsg("Fehler: " + e.message); }
  }

  /** Bild in voller Größe speichern. */
  async function bildSpeichern(id: string, titel: string) {
    let url: string;
    try { url = await bildLaden(id); } catch (e: any) { setMsg("Fehler: " + e.message); return; }
    const a = document.createElement("a");
    a.href = url; a.download = `${titel || "Visitenkarte"}.jpg`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  /** Wie viele **zusätzliche** Einträge gibt es je Art (über den Hauptwert hinaus)? */
  const weitere = (k: Kontakt, art: string) =>
    Math.max(0, (k.channels || []).filter((c) => c.kind === art && c.value).length - 1);

  /** Alle weiteren Ansprechpartner derselben Firma – für die Firmenansicht im Pop-up. */
  const firmenKontakte = (k: Kontakt) =>
    k.ownerId ? rows.filter((r) => r.ownerId === k.ownerId && r.id !== k.id) : [];

  /** Schnellaktionen in Karte und Ansicht dürfen den Klick nicht an die Karte weitergeben. */
  const halt = (e: { stopPropagation(): void }) => e.stopPropagation();

  /** Erste Nummer/E-Mail/Webseite einer Art. */
  const erster = (k: Kontakt, art: string) => wegeVon(k).find((c) => c.kind === art)?.value || "";

  return (
    <div>
      <div className="rv-sticky-header" style={{ display: "grid", gap: 12 }}>
        <div className="kt-kopf">
          <h1 className="kt-titel">
            <Icon name="id-card" size={26} /> Kontakte
            <span className="kt-zahl">{laedt && !rows.length ? "…" : gefiltert.length}</span>
          </h1>
          <button className="btn btn-primary" style={{ marginLeft: "auto" }} onClick={() => bearbeite(leer())}
            title="Kontakt anlegen – mit oder ohne Firma (z. B. Vertreter oder Shop)">
            <Icon name="plus" /> Neuer Kontakt
          </button>
        </div>
        <SearchInput value={suche} onChange={setSuche} placeholder="Name, Firma, E-Mail, Telefon, Funktion…"
          style={{ width: "100%", maxWidth: 560 }} />
        <div className="kt-chips">
          <div className="kt-segment" role="tablist" aria-label="Firmenart">
            {[["", "Alle"], ["customer", "Kunden"], ["supplier", "Lieferanten"], ["organization", "Mandanten"], ["frei", "Frei"]].map(([w, l]) => (
              <button key={w} role="tab" aria-selected={art === w} className={art === w ? "an" : ""} onClick={() => setArt(w)}>
                {l} <small>{anzahl[w] || 0}</small>
              </button>
            ))}
          </div>
        </div>
        {kategorien.length > 0 && (
          <div className="kt-chips">
            <Icon name="tag" size={14} style={{ color: "var(--muted)" }} />
            <button className={`kt-chip${kategorie === "" ? " an" : ""}`} onClick={() => setKategorie("")}>alle Arten</button>
            {kategorien.map((k) => (
              <button key={k} className={`kt-chip${kategorie === k ? " an" : ""}`} onClick={() => setKategorie(kategorie === k ? "" : k)}>
                {k}
              </button>
            ))}
          </div>
        )}
      </div>

      {msg && (
        <div className="kt-meldung" role="status">
          <Icon name="check" size={16} style={{ color: "var(--accent)" }} />
          <span style={{ flex: 1 }}>{msg}</span>
          <button className="btn btn-icon" aria-label="Meldung schließen" style={{ border: 0, background: "transparent" }}
            onClick={() => setMsg("")}><Icon name="x" size={14} /></button>
        </div>
      )}

      {/* ── Schnellauswahl: Favoriten als Avatar-Leiste ── */}
      {favoriten.length > 0 && (
        <div style={{ marginBottom: 4 }}>
          <div className="kt-gruppe" style={{ marginTop: 4 }}>
            <Icon name="star" size={14} style={{ color: "#f59e0b", fill: "#f59e0b" }} /> Favoriten
          </div>
          <div className="kt-favs">
            {favoriten.map((k) => (
              <button key={k.id} className="kt-fav" onClick={() => zeige(k)} title={[k.name, k.ownerName].filter(Boolean).join(" · ")}>
                <Avatar k={k} />
                <span>{k.firstName || k.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Karten, nach Nachnamen A–Z gruppiert ── */}
      <BuchstabenLeiste vorhanden={gruppen.map(([b]) => b)} />
      {gruppen.map(([b, liste]) => (
        <section key={b}>
          <div className="kt-gruppe" data-buchstabe={b}>{b}</div>
          <div className="kt-raster">
            {liste.map((k) => {
              const nummer = k.phone || k.mobile || erster(k, "phone") || erster(k, "mobile");
              const mail = k.email || erster(k, "email");
              const mehrNummern = weitere(k, "phone") + weitere(k, "mobile") + (k.phone && k.mobile ? 1 : 0);
              return (
                <article key={k.id} className="kt-karte" onClick={() => zeige(k)}>
                  <button className={`kt-stern${k.favorite ? " an" : ""}`} onClick={(e) => { halt(e); stern(k); }}
                    title={k.favorite ? "Aus den Favoriten nehmen" : "Zu den Favoriten"}>
                    <Icon name="star" size={17} style={k.favorite ? { fill: "currentColor" } : undefined} />
                  </button>
                  <div className="kt-karte-kopf">
                    <Avatar k={k} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div className="kt-name"><Hervorheben text={k.name} suche={suche} /></div>
                      <div className="kt-unter">
                        {k.role && <Hervorheben text={k.role} suche={suche} />}
                        {k.role && k.ownerName ? " · " : ""}
                        {k.ownerName ? <Hervorheben text={k.ownerName} suche={suche} /> : !k.role ? "ohne Firma" : null}
                      </div>
                    </div>
                  </div>

                  {(nummer || mail) && (
                    <div style={{ display: "grid", gap: 3 }} onClick={halt}>
                      {nummer && (
                        <div className="kt-zeile">
                          <Icon name="phone" size={14} />
                          <a href={telLink(nummer)} title="Anrufen"><Hervorheben text={nummer} suche={suche} /></a>
                          <KopierKnopf wert={nummer} was="Nummer" klein />
                          {mehrNummern > 0 && <span style={{ fontSize: 11.5 }}>+{mehrNummern}</span>}
                        </div>
                      )}
                      {mail && (
                        <div className="kt-zeile">
                          <Icon name="mail" size={14} />
                          <a href={`mailto:${mail}`} title="E-Mail schreiben"><Hervorheben text={mail} suche={suche} /></a>
                          <KopierKnopf wert={mail} was="E-Mail" klein />
                          {weitere(k, "email") > 0 && <span style={{ fontSize: 11.5 }}>+{weitere(k, "email")}</span>}
                        </div>
                      )}
                    </div>
                  )}

                  {(k.category || k.ownerKind !== "frei") && (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {k.ownerKind !== "frei" && <span className="kt-badge akzent">{ART_LABEL[k.ownerKind] || k.ownerKind}</span>}
                      {k.category && <span className="kt-badge"><Hervorheben text={k.category} suche={suche} /></span>}
                    </div>
                  )}

                  <div className="kt-aktionen" onClick={halt}>
                    <a className="kt-aktion gruen" href={nummer ? telLink(nummer) : undefined} aria-disabled={!nummer}
                      title={nummer ? `${nummer} anrufen` : "Keine Nummer hinterlegt"}>
                      <Icon name="phone" size={14} /> Anrufen
                    </a>
                    <a className="kt-aktion" href={mail ? `mailto:${mail}` : undefined} aria-disabled={!mail}
                      title={mail ? `E-Mail an ${mail}` : "Keine E-Mail hinterlegt"}>
                      <Icon name="mail" size={14} /> E-Mail
                    </a>
                    <button className="kt-aktion grau" title="Bearbeiten" aria-label="Bearbeiten" onClick={() => bearbeite({ ...k })}>
                      <Icon name="pencil" size={14} />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ))}

      {!laedt && gefiltert.length === 0 && (
        <div className="kt-leer">
          <Icon name="users" size={36} />
          <div style={{ fontSize: 15, fontWeight: 600, color: "var(--fg)" }}>
            {suche || art || kategorie ? "Kein Kontakt passt zur Suche" : "Noch keine Kontakte"}
          </div>
          {suche || art || kategorie ? (
            <button className="btn" onClick={() => setSeite({ q: "", art: "", kategorie: "" })}><Icon name="x" /> Filter zurücksetzen</button>
          ) : (
            <button className="btn btn-primary" onClick={() => bearbeite(leer())}><Icon name="plus" /> Ersten Kontakt anlegen</button>
          )}
        </div>
      )}

      {/* ── Ansicht: Kontakt + Firma ── */}
      {ansicht && (() => {
        const wege = wegeVon(ansicht);
        const schnell = ([
          ["phone", "Anrufen", "phone", "#10b981"],
          ["mobile", "Mobil", "smartphone", "#0ea5e9"],
          ["email", "E-Mail", "mail", "#6366f1"],
          ["web", "Webseite", "globe", "#f59e0b"],
        ] as const).map(([art, label, icon, farbe]) => ({ art, label, icon, farbe, wert: erster(ansicht, art) })).filter((s) => s.wert);
        return (
          <div className="kt-huelle" style={{ zIndex: 60 }} onClick={() => setAnsicht(null)}>
            <div onClick={(e) => e.stopPropagation()} className="card dm-fenster kt-fenster">
              <div className="kt-held" style={{ ["--h" as any]: farbton(ansicht.name) }}>
                <Avatar k={ansicht} groesse="gross" />
                <div style={{ flex: 1, minWidth: 0, paddingRight: 70 }}>
                  <h2>{ansicht.name}</h2>
                  <div className="muted" style={{ fontSize: 13.5, marginTop: 2 }}>
                    {[ansicht.role, ansicht.ownerName || "ohne Firma"].filter(Boolean).join(" · ")}
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                    {ansicht.ownerKind !== "frei" && <span className="kt-badge akzent">{ART_LABEL[ansicht.ownerKind]}</span>}
                    {ansicht.category && <span className="kt-badge">{ansicht.category}</span>}
                    <span className="kt-badge">aus {HERKUNFT[ansicht.source] || ansicht.source}</span>
                  </div>
                </div>
                <div className="kt-held-knoepfe">
                  <button className={ansicht.favorite ? "an" : ""} title={ansicht.favorite ? "Aus den Favoriten" : "Zu den Favoriten"}
                    onClick={() => { stern(ansicht); setAnsicht({ ...ansicht, favorite: !ansicht.favorite }); }}>
                    <Icon name="star" size={17} style={ansicht.favorite ? { fill: "currentColor" } : undefined} />
                  </button>
                  <button aria-label="Schließen" title="Schließen" onClick={() => setAnsicht(null)}><Icon name="x" size={17} /></button>
                </div>
              </div>

              <div className="kt-inhalt">
                {/* Ein Tipp genügt: anrufen, schreiben, Webseite öffnen */}
                {schnell.length > 0 && (
                  <div className="kt-schnell">
                    {schnell.map((s) => (
                      <a key={s.art} href={s.art === "web" ? webLink(s.wert) : s.art === "email" ? `mailto:${s.wert}` : telLink(s.wert)}
                        target={s.art === "web" ? "_blank" : undefined} rel={s.art === "web" ? "noopener noreferrer" : undefined}
                        title={s.wert}>
                        <span className="kt-rund" style={{ background: s.farbe }}><Icon name={s.icon} size={18} /></span>
                        {s.label}
                      </a>
                    ))}
                  </div>
                )}

                {/* Alle Wege – mehrere E-Mails und Nummern inklusive, je mit Kopieren und Anrufen */}
                <div className="kt-block">
                  <div className="kt-block-titel"><Icon name="phone" size={13} /> Erreichbarkeit</div>
                  {wege.length === 0 && <div className="kt-block-inhalt muted" style={{ fontSize: 13.5 }}>Noch nichts hinterlegt.</div>}
                  {wege.map((c, i) => {
                    const link = wegLink(c);
                    return (
                      <div key={c.id || i} className="kt-weg">
                        <span className="kt-weg-icon"><Icon name={KANAL[c.kind]?.icon || "mail"} size={16} /></span>
                        <div className="kt-weg-text">
                          <small>{KANAL[c.kind]?.label || c.kind}{c.label ? ` · ${c.label}` : ""}</small>
                          {link ? (
                            <a href={link} target={c.kind === "web" ? "_blank" : undefined}
                              rel={c.kind === "web" ? "noopener noreferrer" : undefined}>
                              <Hervorheben text={c.value} suche={suche} />
                            </a>
                          ) : <span className="w"><Hervorheben text={c.value} suche={suche} /></span>}
                        </div>
                        <KopierKnopf wert={c.value} was={KANAL[c.kind]?.label || "Wert"} />
                        {(c.kind === "phone" || c.kind === "mobile") && (
                          <a className="kt-anruf" href={telLink(c.value)} title={`${c.value} anrufen`} aria-label={`${c.value} anrufen`}>
                            <Icon name="phone" size={15} />
                          </a>
                        )}
                      </div>
                    );
                  })}
                </div>

                {ansicht.notes && (
                  <div className="kt-block">
                    <div className="kt-block-titel"><Icon name="file-text" size={13} /> Notiz</div>
                    <div className="kt-block-inhalt" style={{ fontSize: 14, whiteSpace: "pre-wrap" }}>{ansicht.notes}</div>
                  </div>
                )}

                {/* Visitenkarte und weitere Bilder */}
                <div className="kt-block">
                  <div className="kt-block-titel"><Icon name="id-card" size={13} /> Visitenkarte und Bilder</div>
                  <div className="kt-block-inhalt">
                    {bilder.length > 0 && (
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                        {bilder.map((b) => (
                          <div key={b.id} style={{ display: "grid", gap: 4, justifyItems: "center" }}>
                            <button type="button" title="Groß ansehen" onClick={() => grossAnsehen(b.id, b.title)}
                              style={{ border: 0, background: "transparent", padding: 0, cursor: "zoom-in", lineHeight: 0 }}>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={b.thumb || "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=="} alt={b.title}
                                style={{ width: 128, height: 80, objectFit: "cover", borderRadius: 10,
                                         border: "1px solid var(--border)", background: "#fff" }} />
                            </button>
                            <div style={{ display: "flex", gap: 2, alignItems: "center" }}>
                              <span className="muted" style={{ fontSize: 11.5, maxWidth: 70, overflow: "hidden",
                                                               textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.title}</span>
                              <button className="btn btn-icon" title="Speichern" style={{ border: 0 }} onClick={() => bildSpeichern(b.id, b.title)}>
                                <Icon name="download" size={13} />
                              </button>
                              <button className="btn btn-icon btn-danger" title="Entfernen" style={{ border: 0 }} onClick={() => bildEntfernen(b.id)}>
                                <Icon name="trash" size={13} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                      <label className="btn" style={{ cursor: "pointer" }} title="Foto der Visitenkarte aufnehmen oder Bild wählen">
                        <Icon name="image" /> Foto / Bild
                        <input type="file" accept="image/*" capture="environment" style={{ display: "none" }}
                          onChange={(e) => { const f = e.target.files?.[0]; if (f) bildHochladen(f); e.target.value = ""; }} />
                      </label>
                      <button className="btn" disabled={!geraete.length || scanLaeuft} onClick={visitenkarteScannen}
                        title={geraete.length ? "Visitenkarte am Scanner einlesen" : "Kein Scanner eingerichtet"}>
                        {scanLaeuft ? <span className="speichern-dreh" style={{ borderColor: "rgba(0,0,0,.15)", borderTopColor: "var(--accent)" }} />
                          : <Icon name="printer" />} {scanLaeuft ? "Liest ein…" : "Einscannen"}
                      </button>
                      {bilder.length === 0 && (
                        <span className="muted" style={{ fontSize: 12.5 }}>Vorder- und Rückseite einfach nacheinander einlesen.</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Private Angaben – zugeklappt, damit sie nicht beiläufig mitgelesen werden */}
                <div className="kt-block">
                  <button type="button" className="kt-block-titel" onClick={() => setPrivatOffen((v) => !v)}
                    style={{ width: "100%", border: 0, cursor: "pointer", borderBottom: privatOffen ? undefined : 0 }}>
                    <Icon name="lock" size={13} /> Private Angaben
                    <span style={{ marginLeft: "auto", textTransform: "none", letterSpacing: 0, fontWeight: 500 }}>
                      {hatPrivates(ansicht) ? (privatOffen ? "ausblenden" : "anzeigen") : "nichts hinterlegt"}
                    </span>
                    <Icon name="chevron-down" size={14} style={{ transform: privatOffen ? "rotate(180deg)" : undefined, transition: "transform .2s" }} />
                  </button>
                  {privatOffen && (
                    <>
                      {([["Telefon privat", ansicht.privatePhone, "phone"],
                         ["Mobil privat", ansicht.privateMobile, "smartphone"],
                         ["E-Mail privat", ansicht.privateEmail, "mail"]] as const).filter(([, w]) => w).map(([label, wert, icon]) => (
                        <div key={label} className="kt-weg">
                          <span className="kt-weg-icon"><Icon name={icon} size={16} /></span>
                          <div className="kt-weg-text">
                            <small>{label}</small>
                            <a href={icon === "mail" ? `mailto:${wert}` : telLink(wert)}>{wert}</a>
                          </div>
                          <button className="btn btn-icon" title={`${label} kopieren`} onClick={() => kopieren(wert, label)}>
                            <Icon name="copy" size={14} />
                          </button>
                          {icon !== "mail" && (
                            <a className="kt-anruf" href={telLink(wert)} title={`${label} anrufen`} aria-label={`${label} anrufen`}>
                              <Icon name="phone" size={15} />
                            </a>
                          )}
                        </div>
                      ))}
                      {(ansicht.privateStreet || ansicht.privateZip || ansicht.privateCity) && (
                        <div className="kt-weg">
                          <span className="kt-weg-icon"><Icon name="home" size={16} /></span>
                          <div className="kt-weg-text">
                            <small>Privatanschrift</small>
                            <span className="w">
                              {[ansicht.privateStreet, [ansicht.privateZip, ansicht.privateCity].filter(Boolean).join(" ")].filter(Boolean).join(", ")}
                            </span>
                          </div>
                        </div>
                      )}
                      {ansicht.birthday && (
                        <div className="kt-weg">
                          <span className="kt-weg-icon"><Icon name="calendar" size={16} /></span>
                          <div className="kt-weg-text"><small>Geburtstag</small><span className="w">{datum(ansicht.birthday)}</span></div>
                        </div>
                      )}
                      {ansicht.privateNotes && (
                        <div className="kt-weg">
                          <span className="kt-weg-icon"><Icon name="file-text" size={16} /></span>
                          <div className="kt-weg-text"><small>Notiz privat</small><span className="w" style={{ whiteSpace: "pre-wrap" }}>{ansicht.privateNotes}</span></div>
                        </div>
                      )}
                      <div className="kt-block-inhalt muted" style={{ fontSize: 12 }}>
                        Private Angaben bleiben ausschließlich in Nexus – sie werden nicht nach kontor, clocker oder ProjectEye übertragen.
                      </div>
                    </>
                  )}
                </div>

                {/* Firmenansicht: weitere Ansprechpartner derselben Firma */}
                {ansicht.ownerId && (
                  <div className="kt-block">
                    <div className="kt-block-titel"><Icon name="building" size={13} /> {ansicht.ownerName} · weitere Ansprechpartner</div>
                    <div className="kt-block-inhalt" style={{ gap: 2, padding: 6 }}>
                      {firmenKontakte(ansicht).length === 0 && (
                        <div className="muted" style={{ fontSize: 13, padding: "6px 8px" }}>Kein weiterer Ansprechpartner hinterlegt.</div>
                      )}
                      {firmenKontakte(ansicht).map((k) => (
                        <button key={k.id} className="kt-kollege" onClick={() => zeige(k)}>
                          <Avatar k={k} groesse="klein" />
                          <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            <b>{k.name}</b>{k.role ? <span className="muted"> · {k.role}</span> : null}
                          </span>
                          {(k.phone || k.mobile) && (
                            <a className="kt-anruf" href={telLink(k.phone || k.mobile)} onClick={halt}
                              title={`${k.phone || k.mobile} anrufen`} aria-label="Anrufen" style={{ width: 30, height: 30 }}>
                              <Icon name="phone" size={13} />
                            </a>
                          )}
                        </button>
                      ))}
                      <button className="btn" style={{ justifySelf: "start", margin: 6 }}
                        onClick={() => bearbeite({ ...leer(), ownerKind: ansicht.ownerKind, ownerId: ansicht.ownerId })}>
                        <Icon name="plus" /> Ansprechpartner bei dieser Firma
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="kt-fuss">
                <button className="btn btn-danger" style={{ marginRight: "auto" }} onClick={() => setLoeschen(ansicht)}>
                  <Icon name="trash" /> Entfernen
                </button>
                <button className="btn btn-primary" onClick={() => { bearbeite({ ...ansicht }); setAnsicht(null); }}>
                  <Icon name="pencil" /> Bearbeiten
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Bild groß ansehen ── */}
      {grossbild && (
        <div className="bild-fenster" onClick={() => { URL.revokeObjectURL(grossbild.url); setGrossbild(null); }}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.8)", display: "grid",
                   gridTemplateRows: "auto 1fr", zIndex: 80 }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
                     background: "var(--bg)", borderBottom: "1px solid var(--border)" }}>
            <Icon name="id-card" size={16} />
            <span style={{ fontSize: 14, fontWeight: 600, flex: 1, minWidth: 0, overflow: "hidden",
                           textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{grossbild.titel}</span>
            <button className="btn" onClick={() => bildSpeichern(grossbild.id, grossbild.titel)}>
              <Icon name="download" /> <span className="btn-label">Speichern</span>
            </button>
            <button className="btn btn-icon" aria-label="Schließen"
              onClick={() => { URL.revokeObjectURL(grossbild.url); setGrossbild(null); }}><Icon name="x" /></button>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={grossbild.url} alt={grossbild.titel}
            style={{ width: "100%", height: "100%", objectFit: "contain", padding: 12 }} />
        </div>
      )}

      {/* ── Bearbeiten/Anlegen (immer im Pop-up) ── */}
      {editor && (() => {
        const vorschauName = [editor.firstName, editor.lastName].filter(Boolean).join(" ").trim();
        const firmaName = editor.ownerKind && editor.ownerKind !== "frei"
          ? firmenOptionen(editor.ownerKind).find((f: any) => f.value === editor.ownerId)?.label || ""
          : editor.ownerName || "";
        const artVorschlaege = Array.from(new Set([...ARTEN, ...kategorien]));
        return (
          <div className="kt-huelle" style={{ zIndex: 65 }} onClick={editorSchliessen}>
            <div onClick={(e) => e.stopPropagation()} className="card dm-fenster kt-fenster" style={{ width: 660 }}>
              <div className="kt-held" style={{ ["--h" as any]: farbton(vorschauName), padding: "16px 20px" }}>
                <Avatar k={{ ...editor, name: vorschauName }} />
                <div style={{ flex: 1, minWidth: 0, paddingRight: 40 }}>
                  <div className="muted" style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".05em" }}>
                    {editor.id ? "Kontakt bearbeiten" : "Neuer Kontakt"}
                  </div>
                  <h2 style={{ fontSize: 19 }}>{vorschauName || <span className="muted" style={{ fontWeight: 500 }}>Name eingeben…</span>}</h2>
                  {(editor.role || firmaName) && (
                    <div className="muted" style={{ fontSize: 13 }}>{[editor.role, firmaName].filter(Boolean).join(" · ")}</div>
                  )}
                </div>
                <div className="kt-held-knoepfe">
                  <button aria-label="Schließen" title="Schließen" onClick={editorSchliessen}><Icon name="x" size={17} /></button>
                </div>
              </div>

              <div className="kt-inhalt">
                {/* ── Person ── */}
                <section className="kt-abschnitt">
                  <div className="kt-abschnitt-titel"><span className="ic"><Icon name="user" size={15} /></span> Person</div>
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
                <section className="kt-abschnitt">
                  <div className="kt-abschnitt-titel"><span className="ic"><Icon name="building" size={15} /></span> Firma</div>
                  <div className="kt-segment" role="tablist" aria-label="Gehört zu">
                    {[["frei", "Ohne Firma"], ["customer", "Kunde"], ["supplier", "Lieferant"], ["organization", "Mandant"]].map(([w, l]) => (
                      <button key={w} type="button" role="tab" aria-selected={(editor.ownerKind || "frei") === w}
                        className={(editor.ownerKind || "frei") === w ? "an" : ""}
                        onClick={() => setEditor({ ...editor, ownerKind: w, ownerId: "" })}>{l}</button>
                    ))}
                  </div>
                  {editor.ownerKind && editor.ownerKind !== "frei" ? (
                    <label style={{ fontSize: 13, display: "grid", gap: 4 }}>
                      <span className="muted" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <Icon name="building" size={14} /> {ART_LABEL[editor.ownerKind]}
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
                  <Feld label="Art des Kontakts" icon="tag" wert={editor.category || ""} kopierbar={false}
                    platzhalter="frei wählbar oder unten antippen"
                    setWert={(v) => setEditor({ ...editor, category: v })} />
                  <div className="kt-chips" style={{ marginTop: -4 }}>
                    {artVorschlaege.map((a) => (
                      <button key={a} type="button" className={`kt-chip${(editor.category || "") === a ? " an" : ""}`}
                        onClick={() => setEditor({ ...editor, category: (editor.category || "") === a ? "" : a })}>{a}</button>
                    ))}
                  </div>
                </section>

                {/* ── Erreichbarkeit: beliebig viele E-Mails, Nummern, Webseiten ── */}
                <section className="kt-abschnitt">
                  <div className="kt-abschnitt-titel">
                    <span className="ic"><Icon name="phone" size={15} /></span> Erreichbarkeit
                    <small>erster Eintrag je Art = Hauptwert</small>
                  </div>
                  {(editor.channels || []).map((k, i) => (
                    <div key={i} className="kt-kanal">
                      <label className="k-art" style={{ fontSize: 13, display: "grid", gap: 4 }}>
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
                      <div className="k-wert" style={{ minWidth: 0 }}>
                        <Feld label={KANAL[k.kind]?.label || "Wert"} icon={KANAL[k.kind]?.icon}
                          typ={KANAL[k.kind]?.typ || "text"} wert={k.value}
                          setWert={(v) => kanalSetzen(i, { value: v })} />
                      </div>
                      <div className="k-bez" style={{ minWidth: 0 }}>
                        <Feld label="Bezeichnung" wert={k.label || ""} kopierbar={false}
                          platzhalter="Zentrale, privat…" setWert={(v) => kanalSetzen(i, { label: v })} />
                      </div>
                      <button type="button" className="btn btn-icon btn-danger k-weg" title="Zeile entfernen"
                        aria-label="Zeile entfernen" style={{ alignSelf: "end" }} onClick={() => kanalWeg(i)}>
                        <Icon name="trash" size={14} />
                      </button>
                    </div>
                  ))}
                  <div className="kt-chips">
                    {Object.entries(KANAL).map(([wert, d]) => (
                      <button key={wert} type="button" className="kt-chip" onClick={() => kanalHinzu(wert)}
                        style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                        <Icon name="plus" size={13} /> {d.label}
                      </button>
                    ))}
                  </div>
                  <div className="muted" style={{ fontSize: 12, lineHeight: 1.5 }}>
                    Nur der erste Eintrag je Art geht in den Abgleich mit kontor, clocker und ProjectEye.
                  </div>
                </section>

                {/* ── Notiz und Favorit ── */}
                <section className="kt-abschnitt">
                  <div className="kt-abschnitt-titel"><span className="ic"><Icon name="file-text" size={15} /></span> Notiz</div>
                  <textarea className="input" rows={3} value={editor.notes || ""} placeholder="Was man zu diesem Kontakt wissen sollte…"
                    onChange={(e) => setEditor({ ...editor, notes: e.target.value })} />
                  <button type="button" className={`kt-schalter${editor.favorite ? " an" : ""}`} role="switch" aria-checked={!!editor.favorite}
                    onClick={() => setEditor({ ...editor, favorite: !editor.favorite })}>
                    <i /> <Icon name="star" size={15} style={{ color: "#f59e0b", fill: editor.favorite ? "#f59e0b" : "none" }} />
                    Als Favorit oben anzeigen
                  </button>
                </section>

                {/* ── Private Angaben – zugeklappt; bleiben ausschließlich in Nexus ── */}
                <section className="kt-abschnitt">
                  <button type="button" className="kt-abschnitt-titel" onClick={() => setPrivatOffen((v) => !v)}
                    style={{ border: 0, background: "transparent", color: "var(--fg)", cursor: "pointer", padding: 0, width: "100%", textAlign: "left" }}>
                    <span className="ic"><Icon name="lock" size={15} /></span> Private Angaben
                    <small style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                      bleiben nur in Nexus
                      <Icon name="chevron-down" size={14} style={{ transform: privatOffen ? "rotate(180deg)" : undefined, transition: "transform .2s" }} />
                    </small>
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
                        <span className="muted" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                          <Icon name="file-text" size={14} /> Notiz privat
                        </span>
                        <textarea className="input" rows={3} value={editor.privateNotes || ""}
                          onChange={(e) => setEditor({ ...editor, privateNotes: e.target.value })} />
                      </label>
                    </>
                  )}
                </section>

                {dialogFehler && <div className="kt-fehler" role="alert"><Icon name="alert" size={16} /> {dialogFehler}</div>}
              </div>

              <div className="kt-fuss">
                <span className="muted only-desktop" style={{ fontSize: 12, marginRight: "auto" }}>
                  Eingaben werden laufend als Entwurf gesichert.
                </span>
                <button className="btn" onClick={editorSchliessen} disabled={speichert}>Abbrechen</button>
                <button className="btn btn-primary" onClick={speichern} disabled={speichert}>
                  {speichert ? <span className="speichern-dreh" /> : <Icon name="save" />} {speichert ? "Speichert…" : "Speichern"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

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
