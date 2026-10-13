import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { handle, json } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { sucheScanner } from "@/lib/scanner";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Lokales Netz nach eSCL-Scannern durchsuchen; bereits eingerichtete werden markiert. */
export const GET = (req: NextRequest) =>
  handle(async () => {
    await requireAuth(req);
    const vorhanden = await prisma.scanner.findMany({ where: { deletedAt: null }, select: { host: true, name: true } });
    const gefunden = await sucheScanner(vorhanden.map((v) => v.host));
    const data = gefunden.map((g) => {
      const da = vorhanden.find((v) => v.host === g.host || v.host.replace(/^https?:\/\//, "").split(":")[0] === g.ip);
      return { ...g, eingerichtet: da ? da.name : "" };
    });
    return json({ data });
  });
