import { NextRequest } from "next/server";
import { json, handle } from "@/lib/http";
import { requireAuth } from "@/lib/auth";
import { undoTx } from "@/lib/revision";

export const dynamic = "force-dynamic";

/** POST /api/revisions/:txId/undo — Transaktion rückgängig machen. */
export const POST = (req: NextRequest, { params }: { params: { txId: string } }) =>
  handle(async () => {
    const ctx = await requireAuth(req);
    return json(await undoTx(params.txId, ctx));
  });
