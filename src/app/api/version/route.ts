import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

// Liefert die Build-Kennung des laufenden Builds. Die UI fragt sie regelmäßig ab und
// zeigt einen Hinweis, sobald eine neue Version ausgeliefert wird (gleiches Verfahren
// wie in kontor). Bewusst ohne Auth – die Kennung ist keine schützenswerte Information.
export const dynamic = "force-dynamic";

export function GET() {
  try {
    const buildId = fs.readFileSync(path.join(process.cwd(), ".next", "BUILD_ID"), "utf-8").trim();
    return NextResponse.json({ buildId });
  } catch {
    return NextResponse.json({ buildId: "unknown" });
  }
}
