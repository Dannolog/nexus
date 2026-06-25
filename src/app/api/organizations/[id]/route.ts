import { makeGet, makePatch, makeDelete } from "@/lib/crudRoute";
export const dynamic = "force-dynamic";
export const GET = makeGet("Organization");
export const PATCH = makePatch("Organization");
export const DELETE = makeDelete("Organization");
