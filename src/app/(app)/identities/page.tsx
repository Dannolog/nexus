"use client";
import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/clientApi";
import Toggle from "@/components/Toggle";
import Icon from "@/components/Icon";
import { kopiere, erzeugePasswort } from "@/lib/kopieren";
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

  return (
    <div>
      <div className="vertrag-kopf" style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, display: "flex", alignItems: "center", gap: 10 }}>
          <Icon name="shield" size={24} /> Userverwaltung
        </h1>
        <button className="btn btn-primary" onClick={openNew}><Icon name="plus" /> Neuer User</button>
      </div>
      <p className="muted" style={{ marginBottom: 16 }}>Ein Login für alle berechtigten Apps. Pro App: Zulassung + Rolle.</p>
      {msg && <div className="card" style={{ padding: "8px 12px", marginBottom: 12, fontSize: 14 }}>{msg}</div>}

      <div className="card only-desktop" style={{ overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead><tr style={{ textAlign: "left", borderBottom: "1px solid var(--border)" }}>
            <th style={{ padding: "10px 12px", width: 1, whiteSpace: "nowrap" }}>Nr.</th>
            <th style={{ padding: "10px 12px" }}>Name</th>
            <th style={{ padding: "10px 12px" }}>E-Mail</th>
            <th style={{ padding: "10px 12px" }}>Globale Rolle</th>
            <th style={{ padding: "10px 12px" }}>App-Zugriff</th>
            <th style={{ padding: "10px 12px" }}>Herkunft</th>
            <th></th>
          </tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id} style={{ borderBottom: "1px solid var(--border)" }}>
                <td style={{ padding: "10px 12px", whiteSpace: "nowrap", color: "var(--muted)", fontVariantNumeric: "tabular-nums", fontSize: 13 }}>US-{i + 1}</td>
                <td style={{ padding: "10px 12px" }}>{r.name}</td>
                <td style={{ padding: "10px 12px" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    {r.email}
                    <button className="btn btn-icon" title="E-Mail kopieren" aria-label="E-Mail kopieren"
                      onClick={() => inZwischenablage(r.email, "E-Mail", "m" + r.id)}>
                      <Icon name={kopiert === "m" + r.id ? "check" : "copy"} size={14} />
                    </button>
                  </span>
                </td>
                <td style={{ padding: "10px 12px" }}>{r.globalRole}</td>
                <td style={{ padding: "10px 12px", fontSize: 12 }}>
                  {(r.appAccess || []).filter((a: any) => a.allowed).map((a: any) => `${a.appKey}:${a.role}`).join(", ") || "–"}
                </td>
                <td style={{ padding: "10px 12px" }}>{r.origin}</td>
                <td style={{ padding: "8px 12px" }}><button className="btn btn-icon" title="Bearbeiten" aria-label="Bearbeiten" onClick={() => openEdit(r)}><Icon name="pencil" /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Handy: Karten statt Tabelle */}
      <div className="only-mobile" style={{ gap: 10 }}>
        {rows.map((r, i) => (
          <div key={r.id} className="card" style={{ padding: 14, display: "grid", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontWeight: 600, fontSize: 15, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</span>
              <span className="muted" style={{ fontSize: 12, fontVariantNumeric: "tabular-nums" }}>US-{i + 1}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, wordBreak: "break-all" }}>{r.email}</span>
              <button className="btn btn-icon" title="E-Mail kopieren" aria-label="E-Mail kopieren"
                onClick={() => inZwischenablage(r.email, "E-Mail", "k" + r.id)}>
                <Icon name={kopiert === "k" + r.id ? "check" : "copy"} />
              </button>
            </div>
            <div className="muted" style={{ fontSize: 12.5, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <span>Rolle: <b>{r.globalRole}</b></span>
              <span>Herkunft: {r.origin}</span>
            </div>
            <div className="muted" style={{ fontSize: 12 }}>
              Apps: {(r.appAccess || []).filter((a: any) => a.allowed).map((a: any) => `${a.appKey}:${a.role}`).join(", ") || "–"}
            </div>
            <button className="btn" style={{ justifyContent: "center" }} onClick={() => openEdit(r)}>
              <Icon name="pencil" /> Bearbeiten
            </button>
          </div>
        ))}
      </div>

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
                  <button type="button" className="btn" title="Sicheres Passwort erzeugen"
                    onClick={() => { const neu = erzeugePasswort(); setEditing({ ...editing, password: neu }); setPwSichtbar(true); }}>
                    <Icon name="redo" /> Erzeugen
                  </button>
                </div>
                <span className="muted" style={{ fontSize: 11.5, display: "block", marginTop: 4, lineHeight: 1.45 }}>
                  Gespeicherte Passwörter lassen sich nicht anzeigen – sie liegen nur verschlüsselt vor.
                  Kopieren geht nur mit dem Wert, der gerade hier steht: erzeugen, kopieren, an den Mitarbeiter geben.
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
