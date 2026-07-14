import { makeList, makeCreate } from "@/lib/crudRoute";
export const dynamic = "force-dynamic";
export const GET = makeList("EmploymentContract");
export const POST = makeCreate("EmploymentContract");
