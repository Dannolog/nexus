import { makeList, makeCreate } from "@/lib/crudRoute";
export const dynamic = "force-dynamic";
export const GET = makeList("Organization");
export const POST = makeCreate("Organization");
