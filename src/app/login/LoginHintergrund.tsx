"use client";
import Icon from "@/components/Icon";

/**
 * Hintergrund der Anmeldeseite: langsam schwebende Stammdaten-Symbole und ein
 * Verbindungsnetz – Nexus als Knotenpunkt, an dem alle Apps hängen.
 *
 * Vorlage: kontor `LoginHintergrund` (Belege) bzw. clocker (Uhren). Sehr geringe
 * Deckkraft, Bewegung in Minuten statt Sekunden, bewusst ohne Zufallswerte
 * (Server- und Browser-Fassung müssen gleich sein). Bei „Bewegung reduzieren“
 * (prefers-reduced-motion) steht alles still.
 */

/** Symbole: Lage in Prozent, Größe in px, Drehung, Dauer in s, Deckkraft. */
const SYMBOLE = [
  { n: "users", x: 10, y: 18, s: 64, rot: -10, dauer: 46, tiefe: 0.09 },
  { n: "building", x: 86, y: 20, s: 56, rot: 8, dauer: 54, tiefe: 0.08 },
  { n: "folder", x: 16, y: 78, s: 60, rot: 6, dauer: 50, tiefe: 0.075 },
  { n: "truck", x: 82, y: 80, s: 68, rot: -5, dauer: 62, tiefe: 0.065 },
  { n: "package", x: 52, y: 7, s: 44, rot: 12, dauer: 42, tiefe: 0.07 },
  { n: "mail", x: 6, y: 50, s: 40, rot: -6, dauer: 40, tiefe: 0.08 },
  { n: "user", x: 94, y: 52, s: 42, rot: 10, dauer: 48, tiefe: 0.07 },
  { n: "shield", x: 48, y: 93, s: 38, rot: -8, dauer: 44, tiefe: 0.07 },
];

/** Kennungen, wie sie in Nexus vorkommen. */
const MARKEN = [
  { t: "KU-0042", x: 30, y: 12, s: 12, d: 46, v: 4 },
  { t: "MA-0017", x: 70, y: 9, s: 12, d: 50, v: 9 },
  { t: "LI-0008", x: 66, y: 92, s: 11.5, d: 44, v: 14 },
  { t: "@", x: 26, y: 62, s: 26, d: 38, v: 2 },
  { t: "AV-0003", x: 4, y: 90, s: 11.5, d: 52, v: 18 },
  { t: "#", x: 76, y: 64, s: 22, d: 40, v: 7 },
];

/** Netz: Knoten (Prozent) und Verbindungen zum Mittelpunkt bzw. untereinander. */
const KNOTEN = [
  [12, 30], [28, 20], [74, 26], [90, 38], [86, 70], [64, 84], [30, 86], [8, 64],
];

export default function LoginHintergrund() {
  return (
    <div aria-hidden style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
      <style>{`
        @keyframes nhSchweben { 0%,100% { transform: translate(-50%,-50%) translateY(0) rotate(var(--rot)); }
                                50% { transform: translate(-50%,-50%) translateY(-18px) rotate(calc(var(--rot) + 4deg)); } }
        @keyframes nhTreiben { 0%,100% { transform: translate(-50%,-50%) translateX(0); opacity: var(--o); }
                               50% { transform: translate(-50%,-50%) translateX(14px); opacity: calc(var(--o) * 1.6); } }
        @keyframes nhFluss { to { stroke-dashoffset: -40; } }
        @keyframes nhPuls { 0%,100% { opacity: .35; } 50% { opacity: 1; } }
        @media (prefers-reduced-motion: reduce) { .nh-sym, .nh-marke, .nh-netz * { animation: none !important; } }
      `}</style>

      {/* Verbindungsnetz – feine Linien zum Mittelpunkt, Daten „fließen“ als Strichelung */}
      <svg className="nh-netz" width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none"
        style={{ position: "absolute", inset: 0, color: "var(--accent)", opacity: 0.12 }}>
        {KNOTEN.map(([x, y], i) => (
          <line key={"l" + i} x1={x} y1={y} x2={50} y2={50} stroke="currentColor" strokeWidth={0.15}
            vectorEffect="non-scaling-stroke" strokeDasharray="2 6"
            style={{ animation: `nhFluss ${9 + (i % 4) * 2}s linear ${-i}s infinite` }} />
        ))}
        {KNOTEN.map(([x, y], i) => {
          const [x2, y2] = KNOTEN[(i + 1) % KNOTEN.length];
          return <line key={"r" + i} x1={x} y1={y} x2={x2} y2={y2} stroke="currentColor" strokeWidth={0.1}
            vectorEffect="non-scaling-stroke" opacity={0.6} />;
        })}
      </svg>
      {KNOTEN.map(([x, y], i) => (
        <span key={"k" + i} className="nh-netz" style={{ position: "absolute", left: `${x}%`, top: `${y}%`, transform: "translate(-50%,-50%)" }}>
          <span style={{
            display: "block", width: 8, height: 8, borderRadius: "50%", background: "var(--accent)", opacity: 0.25,
            animation: `nhPuls ${5 + (i % 3) * 1.5}s ease-in-out ${-i * 0.8}s infinite`,
          }} />
        </span>
      ))}

      {SYMBOLE.map((b, i) => (
        <span key={i} className="nh-sym"
          style={{
            position: "absolute", left: `${b.x}%`, top: `${b.y}%`, opacity: b.tiefe, color: "var(--accent)",
            display: "flex", ["--rot" as string]: `${b.rot}deg`,
            animation: `nhSchweben ${b.dauer}s ease-in-out ${-i * 7}s infinite`,
            transform: `translate(-50%,-50%) rotate(${b.rot}deg)`,
          }}>
          <Icon name={b.n} size={b.s} strokeWidth={1.5} />
        </span>
      ))}

      {MARKEN.map((m, i) => (
        <span key={i} className="nh-marke"
          style={{
            position: "absolute", left: `${m.x}%`, top: `${m.y}%`, fontSize: m.s, fontWeight: 700,
            fontVariantNumeric: "tabular-nums", letterSpacing: "0.04em", whiteSpace: "nowrap",
            color: "var(--muted)", ["--o" as string]: "0.10", opacity: 0.1,
            animation: `nhTreiben ${m.d}s ease-in-out ${-m.v}s infinite`,
            transform: "translate(-50%,-50%)",
          }}>
          {m.t}
        </span>
      ))}
    </div>
  );
}
