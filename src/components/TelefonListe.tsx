"use client";
import Icon from "@/components/Icon";
import SuchSelect from "@/components/SuchSelect";
import TextField from "@/components/TextField";
import { KopierKnopf } from "@/components/KontaktFeld";

/**
 * Beliebig viele Telefonnummern mit Art (Firma, Privat, Mobil …) – z. B. am Mitarbeiter.
 * Gespeichert als `[{ art, value }]`; die Hauptnummer leitet der Server ab (revision.ts `ordneTelefone`).
 */
export type Telefon = { art: string; value: string };

export const TELEFON_ARTEN = ["Firma", "Firma mobil", "Privat", "Privat mobil", "Fax", "Notfall", "Sonstige"];

const symbol = (art: string) => (/mobil|handy/i.test(art) ? "smartphone" : /fax/i.test(art) ? "printer" : /privat/i.test(art) ? "home" : "phone");
export const telLink = (v: string) => "tel:" + String(v || "").replace(/[^\d+]/g, "");

export default function TelefonListe({ wert, setWert }: { wert: Telefon[]; setWert: (v: Telefon[]) => void }) {
  const liste = Array.isArray(wert) ? wert : [];
  const setze = (i: number, teil: Partial<Telefon>) => setWert(liste.map((t, n) => (n === i ? { ...t, ...teil } : t)));
  // Erste Nummer „Privat“, danach „Firma“ – das ist die übliche Reihenfolge beim Erfassen
  const naechste = () => (liste.some((t) => /privat/i.test(t.art)) ? "Firma" : "Privat");

  return (
    <div style={{ display: "grid", gap: 8 }}>
      {liste.map((t, i) => (
        <div key={i} style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ width: 150, flexShrink: 0 }}>
            <SuchSelect
              value={t.art}
              onChange={(v) => setze(i, { art: v })}
              platzhalter="Art"
              suchePlatzhalter="Art suchen oder eintippen…"
              erlaubeNeu
              onNeu={(text) => { setze(i, { art: text }); return text; }}
              options={Array.from(new Set([...TELEFON_ARTEN, t.art].filter(Boolean))).map((a) => ({ value: a, label: a }))}
            />
          </div>
          <div style={{ flex: "1 1 180px", minWidth: 0, display: "flex", alignItems: "center", gap: 6 }}>
            <Icon name={symbol(t.art)} size={15} style={{ color: "var(--muted)" }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <TextField type="tel" value={t.value} onChange={(v) => setze(i, { value: v })} />
            </div>
            <KopierKnopf wert={t.value} was="Nummer" />
            {t.value && (
              <a className="btn btn-icon" href={telLink(t.value)} title="Anrufen" aria-label="Anrufen" style={{ color: "#10b981" }}>
                <Icon name="phone" size={14} />
              </a>
            )}
            <button type="button" className="btn btn-icon btn-danger" title="Nummer entfernen" aria-label="Nummer entfernen"
              onClick={() => setWert(liste.filter((_, n) => n !== i))}>
              <Icon name="trash" size={14} />
            </button>
          </div>
        </div>
      ))}
      <div>
        <button type="button" className="btn" onClick={() => setWert([...liste, { art: naechste(), value: "" }])}>
          <Icon name="plus" size={14} /> Nummer hinzufügen
        </button>
      </div>
    </div>
  );
}

/** Anzeige (Detailansicht): Art, Nummer zum Antippen, Kopieren. */
export function TelefonAnzeige({ wert }: { wert: Telefon[] }) {
  const liste = (Array.isArray(wert) ? wert : []).filter((t) => t?.value);
  if (!liste.length) return <>–</>;
  return (
    <div style={{ display: "grid", gap: 4 }}>
      {liste.map((t, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Icon name={symbol(t.art)} size={14} style={{ color: "var(--muted)" }} />
          <span className="muted" style={{ fontSize: 12.5, minWidth: 80 }}>{t.art}</span>
          <a href={telLink(t.value)} style={{ color: "inherit" }} title="Anrufen">{t.value}</a>
          <KopierKnopf wert={t.value} was="Nummer" klein />
        </div>
      ))}
    </div>
  );
}
