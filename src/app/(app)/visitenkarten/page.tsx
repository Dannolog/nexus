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
};

const SPEICHER = "nexus-visitenkarten";
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

// ── Die Karte: Vorderseite mit Person, Rückseite mit der Gruppe ──
function Karte({ person, seite, karteRef }: {
  person: Person; seite: "vorn" | "hinten"; karteRef?: React.Ref<HTMLDivElement>;
}) {
  const f = FIRMEN[person.firma] ?? FIRMEN.handel;
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
          <div className="firma ing">
            <div className="txt"><div className="n">IngPro Baier</div>
              <div className="b">Automatisierung · Software · Konstruktion</div></div>
            <span className="web">ingpro-baier.de</span>
          </div>
          <div className="firma masch">
            <div className="txt"><div className="n">Baier Maschinen</div>
              <div className="b">Sondermaschinen- &amp; Anlagenbau</div></div>
            <span className="web">baier-maschinen.de</span>
          </div>
          <div className="firma handel">
            <div className="txt"><div className="n">Baier Handel &amp; Vertrieb</div>
              <div className="b">Branchenübergreifender Handel</div></div>
            <span className="web">baier-handel.de</span>
          </div>
        </div>
        <div className="schlusszeile">
          <b>Philipp-Reis-Straße 3 · 49661 Cloppenburg</b><br />
          Planung, Fertigung und Vertrieb aus einer Hand
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
          <span className="telefon">{person.tel}</span>
          <span className="web">{f.web}</span>
          <span className="mail">{person.mail || f.mail}</span>
          <span className="ort">{person.ort}</span>
        </div>
      </div>
    </div>
  );
}

export default function Page() {
  const [personen, setPersonen] = useState<Person[]>(STANDARD);
  const [aktiv, setAktiv] = useState(0);
  const [geladen, setGeladen] = useState(false);
  const [stand, setStand] = useState("");
  const [gross, setGross] = useState<null | "vorn" | "hinten">(null);
  const [loeschFrage, setLoeschFrage] = useState(false);
  const [druckt, setDruckt] = useState(false);
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
    setGeladen(true);
  }, []);

  // ── Ablage schreiben (erst nach dem Lesen, sonst überschreibt der Standard) ──
  useEffect(() => {
    if (!geladen) return;
    localStorage.setItem(SPEICHER, JSON.stringify(personen));
  }, [personen, geladen]);

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
  function drucken() { setDruckt(true); }

  useEffect(() => {
    if (!druckt) return;
    const alt = document.title;
    const wer = (person.name || "Baier").replace(/[^\wÄÖÜäöüß]+/g, "_");
    document.title = `Visitenkarte_${wer}_${zeitstempel()}`;
    document.body.classList.add("vk-druck");
    const aufraeumen = () => {
      document.body.classList.remove("vk-druck");
      document.title = alt;
      setDruckt(false);
    };
    window.addEventListener("afterprint", aufraeumen, { once: true });
    // erst drucken, wenn das Druckblatt wirklich im Dokument steht
    const zeit = setTimeout(() => window.print(), 120);
    return () => {
      clearTimeout(zeit);
      window.removeEventListener("afterprint", aufraeumen);
      document.body.classList.remove("vk-druck");
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
    const variablen = `.vk-wurzel{${Object.entries(grafiken).map(([k, v]) => `${k}:${v}`).join(";")}}`;
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
    }
    window.addEventListener("keydown", taste);
    return () => window.removeEventListener("keydown", taste);
  }, [gross]);

  const variablen = useMemo(() => grafiken as React.CSSProperties, [grafiken]);

  return (
    <div className="vk-wurzel" ref={wurzelRef} style={variablen}>
      <h1 style={{ fontSize: "1.4rem", fontWeight: 600, marginBottom: 16 }}>Visitenkarten</h1>

      {/* ── Bedienfeld ── */}
      <div className="card" style={{ padding: 16, display: "grid", gap: 12 }}>
        <div className="feld-zeile feld-zeile-2">
          <label style={{ display: "grid", gap: 4 }}>
            <span className="muted" style={{ fontSize: 12 }}>Person</span>
            <select className="input" value={aktiv} onChange={e => setAktiv(Number(e.target.value))}>
              {personen.map((p, i) => (
                <option key={p.id} value={i}>{p.name}{p.rolle ? ` – ${p.rolle}` : ""}</option>
              ))}
            </select>
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
            <select className="input" value={person.firma}
                    onChange={e => aendern("firma", e.target.value)}>
              <option value="handel">Baier Handel &amp; Vertrieb</option>
              <option value="ing">IngPro Baier</option>
              <option value="masch">Baier Maschinen</option>
              <option value="group">Baier Group</option>
            </select>
          </label>
          <label style={{ display: "grid", gap: 4 }}>
            <span className="muted" style={{ fontSize: 12 }}>Ort</span>
            <input className="input" value={person.ort} onChange={e => aendern("ort", e.target.value)} />
          </label>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
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
          <Karte person={person} seite="vorn" karteRef={vornRef} />
          <figcaption>Vorderseite</figcaption>
        </figure>
        <figure onClick={() => setGross("hinten")}>
          <Karte person={person} seite="hinten" karteRef={hintenRef} />
          <figcaption>Rückseite</figcaption>
        </figure>
      </div>

      {/* ── Großansicht ── */}
      {gross && (
        <div className="kansicht" onClick={e => { if (e.target === e.currentTarget) setGross(null); }}>
          <button className="zu" onClick={() => setGross(null)} aria-label="Schließen">×</button>
          <Karte person={person} seite={gross} />
          <div className="werkzeuge">
            <button className={"kbtn" + (gross === "vorn" ? " aktiv" : "")}
                    onClick={() => setGross("vorn")}>Vorderseite</button>
            <button className={"kbtn" + (gross === "hinten" ? " aktiv" : "")}
                    onClick={() => setGross("hinten")}>Rückseite</button>
            <button className="kbtn" onClick={drucken}>Drucken</button>
          </div>
          <div className="hinweis">Esc schließt · Pfeiltasten wechseln die Seite</div>
        </div>
      )}

      {/* ── Druckblatt: hängt direkt am Body, damit es genau eine Seite füllt ── */}
      {druckt && createPortal(
        <div className="vk-wurzel vk-druckblatt" style={variablen}>
          <Karte person={person} seite="vorn" />
          <Karte person={person} seite="hinten" />
        </div>,
        document.body,
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
