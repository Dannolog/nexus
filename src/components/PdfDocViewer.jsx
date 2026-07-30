"use client";
import React, { useRef, useEffect, useState, useLayoutEffect } from "react";
// pdf.js v4 nutzt Promise.withResolvers – in älteren Browsern nachrüsten (sonst weiße Seite)
if (typeof Promise.withResolvers !== "function") {
  Promise.withResolvers = function () { let resolve, reject; const promise = new Promise((res, rej) => { resolve = res; reject = rej; }); return { promise, resolve, reject }; };
}
import * as pdfjsLib from "pdfjs-dist";
// Worker liegt als Kopie in /public (Next.js kennt Vites "?url"-Import nicht)
const workerUrl = "/pdf.worker.min.mjs";
import { Search, Minus, Plus, ChevronLeft, ChevronRight, ChevronDown, Columns2, X as XIcon, File as FileIcon, StretchVertical, StretchHorizontal, Pencil, Check, Trash2, GripVertical, FilePlus, MoreHorizontal, Copy, RotateCw, Type, ListChecks } from "lucide-react";
import RailInsert from "./RailInsert";
import { usePeers, PeerBadge } from "./LivePeers";
try { pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl; } catch (_) { /* ignore */ }

const SANS = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
const clampScale = (v) => Math.max(0.5, Math.min(4, v));

// PDF-Viewer im Kontor-Stil: Canvas + Text-Koordinaten.
// armed → 1 Finger / Maus zieht einen Rahmen → Text per onRegionText übernehmen.
// Strg+Mausrad zoomt; 2 Finger = Pinch-Zoom + Verschieben.
// Einfügepunkt zwischen Seiten-Thumbnails (Linie + „+" beim Hovern) → gemeinsame Komponente

export default function PdfDocViewer({ url, T, armed, onRegionText, armedLabel, armedKey, marks: marksProp, onMarksChange, onMarkActivate, tableMode, onTableRegion, onOcrRegion, onSavePdf }) {
  const canvasRef = useRef(null);
  const scrollRef = useRef(null);
  const rootRef = useRef(null); // ganzer Viewer – fängt Strg+Rad überall ab (nicht nur im Scrollbereich)
  const docRef = useRef(null);
  const moreBtnRef = useRef(null); // Position für das (nicht mehr geclippte) Überlaufmenü
  const [numPages, setNumPages] = useState(0);
  const [page, setPage] = useState(1);
  const [rotations, setRotations] = useState({}); // Seitendrehung nur für die Ansicht: pageNum -> 0/90/180/270
  const rotateCurrent = () => setRotations((r) => ({ ...r, [page]: (((r[page] || 0) + 90) % 360) }));
  const [items, setItems] = useState([]);
  const regionMode = !!onRegionText || !!onTableRegion; // Belegerfassung/Region-Auswahl → Einzelseite
  const [scale, setScale] = useState(1); // 1 = an Breite anpassen (ganze Seite sofort sichtbar), zoombar. Auch die Belegerfassung startet so, statt hineingezoomt.
  const [busy, setBusy] = useState(true);
  const [progress, setProgress] = useState(null); // Download-Fortschritt 0–100 (null = unbestimmt)
  const [err, setErr] = useState("");
  const [selRect, setSelRect] = useState(null);
  const [q, setQ] = useState("");
  const [qFocus, setQFocus] = useState(false);
  const [pageTexts, setPageTexts] = useState([]); // Volltext je Seite (für seitenübergreifende Suche)
  const [thumbs, setThumbs] = useState([]); // Seiten-Vorschaubilder (links)
  const [wide, setWide] = useState(() => typeof window !== "undefined" && window.innerWidth >= 760);
  const [showRail, setShowRail] = useState(() => typeof window !== "undefined" && window.innerWidth >= 760); // mobil: standardmäßig aus
  const [searchOpen, setSearchOpen] = useState(false); // mobil: Suchleiste aus der Lupe aufgeklappt
  const [moreMenu, setMoreMenu] = useState(false);      // mobil: Überlaufmenü (⋯) offen
  // Seiten bearbeiten: umsortieren (Drag&Drop) + Leerseiten einfügen + als neues PDF speichern
  const [editMode, setEditMode] = useState(false);
  const [order, setOrder] = useState([]); // Arbeitsreihenfolge der Seiten: { k, orig?:1-basiert, blank?:true }
  const [savingPdf, setSavingPdf] = useState(false);
  // ── Text ins PDF schreiben (Nexus-Ergänzung) ──
  // textMode: Klick auf die Seite setzt ein Textfeld; beim Speichern werden die Texte
  // mit pdf-lib fest ins PDF gezeichnet. Formularfelder (AcroForm) lassen sich in einer
  // eigenen Leiste ausfüllen und bleiben danach weiter ausfüllbar.
  const [textMode, setTextMode] = useState(false);
  const [texts, setTexts] = useState([]);        // { key, page, x, y, size, value }
  const [aktiverText, setAktiverText] = useState(null);
  const [formPanel, setFormPanel] = useState(false);
  const [formFelder, setFormFelder] = useState([]); // { name, type, value }
  const [formWerte, setFormWerte] = useState({});
  // Positionen der Formularfelder auf der angezeigten Seite → direkt im Dokument ausfüllbar
  const [feldBoxen, setFeldBoxen] = useState([]); // { name, art, x, y, w, h, mehrzeilig, optionen, anStatus }
  const [saveMenu, setSaveMenu] = useState(false); // Dropdown „Speichern neu"
  const [dragSlot, setDragSlot] = useState(null); // Index in order während des Umsortierens
  const bytesRef = useRef(null); // Original-PDF-Bytes (für pdf-lib)
  const formWerteStart = useRef({}); // Formularwerte beim Laden – Vergleich für „geändert?"
  // Anzeigemodus: einzelne Seite (mit Belegerfassung) | fortlaufend vertikal | fortlaufend horizontal
  // Standard beim reinen Ansehen: fortlaufend vertikal (durch alle Seiten scrollen); Belegerfassung bleibt Einzelseite
  const [flow, setFlow] = useState(regionMode ? "single" : "vert");
  const flowMode = flow !== "single" && !armed; // fortlaufend nur im reinen Lesemodus
  const flowRef = useRef(null); // Scroll-Container im Fortlaufend-Modus
  const [docTick, setDocTick] = useState(0); // signalisiert, dass docRef.current bereit ist
  const [flowSize, setFlowSize] = useState({ w: 800, h: 600 });
  useEffect(() => {
    if (!flowMode) return;
    const el = flowRef.current; if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setFlowSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el); setFlowSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, [flowMode]);
  // Gewollter Seiten-Sprung (Rail/Suche/Buttons): während des Scrollens die Scroll-Erkennung sperren,
  // sonst kämpfen „zu Seite scrollen" und „Seite aus Scrollposition ableiten" gegeneinander (springt hin und zurück).
  const gotoRef = useRef(0);
  const goToPage = (p) => { gotoRef.current = Date.now() + 800; setPage((cur) => (typeof p === "function" ? p(cur) : p)); };
  // im Fortlaufend-Modus die aktuell sichtbare Seitenzahl aus der Scrollposition ableiten
  const onFlowScroll = () => {
    if (Date.now() < gotoRef.current) return; // programmatischer Sprung läuft → nicht überschreiben
    const el = flowRef.current; if (!el) return;
    const horiz = flow === "horiz";
    const center = horiz ? el.scrollLeft + el.clientWidth / 2 : el.scrollTop + el.clientHeight / 2;
    let best = 1, bestD = Infinity;
    el.querySelectorAll("[data-flowpage]").forEach((n) => {
      const p = +n.getAttribute("data-flowpage");
      const c = horiz ? n.offsetLeft + n.offsetWidth / 2 : n.offsetTop + n.offsetHeight / 2;
      const d = Math.abs(c - center); if (d < bestD) { bestD = d; best = p; }
    });
    if (best !== page) setPage(best);
  };
  // zu einer Seite scrollen – NUR bei gewolltem Sprung (goToPage), nicht wenn die Seite aus der Scrollposition kam
  useEffect(() => {
    if (!flowMode || Date.now() > gotoRef.current) return;
    const el = flowRef.current; if (!el) return;
    const n = el.querySelector(`[data-flowpage="${page}"]`); if (!n) return;
    if (flow === "horiz") el.scrollTo({ left: n.offsetLeft - 12, behavior: "smooth" });
    else el.scrollTo({ top: n.offsetTop - 12, behavior: "smooth" });
  }, [page, flowMode, flow]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const h = () => setWide(window.innerWidth >= 760); window.addEventListener("resize", h); return () => window.removeEventListener("resize", h); }, []);
  // Seiten-Vorschaubilder im Hintergrund rendern (nur Mehrseiter)
  useEffect(() => {
    const doc = docRef.current; if (!doc || numPages < 2) { setThumbs([]); return; }
    let cancelled = false;
    (async () => {
      const out = [];
      for (let p = 1; p <= Math.min(numPages, 80); p++) {
        if (cancelled) return;
        try {
          const pg = await doc.getPage(p);
          const vp = pg.getViewport({ scale: 1 });
          // Miniaturen mit erhöhter Auflösung rendern (Anzeige ~160 px, aber auf Retina-Displays
          // 2× Pixel → sonst verpixelt). Breite 340 px deckt hochauflösende Schirme sauber ab.
          const v = pg.getViewport({ scale: 340 / vp.width });
          const cv = document.createElement("canvas"); cv.width = v.width; cv.height = v.height;
          const tctx = cv.getContext("2d");
          // WICHTIG: erst WEISS fuellen. Wir exportieren als JPEG (kein Alpha) – ohne weissen
          // Grund werden transparente PDF-Hintergruende beim JPEG-Export komplett SCHWARZ.
          tctx.fillStyle = "#fff"; tctx.fillRect(0, 0, cv.width, cv.height);
          await pg.render({ canvasContext: tctx, viewport: v }).promise;
          if (cancelled) return;
          out[p] = cv.toDataURL("image/jpeg", 0.85); setThumbs([...out]);
        } catch (_) { /* Seite überspringen */ }
      }
    })();
    return () => { cancelled = true; };
  }, [numPages]);
  // Markierungen: vom Parent gesteuert (controlled), sonst intern. Normalisiert (scale 1), je { key, label, text, page, x, y, w, h }
  const [marksInt, setMarksInt] = useState([]);
  const controlled = Array.isArray(marksProp);
  const marks = controlled ? marksProp : marksInt;
  const marksRef = useRef(marks); marksRef.current = marks;
  const setMarks = (updater) => {
    const next = typeof updater === "function" ? updater(marksRef.current) : updater;
    marksRef.current = next;
    if (controlled) { onMarksChange && onMarksChange(next); } else setMarksInt(next);
  };
  const panRef = useRef(null);
  const searchRef = useRef(null);
  const pageRef = useRef(page); pageRef.current = page;
  const renderTaskRef = useRef(null);
  // Refs für native Event-Listener (kein stale closure)
  const scaleRef = useRef(scale); scaleRef.current = scale;
  const zoomAnchorRef = useRef(null); // Zoom auf Mausposition: { cx, cy, sl, st, ratio }
  const itemsRef = useRef(items); itemsRef.current = items;
  const armedRef = useRef(armed); armedRef.current = armed;
  const armedKeyRef = useRef(armedKey); armedKeyRef.current = armedKey;
  const armedLabelRef = useRef(armedLabel); armedLabelRef.current = armedLabel;
  // Callback-Refs: verhindern veralteten Closure-Stand (v. a. im Touch-Pfad) → immer der NEUE Text/Key
  const onRegionTextRef = useRef(onRegionText); onRegionTextRef.current = onRegionText;
  const onMarkActivateRef = useRef(onMarkActivate); onMarkActivateRef.current = onMarkActivate;
  const tableModeRef = useRef(tableMode); tableModeRef.current = tableMode;
  const onTableRegionRef = useRef(onTableRegion); onTableRegionRef.current = onTableRegion;
  const onOcrRegionRef = useRef(onOcrRegion); onOcrRegionRef.current = onOcrRegion;
  const [ocrBusy, setOcrBusy] = useState(false);
  const selStartRef = useRef(null);
  const selRectRef = useRef(null);
  const setRect = (r) => { selRectRef.current = r; setSelRect(r); };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setBusy(true); setProgress(null); setErr(""); if (!controlled) setMarksInt([]); // neues Dokument → alte Markierungen verwerfen (nur intern; controlled verwaltet der Parent)
      try {
        const resp = await fetch(url); if (!resp.ok) throw new Error("fetch");
        // Stream lesen → echter Ladebalken (Prozent), wenn die Größe bekannt ist
        const total = +(resp.headers.get("content-length") || 0);
        let data;
        if (resp.body && resp.body.getReader) {
          const reader = resp.body.getReader(); const chunks = []; let received = 0;
          for (;;) { const { done, value } = await reader.read(); if (done) break; if (cancelled) return; chunks.push(value); received += value.length; if (total) setProgress(Math.min(99, Math.round((received / total) * 100))); }
          data = new Uint8Array(received); let pos = 0; for (const c of chunks) { data.set(c, pos); pos += c.length; }
        } else { data = new Uint8Array(await resp.arrayBuffer()); }
        if (cancelled) return; setProgress(100);
        const doc = await pdfjsLib.getDocument({ data }).promise; if (cancelled) return;
        docRef.current = doc; bytesRef.current = data; setNumPages(doc.numPages); setPage(1); setBusy(false); setDocTick((t) => t + 1);
        setTexts([]); setAktiverText(null); setTextMode(false);
        // Vorhandene Formularfelder (AcroForm) einlesen – damit lassen sich Anträge direkt ausfüllen
        (async () => {
          try {
            const { PDFDocument, PDFName } = await import("pdf-lib");
            const d2 = await PDFDocument.load(data, { ignoreEncryption: true });
            const form2 = d2.getForm();
            const felder = form2.getFields().map((f) => ({ name: f.getName(), type: f.constructor.name }));
            const werte = {};
            for (const f of felder) {
              try {
                if (f.type === "PDFTextField") werte[f.name] = form2.getTextField(f.name).getText() || "";
                else if (f.type === "PDFCheckBox") {
                  const cb = form2.getCheckBox(f.name);
                  const v = cb.acroField.dict.get(PDFName.of("V"));
                  const zustand = v ? String(v).replace(/^\//, "") : "";
                  werte[f.name] = zustand && zustand !== "Off" ? zustand : "";
                }
                else if (f.type === "PDFRadioGroup") werte[f.name] = form2.getRadioGroup(f.name).getSelected() || "";
              } catch { werte[f.name] = ""; }
            }
            if (!cancelled) { setFormFelder(felder.filter((f) => f.type === "PDFTextField")); setFormWerte(werte); formWerteStart.current = { ...werte }; }
          } catch { if (!cancelled) { setFormFelder([]); setFormWerte({}); formWerteStart.current = {}; } }
        })();
        setEditMode(false); setOrder(Array.from({ length: doc.numPages }, (_, i) => ({ k: "p" + (i + 1) + "-" + Math.random().toString(36).slice(2, 6), orig: i + 1 })));
        // Volltext je Seite für die Suche (im Hintergrund)
        const texts = [];
        for (let p = 1; p <= doc.numPages; p++) { if (cancelled) return; const pg = await doc.getPage(p); const tc = await pg.getTextContent(); texts[p] = tc.items.map((i) => i.str).join(" ").toLowerCase(); }
        if (!cancelled) setPageTexts(texts);
      } catch (e) { if (!cancelled) { setErr("PDF konnte nicht geladen werden"); setBusy(false); } }
    })();
    return () => { cancelled = true; };
  }, [url]);

  // Wer betrachtet/bearbeitet dieses Dokument gerade noch? (gleicher Raum wie die Bemalung)
  const peers = usePeers(url ? `doc:${url}` : null);

  // ---- Seiten bearbeiten: Umsortieren, Leerseiten, Speichern (pdf-lib) ----
  const genKey = (pfx) => pfx + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const moveSlot = (from, to) => setOrder((o) => { if (from === to || from == null) return o; const a = [...o]; const [m] = a.splice(from, 1); a.splice(to > from ? to - 1 : to, 0, m); return a; });
  const insertBlankAt = (i) => setOrder((o) => { const a = [...o]; a.splice(i, 0, { k: genKey("b"), blank: true }); return a; });
  const removeSlot = (i) => setOrder((o) => (o.length > 1 ? o.filter((_, j) => j !== i) : o));
  // Vorhandene Seite duplizieren: gleicher orig-Verweis. copyPages kopiert denselben
  // Quellindex problemlos mehrfach, daher genügt ein zusätzlicher Slot.
  const duplicateSlot = (i) => setOrder((o) => { const a = [...o]; const s = a[i]; if (!s) return o; a.splice(i + 1, 0, { ...s, k: genKey("d") }); return a; });
  const seitenGeaendert = editMode && (order.length !== numPages || order.some((s, i) => s.blank || s.orig !== i + 1));
  const texteVorhanden = texts.some((t) => String(t.value || "").trim());
  const formularGeaendert = Object.keys(formWerte).some((k) => (formWerte[k] || "") !== (formWerteStart.current[k] || ""));
  const edited = seitenGeaendert || texteVorhanden || formularGeaendert;
  const savePdf = async (replace) => {
    if (!bytesRef.current || !onSavePdf || !order.length) return; // order wird beim Laden gefüllt
    setSaveMenu(false); setSavingPdf(true); setErr("");
    try {
      const { PDFDocument, StandardFonts, rgb, PDFName } = await import("pdf-lib");
      const src = await PDFDocument.load(bytesRef.current);

      // 1) Formularfelder ausfüllen – direkt in der Quelle, damit das Formular erhalten bleibt
      const formAenderungen = Object.keys(formWerte).filter((k) => (formWerte[k] || "") !== (formWerteStart.current[k] || ""));
      if (formAenderungen.length) {
        const f = src.getForm();
        for (const name of formAenderungen) {
          const wert = formWerte[name] || "";
          try {
            f.getTextField(name).setText(wert);
            continue;
          } catch { /* kein Textfeld → weiter probieren */ }
          try {
            const k = f.getCheckBox(name);
            // Diese Formulare nutzen Kästchen-Gruppen wie Auswahlknöpfe: jedes Widget hat
            // einen eigenen „An"-Zustand (/0, /1, …). Deshalb den Zustand direkt setzen
            // und die sichtbare Markierung (/AS) je Widget nachziehen.
            const ziel = wert || "Off";
            k.acroField.dict.set(PDFName.of("V"), PDFName.of(ziel));
            for (const widget of k.acroField.getWidgets()) {
              let zustaende = [];
              try {
                const normal = widget.getAppearances()?.normal;
                zustaende = normal?.dict ? [...normal.dict.keys()].map((x) => String(x).replace(/^\//, "")) : [];
              } catch { zustaende = []; }
              widget.dict.set(PDFName.of("AS"), PDFName.of(zustaende.includes(ziel) ? ziel : "Off"));
            }
            continue;
          } catch { /* kein Kästchen → weiter probieren */ }
          try {
            const g = f.getRadioGroup(name);
            if (wert) g.select(wert);
            else if (typeof g.clear === "function") g.clear();
          } catch { /* Feld fehlt → überspringen */ }
        }
        try { f.updateFieldAppearances(); } catch { /* Aussehen bleibt wie gehabt */ }
      }

      // 2) Freie Texte fest ins PDF zeichnen (auf die jeweilige Originalseite)
      const zuZeichnen = texts.filter((t) => String(t.value || "").trim());
      if (zuZeichnen.length) {
        const font = await src.embedFont(StandardFonts.Helvetica);
        for (const t of zuZeichnen) {
          const seite = src.getPages()[t.page - 1];
          if (!seite) continue;
          const { height } = seite.getSize();
          const groesse = t.size || 11;
          // Bildschirm-Koordinaten (oben links) → PDF-Koordinaten (unten links)
          String(t.value).split("\n").forEach((zeile, i) => {
            seite.drawText(zeile, {
              x: t.x,
              y: height - t.y - groesse - i * (groesse * 1.25),
              size: groesse,
              font,
              color: rgb(0.06, 0.09, 0.16),
            });
          });
        }
      }

      // 3) Seitenreihenfolge/Leerseiten anwenden – aber nur, wenn wirklich etwas umsortiert
      // wurde. Wichtig: Beim Kopieren der Seiten in ein neues Dokument gehen die
      // ausfüllbaren Formularfelder verloren (die Inhalte bleiben sichtbar). Ohne
      // Seitenänderung wird deshalb direkt gespeichert und das Formular bleibt erhalten.
      let bytes;
      if (!seitenGeaendert) {
        bytes = await src.save();
      } else {
        const zwischen = await PDFDocument.load(await src.save({ updateFieldAppearances: false }), { ignoreEncryption: true });
        const out = await PDFDocument.create();
        const first = zwischen.getPage(0).getSize();
        const idxList = order.filter((s) => s.orig).map((s) => s.orig - 1);
        const copied = idxList.length ? await out.copyPages(zwischen, idxList) : [];
        let ci = 0;
        for (const s of order) { if (s.orig) out.addPage(copied[ci++]); else out.addPage([first.width, first.height]); }
        bytes = await out.save();
      }
      await onSavePdf(new Blob([bytes], { type: "application/pdf" }), { replace: !!replace });
      setEditMode(false); setTexts([]); setAktiverText(null); setTextMode(false);
      formWerteStart.current = { ...formWerte };
    } catch (e) { setErr("Speichern fehlgeschlagen: " + (e.message || e)); }
    setSavingPdf(false);
  };

  useEffect(() => {
    const doc = docRef.current; if (!doc || !numPages) return;
    let cancelled = false;
    (async () => {
      try {
        const pg = await doc.getPage(page);
        const rot = (((pg.rotate + (rotations[page] || 0)) % 360) + 360) % 360; // intrinsische + Ansichtsdrehung
        const viewport = pg.getViewport({ scale, rotation: rot });
        const canvas = canvasRef.current; if (!canvas) return;
        // laufenden Render abbrechen (sonst kollidieren mehrere render() beim schnellen Zoomen → verzerrtes Bild)
        if (renderTaskRef.current) { try { renderTaskRef.current.cancel(); } catch (_) {} renderTaskRef.current = null; }
        canvas.width = Math.floor(viewport.width); canvas.height = Math.floor(viewport.height);
        // Zoom auf Mausposition: Scroll so verschieben, dass der Punkt unter dem Cursor fix bleibt
        const za = zoomAnchorRef.current;
        if (za && scrollRef.current) {
          const el = scrollRef.current; void el.scrollWidth; // Reflow erzwingen (neue Canvas-Größe)
          el.scrollLeft = Math.max(0, (za.sl + za.cx) * za.ratio - za.cx);
          el.scrollTop = Math.max(0, (za.st + za.cy) * za.ratio - za.cy);
          zoomAnchorRef.current = null;
        }
        const ctx = canvas.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
        const task = pg.render({ canvasContext: ctx, viewport });
        renderTaskRef.current = task;
        await task.promise;
        renderTaskRef.current = null;
        if (cancelled) return;
        const tc = await pg.getTextContent();
        const its = [];
        for (const it of tc.items) {
          if (!it.str || !it.str.trim()) continue;
          const [cx, cy] = viewport.convertToViewportPoint(it.transform[4], it.transform[5]);
          const h = (it.height || Math.abs(it.transform[3]) || 8) * scale;
          its.push({ str: it.str, x: cx, y: cy - h, w: it.width * scale, h: h + 2 });
        }
        if (!cancelled) setItems(its);

        // Formularfelder (AcroForm-Widgets) der Seite einmessen – daraus werden echte
        // Eingabefelder über dem Dokument, sodass man direkt hineinschreiben kann.
        try {
          const annos = await pg.getAnnotations({ intent: "display" });
          const boxen = [];
          for (const a of annos) {
            if (a.subtype !== "Widget" || !a.fieldName) continue;
            const [x1, y1, x2, y2] = viewport.convertToViewportRectangle(a.rect);
            const x = Math.min(x1, x2), y = Math.min(y1, y2);
            const w = Math.abs(x2 - x1), h = Math.abs(y2 - y1);
            if (w < 4 || h < 4) continue;
            const art = a.fieldType === "Tx" ? "text" : a.fieldType === "Btn" ? (a.radioButton ? "radio" : "check") : a.fieldType === "Ch" ? "auswahl" : "";
            if (!art) continue;
            boxen.push({
              name: a.fieldName, art, x, y, w, h,
              mehrzeilig: !!a.multiLine,
              readOnly: !!a.readOnly,
              optionen: (a.options || []).map((o) => (typeof o === "string" ? o : o.exportValue ?? o.displayValue)),
              anStatus: a.buttonValue ?? a.exportValue ?? "",
            });
          }
          if (!cancelled) setFeldBoxen(boxen);
        } catch { if (!cancelled) setFeldBoxen([]); }
      } catch (_) { /* RenderingCancelled o. Ä. ignorieren */ }
    })();
    return () => { cancelled = true; if (renderTaskRef.current) { try { renderTaskRef.current.cancel(); } catch (_) {} renderTaskRef.current = null; } };
  }, [page, scale, numPages, rotations, flowMode]); // flowMode: beim Wechsel auf Einzelseite ist das Canvas erst dann gemountet → neu rendern

  const canvasRel = (cx, cy) => { const r = canvasRef.current.getBoundingClientRect(); return { x: cx - r.left, y: cy - r.top }; };
  const beginSel = (cx, cy) => { const p = canvasRel(cx, cy); selStartRef.current = p; setRect({ x: p.x, y: p.y, w: 0, h: 0 }); };
  const moveSel = (cx, cy) => { const s = selStartRef.current; if (!s) return; const p = canvasRel(cx, cy); setRect({ x: Math.min(p.x, s.x), y: Math.min(p.y, s.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y) }); };
  // Text aller Text-Items, deren Mittelpunkt in r liegt (r in Screen-/Scale-Koordinaten)
  const textInRect = (r) => {
    const sel = itemsRef.current.filter((i) => { const cx = i.x + i.w / 2, cy = i.y + i.h / 2; return cx >= r.x && cx <= r.x + r.w && cy >= r.y && cy <= r.y + r.h; });
    if (!sel.length) return "";
    return sel.sort((a, b) => (Math.abs(a.y - b.y) > 6 ? a.y - b.y : a.x - b.x)).map((i) => i.str).join(" ").replace(/\s+/g, " ").trim();
  };
  // Alle Text-Items, deren Mittelpunkt in r liegt (mit Koordinaten – für Tabellen-Erkennung)
  const itemsInRect = (r) => itemsRef.current.filter((i) => { const cx = i.x + i.w / 2, cy = i.y + i.h / 2; return cx >= r.x && cx <= r.x + r.w && cy >= r.y && cy <= r.y + r.h; }).map((i) => ({ str: i.str, x: i.x, y: i.y, w: i.w, h: i.h }));
  const endSel = () => {
    const r = selRectRef.current; selStartRef.current = null;
    if (!r || r.w < 5 || r.h < 5) { setRect(null); return; }
    // Tabellen-Modus: ganzen Positionsblock auf einmal auslesen
    if (tableModeRef.current && onTableRegionRef.current) { const its = itemsInRect(r); if (its.length) onTableRegionRef.current(its); setRect(null); return; }
    const sc = scaleRef.current || 1;
    const key = armedKeyRef.current || "";
    const text = textInRect(r);
    if (text) {
      const nm = { key, label: armedLabelRef.current || "", text, page: pageRef.current, x: r.x / sc, y: r.y / sc, w: r.w / sc, h: r.h / sc };
      if (onRegionTextRef.current) onRegionTextRef.current(text); // füllt das aktive Feld mit dem NEU erkannten Text
      setMarks((m) => [...m.filter((x) => x.key !== key), nm]); // pro Feld nur eine Markierung – alte ersetzen
    } else if (itemsRef.current.length === 0 && onOcrRegionRef.current) {
      // Gescannte Seite (keine Textebene): Bereich aus dem Canvas ausschneiden → OCR
      const dataUrl = cropCanvas(r);
      const nm = { key, label: armedLabelRef.current || "", text: "", page: pageRef.current, x: r.x / sc, y: r.y / sc, w: r.w / sc, h: r.h / sc };
      setMarks((m) => [...m.filter((x) => x.key !== key), nm]);
      if (dataUrl) {
        setOcrBusy(true);
        Promise.resolve(onOcrRegionRef.current(dataUrl)).then((t) => {
          if (t && onRegionTextRef.current) { onRegionTextRef.current(t); setMarks((arr) => arr.map((x) => (x.key === key ? { ...x, text: t } : x))); }
        }).finally(() => setOcrBusy(false));
      }
    }
    setRect(null);
  };
  // Aufgezogenen Bereich aus dem gerenderten Canvas als PNG-DataURL ausschneiden (für OCR)
  const cropCanvas = (r) => {
    try {
      const cv = canvasRef.current; if (!cv) return "";
      const w = Math.max(1, Math.round(r.w)), h = Math.max(1, Math.round(r.h));
      const off = document.createElement("canvas"); off.width = w; off.height = h;
      off.getContext("2d").drawImage(cv, r.x, r.y, r.w, r.h, 0, 0, w, h);
      return off.toDataURL("image/png");
    } catch (_) { return ""; }
  };
  // Eine gesetzte Markierung verschieben (Maus): Position aktualisieren, beim Loslassen Text an neuer Stelle ins zugehörige Feld übernehmen
  const startMarkDrag = (e, m) => {
    if (e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    const sc = scaleRef.current || 1;
    const start = { x: e.clientX, y: e.clientY };
    const live = { x: m.x, y: m.y };
    let moved = false;
    const mm = (ev) => {
      if (Math.abs(ev.clientX - start.x) > 2 || Math.abs(ev.clientY - start.y) > 2) moved = true;
      live.x = m.x + (ev.clientX - start.x) / sc;
      live.y = m.y + (ev.clientY - start.y) / sc;
      setMarks((arr) => arr.map((x) => (x.key === m.key ? { ...x, x: live.x, y: live.y } : x)));
    };
    const mu = () => {
      window.removeEventListener("mousemove", mm); window.removeEventListener("mouseup", mu);
      if (!moved) { if (onMarkActivateRef.current) onMarkActivateRef.current(m.key); return; } // reiner Klick → Feld erneut aktivieren
      const rect = { x: live.x * sc, y: live.y * sc, w: m.w * sc, h: m.h * sc };
      const text = textInRect(rect);
      if (text && onRegionTextRef.current) onRegionTextRef.current(text, m.key); // NEUEN Text an neuer Stelle ins Feld der Markierung
      if (text) setMarks((arr) => arr.map((x) => (x.key === m.key ? { ...x, text } : x)));
    };
    window.addEventListener("mousemove", mm); window.addEventListener("mouseup", mu);
  };
  const removeMark = (key) => setMarks((arr) => arr.filter((x) => x.key !== key));

  // Maus: armed → Rahmen aufziehen; sonst → Dokument verschieben (Linksklick-Pan).
  // mousemove/up an window, damit das Ziehen auch außerhalb des Canvas weiterläuft.
  const onMouseDown = (e) => {
    // Textmodus: Linksklick setzt an dieser Stelle ein neues Textfeld
    if (textMode && e.button === 0) {
      e.preventDefault();
      const p = canvasRel(e.clientX, e.clientY);
      const key = "t" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
      setTexts((arr) => [...arr, { key, page, x: p.x / scale, y: p.y / scale, size: 11, value: "" }]);
      setAktiverText(key);
      return;
    }
    if (e.button !== 0 && e.button !== 2) return; e.preventDefault();
    // Linksklick im Rahmen-Modus zeichnet; Rechtsklick (oder Linksklick ohne Rahmen-Modus) verschiebt immer
    const drawing = armed && e.button === 0;
    if (drawing) beginSel(e.clientX, e.clientY);
    else panRef.current = { x: e.clientX, y: e.clientY };
    const mm = (ev) => {
      if (drawing && selStartRef.current) moveSel(ev.clientX, ev.clientY);
      else if (panRef.current && scrollRef.current) { const s = scrollRef.current; s.scrollLeft -= ev.clientX - panRef.current.x; s.scrollTop -= ev.clientY - panRef.current.y; panRef.current = { x: ev.clientX, y: ev.clientY }; }
    };
    const mu = () => { if (drawing) endSel(); panRef.current = null; window.removeEventListener("mousemove", mm); window.removeEventListener("mouseup", mu); };
    window.addEventListener("mousemove", mm); window.addEventListener("mouseup", mu);
  };

  // Native Listener: Strg+Wheel-Zoom (BEIDE Modi), 1-Finger (Rahmen/Pan), 2-Finger (Pinch+Pan).
  // WICHTIG: Der Zoom-Handler haengt am STABILEN rootRef (immer vorhanden) und liest den aktiven
  // Scroll-Container erst zur Laufzeit (scrollRef = Einzelseite, flowRef = Fortlauf). Frueher
  // brach der Effect bei fehlendem scrollRef ab → im Fortlauf-Modus war GAR KEIN Strg+Rad-Zoom
  // registriert und die HTML-Seite zoomte. Deshalb Abhaengigkeit von flowMode (Neuregistrierung
  // beim Moduswechsel) und Container/Anker dynamisch.
  useEffect(() => {
    const root = rootRef.current; if (!root) return;
    const onWheel = (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const el = scrollRef.current || flowRef.current; if (!el) return;
      const r = el.getBoundingClientRect();
      // Sanfter, PROPORTIONALER Zoom: Faktor richtet sich nach der Rad-/Touchpad-Bewegung, pro Event
      // aber gedeckelt (±120), damit sich viele schnelle Events (Momentum-Rad/Touchpad) nicht zu einem
      // 50%→400%-Sprung aufsummieren. exp() hält das Zoomen gleichmäßig über den ganzen Bereich.
      const dy = Math.max(-120, Math.min(120, e.deltaY || 0));
      const old = scaleRef.current;
      const next = clampScale(+(old * Math.exp(-dy * 0.0011)).toFixed(3));
      if (next === old) return;
      const anchor = { cx: e.clientX - r.left, cy: e.clientY - r.top, sl: el.scrollLeft, st: el.scrollTop, ratio: next / old };
      if (scrollRef.current) zoomAnchorRef.current = anchor; else flowZoomAnchor.current = anchor; // richtiger Anker je Modus
      scaleRef.current = next; // sofort, damit schnelle aufeinanderfolgende Ticks korrekt aufbauen
      setScale(next);
    };
    root.addEventListener("wheel", onWheel, { passive: false });
    // Touch-Gesten (Rahmen/Pan/Pinch) nur im Einzelseiten-Modus (scrollRef); der Fortlauf-Modus
    // hat eigene Touch-Handler auf flowRef.
    const el = scrollRef.current;
    let cleanupTouch = () => {};
    if (el) {
      let pinch = null, pan = null;
      const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
      const mid = (t) => ({ x: (t[0].clientX + t[1].clientX) / 2, y: (t[0].clientY + t[1].clientY) / 2 });
      const onTS = (e) => {
        if (e.touches.length === 2) { selStartRef.current = null; setRect(null); pan = null; const m = mid(e.touches); pinch = { d: dist(e.touches), s: scaleRef.current, x: m.x, y: m.y }; }
        else if (e.touches.length === 1) { pinch = null; if (armedRef.current) { beginSel(e.touches[0].clientX, e.touches[0].clientY); } else { pan = { x: e.touches[0].clientX, y: e.touches[0].clientY }; } }
      };
      const onTM = (e) => {
        if (e.touches.length === 2 && pinch) {
          e.preventDefault();
          const d = dist(e.touches), m = mid(e.touches);
          if (pinch.d > 0) setScale(clampScale(+(pinch.s * d / pinch.d).toFixed(3)));
          el.scrollLeft += pinch.x - m.x; el.scrollTop += pinch.y - m.y; pinch.x = m.x; pinch.y = m.y;
        } else if (e.touches.length === 1 && armedRef.current && selStartRef.current) {
          e.preventDefault(); moveSel(e.touches[0].clientX, e.touches[0].clientY);
        } else if (e.touches.length === 1 && pan) {
          e.preventDefault(); el.scrollLeft += pan.x - e.touches[0].clientX; el.scrollTop += pan.y - e.touches[0].clientY; pan = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        }
      };
      const onTE = () => { if (armedRef.current && selStartRef.current) endSel(); pinch = null; pan = null; };
      el.addEventListener("touchstart", onTS, { passive: false });
      el.addEventListener("touchmove", onTM, { passive: false });
      el.addEventListener("touchend", onTE);
      el.addEventListener("touchcancel", onTE);
      cleanupTouch = () => { el.removeEventListener("touchstart", onTS); el.removeEventListener("touchmove", onTM); el.removeEventListener("touchend", onTE); el.removeEventListener("touchcancel", onTE); };
    }
    return () => { root.removeEventListener("wheel", onWheel); cleanupTouch(); };
  }, [flowMode]); // eslint-disable-line

  const qLow = q.trim().toLowerCase();
  const hits = qLow ? items.filter((i) => i.str.toLowerCase().includes(qLow)) : [];
  const matchPages = qLow ? pageTexts.map((t, p) => (t && t.includes(qLow) ? p : 0)).filter(Boolean) : [];
  const gotoMatch = (dir) => { if (!matchPages.length) return; const idx = matchPages.indexOf(page); const next = idx === -1 ? matchPages[0] : matchPages[(idx + dir + matchPages.length) % matchPages.length]; goToPage(next); };
  const cw = canvasRef.current ? canvasRef.current.width : 0;

  // Pinch-Zoom im Fortlauf-Modus (zwei Finger): skaliert die Seiten, zoomt auf den Pinch-Mittelpunkt; ein Finger scrollt normal
  const flowZoomAnchor = useRef(null);
  useEffect(() => {
    if (!flowMode) return;
    const el = flowRef.current; if (!el) return;
    let pinch = null;
    const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const mid = (t) => ({ x: (t[0].clientX + t[1].clientX) / 2, y: (t[0].clientY + t[1].clientY) / 2 });
    const onTS = (e) => { if (e.touches.length === 2) { const m = mid(e.touches); pinch = { d: dist(e.touches), s: scaleRef.current, x: m.x, y: m.y }; } };
    const onTM = (e) => {
      if (e.touches.length === 2 && pinch && pinch.d > 0) {
        e.preventDefault();
        const d = dist(e.touches), m = mid(e.touches);
        el.scrollLeft += pinch.x - m.x; el.scrollTop += pinch.y - m.y; // Zwei-Finger-Verschieben
        const old = scaleRef.current, next = clampScale(+(pinch.s * d / pinch.d).toFixed(3));
        if (next !== old) {
          const r = el.getBoundingClientRect();
          flowZoomAnchor.current = { cx: m.x - r.left, cy: m.y - r.top, sl: el.scrollLeft, st: el.scrollTop, ratio: next / old };
          scaleRef.current = next; setScale(next);
        }
        pinch.x = m.x; pinch.y = m.y;
      }
    };
    const onTE = (e) => { if (!e.touches || e.touches.length < 2) pinch = null; };
    // Horizontaler Fortlauf: vertikales Mausrad → horizontal scrollen (Strg/Cmd bleibt Zoom, macht der Root-Handler)
    const onWheel = (e) => {
      if (e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (flow === "horiz" && e.deltaY !== 0 && Math.abs(e.deltaY) >= Math.abs(e.deltaX)) {
        el.scrollLeft += e.deltaY; e.preventDefault();
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("touchstart", onTS, { passive: false });
    el.addEventListener("touchmove", onTM, { passive: false });
    el.addEventListener("touchend", onTE);
    el.addEventListener("touchcancel", onTE);
    return () => { el.removeEventListener("wheel", onWheel); el.removeEventListener("touchstart", onTS); el.removeEventListener("touchmove", onTM); el.removeEventListener("touchend", onTE); el.removeEventListener("touchcancel", onTE); };
  }, [flowMode, flow]);
  // nach Skalierung den Scroll so korrigieren, dass der Punkt unter dem Pinch-Mittelpunkt stehen bleibt
  useLayoutEffect(() => {
    const a = flowZoomAnchor.current, el = flowRef.current; if (!a || !el) return;
    flowZoomAnchor.current = null;
    el.scrollLeft = Math.max(0, (a.sl + a.cx) * a.ratio - a.cx);
    el.scrollTop = Math.max(0, (a.st + a.cy) * a.ratio - a.cy);
  }, [scale]);

  return (
    <div ref={rootRef} data-selfzoom style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, width: "100%", minWidth: 0, maxWidth: "100%", overflow: "hidden" }}>
      <div className="pe-scrollbar" style={{ display: "flex", alignItems: "center", gap: wide ? 8 : 6, padding: "8px 10px", borderBottom: `1px solid ${T.line}`, flexWrap: wide ? "wrap" : "nowrap", overflowX: wide ? "visible" : "auto", flexShrink: 0, background: T.card, position: "relative", zIndex: 2, WebkitOverflowScrolling: "touch" }}>
        {/* SUCHE: Desktop = Leiste; Mobil = Lupe, die sich beim Antippen zur Suchleiste öffnet */}
        {(wide || searchOpen) ? (
          <div style={{ position: "relative", flex: wide ? "0 1 360px" : "1 1 auto", minWidth: wide ? 195 : 0, display: "flex", alignItems: "center" }}>
            <Search size={14} style={{ position: "absolute", left: 10, color: T.inkSoft, pointerEvents: "none" }} />
            <input ref={searchRef} value={q} onChange={(e) => setQ(e.target.value)} onFocus={() => setQFocus(true)} onBlur={() => setQFocus(false)} autoFocus={!wide}
              onKeyDown={(e) => { if (e.key === "Enter") gotoMatch(1); else if (e.key === "Escape") { e.stopPropagation(); if (q) setQ(""); else { e.currentTarget.blur(); if (!wide) setSearchOpen(false); } } }}
              placeholder="Im Dokument suchen…" style={{ width: "100%", boxSizing: "border-box", font: `500 12.5px ${SANS}`, color: T.ink, background: qFocus ? T.card : T.bg, border: `1.5px solid ${qFocus ? T.accent : T.line}`, boxShadow: qFocus ? `0 0 0 2px ${T.accent}55` : "none", borderRadius: 9, padding: "10px 30px 10px 32px", outline: "none" }} />
            {q ? <button onClick={() => { setQ(""); searchRef.current && searchRef.current.focus(); }} aria-label="Leeren" style={{ all: "unset", cursor: "pointer", position: "absolute", right: 7, width: 20, height: 20, borderRadius: 6, display: "grid", placeItems: "center", color: T.inkSoft }}><XIcon size={14} /></button>
              : (!wide && <button onClick={() => setSearchOpen(false)} aria-label="Suche schließen" style={{ all: "unset", cursor: "pointer", position: "absolute", right: 7, width: 20, height: 20, borderRadius: 6, display: "grid", placeItems: "center", color: T.inkSoft }}><XIcon size={14} /></button>)}
          </div>
        ) : (
          <button onClick={() => setSearchOpen(true)} title="Im Dokument suchen" style={{ ...btn(T), flexShrink: 0, position: "relative" }}><Search size={16} />{qLow && matchPages.length > 0 && <span style={{ position: "absolute", top: 3, right: 3, width: 7, height: 7, borderRadius: 99, background: T.accent }} />}</button>
        )}
        {(wide || searchOpen) && qLow && (matchPages.length > 0
          ? <span style={{ display: "inline-flex", alignItems: "center", gap: 4, font: `600 11px ${SANS}`, color: T.inkSoft, flexShrink: 0 }}>
              <button onClick={() => gotoMatch(-1)} style={btn(T)}><ChevronLeft size={16} /></button>
              {matchPages.indexOf(page) >= 0 ? matchPages.indexOf(page) + 1 : "–"}/{matchPages.length}
              <button onClick={() => gotoMatch(1)} style={btn(T)}><ChevronRight size={16} /></button>
            </span>
          : <span style={{ font: `600 11px ${SANS}`, color: T.inkSoft, flexShrink: 0 }}>keine Treffer</span>)}

        <div style={{ flex: wide ? 1 : "1 1 2px" }} />

        {/* Anzeigemodus (fortlaufend/einzeln): Desktop inline, mobil im ⋯-Menü */}
        {wide && !armed && numPages > 1 && (
          <button onClick={() => setFlow((f) => (f === "single" ? "vert" : f === "vert" ? "horiz" : "single"))}
            title={flow === "single" ? "Fortlaufend vertikal scrollen" : flow === "vert" ? "Fortlaufend horizontal scrollen" : "Einzelseite"}
            style={{ ...btn(T), flexShrink: 0, background: flow !== "single" ? T.accent : T.card, color: flow !== "single" ? "#fff" : T.ink, borderColor: flow !== "single" ? T.accent : T.line }}>
            {flow === "single" ? <FileIcon size={16} /> : flow === "vert" ? <StretchVertical size={16} /> : <StretchHorizontal size={16} />}
          </button>
        )}

        {/* Text ins PDF schreiben + Formularfelder ausfüllen (Nexus-Ergänzung) */}
        {onSavePdf && (!searchOpen || wide) && (
          <button
            onClick={() => { setTextMode((v) => !v); if (flow !== "single") setFlow("single"); }}
            title="Text ins PDF schreiben: einschalten und auf die gewünschte Stelle tippen"
            style={{ ...btn(T), flexShrink: 0, background: textMode ? T.accent : T.card, color: textMode ? "#fff" : T.ink, borderColor: textMode ? T.accent : T.line }}>
            <Type size={16} />
          </button>
        )}
        {onSavePdf && formFelder.length > 0 && (!searchOpen || wide) && (
          <button
            onClick={() => setFormPanel((v) => !v)}
            title={`${formFelder.length} Formularfelder ausfüllen`}
            style={{ ...btn(T), flexShrink: 0, position: "relative", background: formPanel ? T.accent : T.card, color: formPanel ? "#fff" : T.ink, borderColor: formPanel ? T.accent : T.line }}>
            <ListChecks size={16} />
            <span style={{ position: "absolute", top: -5, right: -5, minWidth: 15, height: 15, borderRadius: 99, background: T.accent, color: "#fff", font: `700 8px ${SANS}`, display: "grid", placeItems: "center", padding: "0 2px" }}>{formFelder.length}</span>
          </button>
        )}

        {/* Zoom – immer sichtbar: − | % | + */}
        {(!searchOpen || wide) && (
        <span style={{ display: "inline-flex", alignItems: "center", flexShrink: 0, height: 32, border: `1px solid ${T.line}`, borderRadius: 9, overflow: "hidden", background: T.card }}>
          <button onClick={() => setScale((s) => clampScale(+(s - 0.2).toFixed(2)))} title="Verkleinern" style={{ all: "unset", cursor: "pointer", display: "grid", placeItems: "center", width: 34, height: "100%", color: T.ink }}><Minus size={16} /></button>
          <button onClick={() => setScale(1)} title="Auf 100 % zurücksetzen" style={{ all: "unset", cursor: "pointer", display: "grid", placeItems: "center", minWidth: 44, height: "100%", padding: "0 6px", font: `700 11.5px ${SANS}`, color: T.inkSoft, borderLeft: `1px solid ${T.line}`, borderRight: `1px solid ${T.line}` }}>{Math.round(scale * 100)}%</button>
          <button onClick={() => setScale((s) => clampScale(+(s + 0.2).toFixed(2)))} title="Vergrößern" style={{ all: "unset", cursor: "pointer", display: "grid", placeItems: "center", width: 34, height: "100%", color: T.ink }}><Plus size={16} /></button>
        </span>
        )}
        {(!searchOpen || wide) && (
          <button onClick={rotateCurrent} title={`Seite ${page} um 90° drehen`} style={{ ...btn(T), flexShrink: 0, position: "relative" }}>
            <RotateCw size={16} />
            {(rotations[page] || 0) !== 0 && <span style={{ position: "absolute", top: -5, right: -5, minWidth: 15, height: 15, borderRadius: 99, background: T.accent, color: "#fff", font: `700 8px ${SANS}`, display: "grid", placeItems: "center", padding: "0 2px" }}>{rotations[page]}°</span>}
          </button>
        )}
        {wide && numPages > 1 && (
          <button onClick={() => setShowRail((s) => !s)} title={showRail ? "Seitenleiste ausblenden" : "Seitenleiste anzeigen"} style={{ ...btn(T), flexShrink: 0, background: showRail ? T.accent : T.card, color: showRail ? "#fff" : T.ink, borderColor: showRail ? T.accent : T.line }}><Columns2 size={16} /></button>
        )}
        <PeerBadge peers={peers} T={T} label="im Dokument" />
        {onSavePdf && wide && numPages >= 1 && (
          <button onClick={() => { setEditMode((e) => !e); setShowRail(true); }} title="Seiten bearbeiten: umsortieren (ziehen), duplizieren, Leerseiten einfügen" style={{ ...btn(T), flexShrink: 0, background: editMode ? T.accent : T.card, color: editMode ? "#fff" : T.ink, borderColor: editMode ? T.accent : T.line }}><Pencil size={15} /></button>
        )}
        {editMode && edited && (
          <span style={{ position: "relative", display: "inline-flex", alignItems: "center", flexShrink: 0, height: 32, borderRadius: 9, overflow: "visible", background: T.accent }}>
            <button onClick={() => savePdf(true)} disabled={savingPdf} title="Original mit den Änderungen ersetzen" style={{ all: "unset", cursor: savingPdf ? "default" : "pointer", display: "inline-flex", alignItems: "center", gap: 6, height: "100%", padding: "0 12px", borderRadius: "9px 0 0 9px", color: "#fff", font: `700 12px ${SANS}`, opacity: savingPdf ? 0.7 : 1 }}>{savingPdf ? <span style={{ width: 13, height: 13, border: "2px solid rgba(255,255,255,.6)", borderTopColor: "#fff", borderRadius: "50%", display: "inline-block", animation: "pe-spin .8s linear infinite" }} /> : <Check size={15} />} Speichern</button>
            <button onClick={() => setSaveMenu((v) => !v)} disabled={savingPdf} title="Weitere Speicheroptionen" style={{ all: "unset", cursor: savingPdf ? "default" : "pointer", display: "grid", placeItems: "center", height: "100%", width: 26, color: "#fff", borderLeft: "1px solid rgba(255,255,255,.35)", borderRadius: "0 9px 9px 0" }}><ChevronDown size={15} /></button>
            {saveMenu && (<>
              <div onClick={() => setSaveMenu(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
              <div style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 41, background: T.card, border: `1px solid ${T.line}`, borderRadius: 10, boxShadow: "0 12px 32px rgba(0,0,0,.3)", padding: 5, minWidth: 190 }}>
                <button onClick={() => savePdf(false)} style={{ all: "unset", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, width: "100%", boxSizing: "border-box", padding: "9px 11px", borderRadius: 8, font: `600 12.5px ${SANS}`, color: T.ink }} onMouseEnter={(e) => (e.currentTarget.style.background = T.track)} onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}><FilePlus size={15} color={T.accent} /> Speichern neu (als Kopie)</button>
              </div>
            </>)}
          </span>
        )}
        {numPages > 1 && (!searchOpen || wide) && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 2, flexShrink: 0 }}>
            <button onClick={() => goToPage((p) => Math.max(1, p - 1))} title="Vorige Seite" style={btn(T)}><ChevronLeft size={16} /></button>
            <span style={{ font: `600 11.5px ${SANS}`, color: T.inkSoft, minWidth: 36, textAlign: "center" }}>{page}/{numPages}</span>
            <button onClick={() => goToPage((p) => Math.min(numPages, p + 1))} title="Nächste Seite" style={btn(T)}><ChevronRight size={16} /></button>
          </span>
        )}
        {/* Mobil: Überlaufmenü (⋯) für Anzeigemodus, Seitenleiste, Seiten bearbeiten */}
        {!wide && !searchOpen && (onSavePdf || numPages > 1) && (
          <div style={{ position: "relative", flexShrink: 0 }}>
            <button ref={moreBtnRef} onClick={() => setMoreMenu((v) => !v)} title="Mehr" style={{ ...btn(T), flexShrink: 0, background: moreMenu ? T.accent : T.card, color: moreMenu ? "#fff" : T.ink, borderColor: moreMenu ? T.accent : T.line }}><MoreHorizontal size={18} /></button>
            {moreMenu && (() => { const r = moreBtnRef.current && moreBtnRef.current.getBoundingClientRect(); const top = r ? Math.round(r.bottom + 6) : 56; const right = r ? Math.max(8, Math.round(window.innerWidth - r.right)) : 8; return (<>
              <div onClick={() => setMoreMenu(false)} style={{ position: "fixed", inset: 0, zIndex: 400 }} />
              <div style={{ position: "fixed", top, right, zIndex: 401, background: T.card, border: `1px solid ${T.line}`, borderRadius: 12, boxShadow: "0 14px 36px rgba(0,0,0,.34)", padding: 6, minWidth: 232, maxWidth: "calc(100vw - 16px)", display: "flex", flexDirection: "column", gap: 2 }}>
                {!armed && numPages > 1 && (
                  <button onClick={() => { setFlow((f) => (f === "single" ? "vert" : f === "vert" ? "horiz" : "single")); setMoreMenu(false); }} style={mItem(T)}>
                    {flow === "single" ? <FileIcon size={16} color={T.accent} /> : flow === "vert" ? <StretchVertical size={16} color={T.accent} /> : <StretchHorizontal size={16} color={T.accent} />}
                    <span style={{ flex: 1 }}>Anzeige: {flow === "single" ? "Einzelseite" : flow === "vert" ? "Fortlaufend ↕" : "Fortlaufend ↔"}</span>
                  </button>
                )}
                {numPages > 1 && (
                  <button onClick={() => { setShowRail((s) => !s); setMoreMenu(false); }} style={mItem(T)}><Columns2 size={16} color={T.accent} /><span style={{ flex: 1 }}>{showRail ? "Seitenleiste ausblenden" : "Seitenleiste (Miniaturen)"}</span></button>
                )}
                {onSavePdf && numPages >= 1 && (
                  <button onClick={() => { setEditMode((e) => !e); setShowRail(true); setMoreMenu(false); }} style={mItem(T)}><Pencil size={16} color={T.accent} /><span style={{ flex: 1 }}>{editMode ? "Bearbeiten beenden" : "Seiten bearbeiten"}</span></button>
                )}
              </div>
            </>); })()}
          </div>
        )}
      </div>
      {armed && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", background: T.accent, color: "#fff", font: `700 11.5px ${SANS}` }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="3" width="18" height="18" rx="2" /></svg>
          Rahmen aufziehen für: {armedLabel || "Feld"} · Strg+Rad od. 2 Finger = Zoom
        </div>
      )}
      {ocrBusy && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", background: "#1d4ed8", color: "#fff", font: `700 11.5px ${SANS}` }}>
          <div style={{ width: 13, height: 13, border: "2px solid rgba(255,255,255,.5)", borderTopColor: "#fff", borderRadius: "50%", animation: "pe-spin .8s linear infinite" }} />
          Text wird per OCR erkannt … (gescanntes Dokument)
        </div>
      )}
      <div style={{ flex: 1, display: "flex", minHeight: 0, minWidth: 0 }}>
      {showRail && (numPages > 1 || editMode) && (
        <div className="pe-scrollbar" style={{ width: wide ? 168 : 134, flexShrink: 0, overflowY: "auto", overflowX: "hidden", borderRight: `1px solid ${T.line}`, background: T.card, padding: 8, display: "flex", flexDirection: "column", gap: editMode ? 2 : 8, scrollbarWidth: "thin" }}>
          {!editMode
            ? Array.from({ length: numPages }, (_, i) => i + 1).map((p) => (
                <button key={p} onClick={() => goToPage(p)} title={`Seite ${p}`} style={{ all: "unset", cursor: "pointer", position: "relative", borderRadius: 7, padding: 3, border: `2px solid ${p === page ? T.accent : T.line}`, background: "#fff" }}>
                  {thumbs[p]
                    ? <img src={thumbs[p]} alt={`Seite ${p}`} style={{ width: "100%", display: "block", borderRadius: 4 }} />
                    : <div style={{ width: "100%", aspectRatio: "0.7", background: T.track, borderRadius: 4, display: "grid", placeItems: "center", font: `600 11px ${SANS}`, color: T.inkSoft }}>…</div>}
                  <span style={{ position: "absolute", bottom: 6, right: 6, font: `700 9.5px ${SANS}`, color: "#fff", background: "rgba(0,0,0,.6)", borderRadius: 5, padding: "1px 6px" }}>{p}</span>
                </button>
              ))
            : <>
                {order.map((s, i) => (
                  <React.Fragment key={s.k}>
                    <RailInsert T={T} onClick={() => insertBlankAt(i)} />
                    <div draggable onDragStart={() => setDragSlot(i)} onDragEnd={() => setDragSlot(null)} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); moveSlot(dragSlot, i); setDragSlot(null); }}
                      title={s.blank ? "Leerseite (ziehen zum Verschieben)" : `Seite ${s.orig} (ziehen zum Verschieben)`} style={{ position: "relative", cursor: "grab", borderRadius: 7, padding: 3, border: `2px solid ${dragSlot === i ? T.accent : T.line}`, background: "#fff", opacity: dragSlot === i ? 0.4 : 1 }}>
                      {s.blank
                        ? <div style={{ width: "100%", aspectRatio: "0.7", background: "#fff", border: `1px dashed ${T.line}`, borderRadius: 4, display: "grid", placeItems: "center", font: `700 10px ${SANS}`, color: T.inkSoft }}>leer</div>
                        : (thumbs[s.orig] ? <img src={thumbs[s.orig]} alt="" draggable={false} style={{ width: "100%", display: "block", borderRadius: 4, pointerEvents: "none" }} /> : <div style={{ width: "100%", aspectRatio: "0.7", background: T.track, borderRadius: 4, display: "grid", placeItems: "center", color: T.inkSoft }}>…</div>)}
                      <span style={{ position: "absolute", top: 5, left: 5, color: T.inkSoft }}><GripVertical size={14} /></span>
                      <span style={{ position: "absolute", bottom: 6, right: 6, font: `700 9.5px ${SANS}`, color: "#fff", background: "rgba(0,0,0,.6)", borderRadius: 5, padding: "1px 6px" }}>{i + 1}</span>
                      <button onClick={(e) => { e.stopPropagation(); removeSlot(i); }} title="Seite entfernen" style={{ all: "unset", cursor: "pointer", position: "absolute", top: -6, right: -6, width: 20, height: 20, borderRadius: 99, background: "#dc2626", color: "#fff", display: "grid", placeItems: "center", border: "2px solid #fff", boxShadow: "0 1px 4px rgba(0,0,0,.4)" }}><XIcon size={11} /></button>
                      <button onClick={(e) => { e.stopPropagation(); duplicateSlot(i); }} title="Seite duplizieren" style={{ all: "unset", cursor: "pointer", position: "absolute", top: -6, left: -6, width: 20, height: 20, borderRadius: 99, background: T.accent, color: "#fff", display: "grid", placeItems: "center", border: "2px solid #fff", boxShadow: "0 1px 4px rgba(0,0,0,.4)" }}><Copy size={10} /></button>
                    </div>
                  </React.Fragment>
                ))}
                <RailInsert T={T} onClick={() => insertBlankAt(order.length)} />
                <button onClick={() => insertBlankAt(order.length)} title="Leerseite am Ende hinzufügen" style={{ all: "unset", cursor: "pointer", marginTop: 4, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "10px 8px", borderRadius: 8, border: `1.5px dashed ${T.accent}`, color: T.accent, font: `700 11px ${SANS}` }}><FilePlus size={15} /> Neue Seite</button>
              </>}
        </div>
      )}
      {flowMode && (
        <div ref={flowRef} onScroll={onFlowScroll} className="pe-scrollbar" style={{ flex: 1, overflow: "auto", padding: flow === "horiz" ? 12 : (wide ? 12 : "6px 0"), background: T.bg !== "#F5F5F7" ? "#0e0f12" : "#e9e9ee", minHeight: 0, minWidth: 0, scrollbarColor: `${T.accent} transparent`, scrollbarWidth: "thin", display: "flex", flexDirection: flow === "horiz" ? "row" : "column", alignItems: "safe center", justifyContent: numPages <= 1 ? "safe center" : "flex-start", gap: wide ? 14 : 8 }}>
          {docTick > 0 && docRef.current && Array.from({ length: numPages }, (_, i) => i + 1).map((p) => (
            <FlowPage key={p} doc={docRef.current} num={p} T={T} horiz={flow === "horiz"} rot={rotations[p] || 0}
              boxW={Math.round((wide ? Math.min(flowSize.w - 28, 860) : Math.max(180, flowSize.w)) * scale)} boxH={Math.round((flowSize.h - 28) * scale)} />
          ))}
        </div>
      )}
      {!flowMode && (
      <div ref={scrollRef} className="pe-scrollbar" style={{ flex: 1, overflow: "auto", padding: 12, background: T.bg !== "#F5F5F7" ? "#0e0f12" : "#e9e9ee", minHeight: 0, minWidth: 0, touchAction: "none", scrollbarColor: `${T.accent} transparent`, scrollbarWidth: "thin", display: "flex", flexDirection: "column", alignItems: "safe center" }}>
        {busy && (
          <div style={{ position: "fixed", inset: 0, display: "grid", placeItems: "center", zIndex: 60, pointerEvents: "none" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, background: T.card, borderRadius: 16, padding: "26px 30px", boxShadow: "0 18px 50px rgba(0,0,0,.35)" }}>
              <div style={{ width: 46, height: 46, border: `4px solid ${T.line}`, borderTopColor: T.accent, borderRadius: "50%", animation: "pe-spin .8s linear infinite" }} />
              <div style={{ font: `600 13px ${SANS}`, color: T.inkSoft }}>Dokument wird geladen…{progress != null ? ` ${progress}%` : ""}</div>
              <div style={{ width: 220, height: 7, borderRadius: 99, background: T.line, overflow: "hidden", position: "relative" }}>
                {progress != null
                  ? <div style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: `${progress}%`, background: T.accent, borderRadius: 99, transition: "width .2s" }} />
                  : <div style={{ position: "absolute", top: 0, bottom: 0, width: "40%", background: T.accent, borderRadius: 99, animation: "pe-indet 1.1s ease-in-out infinite" }} />}
              </div>
            </div>
          </div>
        )}
        {err && <div style={{ textAlign: "center", padding: "30px 0", font: `600 12.5px ${SANS}`, color: "#dc2626" }}>{err}</div>}
        {textMode && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 12px", background: T.accent, color: "#fff", font: `600 12.5px ${SANS}`, flexShrink: 0 }}>
          <Type size={15} />
          <span>Auf die Stelle im Dokument tippen, an der Text stehen soll. Zum Beenden erneut auf das Text-Symbol tippen.</span>
          <button onClick={() => setTextMode(false)} style={{ all: "unset", cursor: "pointer", marginLeft: "auto", padding: "3px 10px", borderRadius: 7, background: "rgba(255,255,255,.22)" }}>Fertig</button>
        </div>
      )}

      {editMode && seitenGeaendert && formFelder.length > 0 && (
        <div style={{ padding: "7px 12px", background: "#b45309", color: "#fff", font: `600 12px ${SANS}`, flexShrink: 0 }}>
          Hinweis: Durch das Umsortieren der Seiten verliert das PDF seine ausfüllbaren Felder –
          bereits eingetragene Inhalte bleiben sichtbar.
        </div>
      )}

      {formPanel && formFelder.length > 0 && (
        <div style={{ maxHeight: "42vh", overflowY: "auto", padding: "10px 12px", background: T.card, borderBottom: `1px solid ${T.line}`, flexShrink: 0 }}>
          <div style={{ font: `700 11.5px ${SANS}`, color: T.inkSoft, textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 8 }}>
            Formularfelder ausfüllen
          </div>
          <div style={{ display: "grid", gap: 8, gridTemplateColumns: wide ? "1fr 1fr" : "1fr" }}>
            {formFelder.map((f) => (
              <label key={f.name} style={{ display: "grid", gap: 3 }}>
                <span style={{ font: `600 11px ${SANS}`, color: T.inkSoft }}>{f.name}</span>
                <input
                  value={formWerte[f.name] ?? ""}
                  onChange={(e) => setFormWerte((w) => ({ ...w, [f.name]: e.target.value }))}
                  style={{ font: `500 14px ${SANS}`, color: T.ink, background: T.bg, border: `1px solid ${T.line}`, borderRadius: 8, padding: "9px 10px", outline: "none" }}
                />
              </label>
            ))}
          </div>
          <div style={{ font: `500 11.5px ${SANS}`, color: T.inkSoft, marginTop: 8 }}>
            Die Eingaben werden beim Speichern ins Formular übernommen – das PDF bleibt danach weiter ausfüllbar.
          </div>
        </div>
      )}

      <div onMouseDown={onMouseDown} onContextMenu={(e) => e.preventDefault()}
          style={{ position: "relative", width: cw || "auto", flex: "0 0 auto", cursor: armed ? "crosshair" : "grab", display: busy || err ? "none" : "block", userSelect: "none", WebkitUserSelect: "none" }}>
          <canvas ref={canvasRef} style={{ display: "block", boxShadow: "0 2px 12px rgba(0,0,0,.4)", borderRadius: 4, background: "#fff" }} />
          {marks.filter((m) => m.page === page).map((m) => {
            // Aktives Feld hervorheben, alle anderen ausgrauen → bessere Auswahl/Texterkennung
            const dim = armed && armedKey && m.key !== armedKey;
            return (
            <div key={m.key} onMouseDown={(e) => startMarkDrag(e, m)} title="Ziehen = verschieben · Klick = Feld erneut wählen"
              style={{ position: "absolute", left: m.x * scale, top: m.y * scale, width: m.w * scale, height: m.h * scale, background: dim ? "rgba(120,120,120,.10)" : "rgba(34,197,94,.22)", border: dim ? "1.5px dashed rgba(120,120,120,.55)" : "1.5px solid rgba(34,197,94,.9)", borderRadius: 2, cursor: "move", zIndex: dim ? 3 : 4, opacity: dim ? 0.5 : 1, transition: "opacity .12s, background .12s" }}>
              {/* Feld-Fahne */}
              <div style={{ position: "absolute", top: -16, left: -1.5, height: 15, maxWidth: 170, display: "inline-flex", alignItems: "center", padding: "0 5px", background: dim ? "rgba(120,120,120,.85)" : "rgba(22,163,74,.96)", color: "#fff", font: `700 9.5px ${SANS}`, borderRadius: "3px 3px 0 0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", pointerEvents: "none" }}>{m.label || "Feld"}</div>
              {/* Cross zum Entfernen */}
              <button onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); }} onClick={(e) => { e.stopPropagation(); removeMark(m.key); }} title="Markierung entfernen"
                style={{ all: "unset", cursor: "pointer", position: "absolute", top: -8, right: -8, width: 17, height: 17, borderRadius: 99, background: "#dc2626", color: "#fff", display: "grid", placeItems: "center", boxShadow: "0 1px 4px rgba(0,0,0,.35)" }}>
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
              </button>
            </div>
          ); })}
          {hits.map((h, i) => <div key={"h" + i} style={{ position: "absolute", left: h.x, top: h.y, width: h.w, height: h.h, background: "rgba(230,57,70,.4)", pointerEvents: "none", borderRadius: 2 }} />)}
          {selRect && <div style={{ position: "absolute", left: selRect.x, top: selRect.y, width: selRect.w, height: selRect.h, border: `2px solid ${T.accent}`, background: "rgba(230,57,70,.15)", pointerEvents: "none", borderRadius: 2 }} />}

          {/* Formularfelder des PDFs: echte Eingabefelder an ihrer Position im Dokument.
              Damit lässt sich ein Antrag direkt im Betrachter ausfüllen. */}
          {onSavePdf && !flowMode && feldBoxen.map((f, i) => {
            const gemeinsam = {
              position: "absolute", left: f.x, top: f.y, width: f.w, height: f.h,
              boxSizing: "border-box", zIndex: 5,
            };
            const stopp = (e) => e.stopPropagation();
            if (f.art === "text") {
              const schrift = Math.max(8, Math.min(f.mehrzeilig ? 13 : f.h * 0.68, 15));
              const Feld = f.mehrzeilig ? "textarea" : "input";
              return (
                <Feld
                  key={f.name + i}
                  value={formWerte[f.name] ?? ""}
                  readOnly={f.readOnly}
                  onMouseDown={stopp}
                  onTouchStart={stopp}
                  onChange={(e) => setFormWerte((w) => ({ ...w, [f.name]: e.target.value }))}
                  title={f.name}
                  style={{
                    ...gemeinsam,
                    font: `${schrift}px ${SANS}`, color: "#0f172a", lineHeight: 1.15,
                    padding: f.mehrzeilig ? "2px 3px" : "0 3px",
                    background: (formWerte[f.name] ?? "") ? "rgba(59,130,246,.06)" : "rgba(59,130,246,.13)",
                    border: `1px solid ${T.accent}`, borderRadius: 2, outline: "none", resize: "none",
                  }}
                />
              );
            }
            // Kästchen und Auswahlknöpfe: antippen setzt/entfernt den Haken
            const an = f.art === "radio"
              ? String(formWerte[f.name] ?? "") === String(f.anStatus)
              : !!formWerte[f.name];
            return (
              <button
                key={f.name + i}
                type="button"
                title={f.name}
                onMouseDown={stopp}
                onTouchStart={stopp}
                onClick={() => setFormWerte((w) => ({
                  ...w,
                  [f.name]: f.art === "radio"
                    ? (String(w[f.name] ?? "") === String(f.anStatus) ? "" : String(f.anStatus))
                    : (w[f.name] ? "" : "Ja"),
                }))}
                style={{
                  ...gemeinsam, cursor: "pointer", display: "grid", placeItems: "center",
                  background: an ? "rgba(59,130,246,.22)" : "rgba(59,130,246,.10)",
                  border: `1px solid ${T.accent}`, borderRadius: f.art === "radio" ? "50%" : 2,
                  color: T.accent, font: `700 ${Math.max(9, Math.min(f.h * 0.8, 14))}px ${SANS}`,
                }}
              >
                {an ? "✓" : ""}
              </button>
            );
          })}

          {/* Eingetragene Texte (Nexus): auf dieser Seite bearbeitbar, beim Speichern fest ins PDF */}
          {texts.filter((t) => t.page === page).map((t) => (
            <div key={t.key} style={{ position: "absolute", left: t.x * scale, top: t.y * scale, zIndex: 6 }}>
              <textarea
                autoFocus={aktiverText === t.key}
                value={t.value}
                placeholder="Text…"
                onChange={(e) => setTexts((arr) => arr.map((x) => (x.key === t.key ? { ...x, value: e.target.value } : x)))}
                onFocus={() => setAktiverText(t.key)}
                rows={Math.max(1, String(t.value || "").split("\n").length)}
                style={{
                  font: `${t.size * scale}px ${SANS}`, lineHeight: 1.25, color: "#0f172a",
                  background: aktiverText === t.key ? "rgba(59,130,246,.10)" : "transparent",
                  border: `1px ${aktiverText === t.key ? "solid" : "dashed"} ${T.accent}`,
                  borderRadius: 3, padding: "1px 3px", minWidth: 90, resize: "both", overflow: "hidden",
                }}
              />
              <button onClick={() => { setTexts((arr) => arr.filter((x) => x.key !== t.key)); if (aktiverText === t.key) setAktiverText(null); }}
                title="Text entfernen"
                style={{ all: "unset", cursor: "pointer", position: "absolute", top: -9, right: -9, width: 18, height: 18, borderRadius: 99, background: "#dc2626", color: "#fff", display: "grid", placeItems: "center", boxShadow: "0 1px 4px rgba(0,0,0,.35)" }}>
                <XIcon size={11} />
              </button>
            </div>
          ))}
        </div>
      </div>
      )}
      </div>
    </div>
  );
}
const btn = (T) => ({ all: "unset", cursor: "pointer", minWidth: 32, height: 32, padding: "0 6px", borderRadius: 9, display: "inline-grid", placeItems: "center", font: `600 12px ${SANS}`, color: T.ink, background: T.card, border: `1px solid ${T.line}` });
// Menüpunkt im mobilen Überlaufmenü
const mItem = (T) => ({ all: "unset", cursor: "pointer", display: "flex", alignItems: "center", gap: 9, width: "100%", boxSizing: "border-box", padding: "10px 11px", borderRadius: 9, font: `600 12.5px ${SANS}`, color: T.ink });

// Eine PDF-Seite im Fortlaufend-Modus – rendert erst, wenn sie (fast) sichtbar ist (Lazy)
function FlowPage({ doc, num, T, horiz, boxW, boxH, rot = 0 }) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const textRef = useRef(null);
  const [ar, setAr] = useState(1.414); // Höhe/Breite (Platzhalter vor dem Rendern)
  const [cw, setCw] = useState(0); // Canvas-Renderbreite (für Textebenen-Skalierung)
  const [done, setDone] = useState(false);
  useEffect(() => {
    const el = wrapRef.current; if (!el || !doc) return;
    let alive = true, started = false;
    const render = async () => {
      if (started || !alive) return; started = true;
      try {
        const pg = await doc.getPage(num);
        const rr = (((pg.rotate + rot) % 360) + 360) % 360; // intrinsische + Ansichtsdrehung
        const vp1 = pg.getViewport({ scale: 1, rotation: rr });
        if (alive) setAr(vp1.height / vp1.width);
        const v = pg.getViewport({ scale: Math.min(2200, 1300) / vp1.width, rotation: rr });
        const cv = canvasRef.current; if (!cv) return;
        cv.width = Math.floor(v.width); cv.height = Math.floor(v.height);
        const ctx = cv.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, cv.width, cv.height);
        await pg.render({ canvasContext: ctx, viewport: v }).promise;
        if (alive) setCw(cv.width);
        // Auswählbare Textebene über dem Canvas (nur wenn das PDF Text enthält – gescannte haben keinen)
        const tl = textRef.current;
        if (tl && alive) {
          try {
            const tc = await pg.getTextContent();
            if (tc && tc.items && tc.items.length) {
              tl.textContent = ""; tl.style.width = cv.width + "px"; tl.style.height = cv.height + "px"; tl.style.setProperty("--scale-factor", String(v.scale)); tl.style.setProperty("--total-scale-factor", String(v.scale));
              await new pdfjsLib.TextLayer({ textContentSource: tc, container: tl, viewport: v }).render();
            }
          } catch (_) { /* keine Textebene */ }
        }
        if (alive) setDone(true);
      } catch (_) { started = false; }
    };
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) render(); }, { rootMargin: "1600px" });
    io.observe(el);
    return () => { alive = false; io.disconnect(); };
  }, [doc, num, rot]);
  const box = horiz ? { height: boxH, width: Math.round(boxH / ar) } : { width: boxW, height: Math.round(boxW * ar) };
  const tScale = cw ? box.width / cw : 1; // Textebene wird 1:1 zum Canvas gerendert und auf die Anzeigegröße skaliert
  return (
    <div ref={wrapRef} data-flowpage={num} style={{ flexShrink: 0, position: "relative", background: "#fff", borderRadius: 4, boxShadow: "0 2px 12px rgba(0,0,0,.4)", ...box }}>
      <canvas ref={canvasRef} style={{ display: "block", width: "100%", height: "100%", borderRadius: 4, userSelect: "none", WebkitUserSelect: "none" }} />
      <div style={{ position: "absolute", top: 0, left: 0, transformOrigin: "0 0", transform: `scale(${tScale})`, pointerEvents: done ? "auto" : "none" }}>
        <div ref={textRef} className="pe-textlayer" style={{ position: "relative", overflow: "hidden" }} />
      </div>
      {!done && <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: T.inkSoft, font: `600 12px ${SANS}` }}>Seite {num} …</div>}
      <span style={{ position: "absolute", bottom: 6, right: 8, font: `700 10px ${SANS}`, color: "#fff", background: "rgba(0,0,0,.5)", borderRadius: 5, padding: "1px 6px", pointerEvents: "none" }}>{num}</span>
    </div>
  );
}
