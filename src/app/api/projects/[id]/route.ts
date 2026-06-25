import { makeGet, makePatch, makeDelete } from "@/lib/crudRoute";
export const dynamic = "force-dynamic";
export const GET = makeGet("Project");
export const PATCH = makePatch("Project");
export const DELETE = makeDelete("Project");
