import { makeList, makeCreate } from "@/lib/crudRoute";
export const dynamic = "force-dynamic";
export const GET = makeList("Customer");
export const POST = makeCreate("Customer");
