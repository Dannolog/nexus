import { makeGet, makePatch, makeDelete } from "@/lib/crudRoute";
export const dynamic = "force-dynamic";
export const GET = makeGet("Employee");
export const PATCH = makePatch("Employee");
export const DELETE = makeDelete("Employee");
