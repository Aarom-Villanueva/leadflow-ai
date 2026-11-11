import { handleAuth } from "@/modules/identity/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = handleAuth;
