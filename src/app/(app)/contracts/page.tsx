"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { api, ConflictError } from "@/lib/clientApi";
import Icon from "@/components/Icon";
import VertragDokument, { A4_W, vertragsNr, type Contract } from "@/components/VertragDokument";
import { generateVertragPdf } from "@/lib/vertragPdf";
import ConfirmDialog from "@/components/ConfirmDialog";
import SuchSelect from "@/components/SuchSelect";


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
  workTimeModel: "flex",     // "flex" = Bandbreite + Arbeitszeitkonto, "fest" = feste Zeiten
  flexTime: true,            // Gleitzeit an-/abwählbar
  flexTimeFrom: "06:00",     // Gleitzeitrahmen: frühester Beginn
  flexTimeTo: "19:00",       // Gleitzeitrahmen: spätestes Ende
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
  // Bereits in der Mitarbeiterakte abgelegte Stände dieses Vertrags (für „Version N")
  const [staende, setStaende] = useState<any[]>([]);
  const [ablegen, setAblegen] = useState(false);
  // Auf dem Handy ist die A4-Vorschau stark verkleinert und damit kaum lesbar – dort
  // startet sie eingeklappt; gelesen wird der Vertrag über die PDF-Ansicht.
  const [vorschauOffen, setVorschauOffen] = useState(true);
  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth <= 768) setVorschauOffen(false);
  }, []);

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

  /** Welche Stände dieses Vertrags liegen schon in der Akte? */
  const ladeStaende = useCallback(async () => {
    if (!form.employeeId || !form.number) { setStaende([]); return; }
    try {
      const d = await api(`/api/employee-documents?employeeId=${form.employeeId}`);
      const key = `vertrag-${form.number}`;
      setStaende((d.data || []).filter((x: any) => x.templateKey === key));
    } catch { setStaende([]); }
  }, [form.employeeId, form.number]);

  useEffect(() => { ladeStaende(); }, [ladeStaende]);

  /**
   * Aktuellen Vertragsstand als PDF in der **Akte des Mitarbeiters** ablegen.
   * Jeder Stand ist eine eigene Version: Der Dokumentschlüssel `vertrag-<Nr>` sorgt dafür,
   * dass die Versionen je Vertrag hochzählen und ältere Stände erhalten bleiben.
   */
  async function inAkteAblegen() {
    if (!form.id) { setMsg("Bitte den Vertrag zuerst speichern."); return; }
    if (!form.employeeId) { setMsg("Bitte zuerst einen Mitarbeiter zuordnen – der Stand wird in dessen Akte abgelegt."); return; }
    setAblegen(true);
    try {
      const blob = await generateVertragPdf(form);
      const base64: string = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(String(r.result));
        r.onerror = () => rej(new Error("PDF konnte nicht gelesen werden"));
        r.readAsDataURL(blob);
      });

      // Rubrik „Arbeitsvertrag" verwenden, falls vorhanden – sonst ohne Zuordnung
      let groupId = "";
      try {
        const g = await api("/api/doc-groups");
        groupId = (g.data || []).find((x: any) => /arbeitsvertrag/i.test(x.name))?.id || "";
      } catch { /* ohne Rubrik ablegen */ }

      const nr = vertragsNr(form.number);
      const d = await api("/api/employee-documents", {
        method: "POST",
        body: JSON.stringify({
          employeeId: form.employeeId,
          groupId,
          base64,
          fileName: `${nr || "Arbeitsvertrag"}.pdf`,
          title: `Arbeitsvertrag ${nr}`.trim(),
          templateKey: `vertrag-${form.number}`,
          fill: false,
          note: `Stand vom ${new Date().toLocaleString("de-DE")}${form.status ? ` · Status ${form.status}` : ""}`,
        }),
      });
      setMsg(`In der Akte abgelegt: ${d.fileName} (Version ${d.version}).`);
      ladeStaende();
    } catch (e: any) {
      setMsg("Ablegen fehlgeschlagen: " + e.message);
    } finally {
      setAblegen(false);
    }
  }

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

  // Druck/PDF läuft über die eigene Seite /vertrag/[id] – dort gibt es keinen App-Rahmen,
  // dadurch drucken Browser (und der PDF-Export) das Dokument sauber. Voraussetzung:
  // der Vertrag ist gespeichert, denn die Seite lädt ihn aus der Datenbank.
  async function pdfAnsicht() {
    if (!form.id) {
      setMsg("Bitte den Vertrag zuerst speichern – die PDF-Ansicht lädt ihn aus der Datenbank.");
      return;
    }
    window.open(`/vertrag/${form.id}`, "_blank", "noopener");
  }

  const befristet = form.contractType === "befristet";

  return (
    <div>
      {/* Gedruckt wird nicht aus dem Editor, sondern über /vertrag/[id]. Falls hier
          trotzdem jemand Strg+P drückt, kommt statt der halben App ein klarer Hinweis. */}
      <style>{`
        @media print {
          body > * { display: none !important; }
          body::before {
            content: "Zum Drucken bitte die PDF-Vorschau öffnen (Schaltfläche „PDF-Vorschau / Drucken").";
            display: block; padding: 40px; font-family: system-ui, sans-serif; font-size: 14px;
          }
          @page { size: A4; margin: 20mm; }
        }
      `}</style>

      <div className="vertrag-kopf" style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
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
        <div className="vertrag-aktionen" style={{ display: "flex", gap: 8, marginLeft: "auto", flexWrap: "wrap" }}>
          <button className="btn btn-primary" onClick={speichern} disabled={saving}>
            <Icon name="save" /> {saving ? "Speichert…" : "Speichern"}
          </button>
          <button className="btn" onClick={inAkteAblegen} disabled={ablegen || !form.id}
            title={form.employeeId
              ? "Diesen Stand als PDF in der Mitarbeiterakte ablegen – ältere Stände bleiben als Versionen erhalten"
              : "Erst einen Mitarbeiter zuordnen"}>
            <Icon name="archive" />
            <span className="nur-desktop">
              {ablegen ? "Legt ab…" : staende.length ? `In die Akte (Version ${staende.length + 1})` : "In die Akte ablegen"}
            </span>
            <span className="nur-handy">Akte</span>
          </button>
          <button className="btn" onClick={pdfAnsicht} title={form.id ? "PDF-Vorschau öffnen – dort drucken oder als PDF speichern" : "Erst speichern, dann PDF-Ansicht"}>
            <Icon name="file-text" />
            <span className="nur-desktop">PDF-Vorschau / Drucken</span>
            <span className="nur-handy">PDF</span>
          </button>
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
                        className="nr-badge"
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
              <SuchSelect
                  value={form.template || "vollstaendig"}
                  onChange={(v) => set("template", v)}
                  platzhalter="Vorlage wählen"
                  options={[
                    { value: "vollstaendig", label: "Vollständig – alle rechtlichen Absicherungen" },
                    { value: "standard", label: "Standard – Grundvertrag" },
                    { value: "minijob", label: "Minijob – geringfügige Beschäftigung" },
                  ]}
                />
            </Feld>
            <Feld label="Mitarbeiter">
              <SuchSelect
                value={form.employeeId || ""}
                onChange={onEmployee}
                platzhalter="— aus Nexus wählen —"
                suchePlatzhalter="Name oder Personalnummer…"
                options={employees.map((e) => ({ value: e.id, label: e.name, hint: e.employeeNumber || e.email || "" }))}
              />
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

            <div className="feld-zeile feld-zeile-2">
              <Feld label="Eintrittsdatum">
                <input className="input" type="date" value={form.startDate ? String(form.startDate).slice(0, 10) : ""}
                  onChange={(e) => set("startDate", e.target.value ? new Date(e.target.value).toISOString() : null)} />
              </Feld>
              <Feld label="Vertragsart">
                <SuchSelect
                  value={form.contractType || "unbefristet"}
                  onChange={(v) => set("contractType", v)}
                  platzhalter="Art wählen"
                  options={[{ value: "unbefristet", label: "unbefristet" }, { value: "befristet", label: "befristet" }]}
                />
              </Feld>
            </div>

            {befristet && (
              <Feld label="Befristet bis">
                <input className="input" type="date" value={form.endDate ? String(form.endDate).slice(0, 10) : ""}
                  onChange={(e) => set("endDate", e.target.value ? new Date(e.target.value).toISOString() : null)} />
              </Feld>
            )}

            <Feld label="Probezeit (Monate)">
              <input className="input" type="number" min={0} value={form.probationMonths ?? 0}
                onChange={(e) => set("probationMonths", e.target.value === "" ? 0 : Number(e.target.value))} />
            </Feld>

            {/* Arbeitszeitmodell: entweder feste Zeiten oder Flexzeit mit Bandbreite.
                Die Auswahl steuert sowohl die Eingabefelder als auch den Vertragstext. */}
            <Feld label="Arbeitszeit">
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {[["flex", "Flexzeit (Bandbreite)"], ["fest", "Festzeit (feste Stunden)"]].map(([wert, text]) => {
                  const aktiv = (form.workTimeModel || "flex") === wert;
                  return (
                    <button key={wert} type="button" className="btn"
                      style={{ background: aktiv ? "var(--accent)" : undefined, color: aktiv ? "#fff" : undefined }}
                      onClick={() => set("workTimeModel", wert)}>
                      {text}
                    </button>
                  );
                })}
              </div>
            </Feld>

            {(form.workTimeModel || "flex") === "fest" ? (
              <div className="feld-zeile feld-zeile-3">
                <Feld label="Wochenstunden">
                  <input className="input" type="number" min={0} step="0.5" value={form.weeklyHours ?? 40}
                    onChange={(e) => set("weeklyHours", e.target.value === "" ? 0 : Number(e.target.value))} />
                </Feld>
                <Feld label="Arbeitszeit von">
                  <input className="input" type="time" value={form.coreTimeFrom || "07:00"}
                    onChange={(e) => set("coreTimeFrom", e.target.value)} />
                </Feld>
                <Feld label="Arbeitszeit bis">
                  <input className="input" type="time" value={form.coreTimeTo || "16:00"}
                    onChange={(e) => set("coreTimeTo", e.target.value)} />
                </Feld>
              </div>
            ) : (
              <>
                <div className="feld-zeile feld-zeile-2">
                  <Feld label="Flexzeit von (Std.)">
                    <input className="input" type="number" min={0} step="0.5" value={form.weekHoursMin ?? 32}
                      onChange={(e) => set("weekHoursMin", e.target.value === "" ? 0 : Number(e.target.value))} />
                  </Feld>
                  <Feld label="Flexzeit bis (Std.)">
                    <input className="input" type="number" min={0} step="0.5" value={form.weekHoursMax ?? 42}
                      onChange={(e) => set("weekHoursMax", e.target.value === "" ? 0 : Number(e.target.value))} />
                  </Feld>
                </div>
                <div className="feld-zeile feld-zeile-3" style={{ alignItems: "end" }}>
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
              </>
            )}

            {/* Gleitzeit lässt sich an- und abwählen. Ist sie aus, entfällt die Klausel im Vertrag. */}
            <Feld label="Gleitzeit">
              <label style={{ fontSize: 13.5, display: "flex", alignItems: "center", gap: 8 }}>
                <input type="checkbox" checked={form.flexTime === true}
                  onChange={(e) => set("flexTime", e.target.checked)} />
                <span>Gleitzeit vereinbaren (freie Wahl von Beginn und Ende im Rahmen)</span>
              </label>
            </Feld>

            {form.flexTime === true && (
              <div className="feld-zeile feld-zeile-2">
                <Feld label="Gleitzeit von">
                  <input className="input" type="time" value={form.flexTimeFrom || "06:00"}
                    onChange={(e) => set("flexTimeFrom", e.target.value)} />
                </Feld>
                <Feld label="Gleitzeit bis">
                  <input className="input" type="time" value={form.flexTimeTo || "19:00"}
                    onChange={(e) => set("flexTimeTo", e.target.value)} />
                </Feld>
              </div>
            )}

            <div className="feld-zeile feld-zeile-2">
              <Feld label="Bruttoentgelt (€)">
                <input className="input" type="number" min={0} step="0.01" value={form.salary ?? 0}
                  onChange={(e) => set("salary", e.target.value === "" ? 0 : Number(e.target.value))} />
              </Feld>
              <Feld label="Zahlung">
                <SuchSelect
                  value={form.salaryPeriod || "stündlich"}
                  onChange={(v) => set("salaryPeriod", v)}
                  platzhalter="Zeitraum wählen"
                  options={[{ value: "monatlich", label: "monatlich" }, { value: "stündlich", label: "stündlich" }]}
                />
              </Feld>
            </div>

            <div className="feld-zeile feld-zeile-2">
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

            <div className="feld-zeile feld-zeile-2">
              <Feld label="Unterschriftsort">
                <input className="input" value={form.signCity || ""} onChange={(e) => set("signCity", e.target.value)} />
              </Feld>
              <Feld label="Unterschriftsdatum">
                <input className="input" type="date" value={form.signDate ? String(form.signDate).slice(0, 10) : ""}
                  onChange={(e) => set("signDate", e.target.value ? new Date(e.target.value).toISOString() : null)} />
              </Feld>
            </div>

            <Feld label="Status">
              <SuchSelect
                value={form.status || "entwurf"}
                onChange={(v) => set("status", v)}
                platzhalter="Status wählen"
                options={[
                  { value: "entwurf", label: "Entwurf" },
                  { value: "aktiv", label: "Aktiv" },
                  { value: "beendet", label: "Beendet" },
                ]}
              />
            </Feld>

            {/* Abgelegte Stände dieses Vertrags – jede Ablage ist eine eigene Version in der Akte */}
            {form.id && form.employeeId && (
              <div style={{ borderTop: "1px solid var(--border)", paddingTop: 12, display: "grid", gap: 6 }}>
                <div className="muted" style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: ".04em",
                                                display: "flex", alignItems: "center", gap: 6 }}>
                  <Icon name="archive" size={14} /> In der Akte abgelegte Stände
                </div>
                {staende.length === 0 ? (
                  <div className="muted" style={{ fontSize: 13 }}>
                    Noch kein Stand abgelegt. Über „In die Akte ablegen" wandert der Vertrag als PDF in die
                    Mitarbeiterakte; jede weitere Ablage wird eine neue Version.
                  </div>
                ) : (
                  <div style={{ display: "grid", gap: 4 }}>
                    {staende
                      .slice()
                      .sort((a, b) => b.version - a.version)
                      .map((d) => (
                        <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13,
                                                 border: "1px solid var(--border)", borderRadius: 8, padding: "5px 8px" }}>
                          <span style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>v{d.version}</span>
                          <span className="muted" style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {new Date(d.createdAt).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                            {d.note ? ` · ${d.note}` : ""}
                          </span>
                        </div>
                      ))}
                    <Link className="btn" style={{ justifySelf: "start", marginTop: 4 }}
                      href={`/documents?employee=${form.employeeId}`}>
                      <Icon name="folder" /> Akte öffnen
                    </Link>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Rechte Spalte: Live-Vorschau (Papier), zoombar ── */}
        <div>
          <button type="button" className="btn nur-handy" style={{ width: "100%", justifyContent: "center", marginBottom: 10 }}
            onClick={() => setVorschauOffen((v) => !v)}>
            <Icon name={vorschauOffen ? "eye-off" : "eye"} />
            {vorschauOffen ? "Vorschau ausblenden" : "Vorschau anzeigen"}
          </button>
          {vorschauOffen ? (
            <ZoomView>
              <VertragDokument form={form} befristet={befristet} />
            </ZoomView>
          ) : (
            <div className="card nur-handy" style={{ padding: 14, fontSize: 13.5, lineHeight: 1.5 }}>
              <span className="muted">
                Die Seitenvorschau ist auf dem Handy stark verkleinert. Zum Lesen und Weitergeben
                besser <b>PDF-Vorschau</b> öffnen – dort lässt sich der Vertrag auch speichern oder drucken.
              </span>
            </div>
          )}
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

  // Größer als der Platz? Dann links bündig beginnen und intern scrollen – sonst mittig.
  const ueberbreit = z > fit + 0.001;

  return (
    // `isolation` hält das skalierte Papier in einer eigenen Ebene: es kann die
    // Eingabespalte daneben nicht überdecken.
    <div style={{ isolation: "isolate", position: "relative", zIndex: 0, maxWidth: "100%", overflow: "hidden" }}>
      <div className="vv-toolbar" style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, position: "relative", zIndex: 1, background: "var(--bg)" }}>
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
      {/* `contain: paint` erzwingt das Zuschneiden – beim Vergrößern läuft nichts mehr
          aus dem Vorschaufenster heraus. Zentriert wird per Flex statt „margin: auto",
          sonst ragt ein überbreites Papier nach links über den scrollbaren Bereich hinaus. */}
      <div ref={outerRef} className="vv-zoom-outer"
        style={{ width: "100%", maxWidth: "100%", overflowX: ueberbreit ? "auto" : "hidden", overflowY: "hidden",
                 contain: "paint", display: "flex", justifyContent: ueberbreit ? "flex-start" : "center" }}>
        <div className="vv-zoombox" style={{ width: A4_W * z, flex: "0 0 auto", height: innerH ? innerH * z : undefined, position: "relative" }}>
          <div className="vv-scale" ref={innerRef} style={{ width: A4_W, transform: `scale(${z})`, transformOrigin: "top left", position: "absolute", top: 0, left: 0 }}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Vorschau mit automatischem Seitenumbruch ──
