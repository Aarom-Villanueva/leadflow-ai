import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { identityAuth } from "./auth";

export async function requireSession() {
  const session = await (await identityAuth()).api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  return session;
}
