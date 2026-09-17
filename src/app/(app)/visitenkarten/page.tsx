"use client";
/* ════════════════════════════════════════════════════════════════════
   Visitenkarten der Baier Group

   Eigenständiger Reiter mit eigener Personenverwaltung: Personen anlegen,
   pflegen, löschen; Karte in Vorder- und Rückansicht; Großansicht, Druck
   und Bildexport. Die Ablage liegt im Browser (localStorage) – der Reiter
   braucht keine Tabelle in der Datenbank.
   ════════════════════════════════════════════════════════════════════ */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Icon from "@/components/Icon";
import ConfirmDialog from "@/components/ConfirmDialog";
import "./visitenkarte.css";
import { Feld, KopierKnopf } from "@/components/KontaktFeld";
import SuchSelect from "@/components/SuchSelect";
import { kopiere } from "@/lib/kopieren";
import QRCode from "qrcode";

// ── Firmen: je Firma eigene Akzentfarbe, Webadresse und Standard-Mail ──
type FirmaSchluessel = "handel" | "ing" | "masch" | "group";

const FIRMEN: Record<FirmaSchluessel, {
  name: string; zusatz: string; web: string; mail: string;
}> = {
  handel: { name: "Baier Handel & Vertrieb", zusatz: "Branchenübergreifender Handel",
            web: "baier-handel.de", mail: "info@baier-handel.de" },
  ing:    { name: "IngPro Baier", zusatz: "Automatisierungstechnik",
            web: "ingpro-baier.de", mail: "info@ingpro-baier.de" },
  masch:  { name: "Baier Maschinen", zusatz: "Sondermaschinen- & Anlagenbau",
            web: "baier-maschinen.de", mail: "info@baier-maschinen.de" },
  group:  { name: "Baier Group", zusatz: "Engineering · Maschinenbau · Handel",
            web: "baier-handel.de", mail: "d.baier@ingpro-baier.de" },
};

type Person = {
  id: string; name: string; rolle: string; tel: string;
  mail: string; firma: FirmaSchluessel; ort: string;
  /** Eigene Webadresse nur für diese Karte – leer bedeutet: die der Firma. */
  web?: string;
};

/**
 * Farben der Karten je Firma – dieselben Werte wie in `visitenkarte.css`.
 * Werden im Bereich „Firmenangaben" zum Kopieren ausgegeben, damit sie in anderen
 * Anwendungen (Druckerei, Website, Office) ohne Nachschlagen verwendet werden können.
 */
const FARBEN: Record<FirmaSchluessel, { akzent: string; dunkel: string; grund: string }> = {
  handel: { akzent: "#8fa383", dunkel: "#5f6f56", grund: "#0a0a0b" },
  ing:    { akzent: "#e0a534", dunkel: "#9d6708", grund: "#0a0a0b" },
  masch:  { akzent: "#3b82f6", dunkel: "#0047b3", grund: "#0a0a0b" },
  group:  { akzent: "#c3cad6", dunkel: "#6f7885", grund: "#0a0a0b" },
};

/** Farbwerte einer Firma als Textblock – praktisch zum Weitergeben. */
function farbBlock(sch: FirmaSchluessel, name: string) {
  const f = FARBEN[sch];
  return [`${name}`, `Akzent:  ${f.akzent}`, `Dunkel:  ${f.dunkel}`, `Grund:   ${f.grund}`].join("\n");
}

const SPEICHER = "nexus-visitenkarten";
const SPEICHER_FIRMEN = "nexus-visitenkarten-firmen";

/** Anschrift und Schlusszeile der Rückseite – ebenfalls pflegbar. */
type Anschrift = { strasse: string; ort: string; zusatz: string };
const ANSCHRIFT_STANDARD: Anschrift = {
  strasse: "Philipp-Reis-Straße 3",
  ort: "49661 Cloppenburg",
  zusatz: "Planung, Fertigung und Vertrieb aus einer Hand",
};
const STANDARD: Person[] = [{
  id: "p1", name: "David Baier", rolle: "Inhaber", tel: "01575 2421157",
  mail: "d.baier@ingpro-baier.de", firma: "handel", ort: "49661 Cloppenburg",
}];

// Die Grafiken werden als Daten-URI eingebettet, damit der Bildexport ohne
// Zugriff nach außen auskommt – im ausgelagerten SVG greifen keine Pfade.
const GRAFIKEN: Record<string, string> = {
  "--logo-marke": "/visitenkarte/group-logo-marke.svg",
  "--karte-logo-handel": "/visitenkarte/karte-logo-handel.svg",
  "--karte-logo-ing": "/visitenkarte/karte-logo-ing.svg",
  "--karte-logo-masch": "/visitenkarte/karte-logo-masch.svg",
  "--qr-handel": "/visitenkarte/qr-handel.svg",
  "--qr-ing": "/visitenkarte/qr-ing.svg",
  "--qr-masch": "/visitenkarte/qr-masch.svg",
  "--qr-group": "/visitenkarte/qr-group.svg",
};

function zeitstempel() {
  const d = new Date(), z = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}_${z(d.getHours())}${z(d.getMinutes())}`;
}

// Telefonnummer in Blöcke von 5, 4, 4 und 3 Ziffern gliedern – das liest sich
// besser als eine durchgehende Ziffernfolge. Enthält die Eingabe etwas anderes
// als Ziffern und Leerzeichen (etwa eine Ländervorwahl mit +), bleibt sie, wie
// sie eingetragen wurde.
function telefonGliedern(roh: string) {
  const text = (roh || "").trim();
  if (!text || /[^\d\s]/.test(text)) return text;
  const ziffern = text.replace(/\s+/g, "");
  const bloecke: string[] = [];
  let rest = ziffern;
  for (const laenge of [5, 4, 4, 3]) {
    if (!rest) break;
    bloecke.push(rest.slice(0, laenge));
    rest = rest.slice(laenge);
  }
  if (rest) bloecke.push(rest);
  return bloecke.join(" ");
}

// E-Mail mit etwas Luft um das @ setzen – das Zeichen soll die beiden Teile
// erkennbar trennen, ohne dass ein echtes Leerzeichen im Text steht.
function MailText({ wert }: { wert: string }) {
  const stelle = wert.indexOf("@");
  // Ein umschließendes Feld ist nötig: die Zeile ist ein Flex-Kasten, ohne
  // Klammer würde jeder Textteil ein eigenes Feld und die Adresse zerfiele.
  if (stelle < 0) return <span className="wert">{wert}</span>;
  // Ist die Adresse zu lang für eine Zeile, soll sie **am @** umbrechen und nicht
  // mitten im Namen: `<wbr>` bietet genau dort die Bruchstelle an.
  return (
    <span className="wert">
      {wert.slice(0, stelle)}
      <wbr />
      <span className="at">@</span>
      {wert.slice(stelle + 1)}
    </span>
  );
}

// ── Die Karte: Vorderseite mit Person, Rückseite mit der Gruppe ──
function Karte({ person, seite, karteRef, firmen = FIRMEN, anschrift = ANSCHRIFT_STANDARD }: {
  person: Person; seite: "vorn" | "hinten"; karteRef?: React.Ref<HTMLDivElement>;
  firmen?: typeof FIRMEN; anschrift?: Anschrift;
}) {
  const f = firmen[person.firma] ?? firmen.handel;
  const klassen = ["karte", `f-${person.firma}`];
  if (seite === "hinten") klassen.push("rueckseite");
  if (person.firma === "group") klassen.push("group");

  if (seite === "hinten") return (
    <div className={klassen.join(" ")} ref={karteRef}>
      <div className="schein" /><div className="wz" />
      <div className="inhalt">
        <div className="kopf">
          <div className="logo" />
          <div className="marke">Baier Group<small>Engineering · Maschinenbau · Handel</small></div>
        </div>
        <div className="firmen">
          {(["ing", "masch", "handel"] as const).map((sch) => (
            <div key={sch} className={`firma ${sch}`}>
              <div className="txt">
                <div className="n">{firmen[sch].name}</div>
                <div className="b">{firmen[sch].zusatz}</div>
              </div>
              <span className="web">{firmen[sch].web}</span>
            </div>
          ))}
        </div>
        <div className="schlusszeile">
          <b>{[anschrift.strasse, anschrift.ort].filter(Boolean).join(" · ")}</b><br />
          {anschrift.zusatz}
        </div>
      </div>
    </div>
  );

  return (
    <div className={klassen.join(" ")} ref={karteRef}>
      <div className="schein" /><div className="wz" />
      <div className="inhalt">
        <div className="kopf">
          <div className="logo" />
          <div className="marke">{f.name}<small>{f.zusatz}</small></div>
        </div>
        <div className="qr" aria-hidden="true" />
        <div className="mitte">
          <div className="name">{person.name}</div>
          <div className="rolle">{person.rolle}</div>
        </div>
        <div className="fuss">
          <span className="telefon">{telefonGliedern(person.tel)}</span>
          <span className="web">{person.web?.trim() || f.web}</span>
          <span className="mail"><MailText wert={person.mail || f.mail} /></span>
          <span className="ort">{person.ort}</span>
        </div>
      </div>
    </div>
  );
}

export default function Page() {
  const [personen, setPersonen] = useState<Person[]>(STANDARD);
  // Firmenangaben (Name, Zusatz, Webadresse, Standard-Mail) und Anschrift sind pflegbar
  const [firmen, setFirmen] = useState<typeof FIRMEN>(FIRMEN);
  const [anschrift, setAnschrift] = useState<Anschrift>(ANSCHRIFT_STANDARD);
  const [firmenOffen, setFirmenOffen] = useState(false);
  // QR-Code wird aus der **aktuell eingetragenen** Webadresse erzeugt – ändert sie sich,
  // ändert sich auch der Code. Die mitgelieferten QR-Grafiken sind nur noch die Rückfallebene.
  const [qrBild, setQrBild] = useState("");
  const [aktiv, setAktiv] = useState(0);
  const [geladen, setGeladen] = useState(false);
  const [stand, setStand] = useState("");
  const [gross, setGross] = useState<null | "vorn" | "hinten">(null);
  const [loeschFrage, setLoeschFrage] = useState(false);
  const [druckt, setDruckt] = useState(false);
  // Beidseitiger Druck: Vorderseiten auf Blatt 1, Rückseiten auf Blatt 2 – passend zur
  // Wendekante des Druckers, damit Vorder- und Rückseite deckungsgleich liegen.
  const [duplex, setDuplex] = useState(false);
  const [duplexDialog, setDuplexDialog] = useState(false);
  const [proBogen, setProBogen] = useState(10);          // 1 = eine Karte mittig, 10 = 2 × 5
  const [wendekante, setWendekante] = useState<"lang" | "kurz">("lang");
  // Feinabgleich der Rückseite in Millimetern: Papier läuft im Duplexdruck nie exakt
  // deckungsgleich. Positiv = nach rechts bzw. nach unten. Wird im Browser gemerkt.
  const [versatzX, setVersatzX] = useState(-1);
  const [versatzY, setVersatzY] = useState(1);

  useEffect(() => {
    try {
      const gespeichert = JSON.parse(localStorage.getItem("nexus-vk-versatz") || "null");
      if (gespeichert && typeof gespeichert.x === "number" && typeof gespeichert.y === "number") {
        setVersatzX(gespeichert.x);
        setVersatzY(gespeichert.y);
      }
    } catch { /* ohne gespeicherten Wert bleibt die Voreinstellung */ }
  }, []);

  useEffect(() => {
    try { localStorage.setItem("nexus-vk-versatz", JSON.stringify({ x: versatzX, y: versatzY })); } catch { /* egal */ }
  }, [versatzX, versatzY]);
  const [massstab, setMassstab] = useState(2);
  const [grafiken, setGrafiken] = useState<Record<string, string>>({});
  const wurzelRef = useRef<HTMLDivElement>(null);
  const vornRef = useRef<HTMLDivElement>(null);
  const hintenRef = useRef<HTMLDivElement>(null);

  const person = personen[aktiv] ?? personen[0] ?? STANDARD[0];

  // ── Ablage lesen ──
  useEffect(() => {
    try {
      const roh = localStorage.getItem(SPEICHER);
      const liste = roh ? JSON.parse(roh) : null;
      if (Array.isArray(liste) && liste.length) setPersonen(liste);
    } catch { /* beschädigter Eintrag – dann mit dem Standard beginnen */ }
    try {
      const roh = localStorage.getItem(SPEICHER_FIRMEN);
      const gespeichert = roh ? JSON.parse(roh) : null;
      if (gespeichert?.firmen) setFirmen({ ...FIRMEN, ...gespeichert.firmen });
      if (gespeichert?.anschrift) setAnschrift({ ...ANSCHRIFT_STANDARD, ...gespeichert.anschrift });
    } catch { /* wie oben: dann gelten die Standardwerte */ }
    setGeladen(true);
  }, []);

  // ── Ablage schreiben (erst nach dem Lesen, sonst überschreibt der Standard) ──
  useEffect(() => {
    if (!geladen) return;
    localStorage.setItem(SPEICHER, JSON.stringify(personen));
  }, [personen, geladen]);

  useEffect(() => {
    if (!geladen) return;
    localStorage.setItem(SPEICHER_FIRMEN, JSON.stringify({ firmen, anschrift }));
  }, [firmen, anschrift, geladen]);

  /** Eine Angabe einer Firma ändern (Name, Zusatz, Webadresse, Standard-Mail). */
  function firmaAendern(schluessel: FirmaSchluessel, feld: "name" | "zusatz" | "web" | "mail", wert: string) {
    setFirmen((f) => ({ ...f, [schluessel]: { ...f[schluessel], [feld]: wert } }));
  }

  // ── Grafiken als Daten-URI vorhalten ──
  useEffect(() => {
    let abgebrochen = false;
    (async () => {
      const paare = await Promise.all(Object.entries(GRAFIKEN).map(async ([name, pfad]) => {
        try {
          const text = await (await fetch(pfad)).text();
          return [name, `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(text)}")`];
        } catch { return [name, `url("${pfad}")`]; }
      }));
      if (!abgebrochen) setGrafiken(Object.fromEntries(paare));
    })();
    return () => { abgebrochen = true; };
  }, []);

  const melden = useCallback((text: string, dauer = 3500) => {
    setStand(text);
    if (dauer) setTimeout(() => setStand(""), dauer);
  }, []);

  function aendern(feld: keyof Person, wert: string) {
    setPersonen(alte => alte.map((p, i) => i === aktiv ? { ...p, [feld]: wert } as Person : p));
  }

  function neuAnlegen() {
    const neu: Person = {
      id: "p" + Date.now(), name: "Neue Person", rolle: "", tel: "01575 2421157",
      mail: "", firma: "handel", ort: "49661 Cloppenburg",
    };
    setPersonen(alte => [...alte, neu]);
    setAktiv(personen.length);
    melden("Neue Person angelegt");
  }

  function loeschen() {
    setPersonen(alte => alte.filter((_, i) => i !== aktiv));
    setAktiv(0);
    setLoeschFrage(false);
    melden("Person gelöscht");
  }

  // ── Drucken ──────────────────────────────────────────────────────
  // Die beiden Karten kommen für den Druck auf ein eigenes Blatt, das direkt
  // am Body hängt. Innerhalb der Anwendungsstruktur ließe sich nur mit
  // `position:fixed` mitteln – das druckt Chrome aber auf jeder Seite erneut.
  function drucken() { setDuplex(false); setDruckt(true); }

  /** Beidseitig drucken: erst die Einstellungen abfragen, dann das zweiseitige Blatt bauen. */
  function beidseitigDrucken() { setDuplexDialog(false); setDuplex(true); setDruckt(true); }

  /**
   * Reihenfolge der Rückseiten. Beim Duplexdruck wird das Blatt gewendet – dadurch
   * landet die Rückseite spiegelverkehrt. Damit jede Rückseite auf ihrer Vorderseite
   * liegt, wird das Raster hier entsprechend umsortiert:
   *   lange Kante  → Spalten spiegeln (Drehung um die senkrechte Achse)
   *   kurze Kante  → Zeilen spiegeln (Drehung um die waagerechte Achse)
   */
  function rueckseitenFolge(anzahl: number, spalten: number, kante: "lang" | "kurz") {
    const zeilen = Math.ceil(anzahl / spalten);
    const folge: number[] = [];
    for (let z = 0; z < zeilen; z++) {
      for (let sp = 0; sp < spalten; sp++) {
        const quelleZ = kante === "kurz" ? zeilen - 1 - z : z;
        const quelleS = kante === "lang" ? spalten - 1 - sp : sp;
        const index = quelleZ * spalten + quelleS;
        if (index < anzahl) folge.push(index);
      }
    }
    return folge;
  }

  useEffect(() => {
    if (!druckt) return;
    const alt = document.title;
    const wer = (person.name || "Baier").replace(/[^\wÄÖÜäöüß]+/g, "_");
    document.title = `Visitenkarte_${wer}_${zeitstempel()}`;
    document.body.classList.add("vk-druck");
    document.documentElement.classList.add("vk-druck");
    const aufraeumen = () => {
      document.body.classList.remove("vk-druck");
      document.documentElement.classList.remove("vk-druck");
      document.title = alt;
      setDruckt(false);
      setDuplex(false);
    };
    window.addEventListener("afterprint", aufraeumen, { once: true });
    // erst drucken, wenn das Druckblatt wirklich im Dokument steht
    const zeit = setTimeout(() => window.print(), 120);
    return () => {
      clearTimeout(zeit);
      window.removeEventListener("afterprint", aufraeumen);
      document.body.classList.remove("vk-druck");
      document.documentElement.classList.remove("vk-druck");
      document.title = alt;
    };
  }, [druckt, person.name]);

  // ── Bildexport: die Karte als SVG mit eingebettetem HTML, daraus ein PNG ──
  function svgText(quelle: HTMLElement, skala: number) {
    const rahmen = quelle.getBoundingClientRect();
    const breite = Math.round(rahmen.width), hoehe = Math.round(rahmen.height);
    // Nur die Regeln dieser Seite mitnehmen – der Rest der Anwendung stört nur
    const teile: string[] = [];
    for (const blatt of Array.from(document.styleSheets)) {
      let regeln: CSSRuleList;
      try { regeln = (blatt as CSSStyleSheet).cssRules; } catch { continue; }
      for (const regel of Array.from(regeln)) {
        if (regel.cssText.includes("vk-wurzel")) teile.push(regel.cssText);
      }
    }
    // Im ausgelagerten SVG greifen Schriftnamen anders. Deshalb genau die
    // Liste übernehmen, die auch die Karte am Bildschirm verwendet.
    const schrift = getComputedStyle(quelle).fontFamily;
    const inhalt = quelle.cloneNode(true) as HTMLElement;
    inhalt.style.margin = "0";
    inhalt.style.boxShadow = "none";
    inhalt.style.fontFamily = schrift;
    // Die Daten-URIs gehören in den Stilblock, nicht ins style-Attribut:
    // sie enthalten Anführungszeichen und würden das Attribut aufbrechen.
    const variablen = `.vk-wurzel{${Object.entries(grafikenAktuell).map(([k, v]) => `${k}:${v}`).join(";")}}`;
    // XML-konform ausgeben – im SVG gilt XHTML, `<br>` allein wäre ein Syntaxfehler
    const rumpf = new XMLSerializer().serializeToString(inhalt);
    return {
      breite, hoehe,
      text:
        `<svg xmlns="http://www.w3.org/2000/svg" width="${breite * skala}" height="${hoehe * skala}" ` +
        `viewBox="0 0 ${breite} ${hoehe}">` +
        `<foreignObject width="${breite}" height="${hoehe}">` +
        `<div xmlns="http://www.w3.org/1999/xhtml" class="vk-wurzel" ` +
        `style="width:${breite}px;height:${hoehe}px">` +
        `<style><![CDATA[${teile.join("\n")}\n${variablen}\n*{font-family:${schrift}}]]></style>` +
        rumpf +
        `</div></foreignObject></svg>`,
    };
  }

  function dateiSichern(blob: Blob, name: string) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  async function alsBild(quelle: HTMLElement, grundname: string, skala = 4) {
    const { breite, hoehe, text } = svgText(quelle, skala);
    // Zuerst als Rastergrafik versuchen; klappt das nicht (manche Browser
    // sperren eingebettetes HTML auf der Zeichenfläche), wird das SVG gesichert.
    try {
      const bild = new Image();
      await new Promise<void>((ok, fehler) => {
        bild.onload = () => ok();
        bild.onerror = () => fehler(new Error("Vorschau nicht darstellbar"));
        bild.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(text);
      });
      const flaeche = document.createElement("canvas");
      flaeche.width = breite * skala; flaeche.height = hoehe * skala;
      flaeche.getContext("2d")!.drawImage(bild, 0, 0, flaeche.width, flaeche.height);
      const blob = await new Promise<Blob | null>(ok => flaeche.toBlob(ok, "image/png"));
      if (!blob) throw new Error("Rastergrafik gesperrt");
      dateiSichern(blob, grundname + ".png");
      return "png";
    } catch {
      dateiSichern(new Blob([text], { type: "image/svg+xml;charset=utf-8" }), grundname + ".svg");
      return "svg";
    }
  }

  function dateiname(seite: string) {
    const wer = (person.name || "Baier").replace(/[^\wÄÖÜäöüß]+/g, "_");
    return `Visitenkarte_${wer}_${seite}_${zeitstempel()}`;
  }

  async function bildSichern(welche: "vorn" | "hinten" | "beide") {
    try {
      setStand("… Bild wird erzeugt");
      let art = "";
      if (welche !== "hinten" && vornRef.current) art = await alsBild(vornRef.current, dateiname("vorn"));
      if (welche !== "vorn" && hintenRef.current) art = await alsBild(hintenRef.current, dateiname("rueck"));
      melden(art === "svg"
        ? "✓ als SVG gesichert (Rastergrafik ist in diesem Browser gesperrt)"
        : "✓ Bild gespeichert", 5000);
    } catch (fehler: any) {
      melden("⚠ Bild konnte nicht erzeugt werden: " + fehler.message, 6000);
    }
  }

  // ── Großansicht: Esc schließt, Pfeiltasten wechseln die Seite ──
  useEffect(() => {
    if (!gross) return;
    function taste(e: KeyboardEvent) {
      if (e.key === "Escape") setGross(null);
      if (e.key === "ArrowLeft" || e.key === "ArrowRight")
        setGross(g => (g === "vorn" ? "hinten" : "vorn"));
      if (e.key === "+") zoomen(1);
      if (e.key === "-") zoomen(-1);
    }
    window.addEventListener("keydown", taste);
    return () => window.removeEventListener("keydown", taste);
  }, [gross]);

  // ── Zoom der Großansicht ────────────────────────────────────────
  // Gezoomt wird ausschließlich die Karte. Am Handy soll die Seite selbst
  // ruhig bleiben, damit Bedienfeld und Schaltflächen an ihrem Platz stehen.
  function passenderMassstab() {
    if (typeof window === "undefined") return 2;
    const breite = window.innerWidth - 32;      // Rand der Großansicht
    const karte = 85 * (96 / 25.4);             // 85 mm in Bildpunkten
    return Math.max(0.5, Math.min(2.4, Number((breite / karte).toFixed(2))));
  }
  function zoomen(richtung: number) {
    setMassstab(m => Math.max(0.5, Math.min(6, Number((m * (richtung > 0 ? 1.25 : 0.8)).toFixed(2)))));
  }

  // Beim Öffnen auf die Bildschirmbreite einpassen
  useEffect(() => { if (gross) setMassstab(passenderMassstab()); }, [gross]);

  // Zwei Finger ziehen den Maßstab auf, ein Doppeltipp springt zwischen
  // Einpassung und Lupe, Strg + Mausrad zoomt am Rechner.
  // Die Ereignisse werden von Hand angemeldet: React meldet touchmove und
  // wheel als „passiv" an, dort greift ein Abbrechen des Standardverhaltens
  // nicht – die Seite selbst würde mitzoomen.
  const ansichtRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const flaeche = ansichtRef.current;
    if (!gross || !flaeche) return;
    let kniff: { abstand: number; start: number } | null = null;
    let letzterTipp = 0;
    const abstand = (t: TouchList) =>
      Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const grenzen = (w: number) => Math.max(0.5, Math.min(6, Number(w.toFixed(2))));

    function an(e: TouchEvent) {
      if (e.touches.length === 2) {
        setMassstab(m => { kniff = { abstand: abstand(e.touches), start: m }; return m; });
      } else if (e.touches.length === 1) {
        const jetzt = Date.now();
        if (jetzt - letzterTipp < 300) {
          const passend = passenderMassstab();
          setMassstab(m => (Math.abs(m - passend) < 0.05 ? grenzen(passend * 2) : passend));
        }
        letzterTipp = jetzt;
      }
    }
    function zieh(e: TouchEvent) {
      if (e.touches.length !== 2 || !kniff) return;
      e.preventDefault();
      setMassstab(grenzen(kniff.start * (abstand(e.touches) / kniff.abstand)));
    }
    function aus() { kniff = null; }
    function rad(e: WheelEvent) {
      if (!e.ctrlKey) return;
      e.preventDefault();
      zoomen(e.deltaY < 0 ? 1 : -1);
    }

    flaeche.addEventListener("touchstart", an, { passive: true });
    flaeche.addEventListener("touchmove", zieh, { passive: false });
    flaeche.addEventListener("touchend", aus, { passive: true });
    flaeche.addEventListener("wheel", rad, { passive: false });
    return () => {
      flaeche.removeEventListener("touchstart", an);
      flaeche.removeEventListener("touchmove", zieh);
      flaeche.removeEventListener("touchend", aus);
      flaeche.removeEventListener("wheel", rad);
    };
  }, [gross]);

  /** Adresse, die auf der Karte steht – erst die der Person, sonst die der Firma. */
  const kartenWeb = (person.web?.trim() || firmen[person.firma]?.web || "").trim();

  useEffect(() => {
    if (!kartenWeb) { setQrBild(""); return; }
    const ziel = /^https?:\/\//i.test(kartenWeb) ? kartenWeb : `https://${kartenWeb}`;
    let abgebrochen = false;
    QRCode.toString(ziel, {
      type: "svg",
      margin: 0,
      errorCorrectionLevel: "M",
      // Weiße Module auf durchsichtigem Grund – wie die bisherigen Grafiken
      color: { dark: "#ffffff", light: "#0000" },
    })
      .then((svg) => {
        if (!abgebrochen) setQrBild(`url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`);
      })
      .catch(() => { if (!abgebrochen) setQrBild(""); });
    return () => { abgebrochen = true; };
  }, [kartenWeb]);

  /** Grafiken samt frisch erzeugtem QR-Code der gewählten Firma. */
  const grafikenAktuell = useMemo(
    () => (qrBild ? { ...grafiken, [`--qr-${person.firma}`]: qrBild } : grafiken),
    [grafiken, qrBild, person.firma]
  );

  const variablen = useMemo(() => grafikenAktuell as React.CSSProperties, [grafikenAktuell]);

  return (
    <div className="vk-wurzel" ref={wurzelRef} style={variablen}>
      <h1 style={{ fontSize: "1.4rem", fontWeight: 600, marginBottom: 16 }}>Visitenkarten</h1>

      {/* ── Bedienfeld ── */}
      <div className="card" style={{ padding: 16, display: "grid", gap: 12 }}>
        <div className="feld-zeile feld-zeile-2">
          <label style={{ display: "grid", gap: 4 }}>
            <span className="muted" style={{ fontSize: 12 }}>Person</span>
            <SuchSelect
              value={String(aktiv)}
              onChange={(v) => setAktiv(Number(v))}
              platzhalter="Person wählen"
              suchePlatzhalter="Name suchen…"
              options={personen.map((p, i) => ({ value: String(i), label: p.name, hint: p.rolle || "" }))}
            />
          </label>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
            <button className="btn" onClick={neuAnlegen}>
              <Icon name="plus" size={16} /> Neue Person
            </button>
            <button className="btn btn-danger" onClick={() => setLoeschFrage(true)}
                    disabled={personen.length < 2}>
              <Icon name="trash" size={16} /> Löschen
            </button>
          </div>
        </div>

        <div className="feld-zeile feld-zeile-2">
          <label style={{ display: "grid", gap: 4 }}>
            <span className="muted" style={{ fontSize: 12 }}>Name</span>
            <input className="input" value={person.name} onChange={e => aendern("name", e.target.value)} />
          </label>
          <label style={{ display: "grid", gap: 4 }}>
            <span className="muted" style={{ fontSize: 12 }}>Funktion</span>
            <input className="input" value={person.rolle} onChange={e => aendern("rolle", e.target.value)} />
          </label>
        </div>

        <div className="feld-zeile feld-zeile-2">
          <label style={{ display: "grid", gap: 4 }}>
            <span className="muted" style={{ fontSize: 12 }}>Telefon</span>
            <input className="input" value={person.tel} onChange={e => aendern("tel", e.target.value)} />
          </label>
          <label style={{ display: "grid", gap: 4 }}>
            <span className="muted" style={{ fontSize: 12 }}>E-Mail</span>
            <input className="input" value={person.mail} placeholder={FIRMEN[person.firma].mail}
                   onChange={e => aendern("mail", e.target.value)} />
          </label>
        </div>

        <div className="feld-zeile feld-zeile-2">
          <label style={{ display: "grid", gap: 4 }}>
            <span className="muted" style={{ fontSize: 12 }}>Firma auf der Vorderseite</span>
            <SuchSelect
              value={person.firma}
              onChange={(v) => aendern("firma", v)}
              platzhalter="Firma wählen"
              options={[
                { value: "handel", label: firmen.handel.name },
                { value: "ing", label: firmen.ing.name },
                { value: "masch", label: firmen.masch.name },
                { value: "group", label: firmen.group.name },
              ]}
            />
          </label>
          <label style={{ display: "grid", gap: 4 }}>
            <span className="muted" style={{ fontSize: 12 }}>Ort</span>
            <input className="input" value={person.ort} onChange={e => aendern("ort", e.target.value)} />
          </label>
        </div>

        <div className="feld-zeile feld-zeile-2">
          <label style={{ display: "grid", gap: 4 }}>
            <span className="muted" style={{ fontSize: 12 }}>Webadresse auf dieser Karte</span>
            <input className="input" value={person.web || ""} placeholder={FIRMEN[person.firma].web}
                   onChange={e => aendern("web", e.target.value)} />
            <span className="muted" style={{ fontSize: 11.5 }}>
              Leer lassen = Adresse der gewählten Firma. Die Adressen aller Firmen ändert
              der Knopf „Firmenangaben".
            </span>
          </label>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button className="btn" onClick={() => setFirmenOffen((v) => !v)}
            title="Webadressen, Firmenbezeichnungen und Anschrift der Rückseite ändern">
            <Icon name="building" size={16} /> Firmenangaben
          </button>
          <button className="btn" onClick={() => setDuplexDialog(true)}>
            <Icon name="printer" size={16} /> Beidseitig drucken
          </button>
          <button className="btn" onClick={drucken}>
            <Icon name="printer" size={16} /> Karten drucken
          </button>
          <button className="btn" onClick={() => bildSichern("vorn")}>
            <Icon name="download" size={16} /> Vorderseite
          </button>
          <button className="btn" onClick={() => bildSichern("hinten")}>
            <Icon name="download" size={16} /> Rückseite
          </button>
          <button className="btn" onClick={() => bildSichern("beide")}>
            <Icon name="download" size={16} /> Beide
          </button>
          <span className="muted" style={{ fontSize: 13 }}>
            {stand || `${personen.length} Person${personen.length === 1 ? "" : "en"} gespeichert · Änderungen werden sofort übernommen`}
          </span>
        </div>
      </div>

      {/* ── Vorschau: beide Seiten, Klick öffnet die Großansicht ── */}
      <div className="karten-paar">
        <figure onClick={() => setGross("vorn")}>
          <Karte person={person} seite="vorn" karteRef={vornRef} firmen={firmen} anschrift={anschrift} />
          <figcaption>Vorderseite</figcaption>
        </figure>
        <figure onClick={() => setGross("hinten")}>
          <Karte person={person} seite="hinten" karteRef={hintenRef} firmen={firmen} anschrift={anschrift} />
          <figcaption>Rückseite</figcaption>
        </figure>
      </div>

      {/* ── Großansicht: nur die Karte wird gezoomt, die Seite bleibt ruhig ── */}
      {gross && (
        <div className="kansicht" ref={ansichtRef}
             onClick={e => { if (e.target === e.currentTarget) setGross(null); }}>
          <button className="zu" onClick={() => setGross(null)} aria-label="Schließen">×</button>
          <div className="buehne" style={{ zoom: massstab }}>
            <Karte person={person} seite={gross} firmen={firmen} anschrift={anschrift} />
          </div>
          <div className="werkzeuge">
            <button className={"kbtn" + (gross === "vorn" ? " aktiv" : "")}
                    onClick={() => setGross("vorn")}>Vorderseite</button>
            <button className={"kbtn" + (gross === "hinten" ? " aktiv" : "")}
                    onClick={() => setGross("hinten")}>Rückseite</button>
            <button className="kbtn" onClick={() => zoomen(-1)} aria-label="Kleiner">−</button>
            <button className="kbtn" onClick={() => setMassstab(passenderMassstab())}>Anpassen</button>
            <button className="kbtn" onClick={() => zoomen(1)} aria-label="Größer">+</button>
            <button className="kbtn" onClick={drucken}>Drucken</button>
            <button className="kbtn" onClick={() => setDuplexDialog(true)}>Beidseitig</button>
          </div>
          <div className="hinweis">
            Zwei Finger oder +/− zoomen · Doppeltipp wechselt die Lupe · Esc schließt
          </div>
        </div>
      )}

      {/* ── Druckblatt: hängt direkt am Body, damit es genau eine Seite füllt ── */}
      {druckt && !duplex && createPortal(
        <div className="vk-wurzel vk-druckblatt" style={variablen}>
          <Karte person={person} seite="vorn" firmen={firmen} anschrift={anschrift} />
          <Karte person={person} seite="hinten" firmen={firmen} anschrift={anschrift} />
        </div>,
        document.body,
      )}

      {/* Beidseitig: Blatt 1 trägt die Vorderseiten, Blatt 2 die Rückseiten – in der
          Reihenfolge, die zum Wenden des Druckers passt. */}
      {druckt && duplex && createPortal(
        <div className="vk-wurzel vk-druckblatt vk-duplex" style={variablen}>
          <section className="vk-bogen">
            <div className={`vk-raster${proBogen === 1 ? " einzeln" : ""}`}>
              {Array.from({ length: proBogen }).map((_, i) => (
                <Karte key={"v" + i} person={person} seite="vorn" firmen={firmen} anschrift={anschrift} />
              ))}
            </div>
          </section>
          <section className="vk-bogen">
            {/* Feinabgleich: verschiebt nur die Rückseiten, damit sie auf den Vorderseiten liegen */}
            <div className={`vk-raster${proBogen === 1 ? " einzeln" : ""}`}
              style={{ transform: `translate(${versatzX}mm, ${versatzY}mm)` }}>
              {rueckseitenFolge(proBogen, proBogen === 1 ? 1 : 2, wendekante).map((i) => (
                <Karte key={"h" + i} person={person} seite="hinten" firmen={firmen} anschrift={anschrift} />
              ))}
            </div>
          </section>
        </div>,
        document.body,
      )}

      {/* ── Firmenangaben: Webadresse, Bezeichnung, Standard-Mail, Anschrift ── */}
      {firmenOffen && (
        <div onClick={() => setFirmenOffen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", display: "grid", placeItems: "center", padding: 16, zIndex: 70 }}>
          <div onClick={(e) => e.stopPropagation()} className="card dm-fenster"
            style={{ width: 640, maxWidth: "94vw", maxHeight: "90vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10 }}>
              <Icon name="building" size={18} />
              <h2 style={{ fontSize: 17, fontWeight: 700, flex: 1 }}>Firmenangaben und Anschrift</h2>
              <button className="btn btn-icon" aria-label="Schließen" onClick={() => setFirmenOffen(false)}>
                <Icon name="x" />
              </button>
            </div>

            <div style={{ padding: 20, overflowY: "auto", display: "grid", gap: 18 }}>
              {(["ing", "masch", "handel", "group"] as const).map((sch) => (
                <section key={sch} style={{ display: "grid", gap: 8 }}>
                  <div className="muted" style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: ".04em" }}>
                    {sch === "group" ? "Baier Group (Rückseite/Kopf)" : firmen[sch].name}
                  </div>
                  <div className="feld-zeile feld-zeile-2">
                    <Feld label="Bezeichnung" icon="building" wert={firmen[sch].name}
                      setWert={(v) => firmaAendern(sch, "name", v)} />
                    <Feld label="Zusatz" icon="tag" wert={firmen[sch].zusatz}
                      setWert={(v) => firmaAendern(sch, "zusatz", v)} />
                  </div>
                  <div className="feld-zeile feld-zeile-2">
                    <Feld label="Webadresse" icon="command" wert={firmen[sch].web}
                      platzhalter="z. B. baier-handel.de"
                      setWert={(v) => firmaAendern(sch, "web", v)} />
                    <Feld label="Standard-E-Mail" icon="mail" typ="email" wert={firmen[sch].mail}
                      setWert={(v) => firmaAendern(sch, "mail", v)} />
                  </div>

                  {/* Farbwerte der Karte – Muster, Code und Kopier-Knopf */}
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    {([["akzent", "Akzent"], ["dunkel", "Dunkel"], ["grund", "Grund"]] as const).map(([feld, text]) => (
                      <div key={feld} style={{ display: "flex", alignItems: "center", gap: 6,
                                               border: "1px solid var(--border)", borderRadius: 8, padding: "4px 6px 4px 4px" }}>
                        <span style={{ width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                                       background: FARBEN[sch][feld], border: "1px solid rgba(128,128,128,.35)" }} />
                        <span className="muted" style={{ fontSize: 12 }}>{text}</span>
                        <code style={{ fontSize: 12.5, fontFamily: "ui-monospace, monospace" }}>{FARBEN[sch][feld]}</code>
                        <KopierKnopf wert={FARBEN[sch][feld]} was={`${text}-Farbe`} klein />
                      </div>
                    ))}
                    <button className="btn" title="Alle Farbwerte dieser Firma kopieren"
                      onClick={async () => {
                        const ok = await kopiere(farbBlock(sch, firmen[sch].name));
                        melden(ok ? `Farbwerte von ${firmen[sch].name} kopiert` : "Kopieren nicht möglich");
                      }}>
                      <Icon name="copy" size={14} /> alle
                    </button>
                  </div>
                </section>
              ))}

              <section style={{ display: "grid", gap: 8, borderTop: "1px solid var(--border)", paddingTop: 14 }}>
                <div className="muted" style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: ".04em" }}>
                  Anschrift auf der Rückseite
                </div>
                <div className="feld-zeile feld-zeile-2">
                  <Feld label="Straße und Hausnummer" icon="home" wert={anschrift.strasse}
                    setWert={(v) => setAnschrift({ ...anschrift, strasse: v })} />
                  <Feld label="PLZ und Ort" icon="home" wert={anschrift.ort}
                    setWert={(v) => setAnschrift({ ...anschrift, ort: v })} />
                </div>
                <Feld label="Schlusszeile" icon="file-text" wert={anschrift.zusatz}
                  hinweis="Steht unter der Anschrift, z. B. Planung, Fertigung und Vertrieb aus einer Hand."
                  setWert={(v) => setAnschrift({ ...anschrift, zusatz: v })} />
              </section>

              <div className="muted" style={{ fontSize: 12, lineHeight: 1.5 }}>
                Die Angaben gelten für alle Karten und werden in diesem Browser gespeichert.
                Die Webadresse der <b>Vorderseite</b> kommt aus der Firma, die bei der Person gewählt ist;
                die <b>Rückseite</b> zeigt alle drei Firmen und die Anschrift.
              </div>
            </div>

            <div style={{ padding: "12px 20px", borderTop: "1px solid var(--border)", display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn" onClick={() => { setFirmen(FIRMEN); setAnschrift(ANSCHRIFT_STANDARD); }}>
                <Icon name="undo" /> Zurücksetzen
              </button>
              <button className="btn btn-primary" onClick={() => setFirmenOffen(false)}>
                <Icon name="check" /> Fertig
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Einstellungen für den beidseitigen Druck ── */}
      {duplexDialog && (
        <div onClick={() => setDuplexDialog(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", display: "grid", placeItems: "center", padding: 16, zIndex: 70 }}>
          <div onClick={(e) => e.stopPropagation()} className="card dm-fenster"
            style={{ width: 520, maxWidth: "94vw", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10 }}>
              <h2 style={{ fontSize: 17, fontWeight: 700, flex: 1 }}>Beidseitig drucken</h2>
              <button className="btn btn-icon" aria-label="Schließen" onClick={() => setDuplexDialog(false)}>
                <Icon name="x" />
              </button>
            </div>
            <div style={{ padding: 20, display: "grid", gap: 14 }}>
              <div style={{ display: "grid", gap: 6 }}>
                <span className="muted" style={{ fontSize: 13 }}>Karten je Bogen</span>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {[[10, "10 Stück (2 × 5)"], [1, "1 Stück (mittig)"]].map(([wert, text]) => (
                    <button key={String(wert)} className="btn" onClick={() => setProBogen(Number(wert))}
                      style={{ background: proBogen === wert ? "var(--accent)" : undefined, color: proBogen === wert ? "#fff" : undefined }}>
                      {text}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ display: "grid", gap: 6 }}>
                <span className="muted" style={{ fontSize: 13 }}>Wie wendet der Drucker?</span>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {[["lang", "Lange Kante (Standard)"], ["kurz", "Kurze Kante"]].map(([wert, text]) => (
                    <button key={wert} className="btn" onClick={() => setWendekante(wert as "lang" | "kurz")}
                      style={{ background: wendekante === wert ? "var(--accent)" : undefined, color: wendekante === wert ? "#fff" : undefined }}>
                      {text}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ display: "grid", gap: 6 }}>
                <span className="muted" style={{ fontSize: 13 }}>
                  Feinabgleich der Rückseite (mm) – positiv schiebt nach rechts bzw. nach unten
                </span>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                  <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
                    waagerecht
                    <input className="input" type="number" step={0.5} style={{ width: 90 }}
                      value={versatzX} onChange={(e) => setVersatzX(Number(e.target.value) || 0)} />
                  </label>
                  <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
                    senkrecht
                    <input className="input" type="number" step={0.5} style={{ width: 90 }}
                      value={versatzY} onChange={(e) => setVersatzY(Number(e.target.value) || 0)} />
                  </label>
                  <button className="btn" onClick={() => { setVersatzX(0); setVersatzY(0); }}>
                    <Icon name="undo" /> ohne Versatz
                  </button>
                </div>
                <span className="muted" style={{ fontSize: 12 }}>
                  Voreingestellt sind −1 mm / +1 mm – das gleicht aus, dass die Rückseite bisher
                  1 mm zu weit rechts und 1 mm zu hoch lag. Der Wert wird gemerkt.
                </span>
              </div>

              <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.6 }}>
                Es entstehen <b>zwei Seiten</b>: Blatt 1 mit den Vorderseiten, Blatt 2 mit den
                Rückseiten – bereits so angeordnet, dass sie nach dem Wenden genau übereinander liegen.
                Im Druckdialog bitte <b>beidseitig</b> einschalten, <b>Skalierung 100 %</b> und
                <b> Ränder: keine</b> wählen; die Ränder bringt das Layout selbst mit.
                Die gestrichelten Linien sind Schnitthilfen und werden hell gedruckt.
              </div>
            </div>
            <div style={{ padding: "12px 20px", borderTop: "1px solid var(--border)", display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn" onClick={() => setDuplexDialog(false)}>Abbrechen</button>
              <button className="btn btn-primary" onClick={beidseitigDrucken}>
                <Icon name="printer" /> Drucken
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={loeschFrage}
        title="Person löschen"
        message={`„${person.name}" wirklich löschen?`}
        onConfirm={loeschen}
        onCancel={() => setLoeschFrage(false)}
      />
    </div>
  );
}
