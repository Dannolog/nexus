"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { api, ConflictError } from "@/lib/clientApi";
import Icon from "@/components/Icon";
import VertragDokument, { A4_W, vertragsNr, type Contract } from "@/components/VertragDokument";
import { generateVertragPdf } from "@/lib/vertragPdf";
import ConfirmDialog from "@/components/ConfirmDialog";
import SuchSelect from "@/components/SuchSelect";
import PdfViewerModal from "@/components/PdfViewerModal";
import UnterschriftDialog from "@/components/UnterschriftDialog";
import SearchInput from "@/components/SearchInput";
import { Feld as TextFeld } from "@/components/KontaktFeld";
import { ARBEITGEBER } from "@/components/VertragDokument";

/** „02.10.2026, 14:05" */
const zeitpunkt = (v?: string | null) =>
  v ? new Date(v).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";

type Rolle = "arbeitgeber" | "arbeitnehmer";


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
  // Untermenü „Gespeicherte Verträge" (Liste mit PDF-Ansicht und Änderungsdatum)
  const [listeOffen, setListeOffen] = useState(false);
  const [listeSuche, setListeSuche] = useState("");
  const [pdf, setPdf] = useState<{ url: string; titel: string; dateiname: string } | null>(null);
  const [pdfBusy, setPdfBusy] = useState("");
  // Unterschreiben (Arbeitgeber / Arbeitnehmer)
  const [unterschrift, setUnterschrift] = useState<{ vertrag: Contract; rolle: Rolle } | null>(null);
  const [zuruecksetzen, setZuruecksetzen] = useState(false);
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

  /** Vertrag als PDF im Betrachter öffnen (mit Herunterladen/Drucken). */
  async function pdfOeffnen(c: Contract) {
    setPdfBusy(c.id || "form");
    try {
      const blob = await generateVertragPdf(c);
      const nr = vertragsNr(c.number);
      setPdf({
        url: URL.createObjectURL(blob),
        titel: `${nr ? nr + " · " : ""}${c.title || c.employeeName || "Arbeitsvertrag"}`,
        dateiname: `${nr || "Arbeitsvertrag"}${c.employeeName ? "_" + String(c.employeeName).replace(/[^\wäöüÄÖÜß-]+/g, "_") : ""}.pdf`,
      });
    } catch (e: any) {
      setMsg("PDF konnte nicht erzeugt werden: " + e.message);
    } finally { setPdfBusy(""); }
  }

  /** Unterschrift speichern – danach Liste und (falls offen) den Vertrag im Editor aktualisieren. */
  async function unterschreiben(bild: string, name: string) {
    if (!unterschrift?.vertrag.id) return;
    const up = await api(`/api/contracts/${unterschrift.vertrag.id}/sign`, {
      method: "POST", body: JSON.stringify({ rolle: unterschrift.rolle, bild, name }),
    });
    if (form.id === up.id) setForm(up);
    const beide = up.signEmployerImage && up.signEmployeeImage;
    setMsg(beide
      ? "Unterschrieben – beide Seiten haben unterzeichnet, der Vertrag ist jetzt aktiv."
      : `Unterschrift ${unterschrift.rolle === "arbeitgeber" ? "Arbeitgeber" : "Arbeitnehmer"} gespeichert.`);
    setUnterschrift(null);
    loadContracts();
  }

  async function unterschriftenZuruecksetzen() {
    if (!form.id) return;
    try {
      const up = await api(`/api/contracts/${form.id}/sign`, { method: "DELETE" });
      setForm(up);
      setMsg("Unterschriften zurückgesetzt – der Vertrag lässt sich wieder bearbeiten.");
      loadContracts();
    } catch (e: any) { setMsg("Fehler: " + e.message); }
    finally { setZuruecksetzen(false); }
  }

  const gesperrt = !!(form.signEmployerImage || form.signEmployeeImage);
  const listeGefiltert = contracts
    .filter((c) => {
      const teile = listeSuche.toLowerCase().split(/\s+/).filter(Boolean);
      const text = [vertragsNr(c.number), c.title, c.employeeName, c.jobTitle, c.status].join(" ").toLowerCase();
      return teile.every((t) => text.includes(t));
    })
    .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));

  const befristet = form.contractType === "befristet";

  const modell = form.workTimeModel || "flex";
  const aktNr = vertragsNr(form.number);
  const msgFehler = /fehler|fehlgeschlagen|nicht möglich|konnte nicht|konflikt|bitte/i.test(msg);
  const sperrStil = { opacity: gesperrt ? 0.6 : 1 };

  return (
    <div className="per-vertraege">
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

      {/* ── Seitenkopf: Titel, Erklärung, Aktionen (Hauptaktion rechts) ── */}
      <div className="vertrag-kopf per-kopf">
        <div className="per-kopf-text">
          <h1 className="seiten-titel">
            <span className="titel-icon"><Icon name="file-text" size={20} /></span>
            Arbeitsverträge
            {contracts.length > 0 && <span className="anzahl">{contracts.length}</span>}
          </h1>
          <div className="seiten-untertitel">
            Links ausfüllen, rechts die Vorschau prüfen – danach unterschreiben und als PDF in die Akte legen.
          </div>
        </div>
        <div className="vertrag-aktionen per-kopf-aktionen">
          <button className="btn" onClick={neu}><Icon name="plus" /> Neu</button>
          {/* Untermenü: gespeicherte Verträge mit PDF-Ansicht */}
          <button className="btn nur-desktop" onClick={() => setListeOffen(true)}>
            <Icon name="folder" /> Gespeicherte Verträge
            {contracts.length ? <span className="per-zahl">{contracts.length}</span> : null}
          </button>
          <button className="btn" onClick={inAkteAblegen} disabled={ablegen || !form.id}
            title={form.employeeId
              ? "Diesen Stand als PDF in der Mitarbeiterakte ablegen – ältere Stände bleiben als Versionen erhalten"
              : "Erst einen Mitarbeiter zuordnen"}>
            <Icon name="archive" />
            <span className="nur-desktop">
              {ablegen ? "Legt ab…" : staende.length ? `In die Akte (Version ${staende.length + 1})` : "In die Akte ablegen"}
            </span>
            <span className="nur-handy">{ablegen ? "Legt ab…" : "Akte"}</span>
          </button>
          <button className="btn nur-desktop" onClick={() => (form.id ? pdfOeffnen(form) : pdfAnsicht())} disabled={pdfBusy === (form.id || "form")}
            title={form.id ? "PDF ansehen – dort herunterladen oder drucken" : "Erst speichern, dann PDF-Ansicht"}>
            <Icon name="printer" /> PDF-Vorschau / Drucken
          </button>
          {form.id && (
            <>
              <Link className="btn btn-icon" title="Verlauf" aria-label="Verlauf" href={`/history?entity=EmploymentContract&entityId=${form.id}`}><Icon name="history" /></Link>
              <button className="btn btn-icon btn-danger" title="Löschen" aria-label="Löschen" onClick={() => setDeleting(true)}><Icon name="trash" /></button>
            </>
          )}
          <button className="btn btn-primary nur-desktop" onClick={speichern} disabled={saving}>
            {saving ? <><span className="speichern-dreh" /> Speichert…</> : <><Icon name="save" /> Speichern</>}
          </button>
        </div>
      </div>

      {/* ── Aktueller Vertrag: Nummer (Klick = kopieren), Status, Sperre, Zeitstempel ── */}
      <div className="per-akt-leiste">
        {aktNr ? (
          <button
            type="button"
            className="btn per-nr-knopf"
            title="Vertragsnummer in die Zwischenablage kopieren"
            onClick={() => nrKopieren(aktNr)}
          >
            <Icon name={copied === aktNr ? "check" : "copy"} size={14} />
            {aktNr}
          </button>
        ) : (
          <span className="abzeichen blau"><Icon name="plus" size={12} /> Neuer Vertrag – noch nicht gespeichert</span>
        )}
        <StatusAbzeichen status={form.status} />
        {gesperrt && <span className="abzeichen"><Icon name="lock" size={12} /> Inhalt gesperrt</span>}
        {form.id && (
          <span className="per-akt-zeit">
            <Icon name="history" size={13} /> zuletzt geändert {zeitpunkt(form.updatedAt)}
            {form.createdAt && <span className="nur-desktop"> · angelegt {zeitpunkt(form.createdAt)}</span>}
          </span>
        )}
      </div>

      {msg && (
        <div className={`hinweis-leiste${msgFehler ? " fehler" : ""}`} role="status">
          <Icon name={msgFehler ? "alert" : "check"} size={16} />
          <span style={{ flex: 1, minWidth: 0 }}>{msg}</span>
          <button type="button" className="btn btn-icon btn-flach" aria-label="Meldung schließen" onClick={() => setMsg("")}><Icon name="x" size={14} /></button>
        </div>
      )}

      <div className="contract-grid">
        {/* ── Linke Spalte: Unterschriften + Formular in Abschnitten ── */}
        <div className="per-spalte">
          {/* ── Unterschriften: Arbeitgeber und Arbeitnehmer ── */}
          {form.id && (
            <Abschnitt icon="pencil" titel="Unterschriften"
              hinweis="Beide Seiten unterschreiben hier per Finger, Stift oder Maus. Danach ist der Inhalt gesperrt.">
              {(["arbeitgeber", "arbeitnehmer"] as Rolle[]).map((r) => {
                const bild = r === "arbeitgeber" ? form.signEmployerImage : form.signEmployeeImage;
                const wer = r === "arbeitgeber" ? form.signEmployerName : form.signEmployeeName;
                const am = r === "arbeitgeber" ? form.signEmployerAt : form.signEmployeeAt;
                return (
                  <div key={r} className={`per-sign-zeile${bild ? " fertig" : ""}`}>
                    <div className="per-sign-bild">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {bild ? <img src={bild} alt="" /> : <Icon name="pencil" size={14} />}
                    </div>
                    <div className="per-sign-text">
                      <div className="per-sign-rolle">
                        <Icon name={r === "arbeitgeber" ? "building" : "user"} size={14} />
                        {r === "arbeitgeber" ? "Arbeitgeber" : "Arbeitnehmer"}
                        {bild
                          ? <span className="abzeichen gruen"><Icon name="check" size={11} /> unterschrieben</span>
                          : <span className="abzeichen gelb">offen</span>}
                      </div>
                      <div className="muted per-sign-wer">
                        {bild ? `${wer} · ${zeitpunkt(am)}` : "noch nicht unterschrieben"}
                      </div>
                    </div>
                    {!bild && (
                      <button className="btn btn-primary per-sign-knopf" onClick={() => setUnterschrift({ vertrag: form, rolle: r })}>
                        <Icon name="pencil" /> Unterschreiben
                      </button>
                    )}
                  </div>
                );
              })}
              {gesperrt && (
                <div className="per-sperre">
                  <span className="muted">
                    <Icon name="lock" size={13} /> Der Inhalt ist gesperrt, weil bereits unterschrieben wurde. Status und Vertragsname bleiben änderbar.
                  </span>
                  <button className="btn btn-danger" onClick={() => setZuruecksetzen(true)}>
                    <Icon name="undo" /> Unterschriften zurücksetzen
                  </button>
                </div>
              )}
            </Abschnitt>
          )}

          {/* ── Vertrag: Name, Status, Vorlage ── */}
          <Abschnitt icon="file-text" titel="Vertrag" hinweis="Name zur Zuordnung in der Liste, Bearbeitungsstand und die Vertragsvorlage.">
            <TextFeld label="Vertragsname (zur Zuordnung)" icon="tag"
              platzhalter={form.employeeName ? `Arbeitsvertrag – ${form.employeeName}` : "z. B. Arbeitsvertrag – Max Mustermann"}
              wert={form.title || ""} setWert={(v) => set("title", v)} />
            <Gruppe label="Status" icon="check">
              <Segment wert={form.status || "entwurf"} onChange={(v) => set("status", v)}
                optionen={[["entwurf", "Entwurf"], ["aktiv", "Aktiv"], ["beendet", "Beendet"]]} />
            </Gruppe>
            <fieldset disabled={gesperrt} className="per-fieldset" style={sperrStil}>
              <Feld label="Vorlage" icon="file-text">
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
            </fieldset>
          </Abschnitt>

          {/* ── Arbeitnehmer ── */}
          <Abschnitt icon="user" titel="Arbeitnehmer" hinweis="Mitarbeiter aus Nexus wählen – der Name wird übernommen und lässt sich anpassen.">
            <fieldset disabled={gesperrt} className="per-fieldset" style={sperrStil}>
              <Feld label="Mitarbeiter" icon="users">
                <SuchSelect
                  value={form.employeeId || ""}
                  onChange={onEmployee}
                  platzhalter="— aus Nexus wählen —"
                  suchePlatzhalter="Name oder Personalnummer…"
                  options={employees.map((e) => ({ value: e.id, label: e.name, hint: e.employeeNumber || e.email || "" }))}
                />
              </Feld>
              <TextFeld label="Name des Arbeitnehmers" icon="user" wert={form.employeeName || ""} setWert={(v) => set("employeeName", v)} />
              <Feld label="Anschrift (Straße, PLZ Ort)" icon="home">
                <textarea className="input" rows={2} value={form.employeeAddress || ""} onChange={(e) => set("employeeAddress", e.target.value)} />
              </Feld>
              <TextFeld label="Geburtsdatum" icon="calendar" platzhalter="z. B. 01.01.1990"
                wert={form.employeeBirth || ""} setWert={(v) => set("employeeBirth", v)} />
            </fieldset>
          </Abschnitt>

          {/* ── Tätigkeit & Laufzeit ── */}
          <Abschnitt icon="id-card" titel="Tätigkeit & Laufzeit" hinweis="Position, Beginn, Befristung und Probezeit.">
            <fieldset disabled={gesperrt} className="per-fieldset" style={sperrStil}>
              <TextFeld label="Tätigkeit / Position" icon="id-card" wert={form.jobTitle || ""} setWert={(v) => set("jobTitle", v)} />
              <Gruppe label="Vertragsart" icon="file-text">
                <Segment wert={form.contractType || "unbefristet"} onChange={(v) => set("contractType", v)}
                  optionen={[["unbefristet", "unbefristet"], ["befristet", "befristet"]]} />
              </Gruppe>
              <div className="feld-zeile feld-zeile-2">
                <Feld label="Eintrittsdatum" icon="calendar">
                  <input className="input" type="date" value={form.startDate ? String(form.startDate).slice(0, 10) : ""}
                    onChange={(e) => set("startDate", e.target.value ? new Date(e.target.value).toISOString() : null)} />
                </Feld>
                {befristet ? (
                  <Feld label="Befristet bis" icon="calendar">
                    <input className="input" type="date" value={form.endDate ? String(form.endDate).slice(0, 10) : ""}
                      onChange={(e) => set("endDate", e.target.value ? new Date(e.target.value).toISOString() : null)} />
                  </Feld>
                ) : (
                  <Feld label="Probezeit (Monate)" icon="history">
                    <input className="input" type="number" min={0} value={form.probationMonths ?? 0}
                      onChange={(e) => set("probationMonths", e.target.value === "" ? 0 : Number(e.target.value))} />
                  </Feld>
                )}
              </div>
              {befristet && (
                <Feld label="Probezeit (Monate)" icon="history">
                  <input className="input" type="number" min={0} value={form.probationMonths ?? 0}
                    onChange={(e) => set("probationMonths", e.target.value === "" ? 0 : Number(e.target.value))} />
                </Feld>
              )}
            </fieldset>
          </Abschnitt>

          {/* ── Arbeitszeit: entweder feste Zeiten oder Flexzeit mit Bandbreite.
                Die Auswahl steuert sowohl die Eingabefelder als auch den Vertragstext. ── */}
          <Abschnitt icon="history" titel="Arbeitszeit" hinweis="Flexzeit: Wochenstunden in einer Bandbreite. Festzeit: feste Stunden und Zeiten.">
            <fieldset disabled={gesperrt} className="per-fieldset" style={sperrStil}>
              <Gruppe label="Arbeitszeitmodell" icon="settings">
                <Segment wert={modell} onChange={(v) => set("workTimeModel", v)}
                  optionen={[["flex", "Flexzeit (Bandbreite)"], ["fest", "Festzeit (feste Stunden)"]]} />
              </Gruppe>

              {modell === "fest" ? (
                <div className="feld-zeile feld-zeile-3">
                  <Feld label="Wochenstunden" icon="history">
                    <input className="input" type="number" min={0} step="0.5" value={form.weeklyHours ?? 40}
                      onChange={(e) => set("weeklyHours", e.target.value === "" ? 0 : Number(e.target.value))} />
                  </Feld>
                  <Feld label="Arbeitszeit von" icon="login">
                    <input className="input" type="time" value={form.coreTimeFrom || "07:00"}
                      onChange={(e) => set("coreTimeFrom", e.target.value)} />
                  </Feld>
                  <Feld label="Arbeitszeit bis" icon="logout">
                    <input className="input" type="time" value={form.coreTimeTo || "16:00"}
                      onChange={(e) => set("coreTimeTo", e.target.value)} />
                  </Feld>
                </div>
              ) : (
                <>
                  <div className="feld-zeile feld-zeile-2">
                    <Feld label="Flexzeit von (Std.)" icon="history">
                      <input className="input" type="number" min={0} step="0.5" value={form.weekHoursMin ?? 32}
                        onChange={(e) => set("weekHoursMin", e.target.value === "" ? 0 : Number(e.target.value))} />
                    </Feld>
                    <Feld label="Flexzeit bis (Std.)" icon="history">
                      <input className="input" type="number" min={0} step="0.5" value={form.weekHoursMax ?? 42}
                        onChange={(e) => set("weekHoursMax", e.target.value === "" ? 0 : Number(e.target.value))} />
                    </Feld>
                  </div>
                  <div className="feld-zeile feld-zeile-2">
                    <Feld label="Regelarbeitszeit von" icon="login">
                      <input className="input" type="time" value={form.coreTimeFrom || "07:00"}
                        onChange={(e) => set("coreTimeFrom", e.target.value)} />
                    </Feld>
                    <Feld label="Regelarbeitszeit bis" icon="logout">
                      <input className="input" type="time" value={form.coreTimeTo || "17:00"}
                        onChange={(e) => set("coreTimeTo", e.target.value)} />
                    </Feld>
                  </div>
                  <Schalter an={form.timeAccount !== false} onChange={(v) => set("timeAccount", v)}>
                    Arbeitszeitkonto führen
                  </Schalter>
                </>
              )}

              {/* Gleitzeit lässt sich an- und abwählen. Ist sie aus, entfällt die Klausel im Vertrag. */}
              <Schalter an={form.flexTime === true} onChange={(v) => set("flexTime", v)}>
                Gleitzeit vereinbaren <span className="muted per-klein">(freie Wahl von Beginn und Ende im Rahmen)</span>
              </Schalter>

              {form.flexTime === true && (
                <div className="feld-zeile feld-zeile-2">
                  <Feld label="Gleitzeit von" icon="login">
                    <input className="input" type="time" value={form.flexTimeFrom || "06:00"}
                      onChange={(e) => set("flexTimeFrom", e.target.value)} />
                  </Feld>
                  <Feld label="Gleitzeit bis" icon="logout">
                    <input className="input" type="time" value={form.flexTimeTo || "19:00"}
                      onChange={(e) => set("flexTimeTo", e.target.value)} />
                  </Feld>
                </div>
              )}
            </fieldset>
          </Abschnitt>

          {/* ── Vergütung, Urlaub & Ort ── */}
          <Abschnitt icon="tag" titel="Vergütung, Urlaub & Ort" hinweis="Bruttoentgelt je Stunde oder Monat, Urlaubsanspruch und Arbeitsort.">
            <fieldset disabled={gesperrt} className="per-fieldset" style={sperrStil}>
              <div className="feld-zeile feld-zeile-2">
                <Feld label="Bruttoentgelt (€)" icon="tag">
                  <input className="input" type="number" min={0} step="0.01" value={form.salary ?? 0}
                    onChange={(e) => set("salary", e.target.value === "" ? 0 : Number(e.target.value))} />
                </Feld>
                <Gruppe label="Zahlung" icon="calendar">
                  <Segment wert={form.salaryPeriod || "stündlich"} onChange={(v) => set("salaryPeriod", v)}
                    optionen={[["monatlich", "monatlich"], ["stündlich", "stündlich"]]} />
                </Gruppe>
              </div>
              <div className="feld-zeile feld-zeile-2">
                <Feld label="Urlaubstage / Jahr (max. 30)" icon="star">
                  <input className="input" type="number" min={0} max={30} value={form.vacationDays ?? 0}
                    onChange={(e) => set("vacationDays", e.target.value === "" ? 0 : Number(e.target.value))} />
                </Feld>
                <TextFeld label="Arbeitsort" icon="building" kopierbar={false} wert={form.workplace || ""} setWert={(v) => set("workplace", v)} />
              </div>
            </fieldset>
          </Abschnitt>

          {/* ── Kündigung & Vereinbarungen ── */}
          <Abschnitt icon="shield" titel="Kündigung & Vereinbarungen" hinweis="Kündigungsfrist und optionale Zusatzvereinbarungen.">
            <fieldset disabled={gesperrt} className="per-fieldset" style={sperrStil}>
              <TextFeld label="Kündigungsfrist" icon="calendar" wert={form.noticeText || ""} setWert={(v) => set("noticeText", v)} />
              <Feld label="Zusätzliche Vereinbarungen (optional)" icon="pencil">
                <textarea className="input" rows={3} value={form.additionalTerms || ""} onChange={(e) => set("additionalTerms", e.target.value)} />
              </Feld>
            </fieldset>
          </Abschnitt>

          {/* ── Ort und Datum der Unterschrift ── */}
          <Abschnitt icon="globe" titel="Ort & Datum der Unterschrift" hinweis="Erscheint über den Unterschriftszeilen im Vertrag.">
            <fieldset disabled={gesperrt} className="per-fieldset" style={sperrStil}>
              <div className="feld-zeile feld-zeile-2">
                <TextFeld label="Unterschriftsort" icon="globe" kopierbar={false} wert={form.signCity || ""} setWert={(v) => set("signCity", v)} />
                <Feld label="Unterschriftsdatum" icon="calendar">
                  <input className="input" type="date" value={form.signDate ? String(form.signDate).slice(0, 10) : ""}
                    onChange={(e) => set("signDate", e.target.value ? new Date(e.target.value).toISOString() : null)} />
                </Feld>
              </div>
            </fieldset>
          </Abschnitt>

          {/* Abgelegte Stände dieses Vertrags – jede Ablage ist eine eigene Version in der Akte */}
          {form.id && form.employeeId && (
            <Abschnitt icon="archive" titel="In der Akte abgelegte Stände"
              rechts={staende.length ? <span className="abzeichen blau">{staende.length}</span> : undefined}>
              {staende.length === 0 ? (
                <div className="muted per-klein">
                  Noch kein Stand abgelegt. Über „In die Akte ablegen" wandert der Vertrag als PDF in die
                  Mitarbeiterakte; jede weitere Ablage wird eine neue Version.
                </div>
              ) : (
                <div className="per-staende">
                  {staende
                    .slice()
                    .sort((a, b) => b.version - a.version)
                    .map((d) => (
                      <div key={d.id} className="per-stand">
                        <span className="abzeichen blau per-stand-v">v{d.version}</span>
                        <span className="muted per-stand-text">
                          {new Date(d.createdAt).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                          {d.note ? ` · ${d.note}` : ""}
                        </span>
                      </div>
                    ))}
                </div>
              )}
              <div className="per-knopfreihe">
                <button className="btn" onClick={inAkteAblegen} disabled={ablegen || !form.id}>
                  <Icon name="archive" /> {ablegen ? "Legt ab…" : staende.length ? `Neue Version ablegen (v${staende.length + 1})` : "In die Akte ablegen"}
                </button>
                {staende.length > 0 && (
                  <Link className="btn" href={`/documents?employee=${form.employeeId}`}>
                    <Icon name="folder" /> Akte öffnen
                  </Link>
                )}
              </div>
            </Abschnitt>
          )}
        </div>

        {/* ── Rechte Spalte: Live-Vorschau (Papier), zoombar ── */}
        <div className="per-vorschau">
          <div className="per-vorschau-kopf">
            <span className="sektion-titel"><Icon name="eye" size={14} /> Vorschau</span>
            <button type="button" className="btn nur-handy" onClick={() => setVorschauOffen((v) => !v)}>
              <Icon name={vorschauOffen ? "eye-off" : "eye"} />
              {vorschauOffen ? "Ausblenden" : "Anzeigen"}
            </button>
          </div>
          {vorschauOffen ? (
            <ZoomView>
              <VertragDokument form={form} befristet={befristet} />
            </ZoomView>
          ) : (
            <div className="card nur-handy per-vorschau-hinweis">
              <span className="muted">
                Die Seitenvorschau ist auf dem Handy stark verkleinert. Zum Lesen und Weitergeben
                besser <b>PDF</b> öffnen – dort lässt sich der Vertrag auch speichern oder drucken.
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Handy: Speichern immer greifbar am unteren Rand (Hauptaktion rechts) */}
      <div className="vertrag-handyleiste">
        <button className="btn" onClick={() => setListeOffen(true)}><Icon name="folder" /> Verträge</button>
        <button className="btn" onClick={() => (form.id ? pdfOeffnen(form) : pdfAnsicht())} disabled={pdfBusy === (form.id || "form")}><Icon name="eye" /> PDF</button>
        <button className="btn btn-primary" onClick={speichern} disabled={saving}>
          {saving ? <><span className="speichern-dreh" /> Speichert…</> : <><Icon name="save" /> Speichern</>}
        </button>
      </div>

      {/* ── Untermenü: Gespeicherte Verträge ── */}
      {listeOffen && (
        <div className="kt-huelle" style={{ zIndex: 60 }} onClick={() => setListeOffen(false)}>
          <div onClick={(e) => e.stopPropagation()} className="card dm-fenster kt-fenster per-liste-fenster">
            <div className="per-fenster-kopf">
              <div className="per-fenster-titelzeile">
                <span className="per-fenster-ic"><Icon name="folder" size={18} /></span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h2>Gespeicherte Verträge <span className="anzahl">{contracts.length}</span></h2>
                  <div className="muted per-klein">Zuletzt geänderte zuerst. Nummer antippen kopiert sie.</div>
                </div>
                <button className="btn btn-icon" aria-label="Schließen" onClick={() => setListeOffen(false)}><Icon name="x" /></button>
              </div>
              <SearchInput value={listeSuche} onChange={setListeSuche} placeholder="Nummer, Name, Tätigkeit, Status…" style={{ width: "100%" }} />
            </div>
            <div className="per-liste">
              {listeGefiltert.length === 0 && (
                <div className="leer-zustand">
                  <span className="leer-icon"><Icon name={contracts.length ? "search" : "file-text"} size={28} /></span>
                  <div style={{ fontWeight: 600, color: "var(--fg)" }}>{contracts.length ? "Kein Treffer." : "Noch keine Verträge angelegt."}</div>
                  <div className="per-klein">
                    {contracts.length ? "Anderen Suchbegriff versuchen." : "Einen neuen Vertrag anlegen, ausfüllen und speichern – er erscheint dann hier."}
                  </div>
                  {!contracts.length && (
                    <button className="btn btn-primary" onClick={() => { neu(); setListeOffen(false); }}><Icon name="plus" /> Neuer Vertrag</button>
                  )}
                </div>
              )}
              {listeGefiltert.map((c) => {
                const ag = !!c.signEmployerImage, an = !!c.signEmployeeImage;
                const nr = vertragsNr(c.number);
                return (
                  <div key={c.id} className={`per-liste-karte${c.id === form.id ? " aktiv" : ""}`}>
                    <div className="per-liste-kopf">
                      {nr && (
                        <button type="button" className="btn per-nr-knopf klein nr-badge" title="Vertragsnummer kopieren" onClick={() => nrKopieren(nr)}>
                          <Icon name={copied === nr ? "check" : "copy"} size={13} /> {nr}
                        </button>
                      )}
                      <span className="per-liste-name">{c.title || c.employeeName || "Ohne Namen"}</span>
                      <StatusAbzeichen status={c.status} />
                    </div>
                    <div className="muted per-liste-meta">
                      {c.employeeName && <span><Icon name="user" size={13} /> {c.employeeName}</span>}
                      <span><Icon name="history" size={13} /> geändert {zeitpunkt(c.updatedAt)}</span>
                      <span className={`abzeichen${ag && an ? " gruen" : ag || an ? " gelb" : ""}`}>
                        <Icon name="pencil" size={11} /> {ag && an ? "von beiden unterschrieben" : ag ? "Arbeitgeber unterschrieben" : an ? "Arbeitnehmer unterschrieben" : "nicht unterschrieben"}
                      </span>
                    </div>
                    <div className="per-knopfreihe">
                      <button className="btn btn-primary" disabled={pdfBusy === c.id} onClick={() => pdfOeffnen(c)}>
                        <Icon name="eye" /> {pdfBusy === c.id ? "Erstellt…" : "PDF ansehen"}
                      </button>
                      <button className="btn" onClick={() => { laden(c.id); setListeOffen(false); }}>
                        <Icon name="pencil" /> Bearbeiten
                      </button>
                      {(!ag || !an) && (
                        <button className="btn" onClick={() => setUnterschrift({ vertrag: c, rolle: !ag ? "arbeitgeber" : "arbeitnehmer" })}>
                          <Icon name="check" /> Unterschreiben ({!ag ? "Arbeitgeber" : "Arbeitnehmer"})
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="kt-fuss">
              <button className="btn" onClick={() => setListeOffen(false)} style={{ marginRight: "auto" }}><Icon name="x" /> Schließen</button>
              <button className="btn btn-primary" onClick={() => { neu(); setListeOffen(false); }}><Icon name="plus" /> Neuer Vertrag</button>
            </div>
          </div>
        </div>
      )}

      {unterschrift && (
        <UnterschriftDialog
          titel={`Vertrag unterschreiben – ${unterschrift.rolle === "arbeitgeber" ? "Arbeitgeber" : "Arbeitnehmer"}`}
          untertitel={`${vertragsNr(unterschrift.vertrag.number)} · ${unterschrift.vertrag.title || unterschrift.vertrag.employeeName || ""}`}
          rolle={unterschrift.rolle === "arbeitgeber" ? "Arbeitgeber" : "Arbeitnehmer"}
          nameVorschlag={unterschrift.rolle === "arbeitgeber" ? ARBEITGEBER.inhaber.replace(/^Inh\.\s*/, "") : unterschrift.vertrag.employeeName}
          bestaetigung={unterschrift.rolle === "arbeitnehmer"
            ? "Ich habe den Arbeitsvertrag vollständig gelesen und bin mit seinem Inhalt einverstanden."
            : `Ich unterschreibe für ${ARBEITGEBER.name} und bin dazu berechtigt.`}
          onPdf={() => pdfOeffnen(unterschrift.vertrag)}
          onSpeichern={unterschreiben}
          onClose={() => setUnterschrift(null)}
        />
      )}

      {pdf && (
        <PdfViewerModal url={pdf.url} titel={pdf.titel} dateiname={pdf.dateiname}
          onClose={() => { URL.revokeObjectURL(pdf.url); setPdf(null); }} />
      )}

      <ConfirmDialog
        open={zuruecksetzen}
        title="Unterschriften zurücksetzen?"
        message="Beide Unterschriften werden entfernt und der Vertrag kann wieder bearbeitet werden. Danach muss neu unterschrieben werden. (Im Verlauf nachvollziehbar.)"
        onConfirm={unterschriftenZuruecksetzen}
        onCancel={() => setZuruecksetzen(false)}
      />

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

// ── Bausteine der Oberfläche ──

const STATUS: Record<string, { text: string; klasse: string; icon: string }> = {
  entwurf: { text: "Entwurf", klasse: "gelb", icon: "pencil" },
  aktiv: { text: "Aktiv", klasse: "gruen", icon: "check" },
  beendet: { text: "Beendet", klasse: "", icon: "archive" },
};

/** Vertragsstatus als farbige Pille */
function StatusAbzeichen({ status }: { status?: string | null }) {
  const s = STATUS[status || "entwurf"] || { text: status || "Entwurf", klasse: "", icon: "tag" };
  return <span className={`abzeichen ${s.klasse}`}><Icon name={s.icon} size={11} /> {s.text}</span>;
}

/** Abschnitt des Formulars: Karte mit Symbol, Titel und kurzer Erklärung */
function Abschnitt({ icon, titel, hinweis, rechts, children }: {
  icon: string; titel: string; hinweis?: string; rechts?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <section className="card per-abschnitt">
      <div className="per-abschnitt-kopf">
        <span className="per-abschnitt-ic"><Icon name={icon} size={16} /></span>
        <div className="per-abschnitt-titel">
          <h3>{titel}</h3>
          {hinweis && <p>{hinweis}</p>}
        </div>
        {rechts}
      </div>
      <div className="per-abschnitt-inhalt">{children}</div>
    </section>
  );
}

/** Beschriftete Gruppe ohne <label> – für Segment-Umschalter (Knöpfe würden sonst per Label-Klick ausgelöst) */
function Gruppe({ label, icon, children }: { label: string; icon?: string; children: React.ReactNode }) {
  return (
    <div className="per-feld" role="group" aria-label={label}>
      <span className="muted per-feld-label">{icon && <Icon name={icon} size={14} />} {label}</span>
      {children}
    </div>
  );
}

/** Segment-Umschalter (eine Auswahl aus wenigen Möglichkeiten) */
function Segment({ wert, optionen, onChange }: { wert: string; optionen: [string, string][]; onChange: (v: string) => void }) {
  return (
    <div className="kt-segment per-segment" role="tablist">
      {optionen.map(([w, text]) => (
        <button key={w} type="button" role="tab" aria-selected={wert === w} className={wert === w ? "an" : ""} onClick={() => onChange(w)}>
          {text}
        </button>
      ))}
    </div>
  );
}

/** Schiebeschalter statt Checkbox */
function Schalter({ an, onChange, children }: { an: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <button type="button" role="switch" aria-checked={an} className={`kt-schalter per-schalter${an ? " an" : ""}`} onClick={() => onChange(!an)}>
      <i /> <span>{children}</span>
    </button>
  );
}

function Feld({ label, icon, children }: { label: string; icon?: string; children: React.ReactNode }) {
  return (
    <label className="per-feld">
      <span className="muted per-feld-label">{icon && <Icon name={icon} size={14} />} {label}</span>
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
      <div className="vv-toolbar per-zoomleiste" style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, position: "relative", zIndex: 1, background: "var(--bg)" }}>
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
