import { makeList, makeCreate } from "@/lib/crudRoute";
export const dynamic = "force-dynamic";
export const GET = makeList("Project");
export const POST = makeCreate("Project");
