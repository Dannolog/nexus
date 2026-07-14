import { makeGet, makePatch, makeDelete } from "@/lib/crudRoute";
export const dynamic = "force-dynamic";
export const GET = makeGet("EmploymentContract");
export const PATCH = makePatch("EmploymentContract");
export const DELETE = makeDelete("EmploymentContract");
