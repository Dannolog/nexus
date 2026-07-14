"use client";
import { useEffect, useState, useCallback } from "react";
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
  salary: 0,
  salaryPeriod: "monatlich",
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

export default function ContractsPage() {
  const [employees, setEmployees] = useState<any[]>([]);
  const [contracts, setContracts] = useState<any[]>([]);
  const [form, setForm] = useState<Contract>({ ...LEER });
  const [msg, setMsg] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);

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
          #vertrag-druck {
            position: absolute; left: 0; top: 0; width: 100%;
            box-shadow: none !important; border: 0 !important; margin: 0 !important; padding: 0 !important;
          }
          @page { margin: 18mm 16mm; }
        }
      `}</style>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, display: "flex", alignItems: "center", gap: 10 }}>
          <Icon name="file-text" size={24} /> Arbeitsverträge
        </h1>
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
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {c.employeeName || c.title || "Ohne Namen"}
                  </span>
                  <span style={{ opacity: 0.7, flexShrink: 0 }}>{c.status}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="card" style={{ padding: 16, display: "grid", gap: 12 }}>
            <Feld label="Mitarbeiter">
              <select className="input" value={form.employeeId || ""} onChange={(e) => onEmployee(e.target.value)}>
                <option value="">— aus Nexus wählen —</option>
                {employees.map((e) => <option key={e.id} value={e.id}>{e.name}{e.employeeNumber ? ` (${e.employeeNumber})` : ""}</option>)}
              </select>
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

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Feld label="Probezeit (Monate)">
                <input className="input" type="number" min={0} value={form.probationMonths ?? 0}
                  onChange={(e) => set("probationMonths", e.target.value === "" ? 0 : Number(e.target.value))} />
              </Feld>
              <Feld label="Wochenstunden">
                <input className="input" type="number" min={0} step="0.5" value={form.weeklyHours ?? 0}
                  onChange={(e) => set("weeklyHours", e.target.value === "" ? 0 : Number(e.target.value))} />
              </Feld>
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
              <Feld label="Urlaubstage / Jahr">
                <input className="input" type="number" min={0} value={form.vacationDays ?? 0}
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

        {/* ── Rechte Spalte: Live-Vorschau (Papier) ── */}
        <div style={{ overflowX: "auto" }}>
          <VertragVorschau form={form} befristet={befristet} />
        </div>
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

// ── Die druckbare Vertragsvorschau (immer heller „Papier"-Look) ──
function VertragVorschau({ form, befristet }: { form: Contract; befristet: boolean }) {
  const paragraphen: { titel: string; text: React.ReactNode }[] = [
    {
      titel: "§ 1 Beginn des Arbeitsverhältnisses und Tätigkeit",
      text: (
        <>
          Das Arbeitsverhältnis beginnt am <b>{fmtDate(form.startDate)}</b>. Der Arbeitnehmer wird als{" "}
          <b>{txt(form.jobTitle)}</b> eingestellt.{" "}
          {befristet
            ? <>Das Arbeitsverhältnis ist befristet und endet am <b>{fmtDate(form.endDate)}</b>, ohne dass es einer Kündigung bedarf.</>
            : <>Das Arbeitsverhältnis wird auf unbestimmte Zeit geschlossen.</>}{" "}
          Arbeitsort ist <b>{txt(form.workplace)}</b>.
        </>
      ),
    },
    {
      titel: "§ 2 Probezeit",
      text: Number(form.probationMonths) > 0
        ? <>Die ersten <b>{form.probationMonths}</b> Monate des Arbeitsverhältnisses gelten als Probezeit. Während der Probezeit kann das Arbeitsverhältnis beiderseits mit einer Frist von zwei Wochen gekündigt werden.</>
        : <>Eine Probezeit wird nicht vereinbart.</>,
    },
    {
      titel: "§ 3 Arbeitszeit",
      text: <>Die regelmäßige wöchentliche Arbeitszeit beträgt <b>{txt(form.weeklyHours)}</b> Stunden. Beginn und Ende der täglichen Arbeitszeit sowie die Verteilung auf die Wochentage richten sich nach den betrieblichen Erfordernissen.</>,
    },
    {
      titel: "§ 4 Vergütung",
      text: <>Der Arbeitnehmer erhält ein {form.salaryPeriod === "stündlich" ? "Bruttostundenentgelt" : "monatliches Bruttoentgelt"} in Höhe von <b>{fmtMoney(form.salary)}</b>. Die Vergütung ist jeweils zum Ende eines Kalendermonats fällig und wird bargeldlos auf ein vom Arbeitnehmer benanntes Konto überwiesen.</>,
    },
    {
      titel: "§ 5 Urlaub",
      text: <>Der Arbeitnehmer hat Anspruch auf einen bezahlten Jahresurlaub von <b>{txt(form.vacationDays)}</b> Arbeitstagen. Das Urlaubsjahr ist das Kalenderjahr.</>,
    },
    {
      titel: "§ 6 Arbeitsverhinderung",
      text: <>Der Arbeitnehmer ist verpflichtet, dem Arbeitgeber jede Arbeitsverhinderung und ihre voraussichtliche Dauer unverzüglich mitzuteilen. Bei einer Arbeitsunfähigkeit infolge Krankheit ist spätestens am dritten Kalendertag eine ärztliche Bescheinigung vorzulegen.</>,
    },
    {
      titel: "§ 7 Kündigung",
      text: <>Nach Ablauf der Probezeit richtet sich die Kündigung des Arbeitsverhältnisses nach <b>{txt(form.noticeText)}</b>. Jede Kündigung bedarf zu ihrer Wirksamkeit der Schriftform.</>,
    },
    {
      titel: "§ 8 Verschwiegenheit",
      text: <>Der Arbeitnehmer verpflichtet sich, über alle ihm im Rahmen seiner Tätigkeit bekannt werdenden betrieblichen Angelegenheiten Stillschweigen zu bewahren. Diese Verpflichtung besteht auch nach Beendigung des Arbeitsverhältnisses fort.</>,
    },
    ...(String(form.additionalTerms || "").trim()
      ? [{ titel: "§ 9 Nebenabreden", text: <span style={{ whiteSpace: "pre-wrap" }}>{form.additionalTerms}</span> }]
      : []),
    {
      titel: `§ ${String(form.additionalTerms || "").trim() ? 10 : 9} Schlussbestimmungen`,
      text: <>Änderungen und Ergänzungen dieses Vertrages bedürfen der Schriftform; dies gilt auch für die Aufhebung des Schriftformerfordernisses. Sollte eine Bestimmung dieses Vertrages unwirksam sein oder werden, so bleibt die Wirksamkeit der übrigen Bestimmungen hiervon unberührt.</>,
    },
  ];

  return (
    <div id="vertrag-druck" style={{
      background: "#ffffff", color: "#1a1a1a", borderRadius: 8, border: "1px solid var(--border)",
      boxShadow: "0 1px 3px rgba(0,0,0,.08)", padding: "38px 44px", maxWidth: 820, margin: "0 auto",
      fontFamily: "var(--font-sans), system-ui, -apple-system, sans-serif", fontSize: 13.5, lineHeight: 1.65,
    }}>
      {/* Briefkopf */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, borderBottom: "2px solid #0047b3", paddingBottom: 14, marginBottom: 24 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/baier-logo.svg" alt="Baier Maschinen" style={{ height: 54, width: "auto" }} />
        <div style={{ lineHeight: 1.35 }}>
          <div style={{ fontSize: 21, fontWeight: 700, letterSpacing: ".01em", color: "#0047b3", fontFamily: "var(--font-display), sans-serif" }}>{ARBEITGEBER.name}</div>
          <div style={{ fontSize: 12, color: "#444" }}>{ARBEITGEBER.inhaber}</div>
        </div>
        <div style={{ marginLeft: "auto", textAlign: "right", fontSize: 10.5, color: "#555", fontFamily: "var(--font-sans), system-ui, sans-serif" }}>
          <div>{ARBEITGEBER.strasse}</div>
          <div>{ARBEITGEBER.ort}</div>
          <div>{ARBEITGEBER.tel}</div>
          <div>{ARBEITGEBER.email}</div>
        </div>
      </div>

      <h2 style={{ textAlign: "center", fontSize: 25, fontWeight: 700, letterSpacing: ".14em", margin: "4px 0 24px", fontFamily: "var(--font-display), sans-serif" }}>ARBEITSVERTRAG</h2>

      {/* Parteien */}
      <p style={{ margin: "0 0 4px" }}>Zwischen</p>
      <p style={{ margin: "0 0 4px", paddingLeft: 18 }}>
        <b>{ARBEITGEBER.name}</b>, {ARBEITGEBER.inhaber}, {ARBEITGEBER.strasse}, {ARBEITGEBER.ort}
      </p>
      <p style={{ margin: "0 0 12px", fontStyle: "italic", color: "#555" }}>– nachfolgend „Arbeitgeber" –</p>
      <p style={{ margin: "0 0 4px" }}>und</p>
      <p style={{ margin: "0 0 4px", paddingLeft: 18 }}>
        <b>{txt(form.employeeName)}</b>,{" "}
        {txt(form.employeeAddress).split(/\n/).map((z: string, i: number) => (
          <span key={i}>{i > 0 ? ", " : ""}{z}</span>
        ))}
        {form.employeeBirth ? <>, geboren am <b>{form.employeeBirth}</b></> : ""}
      </p>
      <p style={{ margin: "0 0 16px", fontStyle: "italic", color: "#555" }}>– nachfolgend „Arbeitnehmer" –</p>
      <p style={{ margin: "0 0 20px" }}>wird folgender Arbeitsvertrag geschlossen:</p>

      {/* Paragraphen */}
      {paragraphen.map((p, i) => (
        <div key={i} style={{ marginBottom: 15, breakInside: "avoid" }}>
          <div style={{ fontWeight: 600, marginBottom: 4, fontFamily: "var(--font-display), sans-serif", color: "#0047b3", fontSize: 14, letterSpacing: ".005em" }}>{p.titel}</div>
          <div style={{ textAlign: "justify" }}>{p.text}</div>
        </div>
      ))}

      {/* Unterschriften */}
      <p style={{ margin: "26px 0 40px" }}>{txt(form.signCity, "________")}, den {fmtDate(form.signDate)}</p>
      <div style={{ display: "flex", gap: 48, marginTop: 20 }}>
        <div style={{ flex: 1 }}>
          <div style={{ borderTop: "1px solid #1a1a1a", paddingTop: 5, fontSize: 12 }}>Arbeitgeber<br />{ARBEITGEBER.name}</div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ borderTop: "1px solid #1a1a1a", paddingTop: 5, fontSize: 12 }}>Arbeitnehmer<br />{txt(form.employeeName, "")}</div>
        </div>
      </div>
    </div>
  );
}
