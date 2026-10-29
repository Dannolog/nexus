"use client";
import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/clientApi";
import Icon from "@/components/Icon";

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

/** Darstellung je Aktion: Text, Symbol und Farbe des Zeitleisten-Punkts. */
const AKTION: Record<string, { text: string; icon: string; farbe: string }> = {
  CREATE: { text: "angelegt", icon: "plus", farbe: "gruen" },
  UPDATE: { text: "geändert", icon: "pencil", farbe: "" },
  DELETE: { text: "gelöscht", icon: "trash", farbe: "rot" },
};

/** Überschrift je Tag: „Heute", „Gestern" oder das Datum mit Wochentag. */
function tagesUeberschrift(ts: string) {
  const d = new Date(ts);
  const heute = new Date();
  const gestern = new Date(); gestern.setDate(heute.getDate() - 1);
  if (d.toDateString() === heute.toDateString()) return "Heute";
  if (d.toDateString() === gestern.toDateString()) return "Gestern";
  return d.toLocaleDateString("de-DE", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
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


  // Nach Kalendertag gruppieren – die Nummer VL-n bleibt die fortlaufende Position in der Liste.
  const tage: { tag: string; eintraege: { r: any; i: number }[] }[] = [];
  rows.forEach((r, i) => {
    const tag = tagesUeberschrift(r.createdAt);
    const letzte = tage[tage.length - 1];
    if (letzte && letzte.tag === tag) letzte.eintraege.push({ r, i });
    else tage.push({ tag, eintraege: [{ r, i }] });
  });
  const istFehler = msg.startsWith("Fehler");

  return (
    <div>
      {/* ── Seitenkopf ── */}
      <div className="rv-sticky-header">
        <div className="ver-kopf">
          <div className="ver-kopf-text">
            <h1 className="seiten-titel">
              <span className="titel-icon"><Icon name="history" size={20} /></span>
              Verlauf
              <span className="anzahl">{rows.length}</span>
            </h1>
            <p className="seiten-untertitel">
              {filter.entityId ? `Datensatz ${filter.entity} ${filter.entityId}` : "Alle Änderungen — jede Aktion ist rückgängig und wiederherstellbar."}
            </p>
          </div>
        </div>
        <div className="ver-werkzeuge">
          <span className="ver-info">
            <span className="abzeichen gruen"><Icon name="plus" size={12} /> angelegt</span>
            <span className="abzeichen blau"><Icon name="pencil" size={12} /> geändert</span>
            <span className="abzeichen rot"><Icon name="trash" size={12} /> gelöscht</span>
            <span className="abzeichen"><Icon name="undo" size={12} /> rückgängig gemacht</span>
          </span>
        </div>
      </div>

      {msg && (
        <div className={`hinweis-leiste ver-meldung${istFehler ? " fehler" : ""}`} role="status">
          <Icon name={istFehler ? "alert" : "check"} size={16} />
          <span>{msg}</span>
          <button className="btn btn-icon" title="Meldung schließen" aria-label="Meldung schließen" onClick={() => setMsg("")}>
            <Icon name="x" size={14} />
          </button>
        </div>
      )}

      {rows.length === 0 && (
        <div className="card leer-zustand">
          <span className="leer-icon"><Icon name="history" size={28} /></span>
          <b style={{ color: "var(--fg)" }}>Keine Einträge.</b>
          <span style={{ fontSize: 13 }}>Sobald Daten angelegt, geändert oder gelöscht werden, erscheinen sie hier – mit Rückgängig-Knopf.</span>
        </div>
      )}

      {/* ── Zeitleiste, nach Tagen gruppiert ── */}
      {tage.map((t) => (
        <div key={t.tag}>
          <div className="ver-tag"><Icon name="calendar" size={14} /> {t.tag}</div>
          <div className="ver-zeitleiste">
            {t.eintraege.map(({ r, i }) => {
              const art = AKTION[r.action] || { text: r.action, icon: "pencil", farbe: "" };
              const text = summarize(r);
              return (
                <div key={r.id} className={`card ver-eintrag${r.undone ? " zurueck" : ""}`}>
                  <span className={`ver-punkt${art.farbe ? " " + art.farbe : ""}`} aria-hidden><Icon name={art.icon} size={14} /></span>
                  <div className="ver-eintrag-text">
                    <div className="ver-eintrag-kopf">
                      <b>{r.entity}</b>
                      <span className={`abzeichen${art.farbe === "gruen" ? " gruen" : art.farbe === "rot" ? " rot" : " blau"}`} title={r.action}>
                        {art.text}
                      </span>
                      {r.undone && <span className="abzeichen"><Icon name="undo" size={11} /> rückgängig</span>}
                    </div>
                    <div className="ver-aenderung" title={text}>{text}</div>
                    <div className="ver-eintrag-meta">
                      <span><Icon name="history" size={12} /> {fmt(r.createdAt)}</span>
                      {r.appKey && <span><Icon name="command" size={12} /> {r.appKey}</span>}
                      <span style={{ fontVariantNumeric: "tabular-nums" }}><Icon name="tag" size={12} /> VL-{i + 1}</span>
                    </div>
                  </div>
                  {r.undone
                    ? <button className="btn" title="Wiederherstellen" aria-label="Wiederherstellen" onClick={() => act(r.txId, "redo")}>
                        <Icon name="redo" /> <span className="btn-label">Wiederherstellen</span>
                      </button>
                    : <button className="btn" title="Rückgängig" aria-label="Rückgängig" onClick={() => act(r.txId, "undo")}>
                        <Icon name="undo" /> <span className="btn-label">Rückgängig</span>
                      </button>}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
