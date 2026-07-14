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
          #vertrag-druck { position: absolute; left: 0; top: 0; width: 100%; }
          .vv-measure { display: none !important; }
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

// ── A4-Maße (96 dpi) und Layout-Reserven für die Seiten-Umbruchrechnung ──
const A4_W = 794;
const A4_H = 1123;
const PAD_X = 62;
const PAD_TOP = 50;
const PAD_BOTTOM = 18;
const FOOT_H = 34;
const HEAD_FIRST = 152; // Briefkopf + Titel auf Seite 1
const HEAD_REST = 50;   // laufende Kopfzeile ab Seite 2
const ITEM_GAP = 8;
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
function buildSections(form: Contract, befristet: boolean): { t: string; items: React.ReactNode[] }[] {
  const stnd = form.salaryPeriod === "stündlich";
  return [
    { t: "§ 1 Beginn des Arbeitsverhältnisses, Tätigkeit und Probezeit", items: [
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
    { t: "§ 2 Arbeitszeit", items: [
      <>Die regelmäßige wöchentliche Arbeitszeit beträgt <b>{txt(form.weeklyHours)}</b> Stunden (ohne Pausen).</>,
      <>Beginn, Ende und Verteilung der täglichen Arbeitszeit richten sich nach den betrieblichen Erfordernissen und werden vom Arbeitgeber nach billigem Ermessen festgelegt.</>,
      <>Der Arbeitnehmer ist im gesetzlich zulässigen Rahmen zur Leistung von Mehrarbeit und Überstunden verpflichtet, soweit betriebliche Erfordernisse dies notwendig machen.</>,
    ]},
    { t: "§ 3 Vergütung", items: [
      <>Der Arbeitnehmer erhält ein {stnd ? "Bruttostundenentgelt" : "monatliches Bruttoentgelt"} in Höhe von <b>{fmtMoney(form.salary)}</b>{stnd ? " je geleisteter Arbeitsstunde" : ""}.</>,
      <>Die Vergütung ist zum Ende eines Kalendermonats fällig und wird bargeldlos auf ein vom Arbeitnehmer benanntes Konto überwiesen.</>,
      <>Freiwillige Sonderleistungen (z. B. Gratifikationen, Prämien, Einmalzahlungen) begründen auch bei wiederholter Zahlung keinen Rechtsanspruch für die Zukunft, sofern sie nicht ausdrücklich als verbindlich zugesagt werden.</>,
      <>Zu viel gezahlte Bezüge hat der Arbeitnehmer unverzüglich anzuzeigen und zurückzuzahlen.</>,
    ]},
    { t: "§ 4 Urlaub", items: [
      <>Der Arbeitnehmer hat Anspruch auf einen bezahlten Jahresurlaub von <b>{txt(form.vacationDays)}</b> Arbeitstagen bei einer Fünf-Tage-Woche. Bei abweichender Verteilung der Arbeitstage wird der Anspruch anteilig angepasst.</>,
      <>Im Ein- und Austrittsjahr besteht der Urlaubsanspruch anteilig (ein Zwölftel je vollem Beschäftigungsmonat), mindestens jedoch in Höhe des gesetzlichen Mindesturlaubs.</>,
      <>Urlaub ist rechtzeitig zu beantragen und vor Antritt vom Arbeitgeber zu genehmigen. Im Übrigen gelten die Vorschriften des Bundesurlaubsgesetzes.</>,
    ]},
    { t: "§ 5 Arbeitsverhinderung und Arbeitsunfähigkeit", items: [
      <>Jede Arbeitsverhinderung ist dem Arbeitgeber unverzüglich – spätestens zu Beginn der Arbeitszeit – unter Angabe der Gründe und der voraussichtlichen Dauer mitzuteilen.</>,
      <>Bei krankheitsbedingter Arbeitsunfähigkeit ist spätestens am darauffolgenden Arbeitstag eine ärztliche Bescheinigung über deren Bestehen und voraussichtliche Dauer vorzulegen. Dauert die Arbeitsunfähigkeit länger als bescheinigt, ist eine Folgebescheinigung vorzulegen.</>,
      <>Arztbesuche sind grundsätzlich außerhalb der Arbeitszeit wahrzunehmen, soweit dies nicht aus akuten medizinischen Gründen unabdingbar ist. Die Entgeltfortzahlung im Krankheitsfall richtet sich nach den gesetzlichen Bestimmungen.</>,
    ]},
    { t: "§ 6 Bezahlte Freistellung (§ 616 BGB)", items: [
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
    { t: "§ 7 Nebentätigkeit", items: [
      <>Jede entgeltliche oder die Interessen des Arbeitgebers berührende Nebentätigkeit ist vor ihrer Aufnahme in Textform anzuzeigen und bedarf der Zustimmung des Arbeitgebers.</>,
      <>Die Zustimmung kann versagt oder widerrufen werden, wenn die Nebentätigkeit berechtigte Interessen des Arbeitgebers beeinträchtigt oder die Arbeitskraft des Arbeitnehmers mindert. Ehrenamtliche Tätigkeiten bleiben unberührt, soweit sie die Interessen des Arbeitgebers nicht beeinträchtigen.</>,
    ]},
    { t: "§ 8 Verschwiegenheit", items: [
      <>Der Arbeitnehmer bewahrt über alle ihm bekannt gewordenen Geschäfts- und Betriebsgeheimnisse sowie über als vertraulich gekennzeichnete Informationen sowohl gegenüber Außenstehenden als auch gegenüber unbefugten Mitarbeitern Stillschweigen.</>,
      <>Die Verschwiegenheitspflicht besteht auch nach Beendigung des Arbeitsverhältnisses fort. Geschäftsunterlagen und Arbeitsmittel sind bei Beendigung vollständig herauszugeben.</>,
    ]},
    { t: "§ 9 Betriebliche Altersversorgung", items: [
      <>Ein Anspruch auf eine vom Arbeitgeber finanzierte betriebliche Altersversorgung besteht nicht. Auf die Möglichkeit der Entgeltumwandlung nach den gesetzlichen Bestimmungen wird hingewiesen.</>,
    ]},
    { t: "§ 10 Beendigung des Arbeitsverhältnisses", items: [
      <>Nach Ablauf der Probezeit richtet sich die Kündigung nach <b>{txt(form.noticeText)}</b> (mindestens § 622 BGB). Eine für den Arbeitgeber geltende verlängerte Kündigungsfrist gilt auch für eine Kündigung durch den Arbeitnehmer.</>,
      <>Jede Kündigung bedarf zu ihrer Wirksamkeit der Schriftform; die elektronische Form ist ausgeschlossen (§ 623 BGB).</>,
      <>Der Arbeitgeber ist berechtigt, den Arbeitnehmer im Zusammenhang mit einer Kündigung unter Fortzahlung der Bezüge und unter Anrechnung auf Urlaubs- und Freistellungsansprüche von der Arbeitsleistung freizustellen.</>,
      befristet
        ? <>Bei einem befristeten Arbeitsverhältnis endet dieses mit Ablauf der Befristung, ohne dass es einer Kündigung bedarf.</>
        : <>Das Arbeitsverhältnis endet spätestens mit Ablauf des Monats, in dem der Arbeitnehmer die Regelaltersgrenze der gesetzlichen Rentenversicherung erreicht.</>,
    ]},
    { t: "§ 11 Vertragsstrafe", items: [
      <>Nimmt der Arbeitnehmer die Arbeit schuldhaft nicht auf oder löst er das Arbeitsverhältnis vertragswidrig ohne Einhaltung der Kündigungsfrist, so ist eine Vertragsstrafe in Höhe einer Bruttomonatsvergütung verwirkt – höchstens begrenzt auf die bis zum Ablauf der maßgeblichen Kündigungsfrist geschuldete Vergütung.</>,
      <>Die Geltendmachung eines weitergehenden Schadens bleibt unberührt.</>,
    ]},
    { t: "§ 12 Ausschlussfrist", items: [
      <>Alle beiderseitigen Ansprüche aus und im Zusammenhang mit dem Arbeitsverhältnis verfallen, wenn sie nicht innerhalb von drei Monaten nach Fälligkeit in Textform gegenüber der anderen Vertragspartei geltend gemacht werden.</>,
      <>Die Ausschlussfrist gilt nicht für Ansprüche aus vorsätzlichem oder grob fahrlässigem Handeln, aus der Verletzung von Leben, Körper oder Gesundheit sowie für Ansprüche, die kraft Gesetzes unabdingbar sind (insbesondere aus dem Mindestlohngesetz).</>,
    ]},
    { t: "§ 13 Abtretung und Verpfändung", items: [
      <>Die Abtretung oder Verpfändung von Entgeltansprüchen an Dritte ist dem Arbeitgeber unverzüglich anzuzeigen. Für die Bearbeitung einer Lohnpfändung oder -abtretung kann eine Bearbeitungspauschale von 10,00 € je Vorgang erhoben werden, soweit der unpfändbare Teil der Vergütung dadurch nicht verringert wird.</>,
    ]},
    { t: "§ 14 Datenschutzrechtlicher Hinweis", items: [
      <>Der Arbeitnehmer wird darauf hingewiesen, dass seine personenbezogenen Daten gemäß § 26 BDSG bzw. Art. 6 DSGVO zum Zweck der Begründung, Durchführung und Beendigung des Beschäftigungsverhältnisses verarbeitet und gespeichert werden.</>,
    ]},
    { t: "§ 15 Nebenabreden und Schriftform", items: [
      String(form.additionalTerms || "").trim()
        ? <>Ergänzend wird vereinbart: <span style={{ whiteSpace: "pre-wrap" }}>{form.additionalTerms}</span></>
        : <>Weitere Nebenabreden zu diesem Vertrag bestehen nicht.</>,
      <>Änderungen und Ergänzungen dieses Vertrages bedürfen der Schriftform; dies gilt auch für die Aufhebung des Schriftformerfordernisses. Ausdrücklich getroffene individuelle Vertragsabreden bleiben wirksam (§ 305b BGB).</>,
      <>Sollte eine Bestimmung dieses Vertrages unwirksam sein oder werden, so bleibt die Wirksamkeit der übrigen Bestimmungen hiervon unberührt.</>,
    ]},
  ];
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

function LaufKopf() {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", borderBottom: "1px solid #ccc", paddingBottom: 6, color: "#666" }}>
      <span style={{ fontStyle: "italic", fontWeight: 700, fontSize: 12, letterSpacing: ".04em", fontFamily: "var(--font-display), sans-serif" }}>ARBEITSVERTRAG</span>
      <span style={{ fontSize: 11, color: "#0047b3", fontWeight: 700, fontFamily: "var(--font-display), sans-serif" }}>{ARBEITGEBER.name}</span>
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

function Kasten({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ border: "1px solid #333", borderRadius: 2, padding: "4px 9px", background: "#f4f6f9", fontWeight: 700, fontSize: 13, letterSpacing: ".005em", fontFamily: "var(--font-display), sans-serif", color: "#111" }}>
      {children}
    </div>
  );
}

function Absatz({ n, children }: { n: number | null; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 8, textAlign: "justify" }}>
      {n != null && <span style={{ minWidth: 20, flexShrink: 0, color: "#0047b3", fontWeight: 600 }}>{n}.</span>}
      <div style={{ flex: 1 }}>{children}</div>
    </div>
  );
}

function A4Seite({ page, total, docRef, children }: { page: number; total: number; docRef: string; children: React.ReactNode }) {
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
          <h2 style={{ textAlign: "center", fontSize: 24, fontWeight: 700, letterSpacing: ".16em", margin: "16px 0 4px", fontFamily: "var(--font-display), sans-serif" }}>ARBEITSVERTRAG</h2>
          <p style={{ textAlign: "center", fontSize: 10, color: "#777", margin: "0 0 16px", fontStyle: "italic" }}>
            Die Bezeichnung „Arbeitnehmer" dient ausschließlich der besseren Lesbarkeit und gilt für Beschäftigte jeglichen Geschlechts.
          </p>
        </>
      ) : (
        <div style={{ marginBottom: 14 }}><LaufKopf /></div>
      )}
      <div style={{ display: "grid", gap: ITEM_GAP }}>{children}</div>
      <Fuss page={page} total={total} docRef={docRef} />
    </div>
  );
}

// ── Vorschau mit automatischem Seitenumbruch ──
function VertragVorschau({ form, befristet }: { form: Contract; befristet: boolean }) {
  const sections = buildSections(form, befristet);
  const docRef = `Arbeitsvertrag · ${txt(form.employeeName, "—")}`;

  // Flache Liste aller Fließ-Elemente (für die Umbruchrechnung)
  type Flow = { key: string; heading: boolean; node: React.ReactNode };
  const flow: Flow[] = [];
  flow.push({ key: "parties", heading: false, node: (
    <div>
      <p style={{ margin: "0 0 3px" }}>Zwischen</p>
      <p style={{ margin: "0 0 3px", paddingLeft: 16 }}><b>{ARBEITGEBER.name}</b>, {ARBEITGEBER.inhaber}, {ARBEITGEBER.strasse}, {ARBEITGEBER.ort}</p>
      <p style={{ margin: "0 0 10px", fontStyle: "italic", color: "#666" }}>– nachfolgend „Arbeitgeber" –</p>
      <p style={{ margin: "0 0 3px" }}>und</p>
      <p style={{ margin: "0 0 3px", paddingLeft: 16 }}>
        <b>{txt(form.employeeName)}</b>{form.employeeAddress ? <>, {txt(form.employeeAddress).split(/\n/).map((z: string, i: number) => <span key={i}>{i > 0 ? ", " : ""}{z}</span>)}</> : ""}
        {form.employeeBirth ? <>, geboren am <b>{form.employeeBirth}</b></> : ""}
      </p>
      <p style={{ margin: "0 0 10px", fontStyle: "italic", color: "#666" }}>– nachfolgend „Arbeitnehmer" –</p>
      <p style={{ margin: 0 }}>wird folgender {befristet ? "befristeter" : "unbefristeter"} Arbeitsvertrag geschlossen:</p>
    </div>
  )});
  sections.forEach((s, si) => {
    flow.push({ key: `h${si}`, heading: true, node: <Kasten>{s.t}</Kasten> });
    s.items.forEach((it, ii) => {
      flow.push({ key: `i${si}_${ii}`, heading: false, node: <Absatz n={s.items.length > 1 ? ii + 1 : null}>{it}</Absatz> });
    });
  });
  flow.push({ key: "sign", heading: false, node: (
    <div style={{ marginTop: 18 }}>
      <p style={{ margin: "0 0 34px" }}>{txt(form.signCity, "________")}, den {fmtDate(form.signDate)}</p>
      <div style={{ display: "flex", gap: 44 }}>
        <div style={{ flex: 1, borderTop: "1px solid #1a1a1a", paddingTop: 5, fontSize: 11.5 }}>Arbeitgeber<br />{ARBEITGEBER.name}</div>
        <div style={{ flex: 1, borderTop: "1px solid #1a1a1a", paddingTop: 5, fontSize: 11.5 }}>Arbeitnehmer<br />{txt(form.employeeName, "")}</div>
      </div>
    </div>
  )});

  const measureRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [pages, setPages] = useState<number[][] | null>(null);
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
    setPages(result);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  const laidOut = pages || [flow.map((_, k) => k)];
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
        <A4Seite key={pi} page={pi + 1} total={total} docRef={docRef}>
          {idxs.map((k) => <div key={flow[k].key}>{flow[k].node}</div>)}
        </A4Seite>
      ))}
    </div>
  );
}
