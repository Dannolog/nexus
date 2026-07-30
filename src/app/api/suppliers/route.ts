import { makeList, makeCreate } from "@/lib/crudRoute";
export const dynamic = "force-dynamic";
export const GET = makeList("Supplier");
export const POST = makeCreate("Supplier"); // number wird zentral in createEntity vergeben
