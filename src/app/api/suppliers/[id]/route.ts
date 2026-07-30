import { makeGet, makePatch, makeDelete } from "@/lib/crudRoute";
export const dynamic = "force-dynamic";
export const GET = makeGet("Supplier");
export const PATCH = makePatch("Supplier");
export const DELETE = makeDelete("Supplier");
