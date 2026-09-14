"use client";
import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/clientApi";
import Toggle from "@/components/Toggle";
import Icon from "@/components/Icon";
import { kopiere, erzeugePasswort } from "@/lib/kopieren";
import SearchInput from "@/components/SearchInput";
import Hervorheben, { sucheBegriffe } from "@/components/Hervorheben";
import TextField from "@/components/TextField";

const APPS = ["kontor", "clocker", "cnc", "schaltplan", "projecteye", "vision"];

type Access = { appKey: string; allowed: boolean; role: string };
type Form = {
  id?: string; email: string; name: string; password: string; globalRole: string; version?: number;
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
  const [laeuft, setLaeuft] = useState(false);

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

  function openNew() { setEditing(emptyForm()); }
  function openEdit(r: any) {
    const access = Object.fromEntries(APPS.map((a) => {
      const ex = (r.appAccess || []).find((x: any) => x.appKey === a);
      return [a, { appKey: a, allowed: ex?.allowed ?? false, role: ex?.role ?? "user" }];
    }));
    setPwSichtbar(false);
    setEditing({ id: r.id, email: r.email, name: r.name, password: "", globalRole: r.globalRole, version: r.version, access });
  }

  async function save() {
    if (!editing) return;
    const appAccess = Object.values(editing.access);
    const payload: any = { email: editing.email, name: editing.name, globalRole: editing.globalRole, appAccess };
    if (editing.password) payload.password = editing.password;
    try {
      if (editing.id) {
        payload.expectedVersion = editing.version;
        await api(`/api/identities/${editing.id}`, { method: "PATCH", body: JSON.stringify(payload) });
      } else {
        await api("/api/identities", { method: "POST", body: JSON.stringify(payload) });
      }
      setMsg("Gespeichert.");
      setEditing(null);
      load();
    } catch (e: any) { setMsg("Fehler: " + e.message); }
  }

  // Suche über Name, E-Mail, Rolle, Herkunft und freigeschaltete Apps.
  // Mehrere Begriffe werden UND-verknüpft: „admin kontor" findet nur beides zusammen.
  const treffer = (() => {
    const teile = sucheBegriffe(suche).map((t) => t.toLowerCase());
    if (teile.length === 0) return rows;
    return rows.filter((r: any) => {
      const apps = (r.appAccess || []).filter((a: any) => a.allowed).map((a: any) => `${a.appKey} ${a.role}`).join(" ");
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

  return (
    <div>
      <div className="vertrag-kopf" style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, display: "flex", alignItems: "center", gap: 10 }}>
          <Icon name="shield" size={24} /> Userverwaltung
        </h1>
        <button className="btn btn-primary" onClick={openNew}><Icon name="plus" /> Neuer User</button>
        <button className="btn" disabled={laeuft} onClick={() => setFrage(true)}
          title="Sichere Passwörter für die Zugänge erzeugen">
          <Icon name="shield" /> Passwörter erzeugen{ohnePasswort > 0 ? ` (${ohnePasswort} offen)` : ""}
        </button>
      </div>
      {/* Suchfeld linksbündig direkt über der Liste */}
      <div style={{ marginBottom: 12 }}>
        <SearchInput value={suche} onChange={setSuche} placeholder="Name, E-Mail, Rolle, App…"
          style={{ width: "100%", maxWidth: 340 }} />
      </div>
      <p className="muted" style={{ marginBottom: 16 }}>Ein Login für alle berechtigten Apps. Pro App: Zulassung + Rolle.</p>
      {msg && <div className="card" style={{ padding: "8px 12px", marginBottom: 12, fontSize: 14 }}>{msg}</div>}

      <div className="card only-desktop" style={{ overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead><tr style={{ textAlign: "left", borderBottom: "1px solid var(--border)" }}>
            {/* Symbol je Spalte – macht den Kopf auf einen Blick lesbar */}
            {([["tag", "Nr."], ["user", "Name"], ["mail", "E-Mail"], ["shield", "Globale Rolle"],
               ["command", "App-Zugriff"], ["lock", "Passwort"], ["archive", "Herkunft"]] as const).map(([icon, label], i) => (
              <th key={label} style={{ padding: "10px 12px", ...(i === 0 ? { width: 1, whiteSpace: "nowrap" as const } : {}) }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <Icon name={icon} size={14} /> {label}
                </span>
              </th>
            ))}
            <th></th>
          </tr></thead>
          <tbody>
            {treffer.map((r: any, i: number) => (
              <tr key={r.id} style={{ borderBottom: "1px solid var(--border)" }}>
                <td style={{ padding: "10px 12px", whiteSpace: "nowrap", color: "var(--muted)", fontVariantNumeric: "tabular-nums", fontSize: 13 }}>US-{i + 1}</td>
                <td style={{ padding: "10px 12px" }}><Hervorheben text={r.name} suche={suche} /></td>
                <td style={{ padding: "10px 12px" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <Hervorheben text={r.email} suche={suche} />
                    <button className="btn btn-icon" title="E-Mail kopieren" aria-label="E-Mail kopieren"
                      onClick={() => inZwischenablage(r.email, "E-Mail", "m" + r.id)}>
                      <Icon name={kopiert === "m" + r.id ? "check" : "copy"} size={14} />
                    </button>
                  </span>
                </td>
                <td style={{ padding: "10px 12px" }}><Hervorheben text={r.globalRole} suche={suche} /></td>
                <td style={{ padding: "10px 12px", fontSize: 12 }}>
                  {(r.appAccess || []).filter((a: any) => a.allowed).map((a: any) => `${a.appKey}:${a.role}`).join(", ") || "–"}
                </td>
                <td style={{ padding: "10px 12px", fontSize: 12.5, whiteSpace: "nowrap" }}>
                  {r.hatPasswort
                    ? <span style={{ color: "var(--muted)" }}>hinterlegt</span>
                    : <span style={{ color: "var(--warn, #c47f17)", display: "inline-flex", alignItems: "center", gap: 4 }}>
                        <Icon name="alert" size={13} /> fehlt
                      </span>}
                </td>
                <td style={{ padding: "10px 12px" }}>{r.origin}</td>
                <td style={{ padding: "8px 12px", whiteSpace: "nowrap", display: "flex", gap: 6 }}>
                  <button className="btn btn-icon" title="Hinterlegtes Passwort anzeigen" aria-label="Passwort anzeigen"
                    onClick={() => passwortAnzeigen(r)}>
                    <Icon name="shield" />
                  </button>
                  <button className="btn btn-icon" title="Bearbeiten" aria-label="Bearbeiten" onClick={() => openEdit(r)}><Icon name="pencil" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {rows.length > 0 && treffer.length === 0 && (
        <div className="card" style={{ padding: 14, fontSize: 14 }}>Kein Benutzer passt zur Suche.</div>
      )}

      {/* Handy: Karten statt Tabelle */}
      <div className="only-mobile" style={{ gap: 10 }}>
        {treffer.map((r: any, i: number) => (
          <div key={r.id} className="card" style={{ padding: 14, display: "grid", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontWeight: 600, fontSize: 15, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}><Hervorheben text={r.name} suche={suche} /></span>
              <span className="muted" style={{ fontSize: 12, fontVariantNumeric: "tabular-nums" }}>US-{i + 1}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, wordBreak: "break-all" }}><Hervorheben text={r.email} suche={suche} /></span>
              <button className="btn btn-icon" title="E-Mail kopieren" aria-label="E-Mail kopieren"
                onClick={() => inZwischenablage(r.email, "E-Mail", "k" + r.id)}>
                <Icon name={kopiert === "k" + r.id ? "check" : "copy"} />
              </button>
            </div>
            <div className="muted" style={{ fontSize: 12.5, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <span>Rolle: <b>{r.globalRole}</b></span>
              <span>Herkunft: {r.origin}</span>
              <span>Passwort: <b>{r.hatPasswort ? "hinterlegt" : "fehlt"}</b></span>
            </div>
            <div className="muted" style={{ fontSize: 12 }}>
              Apps: {(r.appAccess || []).filter((a: any) => a.allowed).map((a: any) => `${a.appKey}:${a.role}`).join(", ") || "–"}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn" style={{ flex: 1, justifyContent: "center" }} onClick={() => passwortAnzeigen(r)}>
                <Icon name="shield" /> Passwort
              </button>
              <button className="btn" style={{ flex: 1, justifyContent: "center" }} onClick={() => openEdit(r)}>
                <Icon name="pencil" /> Bearbeiten
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Auswahl: welche Konten sollen ein neues Passwort bekommen? */}
      {frage && (
        <div onClick={() => setFrage(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", display: "grid", placeItems: "center", padding: 16, zIndex: 60 }}>
          <div onClick={(e) => e.stopPropagation()} className="card" style={{ width: 520, maxWidth: "92vw", padding: 22, display: "grid", gap: 14 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
              <Icon name="shield" /> Sichere Passwörter erzeugen
            </h2>
            <p className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>
              Es werden zufällige Passwörter mit Groß-/Kleinbuchstaben, Ziffern und Zusatzzeichen
              vergeben (19 Zeichen, z.&nbsp;B. <code>hRt7#pQ4m-3Xvb@n8Ka</code>). Sie gelten sofort für
              <b> alle Apps</b>, weil die Anmeldung zentral über Nexus läuft. Die neuen Werte werden
              danach <b>einmalig</b> angezeigt – bitte sofort sichern und weitergeben.
            </p>
            <button className="btn btn-primary" style={{ justifyContent: "center" }} disabled={laeuft || ohnePasswort === 0}
              onClick={() => passwoerterErzeugen("fehlende")}>
              <Icon name="shield" /> Nur fehlende ({ohnePasswort})
            </button>
            <button className="btn" style={{ justifyContent: "center" }} disabled={laeuft}
              onClick={() => passwoerterErzeugen("alle")}>
              <Icon name="redo" /> Alle {rows.length} Benutzer neu setzen
            </button>
            <span className="muted" style={{ fontSize: 12 }}>
              „Alle neu setzen" macht die bisherigen Passwörter sofort ungültig – jeder Mitarbeiter
              braucht dann das neue.
            </span>
            <button className="btn" style={{ justifyContent: "center" }} onClick={() => setFrage(false)}>
              <Icon name="x" /> Abbrechen
            </button>
          </div>
        </div>
      )}

      {/* Einzelnes hinterlegtes Passwort ansehen */}
      {pwAnzeige && (
        <div onClick={() => setPwAnzeige(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", display: "grid", placeItems: "center", padding: 16, zIndex: 60 }}>
          <div onClick={(e) => e.stopPropagation()} className="card" style={{ width: 460, maxWidth: "92vw", padding: 22, display: "grid", gap: 12 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
              <Icon name="shield" /> Passwort von {pwAnzeige.name}
            </h2>
            <div className="muted" style={{ fontSize: 13, wordBreak: "break-all" }}>{pwAnzeige.email}</div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <code style={{ flex: 1, minWidth: 0, fontSize: 17, padding: "10px 12px", borderRadius: 8, border: "1px solid var(--border)", wordBreak: "break-all", fontFamily: "ui-monospace, monospace" }}>
                {pwAnzeige.passwort}
              </code>
              <button className="btn btn-icon" title="Passwort kopieren"
                onClick={() => inZwischenablage(pwAnzeige.passwort, "Passwort", "einzel")}>
                <Icon name={kopiert === "einzel" ? "check" : "copy"} />
              </button>
            </div>
            <span className="muted" style={{ fontSize: 12, lineHeight: 1.45 }}>
              Nur für globale Admins – der Abruf wird im Verlauf vermerkt. Bitte über einen sicheren
              Weg weitergeben und das Fenster danach schließen.
            </span>
            <button className="btn" style={{ justifyContent: "center" }} onClick={() => setPwAnzeige(null)}>
              <Icon name="x" /> Schließen
            </button>
          </div>
        </div>
      )}

      {/* Ergebnis der Sammelvergabe — einmalige Anzeige */}
      {sammel && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", display: "grid", placeItems: "center", padding: 16, zIndex: 60 }}>
          <div className="card" style={{ width: 640, maxWidth: "94vw", maxHeight: "90vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ padding: "18px 22px", borderBottom: "1px solid var(--border)" }}>
              <h2 style={{ fontSize: 18, fontWeight: 700 }}>{sammel.length} neue Passwörter</h2>
              <p className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>
                Jetzt sichern – danach sind sie nur noch einzeln über das Schild-Symbol abrufbar.
              </p>
            </div>
            <div style={{ padding: 16, overflowY: "auto", flex: 1, display: "grid", gap: 8 }}>
              {sammel.map((b) => (
                <div key={b.id} style={{ display: "flex", gap: 8, alignItems: "center", borderBottom: "1px solid var(--border)", paddingBottom: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{b.name}</div>
                    <div className="muted" style={{ fontSize: 12, wordBreak: "break-all" }}>{b.email}</div>
                  </div>
                  <code style={{ fontFamily: "ui-monospace, monospace", fontSize: 14, wordBreak: "break-all" }}>{b.passwort}</code>
                  <button className="btn btn-icon" title="Passwort kopieren"
                    onClick={() => inZwischenablage(b.passwort, "Passwort", "s" + b.id)}>
                    <Icon name={kopiert === "s" + b.id ? "check" : "copy"} />
                  </button>
                </div>
              ))}
            </div>
            <div style={{ padding: "14px 22px", borderTop: "1px solid var(--border)", display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
              <button className="btn"
                onClick={() => inZwischenablage(sammel.map((b) => `${b.name}\t${b.email}\t${b.passwort}`).join("\n"), "Liste", "liste")}>
                <Icon name={kopiert === "liste" ? "check" : "copy"} /> Ganze Liste kopieren
              </button>
              <button className="btn btn-primary" onClick={() => setSammel(null)}><Icon name="check" /> Gesichert, schließen</button>
            </div>
          </div>
        </div>
      )}

      {editing && (
        <div onClick={() => setEditing(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", display: "grid", placeItems: "center", padding: 16, zIndex: 50 }}>
          <div onClick={(e) => e.stopPropagation()} className="card dm-fenster" style={{ width: 560, maxWidth: "92vw", maxHeight: "90vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ padding: "18px 24px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700 }}>{editing.id ? "User bearbeiten" : "Neuer User"}</h2>
            </div>
            <div style={{ padding: 24, overflowY: "auto", flex: 1 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12 }}>
              <label style={{ fontSize: 13 }}>E-Mail
                <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 4 }}>
                  <input className="input" style={{ flex: 1, minWidth: 0 }} type="email" value={editing.email}
                    disabled={!!editing.id} onChange={(e) => setEditing({ ...editing, email: e.target.value })} />
                  <button type="button" className="btn btn-icon" title="E-Mail kopieren" disabled={!editing.email}
                    onClick={() => inZwischenablage(editing.email, "E-Mail", "dm")}>
                    <Icon name={kopiert === "dm" ? "check" : "copy"} />
                  </button>
                </div>
              </label>
              <label style={{ fontSize: 13 }}>Name
                <TextField value={editing.name} onChange={(v) => setEditing({ ...editing, name: v })} />
              </label>
              <label style={{ fontSize: 13, gridColumn: "1 / -1" }}>
                Passwort {editing.id && <span className="muted">(leer = unverändert)</span>}
                <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 4, flexWrap: "wrap" }}>
                  <input
                    className="input"
                    style={{ flex: "1 1 180px", minWidth: 0, fontFamily: pwSichtbar ? "ui-monospace, monospace" : undefined }}
                    type={pwSichtbar ? "text" : "password"}
                    value={editing.password}
                    autoComplete="new-password"
                    placeholder={editing.id ? "leer lassen = unverändert" : "Passwort vergeben oder erzeugen"}
                    onChange={(e) => setEditing({ ...editing, password: e.target.value })}
                  />
                  <button type="button" className="btn btn-icon" title={pwSichtbar ? "Passwort verbergen" : "Passwort anzeigen"}
                    onClick={() => setPwSichtbar((v) => !v)}>
                    <Icon name={pwSichtbar ? "eye-off" : "eye"} />
                  </button>
                  <button type="button" className="btn btn-icon" title="Passwort in die Zwischenablage kopieren"
                    disabled={!editing.password}
                    onClick={() => inZwischenablage(editing.password, "Passwort", "pw")}>
                    <Icon name={kopiert === "pw" ? "check" : "copy"} />
                  </button>
                  {editing.id && (
                    <button type="button" className="btn" title="Hinterlegtes Passwort anzeigen"
                      onClick={() => passwortAnzeigen({ id: editing.id!, name: editing.name, email: editing.email })}>
                      <Icon name="shield" /> Hinterlegtes anzeigen
                    </button>
                  )}
                  <button type="button" className="btn" title="Sicheres Passwort erzeugen"
                    onClick={() => { const neu = erzeugePasswort(); setEditing({ ...editing, password: neu }); setPwSichtbar(true); }}>
                    <Icon name="redo" /> Erzeugen
                  </button>
                </div>
                <span className="muted" style={{ fontSize: 11.5, display: "block", marginTop: 4, lineHeight: 1.45 }}>
                  „Hinterlegtes anzeigen" zeigt das zuletzt über Nexus vergebene Passwort (verschlüsselt gespeichert,
                  nur für globale Admins, jeder Abruf wird im Verlauf vermerkt). Bei älteren Konten existiert es noch nicht –
                  dann einfach ein neues erzeugen, kopieren und speichern.
                </span>
              </label>
              <label style={{ fontSize: 13 }}>Globale Rolle
                <select className="input" value={editing.globalRole} onChange={(e) => setEditing({ ...editing, globalRole: e.target.value })}>
                  <option value="user">user</option>
                  <option value="admin">admin</option>
                </select>
              </label>
            </div>
            <h3 style={{ fontSize: 14, fontWeight: 600, margin: "18px 0 8px" }}>App-Zulassung</h3>
            {editing.globalRole === "admin" && (
              <p className="muted" style={{ fontSize: 12, margin: "0 0 8px" }}>
                Globaler Admin — hat automatisch Zugriff auf <b>alle</b> Apps. Die folgenden
                App-Freigaben werden dann ignoriert.
              </p>
            )}
            <div style={{ display: "grid", gap: 8, opacity: editing.globalRole === "admin" ? 0.45 : 1, pointerEvents: editing.globalRole === "admin" ? "none" : "auto" }}>
              {APPS.map((a) => {
                const ac = editing.access[a];
                return (
                  <div key={a} className="app-freigabe" style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 140 }}>
                      <Toggle checked={ac.allowed} label={a}
                        onChange={(v) => setEditing({ ...editing, access: { ...editing.access, [a]: { ...ac, allowed: v } } })} />
                    </div>
                    <select className="input" style={{ maxWidth: 180, flex: 1 }} value={ac.role} disabled={!ac.allowed}
                      onChange={(e) => setEditing({ ...editing, access: { ...editing.access, [a]: { ...ac, role: e.target.value } } })}>
                      <option value="user">user</option>
                      <option value="admin">admin</option>
                      {ac.role && !["user", "admin"].includes(ac.role) && (
                        <option value={ac.role}>{ac.role}</option>
                      )}
                    </select>
                  </div>
                );
              })}
            </div>
            </div>
            <div style={{ padding: "14px 24px", borderTop: "1px solid var(--border)", flexShrink: 0, display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn" onClick={() => setEditing(null)}><Icon name="x" /> Abbrechen</button>
              <button className="btn btn-primary" onClick={save}><Icon name="save" /> Speichern</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
