"use client";
import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/clientApi";

function fmt(ts: string) {
  const d = new Date(ts);
  return d.toLocaleString("de-DE");
}
function summarize(r: any) {
  try {
    const before = r.before ? JSON.parse(r.before) : null;
    const after = r.after ? JSON.parse(r.after) : null;
    if (r.action === "CREATE") return `angelegt: ${after?.companyName ?? after?.name ?? after?.email ?? r.entityId}`;
    if (r.action === "DELETE") return `gelöscht: ${before?.companyName ?? before?.name ?? before?.email ?? r.entityId}`;
    // UPDATE: geänderte Felder zeigen
    const changed: string[] = [];
    if (before && after) for (const k of Object.keys(after)) {
      if (k === "version" || k === "updatedAt") continue;
      if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) changed.push(`${k}: ${before[k]} → ${after[k]}`);
    }
    return changed.length ? changed.join(", ") : "geändert";
  } catch { return r.action; }
}

export default function HistoryPage() {
  const [filter, setFilter] = useState<{ entity?: string; entityId?: string }>({});
  const [rows, setRows] = useState<any[]>([]);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    setFilter({ entity: sp.get("entity") || undefined, entityId: sp.get("entityId") || undefined });
  }, []);

  const load = useCallback(async () => {
    const q = new URLSearchParams();
    if (filter.entity) q.set("entity", filter.entity);
    if (filter.entityId) q.set("entityId", filter.entityId);
    const d = await api(`/api/revisions?${q.toString()}`);
    setRows(d.data);
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  async function act(txId: string, kind: "undo" | "redo") {
    try {
      await api(`/api/revisions/${txId}/${kind}`, { method: "POST" });
      setMsg(kind === "undo" ? "Rückgängig gemacht." : "Wiederhergestellt.");
      load();
    } catch (e: any) { setMsg("Fehler: " + e.message); }
  }

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>Verlauf</h1>
      <p className="muted" style={{ marginBottom: 16 }}>
        {filter.entityId ? `Datensatz ${filter.entity} ${filter.entityId}` : "Alle Änderungen — jede Aktion ist rückgängig und wiederherstellbar."}
      </p>
      {msg && <div className="card" style={{ padding: "8px 12px", marginBottom: 12, fontSize: 14 }}>{msg}</div>}
      <div className="card" style={{ overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid var(--border)" }}>
              <th style={{ padding: "10px 12px" }}>Zeit</th>
              <th style={{ padding: "10px 12px" }}>Entität</th>
              <th style={{ padding: "10px 12px" }}>Aktion</th>
              <th style={{ padding: "10px 12px" }}>Änderung</th>
              <th style={{ padding: "10px 12px" }}>App</th>
              <th style={{ padding: "10px 12px" }}></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={6} className="muted" style={{ padding: 16 }}>Keine Einträge.</td></tr>}
            {rows.map((r) => (
              <tr key={r.id} style={{ borderBottom: "1px solid var(--border)", opacity: r.undone ? 0.55 : 1 }}>
                <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>{fmt(r.createdAt)}</td>
                <td style={{ padding: "10px 12px" }}>{r.entity}</td>
                <td style={{ padding: "10px 12px" }}>{r.action}{r.undone ? " (rückgängig)" : ""}</td>
                <td style={{ padding: "10px 12px", maxWidth: 360, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={summarize(r)}>{summarize(r)}</td>
                <td style={{ padding: "10px 12px" }}>{r.appKey}</td>
                <td style={{ padding: "8px 12px" }}>
                  {r.undone
                    ? <button className="btn" onClick={() => act(r.txId, "redo")}>↷ Wiederherstellen</button>
                    : <button className="btn" onClick={() => act(r.txId, "undo")}>↶ Rückgängig</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
