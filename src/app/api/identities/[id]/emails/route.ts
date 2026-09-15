import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { handle, json, ApiError } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Weitere Anmelde-Adressen einer Identität.
 *
 * Mit jeder hinterlegten Adresse kann sich der Mensch anmelden – Passwort bleibt dasselbe.
 * Die **Haupt**adresse (`Identity.email`) ist davon unberührt: nur sie wandert in den
 * Mitarbeiterstammsatz und in die Fachanwendungen.
 */
export const GET = (req: NextRequest, { params }: { params: { id: string } }) =>
  handle(async () => {
    await requireAuth(req);
    const data = await prisma.identityEmail.findMany({
      where: { identityId: params.id },
      orderBy: { createdAt: "asc" },
    });
    return json({ data });
  });

/** Adresse hinzufügen. */
export const POST = (req: NextRequest, { params }: { params: { id: string } }) =>
  handle(async () => {
    await requireAuth(req);
    const body = await req.json().catch(() => ({}));
    const email = String(body.email || "").toLowerCase().trim();
    if (!email || !email.includes("@")) throw new ApiError("Bitte eine gültige E-Mail-Adresse angeben", 400);

    const identity = await prisma.identity.findFirst({ where: { id: params.id, deletedAt: null } });
    if (!identity) throw new ApiError("Zugang nicht gefunden", 404);
    if (identity.email.toLowerCase() === email) throw new ApiError("Das ist bereits die Hauptadresse dieses Zugangs.", 409);

    const belegtHaupt = await prisma.identity.findFirst({ where: { email, deletedAt: null } });
    if (belegtHaupt) throw new ApiError(`„${email}" ist bereits die Hauptadresse von „${belegtHaupt.name}".`, 409);
    const belegt = await prisma.identityEmail.findUnique({ where: { email } });
    if (belegt) throw new ApiError(`„${email}" ist bereits als Anmelde-Adresse vergeben.`, 409);

    const neu = await prisma.identityEmail.create({
      data: { identityId: params.id, email, label: String(body.label || "").trim() },
    });
    return json(neu, 201);
  });
