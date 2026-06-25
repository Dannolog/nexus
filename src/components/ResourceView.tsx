"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { api, ConflictError } from "@/lib/clientApi";
import { RESOURCES, Field } from "@/lib/uiSchema";

function cell(v: any) {
  if (typeof v === "boolean") return v ? "ja" : "–";
  if (v == null || v === "") return "–";
  return String(v);
}

export default function ResourceView({ resourceKey }: { resourceKey: string }) {
  const R = RESOURCES[resourceKey];
  const [rows, setRows] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<any | null>(null); // null=zu, {}=neu, {..}=bearbeiten
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await api(`/api/${R.key}?search=${encodeURIComponent(search)}`);
      setRows(d.data);
    } finally {
      setLoading(false);
    }
  }, [R.key, search]);

  useEffect(() => { load(); }, [load]);

  async function save(form: any) {
    try {
      if (form.id) {
        await api(`/api/${R.key}/${form.id}`, {
          method: "PATCH",
          body: JSON.stringify({ ...form, expectedVersion: form.version }),
        });
        setMsg("Gespeichert.");
      } else {
        await api(`/api/${R.key}`, { method: "POST", body: JSON.stringify(form) });
        setMsg("Angelegt.");
      }
      setEditing(null);
      load();
    } catch (e: any) {
      if (e instanceof ConflictError) {
        setMsg("⚠ Versionskonflikt — der Datensatz wurde zwischenzeitlich geändert. Aktueller Stand geladen.");
        setEditing({ ...e.current });
        load();
      } else setMsg("Fehler: " + e.message);
    }
  }

  async function remove(row: any) {
    if (!confirm(`„${row[R.titleField]}" löschen? (rückgängig machbar im Verlauf)`)) return;
    try {
      await api(`/api/${R.key}/${row.id}?expectedVersion=${row.version}`, { method: "DELETE" });
      setMsg("Gelöscht (im Verlauf wiederherstellbar).");
      load();
    } catch (e: any) {
      setMsg("Fehler: " + e.message);
    }
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700 }}>{R.title}</h1>
        <button className="btn btn-primary" onClick={() => setEditing({})}>+ Neu</button>
        <input className="input" style={{ maxWidth: 260, marginLeft: "auto" }}
          placeholder="Suche…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      {msg && <div className="card" style={{ padding: "8px 12px", marginBottom: 12, fontSize: 14 }}>{msg}</div>}

      <div className="card" style={{ overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid var(--border)" }}>
              {R.columns.map((c) => <th key={c.key} style={{ padding: "10px 12px" }}>{c.label}</th>)}
              <th style={{ padding: "10px 12px", width: 1 }}></th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={R.columns.length + 1} style={{ padding: 16 }} className="muted">Lädt…</td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={R.columns.length + 1} style={{ padding: 16 }} className="muted">Keine Einträge.</td></tr>}
            {rows.map((row) => (
              <tr key={row.id} style={{ borderBottom: "1px solid var(--border)" }}>
                {R.columns.map((c) => <td key={c.key} style={{ padding: "10px 12px" }}>{cell(row[c.key])}</td>)}
                <td style={{ padding: "8px 12px", whiteSpace: "nowrap", display: "flex", gap: 8 }}>
                  <button className="btn" onClick={() => setEditing({ ...row })}>Bearbeiten</button>
                  <Link className="btn" href={`/history?entity=${R.entity}&entityId=${row.id}`}>Verlauf</Link>
                  <button className="btn btn-danger" onClick={() => remove(row)}>Löschen</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && <EditModal resourceKey={resourceKey} initial={editing} onClose={() => setEditing(null)} onSave={save} />}
    </div>
  );
}

function EditModal({ resourceKey, initial, onClose, onSave }: {
  resourceKey: string; initial: any; onClose: () => void; onSave: (f: any) => void;
}) {
  const R = RESOURCES[resourceKey];
  const [form, setForm] = useState<any>(initial);
  useEffect(() => setForm(initial), [initial]);

  function set(k: string, v: any) { setForm((f: any) => ({ ...f, [k]: v })); }

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", display: "grid", placeItems: "center", padding: 16, zIndex: 50 }}>
      <div onClick={(e) => e.stopPropagation()} className="card" style={{ padding: 24, width: 520, maxHeight: "90vh", overflow: "auto" }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>
          {form.id ? `${R.title.replace(/e?n$/, "")} bearbeiten` : `Neu: ${R.title}`}
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {R.fields.map((f: Field) => (
            <label key={f.key} style={{ fontSize: 13, gridColumn: f.type === "textarea" ? "1 / -1" : "auto" }}>
              {f.label}
              {f.type === "textarea" ? (
                <textarea className="input" rows={3} value={form[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)} />
              ) : f.type === "checkbox" ? (
                <div><input type="checkbox" checked={!!form[f.key]} onChange={(e) => set(f.key, e.target.checked)} /></div>
              ) : f.type === "select" ? (
                <select className="input" value={form[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)}>
                  {(f.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : f.type === "color" ? (
                <input type="color" className="input" style={{ height: 38, padding: 2 }} value={form[f.key] ?? "#3b82f6"} onChange={(e) => set(f.key, e.target.value)} />
              ) : (
                <input className="input" type={f.type === "number" ? "number" : f.type === "email" ? "email" : "text"}
                  value={form[f.key] ?? ""} onChange={(e) => set(f.key, f.type === "number" ? Number(e.target.value) : e.target.value)} />
              )}
            </label>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
          <button className="btn" onClick={onClose}>Abbrechen</button>
          <button className="btn btn-primary" onClick={() => onSave(form)}>Speichern</button>
        </div>
      </div>
    </div>
  );
}
