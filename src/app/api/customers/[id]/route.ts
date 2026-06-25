import { makeGet, makePatch, makeDelete } from "@/lib/crudRoute";
export const dynamic = "force-dynamic";
export const GET = makeGet("Customer");
export const PATCH = makePatch("Customer");
export const DELETE = makeDelete("Customer");
