import https from "https";
import { PDFDocument } from "pdf-lib";

/**
 * Treiberloses Netzwerk-Scannen über **eSCL/AirScan** – direkt per HTTPS, ohne SANE oder
 * Systemwerkzeuge. Übernommen aus ProjectEye (`server/scanner.js`), das damit u. a. den
 * HP Color LaserJet Pro MFP 4302 bedient; hier nach TypeScript übertragen und um das
 * Zusammenfassen der Seiten zu einem PDF ergänzt.
 *
 * Ablauf: `POST /eSCL/ScanJobs` (Einstellungen als XML) → 201 + Location;
 * dann `GET <job>/NextDocument` abfragen – 503/409 = beschäftigt (warten),
 * 200 = JPEG-Seite, 404/410 = fertig.
 */

const ESCL_NS =
  'xmlns:pwg="http://www.pwg.org/schemas/2010/12/sm" xmlns:scan="http://schemas.hp.com/imaging/escl/2011/05/03"';

const warte = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type ScanOptionen = {
  source?: "Platen" | "Feeder";      // Flachbett oder Einzug
  colorMode?: "RGB24" | "Grayscale8";
  resolution?: number;
  duplex?: boolean;
};

type Antwort = { status: number; headers: Record<string, any>; body: Buffer };

/** Ein HTTPS-Request an den Scanner (selbstsigniertes Zertifikat → nicht prüfen). */
function anfrage(
  host: string,
  { method = "GET", path, body, headers = {}, timeout = 70000 }:
    { method?: string; path: string; body?: string; headers?: Record<string, string>; timeout?: number }
): Promise<Antwort> {
  return new Promise((resolve, reject) => {
    const r = https.request(
      { host, port: 443, path, method, rejectUnauthorized: false, timeout, headers },
      (res) => {
        const teile: Buffer[] = [];
        res.on("data", (c) => teile.push(c as Buffer));
        res.on("end", () => resolve({ status: res.statusCode || 0, headers: res.headers as any, body: Buffer.concat(teile) }));
      }
    );
    r.on("error", reject);
    r.on("timeout", () => r.destroy(new Error("Zeitüberschreitung")));
    if (body) r.write(body);
    r.end();
  });
}

export type Faehigkeiten = { model: string; sources: string[]; resolutions: number[]; duplex: boolean };

/** Fähigkeiten abfragen: Modell, Quellen (Flachbett/Einzug), Auflösungen, Duplex. */
export async function faehigkeiten(host: string): Promise<Faehigkeiten> {
  const r = await anfrage(host, { path: "/eSCL/ScannerCapabilities", timeout: 12000 });
  if (r.status !== 200) throw new Error(`Scanner nicht erreichbar (HTTP ${r.status})`);
  const xml = r.body.toString("utf8");
  const model = (xml.match(/<pwg:MakeAndModel>([^<]*)</) || [])[1] || "Scanner";
  const sources: string[] = [];
  if (/<scan:Platen>/.test(xml)) sources.push("Platen");
  if (/<scan:Adf>/.test(xml) || /<scan:Feeder>/.test(xml)) sources.push("Feeder");
  if (!sources.length) sources.push("Platen");
  const resolutions = [...new Set([...xml.matchAll(/<scan:XResolution>(\d+)</g)].map((m) => +m[1]))].sort((a, b) => a - b);
  const duplex = /<scan:Duplex>true<\/scan:Duplex>/i.test(xml) || /Duplex/.test(xml);
  return { model, sources, resolutions: resolutions.length ? resolutions : [150, 200, 300], duplex };
}

function einstellungenXml({ source = "Platen", colorMode = "RGB24", resolution = 200, duplex = false }: ScanOptionen = {}) {
  const dup = source === "Feeder" && duplex ? "\n  <scan:Duplex>true</scan:Duplex>" : "";
  return `<?xml version="1.0" encoding="UTF-8"?>
<scan:ScanSettings ${ESCL_NS}>
  <pwg:Version>2.9</pwg:Version>
  <pwg:ScanRegions>
    <pwg:ScanRegion>
      <pwg:Height>3508</pwg:Height>
      <pwg:Width>2480</pwg:Width>
      <pwg:XOffset>0</pwg:XOffset>
      <pwg:YOffset>0</pwg:YOffset>
    </pwg:ScanRegion>
  </pwg:ScanRegions>
  <pwg:InputSource>${source}</pwg:InputSource>${dup}
  <scan:ColorMode>${colorMode}</scan:ColorMode>
  <scan:XResolution>${resolution}</scan:XResolution>
  <scan:YResolution>${resolution}</scan:YResolution>
  <pwg:DocumentFormat>image/jpeg</pwg:DocumentFormat>
</scan:ScanSettings>`;
}

/**
 * Scannt eine Vorlage. Flachbett = eine Seite, Einzug = alle eingelegten Seiten.
 * Ergebnis: ein JPEG je Seite.
 */
export async function scanne(host: string, opts: ScanOptionen = {}): Promise<Buffer[]> {
  const post = await anfrage(host, {
    method: "POST", path: "/eSCL/ScanJobs", body: einstellungenXml(opts),
    headers: { "Content-Type": "text/xml" }, timeout: 20000,
  });
  if (post.status !== 201) throw new Error(`Scan-Auftrag abgelehnt (HTTP ${post.status}). Ist der Scanner frei?`);
  const loc = post.headers.location;
  if (!loc) throw new Error("Keine Job-Adresse vom Scanner erhalten.");
  const jobPfad = String(loc).replace(/^https?:\/\/[^/]+/, "");

  const seiten: Buffer[] = [];
  const MAX_SEITEN = 100;
  for (let p = 0; p < MAX_SEITEN; p++) {
    let fertig = false;
    let seite: Buffer | null = null;
    for (let versuch = 0; versuch < 45; versuch++) {   // bis ~70 s je Seite (Aufwärmen/Scannen)
      const r = await anfrage(host, { path: jobPfad + "/NextDocument", timeout: 70000 });
      if (r.status === 200 && r.body.length > 500) { seite = r.body; break; }
      if (r.status === 404 || r.status === 410) { fertig = true; break; }
      if (r.status === 503 || r.status === 409) { await warte(1500); continue; }
      throw new Error(`Scanner meldete HTTP ${r.status}`);
    }
    if (fertig || !seite) break;
    seiten.push(seite);
  }
  if (!seiten.length) throw new Error("Keine Seite gescannt – liegt eine Vorlage auf dem Glas oder im Einzug?");
  return seiten;
}

/** Laufenden Auftrag abbrechen (z. B. wenn der Nutzer abbricht). */
export async function abbrechen(host: string) {
  try {
    const r = await anfrage(host, { path: "/eSCL/ScannerStatus", timeout: 8000 });
    const uri = (r.body.toString().match(/<pwg:JobUri>([^<]+)</) || [])[1];
    if (uri) await anfrage(host, { method: "DELETE", path: uri, timeout: 8000 });
  } catch {
    /* Abbrechen ist Kür – Fehler hier dürfen den Ablauf nicht stören */
  }
}

/** Gescannte Seiten (JPEG) zu einem PDF zusammenfassen – eine Seite je Bild, A4-treu. */
export async function seitenAlsPdf(seiten: Buffer[]): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  for (const jpg of seiten) {
    const bild = await pdf.embedJpg(jpg);
    const seite = pdf.addPage([bild.width, bild.height]);
    seite.drawImage(bild, { x: 0, y: 0, width: bild.width, height: bild.height });
  }
  return Buffer.from(await pdf.save());
}
