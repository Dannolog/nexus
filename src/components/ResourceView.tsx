"use client";
import { useEffect, useState, useCallback, Fragment } from "react";
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
  const thumbField = R.thumbField; // Bild-URL-Feld → Thumbnail in Liste/Karten
  const [rows, setRows] = useState<any[]>([]);
  const [logos, setLogos] = useState<Record<string, string>>({});
  const [search, setSearch] = useState(() =>
    typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("q") || "" : ""
  );
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<any | null>(null); // null=zu, {}=neu, {..}=bearbeiten
  const [deleting, setDeleting] = useState<any | null>(null);
  const [viewing, setViewing] = useState<any | null>(null); // Detail-Vorschau (bei R.detail)
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

  const colCount = R.columns.length + 2 + (hasLogo ? 1 : 0) + (thumbField ? 1 : 0);

  return (
    <div>
      <div className="rv-sticky-header" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
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
              {thumbField && !R.thumbAfter && <th style={{ padding: "10px 12px", width: 48 }}></th>}
              {R.columns.map((c) => (
                <Fragment key={c.key}>
                  <th style={{ padding: "10px 12px" }}>{c.label}</th>
                  {thumbField && R.thumbAfter === c.key && <th style={{ padding: "10px 12px", width: 48 }}>Bild</th>}
                </Fragment>
              ))}
              <th style={{ padding: "10px 12px", width: 1 }}></th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={colCount} style={{ padding: 16 }} className="muted">Lädt…</td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={colCount} style={{ padding: 16 }} className="muted">Keine Einträge.</td></tr>}
            {rows.map((row, i) => (
              <tr key={row.id} onClick={R.detail ? () => setViewing(row) : undefined}
                style={{ borderBottom: "1px solid var(--border)", cursor: R.detail ? "pointer" : "default" }}>
                <td style={{ padding: "10px 12px", whiteSpace: "nowrap", color: "var(--muted)", fontVariantNumeric: "tabular-nums", fontSize: 13 }}>
                  {R.prefix}-{i + 1}
                </td>
                {hasLogo && (
                  <td style={{ padding: "6px 12px" }}>
                    <LogoThumb src={logos[row.id]} color={row.color} />
                  </td>
                )}
                {thumbField && !R.thumbAfter && (
                  <td style={{ padding: "6px 12px" }}>
                    <LogoThumb src={row[thumbField]} />
                  </td>
                )}
                {R.columns.map((c) => (
                  <Fragment key={c.key}>
                    <td style={{ padding: "10px 12px" }}>{cell(row[c.key])}</td>
                    {thumbField && R.thumbAfter === c.key && (
                      <td style={{ padding: "6px 12px" }}><LogoThumb src={row[thumbField]} /></td>
                    )}
                  </Fragment>
                ))}
                <td onClick={(e) => e.stopPropagation()} style={{ padding: "8px 12px", whiteSpace: "nowrap", display: "flex", gap: 6 }}>
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
          <div key={row.id} className="card" onClick={R.detail ? () => setViewing(row) : undefined}
            style={{ padding: 14, display: "grid", gap: 10, cursor: R.detail ? "pointer" : "default" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {hasLogo && <LogoThumb src={logos[row.id]} color={row.color} />}
              {thumbField && <LogoThumb src={row[thumbField]} />}
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
            <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", gap: 8, justifyContent: "flex-end", borderTop: "1px solid var(--border)", paddingTop: 10 }}>
              <button className="btn btn-icon" title="Bearbeiten" aria-label="Bearbeiten" onClick={() => setEditing({ ...row })}><Icon name="pencil" /></button>
              <Link className="btn btn-icon" title="Verlauf" aria-label="Verlauf" href={`/history?entity=${R.entity}&entityId=${row.id}`}><Icon name="history" /></Link>
              <button className="btn btn-icon btn-danger" title="Löschen" aria-label="Löschen" onClick={() => setDeleting(row)}><Icon name="trash" /></button>
            </div>
          </div>
        ))}
      </div>

      {viewing && (
        <DetailModal
          resourceKey={resourceKey}
          row={viewing}
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

  // Einzelnes Eingabe-Control zu einem Feld (wird in beiden Layouts wiederverwendet)
  const fieldControl = (f: Field) =>
    f.type === "textarea" ? (
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
    );

  const grouped = R.fields.some((f) => f.group);

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", display: "grid", placeItems: "center", padding: 16, zIndex: 50 }}>
      <div onClick={(e) => e.stopPropagation()} className="card" style={{ width: 620, maxWidth: "92vw", maxHeight: "90vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
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

        {grouped ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 12, rowGap: 14 }}>
            {(() => {
              let last: string | undefined;
              const out: React.ReactNode[] = [];
              R.fields.forEach((f: Field) => {
                if (f.group && f.group !== last) {
                  last = f.group;
                  out.push(
                    <div key={"grp-" + f.group} style={{ gridColumn: "1 / -1", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", color: "var(--muted)", borderBottom: "1px solid var(--border)", paddingBottom: 4, marginTop: out.length ? 8 : 0 }}>
                      {f.group}
                    </div>
                  );
                }
                const span = f.type === "textarea" ? 12 : Math.min(12, Math.max(2, f.span || 6));
                out.push(
                  <label key={f.key} style={{ fontSize: 13, gridColumn: `span ${span}`, display: "grid", gap: 4, minWidth: 0 }}>
                    {f.label}
                    {fieldControl(f)}
                  </label>
                );
              });
              return out;
            })()}
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12 }}>
            {R.fields.map((f: Field) => (
              <label key={f.key} style={{ fontSize: 13, gridColumn: f.type === "textarea" ? "1 / -1" : "auto", display: "grid", gap: 4, minWidth: 0 }}>
                {f.label}
                {fieldControl(f)}
              </label>
            ))}
          </div>
        )}
        </div>

        <div style={{ padding: "14px 24px", borderTop: "1px solid var(--border)", flexShrink: 0, display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button className="btn" onClick={onClose}><Icon name="x" /> Abbrechen</button>
          <button className="btn btn-primary" onClick={() => onSave(form)}><Icon name="save" /> Speichern</button>
        </div>
      </div>
    </div>
  );
}

// ── Detail-Vorschau (Klick auf eine Zeile) — Bild, Felder, Links, Preis ──
function DetailModal({ resourceKey, row, onClose, onEdit, onDelete }: {
  resourceKey: string; row: any; onClose: () => void; onEdit: () => void; onDelete: () => void;
}) {
  const R = RESOURCES[resourceKey];
  const img = String(row.imageUrl || "").trim();
  const links = String(row.links || "").split(/\n+/).map((s) => s.trim()).filter(Boolean);
  const href = (u: string) => (/^https?:\/\//i.test(u) ? u : "https://" + u);
  const title = cell(row[R.titleField]) === "–" ? "(ohne Bezeichnung)" : cell(row[R.titleField]);
  const listFields = R.fields.filter((f) => !["imageUrl", "links"].includes(f.key) && f.key !== R.titleField);

  const renderVal = (f: Field) => {
    const v = row[f.key];
    if (f.key === "price") return (Number(v) || 0).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
    if (f.type === "checkbox") return v ? "ja" : "nein";
    if (f.type === "textarea") return <span style={{ whiteSpace: "pre-wrap" }}>{v || "–"}</span>;
    return cell(v);
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", display: "grid", placeItems: "center", padding: 16, zIndex: 55 }}>
      <div onClick={(e) => e.stopPropagation()} className="card" style={{ width: 560, maxWidth: "94vw", maxHeight: "90vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ padding: "16px 22px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</h2>
            {row.number != null && <div className="muted" style={{ fontSize: 12, fontVariantNumeric: "tabular-nums" }}>{R.prefix}-{row.number}</div>}
          </div>
          <button className="btn btn-icon" aria-label="Schließen" onClick={onClose}><Icon name="x" /></button>
        </div>

        <div style={{ padding: 22, overflowY: "auto", display: "grid", gap: 16 }}>
          {img && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={img} alt={title} style={{ width: "100%", maxHeight: 240, objectFit: "contain", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg)" }} />
          )}
          <div style={{ display: "grid", gap: 8 }}>
            {listFields.map((f) => (
              <div key={f.key} style={{ display: "flex", gap: 12, fontSize: 14 }}>
                <span className="muted" style={{ minWidth: 128, flexShrink: 0 }}>{f.label}</span>
                <span style={{ flex: 1, minWidth: 0, wordBreak: "break-word" }}>{renderVal(f)}</span>
              </div>
            ))}
          </div>
          {links.length > 0 && (
            <div style={{ display: "grid", gap: 6 }}>
              <span className="muted" style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: ".05em" }}>Links</span>
              {links.map((u, i) => (
                <a key={i} href={href(u)} target="_blank" rel="noreferrer" style={{ color: "var(--accent)", wordBreak: "break-all", fontSize: 14 }}>{u}</a>
              ))}
            </div>
          )}
        </div>

        <div style={{ padding: "14px 22px", borderTop: "1px solid var(--border)", display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center" }}>
          <Link className="btn" title="Verlauf" href={`/history?entity=${R.entity}&entityId=${row.id}`}><Icon name="history" /><span className="btn-label">&nbsp;Verlauf</span></Link>
          <button className="btn btn-danger" onClick={onDelete}><Icon name="trash" />&nbsp;Löschen</button>
          <button className="btn btn-primary" onClick={onEdit}><Icon name="pencil" />&nbsp;Bearbeiten</button>
        </div>
      </div>
    </div>
  );
}
