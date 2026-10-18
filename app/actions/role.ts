"use server";

import { cookies } from "next/headers";
import { ROLE_COOKIE } from "@/lib/viewer";

/**
 * The role switcher ("View as Guest / Host") instead of a login. Setting the cookie in a
 * server action re-renders the current page with the new viewer.
 */
export async function setRole(formData: FormData): Promise<void> {
  const role = formData.get("role") === "host" ? "host" : "guest";
  (await cookies()).set(ROLE_COOKIE, role, {
    path: "/",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
  });
}
