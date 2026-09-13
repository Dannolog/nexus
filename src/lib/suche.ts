/**
 * Mehrfachsuche: Die Eingabe wird in Begriffe zerlegt, ein Treffer muss **alle** Begriffe
 * enthalten (UND) – jeder Begriff darf dabei in einem beliebigen der durchsuchten Felder
 * stehen. Eine Wortgruppe in Anführungszeichen bleibt zusammen.
 *
 * Beispiel: `maier einkauf` findet den Kontakt „Maier" mit Funktion „Einkauf",
 * `"hans maier"` nur den zusammenhängenden Namen.
 */

/** Zerlegt die Eingabe in Begriffe (max. 8 – mehr bringt nichts und belastet die Abfrage). */
export function begriffe(suche?: string | null): string[] {
  const roh = String(suche || "").trim();
  if (!roh) return [];
  return (roh.match(/"[^"]+"|\S+/g) || [])
    .map((t) => t.replace(/^"|"$/g, "").trim())
    .filter(Boolean)
    .slice(0, 8);
}

/**
 * Baut die Prisma-Bedingung: je Begriff ein ODER über alle Felder, alle Begriffe mit UND.
 * `relationen` erlaubt zusätzlich die Suche in verknüpften Datensätzen (z. B. Ansprechpartner).
 */
export function sucheBedingung(
  suche: string | null | undefined,
  felder: string[],
  relationen: { relation: string; fields: string[] }[] = []
) {
  const teile = begriffe(suche);
  if (teile.length === 0) return null;
  return {
    AND: teile.map((t) => ({
      OR: [
        ...felder.map((f) => ({ [f]: { contains: t, mode: "insensitive" as const } })),
        ...relationen.map((r) => ({
          [r.relation]: {
            // Kontakte sind weich gelöscht – gelöschte dürfen nicht gefunden werden.
            some: { deletedAt: null, OR: r.fields.map((f) => ({ [f]: { contains: t, mode: "insensitive" as const } })) },
          },
        })),
      ],
    })),
  };
}
