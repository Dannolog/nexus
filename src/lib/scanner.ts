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

export type Flaeche = { width: number; height: number };   // in 1/300 Zoll
export type Faehigkeiten = {
  model: string; sources: string[]; resolutions: number[]; duplex: boolean;
  /** größte Scanfläche je Quelle – der Einzug kann meist länger als das Flachbett */
  flaeche: { Platen: Flaeche; Feeder: Flaeche };
};

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
  // Größte Fläche JE QUELLE (aus ProjectEye übernommen). Mit fester A4-Fläche wurden lange
  // Vorlagen im Einzug abgeschnitten. Abschnitt sauber begrenzen, sonst bekäme das
  // Flachbett die größere Fläche des Einzugs und belichtet über das Glas hinaus.
  const abschnitt = (name: string) => {
    const auf = xml.indexOf(`<scan:${name}>`);
    if (auf < 0) return "";
    const zu = xml.indexOf(`</scan:${name}>`, auf);
    return zu < 0 ? xml.slice(auf) : xml.slice(auf, zu);
  };
  const flaecheAus = (teil: string): Flaeche | null => {
    const w = [...teil.matchAll(/<scan:MaxWidth>(\d+)</g)].map((m) => +m[1]);
    const h = [...teil.matchAll(/<scan:MaxHeight>(\d+)</g)].map((m) => +m[1]);
    return w.length && h.length ? { width: Math.max(...w), height: Math.max(...h) } : null;
  };
  const flaeche = {
    Platen: flaecheAus(abschnitt("PlatenInputCaps")) || { width: 2550, height: 3508 },
    Feeder: flaecheAus(abschnitt("AdfSimplexInputCaps")) || flaecheAus(abschnitt("AdfDuplexInputCaps")) || { width: 2550, height: 4200 },
  };
  return { model, sources, resolutions: resolutions.length ? resolutions : [150, 200, 300], duplex, flaeche };
}

const flaecheFuer = (opts: ScanOptionen, f?: Flaeche | null): Flaeche =>
  f && f.width && f.height ? f : { width: 2550, height: opts.source === "Feeder" ? 4200 : 3508 };

/**
 * Schlanker eSCL-Auftrag. Fläche des GERÄTS statt fester A4-Werte, Einheit (1/300 Zoll)
 * ausdrücklich angegeben – ohne sie rechnen manche Geräte in Pixeln der Auflösung
 * (bei 600 dpi kam dann nur die halbe Seite). `MustHonor=false`: Gerät darf anpassen.
 */
function einstellungenXml(opts: ScanOptionen = {}, f?: Flaeche | null) {
  const { source = "Platen", colorMode = "RGB24", resolution = 200, duplex = false } = opts;
  const fl = flaecheFuer(opts, f);
  const dup = source === "Feeder" && duplex ? "\n  <scan:Duplex>true</scan:Duplex>" : "";
  return `<?xml version="1.0" encoding="UTF-8"?>
<scan:ScanSettings ${ESCL_NS}>
  <pwg:Version>2.9</pwg:Version>
  <pwg:ScanRegions pwg:MustHonor="false">
    <pwg:ScanRegion>
      <pwg:ContentRegionUnits>escl:ThreeHundredthsOfInches</pwg:ContentRegionUnits>
      <pwg:Height>${fl.height}</pwg:Height>
      <pwg:Width>${fl.width}</pwg:Width>
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
 * Auftrag im Format der HP-Weboberfläche („Webscan", aus kontor übernommen): zusätzlich
 * Intent, DocumentFormatExt, CompressionFactor und JobSourceInfo. Neuere HP-Firmware
 * (Color LaserJet Pro MFP 4302) lehnt den schlanken Auftrag teils mit HTTP 409 ab,
 * nimmt diesen aber an.
 */
function webscanXml(opts: ScanOptionen = {}, f?: Flaeche | null) {
  const { source = "Platen", colorMode = "RGB24", resolution = 200, duplex = false } = opts;
  const fl = flaecheFuer(opts, f);
  const dup = source === "Feeder" ? `\n  <scan:Duplex>${duplex ? "true" : "false"}</scan:Duplex>` : "";
  return `<?xml version="1.0" encoding="UTF-8"?>
<scan:ScanSettings ${ESCL_NS}>
  <pwg:Version>2.9</pwg:Version>
  <scan:Intent>Document</scan:Intent>
  <pwg:ScanRegions>
    <pwg:ScanRegion>
      <pwg:Height>${fl.height}</pwg:Height>
      <pwg:ContentRegionUnits>escl:ThreeHundredthsOfInches</pwg:ContentRegionUnits>
      <pwg:Width>${fl.width}</pwg:Width>
      <pwg:XOffset>0</pwg:XOffset>
      <pwg:YOffset>0</pwg:YOffset>
    </pwg:ScanRegion>
  </pwg:ScanRegions>
  <pwg:InputSource>${source}</pwg:InputSource>
  <scan:DocumentFormatExt>image/jpeg</scan:DocumentFormatExt>
  <scan:XResolution>${resolution}</scan:XResolution>
  <scan:YResolution>${resolution}</scan:YResolution>
  <scan:ColorMode>${colorMode}</scan:ColorMode>
  <scan:CompressionFactor>25</scan:CompressionFactor>${dup}
  <scan:JobSourceInfo>
    <scan:UserName>nexus</scan:UserName>
    <scan:MachineName>nexus</scan:MachineName>
    <scan:Application>nexus</scan:Application>
  </scan:JobSourceInfo>
</scan:ScanSettings>`;
}

type Format = "schlank" | "webscan";
// Je Gerät merken, welches Auftragsformat zuletzt angenommen wurde (spart den abgelehnten Versuch)
const formatJeGeraet = new Map<string, Format>();

/**
 * Scannt eine Vorlage. Flachbett = eine Seite, Einzug = alle eingelegten Seiten.
 * Ergebnis: ein JPEG je Seite.
 */
export async function scanne(host: string, opts: ScanOptionen = {}): Promise<Buffer[]> {
  // Volle Fläche der gewählten Quelle aus den Gerätefähigkeiten – klappt das nicht,
  // wird mit sinnvollen Vorgaben gescannt (lieber Standardmaß als gar kein Scan).
  let flaeche: Flaeche | null = null;
  try { flaeche = (await faehigkeiten(host)).flaeche[opts.source === "Feeder" ? "Feeder" : "Platen"]; } catch { /* Vorgabe */ }

  const senden = (fmt: Format) => anfrage(host, {
    method: "POST", path: "/eSCL/ScanJobs",
    body: fmt === "webscan" ? webscanXml(opts, flaeche) : einstellungenXml(opts, flaeche),
    headers: { "Content-Type": "text/xml" }, timeout: 20000,
  });
  const anderes = (f: Format): Format => (f === "schlank" ? "webscan" : "schlank");

  let fmt = formatJeGeraet.get(host) ?? "schlank";
  let post = await senden(fmt);
  // Abgelehnt → sofort im anderen Format versuchen (HP-Firmware-Eigenheit)
  if (post.status === 409 || post.status === 400) {
    const p2 = await senden(anderes(fmt));
    if (p2.status === 201) { fmt = anderes(fmt); post = p2; }
  }
  // HP meldet 409/503 auch kurz nach dem Aufwachen oder solange am Gerät ein Menü offen ist,
  // obwohl „Idle" – bis zu 3× kurz warten und erneut (beide Formate).
  for (let i = 0; i < 3 && (post.status === 409 || post.status === 503); i++) {
    const st = await scannerStatus(host).catch(() => null);
    if (opts.source === "Feeder" && st && einzugProblem(st.adf)) break;   // leerer Einzug füllt sich nicht von selbst
    await warte(3000);
    post = await senden(fmt);
    if (post.status !== 201) {
      const p2 = await senden(anderes(fmt));
      if (p2.status === 201) { fmt = anderes(fmt); post = p2; }
    }
  }
  if (post.status === 201) formatJeGeraet.set(host, fmt);
  else {
    // Grund beim Gerät nachfragen, statt nur den HTTP-Code zu melden
    let grund = "Bitte am Gerät prüfen: Display auf den Startbildschirm (offenes Scan-/Kopier-Menü oder Meldung schließen), Deckel des Flachbetts schließen – notfalls das Gerät kurz aus- und wieder einschalten.";
    try {
      const st = await scannerStatus(host);
      grund = (opts.source === "Feeder" && einzugProblem(st.adf))
        || (/Processing|Testing/i.test(st.state) ? "Der Scanner ist gerade beschäftigt – bitte kurz warten und erneut versuchen." : "")
        || (/Down|Stopped/i.test(st.state) ? "Der Scanner meldet eine Störung – bitte am Gerät nachsehen." : "")
        || grund;
    } catch { /* Status ist nur Zusatzinfo */ }
    throw new Error(`Scan-Auftrag abgelehnt (HTTP ${post.status}, mehrfach versucht). ${grund}`);
  }
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

export type ScannerZustand = { state: string; adf: string };

/**
 * Kurzstatus: Zustand (`Idle`, `Processing`, …) und Einzug
 * (`ScannerAdfLoaded` = Papier liegt im Einzug, `ScannerAdfEmpty`, `ScannerAdfJam`, `ScannerAdfHatchOpen`, …).
 */
export async function scannerStatus(host: string, timeout = 6000): Promise<ScannerZustand> {
  const r = await anfrage(host, { path: "/eSCL/ScannerStatus", timeout });
  if (r.status !== 200) throw new Error(`Status nicht abrufbar (HTTP ${r.status})`);
  const x = r.body.toString("utf8");
  return {
    state: (/<pwg:State>([^<]+)/.exec(x) || [])[1] || "",
    adf: (/<scan:AdfState>([^<]+)/.exec(x) || [])[1] || "",
  };
}

/** Verständlicher Text zum Einzug-Zustand – leer, wenn alles in Ordnung ist. */
export function einzugProblem(adf: string): string {
  if (/Empty/i.test(adf)) return "Im Einzug liegt kein Papier – Papier einlegen oder Flachbett wählen.";
  if (/Jam/i.test(adf)) return "Papierstau im Einzug – bitte am Gerät beheben.";
  if (/HatchOpen|Open/i.test(adf)) return "Die Klappe des Einzugs ist offen – bitte schließen.";
  if (/Mispick/i.test(adf)) return "Der Einzug konnte das Blatt nicht greifen – Papier neu einlegen.";
  return "";
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

/**
 * Kleine Vorschau der ersten Seite – für die Übersicht im Posteingang.
 * Bewusst klein gehalten (Breite 360 px, JPEG), damit die Liste schnell lädt.
 * Klappt das Verkleinern nicht, gibt es eben keine Vorschau – der Scan bleibt davon unberührt.
 */
export async function vorschauBild(seiten: Buffer[]): Promise<string> {
  if (!seiten.length) return "";
  try {
    const sharp = (await import("sharp")).default;
    const klein = await sharp(seiten[0]).rotate().resize({ width: 360, withoutEnlargement: true })
      .jpeg({ quality: 68 }).toBuffer();
    return `data:image/jpeg;base64,${klein.toString("base64")}`;
  } catch {
    return "";
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
