import { makeGet, makePatch, makeDelete } from "@/lib/crudRoute";
export const dynamic = "force-dynamic";
export const GET = makeGet("Task");
export const PATCH = makePatch("Task");
export const DELETE = makeDelete("Task");
