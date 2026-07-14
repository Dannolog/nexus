"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { api, ConflictError } from "@/lib/clientApi";
import { RESOURCES, Field } from "@/lib/uiSchema";
import ConfirmDialog from "@/components/ConfirmDialog";
import SearchInput from "@/components/SearchInput";
import Toggle from "@/components/Toggle";
import Icon from "@/components/Icon";
import ColorPicker from "@/components/ColorPicker";
import TextField from "@/components/TextField";

const LOGO_RESOURCES = ["customers", "organizations"];

function cell(v: any) {
  if (typeof v === "boolean") return v ? "ja" : "–";
  if (v == null || v === "") return "–";
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v)) return new Date(v).toLocaleDateString("de-DE");
  return String(v);
}

export default function ResourceView({ resourceKey }: { resourceKey: string }) {
  const R = RESOURCES[resourceKey];
  const hasLogo = LOGO_RESOURCES.includes(resourceKey);
  const [rows, setRows] = useState<any[]>([]);
  const [logos, setLogos] = useState<Record<string, string>>({});
  const [search, setSearch] = useState(() =>
    typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("q") || "" : ""
  );
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<any | null>(null); // null=zu, {}=neu, {..}=bearbeiten
  const [deleting, setDeleting] = useState<any | null>(null);
  const [msg, setMsg] = useState("");

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

  async function save(form: any) {
    try {
      if (form.id) {
        await api(`/api/${R.key}/${form.id}`, {
          method: "PATCH",
          body: JSON.stringify({ ...form, expectedVersion: form.version }),
        });
        setMsg("Gespeichert.");
        if (hasLogo && form.logo !== undefined) setLogos((prev) => ({ ...prev, [form.id]: form.logo }));
      } else {
        await api(`/api/${R.key}`, { method: "POST", body: JSON.stringify(form) });
        setMsg("Angelegt.");
      }
      setEditing(null);
      load();
    } catch (e: any) {
      if (e instanceof ConflictError) {
        setMsg("Versionskonflikt — der Datensatz wurde zwischenzeitlich geändert. Aktueller Stand geladen.");
        setEditing({ ...e.current });
        load();
      } else setMsg("Fehler: " + e.message);
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

  const colCount = R.columns.length + 2 + (hasLogo ? 1 : 0);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, display: "flex", alignItems: "center", gap: 10 }}>
          <Icon name={R.icon} size={24} /> {R.title}
        </h1>
        <button className="btn btn-primary" onClick={() => setEditing({})}><Icon name="plus" /> Neu</button>
        <SearchInput value={search} onChange={setSearch} style={{ flex: "1 1 200px", maxWidth: 320, marginLeft: "auto" }} />
      </div>
      {msg && <div className="card" style={{ padding: "8px 12px", marginBottom: 12, fontSize: 14 }}>{msg}</div>}

      {/* Desktop: Tabelle */}
      <div className="card only-desktop" style={{ overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid var(--border)" }}>
              <th style={{ padding: "10px 12px", width: 1, whiteSpace: "nowrap" }}>Nr.</th>
              {hasLogo && <th style={{ padding: "10px 12px", width: 44 }}></th>}
              {R.columns.map((c) => <th key={c.key} style={{ padding: "10px 12px" }}>{c.label}</th>)}
              <th style={{ padding: "10px 12px", width: 1 }}></th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={colCount} style={{ padding: 16 }} className="muted">Lädt…</td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={colCount} style={{ padding: 16 }} className="muted">Keine Einträge.</td></tr>}
            {rows.map((row, i) => (
              <tr key={row.id} style={{ borderBottom: "1px solid var(--border)" }}>
                <td style={{ padding: "10px 12px", whiteSpace: "nowrap", color: "var(--muted)", fontVariantNumeric: "tabular-nums", fontSize: 13 }}>
                  {R.prefix}-{i + 1}
                </td>
                {hasLogo && (
                  <td style={{ padding: "6px 12px" }}>
                    <LogoThumb src={logos[row.id]} color={row.color} />
                  </td>
                )}
                {R.columns.map((c) => <td key={c.key} style={{ padding: "10px 12px" }}>{cell(row[c.key])}</td>)}
                <td style={{ padding: "8px 12px", whiteSpace: "nowrap", display: "flex", gap: 6 }}>
                  <button className="btn btn-icon" title="Bearbeiten" aria-label="Bearbeiten" onClick={() => setEditing({ ...row })}><Icon name="pencil" /></button>
                  <Link className="btn btn-icon" title="Verlauf" aria-label="Verlauf" href={`/history?entity=${R.entity}&entityId=${row.id}`}><Icon name="history" /></Link>
                  <button className="btn btn-icon btn-danger" title="Löschen" aria-label="Löschen" onClick={() => setDeleting(row)}><Icon name="trash" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Handy: Kacheln/Karten statt Tabelle */}
      <div className="only-mobile" style={{ gap: 10 }}>
        {loading && <div className="card muted" style={{ padding: 16 }}>Lädt…</div>}
        {!loading && rows.length === 0 && <div className="card muted" style={{ padding: 16 }}>Keine Einträge.</div>}
        {rows.map((row, i) => (
          <div key={row.id} className="card" style={{ padding: 14, display: "grid", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {hasLogo && <LogoThumb src={logos[row.id]} color={row.color} />}
              <div style={{ fontWeight: 600, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
                {cell(row[R.titleField]) === "–" ? `${R.prefix}-${i + 1}` : cell(row[R.titleField])}
              </div>
              <span className="muted" style={{ fontSize: 12, flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>{R.prefix}-{i + 1}</span>
            </div>
            <div style={{ display: "grid", gap: 5, fontSize: 13 }}>
              {R.columns.filter((c) => c.key !== R.titleField).map((c) => (
                <div key={c.key} style={{ display: "flex", gap: 10 }}>
                  <span className="muted" style={{ minWidth: 96, flexShrink: 0 }}>{c.label}</span>
                  <span style={{ flex: 1, minWidth: 0, wordBreak: "break-word" }}>{cell(row[c.key])}</span>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", borderTop: "1px solid var(--border)", paddingTop: 10 }}>
              <button className="btn btn-icon" title="Bearbeiten" aria-label="Bearbeiten" onClick={() => setEditing({ ...row })}><Icon name="pencil" /></button>
              <Link className="btn btn-icon" title="Verlauf" aria-label="Verlauf" href={`/history?entity=${R.entity}&entityId=${row.id}`}><Icon name="history" /></Link>
              <button className="btn btn-icon btn-danger" title="Löschen" aria-label="Löschen" onClick={() => setDeleting(row)}><Icon name="trash" /></button>
            </div>
          </div>
        ))}
      </div>

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

function LogoThumb({ src, color }: { src?: string; color?: string }) {
  if (src) return <img src={src} alt="" style={{ width: 32, height: 32, borderRadius: 6, objectFit: "cover", border: "1px solid var(--border)" }} />;
  return <div style={{ width: 32, height: 32, borderRadius: 6, background: color || "var(--border)", opacity: 0.5 }} />;
}

function EditModal({ resourceKey, hasLogo, initial, onClose, onSave }: {
  resourceKey: string; hasLogo: boolean; initial: any; onClose: () => void; onSave: (f: any) => void;
}) {
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

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", display: "grid", placeItems: "center", padding: 16, zIndex: 50 }}>
      <div onClick={(e) => e.stopPropagation()} className="card" style={{ width: 560, maxWidth: "92vw", maxHeight: "90vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ padding: "18px 24px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>
            {form.id ? `${R.title.replace(/e?n$/, "")} bearbeiten` : `Neu: ${R.title}`}
          </h2>
        </div>

        <div style={{ padding: 24, overflowY: "auto", flex: 1 }}>
        {hasLogo && (
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 18 }}>
            <LogoThumb src={currentLogo} color={form.color} />
            <div style={{ display: "flex", gap: 8 }}>
              <label className="btn" style={{ cursor: "pointer" }}>
                <Icon name="image" /> Symbol wählen
                <input type="file" accept="image/*" onChange={onLogoFile} style={{ display: "none" }} />
              </label>
              {currentLogo && <button type="button" className="btn btn-danger" onClick={removeLogo}><Icon name="x" /> Entfernen</button>}
            </div>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12 }}>
          {R.fields.map((f: Field) => (
            <label key={f.key} style={{ fontSize: 13, gridColumn: f.type === "textarea" ? "1 / -1" : "auto" }}>
              {f.label}
              {f.type === "textarea" ? (
                <textarea className="input" rows={3} value={form[f.key] ?? ""}
                  onChange={(e) => set(f.key, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      e.preventDefault();
                      if (String((e.target as HTMLTextAreaElement).value).length > 0) set(f.key, "");
                      else (e.currentTarget as HTMLTextAreaElement).blur();
                    }
                  }} />
              ) : f.type === "checkbox" ? (
                <div style={{ marginTop: 6 }}><Toggle checked={!!form[f.key]} onChange={(v) => set(f.key, v)} /></div>
              ) : f.type === "select" ? (
                <select className="input" value={form[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)}>
                  {(f.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
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
                />
              )}
            </label>
          ))}
        </div>
        </div>

        <div style={{ padding: "14px 24px", borderTop: "1px solid var(--border)", flexShrink: 0, display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button className="btn" onClick={onClose}><Icon name="x" /> Abbrechen</button>
          <button className="btn btn-primary" onClick={() => onSave(form)}><Icon name="save" /> Speichern</button>
        </div>
      </div>
    </div>
  );
}
