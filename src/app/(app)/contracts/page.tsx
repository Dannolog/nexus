"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { api, ConflictError } from "@/lib/clientApi";
import Icon from "@/components/Icon";
import ConfirmDialog from "@/components/ConfirmDialog";

// ── Arbeitgeber (Baier Maschinen) – fester Briefkopf ──
const ARBEITGEBER = {
  name: "Baier Maschinen",
  inhaber: "Inh. David Baier",
  strasse: "Philipp-Reis-Straße 3",
  ort: "49661 Cloppenburg",
  tel: "01575 2421157",
  email: "technik@baier-maschinen.de",
  web: "www.baier-maschinen.de",
};

type Contract = Record<string, any>;

const LEER: Contract = {
  title: "",
  template: "vollstaendig", // "standard" | "vollstaendig" (alle rechtlichen Absicherungen)
  employeeId: "",
  employeeName: "",
  employeeAddress: "",
  employeeBirth: "",
  jobTitle: "",
  startDate: null,
  contractType: "unbefristet",
  endDate: null,
  probationMonths: 6,
  weeklyHours: 40,
  weekHoursMin: 32,
  weekHoursMax: 42,
  timeAccount: true,
  coreTimeFrom: "07:00",
  coreTimeTo: "17:00",
  salary: 18.68,
  salaryPeriod: "stündlich",
  vacationDays: 30,
  noticeText: "die gesetzlichen Fristen (§ 622 BGB)",
  workplace: "Cloppenburg",
  additionalTerms: "",
  signCity: "Cloppenburg",
  signDate: null,
};

function fmtDate(v: any, ph = "________________") {
  if (!v) return ph;
  const d = new Date(v);
  if (isNaN(d.getTime())) return ph;
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}
function fmtMoney(v: any) {
  const n = Number(v) || 0;
  return n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}
function txt(v: any, ph = "________________") {
  const s = String(v ?? "").trim();
  return s.length ? s : ph;
}
// Vertragsnummer: fortlaufende Nummer aus Nexus → "AV-0001"
function vertragsNr(n: any) {
  const num = Number(n);
  return Number.isFinite(num) && num > 0 ? `AV-${String(num).padStart(4, "0")}` : "";
}
// Kopieren – navigator.clipboard gibt es nur im Secure Context (https), sonst Fallback.
async function copyText(s: string) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(s);
      return true;
    }
  } catch {
    /* fällt auf execCommand zurück */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = s;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export default function ContractsPage() {
  const [employees, setEmployees] = useState<any[]>([]);
  const [contracts, setContracts] = useState<any[]>([]);
  const [form, setForm] = useState<Contract>({ ...LEER });
  const [msg, setMsg] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState("");

  async function nrKopieren(nr: string) {
    if (!nr) return;
    const ok = await copyText(nr);
    setCopied(ok ? nr : "");
    setMsg(ok ? `Vertragsnummer ${nr} in die Zwischenablage kopiert.` : "Kopieren nicht möglich – Nummer bitte manuell übernehmen.");
    if (ok) setTimeout(() => setCopied((c) => (c === nr ? "" : c)), 1500);
  }

  const loadContracts = useCallback(async () => {
    try {
      const d = await api("/api/contracts");
      setContracts(d.data || []);
    } catch (e: any) {
      setMsg("Verträge konnten nicht geladen werden: " + e.message);
    }
  }, []);

  useEffect(() => {
    api("/api/employees").then((d) => setEmployees(d.data || [])).catch(() => {});
    loadContracts();
  }, [loadContracts]);

  function set(k: string, v: any) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function onEmployee(id: string) {
    const emp = employees.find((e) => e.id === id);
    setForm((f) => ({
      ...f,
      employeeId: id,
      employeeName: emp ? emp.name : f.employeeName,
    }));
  }

  function neu() {
    setForm({ ...LEER });
    setMsg("");
  }

  async function laden(id: string) {
    try {
      const c = await api(`/api/contracts/${id}`);
      setForm(c);
      setMsg("");
    } catch (e: any) {
      setMsg("Fehler beim Laden: " + e.message);
    }
  }

  async function speichern() {
    setSaving(true);
    const payload = {
      ...form,
      title: form.title?.trim() || `Arbeitsvertrag – ${form.employeeName || "ohne Namen"}`,
    };
    try {
      if (form.id) {
        const up = await api(`/api/contracts/${form.id}`, {
          method: "PATCH",
          body: JSON.stringify({ ...payload, expectedVersion: form.version }),
        });
        setForm(up);
        setMsg("Gespeichert.");
      } else {
        const created = await api("/api/contracts", { method: "POST", body: JSON.stringify(payload) });
        setForm(created);
        setMsg("Vertrag angelegt.");
      }
      loadContracts();
    } catch (e: any) {
      if (e instanceof ConflictError) {
        setMsg("Versionskonflikt — der Vertrag wurde zwischenzeitlich geändert. Aktueller Stand geladen.");
        setForm({ ...e.current });
      } else {
        setMsg("Fehler: " + e.message);
      }
    } finally {
      setSaving(false);
    }
  }

  async function loeschen() {
    if (!form.id) return;
    try {
      await api(`/api/contracts/${form.id}?expectedVersion=${form.version}`, { method: "DELETE" });
      setMsg("Gelöscht (im Verlauf wiederherstellbar).");
      neu();
      loadContracts();
    } catch (e: any) {
      setMsg("Fehler: " + e.message);
    } finally {
      setDeleting(false);
    }
  }

  function drucken() {
    window.print();
  }

  const befristet = form.contractType === "befristet";

  return (
    <div>
      {/* Print-CSS: nur die Vertragsvorschau drucken */}
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #vertrag-druck, #vertrag-druck * { visibility: visible !important; }
          #vertrag-druck { position: absolute; left: 0; top: 0; width: 100%; }
          .vv-measure { display: none !important; }
          .vv-toolbar { display: none !important; }
          .vv-zoom-outer { overflow: visible !important; }
          .vv-zoombox { width: auto !important; height: auto !important; margin: 0 !important; position: static !important; }
          .vv-scale { transform: none !important; position: static !important; width: auto !important; }
          .a4-page {
            box-shadow: none !important; margin: 0 !important; border: 0 !important;
            page-break-after: always; break-after: page; min-height: auto !important;
          }
          .a4-page:last-child { page-break-after: auto; break-after: auto; }
          @page { size: A4; margin: 0; }
        }
      `}</style>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, display: "flex", alignItems: "center", gap: 10 }}>
          <Icon name="file-text" size={24} /> Arbeitsverträge
        </h1>
        {vertragsNr(form.number) && (
          <button
            type="button"
            className="btn"
            title="Vertragsnummer in die Zwischenablage kopieren"
            onClick={() => nrKopieren(vertragsNr(form.number))}
            style={{ fontVariantNumeric: "tabular-nums", fontWeight: 600, letterSpacing: ".02em" }}
          >
            <Icon name={copied === vertragsNr(form.number) ? "check" : "copy"} />
            {vertragsNr(form.number)}
          </button>
        )}
        <button className="btn" onClick={neu}><Icon name="plus" /> Neu</button>
        <div style={{ display: "flex", gap: 8, marginLeft: "auto", flexWrap: "wrap" }}>
          <button className="btn btn-primary" onClick={speichern} disabled={saving}>
            <Icon name="save" /> {saving ? "Speichert…" : "Speichern"}
          </button>
          <button className="btn" onClick={drucken}><Icon name="file-text" /> Drucken / PDF</button>
          {form.id && (
            <>
              <Link className="btn btn-icon" title="Verlauf" href={`/history?entity=EmploymentContract&entityId=${form.id}`}><Icon name="history" /></Link>
              <button className="btn btn-icon btn-danger" title="Löschen" onClick={() => setDeleting(true)}><Icon name="trash" /></button>
            </>
          )}
        </div>
      </div>

      {msg && <div className="card" style={{ padding: "8px 12px", marginBottom: 12, fontSize: 14 }}>{msg}</div>}

      <div className="contract-grid">
        {/* ── Linke Spalte: gespeicherte Verträge + Formular ── */}
        <div style={{ display: "grid", gap: 16 }}>
          <div className="card" style={{ padding: 12 }}>
            <div className="muted" style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 8 }}>Gespeicherte Verträge</div>
            {contracts.length === 0 && <div className="muted" style={{ fontSize: 13 }}>Noch keine Verträge angelegt.</div>}
            <div style={{ display: "grid", gap: 4, maxHeight: 180, overflowY: "auto" }}>
              {contracts.map((c) => (
                <button key={c.id} onClick={() => laden(c.id)}
                  style={{
                    textAlign: "left", padding: "7px 9px", borderRadius: 8, fontSize: 13, cursor: "pointer",
                    border: "1px solid var(--border)",
                    background: c.id === form.id ? "var(--accent)" : "var(--bg)",
                    color: c.id === form.id ? "#fff" : "var(--fg)",
                    display: "flex", justifyContent: "space-between", gap: 8,
                  }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 7, overflow: "hidden" }}>
                    {vertragsNr(c.number) && (
                      <span
                        role="button"
                        tabIndex={0}
                        title="Vertragsnummer kopieren"
                        onClick={(ev) => { ev.stopPropagation(); nrKopieren(vertragsNr(c.number)); }}
                        onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); ev.stopPropagation(); nrKopieren(vertragsNr(c.number)); } }}
                        style={{
                          flexShrink: 0, fontSize: 11.5, fontWeight: 700, fontVariantNumeric: "tabular-nums",
                          padding: "1px 6px", borderRadius: 6, cursor: "pointer",
                          border: "1px solid " + (c.id === form.id ? "rgba(255,255,255,.5)" : "var(--border)"),
                          background: c.id === form.id ? "rgba(255,255,255,.18)" : "var(--card, transparent)",
                        }}
                      >
                        {copied === vertragsNr(c.number) ? "kopiert ✓" : vertragsNr(c.number)}
                      </span>
                    )}
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {c.title || c.employeeName || "Ohne Namen"}
                      {c.employeeName && c.title && c.title !== c.employeeName ? <span style={{ opacity: 0.6 }}> · {c.employeeName}</span> : null}
                    </span>
                  </span>
                  <span style={{ opacity: 0.7, flexShrink: 0 }}>{c.status}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="card" style={{ padding: 16, display: "grid", gap: 12 }}>
            <Feld label="Vorlage">
              <select className="input" value={form.template || "vollstaendig"} onChange={(e) => set("template", e.target.value)}>
                <option value="vollstaendig">Vollständig – alle rechtlichen Absicherungen</option>
                <option value="standard">Standard – Grundvertrag</option>
              </select>
            </Feld>
            <Feld label="Mitarbeiter">
              <select className="input" value={form.employeeId || ""} onChange={(e) => onEmployee(e.target.value)}>
                <option value="">— aus Nexus wählen —</option>
                {employees.map((e) => <option key={e.id} value={e.id}>{e.name}{e.employeeNumber ? ` (${e.employeeNumber})` : ""}</option>)}
              </select>
            </Feld>
            <Feld label="Vertragsname (zur Zuordnung)">
              <input className="input" placeholder={form.employeeName ? `Arbeitsvertrag – ${form.employeeName}` : "z. B. Arbeitsvertrag – Max Mustermann"}
                value={form.title || ""} onChange={(e) => set("title", e.target.value)} />
            </Feld>

            <Feld label="Name des Arbeitnehmers">
              <input className="input" value={form.employeeName || ""} onChange={(e) => set("employeeName", e.target.value)} />
            </Feld>
            <Feld label="Anschrift (Straße, PLZ Ort)">
              <textarea className="input" rows={2} value={form.employeeAddress || ""} onChange={(e) => set("employeeAddress", e.target.value)} />
            </Feld>
            <Feld label="Geburtsdatum">
              <input className="input" placeholder="z. B. 01.01.1990" value={form.employeeBirth || ""} onChange={(e) => set("employeeBirth", e.target.value)} />
            </Feld>

            <Feld label="Tätigkeit / Position">
              <input className="input" value={form.jobTitle || ""} onChange={(e) => set("jobTitle", e.target.value)} />
            </Feld>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Feld label="Eintrittsdatum">
                <input className="input" type="date" value={form.startDate ? String(form.startDate).slice(0, 10) : ""}
                  onChange={(e) => set("startDate", e.target.value ? new Date(e.target.value).toISOString() : null)} />
              </Feld>
              <Feld label="Vertragsart">
                <select className="input" value={form.contractType} onChange={(e) => set("contractType", e.target.value)}>
                  <option value="unbefristet">unbefristet</option>
                  <option value="befristet">befristet</option>
                </select>
              </Feld>
            </div>

            {befristet && (
              <Feld label="Befristet bis">
                <input className="input" type="date" value={form.endDate ? String(form.endDate).slice(0, 10) : ""}
                  onChange={(e) => set("endDate", e.target.value ? new Date(e.target.value).toISOString() : null)} />
              </Feld>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              <Feld label="Probezeit (Monate)">
                <input className="input" type="number" min={0} value={form.probationMonths ?? 0}
                  onChange={(e) => set("probationMonths", e.target.value === "" ? 0 : Number(e.target.value))} />
              </Feld>
              <Feld label="Flexzeit von (Std.)">
                <input className="input" type="number" min={0} step="0.5" value={form.weekHoursMin ?? 35}
                  onChange={(e) => set("weekHoursMin", e.target.value === "" ? 0 : Number(e.target.value))} />
              </Feld>
              <Feld label="Flexzeit bis (Std.)">
                <input className="input" type="number" min={0} step="0.5" value={form.weekHoursMax ?? 42}
                  onChange={(e) => set("weekHoursMax", e.target.value === "" ? 0 : Number(e.target.value))} />
              </Feld>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, alignItems: "end" }}>
              <Feld label="Regelarbeitszeit von">
                <input className="input" type="time" value={form.coreTimeFrom || "07:00"}
                  onChange={(e) => set("coreTimeFrom", e.target.value)} />
              </Feld>
              <Feld label="Regelarbeitszeit bis">
                <input className="input" type="time" value={form.coreTimeTo || "17:00"}
                  onChange={(e) => set("coreTimeTo", e.target.value)} />
              </Feld>
              <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 8, paddingBottom: 9 }}>
                <input type="checkbox" checked={form.timeAccount !== false}
                  onChange={(e) => set("timeAccount", e.target.checked)} />
                <span>Arbeitszeitkonto</span>
              </label>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Feld label="Bruttoentgelt (€)">
                <input className="input" type="number" min={0} step="0.01" value={form.salary ?? 0}
                  onChange={(e) => set("salary", e.target.value === "" ? 0 : Number(e.target.value))} />
              </Feld>
              <Feld label="Zahlung">
                <select className="input" value={form.salaryPeriod} onChange={(e) => set("salaryPeriod", e.target.value)}>
                  <option value="monatlich">monatlich</option>
                  <option value="stündlich">stündlich</option>
                </select>
              </Feld>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Feld label="Urlaubstage / Jahr (max. 30)">
                <input className="input" type="number" min={0} max={30} value={form.vacationDays ?? 0}
                  onChange={(e) => set("vacationDays", e.target.value === "" ? 0 : Number(e.target.value))} />
              </Feld>
              <Feld label="Arbeitsort">
                <input className="input" value={form.workplace || ""} onChange={(e) => set("workplace", e.target.value)} />
              </Feld>
            </div>

            <Feld label="Kündigungsfrist">
              <input className="input" value={form.noticeText || ""} onChange={(e) => set("noticeText", e.target.value)} />
            </Feld>

            <Feld label="Zusätzliche Vereinbarungen (optional)">
              <textarea className="input" rows={3} value={form.additionalTerms || ""} onChange={(e) => set("additionalTerms", e.target.value)} />
            </Feld>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Feld label="Unterschriftsort">
                <input className="input" value={form.signCity || ""} onChange={(e) => set("signCity", e.target.value)} />
              </Feld>
              <Feld label="Unterschriftsdatum">
                <input className="input" type="date" value={form.signDate ? String(form.signDate).slice(0, 10) : ""}
                  onChange={(e) => set("signDate", e.target.value ? new Date(e.target.value).toISOString() : null)} />
              </Feld>
            </div>

            <Feld label="Status">
              <select className="input" value={form.status || "entwurf"} onChange={(e) => set("status", e.target.value)}>
                <option value="entwurf">Entwurf</option>
                <option value="aktiv">Aktiv</option>
                <option value="beendet">Beendet</option>
              </select>
            </Feld>
          </div>
        </div>

        {/* ── Rechte Spalte: Live-Vorschau (Papier), zoombar ── */}
        <ZoomView>
          <VertragVorschau form={form} befristet={befristet} />
        </ZoomView>
      </div>

      <ConfirmDialog
        open={deleting}
        title={`Vertrag von „${form.employeeName || ""}" löschen?`}
        message="Der Vertrag wird gelöscht. Im Verlauf ist die Aktion jederzeit wiederherstellbar."
        onConfirm={loeschen}
        onCancel={() => setDeleting(false)}
      />
    </div>
  );
}

function Feld({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ fontSize: 13, display: "grid", gap: 4 }}>
      <span className="muted">{label}</span>
      {children}
    </label>
  );
}

// ── A4-Maße (96 dpi) und Layout-Reserven für die Seiten-Umbruchrechnung ──
const A4_W = 794;
const A4_H = 1123;
const PAD_X = 62;
const PAD_TOP = 50;
const PAD_BOTTOM = 18;
const FOOT_H = 34;
const HEAD_FIRST = 172; // Briefkopf + Titel (mit Akzentlinie) auf Seite 1
const HEAD_REST = 50;   // laufende Kopfzeile ab Seite 2
const ITEM_GAP = 9;
const CONTENT_W = A4_W - PAD_X * 2;
const usableHeight = (pageIndex: number) =>
  A4_H - PAD_TOP - PAD_BOTTOM - FOOT_H - (pageIndex === 0 ? HEAD_FIRST : HEAD_REST);

const bulletFrei = [
  ["eigene Eheschließung / Verpartnerung", "2 Tage"],
  ["Niederkunft der Ehefrau / Lebenspartnerin", "2 Tage"],
  ["Tod des Ehe- oder Lebenspartners", "3 Tage"],
  ["Tod eines eigenen Kindes oder eines Elternteils", "2 Tage"],
  ["Umzug mit eigenem Hausstand (max. 1× pro Jahr)", "1 Tag"],
];

// ── Modernisierter Klauselsatz für Baier Maschinen (ohne Betriebsrat) ──
function buildSections(form: Contract, befristet: boolean): { t: string; items: React.ReactNode[]; full?: boolean }[] {
  const stnd = form.salaryPeriod === "stündlich";
  const all: { t: string; items: React.ReactNode[]; full?: boolean }[] = [
    { t: "Beginn des Arbeitsverhältnisses, Tätigkeit und Probezeit", items: [
      <>Das Arbeitsverhältnis beginnt am <b>{fmtDate(form.startDate)}</b>. Der Arbeitnehmer wird als <b>{txt(form.jobTitle)}</b> eingestellt. {befristet
        ? <>Das Arbeitsverhältnis ist befristet und endet am <b>{fmtDate(form.endDate)}</b>, ohne dass es einer Kündigung bedarf.</>
        : <>Das Arbeitsverhältnis wird auf unbestimmte Zeit geschlossen.</>}</>,
      <>Der Arbeitnehmer verrichtet die ihm übertragenen Aufgaben, die üblicherweise in seinem Tätigkeitsbereich anfallen. Der Arbeitgeber kann ihm bei Bedarf andere zumutbare, gleichwertige Tätigkeiten übertragen, die seinen Kenntnissen und Fähigkeiten entsprechen; die wechselseitigen Interessen werden dabei angemessen berücksichtigt.</>,
      <>Arbeitsort ist <b>{txt(form.workplace)}</b>. Der Arbeitnehmer ist verpflichtet, bei Bedarf auch an auswärtigen Arbeitsplätzen (z. B. Montagestellen, Messen, wechselnden Einsatzorten) tätig zu werden; ein vorübergehender Einsatz im Ausland ist möglich.</>,
      Number(form.probationMonths) > 0
        ? <>Die ersten <b>{form.probationMonths}</b> Monate gelten als Probezeit. Während dieser Zeit kann das Arbeitsverhältnis beiderseits mit einer Frist von zwei Wochen gekündigt werden (§ 622 Abs. 3 BGB).</>
        : <>Eine Probezeit wird nicht vereinbart.</>,
      <>Eine ordentliche Kündigung vor Arbeitsantritt ist ausgeschlossen.</>,
    ]},
    { t: "Arbeitszeit und Arbeitszeitkonto", items: [
      <>Es gilt eine flexible wöchentliche Arbeitszeit (Flexarbeitszeit) von <b>{txt(form.weekHoursMin ?? 32)} bis {txt(form.weekHoursMax ?? 42)} Stunden</b> (ohne Pausen). Der konkrete Umfang richtet sich innerhalb dieses Rahmens nach dem betrieblichen Arbeitsanfall.</>,
      <>Die regelmäßige tägliche Arbeitszeit liegt im Rahmen von <b>{txt(form.coreTimeFrom || "07:00")} bis {txt(form.coreTimeTo || "17:00")} Uhr</b>. Beginn und Ende der täglichen Arbeitszeit werden innerhalb dieses Rahmens <b>nach Absprache</b> zwischen Arbeitgeber und Arbeitnehmer festgelegt und können bei betrieblichem Bedarf – insbesondere bei Montage-, Service- und Auswärtseinsätzen – abweichend vereinbart werden.</>,
      <>Die Dauer und Lage der Pausen richten sich nach den gesetzlichen Vorgaben (Arbeitszeitgesetz) sowie der jeweils gültigen betrieblichen Regelung.</>,
      ...(form.timeAccount !== false ? [
        <>Für den Arbeitnehmer wird ein <b>Arbeitszeitkonto</b> geführt. Auf ihm werden die tatsächlich geleisteten Arbeitsstunden erfasst; Abweichungen von der vereinbarten Wochenarbeitszeit werden als Plus- oder Minusstunden fortgeschrieben. Der Arbeitnehmer ist verpflichtet, seine Arbeitszeiten arbeitstäglich vollständig und richtig zu erfassen.</>,
        <>Guthaben auf dem Arbeitszeitkonto werden vorrangig durch bezahlte Freizeit ausgeglichen; die Lage des Freizeitausgleichs wird zwischen Arbeitgeber und Arbeitnehmer abgestimmt. Bei Beendigung des Arbeitsverhältnisses wird ein verbleibendes Guthaben ausgezahlt, ein Minussaldo, der vom Arbeitnehmer zu vertreten ist, mit der Schlussabrechnung verrechnet.</>,
      ] : []),
      <>Der Arbeitnehmer ist im gesetzlich zulässigen Rahmen zur Leistung von Mehrarbeit und Überstunden verpflichtet, soweit betriebliche Erfordernisse dies notwendig machen.</>,
      <>Geleistete Überstunden werden nach Wahl des Arbeitnehmers ausbezahlt oder durch Freizeit ausgeglichen („abgefeiert").</>,
      <>Etwaige Zuschläge für Mehr-, Nacht-, Sonn- und Feiertagsarbeit richten sich nach den gesetzlichen sowie den jeweils geltenden betrieblichen Regelungen.</>,
    ]},
    { t: "Kurzarbeit", full: true, items: [
      <>Der Arbeitgeber ist berechtigt, bei einem erheblichen Arbeitsausfall aus wirtschaftlichen Gründen oder infolge eines unabwendbaren Ereignisses unter Wahrung der gesetzlichen Voraussetzungen (§§ 95 ff. SGB III) Kurzarbeit einzuführen, wenn dies dem Arbeitnehmer mit einer Ankündigungsfrist von drei Wochen angezeigt wird.</>,
      <>Für die Dauer der Kurzarbeit verringert sich die Arbeitszeit entsprechend; die Vergütung wird für die ausgefallene Arbeitszeit anteilig reduziert. Der Arbeitnehmer erklärt sich mit der Einführung von Kurzarbeit – auch bis auf null („Kurzarbeit Null") – einverstanden.</>,
    ]},
    { t: "Vergütung", items: [
      <>Der Arbeitnehmer erhält ein {stnd ? "Bruttostundenentgelt" : "monatliches Bruttoentgelt"} in Höhe von <b>{fmtMoney(form.salary)}</b>{stnd ? " je geleisteter Arbeitsstunde" : ""}.</>,
      <>Die Vergütung ist jeweils zum Monatsletzten fällig und wird bis spätestens am 10. des Folgemonats auf die vom Arbeitnehmer anzugebende Bankverbindung entrichtet.</>,
      <>Freiwillige Sonderleistungen (z. B. Gratifikationen, Prämien, Einmalzahlungen) begründen auch bei wiederholter Zahlung keinen Rechtsanspruch für die Zukunft, sofern sie nicht ausdrücklich als verbindlich zugesagt werden.</>,
      <>Zu viel gezahlte Bezüge hat der Arbeitnehmer unverzüglich anzuzeigen und zurückzuzahlen.</>,
    ]},
    { t: "Urlaub", items: [
      <>Der Urlaubsanspruch beträgt <b>höchstens {txt(form.vacationDays)} Urlaubstage</b> pro Kalenderjahr, bezogen auf eine Vollzeitbeschäftigung in der 5-Tage-Woche.</>,
      <>Der tatsächliche Urlaubsanspruch <b>berechnet sich nach der erbrachten Wochenarbeitsleistung</b>: Maßgeblich ist die Zahl der Tage bzw. der Umfang der Arbeitszeit, die der Arbeitnehmer im jeweiligen Kalenderjahr durchschnittlich pro Woche tatsächlich leistet (Formel: {txt(form.vacationDays)} Urlaubstage × durchschnittliche Arbeitstage pro Woche ÷ 5). Bruchteile von Urlaubstagen werden auf halbe Tage aufgerundet. Der gesetzliche Mindesturlaub nach dem Bundesurlaubsgesetz bleibt in jedem Fall unberührt.</>,
      <>Im Ein- und Austrittsjahr besteht der Urlaubsanspruch anteilig (ein Zwölftel je vollem Beschäftigungsmonat), mindestens jedoch in Höhe des gesetzlichen Mindesturlaubs.</>,
      <>Urlaub ist rechtzeitig zu beantragen und vor Antritt vom Arbeitgeber zu genehmigen. Im Übrigen gelten die Vorschriften des Bundesurlaubsgesetzes.</>,
      <>Der übergesetzliche Urlaubsanspruch erlischt mit der Beendigung des Arbeitsverhältnisses; er ist nicht abzugelten und ist nicht vererblich.</>,
    ]},
    { t: "Arbeitsverhinderung und Arbeitsunfähigkeit", items: [
      <>Jede Arbeitsverhinderung ist dem Arbeitgeber unverzüglich – spätestens zu Beginn der Arbeitszeit – unter Angabe der Gründe und der voraussichtlichen Dauer mitzuteilen.</>,
      <>Bei krankheitsbedingter Arbeitsunfähigkeit ist spätestens am darauffolgenden Arbeitstag eine ärztliche Bescheinigung über deren Bestehen und voraussichtliche Dauer vorzulegen. Dauert die Arbeitsunfähigkeit länger als bescheinigt, ist eine Folgebescheinigung vorzulegen.</>,
      <>Arztbesuche sind grundsätzlich außerhalb der Arbeitszeit wahrzunehmen, soweit dies nicht aus akuten medizinischen Gründen unabdingbar ist. Die Entgeltfortzahlung im Krankheitsfall richtet sich nach den gesetzlichen Bestimmungen.</>,
    ]},
    { t: "Bezahlte Freistellung (§ 616 BGB)", items: [
      <>In folgenden Fällen wird unter Fortzahlung der Vergütung Freistellung von der Arbeit gewährt:
        <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
          {bulletFrei.map(([grund, tage]) => (
            <li key={grund} style={{ display: "flex", justifyContent: "space-between", gap: 12, listStyle: "none", marginBottom: 2 }}>
              <span>{grund}</span><span style={{ whiteSpace: "nowrap", fontWeight: 600 }}>{tage}</span>
            </li>
          ))}
        </ul>
      </>,
      <>Diese Aufzählung ist abschließend. Im Übrigen ist § 616 BGB abbedungen; eine Entgeltfortzahlung bei sonstiger vorübergehender Verhinderung findet nicht statt.</>,
    ]},
    { t: "Nebentätigkeit", items: [
      <>Jede entgeltliche oder die Interessen des Arbeitgebers berührende Nebentätigkeit ist vor ihrer Aufnahme in Textform anzuzeigen und bedarf der Zustimmung des Arbeitgebers.</>,
      <>Die Zustimmung kann versagt oder widerrufen werden, wenn die Nebentätigkeit berechtigte Interessen des Arbeitgebers beeinträchtigt oder die Arbeitskraft des Arbeitnehmers mindert. Ehrenamtliche Tätigkeiten bleiben unberührt, soweit sie die Interessen des Arbeitgebers nicht beeinträchtigen.</>,
    ]},
    { t: "Verschwiegenheit", items: [
      <>Der Arbeitnehmer bewahrt über alle ihm bekannt gewordenen Geschäfts- und Betriebsgeheimnisse sowie über als vertraulich gekennzeichnete Informationen sowohl gegenüber Außenstehenden als auch gegenüber unbefugten Mitarbeitern Stillschweigen.</>,
      <>Die Verschwiegenheitspflicht besteht auch nach Beendigung des Arbeitsverhältnisses fort. Geschäftsunterlagen und Arbeitsmittel sind bei Beendigung vollständig herauszugeben.</>,
    ]},
    { t: "Kunden- und Mitarbeiterschutz", items: [
      <>Der Arbeitnehmer unterlässt es während des Arbeitsverhältnisses, Kunden, Interessenten, Lieferanten oder sonstige Geschäftspartner des Arbeitgebers für eigene oder fremde Zwecke abzuwerben oder abwerben zu lassen sowie Mitarbeiter des Arbeitgebers zur Beendigung ihres Arbeitsverhältnisses zu veranlassen.</>,
      <>Für jeden Fall des schuldhaften Verstoßes gegen Ziffer 1 ist eine Vertragsstrafe in Höhe einer Bruttomonatsvergütung verwirkt; bei einem fortdauernden Verstoß gilt jeder angefangene Monat als eigenständiger Verstoß. Die Geltendmachung eines weitergehenden Schadens sowie Unterlassungsansprüche bleiben unberührt.</>,
      <>Ein über das Ende des Arbeitsverhältnisses hinausreichendes Wettbewerbs- oder Kundenschutzverbot besteht nur, soweit es gesondert schriftlich und gegen Zahlung einer Karenzentschädigung nach §§ 74 ff. HGB vereinbart wird. Die Pflicht zur Verschwiegenheit bleibt hiervon unberührt.</>,
    ]},
    { t: "Arbeitsergebnisse, Schutzrechte und Arbeitnehmererfindungen", full: true, items: [
      <>Alle Arbeitsergebnisse, die der Arbeitnehmer im Rahmen seiner Tätigkeit erstellt, stehen ausschließlich dem Arbeitgeber zu. An urheberrechtlich geschützten Werken räumt der Arbeitnehmer dem Arbeitgeber das ausschließliche, räumlich, zeitlich und inhaltlich unbeschränkte sowie übertragbare Nutzungsrecht für alle bekannten Nutzungsarten ein; die Übertragung ist mit der vereinbarten Vergütung abgegolten.</>,
      <>Diensterfindungen und technische Verbesserungsvorschläge sind dem Arbeitgeber unverzüglich schriftlich zu melden. Es gelten die Vorschriften des Gesetzes über Arbeitnehmererfindungen (ArbnErfG).</>,
    ]},
    { t: "Fortbildung und Rückzahlung von Fortbildungskosten", full: true, items: [
      <>Übernimmt der Arbeitgeber die Kosten einer über die betriebliche Einarbeitung hinausgehenden Fort- oder Weiterbildung, kann hierüber eine gesonderte schriftliche Rückzahlungsvereinbarung getroffen werden.</>,
      <>Scheidet der Arbeitnehmer auf eigenen Wunsch oder aus einem von ihm zu vertretenden Grund innerhalb von 24 Monaten nach Abschluss einer solchen Maßnahme aus, sind die vom Arbeitgeber getragenen Kosten anteilig zurückzuzahlen; der Rückzahlungsbetrag verringert sich für je einen vollen Monat der Betriebszugehörigkeit nach Abschluss der Maßnahme um 1/24.</>,
    ]},
    { t: "Herausgabe von Arbeitsmitteln; Ausschluss des Zurückbehaltungsrechts", full: true, items: [
      <>Sämtliche dem Arbeitnehmer überlassenen Arbeitsmittel, Unterlagen, Schlüssel, Zugangsdaten sowie deren Kopien sind bei Beendigung des Arbeitsverhältnisses – auf Verlangen auch schon vorher – unverzüglich und vollständig herauszugeben.</>,
      <>Ein Zurückbehaltungsrecht an diesen Gegenständen ist ausgeschlossen. Bei nicht rechtzeitiger Rückgabe kann der Arbeitgeber die Herausgabe verlangen und ist zum Ersatz des entstehenden Schadens berechtigt.</>,
    ]},
    { t: "Nutzung betrieblicher IT und Datenschutz am Arbeitsplatz", full: true, items: [
      <>Betriebliche IT-Systeme, E-Mail- und Internetzugänge sind grundsätzlich nur zu dienstlichen Zwecken zu nutzen. Der Arbeitnehmer beachtet die jeweils geltenden IT- und Datenschutzrichtlinien des Arbeitgebers.</>,
      <>Eine Kontrolle der dienstlichen Nutzung erfolgt im gesetzlich zulässigen Rahmen. Zugangsdaten sind geheim zu halten und dürfen nicht an Dritte weitergegeben werden.</>,
    ]},
    { t: "Betriebliche Altersversorgung", items: [
      <>Ein Anspruch auf eine vom Arbeitgeber finanzierte betriebliche Altersversorgung besteht nicht. Auf die Möglichkeit der Entgeltumwandlung nach den gesetzlichen Bestimmungen wird hingewiesen.</>,
    ]},
    { t: "Beendigung des Arbeitsverhältnisses", items: [
      <>Nach Ablauf der Probezeit richtet sich die Kündigung nach <b>{txt(form.noticeText)}</b> (mindestens § 622 BGB). Eine für den Arbeitgeber geltende verlängerte Kündigungsfrist gilt auch für eine Kündigung durch den Arbeitnehmer.</>,
      <>Jede Kündigung bedarf zu ihrer Wirksamkeit der Schriftform; die elektronische Form ist ausgeschlossen (§ 623 BGB).</>,
      <>Der Arbeitgeber ist berechtigt, den Arbeitnehmer im Zusammenhang mit einer Kündigung unter Fortzahlung der Bezüge und unter Anrechnung auf Urlaubs- und Freistellungsansprüche von der Arbeitsleistung freizustellen.</>,
      befristet
        ? <>Bei einem befristeten Arbeitsverhältnis endet dieses mit Ablauf der Befristung, ohne dass es einer Kündigung bedarf.</>
        : <>Das Arbeitsverhältnis endet spätestens mit Ablauf des Monats, in dem der Arbeitnehmer die Regelaltersgrenze der gesetzlichen Rentenversicherung erreicht.</>,
    ]},
    // Die früheren §§ 17–24 (Vertragsstrafe, Ausschlussfrist, Abtretung/Verpfändung,
    // Datenschutzhinweis, Bild-/Nutzungsrechte, Anfechtung, Gerichtsstand, Nebenabreden/
    // Schriftform) wurden auf Wunsch entfernt. Die freien Zusatzvereinbarungen aus dem
    // Formular bleiben als eigener § erhalten – aber nur, wenn tatsächlich etwas eingetragen ist.
    ...(String(form.additionalTerms || "").trim()
      ? [{ t: "Zusätzliche Vereinbarungen", items: [
          <><span style={{ whiteSpace: "pre-wrap" }}>{form.additionalTerms}</span></>,
        ] }]
      : []),
  ];
  // Standard-Vorlage = ohne die zusätzlich abgesicherten §§; Vollständig = alle.
  return form.template === "standard" ? all.filter((s) => !s.full) : all;
}

// ── einzelne Bausteine ──
function Briefkopf() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16, borderBottom: "2px solid #0047b3", paddingBottom: 12 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/baier-logo.svg" alt="Baier Maschinen" style={{ height: 48, width: "auto" }} />
      <div style={{ lineHeight: 1.3 }}>
        <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: ".01em", color: "#0047b3", fontFamily: "var(--font-display), sans-serif" }}>{ARBEITGEBER.name}</div>
        <div style={{ fontSize: 11.5, color: "#444" }}>{ARBEITGEBER.inhaber}</div>
      </div>
      <div style={{ marginLeft: "auto", textAlign: "right", fontSize: 10, color: "#555", fontFamily: "var(--font-sans), system-ui, sans-serif" }}>
        <div>{ARBEITGEBER.strasse}</div>
        <div>{ARBEITGEBER.ort}</div>
        <div>{ARBEITGEBER.tel}</div>
        <div>{ARBEITGEBER.email}</div>
      </div>
    </div>
  );
}

function LaufKopf({ nr }: { nr?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", borderBottom: "1px solid #ccc", paddingBottom: 6, color: "#666" }}>
      <span style={{ fontWeight: 700, fontSize: 12, letterSpacing: ".02em" }}>Arbeitsvertrag{nr ? ` ${nr}` : ""}</span>
      <span style={{ fontSize: 11, color: "#444", fontWeight: 600 }}>{ARBEITGEBER.name}</span>
    </div>
  );
}

function Fuss({ page, total, docRef }: { page: number; total: number; docRef: string }) {
  return (
    <div style={{ position: "absolute", left: PAD_X, right: PAD_X, bottom: PAD_BOTTOM, display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 9.5, color: "#888", borderTop: "1px solid #ddd", paddingTop: 5 }}>
      <span>{docRef}</span>
      <span>Seite {page} von {total}</span>
    </div>
  );
}

function Kasten({ n, title }: { n: number; title: string }) {
  // Klassischer Stil: schlichte fette Überschrift „§ N Titel", mit Abstand darüber.
  return (
    <div style={{ paddingTop: 9, fontWeight: 700, fontSize: 13.5, color: "#000", fontFamily: "var(--font-sans), system-ui, sans-serif" }}>
      § {n} {title}
    </div>
  );
}

function Absatz({ n, children }: { n: number | null; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 8, textAlign: "justify", paddingLeft: n != null ? 12 : 24 }}>
      {n != null && <span style={{ minWidth: 20, flexShrink: 0, color: "#000", fontVariantNumeric: "tabular-nums" }}>{n}.</span>}
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  );
}

function A4Seite({ page, total, docRef, nr, children }: { page: number; total: number; docRef: string; nr?: string; children: React.ReactNode }) {
  return (
    <div className="a4-page" style={{
      width: A4_W, minHeight: A4_H, background: "#fff", color: "#1a1a1a", position: "relative",
      margin: "0 auto 22px", boxShadow: "0 2px 12px rgba(0,0,0,.14)", boxSizing: "border-box",
      padding: `${PAD_TOP}px ${PAD_X}px ${PAD_BOTTOM + FOOT_H}px`,
      fontFamily: "var(--font-sans), system-ui, -apple-system, sans-serif", fontSize: 12.5, lineHeight: 1.5,
    }}>
      {page === 1 ? (
        <>
          <Briefkopf />
          <div style={{ textAlign: "center", margin: "22px 0 18px" }}>
            <h2 style={{ fontSize: 22, fontWeight: 700, letterSpacing: ".06em", margin: 0, color: "#000", fontFamily: "var(--font-sans), system-ui, sans-serif" }}>Arbeitsvertrag</h2>
            {nr && (
              <p style={{ fontSize: 11, color: "#0047b3", margin: "5px 0 0", fontWeight: 700, letterSpacing: ".06em", fontVariantNumeric: "tabular-nums" }}>
                Vertragsnummer {nr}
              </p>
            )}
            <p style={{ fontSize: 10, color: "#666", margin: "6px 0 0", fontStyle: "italic" }}>
              Die Bezeichnungen „Arbeitnehmer" / „Arbeitgeber" gelten für Beschäftigte jeglichen Geschlechts.
            </p>
          </div>
        </>
      ) : (
        <div style={{ marginBottom: 14 }}><LaufKopf nr={nr} /></div>
      )}
      <div style={{ display: "grid", gap: ITEM_GAP }}>{children}</div>
      <Fuss page={page} total={total} docRef={docRef} />
    </div>
  );
}

// ── Zoombare Vorschau-Hülle: Standard = an Containerbreite angepasst (kein H-Scroll) ──
function ZoomView({ children }: { children: React.ReactNode }) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [outerW, setOuterW] = useState(0);
  const [innerH, setInnerH] = useState(0);
  const [fitMode, setFitMode] = useState(true);
  const [zoom, setZoom] = useState(1);

  const fit = outerW > 0 ? Math.min(1.5, outerW / A4_W) : 1;
  const z = fitMode ? fit : zoom;

  useEffect(() => {
    const measure = () => {
      if (outerRef.current) setOuterW(outerRef.current.clientWidth);
      if (innerRef.current) setInnerH(innerRef.current.offsetHeight);
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (outerRef.current) ro.observe(outerRef.current);
    if (innerRef.current) ro.observe(innerRef.current);
    return () => ro.disconnect();
  }, []);

  const applyZoom = (nz: number) => { setFitMode(false); setZoom(Math.max(0.3, Math.min(2, Math.round(nz * 100) / 100))); };

  return (
    <div>
      <div className="vv-toolbar" style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
        <button className="btn btn-icon" title="Verkleinern" onClick={() => applyZoom(z - 0.1)} style={{ fontWeight: 700 }}>−</button>
        <button type="button" title="Auf 100 % setzen" onClick={() => applyZoom(1)}
          style={{ fontSize: 12, width: 52, textAlign: "center", fontVariantNumeric: "tabular-nums", cursor: "pointer", background: "transparent", border: "1px solid var(--border)", borderRadius: 6, padding: "4px 0", color: "var(--muted)" }}>
          {Math.round(z * 100)}%
        </button>
        <button className="btn btn-icon" title="Vergrößern" onClick={() => applyZoom(z + 0.1)} style={{ fontWeight: 700 }}>+</button>
        <button className="btn" title="An Containerbreite anpassen" onClick={() => setFitMode(true)} style={{ opacity: fitMode ? 1 : 0.7 }}>
          <Icon name="maximize" /> Breite
        </button>
      </div>
      <div ref={outerRef} className="vv-zoom-outer" style={{ width: "100%", overflowX: z > fit + 0.001 ? "auto" : "hidden", overflowY: "hidden" }}>
        <div className="vv-zoombox" style={{ width: A4_W * z, height: innerH ? innerH * z : undefined, margin: "0 auto", position: "relative" }}>
          <div className="vv-scale" ref={innerRef} style={{ width: A4_W, transform: `scale(${z})`, transformOrigin: "top left", position: "absolute", top: 0, left: 0 }}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Vorschau mit automatischem Seitenumbruch ──
function VertragVorschau({ form, befristet }: { form: Contract; befristet: boolean }) {
  const sections = buildSections(form, befristet);
  const nr = vertragsNr(form.number);
  const docRef = `Arbeitsvertrag${nr ? ` ${nr}` : ""} · ${txt(form.employeeName, "—")}`;

  // Flache Liste aller Fließ-Elemente (für die Umbruchrechnung)
  type Flow = { key: string; heading: boolean; node: React.ReactNode };
  const flow: Flow[] = [];
  flow.push({ key: "parties", heading: false, node: (
    <div>
      <p style={{ margin: "0 0 4px" }}>Zwischen</p>
      <p style={{ margin: "0 0 3px", paddingLeft: 24 }}><b>{ARBEITGEBER.name}</b>, {ARBEITGEBER.inhaber}, {ARBEITGEBER.strasse}, {ARBEITGEBER.ort}</p>
      <p style={{ margin: "0 0 10px", paddingLeft: 24, fontStyle: "italic" }}>– nachfolgend „Arbeitgeber" –</p>
      <p style={{ margin: "0 0 4px" }}>und</p>
      <p style={{ margin: "0 0 3px", paddingLeft: 24 }}>
        <b>{txt(form.employeeName)}</b>{form.employeeAddress ? <>, {txt(form.employeeAddress).split(/\n/).map((z: string, i: number) => <span key={i}>{i > 0 ? ", " : ""}{z}</span>)}</> : ""}
        {form.employeeBirth ? <>, geboren am <b>{form.employeeBirth}</b></> : ""}
      </p>
      <p style={{ margin: "0 0 10px", paddingLeft: 24, fontStyle: "italic" }}>– nachfolgend „Arbeitnehmer" –</p>
      <p style={{ margin: 0 }}>wird folgender {befristet ? "befristeter" : "unbefristeter"} Arbeitsvertrag geschlossen:</p>
    </div>
  )});
  sections.forEach((s, si) => {
    flow.push({ key: `h${si}`, heading: true, node: <Kasten n={si + 1} title={s.t} /> });
    s.items.forEach((it, ii) => {
      flow.push({ key: `i${si}_${ii}`, heading: false, node: <Absatz n={s.items.length > 1 ? ii + 1 : null}>{it}</Absatz> });
    });
  });
  flow.push({ key: "sign", heading: false, node: (
    <div style={{ marginTop: 22 }}>
      <p style={{ margin: "0 0 42px" }}>{txt(form.signCity, "________")}, den {fmtDate(form.signDate)}</p>
      <div style={{ display: "flex", gap: 48 }}>
        <div style={{ flex: 1 }}>
          <div style={{ borderTop: "1.5px solid #1a1a1a", paddingTop: 6, fontSize: 11.5, fontWeight: 600 }}>Arbeitgeber</div>
          <div style={{ fontSize: 11, color: "#555" }}>{ARBEITGEBER.name}</div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ borderTop: "1.5px solid #1a1a1a", paddingTop: 6, fontSize: 11.5, fontWeight: 600 }}>Arbeitnehmer</div>
          <div style={{ fontSize: 11, color: "#555" }}>{txt(form.employeeName, "")}</div>
        </div>
      </div>
    </div>
  )});

  const measureRefs = useRef<(HTMLDivElement | null)[]>([]);
  // pages an die Signatur binden → bei Inhaltswechsel keine veralteten Indizes rendern.
  const [pages, setPages] = useState<{ sig: string; groups: number[][] } | null>(null);
  const sig = JSON.stringify({ form, befristet });

  useEffect(() => {
    const heights = measureRefs.current.map((el) => (el ? el.offsetHeight : 0));
    const result: number[][] = [];
    let cur: number[] = [];
    let used = 0;
    for (let k = 0; k < flow.length; k++) {
      const avail = usableHeight(result.length);
      const h = heights[k] || 0;
      const need = flow[k].heading ? h + ITEM_GAP + (heights[k + 1] || 0) : h;
      if (cur.length > 0 && used + need > avail) { result.push(cur); cur = []; used = 0; }
      cur.push(k);
      used += h + ITEM_GAP;
    }
    if (cur.length) result.push(cur);
    setPages({ sig, groups: result });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  // Nur den zum aktuellen Stand passenden Umbruch verwenden; sonst alles auf einer Seite (Fallback).
  const laidOut = pages && pages.sig === sig ? pages.groups : [flow.map((_, k) => k)];
  const total = laidOut.length;

  return (
    <div id="vertrag-druck">
      {/* unsichtbare Mess-Schicht (gleiche Breite/Schrift wie die Seite) */}
      <div className="vv-measure" aria-hidden style={{ position: "absolute", left: -99999, top: 0, width: CONTENT_W, visibility: "hidden", pointerEvents: "none", fontFamily: "var(--font-sans), system-ui, sans-serif", fontSize: 12.5, lineHeight: 1.5 }}>
        {flow.map((f, k) => (
          <div key={f.key} ref={(el) => { measureRefs.current[k] = el; }} style={{ marginBottom: ITEM_GAP }}>{f.node}</div>
        ))}
      </div>

      {laidOut.map((idxs, pi) => (
        <A4Seite key={pi} page={pi + 1} total={total} docRef={docRef} nr={nr}>
          {idxs.filter((k) => flow[k]).map((k) => <div key={flow[k].key}>{flow[k].node}</div>)}
        </A4Seite>
      ))}
    </div>
  );
}
