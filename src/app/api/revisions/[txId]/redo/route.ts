import { NextRequest } from "next/server";
import { json, handle } from "@/lib/http";
import { requireAuth } from "@/lib/auth";
import { redoTx } from "@/lib/revision";

export const dynamic = "force-dynamic";

/** POST /api/revisions/:txId/redo — Transaktion wiederherstellen. */
export const POST = (req: NextRequest, { params }: { params: { txId: string } }) =>
  handle(async () => {
    const ctx = await requireAuth(req);
    return json(await redoTx(params.txId, ctx));
  });
