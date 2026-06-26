"use client";
import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/clientApi";
import Toggle from "@/components/Toggle";
import Icon from "@/components/Icon";

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
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, display: "flex", alignItems: "center", gap: 10 }}>
          <Icon name="shield" size={24} /> Userverwaltung
        </h1>
        <button className="btn btn-primary" onClick={openNew}><Icon name="plus" /> Neuer User</button>
      </div>
      <p className="muted" style={{ marginBottom: 16 }}>Ein Login für alle berechtigten Apps. Pro App: Zulassung + Rolle.</p>
      {msg && <div className="card" style={{ padding: "8px 12px", marginBottom: 12, fontSize: 14 }}>{msg}</div>}

      <div className="card" style={{ overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead><tr style={{ textAlign: "left", borderBottom: "1px solid var(--border)" }}>
            <th style={{ padding: "10px 12px" }}>Name</th>
            <th style={{ padding: "10px 12px" }}>E-Mail</th>
            <th style={{ padding: "10px 12px" }}>Globale Rolle</th>
            <th style={{ padding: "10px 12px" }}>App-Zugriff</th>
            <th style={{ padding: "10px 12px" }}>Herkunft</th>
            <th></th>
          </tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} style={{ borderBottom: "1px solid var(--border)" }}>
                <td style={{ padding: "10px 12px" }}>{r.name}</td>
                <td style={{ padding: "10px 12px" }}>{r.email}</td>
                <td style={{ padding: "10px 12px" }}>{r.globalRole}</td>
                <td style={{ padding: "10px 12px", fontSize: 12 }}>
                  {(r.appAccess || []).filter((a: any) => a.allowed).map((a: any) => `${a.appKey}:${a.role}`).join(", ") || "–"}
                </td>
                <td style={{ padding: "10px 12px" }}>{r.origin}</td>
                <td style={{ padding: "8px 12px" }}><button className="btn" onClick={() => openEdit(r)}><Icon name="pencil" /> Bearbeiten</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <div onClick={() => setEditing(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", display: "grid", placeItems: "center", padding: 16, zIndex: 50 }}>
          <div onClick={(e) => e.stopPropagation()} className="card" style={{ padding: 24, width: 560, maxWidth: "92vw", maxHeight: "90vh", overflow: "auto" }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>{editing.id ? "User bearbeiten" : "Neuer User"}</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12 }}>
              <label style={{ fontSize: 13 }}>E-Mail
                <input className="input" value={editing.email} disabled={!!editing.id} onChange={(e) => setEditing({ ...editing, email: e.target.value })} />
              </label>
              <label style={{ fontSize: 13 }}>Name
                <input className="input" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
              </label>
              <label style={{ fontSize: 13 }}>Passwort {editing.id && <span className="muted">(leer = unverändert)</span>}
                <input className="input" type="password" value={editing.password} onChange={(e) => setEditing({ ...editing, password: e.target.value })} />
              </label>
              <label style={{ fontSize: 13 }}>Globale Rolle
                <select className="input" value={editing.globalRole} onChange={(e) => setEditing({ ...editing, globalRole: e.target.value })}>
                  <option value="user">user</option>
                  <option value="admin">admin</option>
                </select>
              </label>
            </div>
            <h3 style={{ fontSize: 14, fontWeight: 600, margin: "18px 0 8px" }}>App-Zulassung</h3>
            <div style={{ display: "grid", gap: 8 }}>
              {APPS.map((a) => {
                const ac = editing.access[a];
                return (
                  <div key={a} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 140 }}>
                      <Toggle checked={ac.allowed} label={a}
                        onChange={(v) => setEditing({ ...editing, access: { ...editing.access, [a]: { ...ac, allowed: v } } })} />
                    </div>
                    <input className="input" style={{ maxWidth: 180 }} placeholder="Rolle" value={ac.role} disabled={!ac.allowed}
                      onChange={(e) => setEditing({ ...editing, access: { ...editing.access, [a]: { ...ac, role: e.target.value } } })} />
                  </div>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
              <button className="btn" onClick={() => setEditing(null)}><Icon name="x" /> Abbrechen</button>
              <button className="btn btn-primary" onClick={save}><Icon name="save" /> Speichern</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
