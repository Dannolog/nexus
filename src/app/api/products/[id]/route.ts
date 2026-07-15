import { makeGet, makePatch, makeDelete } from "@/lib/crudRoute";
export const dynamic = "force-dynamic";
export const GET = makeGet("Product");
export const PATCH = makePatch("Product");
export const DELETE = makeDelete("Product");
