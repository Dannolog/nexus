import { NextResponse } from "next/server";

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export function error(message: string, status = 400, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

export class ApiError extends Error {
  status: number;
  extra?: Record<string, unknown>;
  constructor(message: string, status = 400, extra?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

/** Wrappt einen Handler: ApiError → sauberer JSON-Fehler, sonst 500. */
export function handle(fn: () => Promise<NextResponse>) {
  return fn().catch((e) => {
    if (e instanceof ApiError) return error(e.message, e.status, e.extra);
    console.error("[nexus] unhandled:", e);
    return error("Interner Fehler", 500);
  });
}
