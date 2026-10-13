import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { handle, json, ApiError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { findeAdresse } from "@/lib/scanner";

export const dynamic = "force-dynamic";

/** Eingerichtete Netzwerk-Scanner. */
export const GET = (req: NextRequest) =>
  handle(async () => {
    await requireAuth(req);
    const data = await prisma.scanner.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" } });
    return json({ data });
  });

/**
 * Scanner hinzufügen. Beim Anlegen werden die Fähigkeiten abgefragt – klappt das nicht,
 * ist das Gerät nicht erreichbar und wird gar nicht erst gespeichert.
 */
export const POST = (req: NextRequest) =>
  handle(async () => {
    await requireAuth(req);
    const body = await req.json().catch(() => ({}));
    const eingabe = String(body.host || "").trim();
    if (!eingabe) throw new ApiError("IP-Adresse oder Hostname fehlt", 400);

    let host = "", model = "";
    try {
      ({ host, model } = await findeAdresse(eingabe));
    } catch (e: any) {
      throw new ApiError(e.message, 400);
    }
    const doppelt = await prisma.scanner.findFirst({ where: { host, deletedAt: null } });
    if (doppelt) throw new ApiError(`„${host}" ist bereits als „${doppelt.name}" eingerichtet.`, 409);
    const scanner = await prisma.scanner.create({
      data: { host, name: String(body.name || "").trim() || model || host, model, note: String(body.note || "") },
    });
    return json(scanner, 201);
  });
