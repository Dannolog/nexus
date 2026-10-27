import { NextRequest } from "next/server";
import { json, handle } from "@/lib/http";
import { abfragen } from "@/lib/qrLogin";

export const dynamic = "force-dynamic";

/** GET /api/auth/qr/:id?k=<key> — PC fragt alle 2 s nach, ob das Handy freigegeben hat. */
export const GET = (req: NextRequest, { params }: { params: { id: string } }) =>
  handle(async () => json(abfragen(params.id, req.nextUrl.searchParams.get("k") || "")));
