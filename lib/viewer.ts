/**
 * CONTRACT (GH-8, owner: Beka). Who is looking: the role switcher instead of a login.
 * Server only (reads a cookie). Reading it makes the page render per request.
 */
import { cookies } from "next/headers";
import { DEMO_PROFILES } from "@/seed/fixtures";

/** Cookie set by the role switcher: "guest" (Nino) or "host" (Giorgi). */
export const ROLE_COOKIE = "gh_role";

export interface Viewer {
  role: "guest" | "host";
  profileId: string;
  name: string;
}

/** The current viewer. No cookie, or an unknown value, means the guest Nino. */
export async function getViewer(): Promise<Viewer> {
  const role = (await cookies()).get(ROLE_COOKIE)?.value === "host" ? "host" : "guest";
  const profile = role === "host" ? DEMO_PROFILES.giorgi : DEMO_PROFILES.nino;
  return { role, profileId: profile.id, name: profile.name };
}
