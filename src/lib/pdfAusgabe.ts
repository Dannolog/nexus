"use client";
import { PDFDocument } from "pdf-lib";

/**
 * Ausgabe von PDFs: ganz oder nur ausgewählte Seiten herunterladen, „Speichern unter"
 * und Drucken. Läuft komplett im Browser (pdf-lib zum Herauslösen der Seiten,
 * pdf.js zum Rendern fürs Drucken) – der Server liefert nur das Original.
 */

// pdf.js v4 nutzt Promise.withResolvers – in älteren Browsern nachrüsten
function polyfill() {
  const P = Promise as any;
  if (typeof P.withResolvers !== "function") {
    P.withResolvers = function () {
      let resolve: any, reject: any;
      const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
      return { promise, resolve, reject };
    };
  }
}

export async function ladePdfJs() {
  polyfill();
  const pdfjs: any = await import("pdfjs-dist");
  try { pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs"; } catch { /* schon gesetzt */ }
  return pdfjs;
}

/** „1-3, 5, 8-" → [0,1,2,4,7,8,…] (0-basiert, sortiert, ohne Doppelte). Ungültiges → null. */
export function parseSeiten(text: string, anzahl: number): number[] | null {
  const t = text.replace(/\s+/g, "");
  if (!t) return [];
  const menge = new Set<number>();
  for (const teil of t.split(/[,;]/)) {
    if (!teil) continue;
    const m = teil.match(/^(\d*)[-–](\d*)$/);
    let von: number, bis: number;
    if (m) {
      von = m[1] ? parseInt(m[1], 10) : 1;
      bis = m[2] ? parseInt(m[2], 10) : anzahl;
    } else if (/^\d+$/.test(teil)) {
      von = bis = parseInt(teil, 10);
    } else return null;
    if (von < 1 || bis > anzahl || von > bis) return null;
    for (let i = von; i <= bis; i++) menge.add(i - 1);
  }
  return Array.from(menge).sort((a, b) => a - b);
}

/** [0,1,2,4] → „1-3, 5" */
export function seitenText(seiten: number[]): string {
  const s = [...seiten].sort((a, b) => a - b);
  const teile: string[] = [];
  for (let i = 0; i < s.length; i++) {
    const start = s[i];
    while (i + 1 < s.length && s[i + 1] === s[i] + 1) i++;
    teile.push(start === s[i] ? String(start + 1) : `${start + 1}-${s[i] + 1}`);
  }
  return teile.join(", ");
}

/** Neues PDF nur mit den gewählten Seiten (Reihenfolge wie im Original). */
export async function seitenAuswaehlen(bytes: ArrayBuffer, seiten: number[]): Promise<Blob> {
  const quelle = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const ziel = await PDFDocument.create();
  const kopien = await ziel.copyPages(quelle, seiten);
  kopien.forEach((p) => ziel.addPage(p));
  const out = await ziel.save();
  return new Blob([out as BlobPart], { type: "application/pdf" });
}

/** Dateiname mit Seitenangabe, z. B. „Scan.pdf" → „Scan_S1-3.pdf". */
export function nameMitSeiten(name: string, seiten: number[], anzahl: number) {
  const basis = name.replace(/\.pdf$/i, "");
  if (!seiten.length || seiten.length === anzahl) return `${basis}.pdf`;
  return `${basis}_S${seitenText(seiten).replace(/\s+/g, "").replace(/,/g, "_")}.pdf`;
}

export function speichereBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/**
 * „Speichern unter": Wo der Browser es kann (Chrome/Edge am Rechner), öffnet sich der
 * Dateidialog mit Ordner- und Namenswahl. Sonst normaler Download unter dem gewählten Namen –
 * dann entscheidet die Browser-Einstellung, ob nach dem Speicherort gefragt wird.
 * Rückgabe: "dialog" | "download" | "abgebrochen".
 */
export async function speichernUnter(blob: Blob, name: string): Promise<"dialog" | "download" | "abgebrochen"> {
  const w = window as any;
  if (typeof w.showSaveFilePicker === "function" && window.self === window.top) {
    try {
      const handle = await w.showSaveFilePicker({
        suggestedName: name,
        types: [{ description: "PDF-Dokument", accept: { "application/pdf": [".pdf"] } }],
      });
      const stream = await handle.createWritable();
      await stream.write(blob);
      await stream.close();
      return "dialog";
    } catch (e: any) {
      if (e?.name === "AbortError") return "abgebrochen";
      // Sicherheitsfehler o. Ä. → auf normalen Download ausweichen
    }
  }
  speichereBlob(blob, name);
  return "download";
}

/**
 * Drucken: Die Seiten werden mit pdf.js in Bilder gerendert und in einen eigenen
 * Druckbereich gelegt; alles andere blendet @media print aus. Das funktioniert in jedem
 * Browser (auch iOS/Android), unabhängig davon, ob der Browser PDFs selbst anzeigen kann.
 */
export async function druckeSeiten(bytes: ArrayBuffer, seiten: number[], fortschritt?: (n: number, von: number) => void) {
  const pdfjs = await ladePdfJs();
  const doc = await pdfjs.getDocument({ data: bytes.slice(0) }).promise;
  const bilder: { url: string; quer: boolean }[] = [];
  try {
    for (let i = 0; i < seiten.length; i++) {
      fortschritt?.(i, seiten.length);
      const page = await doc.getPage(seiten[i] + 1);
      const basis = page.getViewport({ scale: 1 });
      // ca. 200 dpi (1 pt = 1/72 Zoll), begrenzt, damit große Formate den Speicher nicht sprengen
      const scale = Math.min(200 / 72, 5000 / Math.max(basis.width, basis.height));
      const vp = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.floor(vp.width);
      canvas.height = Math.floor(vp.height);
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      const blob: Blob = await new Promise((res, rej) =>
        canvas.toBlob((b) => (b ? res(b) : rej(new Error("Seite konnte nicht gerendert werden"))), "image/jpeg", 0.92));
      bilder.push({ url: URL.createObjectURL(blob), quer: basis.width > basis.height });
      canvas.width = canvas.height = 0;
    }
    fortschritt?.(seiten.length, seiten.length);
  } finally {
    doc.destroy?.();
  }

  const alt = document.getElementById("nexus-druck");
  alt?.remove();
  const bereich = document.createElement("div");
  bereich.id = "nexus-druck";
  const stil = document.createElement("style");
  stil.textContent = `
    #nexus-druck { display: none; }
    @media print {
      @page { margin: 0; }
      html, body { background: #fff !important; height: auto !important; overflow: visible !important; }
      body > *:not(#nexus-druck) { display: none !important; }
      #nexus-druck { display: block !important; }
      #nexus-druck .seite { width: 100vw; height: 100vh; display: flex; align-items: center; justify-content: center;
        break-after: page; page-break-after: always; overflow: hidden; }
      #nexus-druck .seite:last-child { break-after: auto; page-break-after: auto; }
      #nexus-druck img { max-width: 100%; max-height: 100%; object-fit: contain; }
    }`;
  bereich.appendChild(stil);
  await Promise.all(bilder.map((b) => new Promise<void>((res) => {
    const div = document.createElement("div");
    div.className = "seite";
    const img = new Image();
    img.onload = () => res();
    img.onerror = () => res();
    img.src = b.url;
    div.appendChild(img);
    bereich.appendChild(div);
  })));
  document.body.appendChild(bereich);

  let aufgeraeumt = false;
  const aufraeumen = () => {
    if (aufgeraeumt) return;
    aufgeraeumt = true;
    window.removeEventListener("afterprint", aufraeumen);
    bereich.remove();
    bilder.forEach((b) => URL.revokeObjectURL(b.url));
  };
  window.addEventListener("afterprint", aufraeumen);
  // Kurz warten, damit der Browser das Layout mit den Bildern fertig hat
  await new Promise((r) => setTimeout(r, 150));
  window.print();
  // Manche Mobil-Browser feuern kein afterprint – spätestens nach einer Minute aufräumen
  setTimeout(aufraeumen, 60000);
}

/**
 * Liefert das Dokument als PDF-Bytes. Bilder (z. B. vom Handy fotografierte Belege im
 * Posteingang) werden zu einem einseitigen PDF; andere Dateitypen → null.
 */
export async function alsPdfBytes(blob: Blob): Promise<ArrayBuffer | null> {
  const buf = await blob.arrayBuffer();
  const kopf = new Uint8Array(buf.slice(0, 1024));
  const text = String.fromCharCode(...Array.from(kopf));
  if (text.includes("%PDF")) return buf;

  const istJpg = kopf[0] === 0xff && kopf[1] === 0xd8;
  const istPng = kopf[0] === 0x89 && kopf[1] === 0x50 && kopf[2] === 0x4e && kopf[3] === 0x47;
  if (!istJpg && !istPng && !blob.type.startsWith("image/")) return null;

  const doc = await PDFDocument.create();
  let bild;
  if (istJpg) bild = await doc.embedJpg(buf);
  else if (istPng) bild = await doc.embedPng(buf);
  else {
    // Andere Bildformate (WebP, HEIC wo unterstützt …) über ein Canvas nach JPEG wandeln
    const bmp = await createImageBitmap(blob);
    const c = document.createElement("canvas");
    c.width = bmp.width; c.height = bmp.height;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(bmp, 0, 0);
    const jpg: Blob = await new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("Bild konnte nicht umgewandelt werden"))), "image/jpeg", 0.92));
    bild = await doc.embedJpg(await jpg.arrayBuffer());
  }
  // Auf A4 einpassen (Hoch- oder Querformat je nach Bild), 10 mm Rand
  const quer = bild.width > bild.height;
  const [bw, bh] = quer ? [841.89, 595.28] : [595.28, 841.89];
  const rand = 28.35;
  const f = Math.min((bw - 2 * rand) / bild.width, (bh - 2 * rand) / bild.height);
  const w = bild.width * f, h = bild.height * f;
  const seite = doc.addPage([bw, bh]);
  seite.drawImage(bild, { x: (bw - w) / 2, y: (bh - h) / 2, width: w, height: h });
  const out = await doc.save();
  return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer;
}
