"use client";
// ── PDF-Erzeugung für Arbeitsverträge (jsPDF, clientseitig) ──
// Gleiches Vorgehen wie in kontor: echtes Vektor-PDF, Text bleibt auswählbar/durchsuchbar,
// keine Server-Abhängigkeit (kein Chrome nötig). Die Klauseltexte kommen aus derselben
// Quelle wie die Bildschirm-Vorschau (buildSections in components/VertragDokument.tsx).
import { ARBEITGEBER, buildSections, fmtDate, fmtMoney, txt, vertragsNr, type Contract, type Seg } from "@/components/VertragDokument";

// A4 in mm
const PAGE_W = 210;
const PAGE_H = 297;
const MX = 20;            // Seitenrand links/rechts
const TOP = 14;           // Seitenrand oben
const FOOT_Y = PAGE_H - 13; // Grundlinie der ersten Fußzeilen-Zeile
const BODY_BOTTOM = FOOT_Y - 11;
const CONTENT_W = PAGE_W - MX * 2;
const SIZE = 9.3;         // Fließtext
const LH = 4.5;           // Zeilenhöhe Fließtext
const GAP = 2.6;          // Abstand zwischen Absätzen
const NUM_W = 6;          // Spaltenbreite für "1."
const BLAU = [0, 71, 179] as const;

// Ein Wort kann aus mehreren Teilen bestehen – z. B. „01.08.2026." mit fettem Datum und
// normalem Satzpunkt. Deshalb wird NICHT je Segment in Wörter zerlegt, sondern über die
// Segmentgrenzen hinweg; sonst entstünde ein Leerzeichen vor dem Satzzeichen.
type Teil = { t: string; b: boolean };
type Wort = { teile: Teil[] };
type Zeile = { woerter: Wort[]; breite: number };

/** Zerlegt Segmente in Wörter mit Fett-Kennzeichnung (Zeilenumbrüche trennen Blöcke). */
function zuWoertern(segs: Seg[]): Wort[][] {
  const bloecke: Wort[][] = [[]];
  let akt: Teil[] = [];
  const wortAbschliessen = () => {
    if (akt.length) { bloecke[bloecke.length - 1].push({ teile: akt }); akt = []; }
  };
  for (const s of segs) {
    const b = !!s.b;
    // an Whitespace und Zeilenumbrüchen trennen, Trenner behalten
    for (const stueck of String(s.t).split(/(\s)/)) {
      if (stueck === "") continue;
      if (stueck === "\n") { wortAbschliessen(); bloecke.push([]); continue; }
      if (/^\s$/.test(stueck)) { wortAbschliessen(); continue; }
      akt.push({ t: stueck, b });
    }
  }
  wortAbschliessen();
  return bloecke.filter((b) => b.length > 0);
}

/** Bricht Wörter auf die verfügbare Breite um (Fett-Breiten korrekt berücksichtigt). */
function umbrechen(doc: any, woerter: Wort[], breite: number, size: number): Zeile[] {
  doc.setFontSize(size);
  const zeilen: Zeile[] = [];
  let akt: Wort[] = [];
  let aktBreite = 0;
  const wortBreite = (w: Wort) =>
    w.teile.reduce((sum, t) => {
      doc.setFont("helvetica", t.b ? "bold" : "normal");
      return sum + doc.getTextWidth(t.t);
    }, 0);
  doc.setFont("helvetica", "normal");
  const sp = doc.getTextWidth(" ");
  for (const w of woerter) {
    const bw = wortBreite(w);
    const neu = akt.length === 0 ? bw : aktBreite + sp + bw;
    if (akt.length > 0 && neu > breite) {
      zeilen.push({ woerter: akt, breite: aktBreite });
      akt = [w];
      aktBreite = bw;
    } else {
      akt.push(w);
      aktBreite = neu;
    }
  }
  if (akt.length) zeilen.push({ woerter: akt, breite: aktBreite });
  return zeilen;
}

/** Zeichnet eine Zeile; im Blocksatz wird der Wortabstand gestreckt (außer letzte Zeile). */
function zeileZeichnen(doc: any, z: Zeile, x: number, y: number, breite: number, size: number, blocksatz: boolean) {
  doc.setFontSize(size);
  doc.setFont("helvetica", "normal");
  const sp = doc.getTextWidth(" ");
  const luecken = z.woerter.length - 1;
  const extra = blocksatz && luecken > 0 ? Math.max(0, (breite - z.breite) / luecken) : 0;
  // Extrem gestreckte Zeilen (z. B. ein einzelnes langes Wort) sehen schlechter aus als
  // linksbündige – deshalb Streckung begrenzen.
  const zusatz = extra > sp * 2.2 ? 0 : extra;
  let cx = x;
  z.woerter.forEach((w, i) => {
    w.teile.forEach((t) => {
      doc.setFont("helvetica", t.b ? "bold" : "normal");
      doc.text(t.t, cx, y);
      cx += doc.getTextWidth(t.t);
    });
    if (i < luecken) cx += sp + zusatz;
  });
}

/** Logo (SVG) über ein Canvas in ein PNG wandeln – jsPDF kann kein SVG einbetten. */
async function logoPng(url: string, breitePx: number): Promise<{ data: string; ratio: number } | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const ratio = (img.naturalWidth || 200) / (img.naturalHeight || 100);
        const c = document.createElement("canvas");
        c.width = breitePx;
        c.height = Math.round(breitePx / ratio);
        const ctx = c.getContext("2d");
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        resolve({ data: c.toDataURL("image/png"), ratio });
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

export async function generateVertragPdf(form: Contract): Promise<Blob> {
  const { default: jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const befristet = form.contractType === "befristet";
  const nr = vertragsNr(form.number);
  const docRef = `Arbeitsvertrag${nr ? ` ${nr}` : ""} · ${txt(form.employeeName, "—")}`;
  // PNG bevorzugt: SVG über ein Canvas zu rastern klappt nicht in jedem Browser
  // zuverlässig; die PNG-Fassung liegt als Fallback-freier Weg in /public.
  const logo = (await logoPng("/baier-logo.png", 520)) || (await logoPng("/baier-logo.svg", 420));
  // Nexus-App-Symbol (blaue Kachel, weißes Zeichen) für die Fußzeile
  const nexusMark = await logoPng("/nexus-badge.png", 256);

  let y = 0;
  let seite = 1;

  // ── Kopf der ersten Seite (Briefkopf + Titel) ──
  function kopfErsteSeite() {
    let ky = TOP;
    if (logo) {
      // Höhe vorgeben (entspricht den 48 px der Bildschirm-Vorschau), Breite folgt dem Seitenverhältnis
      const h = 12.7, w = h * logo.ratio;
      try { doc.addImage(logo.data, "PNG", MX, ky, w, h); } catch { /* ohne Logo weiter */ }
      doc.setFont("helvetica", "bold"); doc.setFontSize(14); doc.setTextColor(BLAU[0], BLAU[1], BLAU[2]);
      doc.text(ARBEITGEBER.name, MX + w + 5, ky + 6);
      doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(70);
      doc.text(ARBEITGEBER.inhaber, MX + w + 5, ky + 10.5);
      ky += Math.max(h, 13);
    } else {
      doc.setFont("helvetica", "bold"); doc.setFontSize(14); doc.setTextColor(BLAU[0], BLAU[1], BLAU[2]);
      doc.text(ARBEITGEBER.name, MX, ky + 6);
      ky += 13;
    }
    // Anschrift rechts
    doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(85);
    [ARBEITGEBER.strasse, ARBEITGEBER.ort, ARBEITGEBER.tel, ARBEITGEBER.email].forEach((t, i) => {
      doc.text(t, PAGE_W - MX, TOP + 3 + i * 3.4, { align: "right" });
    });

    const linieY = Math.max(ky + 3, TOP + 17);
    doc.setDrawColor(BLAU[0], BLAU[1], BLAU[2]); doc.setLineWidth(0.6);
    doc.line(MX, linieY, PAGE_W - MX, linieY);

    doc.setFont("helvetica", "bold"); doc.setFontSize(17); doc.setTextColor(0);
    doc.text("Arbeitsvertrag", PAGE_W / 2, linieY + 12, { align: "center" });
    let ty = linieY + 12;
    if (nr) {
      doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(BLAU[0], BLAU[1], BLAU[2]);
      doc.text(`Vertragsnummer ${nr}`, PAGE_W / 2, ty + 5.5, { align: "center" });
      ty += 5.5;
    }
    doc.setFont("helvetica", "italic"); doc.setFontSize(7.5); doc.setTextColor(110);
    doc.text('Die Bezeichnungen „Arbeitnehmer" / „Arbeitgeber" gelten für Beschäftigte jeglichen Geschlechts.',
      PAGE_W / 2, ty + 5, { align: "center" });
    doc.setTextColor(20);
    y = ty + 12;
  }

  // ── Laufende Kopfzeile ab Seite 2 ──
  function kopfFolgeseite() {
    doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.setTextColor(100);
    doc.text(`Arbeitsvertrag${nr ? ` ${nr}` : ""}`, MX, TOP + 2);
    doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(70);
    doc.text(ARBEITGEBER.name, PAGE_W - MX, TOP + 2, { align: "right" });
    doc.setDrawColor(200); doc.setLineWidth(0.2);
    doc.line(MX, TOP + 4, PAGE_W - MX, TOP + 4);
    doc.setTextColor(20);
    y = TOP + 11;
  }

  function neueSeite() {
    doc.addPage();
    seite++;
    kopfFolgeseite();
  }

  /** Platz prüfen und ggf. umbrechen. */
  function platz(hoehe: number) {
    if (y + hoehe > BODY_BOTTOM) neueSeite();
  }

  kopfErsteSeite();

  // ── Vertragsparteien ──
  {
    const zeilenHoehe = LH;
    doc.setFont("helvetica", "normal"); doc.setFontSize(SIZE); doc.setTextColor(20);
    doc.text("Zwischen", MX, y); y += zeilenHoehe;

    const agZeile = `${ARBEITGEBER.name}, ${ARBEITGEBER.inhaber}, ${ARBEITGEBER.strasse}, ${ARBEITGEBER.ort}`;
    const agSegs: Seg[] = [{ t: ARBEITGEBER.name, b: true }, { t: `, ${ARBEITGEBER.inhaber}, ${ARBEITGEBER.strasse}, ${ARBEITGEBER.ort}` }];
    void agZeile;
    umbrechen(doc, zuWoertern(agSegs).flat(), CONTENT_W - 8, SIZE).forEach((z) => {
      zeileZeichnen(doc, z, MX + 8, y, CONTENT_W - 8, SIZE, false); y += zeilenHoehe;
    });
    doc.setFont("helvetica", "italic"); doc.setFontSize(SIZE); doc.setTextColor(70);
    doc.text('– nachfolgend „Arbeitgeber" –', MX + 8, y); y += zeilenHoehe + 1.5;

    doc.setFont("helvetica", "normal"); doc.setTextColor(20);
    doc.text("und", MX, y); y += zeilenHoehe;

    const anTeile: Seg[] = [{ t: txt(form.employeeName), b: true }];
    if (form.employeeAddress) anTeile.push({ t: ", " + String(form.employeeAddress).split(/\n/).join(", ") });
    if (form.employeeBirth) { anTeile.push({ t: ", geboren am " }); anTeile.push({ t: String(form.employeeBirth), b: true }); }
    umbrechen(doc, zuWoertern(anTeile).flat(), CONTENT_W - 8, SIZE).forEach((z) => {
      zeileZeichnen(doc, z, MX + 8, y, CONTENT_W - 8, SIZE, false); y += zeilenHoehe;
    });
    doc.setFont("helvetica", "italic"); doc.setTextColor(70);
    doc.text('– nachfolgend „Arbeitnehmer" –', MX + 8, y); y += zeilenHoehe + 1.5;

    doc.setFont("helvetica", "normal"); doc.setTextColor(20);
    doc.text(`wird folgender ${befristet ? "befristeter" : "unbefristeter"} Arbeitsvertrag geschlossen:`, MX, y);
    y += zeilenHoehe + 2;
  }

  // ── Paragraphen ──
  const sections = buildSections(form, befristet);
  sections.forEach((s, si) => {
    // Überschrift nicht allein am Seitenende stehen lassen: Höhe von Überschrift +
    // erstem Absatz vorab prüfen.
    const ueberschrift = `§ ${si + 1} ${s.t}`;
    const erstBreite = CONTENT_W - (s.items.length > 1 ? NUM_W : 0) - 4;
    const erstZeilen = s.items.length ? umbrechen(doc, zuWoertern(s.items[0].segs).flat(), erstBreite, SIZE).length : 0;
    platz(6.5 + erstZeilen * LH);

    doc.setFont("helvetica", "bold"); doc.setFontSize(10.5); doc.setTextColor(0);
    doc.text(ueberschrift, MX, y);
    y += 5.6;

    s.items.forEach((item, ii) => {
      const nummeriert = s.items.length > 1;
      const xText = MX + (nummeriert ? NUM_W : 4);
      const breite = PAGE_W - MX - xText;
      const bloecke = zuWoertern(item.segs);

      let ersteZeileDerNummer = true;
      bloecke.forEach((block) => {
        const zeilen = umbrechen(doc, block, breite, SIZE);
        zeilen.forEach((z, zi) => {
          platz(LH);
          if (nummeriert && ersteZeileDerNummer) {
            doc.setFont("helvetica", "normal"); doc.setFontSize(SIZE); doc.setTextColor(20);
            doc.text(`${ii + 1}.`, MX, y);
            ersteZeileDerNummer = false;
          }
          doc.setTextColor(20);
          const letzte = zi === zeilen.length - 1;
          zeileZeichnen(doc, z, xText, y, breite, SIZE, !letzte);
          y += LH;
        });
      });

      // Aufzählung (bezahlte Freistellung): Grund links, Dauer rechts
      if (item.list) {
        y += 1;
        item.list.forEach(([grund, tage]) => {
          platz(LH);
          doc.setFont("helvetica", "normal"); doc.setFontSize(SIZE); doc.setTextColor(20);
          doc.text("• " + grund, xText + 3, y);
          doc.setFont("helvetica", "bold");
          doc.text(tage, PAGE_W - MX, y, { align: "right" });
          y += LH;
        });
      }
      y += GAP;
    });
    y += 1.5;
  });

  // ── Unterschriften ──
  platz(34);
  y += 6;
  doc.setFont("helvetica", "normal"); doc.setFontSize(SIZE); doc.setTextColor(20);
  doc.text(`${txt(form.signCity, "________")}, den ${fmtDate(form.signDate)}`, MX, y);
  y += 18;
  const spaltenW = (CONTENT_W - 16) / 2;
  [["Arbeitgeber", ARBEITGEBER.name], ["Arbeitnehmer", txt(form.employeeName, "")]].forEach(([rolle, name], i) => {
    const x = MX + i * (spaltenW + 16);
    doc.setDrawColor(30); doc.setLineWidth(0.4);
    doc.line(x, y, x + spaltenW, y);
    doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.setTextColor(20);
    doc.text(rolle, x, y + 4);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(90);
    doc.text(name, x, y + 8);
  });

  // ── Fußzeilen auf allen Seiten (erst am Ende, wenn die Gesamtzahl feststeht) ──
  const gesamt = doc.getNumberOfPages();
  for (let p = 1; p <= gesamt; p++) {
    doc.setPage(p);
    doc.setDrawColor(215); doc.setLineWidth(0.2);
    doc.line(MX, FOOT_Y - 6, PAGE_W - MX, FOOT_Y - 6);
    doc.setFont("helvetica", "normal"); doc.setFontSize(7.2); doc.setTextColor(140);
    doc.text(docRef, MX, FOOT_Y);
    doc.text(`Seite ${p} von ${gesamt}`, PAGE_W - MX, FOOT_Y, { align: "right" });

    // Mittig: App-Symbol (blaue Kachel) + zweizeilig „erstellt mit" / „Nexus"
    const zeile1 = "erstellt mit";
    const zeile2 = "Nexus";
    doc.setFont("helvetica", "normal"); doc.setFontSize(6.8);
    const breite1 = doc.getTextWidth(zeile1);
    doc.setFont("helvetica", "bold"); doc.setFontSize(8.4);
    const breite2 = doc.getTextWidth(zeile2);
    const textB = Math.max(breite1, breite2);
    const markW = nexusMark ? 6.4 : 0;
    const abstand = markW ? 2 : 0;
    let hx = PAGE_W / 2 - (markW + abstand + textB) / 2;
    if (nexusMark) {
      try { doc.addImage(nexusMark.data, "PNG", hx, FOOT_Y - 4.6, markW, markW / nexusMark.ratio); } catch { /* ohne Symbol weiter */ }
      hx += markW + abstand;
    }
    doc.setFont("helvetica", "normal"); doc.setFontSize(6.8); doc.setTextColor(150);
    doc.text(zeile1, hx, FOOT_Y - 2.2);
    doc.setFont("helvetica", "bold"); doc.setFontSize(8.4); doc.setTextColor(BLAU[0], BLAU[1], BLAU[2]);
    doc.text(zeile2, hx, FOOT_Y + 1.6);
  }

  return doc.output("blob");
}

/** Dateiname für Download/Anzeige, z. B. "Arbeitsvertrag_AV-0001_Max_Mustermann.pdf". */
export function vertragDateiname(form: Contract) {
  const nr = vertragsNr(form.number);
  const name = String(form.employeeName || "").trim().replace(/[^\wäöüÄÖÜß -]/g, "").replace(/\s+/g, "_");
  return ["Arbeitsvertrag", nr, name].filter(Boolean).join("_") + ".pdf";
}

/** Blob als Datei herunterladen (gleiches Muster wie in kontor). */
export function downloadBlob(blob: Blob, dateiname: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = dateiname;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

// fmtMoney wird über buildSections indirekt genutzt – Re-Export für mögliche spätere Nutzung.
export { fmtMoney };
