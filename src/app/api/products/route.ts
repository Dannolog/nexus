import { makeList, makeCreate } from "@/lib/crudRoute";
export const dynamic = "force-dynamic";
export const GET = makeList("Product");
export const POST = makeCreate("Product"); // number wird zentral in createEntity vergeben
