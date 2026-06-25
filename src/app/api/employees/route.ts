import { makeList, makeCreate } from "@/lib/crudRoute";
export const dynamic = "force-dynamic";
export const GET = makeList("Employee");
export const POST = makeCreate("Employee");
