"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/clientApi";
import Icon from "@/components/Icon";
import SearchInput from "@/components/SearchInput";
import Hervorheben from "@/components/Hervorheben";
import ConfirmDialog from "@/components/ConfirmDialog";

// Ansprechpartner eines Lieferanten: anlegen, bearbeiten, entfernen – mit eigener Suche.
// Die Suche verhält sich wie überall in Nexus: erstes Esc leert das Feld, zweites Esc
// gibt den Fokus frei; gefundene Stellen werden hervorgehoben.

type Kontakt = Record<string, any>;
const LEER: Kontakt = { name: "", role: "", email: "", phone: "", mobile: "", notes: "" };

export default function AnsprechpartnerListe({
  supplierId,
  vorgabeSuche = "",
  onAnzahl,
}: {
  supplierId: string;
  vorgabeSuche?: string;
  onAnzahl?: (n: number) => void;
}) {
  const [kontakte, setKontakte] = useState<Kontakt[]>([]);
  const [suche, setSuche] = useState(vorgabeSuche);
  const [form, setForm] = useState<Kontakt | null>(null);
  const [msg, setMsg] = useState("");
  const [loeschen, setLoeschen] = useState<Kontakt | null>(null);
  const [busy, setBusy] = useState(false);

  const laden = useCallback(async () => {
    try {
      const d = await api(`/api/supplier-contacts?supplierId=${supplierId}`);
      setKontakte(d.data || []);
      onAnzahl?.(d.data?.length || 0);
    } catch (e: any) {
      setMsg("Ansprechpartner konnten nicht geladen werden: " + e.message);
    }
    // onAnzahl bewusst nicht in den Abhängigkeiten – sonst lädt es bei jedem Render neu
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supplierId]);

  useEffect(() => { laden(); }, [laden]);

  const treffer = useMemo(() => {
    const s = suche.trim().toLowerCase();
    if (!s) return kontakte;
    return kontakte.filter((k) =>
      ["name", "role", "email", "phone", "mobile", "notes"].some((f) => String(k[f] || "").toLowerCase().includes(s))
    );
  }, [kontakte, suche]);

  async function speichern() {
    if (!form || !String(form.name || "").trim()) { setMsg("Bitte einen Namen angeben."); return; }
    setBusy(true);
    try {
      if (form.id) {
        await api(`/api/supplier-contacts/${form.id}`, { method: "PATCH", body: JSON.stringify(form) });
        setMsg("Ansprechpartner gespeichert.");
      } else {
        await api("/api/supplier-contacts", { method: "POST", body: JSON.stringify({ ...form, supplierId }) });
        setMsg("Ansprechpartner hinzugefügt.");
      }
      setForm(null);
      laden();
    } catch (e: any) { setMsg("Fehler: " + e.message); }
    finally { setBusy(false); }
  }

  async function entfernen() {
    if (!loeschen) return;
    try {
      await api(`/api/supplier-contacts/${loeschen.id}`, { method: "DELETE" });
      setMsg("Ansprechpartner entfernt.");
      laden();
    } catch (e: any) { setMsg("Fehler: " + e.message); }
    finally { setLoeschen(null); }
  }

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span className="muted" style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: ".05em" }}>
          Ansprechpartner ({kontakte.length})
        </span>
        <button className="btn" style={{ marginLeft: "auto" }} onClick={() => setForm({ ...LEER })}>
          <Icon name="plus" /> Hinzufügen
        </button>
      </div>

      <SearchInput value={suche} onChange={setSuche} placeholder="Ansprechpartner suchen…" style={{ display: "block", width: "100%" }} />

      {msg && <div className="muted" style={{ fontSize: 12.5 }}>{msg}</div>}

      {form && (
        <div className="card" style={{ padding: 12, display: "grid", gap: 8, background: "var(--bg)" }}>
          <div className="feld-zeile feld-zeile-2">
            <label style={{ display: "grid", gap: 3, fontSize: 13 }}>
              <span className="muted">Name</span>
              <input className="input" autoFocus value={form.name || ""} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </label>
            <label style={{ display: "grid", gap: 3, fontSize: 13 }}>
              <span className="muted">Funktion / Abteilung</span>
              <input className="input" value={form.role || ""} onChange={(e) => setForm({ ...form, role: e.target.value })} />
            </label>
          </div>
          <label style={{ display: "grid", gap: 3, fontSize: 13 }}>
            <span className="muted">E-Mail</span>
            <input className="input" type="email" value={form.email || ""} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </label>
          <div className="feld-zeile feld-zeile-2">
            <label style={{ display: "grid", gap: 3, fontSize: 13 }}>
              <span className="muted">Telefon</span>
              <input className="input" value={form.phone || ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </label>
            <label style={{ display: "grid", gap: 3, fontSize: 13 }}>
              <span className="muted">Mobil</span>
              <input className="input" value={form.mobile || ""} onChange={(e) => setForm({ ...form, mobile: e.target.value })} />
            </label>
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button className="btn" onClick={() => setForm(null)}><Icon name="x" /> Abbrechen</button>
            <button className="btn btn-primary" onClick={speichern} disabled={busy}>
              <Icon name="save" /> {busy ? "Speichert…" : "Speichern"}
            </button>
          </div>
        </div>
      )}

      {kontakte.length === 0 && !form && (
        <div className="muted" style={{ fontSize: 13 }}>Noch kein Ansprechpartner hinterlegt.</div>
      )}
      {kontakte.length > 0 && treffer.length === 0 && (
        <div className="muted" style={{ fontSize: 13 }}>Kein Ansprechpartner passt zur Suche.</div>
      )}

      <div style={{ display: "grid", gap: 8 }}>
        {treffer.map((k) => (
          <div key={k.id} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 10, display: "grid", gap: 4 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontWeight: 600, fontSize: 14 }}><Hervorheben text={k.name} suche={suche} /></span>
              {k.role && <span className="muted" style={{ fontSize: 12.5 }}><Hervorheben text={k.role} suche={suche} /></span>}
              <span style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
                <button className="btn btn-icon" title="Bearbeiten" onClick={() => setForm({ ...k })}><Icon name="pencil" /></button>
                <button className="btn btn-icon btn-danger" title="Entfernen" onClick={() => setLoeschen(k)}><Icon name="trash" /></button>
              </span>
            </div>
            {k.email && (
              <a href={`mailto:${k.email}`} style={{ fontSize: 13.5, color: "var(--accent)", wordBreak: "break-all" }}>
                <Hervorheben text={k.email} suche={suche} />
              </a>
            )}
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 13.5 }}>
              {k.phone && <a href={`tel:${k.phone}`} style={{ color: "inherit" }}><Icon name="phone" size={13} /> <Hervorheben text={k.phone} suche={suche} /></a>}
              {k.mobile && <a href={`tel:${k.mobile}`} style={{ color: "inherit" }}><Icon name="smartphone" size={13} /> <Hervorheben text={k.mobile} suche={suche} /></a>}
            </div>
          </div>
        ))}
      </div>

      <ConfirmDialog
        open={!!loeschen}
        title="Ansprechpartner entfernen?"
        message={`„${loeschen?.name || ""}" wird beim Lieferanten entfernt.`}
        onConfirm={entfernen}
        onCancel={() => setLoeschen(null)}
      />
    </div>
  );
}
