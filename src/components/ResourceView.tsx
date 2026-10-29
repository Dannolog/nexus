"use client";
import { Fragment, useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { api, ConflictError } from "@/lib/clientApi";
import { RESOURCES, Field } from "@/lib/uiSchema";
import ConfirmDialog from "@/components/ConfirmDialog";
import SearchInput from "@/components/SearchInput";
import Hervorheben, { sucheBegriffe } from "@/components/Hervorheben";
import AnsprechpartnerListe from "@/components/AnsprechpartnerListe";
import Toggle from "@/components/Toggle";
import Icon from "@/components/Icon";
import ColorPicker from "@/components/ColorPicker";
import { spaltenIcon } from "@/lib/spaltenIcons";
import { useLive } from "@/lib/live";
import { useSeitenZustand } from "@/lib/seitenzustand";
import SuchSelect from "@/components/SuchSelect";
import TextField from "@/components/TextField";
import { KopierKnopf } from "@/components/KontaktFeld";
import TelefonListe, { TelefonAnzeige } from "@/components/TelefonListe";
import BuchstabenLeiste, { anfangsBuchstabe, vergleicheAZ } from "@/components/BuchstabenLeiste";

const LOGO_RESOURCES = ["customers", "organizations"];

/**
 * Sprung vom Mitarbeiter zu seinem Zugang in der Userverwaltung: gesucht wird dort über
 * die E-Mail (Anmeldekennung), ersatzweise über den Namen. `open=1` öffnet die
 * Zugangseinstellungen sofort – gibt es noch keinen Zugang, den Anlegen-Dialog mit
 * E-Mail und Name des Mitarbeiters vorausgefüllt.
 */
function userVerwaltungHref(row: any) {
  const p = new URLSearchParams({
    q: String(row.email || row.name || "").trim(),
    open: "1",
    mail: String(row.email || "").trim(),
    name: String(row.name || "").trim(),
  });
  return `/identities?${p.toString()}`;
}

/**
 * Ansprechpartner eines Datensatzes, die zur Suche passen (für die Trefferanzeige).
 * Bei mehreren Begriffen genügt **ein** passender Begriff, damit der Kontakt als Fundstelle
 * angezeigt wird – die Firma selbst erfüllt die übrigen Begriffe bereits.
 */
function passendeKontakte(row: any, suche: string) {
  const teile = sucheBegriffe(suche).map((t) => t.toLowerCase());
  if (teile.length === 0 || !Array.isArray(row?.contacts)) return [];
  return row.contacts.filter((k: any) => {
    const text = ["name", "role", "email", "phone", "mobile"].map((f) => String(k?.[f] || "")).join(" ").toLowerCase();
    return teile.some((t) => text.includes(t));
  });
}

/**
 * Beschriftung eines Eingabefeldes – **immer mit Symbol**. Das Symbol kommt aus derselben
 * Zuordnung wie die Tabellenköpfe (`spaltenIcon`), damit Liste und Formular zusammenpassen.
 */
function FeldLabel({ feld }: { feld: Field }) {
  const icon = spaltenIcon(feld.key, feld.label);
  return (
    <span className="muted" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      {icon && <Icon name={icon} size={14} />} {feld.label}
    </span>
  );
}

function cell(v: any) {
  if (typeof v === "boolean") return v ? "ja" : "–";
  if (v == null || v === "") return "–";
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v)) return new Date(v).toLocaleDateString("de-DE");
  return String(v);
}

export default function ResourceView({ resourceKey }: { resourceKey: string }) {
  const R = RESOURCES[resourceKey];
  const hasLogo = LOGO_RESOURCES.includes(resourceKey);
  const thumbField = R.thumbField; // Bild-URL-Feld → Thumbnail in Liste/Karten
  const [rows, setRows] = useState<any[]>([]);
  const [logos, setLogos] = useState<Record<string, string>>({});
  // Suchbegriff bleibt erhalten: in der Adresszeile und beim Zurückkommen auf die Seite
  const [seite, setSeite] = useSeitenZustand(`liste:${resourceKey}`, { q: "", sort: "az" });
  const search = seite.q;
  const setSearch = (v: string) => setSeite({ q: v });
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<any | null>(null); // null=zu, {}=neu, {..}=bearbeiten
  const [deleting, setDeleting] = useState<any | null>(null);
  const [viewing, setViewing] = useState<any | null>(null); // Detail-Vorschau (bei R.detail)
  const klickTimer = useRef<ReturnType<typeof setTimeout> | null>(null); // trennt Einzel- von Doppelklick
  const [msg, setMsg] = useState("");
  // Großansicht eines Logos bzw. Bildes – mit Möglichkeit zum Herunterladen
  const [bild, setBild] = useState<{ src: string; name: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await api(`/api/${R.key}?search=${encodeURIComponent(search)}`);
      setRows(d.data);
      // Firmenlogos asynchron nachladen (blockiert die Liste nicht)
      if (hasLogo) {
        for (const row of d.data) {
          api(`/api/${R.key}/${row.id}/logo`)
            .then((r) => { if (r.logo) setLogos((prev) => ({ ...prev, [row.id]: r.logo })); })
            .catch(() => {});
        }
      }
    } finally {
      setLoading(false);
    }
  }, [R.key, search, hasLogo]);

  useEffect(() => { load(); }, [load]);

  // Änderungen aus anderen Fenstern oder aus dem Abgleich sofort übernehmen –
  // die Entität dieser Liste plus die Ansprechpartner, die in ihr mit angezeigt werden.
  useLive([R.entity, "Contact"], load);

  /** Speichert und liefert bei Fehlern den Text zurück – das Fenster zeigt ihn selbst an. */
  async function save(form: any): Promise<string | null> {
    try {
      if (form.id) {
        await api(`/api/${R.key}/${form.id}`, {
          method: "PATCH",
          body: JSON.stringify({ ...form, expectedVersion: form.version }),
        });
        setMsg(`${R.einzahl || "Eintrag"} gespeichert.`);
        if (hasLogo && form.logo !== undefined) setLogos((prev) => ({ ...prev, [form.id]: form.logo }));
      } else {
        await api(`/api/${R.key}`, { method: "POST", body: JSON.stringify(form) });
        setMsg(`${R.einzahl || "Eintrag"} angelegt.`);
      }
      setEditing(null);
      load();
      return null;
    } catch (e: any) {
      if (e instanceof ConflictError) {
        setEditing({ ...e.current });
        load();
        return "Versionskonflikt – der Datensatz wurde zwischenzeitlich geändert. Der aktuelle Stand ist geladen, bitte Änderung erneut eintragen.";
      }
      return e.message || "Speichern fehlgeschlagen";
    }
  }

  async function remove(row: any) {
    try {
      await api(`/api/${R.key}/${row.id}?expectedVersion=${row.version}`, { method: "DELETE" });
      setMsg("Gelöscht (im Verlauf wiederherstellbar).");
      load();
    } catch (e: any) {
      setMsg("Fehler: " + e.message);
    } finally {
      setDeleting(null);
    }
  }

  // Meldungen verschwinden nach ein paar Sekunden von selbst
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(""), 5000);
    return () => clearTimeout(t);
  }, [msg]);

  /** Klick auf eine Zeile: Vorschau (sofern vorhanden), sonst direkt bearbeiten. */
  function zeileKlick(row: any) {
    if (!R.detail) { setEditing({ ...row }); return; }
    if (klickTimer.current) return;
    klickTimer.current = setTimeout(() => { klickTimer.current = null; setViewing(row); }, 220);
  }
  function zeileDoppel(row: any) {
    if (klickTimer.current) { clearTimeout(klickTimer.current); klickTimer.current = null; }
    setViewing(null);
    setEditing({ ...row });
  }

  /** Bild/Logo oder Initialen vor dem Titel – jede Zeile wird auf einen Blick erkennbar. */
  const vorschau = (row: any, gross?: boolean) => {
    const g = gross ? 44 : 36;
    if (hasLogo && logos[row.id]) return <LogoThumb src={logos[row.id]} groesse={g} onClick={() => setBild({ src: logos[row.id], name: `${cell(row[R.titleField])}-Logo` })} />;
    if (thumbField && row[thumbField]) return <LogoThumb src={row[thumbField]} groesse={g} onClick={() => setBild({ src: row[thumbField], name: cell(row[R.titleField]) })} />;
    return <Initialen text={String(row[R.titleField] || "")} farbe={row.color} groesse={g} />;
  };

  /** Zellwert: Ja/Nein und Archiv als Abzeichen, E-Mail anklickbar mit Kopieren, sonst Text mit Treffer. */
  const zelle = (row: any, key: string) => {
    const v = row[key];
    if (typeof v === "boolean") {
      if (key === "archived") return v ? <span className="abzeichen gelb"><Icon name="archive" size={11} /> archiviert</span> : <span className="muted">–</span>;
      return v ? <span className="abzeichen gruen"><Icon name="check" size={11} /> ja</span> : <span className="muted">–</span>;
    }
    if (/email/i.test(key) && v) {
      return (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, maxWidth: "100%" }} onClick={(e) => e.stopPropagation()}>
          <a href={`mailto:${v}`} className="rv-link"><Hervorheben text={String(v)} suche={search} /></a>
          <KopierKnopf wert={String(v)} was="E-Mail" klein />
        </span>
      );
    }
    if (key === "status" || key === "priority") return v ? <span className={`abzeichen ${statusFarbe(String(v))}`}><Hervorheben text={String(v)} suche={search} /></span> : <span className="muted">–</span>;
    const t = cell(v);
    return t === "–" ? <span className="muted">–</span> : <Hervorheben text={t} suche={search} />;
  };

  /** Ansprechpartner-Treffer unter dem Titel. */
  const kontaktTreffer = (row: any) => passendeKontakte(row, search).length > 0 && (
    <div className="muted" style={{ fontSize: 12, marginTop: 3, fontWeight: 400, display: "grid", gap: 1 }}>
      {passendeKontakte(row, search).map((k: any) => (
        <span key={k.id}>
          <Icon name="user" size={11} />{" "}
          <Hervorheben text={[k.name, k.role, k.email, k.phone, k.mobile].filter(Boolean).join(" · ")} suche={search} />
        </span>
      ))}
    </div>
  );

  /** Aktionen je Datensatz – in Tabelle und Karte dieselben. */
  const aktionen = (row: any) => (
    <>
      <button className="btn btn-icon btn-flach" title="Bearbeiten" aria-label="Bearbeiten" onClick={() => setEditing({ ...row })}><Icon name="pencil" /></button>
      {resourceKey === "organizations" && (
        <Link className="btn btn-icon btn-flach" title="Betriebsakte: Dokumente dieses Mandanten"
          aria-label="Betriebsakte" href={`/betriebsakte?org=${row.id}`}><Icon name="folder" /></Link>
      )}
      {resourceKey === "employees" && (
        <>
          <Link className="btn btn-icon btn-flach" title="Akte: Dokumente und Notizen" aria-label="Akte: Dokumente und Notizen" href={`/documents?employee=${row.id}`}><Icon name="folder" /></Link>
          <Link className="btn btn-icon btn-flach" title="Zugang in der Userverwaltung" aria-label="Zugang in der Userverwaltung" href={userVerwaltungHref(row)}><Icon name="shield" /></Link>
        </>
      )}
      <Link className="btn btn-icon btn-flach" title="Verlauf" aria-label="Verlauf" href={`/history?entity=${R.entity}&entityId=${row.id}`}><Icon name="history" /></Link>
      <button className="btn btn-icon btn-flach btn-danger" title="Löschen" aria-label="Löschen" onClick={() => setDeleting(row)}><Icon name="trash" /></button>
    </>
  );

  const titelSpalte = R.columns.find((c) => c.key === R.titleField) ? R.titleField : R.columns[0]?.key;
  const weitereSpalten = R.columns.filter((c) => c.key !== titelSpalte);
  const einzahl = R.einzahl || R.title;
  // Reihenfolge: A–Z mit Buchstaben-Register (Vorgabe) oder zuletzt geändert zuerst (wie vom Server)
  const az = seite.sort !== "neu";
  const liste = az ? [...rows].sort((a, b) => vergleicheAZ(a[titelSpalte], b[titelSpalte])) : rows;
  const buchstaben = az ? Array.from(new Set(liste.map((r) => anfangsBuchstabe(r[titelSpalte])))) : [];
  /** Buchstabe, falls mit diesem Eintrag ein neuer Abschnitt beginnt. */
  const neuerBuchstabe = (i: number) => {
    if (!az) return null;
    const b = anfangsBuchstabe(liste[i][titelSpalte]);
    return i === 0 || anfangsBuchstabe(liste[i - 1][titelSpalte]) !== b ? b : null;
  };

  return (
    <div>
      <div className="rv-sticky-header" style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <h1 className="seiten-titel">
              <span className="titel-icon"><Icon name={R.icon} size={20} /></span>
              {R.title}
              <span className="anzahl">{loading && !rows.length ? "…" : rows.length}</span>
            </h1>
            {R.beschreibung && <div className="seiten-untertitel only-desktop">{R.beschreibung}</div>}
          </div>
          {/* Hauptaktion steht immer rechts – am Rechner wie auf dem Handy */}
          <button className="btn btn-primary" onClick={() => setEditing({})}>
            <Icon name="plus" /> <span>{einzahl} anlegen</span>
          </button>
        </div>
        {/* Suchfeld linksbündig direkt über der Liste – dort wird es gesucht, nicht am rechten Rand. */}
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <SearchInput value={search} onChange={setSearch} style={{ flex: "1 1 260px", maxWidth: 560 }} />
          <div className="kt-segment" role="tablist" aria-label="Reihenfolge">
            <button role="tab" aria-selected={az} className={az ? "an" : ""} onClick={() => setSeite({ sort: "az" })} title="Alphabetisch mit Buchstaben-Register">A–Z</button>
            <button role="tab" aria-selected={!az} className={!az ? "an" : ""} onClick={() => setSeite({ sort: "neu" })} title="Zuletzt geänderte zuerst">
              <Icon name="history" size={13} /> Neueste
            </button>
          </div>
        </div>
      </div>
      {msg && (
        <div className={"hinweis-leiste" + (/^(Fehler|Versionskonflikt)/.test(msg) ? " fehler" : "")} role="status">
          <Icon name={/^(Fehler|Versionskonflikt)/.test(msg) ? "alert" : "check"} size={16} />
          <span style={{ flex: 1 }}>{msg}</span>
          <button className="btn btn-icon btn-flach" aria-label="Meldung schließen" onClick={() => setMsg("")}><Icon name="x" size={14} /></button>
        </div>
      )}

      {/* Leere Liste: erklären, was hier hingehört */}
      {!loading && rows.length === 0 && (
        <div className="card leer-zustand">
          <span className="leer-icon"><Icon name={search ? "search" : R.icon} size={28} /></span>
          <div style={{ fontSize: 16, fontWeight: 650, color: "var(--fg)" }}>{search ? "Nichts gefunden" : `Noch keine ${R.title}`}</div>
          <div style={{ fontSize: 13.5, maxWidth: 420 }}>{search ? `Kein Eintrag passt zu „${search}". Andere Schreibweise oder weniger Begriffe versuchen.` : R.beschreibung}</div>
          {search
            ? <button className="btn" onClick={() => setSearch("")}><Icon name="x" /> Suche leeren</button>
            : <button className="btn btn-primary" onClick={() => setEditing({})}><Icon name="plus" /> {einzahl} anlegen</button>}
        </div>
      )}

      {/* Desktop: Tabelle */}
      {(loading || rows.length > 0) && (
        <div className="card only-desktop rv-tabelle" style={{ overflow: "auto" }}>
          <table>
            <thead>
              <tr>
                {[titelSpalte, ...weitereSpalten.map((c) => c.key)].map((key) => {
                  const c = R.columns.find((x) => x.key === key)!;
                  if (!c) return null;
                  const ic = spaltenIcon(c.key, c.label);
                  return (
                    <th key={c.key} style={{ padding: "11px 14px" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        {ic && <Icon name={ic} size={13} />} {c.label}
                      </span>
                    </th>
                  );
                })}
                <th style={{ padding: "11px 14px", width: 1 }}></th>
              </tr>
            </thead>
            <tbody>
              {loading && rows.length === 0 && [0, 1, 2, 3, 4].map((i) => (
                <tr key={i}><td colSpan={R.columns.length + 1} style={{ padding: "16px 14px" }}><span className="lade-zeile" style={{ display: "block", width: `${70 - i * 8}%` }} /></td></tr>
              ))}
              {liste.map((row, i) => (
                <Fragment key={row.id}>
                {neuerBuchstabe(i) && (
                  <tr className="rv-gruppe" data-buchstabe={neuerBuchstabe(i)!}><td colSpan={R.columns.length + 1}>{neuerBuchstabe(i)}</td></tr>
                )}
                <tr onClick={() => zeileKlick(row)} onDoubleClick={() => zeileDoppel(row)}
                  style={{ cursor: "pointer" }} title={R.detail ? "Klick: ansehen · Doppelklick: bearbeiten" : "Klick: bearbeiten"}>
                  <td style={{ padding: "10px 14px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                      {vorschau(row)}
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600 }}>{zelle(row, titelSpalte)}</div>
                        {kontaktTreffer(row)}
                      </div>
                    </div>
                  </td>
                  {weitereSpalten.map((c) => (
                    <td key={c.key} style={{ padding: "10px 14px" }}>{zelle(row, c.key)}</td>
                  ))}
                  <td onClick={(e) => e.stopPropagation()} style={{ padding: "6px 10px", whiteSpace: "nowrap" }}>
                    <div className="zeilen-aktionen" style={{ display: "flex", gap: 2, justifyContent: "flex-end" }}>{aktionen(row)}</div>
                  </td>
                </tr>
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Handy: Karten statt Tabelle */}
      <div className="only-mobile" style={{ gap: 10 }}>
        {loading && rows.length === 0 && [0, 1, 2].map((i) => (
          <div key={i} className="card" style={{ padding: 16, display: "grid", gap: 10 }}>
            <span className="lade-zeile" style={{ width: "60%" }} /><span className="lade-zeile" style={{ width: "40%" }} />
          </div>
        ))}
        {liste.map((row, i) => (
          <Fragment key={row.id}>
          {neuerBuchstabe(i) && <div className="kt-gruppe rv-gruppe-handy" data-buchstabe={neuerBuchstabe(i)!}>{neuerBuchstabe(i)}</div>}
          <div className="card rv-karte" onClick={() => zeileKlick(row)}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {vorschau(row, true)}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="rv-karte-titel">{zelle(row, titelSpalte)}</div>
                {weitereSpalten[0] && cell(row[weitereSpalten[0].key]) !== "–" && typeof row[weitereSpalten[0].key] !== "boolean" && (
                  <div className="muted" style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    <Hervorheben text={cell(row[weitereSpalten[0].key])} suche={search} />
                  </div>
                )}
                {kontaktTreffer(row)}
              </div>
              <Icon name="chevron-down" size={16} style={{ transform: "rotate(-90deg)", color: "var(--muted)" }} />
            </div>
            {weitereSpalten.slice(1).some((c) => cell(row[c.key]) !== "–" && row[c.key] !== false) && (
              <div className="rv-karte-werte">
                {weitereSpalten.slice(1).filter((c) => cell(row[c.key]) !== "–" && row[c.key] !== false).map((c) => (
                  <div key={c.key}>
                    <span className="muted">{spaltenIcon(c.key, c.label) && <Icon name={spaltenIcon(c.key, c.label) as string} size={12} />} {c.label}</span>
                    <span>{zelle(row, c.key)}</span>
                  </div>
                ))}
              </div>
            )}
            <div onClick={(e) => e.stopPropagation()} className="rv-karte-aktionen">{aktionen(row)}</div>
          </div>
          </Fragment>
        ))}
      </div>
      {az && !loading && <BuchstabenLeiste vorhanden={buchstaben} />}

      {/* ── Logo/Bild groß ansehen und herunterladen ── */}
      {bild && (
        <div className="bild-fenster" onClick={() => setBild(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.75)", display: "grid",
                   gridTemplateRows: "auto 1fr", zIndex: 80 }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
                     background: "var(--bg)", borderBottom: "1px solid var(--border)" }}>
            <Icon name="image" size={16} />
            <span style={{ fontSize: 14, fontWeight: 600, flex: 1, minWidth: 0, overflow: "hidden",
                           textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{bild.name}</span>
            <button className="btn" onClick={() => bildSpeichern(bild.src, bild.name)}>
              <Icon name="download" /> <span className="btn-label">Herunterladen</span>
            </button>
            <button className="btn btn-icon" aria-label="Schließen" onClick={() => setBild(null)}><Icon name="x" /></button>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={bild.src} alt={bild.name} style={{ width: "100%", height: "100%", objectFit: "contain", padding: 16 }} />
        </div>
      )}

      {viewing && (
        <DetailModal
          resourceKey={resourceKey}
          suche={search}
          row={viewing}
          logo={hasLogo ? logos[viewing.id] : undefined}
          onClose={() => setViewing(null)}
          onEdit={() => { setEditing({ ...viewing }); setViewing(null); }}
          onDelete={() => { setDeleting(viewing); setViewing(null); }}
        />
      )}

      {editing && (
        <EditModal
          resourceKey={resourceKey}
          hasLogo={hasLogo}
          initial={editing}
          onClose={() => setEditing(null)}
          onSave={save}
        />
      )}

      <ConfirmDialog
        open={!!deleting}
        title={`„${deleting?.[R.titleField] ?? ""}" löschen?`}
        message="Der Datensatz wird gelöscht. Im Verlauf ist die Aktion jederzeit wiederherstellbar."
        onConfirm={() => deleting && remove(deleting)}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}

/** Farbe eines Status-/Prioritätswerts. */
function statusFarbe(v: string) {
  const t = v.toLowerCase();
  if (/fertig|erledigt|aktiv|done/.test(t)) return "gruen";
  if (/hoch|überfällig|gesperrt/.test(t)) return "rot";
  if (/laeuft|läuft|normal|offen/.test(t)) return /offen/.test(t) ? "gelb" : "blau";
  return "";
}

/** Initialen-Kreis für Datensätze ohne Bild – Farbe aus dem Namen (oder der hinterlegten Farbe). */
function Initialen({ text, farbe, groesse = 36 }: { text: string; farbe?: string; groesse?: number }) {
  const t = text.trim().split(/\s+/).filter(Boolean);
  const kurz = ((t[0]?.[0] || "?") + (t.length > 1 ? t[t.length - 1][0] : t[0]?.[1] || "")).toUpperCase();
  let h = 0;
  for (const c of text) h = (h * 31 + c.charCodeAt(0)) % 360;
  return (
    <span className="rv-initialen" style={{ width: groesse, height: groesse, fontSize: groesse * 0.36,
      background: farbe && /^#[0-9a-f]{6}$/i.test(farbe) ? `linear-gradient(135deg, ${farbe}, color-mix(in srgb, ${farbe} 70%, #000))`
        : `linear-gradient(135deg, hsl(${h} 72% 60%), hsl(${(h + 40) % 360} 68% 46%))` }} aria-hidden>
      {kurz}
    </span>
  );
}

/** Endung aus einer Daten-URL („data:image/png;base64,…") – für den Dateinamen. */
function bildEndung(datenUrl: string) {
  const typ = datenUrl.match(/^data:image\/([a-z0-9.+-]+)/i)?.[1]?.toLowerCase() || "png";
  return typ === "jpeg" ? "jpg" : typ === "svg+xml" ? "svg" : typ;
}

/** Bild aus einer Daten-URL speichern – ohne Umweg über den Server. */
function bildSpeichern(datenUrl: string, name: string) {
  const a = document.createElement("a");
  a.href = datenUrl;
  a.download = `${name.replace(/[^\wäöüÄÖÜß .-]+/g, "_") || "logo"}.${bildEndung(datenUrl)}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function LogoThumb({ src, color, onClick, groesse = 32 }: { src?: string; color?: string; onClick?: () => void; groesse?: number }) {
  const stil: React.CSSProperties = { width: groesse, height: groesse, borderRadius: groesse * 0.28, objectFit: "cover",
    border: "1px solid var(--border)", background: "#fff", flexShrink: 0, display: "block" };
  if (src && onClick) {
    return (
      <button type="button" onClick={(e) => { e.stopPropagation(); onClick(); }}
        title="Bild ansehen oder herunterladen"
        style={{ border: 0, background: "transparent", padding: 0, cursor: "zoom-in", lineHeight: 0, flexShrink: 0 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" style={stil} />
      </button>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  if (src) return <img src={src} alt="" style={stil} />;
  return <div style={{ ...stil, background: color || "var(--border)", opacity: 0.5 }} />;
}

function EditModal({ resourceKey, hasLogo, initial, onClose, onSave }: {
  resourceKey: string; hasLogo: boolean; initial: any; onClose: () => void; onSave: (f: any) => Promise<string | null>;
}) {
  const [speichert, setSpeichert] = useState(false);
  const [fehler, setFehler] = useState("");
  async function speichern() {
    if (speichert) return;
    setSpeichert(true); setFehler("");
    const f = await onSave(form);
    setSpeichert(false);
    if (f) setFehler(f);
  }
  const R = RESOURCES[resourceKey];
  const [form, setForm] = useState<any>(initial);
  const [currentLogo, setCurrentLogo] = useState<string>("");
  useEffect(() => setForm(initial), [initial]);

  // Logo asynchron nachladen (Liste enthält es nicht)
  useEffect(() => {
    if (hasLogo && initial.id) {
      api(`/api/${R.key}/${initial.id}/logo`).then((r) => setCurrentLogo(r.logo || "")).catch(() => {});
    } else {
      setCurrentLogo("");
    }
  }, [hasLogo, initial.id, R.key]);

  function set(k: string, v: any) { setForm((f: any) => ({ ...f, [k]: v })); }

  function onLogoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result);
      setCurrentLogo(dataUrl);
      set("logo", dataUrl); // wird beim Speichern mitgesendet
    };
    reader.readAsDataURL(file);
  }
  function removeLogo() { setCurrentLogo(""); set("logo", ""); }

  // Einzelnes Eingabe-Control zu einem Feld (wird in beiden Layouts wiederverwendet)
  const fieldControl = (f: Field) =>
    f.type === "textarea" ? (
      <div style={{ position: "relative" }}>
        <textarea className="input" rows={3} value={form[f.key] ?? ""}
          style={{ paddingRight: form[f.key] ? 62 : undefined }}
          onChange={(e) => set(f.key, e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              if (String((e.target as HTMLTextAreaElement).value).length > 0) set(f.key, "");
              else (e.currentTarget as HTMLTextAreaElement).blur();
            }
          }} />
        {form[f.key] ? (
          <div style={{ position: "absolute", right: 6, top: 6, display: "flex", gap: 2 }}>
            <button type="button" tabIndex={-1} aria-label="Feld leeren" onClick={() => set(f.key, "")}
              style={{ border: 0, background: "transparent", cursor: "pointer", opacity: 0.5, padding: 3, display: "flex", color: "var(--fg)" }}>
              <Icon name="x" size={14} />
            </button>
            <KopierKnopf wert={String(form[f.key])} was={f.label} klein />
          </div>
        ) : null}
      </div>
    ) : f.type === "phones" ? (
      <TelefonListe wert={Array.isArray(form[f.key]) ? form[f.key] : []} setWert={(v) => set(f.key, v)} />
  ) : f.type === "checkbox" ? (
      <div style={{ marginTop: 6 }}><Toggle checked={!!form[f.key]} onChange={(v) => set(f.key, v)} /></div>
    ) : f.type === "select" ? (
      // Kein natives Auswahlfeld: SuchSelect öffnet auf dem Handy im Vollbild und am
      // Rechner über dem Fenster – dadurch überall dieselbe Bedienung.
      <SuchSelect
        value={form[f.key] ?? ""}
        onChange={(v) => set(f.key, v)}
        platzhalter={`— ${f.label} wählen —`}
        suchePlatzhalter={`${f.label} suchen…`}
        options={(f.options || []).map((o) => ({ value: o, label: o }))}
      />
    ) : f.type === "color" ? (
      <ColorPicker value={form[f.key] ?? "#3b82f6"} onChange={(v) => set(f.key, v)} />
    ) : f.type === "date" ? (
      <input className="input" type="date"
        value={form[f.key] ? String(form[f.key]).slice(0, 10) : ""}
        onChange={(e) => set(f.key, e.target.value ? new Date(e.target.value).toISOString() : null)} />
    ) : (
      <TextField
        type={f.type === "number" ? "number" : f.type === "email" ? "email" : "text"}
        value={form[f.key]}
        onChange={(v) => set(f.key, f.type === "number" ? (v === "" ? 0 : Number(v)) : v)}
        kopieren
      />
    );

  // Felder in Abschnitte: nach `group`, ohne Gruppe alles in „Angaben"
  const abschnitte: { titel: string; felder: Field[] }[] = [];
  for (const f of R.fields) {
    const t = f.group || "Angaben";
    // Gleiche Gruppe = ein Abschnitt, auch wenn die Felder im Schema verstreut stehen
    const vorhanden = abschnitte.find((x) => x.titel === t);
    if (vorhanden) vorhanden.felder.push(f); else abschnitte.push({ titel: t, felder: [f] });
  }
  const titel = String(form[R.titleField] || [form.firstName, form.lastName].filter(Boolean).join(" ") || "").trim();
  const einzahl = R.einzahl || R.title;

  return (
    <div className="kt-huelle" style={{ zIndex: 50 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="card dm-fenster kt-fenster" style={{ width: 680 }}>
        <div className="kt-held" style={{ padding: "16px 20px" }}>
          {hasLogo && currentLogo
            ? <LogoThumb src={currentLogo} groesse={52} />
            : <Initialen text={titel || einzahl} farbe={form.color} groesse={52} />}
          <div style={{ flex: 1, minWidth: 0, paddingRight: 40 }}>
            <div className="muted" style={{ fontSize: 12, fontWeight: 650, textTransform: "uppercase", letterSpacing: ".05em" }}>
              {form.id ? `${einzahl} bearbeiten` : `Neu: ${einzahl}`}
            </div>
            <h2 style={{ fontSize: 19 }}>{titel || <span className="muted" style={{ fontWeight: 500 }}>Noch ohne Namen</span>}</h2>
          </div>
          <div className="kt-held-knoepfe">
            <button aria-label="Schließen" title="Schließen" onClick={onClose}><Icon name="x" size={17} /></button>
          </div>
        </div>

        <div className="kt-inhalt">
          {hasLogo && (
            <section className="kt-abschnitt">
              <div className="kt-abschnitt-titel"><span className="ic"><Icon name="image" size={15} /></span> Logo
                <small>erscheint in Listen und auf Dokumenten</small></div>
              <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                <LogoThumb src={currentLogo} color={form.color} groesse={56} />
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <label className="btn" style={{ cursor: "pointer" }}>
                    <Icon name="upload" /> {currentLogo ? "Ersetzen" : "Logo wählen"}
                    <input type="file" accept="image/*" onChange={onLogoFile} style={{ display: "none" }} />
                  </label>
                  {currentLogo && (
                    <>
                      <button type="button" className="btn btn-icon" title="Ansehen" aria-label="Ansehen" onClick={() => window.open(currentLogo, "_blank")}><Icon name="eye" /></button>
                      <button type="button" className="btn btn-icon" title="Herunterladen" aria-label="Herunterladen"
                        onClick={() => bildSpeichern(currentLogo, `${form[R.titleField] || "Logo"}-Logo`)}><Icon name="download" /></button>
                      <button type="button" className="btn btn-icon btn-danger" title="Entfernen" aria-label="Entfernen" onClick={removeLogo}><Icon name="trash" /></button>
                    </>
                  )}
                </div>
              </div>
            </section>
          )}

          {abschnitte.map((a) => (
            <section key={a.titel} className="kt-abschnitt">
              <div className="kt-abschnitt-titel">
                <span className="ic"><Icon name={abschnittIcon(a.titel)} size={15} /></span> {a.titel}
              </div>
              <div className="rv-raster">
                {a.felder.map((f) => {
                  const span = f.type === "textarea" || f.type === "phones" ? 12 : Math.min(12, Math.max(2, f.span || 6));
                  // Listen (mehrere Eingaben) nicht in ein <label> packen – sonst löst ein Klick die erste aus
                  const Huelle: any = f.type === "phones" || f.type === "checkbox" ? "div" : "label";
                  return (
                    <Huelle key={f.key} className="rv-feld" style={{ gridColumn: `span ${span}` }}>
                      <FeldLabel feld={f} />
                      {fieldControl(f)}
                    </Huelle>
                  );
                })}
              </div>
            </section>
          ))}

          {fehler && <div className="kt-fehler" role="alert"><Icon name="alert" size={16} /> {fehler}</div>}
        </div>

        <div className="kt-fuss">
          <span className="muted only-desktop" style={{ fontSize: 12, marginRight: "auto" }}>
            {form.id ? "Änderungen sind im Verlauf rückgängig zu machen." : ""}
          </span>
          <button className="btn" onClick={onClose} disabled={speichert}>Abbrechen</button>
          <button className="btn btn-primary" onClick={speichern} disabled={speichert}>
            {speichert ? <span className="speichern-dreh" /> : <Icon name="save" />} {speichert ? "Speichert…" : "Speichern"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Symbol je Abschnittstitel. */
function abschnittIcon(t: string) {
  const x = t.toLowerCase();
  if (/person|name/.test(x)) return "user";
  if (/kontakt|erreich|telefon/.test(x)) return "phone";
  if (/adress|anschrift/.test(x)) return "home";
  if (/steuer|preis|einkauf|abrechn/.test(x)) return "tag";
  if (/medien|bild/.test(x)) return "image";
  if (/artikel|lager/.test(x)) return "package";
  if (/zugang|system|darstell/.test(x)) return "settings";
  if (/notiz|beschreib/.test(x)) return "file-text";
  if (/termin|datum|status/.test(x)) return "calendar";
  if (/firma|stamm/.test(x)) return "building";
  return "pencil";
}

// ── Detail-Vorschau (Klick auf eine Zeile) — Bild, Felder, Links, Preis ──
function DetailModal({ resourceKey, row, suche, logo, onClose, onEdit, onDelete }: {
  resourceKey: string; row: any; suche?: string; logo?: string; onClose: () => void; onEdit: () => void; onDelete: () => void;
}) {
  const R = RESOURCES[resourceKey];
  const img = String(row.imageUrl || "").trim();
  const links = String(row.links || "").split(/\n+/).map((s) => s.trim()).filter(Boolean);
  const href = (u: string) => (/^https?:\/\//i.test(u) ? u : "https://" + u);
  const title = cell(row[R.titleField]) === "–" ? "(ohne Bezeichnung)" : cell(row[R.titleField]);
  const leer = (v: any) => v == null || v === "" || (Array.isArray(v) && v.length === 0);
  // Leere Felder ausblenden – die Ansicht zeigt nur, was wirklich hinterlegt ist
  const listFields = R.fields.filter((f) => !["imageUrl", "links", "color"].includes(f.key) && f.key !== R.titleField
    && f.type !== "checkbox" && !leer(row[f.key]));
  const ausgeblendet = R.fields.filter((f) => !["imageUrl", "links", "color"].includes(f.key) && f.key !== R.titleField
    && f.type !== "checkbox" && leer(row[f.key])).length;

  const renderVal = (f: Field) => {
    const v = row[f.key];
    if (f.key === "price") return (Number(v) || 0).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
    if (f.type === "checkbox") return v ? "ja" : "nein";
    if (f.type === "phones") return <TelefonAnzeige wert={v} />;
    if (f.type === "textarea") return <span style={{ whiteSpace: "pre-wrap" }}><Hervorheben text={v || "–"} suche={suche} /></span>;
    return <Hervorheben text={cell(v)} suche={suche} />;
  };

  return (
    <div className="kt-huelle" style={{ zIndex: 55 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="card dm-fenster kt-fenster" style={{ width: R.entity === "Supplier" ? 660 : 600 }}>
        <div className="kt-held">
          {logo || img ? <LogoThumb src={logo || img} groesse={64} /> : <Initialen text={title} farbe={row.color} groesse={64} />}
          <div style={{ flex: 1, minWidth: 0, paddingRight: 40 }}>
            <h2><Hervorheben text={title} suche={suche} /></h2>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
              <span className="abzeichen blau"><Icon name={R.icon} size={11} /> {R.einzahl || R.title}</span>
              {row.number != null && <span className="abzeichen">{R.prefix}-{row.number}</span>}
              {R.fields.filter((f) => f.type === "checkbox" && row[f.key]).map((f) => (
                <span key={f.key} className={`abzeichen ${f.key === "archived" ? "gelb" : "gruen"}`}><Icon name="check" size={11} /> {f.label}</span>
              ))}
            </div>
          </div>
          <div className="kt-held-knoepfe">
            <button aria-label="Schließen" title="Schließen" onClick={onClose}><Icon name="x" size={17} /></button>
          </div>
        </div>

        <div className="kt-inhalt">
          {img && logo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={img} alt={title} style={{ width: "100%", maxHeight: 240, objectFit: "contain", borderRadius: 12, border: "1px solid var(--border)", background: "var(--bg)" }} />
          )}
          {listFields.length > 0 && (
            <div className="kt-block">
              <div className="kt-block-titel"><Icon name="file-text" size={13} /> Angaben</div>
              <div className="rv-werte">
                {listFields.map((f) => {
                  const ic = spaltenIcon(f.key, f.label);
                  return (
                    <div key={f.key} className={f.type === "textarea" || f.type === "phones" ? "breit" : ""}>
                      <span className="muted">{ic && <Icon name={ic} size={12} />} {f.label}</span>
                      <span>{renderVal(f)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {ausgeblendet > 0 && <div className="muted" style={{ fontSize: 12, marginTop: -6 }}>{ausgeblendet} leere Felder ausgeblendet – über „Bearbeiten" ausfüllen.</div>}
          {/* Lieferanten: alle Ansprechpartner mit eigener Suche */}
          {R.entity === "Supplier" && (
            <div className="kt-block">
              <div className="kt-block-titel"><Icon name="users" size={13} /> Ansprechpartner</div>
              <div className="kt-block-inhalt"><AnsprechpartnerListe supplierId={row.id} vorgabeSuche={suche} /></div>
            </div>
          )}
          {links.length > 0 && (
            <div className="kt-block">
              <div className="kt-block-titel"><Icon name="globe" size={13} /> Links</div>
              <div className="kt-block-inhalt" style={{ gap: 6 }}>
                {links.map((u, i) => (
                  <a key={i} href={href(u)} target="_blank" rel="noreferrer" style={{ color: "var(--accent)", wordBreak: "break-all", fontSize: 14 }}>{u}</a>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="kt-fuss">
          <Link className="btn btn-icon" title="Verlauf" aria-label="Verlauf" href={`/history?entity=${R.entity}&entityId=${row.id}`} style={{ marginRight: "auto" }}><Icon name="history" /></Link>
          <button className="btn btn-danger" onClick={onDelete}><Icon name="trash" /> Löschen</button>
          <button className="btn btn-primary" onClick={onEdit}><Icon name="pencil" /> Bearbeiten</button>
        </div>
      </div>
    </div>
  );
}
