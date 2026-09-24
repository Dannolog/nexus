/**
 * Kleine Vorschau aus einem Bild – für Listen und Übersichten.
 *
 * Bewusst klein (Breite 360 px, JPEG): Die Vorschau wandert als data-URL in die Datenbank
 * und wird mit jeder Liste mitgeliefert. Klappt das Verkleinern nicht (unbekanntes Format,
 * fehlende Bibliothek), gibt es eben keine Vorschau – das Bild selbst bleibt unberührt.
 */
export async function miniaturAusBild(daten: Buffer): Promise<string> {
  try {
    const sharp = (await import("sharp")).default;
    const klein = await sharp(daten).rotate().resize({ width: 360, withoutEnlargement: true })
      .jpeg({ quality: 68 }).toBuffer();
    return `data:image/jpeg;base64,${klein.toString("base64")}`;
  } catch {
    return "";
  }
}
