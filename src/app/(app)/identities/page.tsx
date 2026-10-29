"use client";
import { useEffect, useState, useCallback } from "react";
import { api, ConflictError } from "@/lib/clientApi";
import Toggle from "@/components/Toggle";
import Icon from "@/components/Icon";
import { kopiere, erzeugePasswort } from "@/lib/kopieren";
import SearchInput from "@/components/SearchInput";
import Hervorheben, { sucheBegriffe } from "@/components/Hervorheben";
import TextField from "@/components/TextField";
import SuchSelect from "@/components/SuchSelect";
import { Feld } from "@/components/KontaktFeld";
import { useLive } from "@/lib/live";

const APPS = ["kontor", "clocker", "cnc", "schaltplan", "xcat", "projecteye", "vision"];
/** Anzeigenamen (appKey bleibt technisch gleich: „cnc“ = xCAM, „schaltplan“ = xDRAW, „xcat“ = xCAT/BlattWerk). */
const APP_NAME: Record<string, string> = { cnc: "xCAM", schaltplan: "xDRAW", xcat: "xCAT", projecteye: "ProjectEye" };
const appName = (k: string) => APP_NAME[k] ?? k;

/** Gleichbleibender Farbton je Name – damit jeder Zugang „seine" Avatarfarbe hat (wie bei den Kontakten). */
function farbton(s: string) {
  let h = 0;
  for (const c of String(s || "")) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

/** Initialen aus dem Anzeigenamen (sonst aus der E-Mail). */
function initialen(name: string) {
  const t = String(name || "").replace(/@.*$/, "").trim().split(/[\s._-]+/).filter(Boolean);
  if (t.length === 0) return "";
  return ((t[0][0] || "") + (t.length > 1 ? t[t.length - 1][0] : "")).toUpperCase();
}

function Avatar({ name, groesse }: { name: string; groesse?: "gross" | "klein" }) {
  const ini = initialen(name);
  return (
    <span className={`kt-avatar${groesse ? " " + groesse : ""}`} style={{ ["--h" as any]: farbton(name) }} aria-hidden>
      {ini || <Icon name="user" size={groesse === "gross" ? 30 : groesse === "klein" ? 14 : 18} />}
    </span>
  );
}

type Access = { appKey: string; allowed: boolean; role: string };

/** Zusätzliche Rollen, die einzelne Apps kennen (neben user/admin). */
const APP_ROLLEN: Record<string, { value: string; label: string }[]> = {
  // clocker: Buchhaltung = alle Zeiten, Stundenzettel, Fahrten, Belege, Abrechnung; Stammdaten nur lesen
  clocker: [{ value: "buchhaltung", label: "buchhaltung" }],
  // xCAM (cnc): dreher = bearbeiten ohne Löschen, viewer = nur lesen
  cnc: [{ value: "dreher", label: "dreher" }, { value: "viewer", label: "viewer" }],
};
type Form = {
  id?: string; email: string; name: string; password: string; globalRole: string; anmeldungBestaetigen?: boolean; version?: number;
  access: Record<string, Access>;
};

function emptyForm(): Form {
  return {
    email: "", name: "", password: "", globalRole: "user",
    access: Object.fromEntries(APPS.map((a) => [a, { appKey: a, allowed: false, role: "user" }])),
  };
}

export default function IdentitiesPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [editing, setEditing] = useState<Form | null>(null);
  const [msg, setMsg] = useState("");
  const [kopiert, setKopiert] = useState("");
  const [pwSichtbar, setPwSichtbar] = useState(false);
  const [suche, setSuche] = useState(() =>
    typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("q") || "" : ""
  );
  // ?open=1 (Sprung aus der Mitarbeiterliste): Zugangseinstellungen sofort öffnen.
  // ?mail / ?name liefern die Mitarbeiterdaten für den Fall, dass es noch keinen Zugang gibt.
  const [sprung, setSprung] = useState<{ mail: string; name: string } | null>(() => {
    if (typeof window === "undefined") return null;
    const p = new URLSearchParams(window.location.search);
    if (p.get("open") !== "1") return null;
    return { mail: (p.get("mail") || "").trim(), name: (p.get("name") || "").trim() };
  });
  // Einzelanzeige eines hinterlegten Passworts (nur solange der Dialog offen ist)
  const [pwAnzeige, setPwAnzeige] = useState<{ name: string; email: string; passwort: string } | null>(null);
  // Ergebnis der Sammelvergabe — die Werte gibt es nur dieses eine Mal zu sehen
  const [sammel, setSammel] = useState<{ id: string; name: string; email: string; passwort: string }[] | null>(null);
  const [frage, setFrage] = useState(false);
  // Weitere Anmelde-Adressen des gerade geöffneten Zugangs (Firmen-, Privat-, …)
  const [mails, setMails] = useState<any[]>([]);
  const [neueMail, setNeueMail] = useState("");
  const [neuesLabel, setNeuesLabel] = useState("");
  const [laeuft, setLaeuft] = useState(false);
  // Speichern: läuft gerade / Fehler im Fenster / kurze Erfolgsmeldung unten
  const [speichert, setSpeichert] = useState(false);
  const [dialogFehler, setDialogFehler] = useState("");
  const [gespeichert, setGespeichert] = useState("");

  /**
   * Hinterlegtes Anmeldepasswort holen und anzeigen (nur globale Admins; jeder Abruf
   * wird serverseitig im Verlauf vermerkt).
   */
  async function passwortAnzeigen(r: { id: string; name: string; email: string }) {
    try {
      const d = await api(`/api/identities/${r.id}/password`);
      if (!d.vorhanden) { setMsg(d.hinweis || "Für diesen Benutzer ist kein Passwort hinterlegt – bitte ein neues erzeugen."); return; }
      setPwAnzeige({ name: r.name, email: r.email, passwort: d.passwort });
    } catch (e: any) {
      setMsg("Passwort konnte nicht geholt werden: " + e.message);
    }
  }

  /**
   * Vergibt in einem Rutsch neue sichere Passwörter — entweder nur für Konten ohne
   * hinterlegtes Passwort oder für alle. Die Werte kommen einmalig zurück.
   */
  async function passwoerterErzeugen(modus: "fehlende" | "alle") {
    setFrage(false);
    setLaeuft(true);
    try {
      const d = await api("/api/identities/passwords", { method: "POST", body: JSON.stringify({ modus }) });
      if (!d.anzahl) { setMsg("Es gibt keinen Benutzer ohne hinterlegtes Passwort."); return; }
      setSammel(d.benutzer);
      setMsg(`${d.anzahl} neue Passwörter vergeben – jetzt sichern, danach sind sie nur noch einzeln abrufbar.`);
      load();
    } catch (e: any) {
      setMsg("Passwörter konnten nicht vergeben werden: " + e.message);
    } finally {
      setLaeuft(false);
    }
  }

  /** Text kopieren und kurz rückmelden, welcher Wert es war. */
  async function inZwischenablage(text: string, was: string, merker?: string) {
    const ok = await kopiere(text);
    setMsg(ok ? `${was} kopiert.` : `${was} konnte nicht kopiert werden – bitte manuell übernehmen.`);
    if (ok && merker) { setKopiert(merker); setTimeout(() => setKopiert((k) => (k === merker ? "" : k)), 1500); }
  }

  const load = useCallback(async () => {
    const d = await api("/api/identities");
    setRows(d.data);
  }, []);
  useEffect(() => { load(); }, [load]);

  // Zugänge, Freigaben und Anmelde-Adressen live nachziehen
  useLive(["Identity", "IdentityAppAccess", "IdentityEmail"], load);

  function openNew() { setEditing(emptyForm()); }
  function openEdit(r: any) {
    const access = Object.fromEntries(APPS.map((a) => {
      const ex = (r.appAccess || []).find((x: any) => x.appKey === a);
      return [a, { appKey: a, allowed: ex?.allowed ?? false, role: ex?.role ?? "user" }];
    }));
    setPwSichtbar(false);
    setMails(r.emails || []);
    setNeueMail("");
    setNeuesLabel("");
    setDialogFehler("");
    setEditing({ id: r.id, email: r.email, name: r.name, password: "", globalRole: r.globalRole, anmeldungBestaetigen: !!r.anmeldungBestaetigen, version: r.version, access });
  }

  /** Adressen des Zugangs neu holen (nach Hinzufügen, Tauschen, Entfernen). */
  async function ladeMails(id: string) {
    try {
      const d = await api(`/api/identities/${id}/emails`);
      setMails(d.data || []);
    } catch (e: any) { setMsg("Adressen: " + e.message); }
  }

  /** Weitere Anmelde-Adresse hinzufügen – damit kann sich der Mensch ebenfalls anmelden. */
  async function mailHinzufuegen() {
    if (!editing?.id) return;
    const email = neueMail.trim();
    if (!email) return;
    try {
      await api(`/api/identities/${editing.id}/emails`, {
        method: "POST", body: JSON.stringify({ email, label: neuesLabel.trim() }),
      });
      setNeueMail("");
      setNeuesLabel("");
      setMsg(`„${email}" ist jetzt zusätzlich als Anmeldung möglich.`);
      ladeMails(editing.id);
      load();
    } catch (e: any) { setMsg("Fehler: " + e.message); }
  }

  /** Zweitadresse zur Hauptadresse machen – sie zieht dann auch in Mitarbeiter und Apps mit. */
  async function mailZurHaupt(mailId: string) {
    if (!editing?.id) return;
    try {
      const d = await api(`/api/identities/${editing.id}/emails/${mailId}`, {
        method: "PATCH", body: JSON.stringify({ haupt: true }),
      });
      setEditing({ ...editing, email: d.hauptadresse });
      setMsg(`Hauptadresse ist jetzt ${d.hauptadresse} – sie wird in Mitarbeiter und Apps übernommen.`);
      ladeMails(editing.id);
      load();
    } catch (e: any) { setMsg("Fehler: " + e.message); }
  }

  async function mailEntfernen(mailId: string) {
    if (!editing?.id) return;
    try {
      await api(`/api/identities/${editing.id}/emails/${mailId}`, { method: "DELETE" });
      ladeMails(editing.id);
      load();
    } catch (e: any) { setMsg("Fehler: " + e.message); }
  }

  async function save() {
    if (!editing || speichert) return;
    const appAccess = Object.values(editing.access);
    const payload: any = { email: editing.email, name: editing.name, globalRole: editing.globalRole, anmeldungBestaetigen: !!editing.anmeldungBestaetigen, appAccess };
    if (editing.password) payload.password = editing.password;
    setSpeichert(true);
    setDialogFehler("");
    try {
      if (editing.id) {
        const patch = (version?: number) =>
          api(`/api/identities/${editing.id}`, { method: "PATCH", body: JSON.stringify({ ...payload, expectedVersion: version }) });
        try {
          await patch(editing.version);
        } catch (e) {
          // Zwischenzeitlich hat der Abgleich (clocker, Mail-Kaskade, …) den Zugang angefasst und die
          // Version erhöht. Die Felder hier sind die eben bearbeiteten → mit aktueller Version erneut senden.
          if (e instanceof ConflictError && e.current?.version != null) await patch(e.current.version);
          else throw e;
        }
      } else {
        await api("/api/identities", { method: "POST", body: JSON.stringify(payload) });
      }
      setGespeichert(`${editing.name || editing.email} gespeichert`);
      setTimeout(() => setGespeichert(""), 3000);
      setEditing(null);
      load();
    } catch (e: any) {
      setDialogFehler(e.message || "Speichern fehlgeschlagen");
    } finally {
      setSpeichert(false);
    }
  }

  // Suche über Name, E-Mail, Rolle, Herkunft und freigeschaltete Apps.
  // Mehrere Begriffe werden UND-verknüpft: „admin kontor" findet nur beides zusammen.
  const treffer = (() => {
    const teile = sucheBegriffe(suche).map((t) => t.toLowerCase());
    if (teile.length === 0) return rows;
    return rows.filter((r: any) => {
      const apps = (r.appAccess || []).filter((a: any) => a.allowed).map((a: any) => `${a.appKey} ${appName(a.appKey)} ${a.role}`).join(" ");
      const text = [r.name, r.email, r.globalRole, r.origin, apps].map((f) => String(f || "")).join(" ").toLowerCase();
      return teile.every((t) => text.includes(t));
    });
  })();

  // Sprung aus der Mitarbeiterliste: Zugangseinstellungen ohne Zwischenschritt öffnen.
  // Reihenfolge: exakte E-Mail → einziger Suchtreffer → sonst neuen Zugang vorausgefüllt anlegen.
  useEffect(() => {
    if (!sprung || editing || rows.length === 0) return;
    const mail = sprung.mail.toLowerCase();
    const genau = mail ? rows.find((r: any) => String(r.email || "").toLowerCase() === mail) : null;
    setSprung(null);
    if (genau) { openEdit(genau); return; }
    if (treffer.length === 1) { openEdit(treffer[0]); return; }
    if (treffer.length > 1) { setMsg("Mehrere passende Zugänge – bitte den richtigen auswählen."); return; }
    setMsg(`Für ${sprung.name || sprung.mail} gibt es noch keinen Zugang – Daten sind vorausgefüllt, bitte Apps freigeben und speichern.`);
    setEditing({ ...emptyForm(), email: sprung.mail, name: sprung.name });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sprung, rows, treffer.length]);

  // Konten ohne weitergebbares Passwort (nur der Zähler – nie die Werte)
  const ohnePasswort = rows.filter((r: any) => !r.hatPasswort).length;
  // Freigegebene Apps eines Zugangs (für Liste und Karten)
  const freigaben = (r: any) => (r.appAccess || []).filter((a: any) => a.allowed);
  // Zähler für den Kopf des Einstellfensters
  const freigegebenImFenster = editing ? APPS.filter((a) => editing.access[a]?.allowed).length : 0;

  return (
    <div>
      {/* ── Seitenkopf: Titel, Anzahl, Erklärung, Hauptaktionen rechts ── */}
      <div className="rv-sticky-header">
        <div className="ver-kopf">
          <div className="ver-kopf-text">
            <h1 className="seiten-titel">
              <span className="titel-icon"><Icon name="shield" size={20} /></span>
              Userverwaltung
              <span className="anzahl">{rows.length}</span>
            </h1>
            <p className="seiten-untertitel">Ein Login für alle berechtigten Apps – je App Zulassung und Rolle festlegen.</p>
          </div>
          <div className="ver-kopf-aktionen">
            <button className="btn" disabled={laeuft} onClick={() => setFrage(true)}
              title="Sichere Passwörter für die Zugänge erzeugen">
              {laeuft ? <span className="speichern-dreh" style={{ borderColor: "var(--border)", borderTopColor: "var(--accent)" }} /> : <Icon name="lock" />}
              Passwörter erzeugen{ohnePasswort > 0 ? ` (${ohnePasswort} offen)` : ""}
            </button>
            <button className="btn btn-primary" onClick={openNew}><Icon name="plus" /> Neuer User</button>
          </div>
        </div>
        {/* Suchfeld linksbündig direkt über der Liste */}
        <div className="ver-werkzeuge">
          <SearchInput value={suche} onChange={setSuche} placeholder="Name, E-Mail, Rolle, App…"
            style={{ width: "100%", maxWidth: 340 }} />
          <span className="ver-info">
            {suche.trim() && <span className="abzeichen blau"><Icon name="search" size={12} /> {treffer.length} Treffer</span>}
            {ohnePasswort > 0
              ? <span className="abzeichen gelb"><Icon name="alert" size={12} /> {ohnePasswort} ohne Passwort</span>
              : rows.length > 0 && <span className="abzeichen gruen"><Icon name="check" size={12} /> alle mit Passwort</span>}
          </span>
        </div>
      </div>

      {msg && (
        <div className="hinweis-leiste ver-meldung" role="status">
          <Icon name="alert" size={16} />
          <span>{msg}</span>
          <button className="btn btn-icon" title="Meldung schließen" aria-label="Meldung schließen" onClick={() => setMsg("")}>
            <Icon name="x" size={14} />
          </button>
        </div>
      )}

      {/* ── Rechner: Tabelle ── */}
      {treffer.length > 0 && (
        <div className="card only-desktop" style={{ overflow: "auto" }}>
          <table className="ver-tab" style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead><tr style={{ textAlign: "left" }}>
              {/* Symbol je Spalte – macht den Kopf auf einen Blick lesbar */}
              {([["tag", "Nr."], ["user", "Name"], ["mail", "E-Mail"], ["shield", "Globale Rolle"],
                 ["command", "App-Zugriff"], ["lock", "Passwort"], ["archive", "Herkunft"]] as const).map(([icon, label], i) => (
                <th key={label} style={i === 0 ? { width: 1, whiteSpace: "nowrap" } : undefined}>
                  <span className="ver-th"><Icon name={icon} size={14} /> {label}</span>
                </th>
              ))}
              <th><span className="ver-th" style={{ justifyContent: "flex-end", width: "100%" }}><Icon name="settings" size={14} /> Aktionen</span></th>
            </tr></thead>
            <tbody>
              {treffer.map((r: any, i: number) => (
                <tr key={r.id}>
                  <td className="ver-nr">US-{i + 1}</td>
                  <td>
                    <div className="ver-person">
                      <Avatar name={r.name || r.email} groesse="klein" />
                      <span className="ver-person-name"><Hervorheben text={r.name} suche={suche} /></span>
                    </div>
                  </td>
                  <td>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <Hervorheben text={r.email} suche={suche} />
                      <button className="btn btn-icon btn-flach" title="E-Mail kopieren" aria-label="E-Mail kopieren"
                        onClick={() => inZwischenablage(r.email, "E-Mail", "m" + r.id)}>
                        <Icon name={kopiert === "m" + r.id ? "check" : "copy"} size={14} />
                      </button>
                    </span>
                  </td>
                  <td>
                    <span className={`abzeichen${r.globalRole === "admin" ? " blau" : ""}`}>
                      <Icon name={r.globalRole === "admin" ? "shield" : "user"} size={12} />
                      <Hervorheben text={r.globalRole} suche={suche} />
                    </span>
                  </td>
                  <td>
                    {freigaben(r).length > 0 ? (
                      <div className="ver-chips">
                        {freigaben(r).map((a: any) => (
                          <span key={a.appKey} className="abzeichen" title={`Rolle: ${a.role}`}>
                            {appName(a.appKey)}{a.role && a.role !== "user" ? ` · ${a.role}` : ""}
                          </span>
                        ))}
                      </div>
                    ) : <span className="muted">–</span>}
                  </td>
                  <td>
                    {r.hatPasswort
                      ? <span className="abzeichen gruen"><Icon name="check" size={12} /> hinterlegt</span>
                      : <span className="abzeichen gelb"><Icon name="alert" size={12} /> fehlt</span>}
                  </td>
                  <td className="muted" style={{ fontSize: 13 }}>{r.origin}</td>
                  <td>
                    <div className="ver-aktionen zeilen-aktionen">
                      <button className="btn btn-icon" title="Hinterlegtes Passwort anzeigen" aria-label="Passwort anzeigen"
                        onClick={() => passwortAnzeigen(r)}>
                        <Icon name="lock" />
                      </button>
                      <button className="btn btn-icon" title="Bearbeiten" aria-label="Bearbeiten" onClick={() => openEdit(r)}><Icon name="pencil" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {rows.length > 0 && treffer.length === 0 && (
        <div className="card leer-zustand">
          <span className="leer-icon"><Icon name="search" size={28} /></span>
          <b style={{ color: "var(--fg)" }}>Kein Benutzer passt zur Suche.</b>
          <span style={{ fontSize: 13 }}>Mehrere Begriffe werden UND-verknüpft – weniger Begriffe finden mehr.</span>
          <button className="btn" onClick={() => setSuche("")}><Icon name="x" /> Suche leeren</button>
        </div>
      )}

      {/* ── Handy: Karten statt Tabelle ── */}
      <div className="only-mobile ver-karten">
        {treffer.map((r: any, i: number) => (
          <div key={r.id} className="card ver-karte">
            <div className="ver-karte-kopf">
              <Avatar name={r.name || r.email} />
              <div style={{ flex: 1, minWidth: 0, display: "grid" }}>
                <span className="kt-name"><Hervorheben text={r.name} suche={suche} /></span>
                <span className="kt-unter" style={{ whiteSpace: "normal", wordBreak: "break-all" }}><Hervorheben text={r.email} suche={suche} /></span>
              </div>
              <button className="btn btn-icon" title="E-Mail kopieren" aria-label="E-Mail kopieren"
                onClick={() => inZwischenablage(r.email, "E-Mail", "k" + r.id)}>
                <Icon name={kopiert === "k" + r.id ? "check" : "copy"} />
              </button>
            </div>
            <div className="ver-karte-zeile">
              <span className="ver-nr">US-{i + 1}</span>
              <span className={`abzeichen${r.globalRole === "admin" ? " blau" : ""}`}>
                <Icon name={r.globalRole === "admin" ? "shield" : "user"} size={12} /> {r.globalRole}
              </span>
              {r.hatPasswort
                ? <span className="abzeichen gruen"><Icon name="lock" size={12} /> Passwort hinterlegt</span>
                : <span className="abzeichen gelb"><Icon name="alert" size={12} /> Passwort fehlt</span>}
              {r.origin && <span className="abzeichen"><Icon name="archive" size={12} /> {r.origin}</span>}
            </div>
            <div className="ver-karte-zeile">
              <Icon name="command" size={14} />
              {freigaben(r).length > 0 ? (
                <div className="ver-chips" style={{ flex: 1, minWidth: 0 }}>
                  {freigaben(r).map((a: any) => (
                    <span key={a.appKey} className="abzeichen">
                      {appName(a.appKey)}{a.role && a.role !== "user" ? ` · ${a.role}` : ""}
                    </span>
                  ))}
                </div>
              ) : <span>keine App freigegeben</span>}
            </div>
            <div className="ver-karte-knoepfe">
              <button className="btn" onClick={() => passwortAnzeigen(r)}>
                <Icon name="lock" /> Passwort
              </button>
              <button className="btn" onClick={() => openEdit(r)}>
                <Icon name="pencil" /> Bearbeiten
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* ── Auswahl: welche Konten sollen ein neues Passwort bekommen? ── */}
      {frage && (
        <div className="kt-huelle" style={{ zIndex: 60 }} onClick={() => setFrage(false)}>
          <div onClick={(e) => e.stopPropagation()} className="card dm-fenster kt-fenster" style={{ width: 540 }}>
            <div className="ver-fenster-kopf">
              <span className="ver-fenster-icon"><Icon name="lock" size={18} /></span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h2>Sichere Passwörter erzeugen</h2>
                <div className="muted" style={{ fontSize: 12.5 }}>{rows.length} Zugänge · {ohnePasswort} ohne Passwort</div>
              </div>
            </div>
            <div className="kt-inhalt">
              <p className="ver-hinweis" style={{ fontSize: 13 }}>
                Es werden zufällige Passwörter mit Groß-/Kleinbuchstaben, Ziffern und Zusatzzeichen
                vergeben (19 Zeichen, z.&nbsp;B. <code>hRt7#pQ4m-3Xvb@n8Ka</code>). Sie gelten sofort für
                <b> alle Apps</b>, weil die Anmeldung zentral über Nexus läuft. Die neuen Werte werden
                danach <b>einmalig</b> angezeigt – bitte sofort sichern und weitergeben.
              </p>
              <button type="button" className="ver-wahl" disabled={laeuft || ohnePasswort === 0}
                onClick={() => passwoerterErzeugen("fehlende")}>
                <span className="ver-fenster-icon"><Icon name="lock" size={17} /></span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <b>Nur fehlende ({ohnePasswort})</b>
                  <small>Nur Zugänge ohne hinterlegtes Passwort bekommen eines – alle anderen bleiben unverändert.</small>
                </span>
              </button>
              <button type="button" className="ver-wahl warn" disabled={laeuft}
                onClick={() => passwoerterErzeugen("alle")}>
                <span className="ver-fenster-icon rot"><Icon name="redo" size={17} /></span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <b>Alle {rows.length} Benutzer neu setzen</b>
                  <small>Macht die bisherigen Passwörter sofort ungültig – jeder Mitarbeiter braucht dann das neue.</small>
                </span>
              </button>
            </div>
            <div className="kt-fuss">
              <button className="btn" onClick={() => setFrage(false)}>
                <Icon name="x" /> Abbrechen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Einzelnes hinterlegtes Passwort ansehen ── */}
      {pwAnzeige && (
        <div className="kt-huelle" style={{ zIndex: 60 }} onClick={() => setPwAnzeige(null)}>
          <div onClick={(e) => e.stopPropagation()} className="card dm-fenster kt-fenster" style={{ width: 480 }}>
            <div className="kt-held" style={{ ["--h" as any]: farbton(pwAnzeige.name || pwAnzeige.email), padding: "16px 20px" }}>
              <Avatar name={pwAnzeige.name || pwAnzeige.email} />
              <div style={{ flex: 1, minWidth: 0, paddingRight: 40 }}>
                <div className="muted" style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".05em" }}>
                  Hinterlegtes Passwort
                </div>
                <h2 style={{ fontSize: 19 }}>{pwAnzeige.name}</h2>
                <div className="muted" style={{ fontSize: 13, wordBreak: "break-all" }}>{pwAnzeige.email}</div>
              </div>
              <div className="kt-held-knoepfe">
                <button aria-label="Schließen" title="Schließen" onClick={() => setPwAnzeige(null)}><Icon name="x" size={17} /></button>
              </div>
            </div>
            <div className="kt-inhalt">
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <code className="ver-pw">{pwAnzeige.passwort}</code>
                <button className="btn btn-icon" title="Passwort kopieren" aria-label="Passwort kopieren"
                  onClick={() => inZwischenablage(pwAnzeige.passwort, "Passwort", "einzel")}>
                  <Icon name={kopiert === "einzel" ? "check" : "copy"} />
                </button>
              </div>
              <div className="ver-schalter-zeile">
                <Icon name="shield" size={16} />
                <span className="ver-hinweis">
                  Nur für globale Admins – der Abruf wird im Verlauf vermerkt. Bitte über einen sicheren
                  Weg weitergeben und das Fenster danach schließen.
                </span>
              </div>
            </div>
            <div className="kt-fuss">
              <button className="btn" onClick={() => setPwAnzeige(null)}>
                <Icon name="x" /> Schließen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Ergebnis der Sammelvergabe — einmalige Anzeige ── */}
      {sammel && (
        <div className="kt-huelle" style={{ zIndex: 60 }}>
          <div className="card dm-fenster kt-fenster" style={{ width: 660 }}>
            <div className="ver-fenster-kopf">
              <span className="ver-fenster-icon"><Icon name="lock" size={18} /></span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h2>{sammel.length} neue Passwörter</h2>
                <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>
                  Jetzt sichern – danach sind sie nur noch einzeln über das Schloss-Symbol abrufbar.
                </div>
              </div>
            </div>
            <div className="kt-inhalt" style={{ gap: 0, flex: 1 }}>
              {sammel.map((b) => (
                <div key={b.id} className="ver-pw-zeile">
                  <Avatar name={b.name || b.email} groesse="klein" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{b.name}</div>
                    <div className="muted" style={{ fontSize: 12, wordBreak: "break-all" }}>{b.email}</div>
                  </div>
                  <code>{b.passwort}</code>
                  <button className="btn btn-icon" title="Passwort kopieren" aria-label="Passwort kopieren"
                    onClick={() => inZwischenablage(b.passwort, "Passwort", "s" + b.id)}>
                    <Icon name={kopiert === "s" + b.id ? "check" : "copy"} />
                  </button>
                </div>
              ))}
            </div>
            <div className="kt-fuss">
              <button className="btn"
                onClick={() => inZwischenablage(sammel.map((b) => `${b.name}\t${b.email}\t${b.passwort}`).join("\n"), "Liste", "liste")}>
                <Icon name={kopiert === "liste" ? "check" : "copy"} /> Ganze Liste kopieren
              </button>
              <button className="btn btn-primary" onClick={() => setSammel(null)}><Icon name="check" /> Gesichert, schließen</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Einstellfenster eines Zugangs ── */}
      {editing && (
        <div className="kt-huelle" style={{ zIndex: 50 }} onClick={() => setEditing(null)}>
          <div onClick={(e) => e.stopPropagation()} className="card dm-fenster kt-fenster" style={{ width: 640 }}>
            {/* Kopf: Avatar, Name, E-Mail, Rolle, System-ID */}
            <div className="kt-held" style={{ ["--h" as any]: farbton(editing.name || editing.email), padding: "16px 20px" }}>
              <Avatar name={editing.name || editing.email} groesse="gross" />
              <div style={{ flex: 1, minWidth: 0, paddingRight: 40 }}>
                <div className="muted" style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".05em" }}>
                  {editing.id ? "User bearbeiten" : "Neuer User"}
                </div>
                <h2 style={{ fontSize: 19 }}>{editing.name || <span className="muted" style={{ fontWeight: 500 }}>Name eingeben…</span>}</h2>
                {editing.email && <div className="muted" style={{ fontSize: 13, wordBreak: "break-all" }}>{editing.email}</div>}
                <div className="ver-held-zeile">
                  <span className={`abzeichen${editing.globalRole === "admin" ? " blau" : ""}`}>
                    <Icon name={editing.globalRole === "admin" ? "shield" : "user"} size={12} /> {editing.globalRole || "user"}
                  </span>
                  {editing.id && (
                    <button type="button" className="ver-sid" onClick={() => inZwischenablage(editing.id!, "System-ID", "sid")} title="System-ID kopieren">
                      <Icon name={kopiert === "sid" ? "check" : "id-card"} size={12} /> System-ID {editing.id}
                    </button>
                  )}
                </div>
              </div>
              <div className="kt-held-knoepfe">
                <button aria-label="Schließen" title="Schließen" onClick={() => setEditing(null)}><Icon name="x" size={17} /></button>
              </div>
            </div>

            <div className="kt-inhalt">
              {/* ── Zugang: Name, Hauptadresse, weitere Adressen, globale Rolle ── */}
              <section className="kt-abschnitt">
                <div className="kt-abschnitt-titel"><span className="ic"><Icon name="user" size={15} /></span> Zugang</div>
                <div className="feld-zeile feld-zeile-2">
                  <Feld label="Name" icon="user" wert={editing.name}
                    setWert={(v) => setEditing({ ...editing, name: v })} />
                  <Feld label="E-Mail (Hauptadresse)" icon="mail" typ="email" wert={editing.email}
                    setWert={(v) => setEditing({ ...editing, email: v })} />
                </div>
                <label style={{ fontSize: 13, display: "grid", gap: 4 }}>
                  <span className="muted" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <Icon name="shield" size={14} /> Globale Rolle
                  </span>
                  <SuchSelect
                    value={editing.globalRole || "user"}
                    onChange={(v) => setEditing({ ...editing, globalRole: v })}
                    platzhalter="Rolle wählen"
                    options={[
                      { value: "user", label: "user", hint: "Zugriff nur auf freigegebene Apps" },
                      { value: "admin", label: "admin", hint: "Zugriff auf alle Apps" },
                    ]}
                  />
                  <span className="ver-hinweis">„admin" hat automatisch Zugriff auf alle Apps, „user" nur auf die unten freigegebenen.</span>
                </label>

                {/* Weitere Anmelde-Adressen: Firmen-, Privat- und beliebige weitere Adressen.
                    Mit jeder davon ist die Anmeldung möglich – das Passwort bleibt dasselbe. */}
                {editing.id && (
                  <div className="kt-block">
                    <div className="kt-block-titel"><Icon name="mail" size={14} /> Weitere Anmelde-Adressen</div>
                    <div className="kt-block-inhalt">
                      <div className="ver-hinweis">
                        Anmeldung ist mit der Hauptadresse <b>und</b> jeder hier hinterlegten Adresse möglich –
                        mit demselben Passwort. Nur die Hauptadresse wandert in den Mitarbeiterstammsatz
                        und in kontor, clocker und ProjectEye.
                      </div>

                      {mails.length === 0 && (
                        <div className="muted" style={{ fontSize: 13 }}>Noch keine weitere Adresse hinterlegt.</div>
                      )}
                      {mails.map((m: any) => (
                        <div key={m.id} className="ver-mail">
                          <div className="ver-mail-text">
                            <span>{m.email}</span>
                            {m.label && <small className="muted" style={{ fontSize: 12 }}>{m.label}</small>}
                          </div>
                          <button type="button" className="btn btn-icon" title="E-Mail kopieren" aria-label="E-Mail kopieren"
                            onClick={() => inZwischenablage(m.email, "E-Mail", "w" + m.id)}>
                            <Icon name={kopiert === "w" + m.id ? "check" : "copy"} size={14} />
                          </button>
                          <button type="button" className="btn" title="Diese Adresse zur Hauptadresse machen"
                            onClick={() => mailZurHaupt(m.id)}>
                            <Icon name="star" /> <span className="btn-label">Zur Hauptadresse</span>
                          </button>
                          <button type="button" className="btn btn-icon btn-danger" title="Adresse entfernen" aria-label="Adresse entfernen"
                            onClick={() => mailEntfernen(m.id)}>
                            <Icon name="trash" size={14} />
                          </button>
                        </div>
                      ))}

                      <div className="ver-mail-neu">
                        <TextField type="email" placeholder="weitere Adresse, z. B. privat@web.de"
                          value={neueMail} onChange={setNeueMail}
                          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); mailHinzufuegen(); } }} />
                        <TextField placeholder="Bezeichnung (privat …)"
                          value={neuesLabel} onChange={setNeuesLabel}
                          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); mailHinzufuegen(); } }} />
                        <button type="button" className="btn" disabled={!neueMail.trim()} onClick={mailHinzufuegen}>
                          <Icon name="plus" /> Hinzufügen
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </section>

              {/* ── Anmeldung: Passwort und Anmeldung ohne Passwort ── */}
              <section className="kt-abschnitt">
                <div className="kt-abschnitt-titel">
                  <span className="ic"><Icon name="lock" size={15} /></span> Anmeldung
                  {editing.id && <small>Passwort leer = unverändert</small>}
                </div>
                <label style={{ fontSize: 13, display: "grid", gap: 4 }}>
                  <span className="muted" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <Icon name="lock" size={14} /> Passwort
                  </span>
                  <div className="ver-pw-feld">
                    <input
                      className="input"
                      style={{ fontFamily: pwSichtbar ? "ui-monospace, monospace" : undefined }}
                      type={pwSichtbar ? "text" : "password"}
                      value={editing.password}
                      autoComplete="new-password"
                      placeholder={editing.id ? "leer lassen = unverändert" : "Passwort vergeben oder erzeugen"}
                      onChange={(e) => setEditing({ ...editing, password: e.target.value })}
                    />
                    <button type="button" className="btn btn-icon" title={pwSichtbar ? "Passwort verbergen" : "Passwort anzeigen"}
                      aria-label={pwSichtbar ? "Passwort verbergen" : "Passwort anzeigen"}
                      onClick={() => setPwSichtbar((v) => !v)}>
                      <Icon name={pwSichtbar ? "eye-off" : "eye"} />
                    </button>
                    <button type="button" className="btn btn-icon" title="Passwort in die Zwischenablage kopieren"
                      aria-label="Passwort kopieren"
                      disabled={!editing.password}
                      onClick={() => inZwischenablage(editing.password, "Passwort", "pw")}>
                      <Icon name={kopiert === "pw" ? "check" : "copy"} />
                    </button>
                    <button type="button" className="btn" title="Sicheres Passwort erzeugen"
                      onClick={() => { const neu = erzeugePasswort(); setEditing({ ...editing, password: neu }); setPwSichtbar(true); }}>
                      <Icon name="redo" /> Erzeugen
                    </button>
                    {editing.id && (
                      <button type="button" className="btn" title="Hinterlegtes Passwort anzeigen"
                        onClick={() => passwortAnzeigen({ id: editing.id!, name: editing.name, email: editing.email })}>
                        <Icon name="eye" /> Hinterlegtes anzeigen
                      </button>
                    )}
                  </div>
                  <span className="ver-hinweis">
                    „Hinterlegtes anzeigen" zeigt das zuletzt über Nexus vergebene Passwort (verschlüsselt gespeichert,
                    nur für globale Admins, jeder Abruf wird im Verlauf vermerkt). Bei älteren Konten existiert es noch nicht –
                    dann einfach ein neues erzeugen, kopieren und speichern.
                  </span>
                </label>

                {/* Anmeldung ohne Passwort: Bestätigung auf einem angemeldeten Gerät (Register auth.qr-login) */}
                <div className="ver-schalter-zeile">
                  <Icon name="smartphone" size={18} style={{ marginTop: 2, color: "var(--accent)" }} />
                  <div>
                    <Toggle checked={editing.globalRole === "admin" || !!editing.anmeldungBestaetigen}
                      label="Anmeldung ohne Passwort"
                      onChange={(v: boolean) => editing.globalRole !== "admin" && setEditing({ ...editing, anmeldungBestaetigen: v })} />
                    <div className="ver-hinweis" style={{ marginTop: 4 }}>
                      {editing.globalRole === "admin"
                        ? "Für Admins immer erlaubt."
                        : "Beim Anmelden nur die E-Mail eingeben – auf einem Gerät, auf dem der User schon angemeldet ist, erscheint eine Anfrage zum Bestätigen."}
                    </div>
                  </div>
                </div>
              </section>

              {/* ── App-Zulassung: je App Schiebeschalter + Rolle ── */}
              <section className="kt-abschnitt">
                <div className="kt-abschnitt-titel">
                  <span className="ic"><Icon name="command" size={15} /></span> App-Zulassung
                  <small>{editing.globalRole === "admin" ? "alle Apps" : `${freigegebenImFenster} von ${APPS.length} freigegeben`}</small>
                </div>
                {editing.globalRole === "admin" && (
                  <div className="ver-schalter-zeile">
                    <Icon name="shield" size={16} style={{ marginTop: 1, color: "var(--accent)" }} />
                    <span className="ver-hinweis">
                      Globaler Admin — hat automatisch Zugriff auf <b>alle</b> Apps. Die folgenden
                      App-Freigaben werden dann ignoriert.
                    </span>
                  </div>
                )}
                <div className={`ver-apps${editing.globalRole === "admin" ? " gesperrt" : ""}`}>
                  {APPS.map((a) => {
                    const ac = editing.access[a];
                    return (
                      <div key={a} className={`ver-app${ac.allowed ? " an" : ""}`}>
                        <span className="ver-app-logo" aria-hidden>{appName(a).slice(0, 2).toUpperCase()}</span>
                        <div className="ver-app-text">
                          <b>{appName(a)}</b>
                          <small>{ac.allowed ? `zugelassen als ${ac.role || "user"}` : "kein Zugriff"}</small>
                        </div>
                        <div className="ver-app-rolle">
                          <SuchSelect
                            value={ac.role || "user"}
                            disabled={!ac.allowed}
                            onChange={(v) => setEditing({ ...editing, access: { ...editing.access, [a]: { ...ac, role: v } } })}
                            platzhalter="Rolle"
                            options={[
                              { value: "user", label: "user" },
                              { value: "admin", label: "admin" },
                              // App-eigene Rollen (z. B. clocker: Buchhaltung)
                              ...(APP_ROLLEN[a] ?? []),
                              // In der App vergebene Sonderrolle beibehalten, falls vorhanden
                              ...(ac.role && !["user", "admin", ...(APP_ROLLEN[a] ?? []).map(r => r.value)].includes(ac.role) ? [{ value: ac.role, label: ac.role }] : []),
                            ]}
                          />
                        </div>
                        <Toggle checked={ac.allowed}
                          onChange={(v) => setEditing({ ...editing, access: { ...editing.access, [a]: { ...ac, allowed: v } } })} />
                      </div>
                    );
                  })}
                </div>
              </section>

              {dialogFehler && (
                <div className="kt-fehler" role="alert"><Icon name="alert" size={16} /> <span style={{ flex: 1 }}>{dialogFehler}</span></div>
              )}
            </div>

            <div className="kt-fuss">
              <button className="btn" onClick={() => setEditing(null)} disabled={speichert}><Icon name="x" /> Abbrechen</button>
              <button className="btn btn-primary" onClick={save} disabled={speichert} aria-busy={speichert}>
                {speichert
                  ? <><span className="speichern-dreh" /> Speichert…</>
                  : <><Icon name="save" /> Speichern</>}
              </button>
            </div>
          </div>
        </div>
      )}
      {gespeichert && (
        <div className="update-leiste" role="status" style={{ background: "#16a34a" }}>
          <Icon name="check" size={16} /> {gespeichert}
        </div>
      )}
    </div>
  );
}
